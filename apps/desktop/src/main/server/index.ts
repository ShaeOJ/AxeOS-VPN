import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { networkInterfaces } from 'os';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { app } from 'electron';
import * as devices from '../database/devices';
import * as metrics from '../database/metrics';
import * as settings from '../database/settings';
import * as auth from '../database/auth';
import * as poller from '../axeos-poller';
import * as bitcoin from '../bitcoin-price';
import * as profitability from '../profitability';
import * as deviceControl from '../device-control';

// Load logo as base64 for embedding in HTML
let logoBase64 = '';

// Function to find logo file (handles vite's hashed filenames like logo-COfIhftl.png)
function findLogoInDir(dir: string): string | null {
  try {
    const files = readdirSync(dir);
    const logoFile = files.find(f => f.startsWith('logo') && f.endsWith('.png'));
    if (logoFile) {
      return join(dir, logoFile);
    }
  } catch (e) {
    // Directory doesn't exist
  }
  return null;
}

// Get app path for packaged app
const appPath = app.isPackaged ? dirname(app.getPath('exe')) : process.cwd();
const resourcesPath = app.isPackaged ? join(appPath, 'resources') : '';

const possibleLogoDirs = [
  join(__dirname, '../renderer/assets'),  // Production build (dist/main -> dist/renderer/assets)
  join(__dirname, '../../renderer/assets'),  // Alternative production path
  resourcesPath ? join(resourcesPath, 'app.asar', 'dist', 'renderer', 'assets') : '',  // Inside asar
  join(__dirname, '../../../src/renderer/assets'),  // Dev mode from dist
  join(process.cwd(), 'src/renderer/assets'),  // Dev mode from project root
  join(process.cwd(), 'dist/renderer/assets'),  // Dev mode built assets
].filter(Boolean);

console.log('App packaged:', app.isPackaged);
console.log('Looking for logo in directories:', possibleLogoDirs);

for (const dir of possibleLogoDirs) {
  const logoPath = findLogoInDir(dir);
  if (logoPath) {
    try {
      const logoBuffer = readFileSync(logoPath);
      logoBase64 = `data:image/png;base64,${logoBuffer.toString('base64')}`;
      console.log('Logo loaded from:', logoPath);
      break;
    } catch (e) {
      // Try next directory
    }
  }
}

if (!logoBase64) {
  console.log('Logo not found in any path, using text fallback');
}

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
          deviceType: d.device_type || 'bitaxe',
          isOnline: d.is_online === 1,
          lastSeen: d.last_seen,
          createdAt: d.created_at,
          allTimeBestDiff: d.all_time_best_diff,
          allTimeBestDiffAt: d.all_time_best_diff_at,
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
      deviceType: device.device_type || 'bitaxe',
      isOnline: device.is_online === 1,
      lastSeen: device.last_seen,
      createdAt: device.created_at,
      latestMetrics: latestData?.data || null,
    });
  });

  // Delete device
  app.delete('/api/devices/:id', requireAuth, (req, res) => {
    poller.stopPolling(req.params.id);
    devices.deleteDevice(req.params.id);
    res.json({ success: true });
  });

  // Test device connection
  app.post('/api/devices/test', requireAuth, async (req, res) => {
    const { ipAddress } = req.body;
    if (!ipAddress) {
      res.status(400).json({ success: false, error: 'IP address is required' });
      return;
    }

    const result = await poller.testConnection(ipAddress);
    res.json(result);
  });

  // Add new device
  app.post('/api/devices', requireAuth, async (req, res) => {
    const { ipAddress, name } = req.body;
    if (!ipAddress) {
      res.status(400).json({ error: 'IP address is required' });
      return;
    }

    // Test connection first
    const testResult = await poller.testConnection(ipAddress);
    if (!testResult.success) {
      res.status(400).json({ error: testResult.error || 'Could not connect to device' });
      return;
    }

    // Create device
    const deviceName = name || testResult.data?.hostname || ipAddress;
    const newDevice = devices.createDevice(deviceName, ipAddress);

    if (newDevice) {
      poller.startPolling(newDevice);
      res.json({ success: true, device: newDevice });
    } else {
      res.status(500).json({ error: 'Failed to create device' });
    }
  });

  // Update device IP address
  app.patch('/api/devices/:id', requireAuth, (req, res) => {
    const { name, ipAddress } = req.body;
    const deviceId = req.params.id;

    if (name) {
      devices.updateDeviceName(deviceId, name);
    }
    if (ipAddress) {
      devices.updateDeviceIp(deviceId, ipAddress);
      const updated = devices.getDeviceById(deviceId);
      if (updated) {
        poller.stopPolling(deviceId);
        poller.startPolling(updated);
      }
    }
    res.json({ success: true });
  });

  // Restart device
  app.post('/api/devices/:id/restart', requireAuth, async (req, res) => {
    const device = devices.getDeviceById(req.params.id);
    if (!device) {
      res.status(404).json({ success: false, error: 'Device not found' });
      return;
    }

    const result = await deviceControl.restartDevice(device.ip_address);
    res.json(result);
  });

  // Set device fan speed
  app.post('/api/devices/:id/fan', requireAuth, async (req, res) => {
    const device = devices.getDeviceById(req.params.id);
    if (!device) {
      res.status(404).json({ success: false, error: 'Device not found' });
      return;
    }

    const { speed } = req.body;
    if (speed === undefined || speed < 0 || speed > 100) {
      res.status(400).json({ success: false, error: 'Invalid fan speed (0-100)' });
      return;
    }

    const result = await deviceControl.setFanSpeed(device.ip_address, speed);
    res.json(result);
  });

  // Set device frequency
  app.post('/api/devices/:id/frequency', requireAuth, async (req, res) => {
    const device = devices.getDeviceById(req.params.id);
    if (!device) {
      res.status(404).json({ success: false, error: 'Device not found' });
      return;
    }

    const { frequency } = req.body;
    if (frequency === undefined) {
      res.status(400).json({ success: false, error: 'Frequency is required' });
      return;
    }

    const result = await deviceControl.setFrequency(device.ip_address, frequency);
    res.json(result);
  });

  // Set device voltage
  app.post('/api/devices/:id/voltage', requireAuth, async (req, res) => {
    const device = devices.getDeviceById(req.params.id);
    if (!device) {
      res.status(404).json({ success: false, error: 'Device not found' });
      return;
    }

    const { voltage } = req.body;
    if (voltage === undefined) {
      res.status(400).json({ success: false, error: 'Voltage is required' });
      return;
    }

    const result = await deviceControl.setCoreVoltage(device.ip_address, voltage);
    res.json(result);
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

  // ============ CRYPTO PRICES (PUBLIC) ============
  // These endpoints are public as they're read-only price data

  app.get('/api/crypto/currencies', (_req, res) => {
    res.json({ currencies: bitcoin.getSupportedCurrencies() });
  });

  app.get('/api/crypto/coins', (_req, res) => {
    res.json({ coins: bitcoin.getSupportedCoins() });
  });

  app.get('/api/crypto/price/:coinId', async (req, res) => {
    const { coinId } = req.params;
    const currency = (req.query.currency as string) || 'usd';
    const price = await bitcoin.fetchCryptoPrice(coinId, currency);
    res.json({ price });
  });

  app.get('/api/crypto/history/:coinId', async (req, res) => {
    const { coinId } = req.params;
    const currency = (req.query.currency as string) || 'usd';
    const days = parseInt(req.query.days as string) || 7;
    const history = await bitcoin.fetchPriceHistory(coinId, currency, days);
    res.json({ history });
  });

  // ============ PROFITABILITY CALCULATOR (PUBLIC) ============
  app.get('/api/profitability/network-stats', async (_req, res) => {
    const stats = await profitability.fetchNetworkStats();
    res.json({ stats });
  });

  app.get('/api/profitability/electricity-cost', (_req, res) => {
    const cost = settings.getSetting('electricity_cost');
    res.json({ cost: cost ? parseFloat(cost) : 0.12 });
  });

  app.post('/api/profitability/electricity-cost', requireAuth, (req, res) => {
    const { cost } = req.body;
    if (typeof cost === 'number') {
      settings.setSetting('electricity_cost', cost.toString());
    }
    res.json({ success: true });
  });

  app.post('/api/profitability/calculate', async (req, res) => {
    const { hashrateGH, powerWatts, btcPriceUsd, electricityCost } = req.body;
    const result = await profitability.calculateProfitability(
      hashrateGH,
      powerWatts,
      btcPriceUsd,
      electricityCost
    );
    res.json({ result });
  });

  // ============ WEB DASHBOARD ============
  app.get('/', (_req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.send(getWebDashboardHtml());
  });

  app.get('/dashboard', (_req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
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

export function getServerPort(): number {
  return settings.getServerPort();
}

export { getLocalAddresses };

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

// Web dashboard HTML - Vault-Tec themed
function getWebDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AxeOS VPN Monitor</title>
  <link href="https://fonts.googleapis.com/css2?family=Share+Tech+Mono&display=swap" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Share Tech Mono', monospace;
      background: #0a1929;
      color: #E8F4E8;
      min-height: 100vh;
    }
    /* Network canvas background */
    #network-canvas {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: -1;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.5s ease;
    }
    body.animated-bg #network-canvas {
      opacity: 1;
    }
    /* Scanlines overlay - subtle CRT effect */
    body::before {
      content: '';
      position: fixed;
      top: 0; left: 0; width: 100%; height: 100%;
      pointer-events: none;
      z-index: 9999;
      background: repeating-linear-gradient(0deg, transparent 0px, transparent 2px, rgba(0, 255, 65, 0.02) 2px, rgba(0, 255, 65, 0.02) 4px);
      opacity: 0.8;
    }
    /* Custom scrollbar - Vault-Tec theme */
    ::-webkit-scrollbar { width: 10px; height: 10px; }
    ::-webkit-scrollbar-track { background: #0d2137; border-left: 1px solid #1a4a5c; }
    ::-webkit-scrollbar-thumb { background: linear-gradient(180deg, #FFB000, #CC8C00); border: 1px solid #FFB000; border-radius: 0; }
    ::-webkit-scrollbar-thumb:hover { background: linear-gradient(180deg, #FFC940, #FFB000); box-shadow: 0 0 10px #FFB000; }
    ::-webkit-scrollbar-corner { background: #0d2137; }
    /* Firefox scrollbar */
    * { scrollbar-width: thin; scrollbar-color: #FFB000 #0d2137; }
    /* Subtle fade-in animation */
    @keyframes fade-in {
      0% { opacity: 0; transform: translateY(10px); }
      100% { opacity: 1; transform: translateY(0); }
    }
    .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #1a4a5c; animation: fade-in 0.4s ease-out forwards; position: relative; z-index: 10000; }
    .login-container .card { animation: fade-in 0.5s ease-out forwards; }
    .logo { font-size: 24px; font-weight: bold; color: #FFB000; text-transform: uppercase; letter-spacing: 2px; }
    /* Navigation tabs */
    .nav-tabs { display: flex; gap: 4px; margin-left: 24px; }
    .nav-tab { padding: 8px 16px; background: transparent; border: 2px solid #1a4a5c; color: #8BA88B; cursor: pointer; font-family: 'Share Tech Mono', monospace; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; transition: all 0.2s; }
    .nav-tab:hover { border-color: #FFB000; color: #FFB000; }
    .nav-tab.active { background: rgba(255,176,0,0.15); border-color: #FFB000; color: #FFB000; }
    /* Charts section */
    .charts-section { display: none; }
    .charts-section.active { display: block; }
    .dashboard-section { display: block; }
    .dashboard-section.hidden { display: none; }
    .chart-container { background: var(--color-bg-secondary); border: 2px solid var(--color-border); padding: 20px; margin-bottom: 16px; }
    .chart-controls { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 16px; }
    .chart-control-group { display: flex; flex-direction: column; gap: 6px; }
    .chart-control-label { font-size: 11px; color: var(--color-text-secondary); text-transform: uppercase; }
    .chart-btn-group { display: flex; gap: 4px; flex-wrap: wrap; }
    .chart-btn { padding: 6px 12px; background: transparent; border: 1px solid var(--color-border); color: var(--color-text-secondary); cursor: pointer; font-family: 'Share Tech Mono', monospace; font-size: 11px; transition: all 0.2s; }
    .chart-btn:hover { border-color: var(--color-accent); color: var(--color-accent); }
    .chart-btn.active { background: color-mix(in srgb, var(--color-accent) 15%, transparent); border-color: var(--color-accent); color: var(--color-accent); }
    .device-selector { display: flex; flex-wrap: wrap; gap: 8px; padding: 12px; background: rgba(0,0,0,0.2); border: 1px solid var(--color-border); margin-bottom: 16px; }
    .device-chip { padding: 6px 12px; background: transparent; border: 1px solid var(--color-border); color: var(--color-text-secondary); cursor: pointer; font-family: 'Share Tech Mono', monospace; font-size: 11px; display: flex; align-items: center; gap: 6px; transition: all 0.2s; }
    .device-chip:hover { border-color: var(--color-accent); }
    .device-chip.selected { border-width: 2px; }
    .device-chip .status-dot { width: 6px; height: 6px; border-radius: 50%; }
    .chart-wrapper { height: 350px; position: relative; }
    .chart-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-top: 16px; }
    .chart-stat-card { background: rgba(0,0,0,0.2); border: 1px solid var(--color-border); padding: 12px; }
    .chart-stat-device { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
    .chart-stat-color { width: 12px; height: 12px; border-radius: 2px; }
    .chart-stat-name { color: var(--color-text-primary); font-size: 12px; }
    .chart-stat-values { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; font-size: 11px; }
    .chart-stat-item { text-align: center; }
    .chart-stat-label { color: var(--color-text-secondary); margin-bottom: 2px; }
    .chart-stat-value { color: var(--color-accent); font-family: monospace; }
    .btn {
      padding: 10px 20px;
      border: 2px solid;
      cursor: pointer;
      font-size: 14px;
      font-weight: bold;
      font-family: 'Share Tech Mono', monospace;
      text-transform: uppercase;
      letter-spacing: 1px;
      transition: all 0.2s;
    }
    .btn-primary { background: linear-gradient(180deg, #FFB000, #CC8C00); color: #0a1929; border-color: #FFB000; }
    .btn-primary:hover { box-shadow: 0 0 20px rgba(255,176,0,0.5); }
    .btn-secondary { background: transparent; color: #8BA88B; border-color: #1a4a5c; }
    .btn-secondary:hover { border-color: #FFB000; color: #FFB000; }
    .btn-danger { background: transparent; color: #FF3131; border-color: #FF3131; }
    .btn-danger:hover { background: #FF3131; color: #0a1929; }
    .card {
      background: #0d2137;
      border: 2px solid #1a4a5c;
      padding: 20px;
      margin-bottom: 16px;
      position: relative;
    }
    .card::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 3px;
      background: linear-gradient(90deg, transparent, #FFB000, transparent);
      opacity: 0.5;
    }
    .card.clickable { cursor: pointer; transition: all 0.2s; }
    .card.clickable:hover { border-color: #FFB000; box-shadow: 0 0 15px rgba(255,176,0,0.2); }
    .summary-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 16px; margin-bottom: 24px; }
    .summary-card {
      background: #0d2137;
      border: 2px solid #1a4a5c;
      border-radius: 12px;
      padding: 20px;
      position: relative;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3), inset 0 0 30px rgba(0,0,0,0.2);
    }
    .summary-card::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 3px;
      border-radius: 12px 12px 0 0;
      background: linear-gradient(90deg, transparent, #FFB000, transparent);
      opacity: 0.6;
    }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; }
    .stat-label { font-size: 12px; color: #8BA88B; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 1px; }
    .stat-value { font-size: 32px; font-weight: bold; line-height: 1.1; }
    .accent { color: #FFB000; }
    .success { color: #00FF41; text-shadow: 0 0 3px rgba(0,255,65,0.25); }
    .warning { color: #FF8C00; }
    .danger { color: #FF3131; }
    .device-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    .device-name { font-size: 16px; font-weight: 600; color: #FFB000; }
    .device-ip { font-size: 12px; color: #8BA88B; }
    .status-dot { width: 12px; height: 12px; border-radius: 50%; }
    .status-dot.online { background: #00FF41; box-shadow: 0 0 10px #00FF41; animation: pulse 2s infinite; }
    .status-dot.offline { background: #8BA88B; }
    @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
    .metrics-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    .metric { text-align: center; }
    .metric-label { font-size: 10px; color: #8BA88B; text-transform: uppercase; display: flex; align-items: center; justify-content: center; gap: 4px; }
    .metric-value { font-size: 16px; font-weight: 600; }
    .login-container { max-width: 400px; margin: 100px auto; }
    .input {
      width: 100%;
      padding: 12px 16px;
      border: 2px solid #1a4a5c;
      background: #0a1929;
      color: #E8F4E8;
      font-size: 16px;
      font-family: 'Share Tech Mono', monospace;
      margin-bottom: 16px;
    }
    .input:focus { outline: none; border-color: #FFB000; box-shadow: 0 0 10px rgba(255,176,0,0.3); }
    .error { color: #FF3131; margin-bottom: 16px; font-size: 14px; }
    .hidden { display: none !important; }
    .device-model { font-size: 11px; color: #00CED1; margin-top: 2px; }
    .secondary-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 12px; padding-top: 12px; border-top: 1px solid #1a4a5c; }
    .secondary-stat { text-align: center; }
    .secondary-stat-label { font-size: 10px; color: #8BA88B; text-transform: uppercase; display: flex; align-items: center; justify-content: center; gap: 4px; }
    .secondary-stat-value { font-size: 13px; font-weight: 600; }
    /* Device control bar */
    .device-control-bar { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; padding-top: 8px; border-top: 1px solid #1a4a5c; }
    .restart-btn { display: flex; align-items: center; gap: 4px; padding: 8px 12px; font-size: 12px; background: #1a3a4a; color: #8BA88B; border: 1px solid #2a5a6a; border-radius: 4px; cursor: pointer; transition: all 0.2s; min-height: 44px; }
    .restart-btn:hover, .restart-btn:active { color: #FFB000; background: rgba(255,176,0,0.1); border-color: rgba(255,176,0,0.4); }
    .restart-btn.confirm { background: #FF3131; color: white; border-color: #FF3131; }
    .restart-btn.restarting { opacity: 0.6; cursor: not-allowed; }
    .restart-btn svg { flex-shrink: 0; }
    .restart-btn.restarting svg { animation: spin 1s linear infinite; }
    @keyframes spin { 100% { transform: rotate(360deg); } }
    /* Touch-friendly styles */
    input[type="range"] { -webkit-appearance: none; appearance: none; height: 8px; background: #1a4a5c; border-radius: 4px; outline: none; }
    input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 24px; height: 24px; background: #FFB000; border-radius: 50%; cursor: pointer; border: 2px solid #0d2137; }
    input[type="range"]::-moz-range-thumb { width: 24px; height: 24px; background: #FFB000; border-radius: 50%; cursor: pointer; border: 2px solid #0d2137; }
    .control-btn { min-height: 44px; min-width: 44px; padding: 10px 16px; font-size: 14px; touch-action: manipulation; }
    /* Modal animations */
    @keyframes modal-fade-in {
      0% { opacity: 0; transform: scale(0.95) translateY(-10px); }
      100% { opacity: 1; transform: scale(1) translateY(0); }
    }
    @keyframes modal-fade-out {
      0% { opacity: 1; transform: scale(1); }
      100% { opacity: 0; transform: scale(0.95) translateY(-10px); }
    }
    @keyframes overlay-fade-in {
      0% { opacity: 0; backdrop-filter: blur(0px); }
      100% { opacity: 1; backdrop-filter: blur(2px); }
    }
    @keyframes overlay-fade-out {
      0% { opacity: 1; }
      100% { opacity: 0; }
    }
    @keyframes border-glow {
      0%, 100% { box-shadow: 0 0 10px rgba(255,176,0,0.3), inset 0 0 10px rgba(255,176,0,0.1); }
      50% { box-shadow: 0 0 20px rgba(255,176,0,0.5), inset 0 0 15px rgba(255,176,0,0.2); }
    }
    .modal-overlay {
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.85);
      z-index: 10005;
      display: flex;
      align-items: center;
      justify-content: center;
      animation: overlay-fade-in 0.3s ease-out forwards;
      backdrop-filter: blur(2px);
    }
    .modal-overlay.closing { animation: overlay-fade-out 0.25s ease-in forwards; }
    .modal {
      background: #0d2137;
      border: 2px solid #FFB000;
      max-width: 600px;
      width: 90%;
      max-height: 90vh;
      overflow-y: auto;
      position: relative;
      animation: modal-fade-in 0.3s ease-out forwards, border-glow 3s ease-in-out infinite 0.3s;
    }
    .modal-overlay.closing .modal { animation: modal-fade-out 0.2s ease-in forwards; }
    .modal::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 4px; background: linear-gradient(90deg, #FFB000, #00FF41, #FFB000); }
    .modal::after {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0; bottom: 0;
      pointer-events: none;
      background: repeating-linear-gradient(0deg, transparent 0px, transparent 2px, rgba(0, 255, 65, 0.02) 2px, rgba(0, 255, 65, 0.02) 4px);
    }
    .modal-header { padding: 20px; border-bottom: 2px solid #1a4a5c; display: flex; justify-content: space-between; align-items: center; }
    .modal-title { font-size: 20px; color: #FFB000; text-transform: uppercase; letter-spacing: 2px; text-shadow: 0 0 4px rgba(255,176,0,0.3); }
    .modal-body { padding: 20px; }
    .detail-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
    .detail-item { padding: 12px; background: #0a1929; border: 1px solid #1a4a5c; }
    .detail-label { font-size: 10px; color: #8BA88B; text-transform: uppercase; margin-bottom: 4px; }
    .detail-value { font-size: 18px; font-weight: bold; }
    .section-title { font-size: 14px; color: #FFB000; text-transform: uppercase; letter-spacing: 1px; margin: 20px 0 12px; padding-bottom: 8px; border-bottom: 1px solid #1a4a5c; }

    /* Mobile Responsive Styles */
    @media (max-width: 768px) {
      .container { padding: 12px; }
      .header { flex-direction: column; gap: 12px; text-align: center; }
      .header img { height: 50px; }
      .summary-grid { grid-template-columns: repeat(2, 1fr); gap: 12px; }
      .summary-card { padding: 16px; border-radius: 10px; }
      .grid { grid-template-columns: repeat(2, 1fr); gap: 10px; }
      .card { padding: 16px; }
      .stat-value { font-size: 26px; }
      .stat-label { font-size: 11px; }
      .metrics-grid { grid-template-columns: repeat(3, 1fr); gap: 8px; }
      .metric-value { font-size: 12px; }
      .secondary-stats { grid-template-columns: repeat(3, 1fr); gap: 6px; }
      .secondary-stat-value { font-size: 12px; }
      .secondary-stat-label { font-size: 9px; }
      .device-name { font-size: 14px; }
      .login-container { margin: 40px auto; padding: 0 12px; }
      .modal { width: 95%; max-height: 85vh; }
      .modal-header { padding: 14px; }
      .modal-title { font-size: 16px; }
      .modal-body { padding: 14px; }
      .detail-grid { grid-template-columns: 1fr 1fr; gap: 10px; }
      .detail-item { padding: 10px; }
      .detail-value { font-size: 14px; }
      .detail-label { font-size: 9px; }
      .btn { padding: 12px 16px; font-size: 14px; min-height: 44px; }
      .restart-btn { padding: 10px 14px; min-height: 44px; }
      input[type="range"] { height: 12px; }
      input[type="range"]::-webkit-slider-thumb { width: 32px; height: 32px; }
      input[type="range"]::-moz-range-thumb { width: 32px; height: 32px; }
    }

    @media (max-width: 480px) {
      .container { padding: 8px; }
      .summary-grid { grid-template-columns: repeat(2, 1fr); gap: 8px; }
      .summary-card { padding: 14px; }
      .summary-card .stat-value { font-size: 20px; }
      .grid { grid-template-columns: 1fr; gap: 8px; }
      .card { padding: 14px; margin-bottom: 10px; }
      .stat-value { font-size: 22px; }
      .metrics-grid { grid-template-columns: repeat(3, 1fr); gap: 6px; }
      .metric-label { font-size: 9px; }
      .metric-value { font-size: 11px; }
      .secondary-stats { grid-template-columns: repeat(3, 1fr); gap: 4px; }
      .secondary-stat-label { font-size: 9px; }
      .secondary-stat-value { font-size: 11px; }
      .device-header { flex-direction: row; align-items: flex-start; }
      .device-name { font-size: 13px; }
      .device-ip { font-size: 11px; }
      .device-model { font-size: 10px; }
      .detail-grid { grid-template-columns: 1fr; gap: 8px; }
      .detail-item[style*="span 2"] { grid-column: span 1 !important; }
      .modal-header { flex-direction: column; gap: 10px; align-items: stretch; }
      .modal-title { text-align: center; }
      .modal-header .btn { width: 100%; min-height: 48px; }
      .input { padding: 12px 14px; font-size: 16px; min-height: 48px; }
      .restart-btn { width: 100%; justify-content: center; min-height: 48px; font-size: 14px; }
      .device-control-bar { flex-direction: column; }
    }

    /* Crypto Ticker Styles */
    .crypto-ticker {
      background: #0d2137;
      border: 2px solid #1a4a5c;
      padding: 12px 16px;
      margin-bottom: 24px;
      position: relative;
    }
    .crypto-ticker::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 3px;
      background: linear-gradient(90deg, transparent, #FFB000, transparent);
      opacity: 0.5;
    }
    .ticker-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
    }
    .ticker-selector {
      font-size: 12px;
      text-transform: uppercase;
      color: #8BA88B;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 4px 8px;
      border: 1px solid transparent;
      background: transparent;
      font-family: 'Share Tech Mono', monospace;
      transition: all 0.2s;
    }
    .ticker-selector:hover {
      color: #FFB000;
      border-color: #FFB000;
    }
    .ticker-dropdown {
      position: absolute;
      top: 100%;
      left: 0;
      background: #0d2137;
      border: 2px solid #1a4a5c;
      z-index: 100;
      min-width: 100px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.5);
    }
    .ticker-dropdown button {
      display: block;
      width: 100%;
      padding: 8px 12px;
      text-align: left;
      background: transparent;
      border: none;
      color: #8BA88B;
      font-family: 'Share Tech Mono', monospace;
      font-size: 11px;
      cursor: pointer;
    }
    .ticker-dropdown button:hover {
      background: rgba(255,176,0,0.1);
      color: #FFB000;
    }
    .ticker-dropdown button.active {
      background: rgba(255,176,0,0.2);
      color: #FFB000;
    }
    .ticker-price {
      font-size: 24px;
      font-weight: bold;
      color: #FFB000;
      text-shadow: 0 0 10px rgba(255,176,0,0.3);
      font-family: 'Share Tech Mono', monospace;
    }
    .ticker-change {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-top: 4px;
      font-size: 14px;
      font-family: 'Share Tech Mono', monospace;
    }
    .ticker-change.positive { color: #00FF41; }
    .ticker-change.negative { color: #FF3131; }
    .ticker-sparkline {
      height: 32px;
      margin-top: 8px;
      position: relative;
    }
    .ticker-sparkline canvas {
      width: 100%;
      height: 100%;
    }
    @media (max-width: 768px) {
      .crypto-ticker { padding: 10px 12px; margin-bottom: 16px; }
      .ticker-header { flex-wrap: wrap; gap: 6px; }
      .ticker-selector { padding: 6px 10px; font-size: 11px; }
      .ticker-price { font-size: 20px; }
      .ticker-change { font-size: 12px; }
      .ticker-sparkline { height: 24px; }
      .ticker-dropdown {
        position: fixed;
        top: auto !important;
        left: 12px !important;
        right: 12px !important;
        bottom: calc(20px + env(safe-area-inset-bottom, 0px));
        width: auto;
        max-height: 50vh;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
        border-radius: 12px;
        z-index: 10003;
      }
      .ticker-dropdown button { padding: 14px 16px; font-size: 14px; min-height: 48px; }
    }
    @media (max-width: 480px) {
      .crypto-ticker { padding: 8px 10px; margin-bottom: 12px; }
      .ticker-header { gap: 4px; }
      .ticker-selector { padding: 4px 8px; font-size: 10px; }
      .ticker-price { font-size: 18px; }
      .ticker-change { font-size: 11px; gap: 4px; }
      .ticker-sparkline { height: 20px; margin-top: 6px; }
    }

    /* Profitability Calculator Styles */
    .profitability-widget {
      background: #0d2137;
      border: 2px solid #1a4a5c;
      padding: 12px 16px;
      margin-bottom: 24px;
      position: relative;
    }
    .profitability-widget::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 3px;
      background: linear-gradient(90deg, transparent, #00FF41, transparent);
      opacity: 0.5;
    }
    .profit-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      cursor: pointer;
      margin-bottom: 8px;
    }
    .profit-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      text-transform: uppercase;
      color: #8BA88B;
    }
    .profit-toggle {
      background: none;
      border: none;
      color: #8BA88B;
      cursor: pointer;
      padding: 4px;
      transition: transform 0.2s;
    }
    .profit-toggle.expanded { transform: rotate(180deg); }
    .profit-summary {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 4px;
    }
    .profit-label { font-size: 11px; color: #8BA88B; }
    .profit-value { font-size: 14px; font-family: 'Share Tech Mono', monospace; }
    .profit-value.sats { color: #FFB000; text-shadow: 0 0 4px rgba(255,176,0,0.3); }
    .profit-value.positive { color: #00FF41; }
    .profit-value.negative { color: #FF3131; }
    .profit-details {
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid #1a4a5c;
      display: none;
    }
    .profit-details.show { display: block; }
    .profit-section { margin-bottom: 12px; }
    .profit-section-title {
      font-size: 10px;
      text-transform: uppercase;
      color: #8BA88B;
      margin-bottom: 6px;
    }
    .profit-row {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      margin-bottom: 2px;
    }
    .profit-input-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 8px;
    }
    .profit-input {
      width: 80px;
      padding: 6px 8px;
      background: #0a1929;
      border: 1px solid #1a4a5c;
      color: #8BA88B;
      font-family: 'Share Tech Mono', monospace;
      font-size: 12px;
    }
    .profit-input:focus {
      outline: none;
      border-color: #FFB000;
    }
    @media (max-width: 768px) {
      .profitability-widget { padding: 10px 12px; }
      .profit-value { font-size: 13px; }
    }

    /* ======== THEME SYSTEM ======== */
    :root, body.theme-vault-tec {
      --color-bg-primary: #0a1929;
      --color-bg-secondary: #0d2137;
      --color-accent: #FFB000;
      --color-accent-hover: #FFC940;
      --color-success: #00FF41;
      --color-warning: #FF8C00;
      --color-danger: #FF3131;
      --color-text-primary: #E8F4E8;
      --color-text-secondary: #8BA88B;
      --color-border: #1a4a5c;
      --color-scanline: rgba(0, 255, 65, 0.02);
    }
    body.theme-nuka-cola {
      --color-bg-primary: #1a0a0a;
      --color-bg-secondary: #2a1515;
      --color-accent: #FF3131;
      --color-accent-hover: #FF5555;
      --color-success: #FF6B6B;
      --color-warning: #FFA500;
      --color-danger: #FF0000;
      --color-text-primary: #FFE8E8;
      --color-text-secondary: #CC9999;
      --color-border: #5c1a1a;
      --color-scanline: rgba(255, 49, 49, 0.02);
    }
    body.theme-brotherhood {
      --color-bg-primary: #0a0a1a;
      --color-bg-secondary: #12122a;
      --color-accent: #4A90D9;
      --color-accent-hover: #6AAAF9;
      --color-success: #87CEEB;
      --color-warning: #FFD700;
      --color-danger: #FF4444;
      --color-text-primary: #E8E8FF;
      --color-text-secondary: #9999CC;
      --color-border: #2a2a5c;
      --color-scanline: rgba(74, 144, 217, 0.02);
    }
    body.theme-institute {
      --color-bg-primary: #f0f0f0;
      --color-bg-secondary: #e0e0e0;
      --color-accent: #00A0A0;
      --color-accent-hover: #00C0C0;
      --color-success: #00CED1;
      --color-warning: #FF8C00;
      --color-danger: #DC143C;
      --color-text-primary: #1a1a1a;
      --color-text-secondary: #555555;
      --color-border: #b0b0b0;
      --color-scanline: rgba(0, 160, 160, 0.02);
    }
    body.theme-ncr {
      --color-bg-primary: #1a1408;
      --color-bg-secondary: #2a2010;
      --color-accent: #C4A35A;
      --color-accent-hover: #D4B36A;
      --color-success: #8B7355;
      --color-warning: #DAA520;
      --color-danger: #CD5C5C;
      --color-text-primary: #F5DEB3;
      --color-text-secondary: #C4A060;
      --color-border: #5c4a2a;
      --color-scanline: rgba(196, 163, 90, 0.02);
    }
    body.theme-enclave {
      --color-bg-primary: #0a0a14;
      --color-bg-secondary: #141420;
      --color-accent: #B22222;
      --color-accent-hover: #D22222;
      --color-success: #FFD700;
      --color-warning: #FF6347;
      --color-danger: #FF0000;
      --color-text-primary: #F0F0F5;
      --color-text-secondary: #9090A0;
      --color-border: #3a3a5c;
      --color-scanline: rgba(178, 34, 34, 0.02);
    }

    /* Apply CSS variables to elements */
    body { background: var(--color-bg-primary); color: var(--color-text-primary); }
    body::before { background: repeating-linear-gradient(0deg, transparent 0px, transparent 2px, var(--color-scanline) 2px, var(--color-scanline) 4px); }
    .card { background: var(--color-bg-secondary); border-color: var(--color-border); }
    .card::before { background: linear-gradient(90deg, transparent, var(--color-accent), transparent); }
    .summary-card { background: var(--color-bg-secondary); border-color: var(--color-border); }
    .summary-card::before { background: linear-gradient(90deg, transparent, var(--color-accent), transparent); }
    .btn-primary { background: linear-gradient(180deg, var(--color-accent), var(--color-accent-hover)); color: var(--color-bg-primary); border-color: var(--color-accent); }
    .btn-primary:hover { box-shadow: 0 0 20px color-mix(in srgb, var(--color-accent) 50%, transparent); }
    .btn-secondary { color: var(--color-text-secondary); border-color: var(--color-border); }
    .btn-secondary:hover { border-color: var(--color-accent); color: var(--color-accent); }
    .accent { color: var(--color-accent); }
    .success { color: var(--color-success); }
    .warning { color: var(--color-warning); }
    .danger { color: var(--color-danger); }
    .logo, .device-name, .modal-title { color: var(--color-accent); }
    .stat-label, .device-ip, .secondary-stat-label, .detail-label, .metric-label { color: var(--color-text-secondary); }
    .status-dot.online { background: var(--color-success); box-shadow: 0 0 10px var(--color-success); }
    .input { border-color: var(--color-border); background: var(--color-bg-primary); color: var(--color-text-primary); }
    .input:focus { border-color: var(--color-accent); box-shadow: 0 0 10px color-mix(in srgb, var(--color-accent) 30%, transparent); }
    .header { border-bottom-color: var(--color-border); }
    .secondary-stats, .device-control-bar { border-top-color: var(--color-border); }
    .modal { border-color: var(--color-accent); }
    .modal::before { background: linear-gradient(90deg, var(--color-accent), var(--color-success), var(--color-accent)); }
    .modal-header { border-bottom-color: var(--color-border); }
    .detail-item { background: var(--color-bg-primary); border-color: var(--color-border); }
    .section-title { color: var(--color-accent); border-bottom-color: var(--color-border); }
    .crypto-ticker { background: var(--color-bg-secondary); border-color: var(--color-border); }
    .crypto-ticker::before { background: linear-gradient(90deg, transparent, var(--color-accent), transparent); }
    .profitability-widget { background: var(--color-bg-secondary); border-color: var(--color-border); }
    ::-webkit-scrollbar-track { background: var(--color-bg-secondary); border-left-color: var(--color-border); }
    ::-webkit-scrollbar-thumb { background: linear-gradient(180deg, var(--color-accent), var(--color-accent-hover)); border-color: var(--color-accent); }
    * { scrollbar-color: var(--color-accent) var(--color-bg-secondary); }

    /* Theme selector dropdown */
    .theme-selector { position: relative; z-index: 10001; }
    .theme-btn { display: flex; align-items: center; gap: 6px; padding: 8px 12px; min-height: 44px; }
    .theme-dropdown {
      position: absolute;
      top: 100%;
      right: 0;
      margin-top: 4px;
      background: var(--color-bg-secondary);
      border: 2px solid var(--color-accent);
      min-width: 200px;
      z-index: 10002;
      opacity: 0;
      visibility: hidden;
      transform: translateY(-10px);
      transition: all 0.2s ease;
      box-shadow: 0 4px 20px rgba(0,0,0,0.5);
    }
    .theme-dropdown.show { opacity: 1; visibility: visible; transform: translateY(0); }
    .theme-option {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 16px;
      cursor: pointer;
      transition: background 0.2s;
      border: none;
      background: transparent;
      width: 100%;
      text-align: left;
      font-family: 'Share Tech Mono', monospace;
      font-size: 14px;
      color: var(--color-text-primary);
      min-height: 48px;
      touch-action: manipulation;
      -webkit-tap-highlight-color: transparent;
    }
    .theme-option:hover, .theme-option:active { background: var(--color-bg-primary); }
    .theme-option.active { background: var(--color-bg-primary); color: var(--color-accent); border-left: 3px solid var(--color-accent); }
    .theme-swatch {
      width: 28px;
      height: 28px;
      border-radius: 4px;
      border: 2px solid rgba(255,255,255,0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .theme-swatch-inner { width: 12px; height: 12px; border-radius: 2px; }
    .theme-dropdown-header {
      display: none;
      justify-content: space-between;
      align-items: center;
      padding: 16px 20px;
      border-bottom: 2px solid var(--color-border);
      font-size: 16px;
      font-weight: bold;
      color: var(--color-accent);
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .theme-close-btn {
      background: transparent;
      border: none;
      color: var(--color-text-secondary);
      font-size: 28px;
      cursor: pointer;
      padding: 0 8px;
      line-height: 1;
      min-width: 44px;
      min-height: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .theme-close-btn:hover, .theme-close-btn:active { color: var(--color-accent); }
    /* Mobile theme dropdown */
    @media (max-width: 768px) {
      .theme-dropdown {
        position: fixed;
        top: auto;
        bottom: 0;
        left: 0;
        right: 0;
        min-width: 100%;
        max-height: 60vh;
        border-radius: 16px 16px 0 0;
        border-bottom: none;
        padding-bottom: env(safe-area-inset-bottom, 20px);
        transform: translateY(100%);
        display: flex;
        flex-direction: column;
        box-shadow: 0 -4px 30px rgba(0,0,0,0.6);
      }
      .theme-dropdown.show { transform: translateY(0); }
      .theme-dropdown-header { display: flex; flex-shrink: 0; }
      .theme-options-list {
        overflow-y: auto;
        flex: 1;
        -webkit-overflow-scrolling: touch;
        max-height: none;
        overscroll-behavior: contain;
      }
      .theme-option {
        padding: 16px 20px;
        font-size: 15px;
        min-height: 52px;
        border-bottom: 1px solid var(--color-border);
      }
      .theme-option:last-child { border-bottom: none; margin-bottom: 10px; }
      .theme-swatch { width: 28px; height: 28px; }
      .theme-swatch-inner { width: 12px; height: 12px; }
    }
    /* Extra small screens - ensure all 6 themes fit */
    @media (max-width: 480px) {
      .theme-dropdown {
        max-height: 70vh;
      }
      .theme-dropdown-header {
        padding: 12px 16px;
        font-size: 14px;
      }
      .theme-option {
        padding: 14px 16px;
        font-size: 14px;
        min-height: 48px;
      }
      .theme-swatch { width: 24px; height: 24px; }
      .theme-swatch-inner { width: 10px; height: 10px; }
    }
  </style>
</head>
<body>
  <canvas id="network-canvas"></canvas>
  <div id="login-view" class="container login-container">
    <div class="card">
      ${logoBase64 ? `<img src="${logoBase64}" alt="AxeOS VPN" style="max-width: 200px; height: auto; display: block; margin: 0 auto 24px; filter: drop-shadow(0 0 10px color-mix(in srgb, var(--color-accent) 40%, transparent));">` : `<h2 style="margin-bottom: 24px; text-align: center; color: var(--color-accent); text-transform: uppercase; letter-spacing: 2px;">AxeOS VPN</h2>`}
      <div id="setup-form" class="hidden">
        <p style="color: var(--color-text-secondary); margin-bottom: 16px; text-align: center;">Create a password to secure remote access:</p>
        <input type="password" id="setup-password" class="input" placeholder="Create password (min 6 characters)">
        <input type="password" id="setup-confirm" class="input" placeholder="Confirm password">
        <div id="setup-error" class="error hidden"></div>
        <button onclick="doSetup()" class="btn btn-primary" style="width: 100%;">Initialize</button>
      </div>
      <div id="login-form" class="hidden">
        <input type="password" id="login-password" class="input" placeholder="Enter Password">
        <div id="login-error" class="error hidden"></div>
        <button onclick="doLogin()" class="btn btn-primary" style="width: 100%;">Access Terminal</button>
      </div>
    </div>
  </div>

  <div id="dashboard-view" class="container hidden">
    <div class="header">
      <div style="display: flex; align-items: center;">
        ${logoBase64 ? `<img src="${logoBase64}" alt="AxeOS VPN" style="height: 60px; width: auto; filter: drop-shadow(0 0 10px color-mix(in srgb, var(--color-accent) 40%, transparent));">` : `<div class="logo">AxeOS VPN Monitor</div>`}
        <div class="nav-tabs">
          <button class="nav-tab active" onclick="showPage('dashboard')" id="nav-dashboard">Dashboard</button>
          <button class="nav-tab" onclick="showPage('charts')" id="nav-charts">Charts</button>
        </div>
      </div>
      <div style="display: flex; gap: 10px; align-items: center;">
        <button id="bg-toggle" onclick="toggleBackground()" class="btn btn-secondary" title="Toggle animated background" style="padding: 8px 12px; display: flex; align-items: center; gap: 6px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
          </svg>
          <span id="bg-toggle-text">FX</span>
        </button>
        <div class="theme-selector">
          <button onclick="toggleThemeDropdown()" class="btn btn-secondary theme-btn" title="Change theme">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 0 20V2z" fill="currentColor"/>
            </svg>
            <span>Theme</span>
          </button>
          <div id="theme-dropdown" class="theme-dropdown">
            <div class="theme-dropdown-header">
              <span>Select Theme</span>
              <button onclick="closeThemeDropdown()" class="theme-close-btn">&times;</button>
            </div>
            <div class="theme-options-list">
              <button class="theme-option" onclick="setTheme('vault-tec')">
                <div class="theme-swatch" style="background:#0a1929;"><div class="theme-swatch-inner" style="background:#FFB000;"></div></div>
                <span>Vault-Tec</span>
              </button>
              <button class="theme-option" onclick="setTheme('nuka-cola')">
                <div class="theme-swatch" style="background:#1a0a0a;"><div class="theme-swatch-inner" style="background:#FF3131;"></div></div>
                <span>Nuka-Cola</span>
              </button>
              <button class="theme-option" onclick="setTheme('brotherhood')">
                <div class="theme-swatch" style="background:#0a0a1a;"><div class="theme-swatch-inner" style="background:#4A90D9;"></div></div>
                <span>Brotherhood</span>
              </button>
              <button class="theme-option" onclick="setTheme('institute')">
                <div class="theme-swatch" style="background:#f0f0f0;"><div class="theme-swatch-inner" style="background:#00A0A0;"></div></div>
                <span>Institute</span>
              </button>
              <button class="theme-option" onclick="setTheme('ncr')">
                <div class="theme-swatch" style="background:#1a1408;"><div class="theme-swatch-inner" style="background:#C4A35A;"></div></div>
                <span>NCR</span>
              </button>
              <button class="theme-option" onclick="setTheme('enclave')">
                <div class="theme-swatch" style="background:#0a0a14;"><div class="theme-swatch-inner" style="background:#B22222;"></div></div>
                <span>Enclave</span>
              </button>
            </div>
          </div>
        </div>
        <button onclick="doLogout()" class="btn btn-danger">Logout</button>
      </div>
    </div>

    <!-- Dashboard Section -->
    <div class="dashboard-section" id="dashboard-section">

    <!-- Crypto Ticker Widget -->
    <div class="crypto-ticker" id="crypto-ticker">
      <div class="ticker-header">
        <div style="position: relative;">
          <button class="ticker-selector" id="coin-selector" onclick="toggleCoinDropdown()">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.31-8.86c-1.77-.45-2.34-.94-2.34-1.67 0-.84.79-1.43 2.1-1.43 1.38 0 1.9.66 1.94 1.64h1.71c-.05-1.34-.87-2.57-2.49-2.97V5H10.9v1.69c-1.51.32-2.72 1.3-2.72 2.81 0 1.79 1.49 2.69 3.66 3.21 1.95.46 2.34 1.15 2.34 1.87 0 .53-.39 1.39-2.1 1.39-1.6 0-2.23-.72-2.32-1.64H8.04c.1 1.7 1.36 2.66 2.86 2.97V19h2.34v-1.67c1.52-.29 2.72-1.16 2.73-2.77-.01-2.2-1.9-2.96-3.66-3.42z"/>
            </svg>
            <span id="selected-coin">BTC</span>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
          </button>
          <div class="ticker-dropdown hidden" id="coin-dropdown"></div>
        </div>
        <span style="color: #8BA88B;">/</span>
        <div style="position: relative;">
          <button class="ticker-selector" id="currency-selector" onclick="toggleCurrencyDropdown()">
            <span id="selected-currency">USD</span>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
          </button>
          <div class="ticker-dropdown hidden" id="currency-dropdown"></div>
        </div>
      </div>
      <div class="ticker-price" id="ticker-price">--</div>
      <div class="ticker-change" id="ticker-change">
        <span id="ticker-change-value">--</span>
        <span style="color: #8BA88B; font-size: 11px;">24h</span>
      </div>
      <div class="ticker-sparkline" id="ticker-sparkline">
        <canvas id="sparkline-canvas"></canvas>
      </div>
    </div>

    <!-- Profitability Calculator Widget -->
    <div class="profitability-widget" id="profitability-widget">
      <div class="profit-header" onclick="toggleProfitDetails()">
        <div class="profit-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00FF41" stroke-width="2">
            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Est. Earnings (<span id="profit-coin-symbol">BTC</span>)
        </div>
        <button class="profit-toggle" id="profit-toggle-btn">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
        </button>
      </div>
      <div class="profit-summary">
        <span class="profit-label">Daily earnings</span>
        <span class="profit-value sats" id="profit-daily-sats">-- sats</span>
      </div>
      <div class="profit-summary">
        <span class="profit-label">Net profit (<span id="profit-currency-label">USD</span>)</span>
        <span class="profit-value" id="profit-daily-net">--</span>
      </div>
      <div class="profit-details" id="profit-details">
        <div class="profit-section">
          <div class="profit-section-title">Earnings</div>
          <div class="profit-row"><span style="color:#8BA88B;">Daily</span><span id="profit-earn-daily" style="color:#FFB000;">--</span></div>
          <div class="profit-row"><span style="color:#8BA88B;">Weekly</span><span id="profit-earn-weekly" style="color:#FFB000;">--</span></div>
          <div class="profit-row"><span style="color:#8BA88B;">Monthly</span><span id="profit-earn-monthly" style="color:#FFB000;">--</span></div>
          <div class="profit-row"><span style="color:#8BA88B;">Yearly</span><span id="profit-earn-yearly" style="color:#FFB000;">--</span></div>
        </div>
        <div class="profit-section">
          <div class="profit-section-title">Power Costs</div>
          <div class="profit-row"><span style="color:#8BA88B;">Daily</span><span id="profit-power-daily" style="color:#FF8C00;">--</span></div>
          <div class="profit-row"><span style="color:#8BA88B;">Weekly</span><span id="profit-power-weekly" style="color:#FF8C00;">--</span></div>
          <div class="profit-row"><span style="color:#8BA88B;">Monthly</span><span id="profit-power-monthly" style="color:#FF8C00;">--</span></div>
          <div class="profit-row"><span style="color:#8BA88B;">Yearly</span><span id="profit-power-yearly" style="color:#FF8C00;">--</span></div>
        </div>
        <div class="profit-section">
          <div class="profit-section-title">Net Profit</div>
          <div class="profit-row"><span style="color:#8BA88B;">Daily</span><span id="profit-net-daily">--</span></div>
          <div class="profit-row"><span style="color:#8BA88B;">Weekly</span><span id="profit-net-weekly">--</span></div>
          <div class="profit-row"><span style="color:#8BA88B;">Monthly</span><span id="profit-net-monthly">--</span></div>
          <div class="profit-row"><span style="color:#8BA88B;">Yearly</span><span id="profit-net-yearly">--</span></div>
        </div>
        <div class="profit-section">
          <div class="profit-section-title">Settings</div>
          <div style="margin-bottom:8px;font-size:10px;padding:4px 8px;background:rgba(0,0,0,0.3);border-radius:4px;">
            <span style="color:#8BA88B;">Using </span><span id="profit-coin-name" style="color:#FFB000;">Bitcoin</span><span style="color:#8BA88B;"> price: </span><span id="profit-coin-price" style="color:#00FF41;">--</span>
          </div>
          <div class="profit-input-row">
            <span style="color:#8BA88B;font-size:11px;">Electricity cost:</span>
            <input type="number" class="profit-input" id="electricity-cost-input" value="0.12" step="0.01" min="0">
            <span style="color:#8BA88B;font-size:11px;">$/kWh</span>
            <button class="btn btn-secondary" style="padding:4px 8px;font-size:10px;" onclick="saveElectricityCost()">Save</button>
          </div>
          <div id="profit-network-stats" style="margin-top:8px;font-size:10px;color:#8BA88B;">
            <span>BTC Difficulty: <span id="profit-difficulty" style="color:#FFB000;">--</span></span>
            <span style="margin-left:12px;">Block Reward: <span id="profit-block-reward" style="color:#FFB000;">--</span> BTC</span>
            <div id="profit-btc-only-note" class="hidden" style="margin-top:4px;color:#FF8C00;font-size:9px;">Note: Profitability calculated using Bitcoin network stats</div>
          </div>
        </div>
      </div>
    </div>

    <div class="summary-grid">
      <!-- Hashrate Card -->
      <div class="summary-card">
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
          <div style="padding: 10px; background: rgba(255,176,0,0.15); border: 1px solid rgba(255,176,0,0.3); border-radius: 8px;">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFB000" stroke-width="2">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <div class="stat-label" style="margin: 0;">Total Hashrate</div>
        </div>
        <div id="total-hashrate" class="stat-value accent" style="text-shadow: 0 0 6px rgba(255,176,0,0.4);">--</div>
        <div style="height: 6px; background: rgba(10,25,41,0.8); border: 1px solid rgba(26,74,92,0.6); border-radius: 3px; margin-top: 12px; overflow: hidden;">
          <div id="hashrate-bar" style="height: 100%; width: 0%; background: linear-gradient(90deg, #FFB000, #FFC940); transition: width 0.5s; border-radius: 3px;"></div>
        </div>
      </div>
      <!-- Temperature Card -->
      <div class="summary-card">
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
          <div id="temp-icon-bg" style="padding: 10px; background: rgba(0,255,65,0.15); border: 1px solid rgba(0,255,65,0.3); border-radius: 8px;">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#00FF41" stroke-width="2" id="temp-icon">
              <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <div class="stat-label" style="margin: 0;">Avg Temperature</div>
        </div>
        <div id="avg-temp" class="stat-value success">--</div>
        <div style="height: 6px; background: rgba(10,25,41,0.8); border: 1px solid rgba(26,74,92,0.6); border-radius: 3px; margin-top: 12px; overflow: hidden;">
          <div id="temp-bar" style="height: 100%; width: 0%; background: #00FF41; transition: width 0.5s; border-radius: 3px;"></div>
        </div>
        <div style="font-size: 11px; color: #8BA88B; margin-top: 8px; text-align: right; text-transform: uppercase; letter-spacing: 0.5px;"><span id="temp-status">OPTIMAL</span></div>
      </div>
      <!-- Power Card -->
      <div class="summary-card">
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
          <div style="padding: 10px; background: rgba(0,206,209,0.15); border: 1px solid rgba(0,206,209,0.3); border-radius: 8px;">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#00CED1" stroke-width="2">
              <path d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <div class="stat-label" style="margin: 0;">Total Power</div>
        </div>
        <div id="total-power" class="stat-value" style="color: #00CED1; text-shadow: 0 0 4px rgba(0,206,209,0.3);">--</div>
        <div style="height: 6px; background: rgba(10,25,41,0.8); border: 1px solid rgba(26,74,92,0.6); border-radius: 3px; margin-top: 12px; overflow: hidden;">
          <div id="power-bar" style="height: 100%; width: 0%; background: linear-gradient(90deg, #00CED1, #20B2AA); transition: width 0.5s; border-radius: 3px;"></div>
        </div>
      </div>
      <!-- Efficiency Card -->
      <div class="summary-card">
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
          <div style="padding: 10px; background: rgba(0,255,65,0.15); border: 1px solid rgba(0,255,65,0.3); border-radius: 8px;">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#00FF41" stroke-width="1.5">
              <path d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <div class="stat-label" style="margin: 0;">Efficiency</div>
        </div>
        <div id="efficiency" class="stat-value" style="color: #00FF41; text-shadow: 0 0 4px rgba(0,255,65,0.3);">--</div>
        <div style="height: 6px; background: rgba(10,25,41,0.8); border: 1px solid rgba(26,74,92,0.6); border-radius: 3px; margin-top: 12px; overflow: hidden;">
          <div id="efficiency-bar" style="height: 100%; width: 0%; background: linear-gradient(90deg, #00FF41, #00CC33); transition: width 0.5s; border-radius: 3px;"></div>
        </div>
      </div>
      <!-- Shares Card -->
      <div class="summary-card">
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
          <div style="padding: 10px; background: rgba(0,255,65,0.15); border: 1px solid rgba(0,255,65,0.3); border-radius: 8px;">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#00FF41" stroke-width="1.5">
              <path d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <div class="stat-label" style="margin: 0;">Shares Accepted</div>
        </div>
        <div id="total-shares" class="stat-value success" style="text-shadow: 0 0 4px rgba(0,255,65,0.3);">--</div>
      </div>
      <!-- Best Difficulty Card -->
      <div class="summary-card">
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
          <div style="padding: 10px; background: rgba(255,140,0,0.15); border: 1px solid rgba(255,140,0,0.3); border-radius: 8px;">
            <svg width="24" height="24" viewBox="0 0 20 20" fill="#FF8C00">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
            </svg>
          </div>
          <div class="stat-label" style="margin: 0;">Best Difficulty</div>
        </div>
        <div id="best-difficulty" class="stat-value" style="color: #FF8C00; text-shadow: 0 0 4px rgba(255,140,0,0.3);">--</div>
      </div>
      <!-- Power Cost Card -->
      <div class="summary-card">
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
          <div style="padding: 10px; background: rgba(255,49,49,0.15); border: 1px solid rgba(255,49,49,0.3); border-radius: 8px;">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FF3131" stroke-width="1.5">
              <path d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <div class="stat-label" style="margin: 0;">Power Cost</div>
        </div>
        <div id="power-cost" class="stat-value" style="color: #FF3131; text-shadow: 0 0 4px rgba(255,49,49,0.3);">--</div>
        <div id="power-cost-rate" style="font-size: 11px; color: #8BA88B; margin-top: 4px;">@ $0.10/kWh</div>
      </div>
      <!-- Block Time Card -->
      <div class="summary-card">
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
          <div style="padding: 10px; background: rgba(255,176,0,0.15); border: 1px solid rgba(255,176,0,0.3); border-radius: 8px;">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFB000" stroke-width="1.5">
              <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <div class="stat-label" style="margin: 0;">Block Time</div>
        </div>
        <div id="block-time" class="stat-value accent" style="text-shadow: 0 0 4px rgba(255,176,0,0.3);">--</div>
        <div id="daily-odds" style="font-size: 11px; color: #FF8C00; margin-top: 4px;">--</div>
        <div id="network-difficulty" style="font-size: 11px; color: #8BA88B; margin-top: 4px;">Loading...</div>
      </div>
    </div>

    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
      <h3 style="color: #FFB000; text-transform: uppercase; letter-spacing: 1px;">Devices (<span id="device-count">0</span>)</h3>
      <button onclick="openAddDeviceModal()" class="btn btn-primary" style="padding: 8px 16px;">
        <span style="display: flex; align-items: center; gap: 6px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add Device
        </span>
      </button>
    </div>
    <div id="devices-list"></div>
    </div><!-- End dashboard-section -->

    <!-- Charts Section -->
    <div class="charts-section" id="charts-section">
      <div class="chart-container">
        <h3 style="color: #FFB000; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 16px;">Performance Charts</h3>

        <!-- Device Selector -->
        <div class="chart-control-group" style="margin-bottom: 16px;">
          <div class="chart-control-label">Select Devices</div>
          <div class="device-selector" id="chart-device-selector"></div>
        </div>

        <!-- Chart Controls -->
        <div class="chart-controls">
          <div class="chart-control-group">
            <div class="chart-control-label">Metric</div>
            <div class="chart-btn-group">
              <button class="chart-btn active" onclick="setChartMetric('hashrate')" id="metric-hashrate">Hashrate</button>
              <button class="chart-btn" onclick="setChartMetric('temperature')" id="metric-temperature">Temperature</button>
              <button class="chart-btn" onclick="setChartMetric('power')" id="metric-power">Power</button>
              <button class="chart-btn" onclick="setChartMetric('efficiency')" id="metric-efficiency">Efficiency</button>
            </div>
          </div>
          <div class="chart-control-group">
            <div class="chart-control-label">Time Range</div>
            <div class="chart-btn-group">
              <button class="chart-btn" onclick="setChartTimeRange('1h')" id="range-1h">1H</button>
              <button class="chart-btn" onclick="setChartTimeRange('6h')" id="range-6h">6H</button>
              <button class="chart-btn active" onclick="setChartTimeRange('24h')" id="range-24h">24H</button>
              <button class="chart-btn" onclick="setChartTimeRange('7d')" id="range-7d">7D</button>
              <button class="chart-btn" onclick="setChartTimeRange('30d')" id="range-30d">30D</button>
            </div>
          </div>
        </div>

        <!-- Chart -->
        <div class="chart-wrapper" style="height: 350px; position: relative;">
          <canvas id="performance-chart" style="width: 100%; height: 100%;"></canvas>
        </div>

        <!-- Stats Table -->
        <div class="chart-stats" id="chart-stats"></div>
      </div>
    </div>
  </div>

  <div id="device-modal" class="modal-overlay hidden" onclick="if(event.target===this)closeModal()">
    <div class="modal">
      <div class="modal-header">
        <div class="modal-title" id="modal-device-name">Device</div>
        <div style="display: flex; gap: 8px;">
          <button onclick="openEditDeviceModal()" class="btn btn-secondary" id="modal-edit-btn">Edit</button>
          <button onclick="confirmDeleteDevice()" class="btn btn-danger" id="modal-delete-btn">Delete</button>
          <button onclick="closeModal()" class="btn btn-secondary">Close</button>
        </div>
      </div>
      <div class="modal-body" id="modal-body"></div>
    </div>
  </div>

  <!-- Add Device Modal -->
  <div id="add-device-modal" class="modal-overlay hidden" onclick="if(event.target===this)closeAddDeviceModal()">
    <div class="modal" style="max-width: 400px;">
      <div class="modal-header">
        <div class="modal-title">Add Device</div>
        <button onclick="closeAddDeviceModal()" class="btn btn-secondary">Cancel</button>
      </div>
      <div class="modal-body">
        <p style="color: #8BA88B; margin-bottom: 16px;">Enter the IP address of your BitAxe device to add it to your fleet.</p>
        <div style="margin-bottom: 12px;">
          <label style="font-size: 11px; color: #8BA88B; text-transform: uppercase; display: block; margin-bottom: 4px;">IP Address *</label>
          <input type="text" id="add-device-ip" class="input" placeholder="192.168.1.100" style="margin-bottom: 0;">
        </div>
        <div style="margin-bottom: 16px;">
          <label style="font-size: 11px; color: #8BA88B; text-transform: uppercase; display: block; margin-bottom: 4px;">Device Name (optional)</label>
          <input type="text" id="add-device-name" class="input" placeholder="Leave blank to use hostname" style="margin-bottom: 0;">
        </div>
        <div id="add-device-error" class="error hidden"></div>
        <div id="add-device-testing" class="hidden" style="color: #FFB000; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
          <div style="width: 16px; height: 16px; border: 2px solid #FFB000; border-top-color: transparent; border-radius: 50%; animation: spin 1s linear infinite;"></div>
          Testing connection...
        </div>
        <button onclick="addDevice()" class="btn btn-primary" style="width: 100%;" id="add-device-btn">Add Device</button>
      </div>
    </div>
  </div>

  <!-- Edit Device Modal -->
  <div id="edit-device-modal" class="modal-overlay hidden" onclick="if(event.target===this)closeEditDeviceModal()">
    <div class="modal" style="max-width: 400px;">
      <div class="modal-header">
        <div class="modal-title">Edit Device</div>
        <button onclick="closeEditDeviceModal()" class="btn btn-secondary">Cancel</button>
      </div>
      <div class="modal-body">
        <div style="margin-bottom: 12px;">
          <label style="font-size: 11px; color: #8BA88B; text-transform: uppercase; display: block; margin-bottom: 4px;">Device Name</label>
          <input type="text" id="edit-device-name" class="input" style="margin-bottom: 0;">
        </div>
        <div style="margin-bottom: 16px;">
          <label style="font-size: 11px; color: #8BA88B; text-transform: uppercase; display: block; margin-bottom: 4px;">IP Address</label>
          <input type="text" id="edit-device-ip" class="input" style="margin-bottom: 0;">
        </div>
        <div id="edit-device-error" class="error hidden"></div>
        <button onclick="saveDeviceChanges()" class="btn btn-primary" style="width: 100%;">Save Changes</button>
      </div>
    </div>
  </div>

  <!-- Confirm Delete Modal -->
  <div id="confirm-delete-modal" class="modal-overlay hidden" onclick="if(event.target===this)closeConfirmDeleteModal()">
    <div class="modal" style="max-width: 400px;">
      <div class="modal-header">
        <div class="modal-title" style="color: #FF3131;">Confirm Delete</div>
        <button onclick="closeConfirmDeleteModal()" class="btn btn-secondary">Cancel</button>
      </div>
      <div class="modal-body">
        <p style="color: #E8F4E8; margin-bottom: 8px;">Are you sure you want to delete this device?</p>
        <p style="color: #8BA88B; margin-bottom: 16px; font-size: 12px;">Device: <span id="delete-device-name" style="color: #FFB000;"></span></p>
        <p style="color: #FF8C00; margin-bottom: 16px; font-size: 11px;">⚠️ This will remove all associated metrics and history.</p>
        <div style="display: flex; gap: 12px;">
          <button onclick="closeConfirmDeleteModal()" class="btn btn-secondary" style="flex: 1;">Cancel</button>
          <button onclick="deleteDevice()" class="btn btn-danger" style="flex: 1;">Delete</button>
        </div>
      </div>
    </div>
  </div>

  <style>
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>

  <script>
    let token = localStorage.getItem('token');
    let devices = [];

    // Theme system
    const themes = ['vault-tec', 'nuka-cola', 'brotherhood', 'institute', 'ncr', 'enclave'];
    let currentTheme = localStorage.getItem('theme') || 'vault-tec';

    function initTheme() {
      setTheme(currentTheme, false);
    }

    function setTheme(theme, save = true) {
      themes.forEach(t => document.body.classList.remove('theme-' + t));
      document.body.classList.add('theme-' + theme);
      currentTheme = theme;
      if (save) localStorage.setItem('theme', theme);
      updateThemeDropdown();
      closeThemeDropdown();
      // Refresh charts with new theme colors
      if (typeof updateChart === 'function') {
        setTimeout(() => {
          renderDeviceSelector();
          updateChart();
        }, 50);
      }
    }

    function toggleThemeDropdown(e) {
      if (e) e.stopPropagation();
      const dropdown = document.getElementById('theme-dropdown');
      const isOpen = dropdown.classList.contains('show');
      if (isOpen) {
        closeThemeDropdown();
      } else {
        dropdown.classList.add('show');
        showThemeBackdrop();
        // Prevent body scroll on mobile
        if (window.innerWidth <= 768) {
          document.body.style.overflow = 'hidden';
        }
      }
    }

    function closeThemeDropdown() {
      const dropdown = document.getElementById('theme-dropdown');
      if (dropdown) dropdown.classList.remove('show');
      hideThemeBackdrop();
      // Restore body scroll
      document.body.style.overflow = '';
    }

    function showThemeBackdrop() {
      let backdrop = document.getElementById('theme-backdrop');
      if (!backdrop) {
        backdrop = document.createElement('div');
        backdrop.id = 'theme-backdrop';
        backdrop.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:9999;opacity:0;transition:opacity 0.2s;';
        backdrop.onclick = closeThemeDropdown;
        document.body.appendChild(backdrop);
      }
      requestAnimationFrame(() => backdrop.style.opacity = '1');
    }

    function hideThemeBackdrop() {
      const backdrop = document.getElementById('theme-backdrop');
      if (backdrop) {
        backdrop.style.opacity = '0';
        setTimeout(() => backdrop.remove(), 200);
      }
    }

    function updateThemeDropdown() {
      document.querySelectorAll('.theme-option').forEach(opt => {
        opt.classList.remove('active');
        if (opt.onclick && opt.onclick.toString().includes(currentTheme)) {
          opt.classList.add('active');
        }
      });
    }

    // Close dropdown when clicking outside (desktop)
    document.addEventListener('click', function(e) {
      if (!e.target.closest('.theme-selector') && !e.target.closest('#theme-backdrop')) {
        closeThemeDropdown();
      }
    });

    // Initialize theme on page load
    initTheme();

    async function init() {
      try {
        const res = await fetch('/api/setup-required');
        const { required } = await res.json();
        if (required) {
          document.getElementById('setup-form').classList.remove('hidden');
        } else if (token) {
          await loadDashboard();
        } else {
          document.getElementById('login-form').classList.remove('hidden');
        }
      } catch (err) {
        console.error('Init error:', err);
        document.body.innerHTML = '<div style="color:red;padding:20px;">Error: ' + err.message + '</div>';
      }
    }

    async function doSetup() {
      const password = document.getElementById('setup-password').value;
      const confirm = document.getElementById('setup-confirm').value;
      const errorEl = document.getElementById('setup-error');
      if (password.length < 6) { errorEl.textContent = 'Password must be at least 6 characters'; errorEl.classList.remove('hidden'); return; }
      if (password !== confirm) { errorEl.textContent = 'Passwords do not match'; errorEl.classList.remove('hidden'); return; }
      const res = await fetch('/api/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
      const data = await res.json();
      if (data.error) { errorEl.textContent = data.error; errorEl.classList.remove('hidden'); return; }
      token = data.token; localStorage.setItem('token', token); await loadDashboard();
    }

    async function doLogin() {
      const password = document.getElementById('login-password').value;
      const errorEl = document.getElementById('login-error');
      const res = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
      const data = await res.json();
      if (data.error) { errorEl.textContent = data.error; errorEl.classList.remove('hidden'); return; }
      token = data.token; localStorage.setItem('token', token); await loadDashboard();
    }

    function doLogout() {
      fetch('/api/logout', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token } });
      localStorage.removeItem('token'); location.reload();
    }

    async function loadDashboard() {
      document.getElementById('login-view').classList.add('hidden');
      document.getElementById('dashboard-view').classList.remove('hidden');
      await fetchDevices(); setInterval(fetchDevices, 5000);
    }

    async function fetchDevices() {
      const res = await fetch('/api/devices', { headers: { 'Authorization': 'Bearer ' + token } });
      if (res.status === 401) { localStorage.removeItem('token'); location.reload(); return; }
      const data = await res.json(); devices = data.devices; renderDevices();
    }

    async function showDeviceDetail(deviceId) {
      currentDeviceId = deviceId;
      const device = devices.find(d => d.id === deviceId);
      if (!device) return;
      const m = device.latestMetrics;
      document.getElementById('modal-device-name').textContent = device.name;

      // Fetch recent metrics for this device
      let recentMetrics = [];
      try {
        const res = await fetch('/api/devices/' + deviceId + '/metrics?limit=20', { headers: { 'Authorization': 'Bearer ' + token } });
        if (res.ok) {
          const data = await res.json();
          recentMetrics = data.metrics || [];
        }
      } catch (e) { console.error('Failed to fetch metrics:', e); }

      let html = '';
      const isCluster = m && m.isClusterMaster && m.clusterInfo;
      const c = isCluster ? m.clusterInfo : null;

      // ClusterAxe Banner - Show prominently at top when active
      if (isCluster) {
        html += '<div style="background:linear-gradient(90deg,rgba(255,176,0,0.15),transparent);border:2px solid #FFB000;padding:16px;margin-bottom:16px;">';
        html += '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">';
        html += '<div style="display:flex;align-items:center;gap:12px;">';
        html += '<div style="padding:10px;background:rgba(255,176,0,0.2);border:2px solid #FFB000;">';
        html += '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#FFB000" stroke-width="2"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="5" r="2"/><circle cx="19" cy="12" r="2"/><circle cx="5" cy="12" r="2"/><circle cx="12" cy="19" r="2"/><line x1="12" y1="7" x2="12" y2="9"/><line x1="17" y1="12" x2="15" y2="12"/><line x1="7" y1="12" x2="9" y2="12"/><line x1="12" y1="17" x2="12" y2="15"/></svg>';
        html += '</div>';
        html += '<div>';
        html += '<div style="font-size:18px;font-weight:bold;color:#FFB000;text-shadow:0 0 10px rgba(255,176,0,0.5);letter-spacing:2px;">CLUSTER MODE ACTIVE</div>';
        html += '<div style="font-size:12px;color:#8BA88B;margin-top:4px;"><span style="color:#00FF41;">' + c.activeSlaves + ' slaves</span> via ' + c.transport.type.toUpperCase() + (c.transport.encrypted ? ' <span style="color:#00FF41;">● ENCRYPTED</span>' : '') + '</div>';
        html += '</div></div>';
        html += '<div style="text-align:right;">';
        html += '<div style="font-size:10px;color:#8BA88B;text-transform:uppercase;">Combined Hashrate</div>';
        html += '<div style="font-size:28px;font-weight:bold;color:#FFB000;text-shadow:0 0 10px rgba(255,176,0,0.5);">' + formatHashrate(c.totalHashrate / 100) + '</div>';
        html += '</div></div></div>';
      }

      html += '<div class="detail-grid">';
      html += '<div class="detail-item"><div class="detail-label">Status</div><div class="detail-value ' + (device.isOnline ? 'success' : 'danger') + '">' + (device.isOnline ? 'ONLINE' : 'OFFLINE') + '</div></div>';
      html += '<div class="detail-item"><div class="detail-label">IP Address</div><div class="detail-value">' + device.ipAddress + '</div></div>';

      if (m) {
        html += '<div class="detail-item"><div class="detail-label">' + (isCluster ? 'Cluster Hashrate' : 'Hashrate') + '</div><div class="detail-value accent">' + formatHashrate(m.hashRate) + '</div></div>';
        html += '<div class="detail-item"><div class="detail-label">Temperature</div><div class="detail-value ' + getTempClass(m.temp) + '">' + formatTemp(m.temp) + '</div></div>';
        html += '<div class="detail-item"><div class="detail-label">' + (isCluster ? 'Cluster Power' : 'Power') + '</div><div class="detail-value">' + formatPower(m.power) + '<div style="font-size:11px;color:#8BA88B;margin-top:2px;">' + formatAmps(m.current, m.power, m.voltage) + '</div></div></div>';
        html += '<div class="detail-item"><div class="detail-label">' + (isCluster ? 'Cluster Efficiency' : 'Efficiency') + '</div><div class="detail-value">' + (m.efficiency ? m.efficiency.toFixed(1) + ' J/TH' : '--') + '</div></div>';
        html += '</div>';

        html += '<div class="section-title">Hardware</div><div class="detail-grid">';
        html += '<div class="detail-item"><div class="detail-label">Model</div><div class="detail-value">' + (m.ASICModel || 'Unknown') + '</div></div>';
        html += '<div class="detail-item"><div class="detail-label">Firmware</div><div class="detail-value">' + (m.version || 'Unknown') + '</div></div>';
        html += '<div class="detail-item"><div class="detail-label">Frequency</div><div class="detail-value">' + (m.frequency ? Math.round(m.frequency) + ' MHz' : '--') + '</div></div>';
        html += '<div class="detail-item"><div class="detail-label">Core Voltage</div><div class="detail-value">' + (m.coreVoltage ? m.coreVoltage + ' mV' : '--') + '</div></div>';
        html += '<div class="detail-item"><div class="detail-label">Fan Speed</div><div class="detail-value">' + (m.fanspeed ? m.fanspeed + '%' : '--') + '</div></div>';
        html += '<div class="detail-item"><div class="detail-label">VR Temp</div><div class="detail-value">' + formatTemp(m.vrTemp) + '</div></div>';
        html += '</div>';

        html += '<div class="section-title">Mining Stats</div><div class="detail-grid">';
        html += '<div class="detail-item"><div class="detail-label">' + (isCluster ? 'Cluster Accepted' : 'Shares Accepted') + '</div><div class="detail-value success">' + (m.sharesAccepted || 0).toLocaleString() + '</div></div>';
        html += '<div class="detail-item"><div class="detail-label">' + (isCluster ? 'Cluster Rejected' : 'Shares Rejected') + '</div><div class="detail-value danger">' + (m.sharesRejected || 0).toLocaleString() + '</div></div>';
        var detailBestDiff = Math.max(parseDifficulty(m.bestDiff), device.allTimeBestDiff || 0);
        html += '<div class="detail-item"><div class="detail-label">Best Difficulty</div><div class="detail-value accent">' + formatDifficulty(detailBestDiff) + '</div></div>';
        html += '<div class="detail-item"><div class="detail-label">Uptime</div><div class="detail-value">' + formatUptime(m.uptimeSeconds) + '</div></div>';
        html += '</div>';

        // Solo Block Chance
        var detailBlockChance = networkStats ? calculateBlockChance(m.hashRate, networkStats.difficulty) : null;
        if (detailBlockChance) {
          html += '<div class="section-title" style="display:flex;align-items:center;gap:8px;">';
          html += '<svg width="16" height="16" viewBox="0 0 20 20" fill="#FF8C00"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>';
          html += 'Solo Block Chance</div>';
          html += '<div class="detail-grid">';
          html += '<div class="detail-item"><div class="detail-label">Expected Time</div><div class="detail-value" style="color:#FF8C00;">' + formatTimeToBlock(detailBlockChance.daysToBlock) + '</div></div>';
          html += '<div class="detail-item"><div class="detail-label">Daily Odds</div><div class="detail-value">' + formatOdds(detailBlockChance.dailyOdds) + '</div></div>';
          html += '</div>';
          html += '<div style="font-size:10px;color:#8BA88B;margin-top:4px;font-style:italic;">Solo mining is a lottery - these are statistical averages</div>';
        }

        html += '<div class="section-title">Pool</div><div class="detail-grid">';
        html += '<div class="detail-item" style="grid-column: span 2;"><div class="detail-label">Stratum URL</div><div class="detail-value" style="font-size:12px;word-break:break-all;">' + (m.stratumURL || 'Not configured') + '</div></div>';
        html += '<div class="detail-item" style="grid-column: span 2;"><div class="detail-label">Worker</div><div class="detail-value" style="font-size:12px;word-break:break-all;">' + (m.stratumUser || 'Not configured') + '</div></div>';
        html += '</div>';

        // ClusterAxe Slave Devices (stats already shown in banner)
        if (isCluster) {
          html += '<div class="section-title" style="display:flex;align-items:center;gap:8px;">';
          html += '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFB000" stroke-width="2"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="5" r="2"/><circle cx="19" cy="12" r="2"/><circle cx="5" cy="12" r="2"/><line x1="12" y1="7" x2="12" y2="9"/><line x1="17" y1="12" x2="15" y2="12"/><line x1="7" y1="12" x2="9" y2="12"/></svg>';
          html += 'Cluster Devices</div>';

          html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;">';
          c.slaves.forEach(function(slave) {
            html += '<div style="background:#0a1929;border:1px solid #1a4a5c;padding:8px;">';
            html += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">';
            html += '<div style="width:6px;height:6px;border-radius:50%;background:' + (slave.state === 2 ? '#00FF41' : '#FF8C00') + ';"></div>';
            html += '<span style="color:#FFB000;font-weight:bold;font-size:11px;">' + slave.hostname + '</span>';
            html += '</div>';
            html += '<div style="font-size:9px;color:#8BA88B;margin-bottom:4px;">' + slave.ipAddr + '</div>';
            html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:2px;font-size:9px;">';
            html += '<div><span style="color:#8BA88B;">Hash:</span> <span style="color:#FFB000;">' + formatHashrate(slave.hashrate / 100) + '</span></div>';
            html += '<div><span style="color:#8BA88B;">Temp:</span> <span style="color:' + (slave.temperature > 60 ? '#FF8C00' : '#00FF41') + ';">' + slave.temperature.toFixed(1) + '°C</span></div>';
            html += '<div><span style="color:#8BA88B;">Power:</span> <span style="color:#00CED1;">' + slave.power.toFixed(1) + 'W</span></div>';
            html += '<div><span style="color:#8BA88B;">Shares:</span> <span style="color:#00FF41;">' + slave.sharesAccepted + '</span></div>';
            html += '</div></div>';
          });
          html += '</div>';
        }

        // Recent Metrics Table
        if (recentMetrics.length > 0) {
          html += '<div class="section-title">Recent Metrics</div>';
          html += '<div style="overflow-x:auto;max-height:200px;overflow-y:auto;">';
          html += '<table style="width:100%;border-collapse:collapse;font-size:11px;">';
          html += '<thead style="position:sticky;top:0;background:#0d2137;"><tr>';
          html += '<th style="padding:8px;text-align:left;border-bottom:1px solid #1a4a5c;color:#8BA88B;">Time</th>';
          html += '<th style="padding:8px;text-align:left;border-bottom:1px solid #1a4a5c;color:#8BA88B;">Hashrate</th>';
          html += '<th style="padding:8px;text-align:left;border-bottom:1px solid #1a4a5c;color:#8BA88B;">Temp</th>';
          html += '<th style="padding:8px;text-align:left;border-bottom:1px solid #1a4a5c;color:#8BA88B;">Power</th>';
          html += '<th style="padding:8px;text-align:left;border-bottom:1px solid #1a4a5c;color:#8BA88B;">Best Diff</th>';
          html += '</tr></thead><tbody>';
          recentMetrics.forEach(function(metric) {
            const time = new Date(metric.timestamp).toLocaleTimeString();
            const hr = metric.hashrate ? formatHashrate(metric.hashrate / 1e9) : '--';
            const temp = metric.temperature ? metric.temperature.toFixed(1) + '°C' : '--';
            const power = metric.power ? metric.power.toFixed(1) + ' W' : '--';
            const diff = metric.data?.bestDiff;
            const diffStr = diff ? (typeof diff === 'string' ? diff : (diff >= 1e9 ? (diff / 1e9).toFixed(2) + 'B' : diff >= 1e6 ? (diff / 1e6).toFixed(2) + 'M' : diff >= 1e3 ? (diff / 1e3).toFixed(2) + 'K' : diff.toLocaleString())) : '--';
            html += '<tr style="border-bottom:1px solid #1a4a5c;">';
            html += '<td style="padding:6px 8px;color:#8BA88B;">' + time + '</td>';
            html += '<td style="padding:6px 8px;color:#FFB000;">' + hr + '</td>';
            html += '<td style="padding:6px 8px;color:' + (metric.temperature > 80 ? '#FF3131' : metric.temperature > 70 ? '#FF8C00' : '#00FF41') + ';">' + temp + '</td>';
            html += '<td style="padding:6px 8px;color:#E8F4E8;">' + power + '</td>';
            html += '<td style="padding:6px 8px;color:#FFB000;">' + diffStr + '</td>';
            html += '</tr>';
          });
          html += '</tbody></table></div>';
        }

        // Device Control Panel
        html += '<div class="section-title" style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;" onclick="toggleControlPanel()">';
        html += '<div style="display:flex;align-items:center;gap:8px;">';
        html += '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFB000" stroke-width="2"><path d="M12 15a3 3 0 100-6 3 3 0 000 6z"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>';
        html += 'Device Control</div>';
        html += '<svg id="control-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8BA88B" stroke-width="2" style="transition:transform 0.2s;"><path d="M6 9l6 6 6-6"/></svg>';
        html += '</div>';

        html += '<div id="control-panel" style="display:none;margin-top:12px;">';
        html += '<div style="background:rgba(255,140,0,0.1);border:1px solid rgba(255,140,0,0.3);padding:10px;margin-bottom:12px;font-size:11px;color:#FF8C00;">';
        html += '<strong>⚠️ Warning:</strong> Changing these settings may affect device stability. Use with caution.';
        html += '</div>';

        // Fan Speed
        html += '<div style="margin-bottom:16px;">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">';
        html += '<label style="color:#8BA88B;font-size:12px;">Fan Speed</label>';
        html += '<span id="fan-value" style="color:#FFB000;font-size:12px;">' + (m.fanspeed || 0) + '%</span>';
        html += '</div>';
        html += '<input type="range" id="fan-slider" min="0" max="100" value="' + (m.fanspeed || 0) + '" style="width:100%;cursor:pointer;" oninput="document.getElementById(\\'fan-value\\').textContent=this.value+\\'%\\'">';
        html += '<button onclick="applyFanSpeed()" style="margin-top:8px;padding:12px 16px;background:#1a4a5c;border:1px solid #00CED1;color:#00CED1;cursor:pointer;font-size:14px;min-height:44px;width:100%;touch-action:manipulation;">Apply Fan Speed</button>';
        html += '</div>';

        // Frequency
        html += '<div style="margin-bottom:16px;">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">';
        html += '<label style="color:#8BA88B;font-size:12px;">Frequency</label>';
        html += '<span id="freq-value" style="color:#FFB000;font-size:12px;">' + Math.round(m.frequency || 485) + ' MHz</span>';
        html += '</div>';
        html += '<input type="range" id="freq-slider" min="400" max="900" step="5" value="' + Math.round(m.frequency || 485) + '" style="width:100%;cursor:pointer;" oninput="document.getElementById(\\'freq-value\\').textContent=this.value+\\' MHz\\'">';
        html += '<button onclick="applyFrequency()" style="margin-top:8px;padding:12px 16px;background:#1a4a5c;border:1px solid #00CED1;color:#00CED1;cursor:pointer;font-size:14px;min-height:44px;width:100%;touch-action:manipulation;">Apply Frequency</button>';
        html += '</div>';

        // Core Voltage
        html += '<div style="margin-bottom:16px;">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">';
        html += '<label style="color:#8BA88B;font-size:12px;">Core Voltage</label>';
        html += '<span id="voltage-value" style="color:#FFB000;font-size:12px;">' + (m.coreVoltage || 1200) + ' mV</span>';
        html += '</div>';
        html += '<input type="range" id="voltage-slider" min="1000" max="1300" step="10" value="' + (m.coreVoltage || 1200) + '" style="width:100%;cursor:pointer;" oninput="document.getElementById(\\'voltage-value\\').textContent=this.value+\\' mV\\'">';
        html += '<button onclick="applyVoltage()" style="margin-top:8px;padding:12px 16px;background:#1a4a5c;border:1px solid #00CED1;color:#00CED1;cursor:pointer;font-size:14px;min-height:44px;width:100%;touch-action:manipulation;">Apply Voltage</button>';
        html += '</div>';

        html += '<div id="control-status" style="display:none;padding:8px;margin-top:8px;font-size:11px;"></div>';
        html += '</div>';
      } else {
        html += '</div><p style="color:#8BA88B;text-align:center;padding:20px;">No metrics available</p>';
      }

      document.getElementById('modal-body').innerHTML = html;
      const modal = document.getElementById('device-modal');
      modal.classList.remove('hidden', 'closing');
    }

    function closeModal() {
      const modal = document.getElementById('device-modal');
      modal.classList.add('closing');
      setTimeout(() => {
        modal.classList.add('hidden');
        modal.classList.remove('closing');
      }, 250);
    }

    function renderDevices() {
      const container = document.getElementById('devices-list');
      let totalHashrate = 0, totalPower = 0, tempSum = 0, onlineCount = 0, totalShares = 0, bestDiff = 0;
      const onlineDevices = devices.filter(d => d.isOnline);
      const offlineDevices = devices.filter(d => !d.isOnline);
      onlineDevices.forEach(d => {
        const m = d.latestMetrics;
        if (m) { totalHashrate += m.hashRate || 0; totalPower += m.power || 0; if (m.temp) { tempSum += m.temp; onlineCount++; } totalShares += m.sharesAccepted || 0; }
        // Track best difficulty across all devices - check multiple field name variants
        // Use parseDifficulty to handle formatted strings like "56.4M" from AxeOS
        const sessionBest = parseDifficulty(m?.bestDiff || m?.bestdiff || m?.best_diff || m?.BestDiff);
        const sessionBest2 = parseDifficulty(m?.bestSessionDiff || m?.bestsessiondiff || m?.best_session_diff);
        const deviceBest = Math.max(d.allTimeBestDiff || 0, sessionBest, sessionBest2);
        if (deviceBest > bestDiff) bestDiff = deviceBest;
      });
      // Also check offline devices for all-time best
      offlineDevices.forEach(d => {
        if (d.allTimeBestDiff && d.allTimeBestDiff > bestDiff) bestDiff = d.allTimeBestDiff;
      });

      container.innerHTML = [...onlineDevices, ...offlineDevices].map(d => {
        const m = d.latestMetrics;
        const isCluster = m && m.isClusterMaster && m.clusterInfo;
        const isBitmain = d.deviceType === 'bitmain';
        const blockChance = m && m.hashRate && networkStats ? calculateBlockChance(m.hashRate, networkStats.difficulty) : null;
        // Parse best diff - handles formatted strings like "56.4M" from AxeOS
        const currentBestDiff = m ? parseDifficulty(m.bestDiff) : 0;
        const allTimeBest = d.allTimeBestDiff || 0;
        const displayBestDiff = Math.max(currentBestDiff, allTimeBest);
        const isNewRecord = currentBestDiff > 0 && currentBestDiff >= allTimeBest;
        return '<div class="card clickable" onclick="showDeviceDetail(' + "'" + d.id + "'" + ')">' +
          '<div class="device-header"><div><div class="device-name">' + d.name + '</div><div class="device-ip">' + d.ipAddress + '</div>' +
          (m ? '<div class="device-model" style="display:flex;align-items:center;gap:6px;">' + (m.ASICModel || 'BitAxe') +
            (isBitmain ? '<span style="padding:1px 6px;font-size:9px;background:rgba(255,140,0,0.2);border:1px solid rgba(255,140,0,0.4);color:#FF8C00;text-transform:uppercase;font-weight:bold;">BETA</span>' : '') +
            (isCluster ? '<span style="padding:1px 6px;font-size:9px;background:rgba(255,176,0,0.2);border:1px solid rgba(255,176,0,0.4);color:#FFB000;text-transform:uppercase;">Cluster (' + m.clusterInfo.activeSlaves + ')</span>' : '') +
          '</div>' : '') +
          '</div><div class="status-dot ' + (d.isOnline ? 'online' : 'offline') + '"></div></div>' +
          (d.isOnline && m ?
            '<div class="metrics-grid"><div class="metric"><div class="metric-label accent"><svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clip-rule="evenodd"/></svg>Hashrate</div><div class="metric-value accent">' + formatHashrate(m.hashRate) + '</div></div>' +
            '<div class="metric"><div class="metric-label ' + getTempClass(m.temp) + '"><svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 2a1 1 0 011 1v6.5a.5.5 0 00.5.5h.5a.5.5 0 01.5.5V12a4 4 0 11-5 0v-1.5a.5.5 0 01.5-.5h.5a.5.5 0 00.5-.5V3a1 1 0 011-1z" clip-rule="evenodd"/></svg>Temp</div><div class="metric-value ' + getTempClass(m.temp) + '">' + formatTemp(m.temp) + '</div></div>' +
            '<div class="metric"><div class="metric-label" style="color:#00CED1;"><svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clip-rule="evenodd"/></svg>Power</div><div class="metric-value">' + formatPower(m.power) + '<div style="font-size:11px;color:#8BA88B;margin-top:2px;">' + (m.isBitmain && m.chainCount ? '~' + formatAmps(m.current, m.power, m.voltage) + ' (' + m.chainCount + ' boards)' : formatAmps(m.current, m.power, m.voltage)) + '</div></div></div></div>' +
            '<div class="secondary-stats"><div class="secondary-stat"><div class="secondary-stat-label success"><svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor"><path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zm6-4a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zm6-3a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z"/></svg>Efficiency</div><div class="secondary-stat-value">' + (m.efficiency ? m.efficiency.toFixed(1) + ' J/TH' : '--') + '</div></div>' +
            '<div class="secondary-stat"><div class="secondary-stat-label success"><svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>Shares</div><div class="secondary-stat-value success">' + (m.sharesAccepted || 0).toLocaleString() + '</div></div>' +
            '<div class="secondary-stat"><div class="secondary-stat-label"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>Fan</div><div class="secondary-stat-value">' + (m.fanspeed ? m.fanspeed + '%' : '--') + '</div></div></div>' +
            (blockChance ? '<div style="padding:8px 12px;border-top:1px solid rgba(58,90,110,0.3);display:flex;align-items:center;justify-content:space-between;">' +
              '<div style="display:flex;align-items:center;gap:4px;"><svg width="12" height="12" viewBox="0 0 20 20" fill="#FF8C00"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>' +
              '<span style="font-size:10px;color:#8BA88B;">Solo Block</span></div>' +
              '<div style="text-align:right;"><span style="font-size:11px;font-family:monospace;color:#FF8C00;">' + formatTimeToBlock(blockChance.daysToBlock) + '</span>' +
              '<span style="font-size:9px;color:#8BA88B;margin-left:4px;">(' + formatOdds(blockChance.dailyOdds) + '/day)</span></div></div>' : '') +
            (displayBestDiff > 0 ? '<div style="padding:8px 12px;border-top:1px solid rgba(58,90,110,0.3);display:flex;align-items:center;justify-content:space-between;">' +
              '<div style="display:flex;align-items:center;gap:4px;">' +
              '<svg width="12" height="12" viewBox="0 0 20 20" fill="' + (isNewRecord ? '#FBBF24' : '#FFB000') + '"><path fill-rule="evenodd" d="M10 1l2.928 6.856 6.072.514-4.928 4.286 1.5 6.344L10 15.572 4.428 19l1.5-6.344L1 8.37l6.072-.514L10 1z" clip-rule="evenodd"/></svg>' +
              '<span style="font-size:10px;color:#8BA88B;">Best Diff</span>' +
              (isNewRecord ? '<span style="font-size:8px;padding:1px 4px;background:rgba(251,191,36,0.2);color:#FBBF24;border-radius:2px;text-transform:uppercase;font-weight:bold;">NEW!</span>' : '') +
              '</div>' +
              '<div style="text-align:right;"><span style="font-size:11px;font-family:monospace;color:' + (isNewRecord ? '#FBBF24' : '#FFB000') + ';">' + formatDifficulty(displayBestDiff) + '</span></div></div>' : '') +
            '<div class="device-control-bar" onclick="event.stopPropagation();"><button class="restart-btn" data-device-id="' + d.id + '" onclick="handleRestartClick(this, event)"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>Restart</button></div>'
          : '<div style="color:#8BA88B;margin-top:8px;">' + (d.isOnline ? 'Waiting for metrics...' : 'Offline') + '</div>') +
        '</div>';
      }).join('');

      document.getElementById('device-count').textContent = devices.length + ' | online: ' + onlineDevices.length;
      document.getElementById('total-hashrate').textContent = formatHashrate(totalHashrate);
      document.getElementById('total-power').textContent = formatPower(totalPower);
      document.getElementById('total-shares').textContent = totalShares.toLocaleString();

      // Calculate and display efficiency
      const efficiency = totalHashrate > 0 ? (totalPower / (totalHashrate / 1000)) : 0;
      document.getElementById('efficiency').textContent = efficiency > 0 ? efficiency.toFixed(1) + ' J/TH' : '--';

      // Update gauge bars
      const maxHashrate = Math.max(totalHashrate, 1000); // Assume at least 1 TH/s scale
      document.getElementById('hashrate-bar').style.width = Math.min((totalHashrate / maxHashrate) * 100, 100) + '%';
      document.getElementById('power-bar').style.width = Math.min((totalPower / 100) * 100, 100) + '%';
      document.getElementById('efficiency-bar').style.width = Math.max(100 - (efficiency / 50 * 100), 10) + '%';

      // Temperature with dynamic coloring
      const avgTemp = onlineCount > 0 ? tempSum / onlineCount : 0;
      const avgTempEl = document.getElementById('avg-temp');
      avgTempEl.textContent = avgTemp > 0 ? formatTemp(avgTemp) : '--';
      avgTempEl.className = 'stat-value ' + getTempClass(avgTemp);

      // Update temp bar and status
      const tempBar = document.getElementById('temp-bar');
      const tempStatus = document.getElementById('temp-status');
      const tempIconBg = document.getElementById('temp-icon-bg');
      const tempIcon = document.getElementById('temp-icon');

      tempBar.style.width = Math.min((avgTemp / 100) * 100, 100) + '%';

      if (avgTemp > 80) {
        tempBar.style.background = '#FF3131';
        tempStatus.textContent = 'CRITICAL';
        tempStatus.style.color = '#FF3131';
        tempIconBg.style.background = 'rgba(255,49,49,0.2)';
        tempIconBg.style.borderColor = 'rgba(255,49,49,0.4)';
        tempIcon.setAttribute('stroke', '#FF3131');
      } else if (avgTemp > 70) {
        tempBar.style.background = '#FF8C00';
        tempStatus.textContent = 'WARM';
        tempStatus.style.color = '#FF8C00';
        tempIconBg.style.background = 'rgba(255,140,0,0.2)';
        tempIconBg.style.borderColor = 'rgba(255,140,0,0.4)';
        tempIcon.setAttribute('stroke', '#FF8C00');
      } else {
        tempBar.style.background = '#00FF41';
        tempStatus.textContent = 'OPTIMAL';
        tempStatus.style.color = '#00FF41';
        tempIconBg.style.background = 'rgba(0,255,65,0.2)';
        tempIconBg.style.borderColor = 'rgba(0,255,65,0.4)';
        tempIcon.setAttribute('stroke', '#00FF41');
      }

      // Update Best Difficulty
      document.getElementById('best-difficulty').textContent = bestDiff > 0 ? formatDifficulty(bestDiff) : '--';

      // Update Power Cost
      const electricityCost = parseFloat(document.getElementById('electricity-cost-input')?.value || '0.10');
      const dailyKwh = (totalPower * 24) / 1000;
      const dailyPowerCost = dailyKwh * electricityCost;
      document.getElementById('power-cost').textContent = dailyPowerCost > 0 ? '$' + dailyPowerCost.toFixed(2) + '/day' : '--';
      document.getElementById('power-cost-rate').textContent = '@ $' + electricityCost.toFixed(2) + '/kWh';

      // Update Block Time
      if (networkStats && totalHashrate > 0) {
        const blockChance = calculateBlockChance(totalHashrate, networkStats.difficulty);
        if (blockChance) {
          document.getElementById('block-time').textContent = formatTimeToBlock(blockChance.daysToBlock);
          document.getElementById('daily-odds').textContent = formatOdds(blockChance.dailyOdds) + '/day';
          document.getElementById('network-difficulty').textContent = 'Diff: ' + formatDifficulty(networkStats.difficulty);
        }
      } else {
        document.getElementById('block-time').textContent = '--';
        document.getElementById('daily-odds').textContent = '--';
        document.getElementById('network-difficulty').textContent = totalHashrate > 0 ? 'Loading network stats...' : 'No active miners';
      }
    }

    function formatHashrate(h) { if (!h) return '--'; return h >= 1000 ? (h / 1000).toFixed(2) + ' TH/s' : h.toFixed(2) + ' GH/s'; }
    function formatTemp(t) { return t ? t.toFixed(1) + '°C' : '--'; }
    function formatPower(p) { return p ? p.toFixed(1) + ' W' : '--'; }
    function formatAmps(currentMa, power, voltage) {
      // AxeOS reports current in milliamps
      if (currentMa && currentMa > 0) return (currentMa / 1000).toFixed(2) + ' A';
      if (power && voltage && voltage > 0) return (power / voltage).toFixed(2) + ' A';
      return '--';
    }
    function formatUptime(s) { if (!s) return '--'; const d = Math.floor(s/86400), h = Math.floor((s%86400)/3600), m = Math.floor((s%3600)/60); return d > 0 ? d+'d '+h+'h' : h > 0 ? h+'h '+m+'m' : m+'m'; }
    function getTempClass(t) { if (!t) return ''; return t > 80 ? 'danger' : t > 70 ? 'warning' : 'success'; }

    function calculateBlockChance(hashRateGH, difficulty) {
      if (!hashRateGH || !difficulty || hashRateGH <= 0 || difficulty <= 0) return null;
      const networkHashrateHs = (difficulty * Math.pow(2, 32)) / 600;
      const ourHashrateHs = hashRateGH * 1e9;
      const probPerBlock = ourHashrateHs / networkHashrateHs;
      const blocksPerDay = 144;
      const daysToBlock = 1 / (probPerBlock * blocksPerDay);
      const dailyOdds = 1 - Math.pow(1 - probPerBlock, blocksPerDay);
      return { daysToBlock, dailyOdds };
    }

    function formatTimeToBlock(days) {
      if (days < 1) return Math.round(days * 24) + ' hrs';
      if (days < 30) return Math.round(days) + ' days';
      if (days < 365) return (days / 30).toFixed(1) + ' mos';
      if (days < 3650) return (days / 365).toFixed(1) + ' yrs';
      var years = days / 365;
      if (years < 1e6) return (years / 1000).toFixed(0) + 'k yrs';
      return (years / 1e6).toFixed(1) + 'M yrs';
    }

    function formatOdds(prob) {
      var pct = prob * 100;
      if (pct >= 1) return pct.toFixed(2) + '%';
      if (pct >= 0.01) return pct.toFixed(4) + '%';
      if (pct >= 0.0001) return pct.toFixed(6) + '%';
      if (pct >= 0.000001) return pct.toFixed(8) + '%';
      return pct.toFixed(10) + '%';
    }

    function formatDifficulty(diff) {
      if (!diff) return '--';
      if (diff >= 1e12) return (diff / 1e12).toFixed(2) + 'T';
      if (diff >= 1e9) return (diff / 1e9).toFixed(2) + 'B';
      if (diff >= 1e6) return (diff / 1e6).toFixed(2) + 'M';
      if (diff >= 1e3) return (diff / 1e3).toFixed(2) + 'K';
      return diff.toLocaleString();
    }

    // Parse difficulty from various formats - handles both raw numbers and formatted strings like "56.4M"
    function parseDifficulty(value) {
      if (typeof value === 'number' && !isNaN(value)) return value;
      if (typeof value === 'string') {
        var match = value.match(/^([\\d.]+)\\s*([KMGBT])?$/i);
        if (match) {
          var num = parseFloat(match[1]);
          var suffix = match[2] ? match[2].toUpperCase() : null;
          var multipliers = { K: 1e3, M: 1e6, G: 1e9, B: 1e9, T: 1e12 };
          return num * (multipliers[suffix] || 1);
        }
        var parsed = parseFloat(value);
        if (!isNaN(parsed)) return parsed;
      }
      return 0;
    }

    // ============ DEVICE CONTROL ============
    const restartConfirmState = new Map();

    async function handleRestartClick(btn, event) {
      event.stopPropagation();
      const deviceId = btn.dataset.deviceId;

      // Check if waiting for confirmation
      if (restartConfirmState.get(deviceId)) {
        // Second click - perform restart
        restartConfirmState.delete(deviceId);
        btn.classList.remove('confirm');
        btn.classList.add('restarting');
        btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" opacity="0.25"/><path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" fill="currentColor"/></svg>Restarting...';

        try {
          const response = await fetch('/api/devices/' + deviceId + '/restart', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + token }
          });
          const result = await response.json();

          if (result.success) {
            btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 13l4 4L19 7"/></svg>Sent!';
            setTimeout(() => {
              btn.classList.remove('restarting');
              btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>Restart';
            }, 2000);
          } else {
            btn.classList.remove('restarting');
            btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>Restart';
            alert('Restart failed: ' + (result.error || 'Unknown error'));
          }
        } catch (err) {
          btn.classList.remove('restarting');
          btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>Restart';
          alert('Restart error: ' + err.message);
        }
      } else {
        // First click - show confirmation
        restartConfirmState.set(deviceId, true);
        btn.classList.add('confirm');
        btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>Confirm?';

        // Auto-reset after 3 seconds
        setTimeout(() => {
          if (restartConfirmState.get(deviceId)) {
            restartConfirmState.delete(deviceId);
            btn.classList.remove('confirm');
            btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>Restart';
          }
        }, 3000);
      }
    }

    function toggleControlPanel() {
      const panel = document.getElementById('control-panel');
      const chevron = document.getElementById('control-chevron');
      if (panel.style.display === 'none') {
        panel.style.display = 'block';
        chevron.style.transform = 'rotate(180deg)';
      } else {
        panel.style.display = 'none';
        chevron.style.transform = 'rotate(0deg)';
      }
    }

    function showControlStatus(message, isError) {
      const status = document.getElementById('control-status');
      status.style.display = 'block';
      status.style.background = isError ? 'rgba(255,49,49,0.2)' : 'rgba(0,255,65,0.2)';
      status.style.border = '1px solid ' + (isError ? 'rgba(255,49,49,0.4)' : 'rgba(0,255,65,0.4)');
      status.style.color = isError ? '#FF3131' : '#00FF41';
      status.textContent = message;
      setTimeout(() => { status.style.display = 'none'; }, 3000);
    }

    async function applyFanSpeed() {
      const speed = parseInt(document.getElementById('fan-slider').value);
      try {
        const res = await fetch('/api/devices/' + currentDeviceId + '/fan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify({ speed })
        });
        const data = await res.json();
        if (data.success) {
          showControlStatus('Fan speed updated to ' + speed + '%', false);
        } else {
          showControlStatus('Failed: ' + (data.error || 'Unknown error'), true);
        }
      } catch (err) {
        showControlStatus('Error: ' + err.message, true);
      }
    }

    async function applyFrequency() {
      const frequency = parseInt(document.getElementById('freq-slider').value);
      try {
        const res = await fetch('/api/devices/' + currentDeviceId + '/frequency', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify({ frequency })
        });
        const data = await res.json();
        if (data.success) {
          showControlStatus('Frequency updated to ' + frequency + ' MHz', false);
        } else {
          showControlStatus('Failed: ' + (data.error || 'Unknown error'), true);
        }
      } catch (err) {
        showControlStatus('Error: ' + err.message, true);
      }
    }

    async function applyVoltage() {
      const voltage = parseInt(document.getElementById('voltage-slider').value);
      try {
        const res = await fetch('/api/devices/' + currentDeviceId + '/voltage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify({ voltage })
        });
        const data = await res.json();
        if (data.success) {
          showControlStatus('Core voltage updated to ' + voltage + ' mV', false);
        } else {
          showControlStatus('Failed: ' + (data.error || 'Unknown error'), true);
        }
      } catch (err) {
        showControlStatus('Error: ' + err.message, true);
      }
    }

    // ============ DEVICE MANAGEMENT ============
    let currentDeviceId = null;

    function openAddDeviceModal() {
      document.getElementById('add-device-ip').value = '';
      document.getElementById('add-device-name').value = '';
      document.getElementById('add-device-error').classList.add('hidden');
      document.getElementById('add-device-testing').classList.add('hidden');
      document.getElementById('add-device-btn').disabled = false;
      document.getElementById('add-device-modal').classList.remove('hidden');
    }

    function closeAddDeviceModal() {
      const modal = document.getElementById('add-device-modal');
      modal.classList.add('closing');
      setTimeout(() => {
        modal.classList.add('hidden');
        modal.classList.remove('closing');
      }, 250);
    }

    async function addDevice() {
      const ipInput = document.getElementById('add-device-ip');
      const nameInput = document.getElementById('add-device-name');
      const errorEl = document.getElementById('add-device-error');
      const testingEl = document.getElementById('add-device-testing');
      const addBtn = document.getElementById('add-device-btn');

      const ip = ipInput.value.trim();
      const name = nameInput.value.trim();

      if (!ip) {
        errorEl.textContent = 'IP address is required';
        errorEl.classList.remove('hidden');
        return;
      }

      // Show testing state
      errorEl.classList.add('hidden');
      testingEl.classList.remove('hidden');
      addBtn.disabled = true;

      try {
        // Test connection first
        const testRes = await fetch('/api/devices/test', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
          },
          body: JSON.stringify({ ipAddress: ip })
        });
        const testData = await testRes.json();

        if (!testData.success) {
          throw new Error(testData.error || 'Could not connect to device');
        }

        // Add the device
        const addRes = await fetch('/api/devices', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
          },
          body: JSON.stringify({
            ipAddress: ip,
            name: name || testData.data?.hostname || ip
          })
        });
        const addData = await addRes.json();

        if (addData.error) {
          throw new Error(addData.error);
        }

        // Success - close modal and refresh
        closeAddDeviceModal();
        await fetchDevices();

      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.classList.remove('hidden');
      } finally {
        testingEl.classList.add('hidden');
        addBtn.disabled = false;
      }
    }

    function openEditDeviceModal() {
      if (!currentDeviceId) return;

      const device = devices.find(d => d.id === currentDeviceId);
      if (!device) return;

      document.getElementById('edit-device-name').value = device.name;
      document.getElementById('edit-device-ip').value = device.ipAddress;
      document.getElementById('edit-device-error').classList.add('hidden');

      closeModal();
      document.getElementById('edit-device-modal').classList.remove('hidden');
    }

    function closeEditDeviceModal() {
      const modal = document.getElementById('edit-device-modal');
      modal.classList.add('closing');
      setTimeout(() => {
        modal.classList.add('hidden');
        modal.classList.remove('closing');
      }, 250);
    }

    async function saveDeviceChanges() {
      if (!currentDeviceId) return;

      const nameInput = document.getElementById('edit-device-name');
      const ipInput = document.getElementById('edit-device-ip');
      const errorEl = document.getElementById('edit-device-error');

      const name = nameInput.value.trim();
      const ip = ipInput.value.trim();

      if (!name || !ip) {
        errorEl.textContent = 'Name and IP address are required';
        errorEl.classList.remove('hidden');
        return;
      }

      try {
        const res = await fetch('/api/devices/' + currentDeviceId, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
          },
          body: JSON.stringify({ name, ipAddress: ip })
        });

        if (!res.ok) {
          throw new Error('Failed to update device');
        }

        closeEditDeviceModal();
        await fetchDevices();

      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.classList.remove('hidden');
      }
    }

    function confirmDeleteDevice() {
      if (!currentDeviceId) return;

      const device = devices.find(d => d.id === currentDeviceId);
      if (!device) return;

      document.getElementById('delete-device-name').textContent = device.name;
      closeModal();
      document.getElementById('confirm-delete-modal').classList.remove('hidden');
    }

    function closeConfirmDeleteModal() {
      const modal = document.getElementById('confirm-delete-modal');
      modal.classList.add('closing');
      setTimeout(() => {
        modal.classList.add('hidden');
        modal.classList.remove('closing');
      }, 250);
    }

    async function deleteDevice() {
      if (!currentDeviceId) return;

      try {
        const res = await fetch('/api/devices/' + currentDeviceId, {
          method: 'DELETE',
          headers: {
            'Authorization': 'Bearer ' + token
          }
        });

        if (!res.ok) {
          throw new Error('Failed to delete device');
        }

        currentDeviceId = null;
        closeConfirmDeleteModal();
        await fetchDevices();

      } catch (err) {
        alert('Failed to delete device: ' + err.message);
      }
    }

    // Matrix SHA256 hash rain animation - subtle version
    const canvas = document.getElementById('network-canvas');
    const ctx = canvas.getContext('2d');
    let columns = [];
    let animationId = null;
    let frameCount = 0;
    const fontSize = 12;
    const hexChars = '0123456789abcdef';

    // Get theme accent color from CSS (read from body where theme class is applied)
    function getAccentColor() {
      const style = getComputedStyle(document.body);
      return style.getPropertyValue('--color-accent').trim() || '#FFB000';
    }

    // Convert hex color to RGB
    function hexToRgb(hex) {
      const result = /^#?([a-f\\d]{2})([a-f\\d]{2})([a-f\\d]{2})$/i.exec(hex);
      return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
      } : { r: 255, g: 176, b: 0 };
    }

    function resizeCanvas() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      initColumns();
    }

    function initColumns() {
      // Fewer columns - only every 3rd position
      const columnCount = Math.ceil(canvas.width / (fontSize * 3));
      columns = [];
      for (let i = 0; i < columnCount; i++) {
        columns.push({
          x: i * fontSize * 3 + Math.random() * fontSize,
          y: Math.random() * canvas.height,
          speed: 0.15 + Math.random() * 0.25,
          chars: generateHashSegment(),
          charIndex: 0,
          maxBrightness: 0.08 + Math.random() * 0.12
        });
      }
    }

    // Generate a segment that looks like part of a SHA256 hash
    function generateHashSegment() {
      let segment = '';
      const length = 12 + Math.floor(Math.random() * 20);
      for (let i = 0; i < length; i++) {
        segment += hexChars[Math.floor(Math.random() * 16)];
      }
      return segment;
    }

    function drawMatrix() {
      frameCount++;
      // Only update every 3rd frame for slower animation
      if (frameCount % 3 !== 0) {
        animationId = requestAnimationFrame(drawMatrix);
        return;
      }

      // Clear canvas completely each frame - no trail effect
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const accentHex = getAccentColor();
      const rgb = hexToRgb(accentHex);

      ctx.font = fontSize + 'px "Share Tech Mono", monospace';

      columns.forEach((col) => {
        // Draw a few characters in a column with fading opacity
        for (let j = 0; j < 6; j++) {
          const charY = col.y - j * fontSize;
          if (charY < -fontSize || charY > canvas.height + fontSize) continue;

          const char = col.chars[(col.charIndex - j + col.chars.length) % col.chars.length];
          const alpha = col.maxBrightness * (1 - j / 6);

          if (j === 0) {
            // Leading character with subtle glow
            ctx.shadowColor = accentHex;
            ctx.shadowBlur = 3;
          }

          ctx.fillStyle = 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',' + alpha + ')';
          ctx.fillText(char, col.x, charY);

          if (j === 0) {
            ctx.shadowBlur = 0;
          }
        }

        // Move column down slowly
        col.y += col.speed * fontSize;
        col.charIndex++;

        // Reset when off screen
        if (col.y > canvas.height + fontSize * 6) {
          col.y = -fontSize * 2;
          col.chars = generateHashSegment();
          col.charIndex = 0;
          col.speed = 0.15 + Math.random() * 0.25;
          col.maxBrightness = 0.08 + Math.random() * 0.12;
        }

        // Rarely change characters
        if (Math.random() < 0.005) {
          const idx = Math.floor(Math.random() * col.chars.length);
          col.chars = col.chars.substring(0, idx) + hexChars[Math.floor(Math.random() * 16)] + col.chars.substring(idx + 1);
        }
      });

      animationId = requestAnimationFrame(drawMatrix);
    }

    function startNetwork() {
      if (animationId) return;
      resizeCanvas();
      // Clear canvas first with solid background
      ctx.fillStyle = '#0a1929';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      frameCount = 0;
      drawMatrix();
    }

    function stopNetwork() {
      if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }

    function toggleBackground() {
      const isEnabled = document.body.classList.toggle('animated-bg');
      localStorage.setItem('animatedBg', isEnabled ? '1' : '0');
      const btn = document.getElementById('bg-toggle');
      if (isEnabled) {
        btn.classList.remove('btn-secondary');
        btn.classList.add('btn-primary');
        startNetwork();
      } else {
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-secondary');
        stopNetwork();
      }
    }

    // Initialize background preference
    function initBackground() {
      const saved = localStorage.getItem('animatedBg');
      if (saved === '1') {
        document.body.classList.add('animated-bg');
        const btn = document.getElementById('bg-toggle');
        if (btn) {
          btn.classList.remove('btn-secondary');
          btn.classList.add('btn-primary');
        }
        startNetwork();
      }
    }

    window.addEventListener('resize', () => {
      if (document.body.classList.contains('animated-bg')) {
        resizeCanvas();
        createNodes();
      }
    });

    // ============ CRYPTO TICKER ============
    let cryptoCoins = [];
    let cryptoCurrencies = [];
    let selectedCoin = { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin' };
    let selectedCurrency = { code: 'usd', symbol: '$', name: 'US Dollar' };
    let priceHistory = [];
    let coinDropdownOpen = false;
    let currencyDropdownOpen = false;

    async function initCryptoTicker() {
      try {
        // Fetch coins and currencies
        const [coinsRes, currenciesRes] = await Promise.all([
          fetch('/api/crypto/coins'),
          fetch('/api/crypto/currencies')
        ]);
        const coinsData = await coinsRes.json();
        const currenciesData = await currenciesRes.json();

        cryptoCoins = coinsData.coins || [];
        cryptoCurrencies = currenciesData.currencies || [];

        // Load saved preferences
        const savedCoin = localStorage.getItem('ticker_coin');
        const savedCurrency = localStorage.getItem('ticker_currency');

        if (savedCoin) {
          const coin = cryptoCoins.find(c => c.id === savedCoin);
          if (coin) selectedCoin = coin;
        }
        if (savedCurrency) {
          const currency = cryptoCurrencies.find(c => c.code === savedCurrency);
          if (currency) selectedCurrency = currency;
        }

        // Render dropdowns
        renderCoinDropdown();
        renderCurrencyDropdown();
        updateSelectedDisplay();

        // Fetch initial data
        await fetchCryptoPrice();
        await fetchCryptoHistory();

        // Start intervals
        setInterval(fetchCryptoPrice, 30000);
        setInterval(fetchCryptoHistory, 300000);
      } catch (err) {
        console.error('Failed to init crypto ticker:', err);
      }
    }

    function renderCoinDropdown() {
      const dropdown = document.getElementById('coin-dropdown');
      dropdown.innerHTML = cryptoCoins.map(coin =>
        '<button class="' + (coin.id === selectedCoin.id ? 'active' : '') + '" onclick="selectCoin(\\'' + coin.id + '\\')">' +
        coin.symbol + ' <span style="color:#8BA88B;font-size:9px;">- ' + coin.name + '</span></button>'
      ).join('');
    }

    function renderCurrencyDropdown() {
      const dropdown = document.getElementById('currency-dropdown');
      dropdown.innerHTML = cryptoCurrencies.map(currency =>
        '<button class="' + (currency.code === selectedCurrency.code ? 'active' : '') + '" onclick="selectCurrency(\\'' + currency.code + '\\')">' +
        currency.symbol + ' ' + currency.code.toUpperCase() + '</button>'
      ).join('');
    }

    function updateSelectedDisplay() {
      document.getElementById('selected-coin').textContent = selectedCoin.symbol;
      document.getElementById('selected-currency').textContent = selectedCurrency.code.toUpperCase();
    }

    function showDropdownOverlay() {
      let overlay = document.getElementById('dropdown-overlay');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'dropdown-overlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:99;background:rgba(0,0,0,0.3);';
        overlay.onclick = closeAllDropdowns;
        document.body.appendChild(overlay);
      }
      overlay.classList.remove('hidden');
    }

    function hideDropdownOverlay() {
      const overlay = document.getElementById('dropdown-overlay');
      if (overlay) overlay.classList.add('hidden');
    }

    function closeAllDropdowns() {
      coinDropdownOpen = false;
      currencyDropdownOpen = false;
      document.getElementById('coin-dropdown').classList.add('hidden');
      document.getElementById('currency-dropdown').classList.add('hidden');
      hideDropdownOverlay();
    }

    function toggleCoinDropdown() {
      if (coinDropdownOpen) {
        closeAllDropdowns();
      } else {
        coinDropdownOpen = true;
        currencyDropdownOpen = false;
        document.getElementById('coin-dropdown').classList.remove('hidden');
        document.getElementById('currency-dropdown').classList.add('hidden');
        showDropdownOverlay();
      }
    }

    function toggleCurrencyDropdown() {
      if (currencyDropdownOpen) {
        closeAllDropdowns();
      } else {
        currencyDropdownOpen = true;
        coinDropdownOpen = false;
        document.getElementById('currency-dropdown').classList.remove('hidden');
        document.getElementById('coin-dropdown').classList.add('hidden');
        showDropdownOverlay();
      }
    }

    function selectCoin(coinId) {
      const coin = cryptoCoins.find(c => c.id === coinId);
      if (coin) {
        selectedCoin = coin;
        localStorage.setItem('ticker_coin', coin.id);
        updateSelectedDisplay();
        renderCoinDropdown();
        fetchCryptoPrice();
        fetchCryptoHistory();
        // Update profitability calculator with new coin
        updateProfitCoinDisplay();
        calculateProfitability();
      }
      closeAllDropdowns();
    }

    function selectCurrency(currencyCode) {
      const currency = cryptoCurrencies.find(c => c.code === currencyCode);
      if (currency) {
        selectedCurrency = currency;
        localStorage.setItem('ticker_currency', currency.code);
        updateSelectedDisplay();
        renderCurrencyDropdown();
        fetchCryptoPrice();
        fetchCryptoHistory();
        // Update profitability calculator with new currency
        updateProfitCoinDisplay();
        calculateProfitability();
      }
      closeAllDropdowns();
    }

    async function fetchCryptoPrice() {
      try {
        const res = await fetch('/api/crypto/price/' + selectedCoin.id + '?currency=' + selectedCurrency.code);
        const data = await res.json();

        if (data.price) {
          const price = data.price.price;
          const change = data.price.change_24h || 0;

          // Format price
          const noDecimals = ['jpy', 'cny'].includes(selectedCurrency.code);
          const decimals = noDecimals ? 0 : (price < 1 ? 4 : price < 100 ? 2 : 0);
          const formattedPrice = new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: selectedCurrency.code.toUpperCase(),
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
          }).format(price);

          document.getElementById('ticker-price').textContent = formattedPrice;

          // Format change
          const isPositive = change >= 0;
          const changeEl = document.getElementById('ticker-change');
          const changeValueEl = document.getElementById('ticker-change-value');

          changeEl.className = 'ticker-change ' + (isPositive ? 'positive' : 'negative');
          changeValueEl.innerHTML = (isPositive ? '&#9650; +' : '&#9660; ') + change.toFixed(2) + '%';
        }
      } catch (err) {
        console.error('Failed to fetch crypto price:', err);
      }
    }

    async function fetchCryptoHistory() {
      try {
        const res = await fetch('/api/crypto/history/' + selectedCoin.id + '?currency=' + selectedCurrency.code + '&days=7');
        const data = await res.json();

        if (data.history && data.history.length > 0) {
          priceHistory = data.history;
          drawSparkline();
        }
      } catch (err) {
        console.error('Failed to fetch crypto history:', err);
      }
    }

    function drawSparkline() {
      const canvas = document.getElementById('sparkline-canvas');
      const ctx = canvas.getContext('2d');
      const container = document.getElementById('ticker-sparkline');

      // Set canvas size
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.height + 'px';
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

      if (priceHistory.length < 2) return;

      // Get price values
      const prices = priceHistory.map(p => p.price);
      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);
      const priceRange = maxPrice - minPrice || 1;

      // Determine color based on trend
      const isPositive = prices[prices.length - 1] >= prices[0];
      const lineColor = isPositive ? '#00FF41' : '#FF3131';

      // Clear canvas
      ctx.clearRect(0, 0, rect.width, rect.height);

      // Draw line
      ctx.beginPath();
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 1.5;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      const padding = 2;
      const drawWidth = rect.width - padding * 2;
      const drawHeight = rect.height - padding * 2;

      priceHistory.forEach((point, i) => {
        const x = padding + (i / (priceHistory.length - 1)) * drawWidth;
        const y = padding + drawHeight - ((point.price - minPrice) / priceRange) * drawHeight;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });

      ctx.stroke();

      // Draw gradient fill
      ctx.lineTo(padding + drawWidth, padding + drawHeight);
      ctx.lineTo(padding, padding + drawHeight);
      ctx.closePath();

      const gradient = ctx.createLinearGradient(0, 0, 0, rect.height);
      gradient.addColorStop(0, isPositive ? 'rgba(0,255,65,0.2)' : 'rgba(255,49,49,0.2)');
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gradient;
      ctx.fill();
    }

    // Close dropdowns when clicking outside
    document.addEventListener('click', function(e) {
      if (!e.target.closest('#coin-selector') && !e.target.closest('#coin-dropdown')) {
        coinDropdownOpen = false;
        document.getElementById('coin-dropdown').classList.add('hidden');
      }
      if (!e.target.closest('#currency-selector') && !e.target.closest('#currency-dropdown')) {
        currencyDropdownOpen = false;
        document.getElementById('currency-dropdown').classList.add('hidden');
      }
    });

    // Redraw sparkline on resize
    window.addEventListener('resize', function() {
      if (priceHistory.length > 0) drawSparkline();
    });

    // ============ PROFITABILITY CALCULATOR ============
    let profitabilityExpanded = false;
    let networkStats = null;
    let electricityCost = 0.12;
    let currentBtcPrice = 0;

    function toggleProfitDetails() {
      profitabilityExpanded = !profitabilityExpanded;
      const details = document.getElementById('profit-details');
      const toggleBtn = document.getElementById('profit-toggle-btn');

      if (profitabilityExpanded) {
        details.classList.add('show');
        toggleBtn.classList.add('expanded');
      } else {
        details.classList.remove('show');
        toggleBtn.classList.remove('expanded');
      }
    }

    async function initProfitability() {
      try {
        // Fetch electricity cost
        const costRes = await fetch('/api/profitability/electricity-cost');
        const costData = await costRes.json();
        if (costData.cost) {
          electricityCost = costData.cost;
          document.getElementById('electricity-cost-input').value = electricityCost;
        }

        // Update coin display based on ticker selection
        updateProfitCoinDisplay();

        // Fetch network stats
        await fetchNetworkStats();

        // Calculate initial profitability after devices are loaded
        setTimeout(calculateProfitability, 2000);

        // Set intervals for updates
        setInterval(fetchNetworkStats, 300000); // Every 5 minutes
        setInterval(calculateProfitability, 60000); // Every minute
      } catch (err) {
        console.error('Failed to init profitability:', err);
      }
    }

    async function fetchNetworkStats() {
      try {
        const res = await fetch('/api/profitability/network-stats');
        const data = await res.json();

        if (data.stats) {
          networkStats = data.stats;

          // Update UI
          const diffTrillion = networkStats.difficulty / 1e12;
          document.getElementById('profit-difficulty').textContent = diffTrillion.toFixed(2) + 'T';
          document.getElementById('profit-block-reward').textContent = networkStats.blockReward.toFixed(4);
        }
      } catch (err) {
        console.error('Failed to fetch network stats:', err);
      }
    }

    async function saveElectricityCost() {
      const input = document.getElementById('electricity-cost-input');
      const cost = parseFloat(input.value);

      if (!isNaN(cost) && cost >= 0) {
        electricityCost = cost;

        try {
          await fetch('/api/profitability/electricity-cost', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({ cost })
          });
        } catch (err) {
          console.error('Failed to save electricity cost:', err);
        }

        // Recalculate
        calculateProfitability();
      }
    }

    function updateProfitCoinDisplay() {
      // Update the coin symbol in the header
      const symbolEl = document.getElementById('profit-coin-symbol');
      if (symbolEl) symbolEl.textContent = selectedCoin.symbol;

      // Update the coin name in settings
      const nameEl = document.getElementById('profit-coin-name');
      if (nameEl) nameEl.textContent = selectedCoin.name;

      // Update currency label
      const currencyLabelEl = document.getElementById('profit-currency-label');
      if (currencyLabelEl) currencyLabelEl.textContent = selectedCurrency.code.toUpperCase();

      // Show note if non-BTC coin selected (profitability uses BTC network stats)
      const btcNoteEl = document.getElementById('profit-btc-only-note');
      if (btcNoteEl) {
        if (selectedCoin.id !== 'bitcoin') {
          btcNoteEl.classList.remove('hidden');
        } else {
          btcNoteEl.classList.add('hidden');
        }
      }
    }

    async function calculateProfitability() {
      // Need devices data, network stats, and crypto price
      if (!networkStats) return;

      // Get crypto price from ticker using selected coin/currency
      try {
        const priceRes = await fetch('/api/crypto/price/' + selectedCoin.id + '?currency=' + selectedCurrency.code);
        const priceData = await priceRes.json();
        if (priceData.price) {
          currentBtcPrice = priceData.price.price;
        }
      } catch (err) {
        console.error('Failed to fetch crypto price for profitability:', err);
      }

      if (!currentBtcPrice) return;

      // Calculate total hashrate and power from devices
      let totalHashrateGH = 0;
      let totalPowerWatts = 0;

      devices.forEach(d => {
        if (d.isOnline && d.latestMetrics) {
          totalHashrateGH += d.latestMetrics.hashRate || 0;
          totalPowerWatts += d.latestMetrics.power || 0;
        }
      });

      if (totalHashrateGH === 0) {
        // No online devices with metrics
        document.getElementById('profit-daily-sats').textContent = '-- sats';
        document.getElementById('profit-daily-net').textContent = '--';
        return;
      }

      // Call profitability API
      try {
        const res = await fetch('/api/profitability/calculate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            hashrateGH: totalHashrateGH,
            powerWatts: totalPowerWatts,
            btcPriceUsd: currentBtcPrice,
            electricityCost: electricityCost
          })
        });

        const data = await res.json();

        if (data.result) {
          updateProfitabilityUI(data.result);
        }
      } catch (err) {
        console.error('Failed to calculate profitability:', err);
      }
    }

    function updateProfitabilityUI(result) {
      // Format numbers using selected currency
      const formatBtc = (btc) => (btc * 100000000).toFixed(0) + ' sats';
      const formatCurrency = (value) => {
        const noDecimals = ['jpy', 'cny'].includes(selectedCurrency.code);
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: selectedCurrency.code.toUpperCase(),
          minimumFractionDigits: noDecimals ? 0 : 2,
          maximumFractionDigits: noDecimals ? 0 : 2
        }).format(Math.abs(value));
      };
      const formatNet = (net) => {
        const sign = net >= 0 ? '+' : '-';
        return sign + formatCurrency(net);
      };

      // Update coin price display
      const priceEl = document.getElementById('profit-coin-price');
      if (priceEl && currentBtcPrice) {
        priceEl.textContent = formatCurrency(currentBtcPrice);
      }

      // Update summary
      document.getElementById('profit-daily-sats').textContent = formatBtc(result.dailyBtc);
      const dailyNetEl = document.getElementById('profit-daily-net');
      dailyNetEl.textContent = formatNet(result.dailyProfit);
      dailyNetEl.className = 'profit-value ' + (result.dailyProfit >= 0 ? 'positive' : 'negative');

      // Update earnings section
      document.getElementById('profit-earn-daily').textContent = formatCurrency(result.dailyUsd) + ' (' + formatBtc(result.dailyBtc) + ')';
      document.getElementById('profit-earn-weekly').textContent = formatCurrency(result.weeklyUsd);
      document.getElementById('profit-earn-monthly').textContent = formatCurrency(result.monthlyUsd);
      document.getElementById('profit-earn-yearly').textContent = formatCurrency(result.yearlyUsd);

      // Update power costs section
      document.getElementById('profit-power-daily').textContent = '-' + formatCurrency(result.dailyPowerCost);
      document.getElementById('profit-power-weekly').textContent = '-' + formatCurrency(result.weeklyPowerCost);
      document.getElementById('profit-power-monthly').textContent = '-' + formatCurrency(result.monthlyPowerCost);
      document.getElementById('profit-power-yearly').textContent = '-' + formatCurrency(result.yearlyPowerCost);

      // Update net profit section with colors
      const updateNetProfit = (id, value) => {
        const el = document.getElementById(id);
        el.textContent = formatNet(value);
        el.style.color = value >= 0 ? '#00FF41' : '#FF3131';
      };

      updateNetProfit('profit-net-daily', result.dailyProfit);
      updateNetProfit('profit-net-weekly', result.weeklyProfit);
      updateNetProfit('profit-net-monthly', result.monthlyProfit);
      updateNetProfit('profit-net-yearly', result.yearlyProfit);
    }

    init();
    initBackground();
    initCryptoTicker();
    initProfitability();

    // ============ CHARTS FUNCTIONALITY ============
    // Generate theme-aware chart colors based on current accent
    function getChartColors() {
      const style = getComputedStyle(document.body);
      const accent = style.getPropertyValue('--color-accent').trim() || '#FFB000';
      const success = style.getPropertyValue('--color-success').trim() || '#00FF41';
      const danger = style.getPropertyValue('--color-danger').trim() || '#FF3131';

      // Generate complementary colors based on theme
      return [
        accent,           // Primary accent color
        success,          // Success color
        danger,           // Danger color
        '#4A90D9',        // Blue
        '#00CED1',        // Cyan
        '#9370DB',        // Purple
        '#FF6B6B',        // Coral
        '#87CEEB',        // Light blue
        '#C4A35A',        // Tan
        '#B22222'         // Dark red
      ];
    }

    function getChartThemeColors() {
      const style = getComputedStyle(document.body);
      return {
        accent: style.getPropertyValue('--color-accent').trim() || '#FFB000',
        text: style.getPropertyValue('--color-text-secondary').trim() || '#8BA88B',
        textPrimary: style.getPropertyValue('--color-text-primary').trim() || '#E8F4E8',
        border: style.getPropertyValue('--color-border').trim() || '#1a4a5c',
        bgSecondary: style.getPropertyValue('--color-bg-secondary').trim() || '#0d2137',
        danger: style.getPropertyValue('--color-danger').trim() || '#FF3131'
      };
    }

    let performanceChart = null;
    let chartMetric = 'hashrate';
    let chartTimeRange = '24h';
    let selectedChartDevices = [];
    let chartDeviceData = {};

    function showPage(page) {
      const dashboardSection = document.getElementById('dashboard-section');
      const chartsSection = document.getElementById('charts-section');
      const navDashboard = document.getElementById('nav-dashboard');
      const navCharts = document.getElementById('nav-charts');

      if (page === 'dashboard') {
        dashboardSection.classList.remove('hidden');
        dashboardSection.style.display = 'block';
        chartsSection.classList.remove('active');
        navDashboard.classList.add('active');
        navCharts.classList.remove('active');
      } else if (page === 'charts') {
        dashboardSection.classList.add('hidden');
        dashboardSection.style.display = 'none';
        chartsSection.classList.add('active');
        navDashboard.classList.remove('active');
        navCharts.classList.add('active');
        initCharts();
      }
    }

    function initCharts() {
      renderDeviceSelector();
      if (selectedChartDevices.length === 0 && devices.length > 0) {
        // Auto-select first 3 online devices
        const onlineDevices = devices.filter(d => d.isOnline).slice(0, 3);
        selectedChartDevices = onlineDevices.map(d => d.id);
        renderDeviceSelector();
      }
      fetchChartData();
    }

    function renderDeviceSelector() {
      const container = document.getElementById('chart-device-selector');
      if (!container) return;

      const chartColors = getChartColors();
      const themeColors = getChartThemeColors();
      container.innerHTML = devices.map((d, i) => {
        const isSelected = selectedChartDevices.includes(d.id);
        const colorIndex = selectedChartDevices.indexOf(d.id);
        const color = colorIndex >= 0 ? chartColors[colorIndex % chartColors.length] : themeColors.border;
        return '<button class="device-chip ' + (isSelected ? 'selected' : '') + '" ' +
          'style="border-color: ' + color + '; ' + (isSelected ? 'background: ' + color + '20; color: ' + color + ';' : '') + '" ' +
          'onclick="toggleChartDevice(' + "'" + d.id + "'" + ')">' +
          '<span class="status-dot" style="background: ' + (d.isOnline ? '#00FF41' : '#8BA88B') + ';"></span>' +
          d.name + '</button>';
      }).join('');
    }

    function toggleChartDevice(deviceId) {
      const index = selectedChartDevices.indexOf(deviceId);
      if (index >= 0) {
        selectedChartDevices.splice(index, 1);
      } else {
        selectedChartDevices.push(deviceId);
      }
      renderDeviceSelector();
      fetchChartData();
    }

    function setChartMetric(metric) {
      chartMetric = metric;
      document.querySelectorAll('[id^="metric-"]').forEach(btn => btn.classList.remove('active'));
      document.getElementById('metric-' + metric).classList.add('active');
      updateChart();
    }

    function setChartTimeRange(range) {
      chartTimeRange = range;
      document.querySelectorAll('[id^="range-"]').forEach(btn => btn.classList.remove('active'));
      document.getElementById('range-' + range).classList.add('active');
      fetchChartData();
    }

    async function fetchChartData() {
      if (selectedChartDevices.length === 0) {
        chartDeviceData = {};
        updateChart();
        return;
      }

      const hours = { '1h': 1, '6h': 6, '24h': 24, '7d': 168, '30d': 720 }[chartTimeRange] || 24;
      const startTime = Date.now() - hours * 60 * 60 * 1000;
      const limit = chartTimeRange === '30d' ? 2000 : chartTimeRange === '7d' ? 1000 : 500;

      chartDeviceData = {};

      for (const deviceId of selectedChartDevices) {
        try {
          const url = '/api/devices/' + deviceId + '/metrics?startTime=' + startTime + '&limit=' + limit;
          // Read token fresh from localStorage every time
          const chartToken = localStorage.getItem('token');
          const res = await fetch(url, { headers: { 'Authorization': 'Bearer ' + chartToken } });
          const data = await res.json();
          const device = devices.find(d => d.id === deviceId);
          chartDeviceData[deviceId] = {
            name: device ? device.name : 'Unknown',
            metrics: data.metrics || []
          };
        } catch (err) {
          console.error('Failed to fetch metrics for device', deviceId, err);
        }
      }

      updateChart();
    }

    function updateChart() {
      const canvas = document.getElementById('performance-chart');
      if (!canvas) {
        console.error('Chart canvas not found');
        return;
      }

      const ctx = canvas.getContext('2d');

      // Destroy existing chart
      if (performanceChart) {
        performanceChart.destroy();
        performanceChart = null;
      }

      const chartColors = getChartColors();
      const themeColors = getChartThemeColors();

      if (selectedChartDevices.length === 0 || Object.keys(chartDeviceData).length === 0) {
        // Clear and show empty state
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = themeColors.text;
        ctx.font = '14px Share Tech Mono';
        ctx.textAlign = 'center';
        ctx.fillText('Select devices to view charts', canvas.width / 2, canvas.height / 2);
        updateChartStats();
        return;
      }

      // Collect all timestamps and build datasets
      const allTimestamps = new Set();
      Object.values(chartDeviceData).forEach(d => {
        if (d.metrics && d.metrics.length > 0) {
          d.metrics.forEach(m => allTimestamps.add(m.timestamp));
        }
      });

      if (allTimestamps.size === 0) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = themeColors.text;
        ctx.font = '14px Share Tech Mono';
        ctx.textAlign = 'center';
        ctx.fillText('No data available for selected time range', canvas.width / 2, canvas.height / 2);
        updateChartStats();
        return;
      }

      const sortedTimestamps = Array.from(allTimestamps).sort((a, b) => a - b);

      // Sample if too many points
      const maxPoints = 200;
      const step = sortedTimestamps.length > maxPoints ? Math.ceil(sortedTimestamps.length / maxPoints) : 1;
      const sampledTimestamps = sortedTimestamps.filter((_, i) => i % step === 0);

      // Build datasets
      const datasets = [];
      let colorIndex = 0;

      for (const deviceId of selectedChartDevices) {
        const deviceData = chartDeviceData[deviceId];
        if (!deviceData) continue;

        const color = chartColors[colorIndex % chartColors.length];
        colorIndex++;

        const data = sampledTimestamps.map(ts => {
          const metric = deviceData.metrics.find(m => Math.abs(m.timestamp - ts) < 5 * 60 * 1000);
          if (!metric) return null;

          switch (chartMetric) {
            case 'hashrate':
              return metric.hashrate ? metric.hashrate / 1e9 : null; // Convert to GH/s
            case 'temperature':
              return metric.temperature;
            case 'power':
              return metric.power;
            case 'efficiency':
              if (metric.power && metric.hashrate && metric.hashrate > 0) {
                const hashrateTH = metric.hashrate / 1e12;
                return hashrateTH > 0 ? metric.power / hashrateTH : null;
              }
              return null;
            default:
              return null;
          }
        });

        datasets.push({
          label: deviceData.name,
          data: data,
          borderColor: color,
          backgroundColor: color + '20',
          fill: false,
          tension: 0.1,
          pointRadius: 0,
          borderWidth: 2
        });
      }

      // Format labels
      const labels = sampledTimestamps.map(ts => {
        const date = new Date(ts);
        if (chartTimeRange === '1h' || chartTimeRange === '6h' || chartTimeRange === '24h') {
          return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
      });

      // Determine unit
      const units = { hashrate: 'GH/s', temperature: '°C', power: 'W', efficiency: 'J/TH' };
      const unit = units[chartMetric] || '';

      if (typeof Chart === 'undefined') {
        console.error('Chart.js not loaded!');
        ctx.fillStyle = themeColors.danger;
        ctx.font = '14px Share Tech Mono';
        ctx.textAlign = 'center';
        ctx.fillText('Chart.js failed to load', canvas.width / 2, canvas.height / 2);
        return;
      }

      try {
      performanceChart = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { intersect: false, mode: 'index' },
          plugins: {
            legend: {
              labels: { color: themeColors.text, font: { family: 'Share Tech Mono' } }
            },
            tooltip: {
              backgroundColor: themeColors.bgSecondary,
              borderColor: themeColors.border,
              borderWidth: 1,
              titleColor: themeColors.accent,
              bodyColor: themeColors.textPrimary,
              callbacks: {
                label: function(context) {
                  const value = context.parsed.y;
                  return context.dataset.label + ': ' + (value !== null ? value.toFixed(2) + ' ' + unit : '--');
                }
              }
            }
          },
          scales: {
            x: {
              ticks: { color: themeColors.text, font: { family: 'Share Tech Mono', size: 10 } },
              grid: { color: themeColors.border }
            },
            y: {
              ticks: {
                color: themeColors.text,
                font: { family: 'Share Tech Mono', size: 10 },
                callback: function(value) { return value.toFixed(1) + ' ' + unit; }
              },
              grid: { color: themeColors.border },
              title: { display: true, text: unit, color: themeColors.text, font: { family: 'Share Tech Mono' } }
            }
          }
        }
      });
      } catch (err) {
        console.error('updateChart: failed to create chart', err);
        ctx.fillStyle = themeColors.danger;
        ctx.font = '14px Share Tech Mono';
        ctx.textAlign = 'center';
        ctx.fillText('Error creating chart: ' + err.message, canvas.width / 2, canvas.height / 2);
      }

      updateChartStats();
    }

    function updateChartStats() {
      const container = document.getElementById('chart-stats');
      if (!container) return;

      if (selectedChartDevices.length === 0 || Object.keys(chartDeviceData).length === 0) {
        container.innerHTML = '';
        return;
      }

      const chartColors = getChartColors();
      const units = { hashrate: 'GH/s', temperature: '°C', power: 'W', efficiency: 'J/TH' };
      const unit = units[chartMetric] || '';

      let html = '';
      let colorIndex = 0;

      for (const deviceId of selectedChartDevices) {
        const deviceData = chartDeviceData[deviceId];
        if (!deviceData) continue;

        const color = chartColors[colorIndex % chartColors.length];
        colorIndex++;

        const values = deviceData.metrics.map(m => {
          switch (chartMetric) {
            case 'hashrate': return m.hashrate ? m.hashrate / 1e9 : null;
            case 'temperature': return m.temperature;
            case 'power': return m.power;
            case 'efficiency':
              if (m.power && m.hashrate && m.hashrate > 0) {
                const hashrateTH = m.hashrate / 1e12;
                return hashrateTH > 0 ? m.power / hashrateTH : null;
              }
              return null;
            default: return null;
          }
        }).filter(v => v !== null && v > 0);

        if (values.length === 0) continue;

        const min = Math.min(...values);
        const max = Math.max(...values);
        const avg = values.reduce((a, b) => a + b, 0) / values.length;

        html += '<div class="chart-stat-card">' +
          '<div class="chart-stat-device">' +
          '<div class="chart-stat-color" style="background: ' + color + ';"></div>' +
          '<div class="chart-stat-name">' + deviceData.name + '</div>' +
          '</div>' +
          '<div class="chart-stat-values">' +
          '<div class="chart-stat-item"><div class="chart-stat-label">Min</div><div class="chart-stat-value">' + min.toFixed(1) + ' ' + unit + '</div></div>' +
          '<div class="chart-stat-item"><div class="chart-stat-label">Max</div><div class="chart-stat-value">' + max.toFixed(1) + ' ' + unit + '</div></div>' +
          '<div class="chart-stat-item"><div class="chart-stat-label">Avg</div><div class="chart-stat-value">' + avg.toFixed(1) + ' ' + unit + '</div></div>' +
          '</div></div>';
      }

      container.innerHTML = html;
    }
  </script>
</body>
</html>`;
}
