import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { networkInterfaces } from 'os';
import { readFileSync } from 'fs';
import { join } from 'path';
import * as devices from '../database/devices';
import * as metrics from '../database/metrics';
import * as settings from '../database/settings';
import * as auth from '../database/auth';
import * as poller from '../axeos-poller';
import * as bitcoin from '../bitcoin-price';

// Load logo as base64 for embedding in HTML
let logoBase64 = '';
const possibleLogoPaths = [
  join(__dirname, '../../renderer/assets/logo.png'),  // Production build
  join(__dirname, '../../../src/renderer/assets/logo.png'),  // Dev mode from dist
  join(process.cwd(), 'src/renderer/assets/logo.png'),  // Dev mode from project root
];

for (const logoPath of possibleLogoPaths) {
  try {
    const logoBuffer = readFileSync(logoPath);
    logoBase64 = `data:image/png;base64,${logoBuffer.toString('base64')}`;
    console.log('Logo loaded from:', logoPath);
    break;
  } catch (e) {
    // Try next path
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
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #1a4a5c; animation: fade-in 0.4s ease-out forwards; }
    .login-container .card { animation: fade-in 0.5s ease-out forwards; }
    .logo { font-size: 24px; font-weight: bold; color: #FFB000; text-transform: uppercase; letter-spacing: 2px; }
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
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; }
    .stat-label { font-size: 11px; color: #8BA88B; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 1px; }
    .stat-value { font-size: 24px; font-weight: bold; }
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
    .metric-label { font-size: 10px; color: #8BA88B; text-transform: uppercase; }
    .metric-value { font-size: 14px; font-weight: 600; }
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
    .secondary-stat-label { font-size: 9px; color: #8BA88B; text-transform: uppercase; }
    .secondary-stat-value { font-size: 12px; font-weight: 500; }
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
      z-index: 1000;
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
      .grid { grid-template-columns: repeat(2, 1fr); gap: 10px; }
      .card { padding: 14px; }
      .stat-value { font-size: 20px; }
      .stat-label { font-size: 10px; }
      .metrics-grid { grid-template-columns: repeat(3, 1fr); gap: 8px; }
      .metric-value { font-size: 12px; }
      .secondary-stats { grid-template-columns: repeat(3, 1fr); gap: 6px; }
      .secondary-stat-value { font-size: 11px; }
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
      .btn { padding: 8px 14px; font-size: 12px; }
    }

    @media (max-width: 480px) {
      .container { padding: 8px; }
      .grid { grid-template-columns: 1fr; gap: 8px; }
      .card { padding: 12px; margin-bottom: 10px; }
      .stat-value { font-size: 18px; }
      .metrics-grid { grid-template-columns: repeat(3, 1fr); gap: 6px; }
      .metric-label { font-size: 9px; }
      .metric-value { font-size: 11px; }
      .secondary-stats { grid-template-columns: repeat(3, 1fr); gap: 4px; }
      .secondary-stat-label { font-size: 8px; }
      .secondary-stat-value { font-size: 10px; }
      .device-header { flex-direction: row; align-items: flex-start; }
      .device-name { font-size: 13px; }
      .device-ip { font-size: 11px; }
      .device-model { font-size: 10px; }
      .detail-grid { grid-template-columns: 1fr; gap: 8px; }
      .detail-item[style*="span 2"] { grid-column: span 1 !important; }
      .modal-header { flex-direction: column; gap: 10px; align-items: stretch; }
      .modal-title { text-align: center; }
      .modal-header .btn { width: 100%; }
      .input { padding: 10px 12px; font-size: 14px; }
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
      .ticker-price { font-size: 20px; }
      .ticker-change { font-size: 12px; }
      .ticker-sparkline { height: 24px; }
    }
  </style>
</head>
<body>
  <canvas id="network-canvas"></canvas>
  <div id="login-view" class="container login-container">
    <div class="card">
      ${logoBase64 ? `<img src="${logoBase64}" alt="AxeOS VPN" style="max-width: 200px; height: auto; display: block; margin: 0 auto 24px; filter: drop-shadow(0 0 10px rgba(255,176,0,0.4));">` : `<h2 style="margin-bottom: 24px; text-align: center; color: #FFB000; text-transform: uppercase; letter-spacing: 2px;">AxeOS VPN</h2>`}
      <div id="setup-form" class="hidden">
        <p style="color: #8BA88B; margin-bottom: 16px; text-align: center;">Create a password to secure remote access:</p>
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
      ${logoBase64 ? `<img src="${logoBase64}" alt="AxeOS VPN" style="height: 60px; width: auto; filter: drop-shadow(0 0 10px rgba(255,176,0,0.4));">` : `<div class="logo">AxeOS VPN Monitor</div>`}
      <div style="display: flex; gap: 10px; align-items: center;">
        <button id="bg-toggle" onclick="toggleBackground()" class="btn btn-secondary" title="Toggle animated background" style="padding: 8px 12px; display: flex; align-items: center; gap: 6px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
          </svg>
          <span id="bg-toggle-text">FX</span>
        </button>
        <button onclick="doLogout()" class="btn btn-danger">Logout</button>
      </div>
    </div>

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

    <div class="grid" style="margin-bottom: 24px;">
      <!-- Hashrate Card -->
      <div class="card">
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
          <div style="padding: 8px; background: rgba(255,176,0,0.2); border: 1px solid rgba(255,176,0,0.4); border-radius: 4px;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFB000" stroke-width="2">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <div class="stat-label" style="margin: 0;">Hashrate</div>
        </div>
        <div id="total-hashrate" class="stat-value accent" style="text-shadow: 0 0 4px rgba(255,176,0,0.3);">--</div>
        <div style="height: 6px; background: #0a1929; border: 1px solid #1a4a5c; margin-top: 10px; overflow: hidden;">
          <div id="hashrate-bar" style="height: 100%; width: 0%; background: linear-gradient(90deg, #FFB000, #FFC940); transition: width 0.5s;"></div>
        </div>
      </div>
      <!-- Temperature Card -->
      <div class="card">
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
          <div id="temp-icon-bg" style="padding: 8px; background: rgba(0,255,65,0.2); border: 1px solid rgba(0,255,65,0.4); border-radius: 4px;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00FF41" stroke-width="2" id="temp-icon">
              <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <div class="stat-label" style="margin: 0;">Avg Temp</div>
        </div>
        <div id="avg-temp" class="stat-value success">--</div>
        <div style="height: 6px; background: #0a1929; border: 1px solid #1a4a5c; margin-top: 10px; overflow: hidden;">
          <div id="temp-bar" style="height: 100%; width: 0%; background: #00FF41; transition: width 0.5s;"></div>
        </div>
        <div style="font-size: 10px; color: #8BA88B; margin-top: 6px; text-align: right;"><span id="temp-status">OPTIMAL</span></div>
      </div>
      <!-- Power Card -->
      <div class="card">
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
          <div style="padding: 8px; background: rgba(0,206,209,0.2); border: 1px solid rgba(0,206,209,0.4); border-radius: 4px;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00CED1" stroke-width="2">
              <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <div class="stat-label" style="margin: 0;">Power Draw</div>
        </div>
        <div id="total-power" class="stat-value" style="color: #00CED1;">--</div>
        <div style="height: 6px; background: #0a1929; border: 1px solid #1a4a5c; margin-top: 10px; overflow: hidden;">
          <div id="power-bar" style="height: 100%; width: 0%; background: linear-gradient(90deg, #00CED1, #20B2AA); transition: width 0.5s;"></div>
        </div>
      </div>
      <!-- Efficiency Card -->
      <div class="card">
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
          <div style="padding: 8px; background: rgba(0,255,65,0.2); border: 1px solid rgba(0,255,65,0.4); border-radius: 4px;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00FF41" stroke-width="2">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <div class="stat-label" style="margin: 0;">Efficiency</div>
        </div>
        <div id="efficiency" class="stat-value" style="color: #00FF41; text-shadow: 0 0 3px rgba(0,255,65,0.25);">--</div>
        <div style="height: 6px; background: #0a1929; border: 1px solid #1a4a5c; margin-top: 10px; overflow: hidden;">
          <div id="efficiency-bar" style="height: 100%; width: 0%; background: linear-gradient(90deg, #00FF41, #00CC33); transition: width 0.5s;"></div>
        </div>
      </div>
      <!-- Shares Card -->
      <div class="card">
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
          <div style="padding: 8px; background: rgba(0,255,65,0.2); border: 1px solid rgba(0,255,65,0.4); border-radius: 4px;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00FF41" stroke-width="2">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <div class="stat-label" style="margin: 0;">Shares</div>
        </div>
        <div id="total-shares" class="stat-value success" style="text-shadow: 0 0 3px rgba(0,255,65,0.25);">--</div>
      </div>
    </div>

    <h3 style="margin-bottom: 16px; color: #FFB000; text-transform: uppercase; letter-spacing: 1px;">Devices (<span id="device-count">0</span>)</h3>
    <div id="devices-list"></div>
  </div>

  <div id="device-modal" class="modal-overlay hidden" onclick="if(event.target===this)closeModal()">
    <div class="modal">
      <div class="modal-header">
        <div class="modal-title" id="modal-device-name">Device</div>
        <button onclick="closeModal()" class="btn btn-secondary">Close</button>
      </div>
      <div class="modal-body" id="modal-body"></div>
    </div>
  </div>

  <script>
    let token = localStorage.getItem('token');
    let devices = [];

    async function init() {
      try {
        console.log('Initializing dashboard...');
        const res = await fetch('/api/setup-required');
        const { required } = await res.json();
        console.log('Setup required:', required, 'Token:', !!token);
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
        html += '<div class="detail-item"><div class="detail-label">' + (isCluster ? 'Cluster Power' : 'Power') + '</div><div class="detail-value">' + formatPower(m.power) + '</div></div>';
        html += '<div class="detail-item"><div class="detail-label">' + (isCluster ? 'Cluster Efficiency' : 'Efficiency') + '</div><div class="detail-value">' + (m.efficiency ? m.efficiency.toFixed(1) + ' J/TH' : '--') + '</div></div>';
        html += '</div>';

        html += '<div class="section-title">Hardware</div><div class="detail-grid">';
        html += '<div class="detail-item"><div class="detail-label">Model</div><div class="detail-value">' + (m.ASICModel || 'Unknown') + '</div></div>';
        html += '<div class="detail-item"><div class="detail-label">Firmware</div><div class="detail-value">' + (m.version || 'Unknown') + '</div></div>';
        html += '<div class="detail-item"><div class="detail-label">Frequency</div><div class="detail-value">' + (m.frequency ? m.frequency + ' MHz' : '--') + '</div></div>';
        html += '<div class="detail-item"><div class="detail-label">Core Voltage</div><div class="detail-value">' + (m.coreVoltage ? m.coreVoltage + ' mV' : '--') + '</div></div>';
        html += '<div class="detail-item"><div class="detail-label">Fan Speed</div><div class="detail-value">' + (m.fanspeed ? m.fanspeed + '%' : '--') + '</div></div>';
        html += '<div class="detail-item"><div class="detail-label">VR Temp</div><div class="detail-value">' + formatTemp(m.vrTemp) + '</div></div>';
        html += '</div>';

        html += '<div class="section-title">Mining Stats</div><div class="detail-grid">';
        html += '<div class="detail-item"><div class="detail-label">' + (isCluster ? 'Cluster Accepted' : 'Shares Accepted') + '</div><div class="detail-value success">' + (m.sharesAccepted || 0).toLocaleString() + '</div></div>';
        html += '<div class="detail-item"><div class="detail-label">' + (isCluster ? 'Cluster Rejected' : 'Shares Rejected') + '</div><div class="detail-value danger">' + (m.sharesRejected || 0).toLocaleString() + '</div></div>';
        html += '<div class="detail-item"><div class="detail-label">Best Difficulty</div><div class="detail-value accent">' + (m.bestDiff && typeof m.bestDiff === 'number' ? (m.bestDiff >= 1e9 ? (m.bestDiff / 1e9).toFixed(2) + 'B' : m.bestDiff >= 1e6 ? (m.bestDiff / 1e6).toFixed(2) + 'M' : m.bestDiff >= 1e3 ? (m.bestDiff / 1e3).toFixed(2) + 'K' : m.bestDiff.toLocaleString()) : (m.bestDiff || '--')) + '</div></div>';
        html += '<div class="detail-item"><div class="detail-label">Uptime</div><div class="detail-value">' + formatUptime(m.uptimeSeconds) + '</div></div>';
        html += '</div>';

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
      let totalHashrate = 0, totalPower = 0, tempSum = 0, onlineCount = 0, totalShares = 0;
      const onlineDevices = devices.filter(d => d.isOnline);
      const offlineDevices = devices.filter(d => !d.isOnline);
      onlineDevices.forEach(d => {
        const m = d.latestMetrics;
        if (m) { totalHashrate += m.hashRate || 0; totalPower += m.power || 0; if (m.temp) { tempSum += m.temp; onlineCount++; } totalShares += m.sharesAccepted || 0; }
      });

      container.innerHTML = [...onlineDevices, ...offlineDevices].map(d => {
        const m = d.latestMetrics;
        const isCluster = m && m.isClusterMaster && m.clusterInfo;
        return '<div class="card clickable" onclick="showDeviceDetail(' + "'" + d.id + "'" + ')">' +
          '<div class="device-header"><div><div class="device-name">' + d.name + '</div><div class="device-ip">' + d.ipAddress + '</div>' +
          (m ? '<div class="device-model" style="display:flex;align-items:center;gap:6px;">' + (m.ASICModel || 'BitAxe') +
            (isCluster ? '<span style="padding:1px 6px;font-size:9px;background:rgba(255,176,0,0.2);border:1px solid rgba(255,176,0,0.4);color:#FFB000;text-transform:uppercase;">Cluster (' + m.clusterInfo.activeSlaves + ')</span>' : '') +
          '</div>' : '') +
          '</div><div class="status-dot ' + (d.isOnline ? 'online' : 'offline') + '"></div></div>' +
          (d.isOnline && m ?
            '<div class="metrics-grid"><div class="metric"><div class="metric-label">Hashrate</div><div class="metric-value accent">' + formatHashrate(m.hashRate) + '</div></div>' +
            '<div class="metric"><div class="metric-label">Temp</div><div class="metric-value ' + getTempClass(m.temp) + '">' + formatTemp(m.temp) + '</div></div>' +
            '<div class="metric"><div class="metric-label">Power</div><div class="metric-value">' + formatPower(m.power) + '</div></div></div>' +
            '<div class="secondary-stats"><div class="secondary-stat"><div class="secondary-stat-label">Efficiency</div><div class="secondary-stat-value">' + (m.efficiency ? m.efficiency.toFixed(1) + ' J/TH' : '--') + '</div></div>' +
            '<div class="secondary-stat"><div class="secondary-stat-label">Shares</div><div class="secondary-stat-value success">' + (m.sharesAccepted || 0).toLocaleString() + '</div></div>' +
            '<div class="secondary-stat"><div class="secondary-stat-label">Fan</div><div class="secondary-stat-value">' + (m.fanspeed ? m.fanspeed + '%' : '--') + '</div></div></div>'
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
    }

    function formatHashrate(h) { if (!h) return '--'; return h >= 1000 ? (h / 1000).toFixed(2) + ' TH/s' : h.toFixed(2) + ' GH/s'; }
    function formatTemp(t) { return t ? t.toFixed(1) + '°C' : '--'; }
    function formatPower(p) { return p ? p.toFixed(1) + ' W' : '--'; }
    function formatUptime(s) { if (!s) return '--'; const d = Math.floor(s/86400), h = Math.floor((s%86400)/3600), m = Math.floor((s%3600)/60); return d > 0 ? d+'d '+h+'h' : h > 0 ? h+'h '+m+'m' : m+'m'; }
    function getTempClass(t) { if (!t) return ''; return t > 80 ? 'danger' : t > 70 ? 'warning' : 'success'; }

    // Network animation
    const canvas = document.getElementById('network-canvas');
    const ctx = canvas.getContext('2d');
    let nodes = [];
    let animationId = null;
    const nodeCount = 60;
    const connectionDistance = 150;
    const nodeSpeed = 0.3;

    function resizeCanvas() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }

    function createNodes() {
      nodes = [];
      for (let i = 0; i < nodeCount; i++) {
        nodes.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          vx: (Math.random() - 0.5) * nodeSpeed,
          vy: (Math.random() - 0.5) * nodeSpeed,
          radius: Math.random() * 2 + 1,
          pulse: Math.random() * Math.PI * 2,
          pulseSpeed: 0.02 + Math.random() * 0.02
        });
      }
    }

    function drawNetwork() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Update and draw nodes
      nodes.forEach((node, i) => {
        // Update position
        node.x += node.vx;
        node.y += node.vy;
        node.pulse += node.pulseSpeed;

        // Bounce off edges
        if (node.x < 0 || node.x > canvas.width) node.vx *= -1;
        if (node.y < 0 || node.y > canvas.height) node.vy *= -1;

        // Draw connections to nearby nodes
        for (let j = i + 1; j < nodes.length; j++) {
          const other = nodes[j];
          const dx = other.x - node.x;
          const dy = other.y - node.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < connectionDistance) {
            const alpha = (1 - dist / connectionDistance) * 0.4;
            ctx.beginPath();
            ctx.moveTo(node.x, node.y);
            ctx.lineTo(other.x, other.y);
            ctx.strokeStyle = 'rgba(255, 176, 0, ' + alpha + ')';
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }

        // Draw node with pulse effect
        const pulseSize = Math.sin(node.pulse) * 0.5 + 1;
        const glowAlpha = 0.3 + Math.sin(node.pulse) * 0.2;

        // Glow
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius * 3 * pulseSize, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 176, 0, ' + (glowAlpha * 0.3) + ')';
        ctx.fill();

        // Core
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius * pulseSize, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 176, 0, ' + (0.6 + glowAlpha * 0.4) + ')';
        ctx.fill();
      });

      animationId = requestAnimationFrame(drawNetwork);
    }

    function startNetwork() {
      if (animationId) return;
      resizeCanvas();
      createNodes();
      drawNetwork();
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

    function toggleCoinDropdown() {
      coinDropdownOpen = !coinDropdownOpen;
      currencyDropdownOpen = false;
      document.getElementById('coin-dropdown').classList.toggle('hidden', !coinDropdownOpen);
      document.getElementById('currency-dropdown').classList.add('hidden');
    }

    function toggleCurrencyDropdown() {
      currencyDropdownOpen = !currencyDropdownOpen;
      coinDropdownOpen = false;
      document.getElementById('currency-dropdown').classList.toggle('hidden', !currencyDropdownOpen);
      document.getElementById('coin-dropdown').classList.add('hidden');
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
      }
      coinDropdownOpen = false;
      document.getElementById('coin-dropdown').classList.add('hidden');
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
      }
      currencyDropdownOpen = false;
      document.getElementById('currency-dropdown').classList.add('hidden');
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

    init();
    initBackground();
    initCryptoTicker();
  </script>
</body>
</html>`;
}
