import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { networkInterfaces } from 'os';
import * as devices from '../database/devices';
import * as metrics from '../database/metrics';
import * as settings from '../database/settings';
import * as auth from '../database/auth';
import * as poller from '../axeos-poller';

let httpServer: ReturnType<typeof createServer> | null = null;

// Auth middleware for web routes
function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const token = req.headers.authorization?.replace('Bearer ', '') || (req as any).cookies?.token;

  if (!token || !auth.validateSession(token)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  next();
}

export function startServer(): { port: number; addresses: string[] } {
  const port = settings.getServerPort();

  const app = express();
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json());

  // Parse cookies
  app.use((req, res, next) => {
    const cookies: Record<string, string> = {};
    req.headers.cookie?.split(';').forEach((c) => {
      const [key, val] = c.trim().split('=');
      if (key && val) cookies[key] = val;
    });
    (req as any).cookies = cookies;
    next();
  });

  // ============ PUBLIC ROUTES ============

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Check if setup is required
  app.get('/api/setup-required', (_req, res) => {
    res.json({ required: !auth.isPasswordSet() });
  });

  // Initial setup - set password
  app.post('/api/setup', async (req, res) => {
    if (auth.isPasswordSet()) {
      res.status(400).json({ error: 'Already configured' });
      return;
    }

    const { password } = req.body;
    if (!password || password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters' });
      return;
    }

    await auth.setPassword(password);
    const session = auth.createSession();

    res.json({
      success: true,
      token: session.token,
      expiresAt: session.expiresAt,
    });
  });

  // Login
  app.post('/api/login', async (req, res) => {
    const { password } = req.body;

    if (!password) {
      res.status(400).json({ error: 'Password required' });
      return;
    }

    const valid = await auth.verifyPassword(password);
    if (!valid) {
      res.status(401).json({ error: 'Invalid password' });
      return;
    }

    const session = auth.createSession();

    res.json({
      success: true,
      token: session.token,
      expiresAt: session.expiresAt,
    });
  });

  // ============ PROTECTED ROUTES ============

  // Logout
  app.post('/api/logout', requireAuth, (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '') || (req as any).cookies?.token;
    if (token) {
      auth.deleteSession(token);
    }
    res.json({ success: true });
  });

  // Get server status
  app.get('/api/status', requireAuth, (_req, res) => {
    res.json({
      port: settings.getServerPort(),
      addresses: getLocalAddresses(),
    });
  });

  // Get all devices with latest metrics
  app.get('/api/devices', requireAuth, (_req, res) => {
    const allDevices = devices.getAllDevices();
    res.json({
      devices: allDevices.map((d) => {
        const latestData = poller.getLatestMetrics(d.id);
        return {
          id: d.id,
          name: d.name,
          ipAddress: d.ip_address,
          isOnline: d.is_online === 1,
          lastSeen: d.last_seen,
          createdAt: d.created_at,
          latestMetrics: latestData?.data || null,
        };
      }),
    });
  });

  // Get device details
  app.get('/api/devices/:id', requireAuth, (req, res) => {
    const device = devices.getDeviceById(req.params.id);
    if (!device) {
      res.status(404).json({ error: 'Device not found' });
      return;
    }

    const latestData = poller.getLatestMetrics(device.id);

    res.json({
      id: device.id,
      name: device.name,
      ipAddress: device.ip_address,
      isOnline: device.is_online === 1,
      lastSeen: device.last_seen,
      createdAt: device.created_at,
      latestMetrics: latestData?.data || null,
    });
  });

  // Update device
  app.patch('/api/devices/:id', requireAuth, (req, res) => {
    const { name } = req.body;
    if (name) {
      devices.updateDeviceName(req.params.id, name);
    }
    res.json({ success: true });
  });

  // Delete device
  app.delete('/api/devices/:id', requireAuth, (req, res) => {
    poller.stopPolling(req.params.id);
    devices.deleteDevice(req.params.id);
    res.json({ success: true });
  });

  // Get device metrics
  app.get('/api/devices/:id/metrics', requireAuth, (req, res) => {
    const { startTime, endTime, limit } = req.query;

    const deviceMetrics = metrics.getMetrics(req.params.id, {
      startTime: startTime ? parseInt(startTime as string, 10) : undefined,
      endTime: endTime ? parseInt(endTime as string, 10) : undefined,
      limit: limit ? parseInt(limit as string, 10) : 100,
    });

    res.json({
      metrics: deviceMetrics.map((m) => ({
        timestamp: m.timestamp,
        hashrate: m.hashrate,
        temperature: m.temperature,
        power: m.power,
        data: m.data ? JSON.parse(m.data) : null,
      })),
    });
  });

  // Get latest metrics for device
  app.get('/api/devices/:id/metrics/latest', requireAuth, (req, res) => {
    const latestData = poller.getLatestMetrics(req.params.id);
    if (!latestData) {
      res.json({ metrics: null });
      return;
    }

    res.json({
      metrics: latestData.data,
      timestamp: latestData.timestamp,
    });
  });

  // ============ WEB DASHBOARD ============
  app.get('/', (_req, res) => {
    res.send(getWebDashboardHtml());
  });

  app.get('/dashboard', (_req, res) => {
    res.send(getWebDashboardHtml());
  });

  // Create HTTP server
  httpServer = createServer(app);

  httpServer.listen(port, '0.0.0.0', () => {
    console.log(`Server running on port ${port}`);
  });

  return {
    port,
    addresses: getLocalAddresses(),
  };
}

export function stopServer(): void {
  if (httpServer) {
    httpServer.close();
    httpServer = null;
  }
}

export function getServerStatus(): {
  running: boolean;
  port: number;
  addresses: string[];
  setupRequired: boolean;
} {
  return {
    running: httpServer !== null,
    port: settings.getServerPort(),
    addresses: getLocalAddresses(),
    setupRequired: !auth.isPasswordSet(),
  };
}

function getLocalAddresses(): string[] {
  const addresses: string[] = [];
  const interfaces = networkInterfaces();

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }

  return addresses;
}

// Web dashboard HTML
function getWebDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AxeOS Monitor</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f0f1a;
      color: #fff;
      min-height: 100vh;
    }
    .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
    .logo { font-size: 24px; font-weight: bold; color: #00d9ff; }
    .btn {
      padding: 10px 20px;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
    }
    .btn-primary { background: #00d9ff; color: #0f0f1a; }
    .btn-danger { background: #ff4757; color: #fff; }
    .card {
      background: #1a1a2e;
      border: 1px solid #3a3a5c;
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 16px;
    }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; }
    .stat-label { font-size: 12px; color: #a0a0b0; margin-bottom: 4px; }
    .stat-value { font-size: 24px; font-weight: bold; }
    .stat-value.accent { color: #00d9ff; }
    .stat-value.success { color: #00ff9d; }
    .stat-value.warning { color: #ffcc00; }
    .stat-value.danger { color: #ff4757; }
    .device-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    .device-name { font-size: 16px; font-weight: 600; }
    .device-ip { font-size: 12px; color: #a0a0b0; font-family: monospace; }
    .status-dot { width: 10px; height: 10px; border-radius: 50%; }
    .status-dot.online { background: #00ff9d; }
    .status-dot.offline { background: #a0a0b0; }
    .metrics-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    .metric { text-align: center; }
    .metric-label { font-size: 11px; color: #a0a0b0; }
    .metric-value { font-size: 14px; font-weight: 600; }
    .login-container { max-width: 400px; margin: 100px auto; }
    .input {
      width: 100%;
      padding: 12px 16px;
      border: 1px solid #3a3a5c;
      border-radius: 8px;
      background: #1a1a2e;
      color: #fff;
      font-size: 16px;
      margin-bottom: 16px;
    }
    .input:focus { outline: none; border-color: #00d9ff; }
    .error { color: #ff4757; margin-bottom: 16px; font-size: 14px; }
    .hidden { display: none; }
    .device-model { font-size: 11px; color: #a0a0b0; margin-top: 2px; }
    .secondary-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 12px; padding-top: 12px; border-top: 1px solid #3a3a5c; }
    .secondary-stat { text-align: center; }
    .secondary-stat-label { font-size: 10px; color: #a0a0b0; }
    .secondary-stat-value { font-size: 12px; font-weight: 500; }
  </style>
</head>
<body>
  <div id="login-view" class="container login-container">
    <div class="card">
      <h2 style="margin-bottom: 24px; text-align: center;">AxeOS Monitor</h2>
      <div id="setup-form" class="hidden">
        <p style="color: #a0a0b0; margin-bottom: 16px;">Create a password to secure remote access:</p>
        <input type="password" id="setup-password" class="input" placeholder="Create password (min 6 characters)">
        <input type="password" id="setup-confirm" class="input" placeholder="Confirm password">
        <div id="setup-error" class="error hidden"></div>
        <button onclick="doSetup()" class="btn btn-primary" style="width: 100%;">Set Password</button>
      </div>
      <div id="login-form" class="hidden">
        <input type="password" id="login-password" class="input" placeholder="Password">
        <div id="login-error" class="error hidden"></div>
        <button onclick="doLogin()" class="btn btn-primary" style="width: 100%;">Login</button>
      </div>
    </div>
  </div>

  <div id="dashboard-view" class="container hidden">
    <div class="header">
      <div class="logo">AxeOS Monitor</div>
      <button onclick="doLogout()" class="btn btn-danger">Logout</button>
    </div>

    <div class="grid" style="margin-bottom: 24px;">
      <div class="card">
        <div class="stat-label">Total Hashrate</div>
        <div id="total-hashrate" class="stat-value accent">--</div>
      </div>
      <div class="card">
        <div class="stat-label">Avg Temperature</div>
        <div id="avg-temp" class="stat-value">--</div>
      </div>
      <div class="card">
        <div class="stat-label">Total Power</div>
        <div id="total-power" class="stat-value">--</div>
      </div>
      <div class="card">
        <div class="stat-label">Efficiency</div>
        <div id="efficiency" class="stat-value">--</div>
      </div>
      <div class="card">
        <div class="stat-label">Shares Accepted</div>
        <div id="total-shares" class="stat-value success">--</div>
      </div>
    </div>

    <h3 style="margin-bottom: 16px;">Devices (<span id="device-count">0</span>)</h3>
    <div id="devices-list"></div>
  </div>

  <script>
    let token = localStorage.getItem('token');
    let devices = [];

    async function init() {
      const res = await fetch('/api/setup-required');
      const { required } = await res.json();

      if (required) {
        document.getElementById('setup-form').classList.remove('hidden');
      } else if (token) {
        await loadDashboard();
      } else {
        document.getElementById('login-form').classList.remove('hidden');
      }
    }

    async function doSetup() {
      const password = document.getElementById('setup-password').value;
      const confirm = document.getElementById('setup-confirm').value;
      const errorEl = document.getElementById('setup-error');

      if (password.length < 6) {
        errorEl.textContent = 'Password must be at least 6 characters';
        errorEl.classList.remove('hidden');
        return;
      }

      if (password !== confirm) {
        errorEl.textContent = 'Passwords do not match';
        errorEl.classList.remove('hidden');
        return;
      }

      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });

      const data = await res.json();
      if (data.error) {
        errorEl.textContent = data.error;
        errorEl.classList.remove('hidden');
        return;
      }

      token = data.token;
      localStorage.setItem('token', token);
      await loadDashboard();
    }

    async function doLogin() {
      const password = document.getElementById('login-password').value;
      const errorEl = document.getElementById('login-error');

      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });

      const data = await res.json();
      if (data.error) {
        errorEl.textContent = data.error;
        errorEl.classList.remove('hidden');
        return;
      }

      token = data.token;
      localStorage.setItem('token', token);
      await loadDashboard();
    }

    function doLogout() {
      fetch('/api/logout', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token }
      });
      localStorage.removeItem('token');
      location.reload();
    }

    async function loadDashboard() {
      document.getElementById('login-view').classList.add('hidden');
      document.getElementById('dashboard-view').classList.remove('hidden');

      await fetchDevices();
      setInterval(fetchDevices, 5000);
    }

    async function fetchDevices() {
      const res = await fetch('/api/devices', {
        headers: { 'Authorization': 'Bearer ' + token }
      });

      if (res.status === 401) {
        localStorage.removeItem('token');
        location.reload();
        return;
      }

      const data = await res.json();
      devices = data.devices;
      renderDevices();
    }

    function renderDevices() {
      const container = document.getElementById('devices-list');
      let totalHashrate = 0, totalPower = 0, tempSum = 0, onlineCount = 0, totalShares = 0;

      const onlineDevices = devices.filter(d => d.isOnline);
      const offlineDevices = devices.filter(d => !d.isOnline);

      onlineDevices.forEach(d => {
        const m = d.latestMetrics;
        if (m) {
          totalHashrate += m.hashRate || 0;
          totalPower += m.power || 0;
          if (m.temp) { tempSum += m.temp; onlineCount++; }
          totalShares += m.sharesAccepted || 0;
        }
      });

      container.innerHTML = [...onlineDevices, ...offlineDevices].map(d => {
        const m = d.latestMetrics;
        return '<div class="card">' +
          '<div class="device-header">' +
            '<div>' +
              '<div class="device-name">' + d.name + '</div>' +
              '<div class="device-ip">' + d.ipAddress + '</div>' +
              (m ? '<div class="device-model">' + (m.ASICModel || 'BitAxe') + '</div>' : '') +
            '</div>' +
            '<div class="status-dot ' + (d.isOnline ? 'online' : 'offline') + '"></div>' +
          '</div>' +
          (d.isOnline && m ?
            '<div class="metrics-grid">' +
              '<div class="metric"><div class="metric-label">Hashrate</div><div class="metric-value accent">' + formatHashrate(m.hashRate) + '</div></div>' +
              '<div class="metric"><div class="metric-label">Temp</div><div class="metric-value ' + getTempClass(m.temp) + '">' + formatTemp(m.temp) + '</div></div>' +
              '<div class="metric"><div class="metric-label">Power</div><div class="metric-value">' + formatPower(m.power) + '</div></div>' +
            '</div>' +
            '<div class="secondary-stats">' +
              '<div class="secondary-stat"><div class="secondary-stat-label">Efficiency</div><div class="secondary-stat-value">' + (m.efficiency ? m.efficiency.toFixed(1) + ' J/TH' : '--') + '</div></div>' +
              '<div class="secondary-stat"><div class="secondary-stat-label">Shares</div><div class="secondary-stat-value success">' + (m.sharesAccepted || 0).toLocaleString() + '</div></div>' +
              '<div class="secondary-stat"><div class="secondary-stat-label">Fan</div><div class="secondary-stat-value">' + (m.fanspeed ? m.fanspeed + '%' : '--') + '</div></div>' +
            '</div>'
          : '<div style="color:#a0a0b0; margin-top: 8px;">' + (d.isOnline ? 'Waiting for metrics...' : 'Offline') + '</div>') +
        '</div>';
      }).join('');

      document.getElementById('device-count').textContent = devices.length + ' online: ' + onlineDevices.length;
      document.getElementById('total-hashrate').textContent = formatHashrate(totalHashrate);
      document.getElementById('total-power').textContent = formatPower(totalPower);
      document.getElementById('total-shares').textContent = totalShares.toLocaleString();

      const avgTemp = onlineCount > 0 ? tempSum / onlineCount : 0;
      const avgTempEl = document.getElementById('avg-temp');
      avgTempEl.textContent = avgTemp > 0 ? formatTemp(avgTemp) : '--';
      avgTempEl.className = 'stat-value ' + getTempClass(avgTemp);

      const efficiency = totalHashrate > 0 ? (totalPower / (totalHashrate / 1000)).toFixed(1) + ' J/TH' : '--';
      document.getElementById('efficiency').textContent = efficiency;
    }

    function formatHashrate(h) {
      if (!h) return '--';
      if (h >= 1000) return (h / 1000).toFixed(2) + ' TH/s';
      return h.toFixed(2) + ' GH/s';
    }

    function formatTemp(t) { return t ? t.toFixed(1) + '°C' : '--'; }
    function formatPower(p) { return p ? p.toFixed(1) + ' W' : '--'; }
    function getTempClass(t) {
      if (!t) return '';
      if (t > 80) return 'danger';
      if (t > 70) return 'warning';
      return 'success';
    }

    init();
  </script>
</body>
</html>`;
}
