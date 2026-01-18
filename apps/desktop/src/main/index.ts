import { app, BrowserWindow, ipcMain, shell } from 'electron';
import * as auth from './database/auth';
import { join } from 'path';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import { initDatabase, closeDatabase } from './database';
import * as server from './server';
import * as devices from './database/devices';
import * as metrics from './database/metrics';
import * as settings from './database/settings';
import * as poller from './axeos-poller';
import * as tunnel from './cloudflare-tunnel';

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#1a1a2e',
      symbolColor: '#ffffff',
      height: 32,
    },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  // Load the app
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    const rendererPath = join(__dirname, '../renderer/index.html');
    console.log('Loading renderer from:', rendererPath);
    console.log('__dirname:', __dirname);
    mainWindow.loadFile(rendererPath).catch(err => {
      console.error('Failed to load renderer:', err);
    });
  }

  // Open devtools in production to debug
  if (!is.dev) {
    mainWindow.webContents.openDevTools();
  }

  // Log any renderer errors
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Renderer failed to load:', errorCode, errorDescription);
  });

  mainWindow.webContents.on('console-message', (event, level, message) => {
    console.log('Renderer console:', message);
  });

  // Set up poller callback to forward metrics to renderer
  poller.setMetricsCallback((deviceId, data, isOnline) => {
    mainWindow?.webContents.send('device-metrics', { deviceId, data, isOnline });
  });
}

// App lifecycle
app.whenReady().then(() => {
  // Initialize database
  initDatabase();

  // Set app user model id for Windows
  electronApp.setAppUserModelId('com.axeos.monitor');

  // Default open or close DevTools by F12 in dev
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  createWindow();

  // Start the embedded server (for remote web access)
  const serverInfo = server.startServer();
  console.log('Server started:', serverInfo);

  // Start polling all devices
  poller.startPollingAllDevices();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Clean up before quitting
  tunnel.stopTunnel();
  poller.stopAllPolling();
  server.stopServer();
  closeDatabase();

  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  tunnel.stopTunnel();
  poller.stopAllPolling();
  server.stopServer();
  closeDatabase();
});

// Force quit on will-quit to ensure process exits
app.on('will-quit', () => {
  tunnel.stopTunnel();
  poller.stopAllPolling();
  server.stopServer();
  closeDatabase();
});

// IPC Handlers - Window controls
ipcMain.handle('get-app-version', () => app.getVersion());
ipcMain.handle('minimize-window', () => mainWindow?.minimize());
ipcMain.handle('maximize-window', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});
ipcMain.handle('close-window', () => mainWindow?.close());
ipcMain.handle('is-maximized', () => mainWindow?.isMaximized() ?? false);

// IPC Handlers - Server
ipcMain.handle('get-server-status', () => server.getServerStatus());

ipcMain.handle('restart-server', () => {
  server.stopServer();
  return server.startServer();
});

// IPC Handlers - Devices
ipcMain.handle('get-devices', () => {
  const allDevices = devices.getAllDevices();
  return allDevices.map((d) => {
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
  });
});

ipcMain.handle('add-device', async (_, ipAddress: string, name?: string) => {
  // Check if device already exists
  const existing = devices.getDeviceByIp(ipAddress);
  if (existing) {
    return { success: false, error: 'Device with this IP already exists' };
  }

  // Test connection first
  const testResult = await poller.testConnection(ipAddress);
  if (!testResult.success) {
    return { success: false, error: testResult.error || 'Cannot connect to device' };
  }

  // Use hostname from device or provided name
  const deviceName = name || testResult.data?.hostname || ipAddress;

  // Create device
  const device = devices.createDevice(deviceName, ipAddress);

  // Start polling
  poller.startPolling(device);

  return {
    success: true,
    device: {
      id: device.id,
      name: device.name,
      ipAddress: device.ip_address,
      isOnline: true,
      lastSeen: Date.now(),
      createdAt: device.created_at,
      latestMetrics: testResult.data,
    },
  };
});

ipcMain.handle('test-device-connection', async (_, ipAddress: string) => {
  return poller.testConnection(ipAddress);
});

ipcMain.handle('delete-device', (_, id: string) => {
  poller.stopPolling(id);
  devices.deleteDevice(id);
  return { success: true };
});

ipcMain.handle('update-device-name', (_, id: string, name: string) => {
  devices.updateDeviceName(id, name);
  return { success: true };
});

ipcMain.handle('update-device-ip', (_, id: string, ipAddress: string) => {
  const device = devices.getDeviceById(id);
  if (device) {
    devices.updateDeviceIp(id, ipAddress);
    poller.stopPolling(id);
    poller.startPolling({ ...device, ip_address: ipAddress });
  }
  return { success: true };
});

ipcMain.handle('refresh-device', async (_, id: string) => {
  const device = devices.getDeviceById(id);
  if (!device) {
    return { success: false, error: 'Device not found' };
  }

  const data = await poller.fetchDeviceMetrics(device.ip_address);
  if (data) {
    devices.updateDeviceStatus(id, true);
    return { success: true, data };
  }
  devices.updateDeviceStatus(id, false);
  return { success: false, error: 'Cannot connect to device' };
});

// IPC Handlers - Metrics
ipcMain.handle('get-metrics', (_, deviceId: string, options?: { startTime?: number; endTime?: number; limit?: number }) => {
  const deviceMetrics = metrics.getMetrics(deviceId, options || {});
  return deviceMetrics.map((m) => ({
    timestamp: m.timestamp,
    hashrate: m.hashrate,
    temperature: m.temperature,
    power: m.power,
    data: m.data ? JSON.parse(m.data) : null,
  }));
});

ipcMain.handle('get-latest-metrics', (_, deviceId: string) => {
  const latestData = poller.getLatestMetrics(deviceId);
  if (!latestData) return null;
  return {
    timestamp: latestData.timestamp,
    data: latestData.data,
  };
});

// IPC Handlers - Settings
ipcMain.handle('get-settings', () => settings.getAllSettings());
ipcMain.handle('set-setting', (_, key: string, value: string) => {
  settings.setSetting(key, value);
  return { success: true };
});

// IPC Handlers - Cloudflare Tunnel
ipcMain.handle('get-tunnel-status', () => tunnel.getTunnelStatus());

ipcMain.handle('start-tunnel', async () => {
  try {
    const url = await tunnel.startTunnel(settings.getServerPort());
    return { success: true, url };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to start tunnel' };
  }
});

ipcMain.handle('stop-tunnel', () => {
  tunnel.stopTunnel();
  return { success: true };
});

// IPC Handlers - Utility
ipcMain.handle('open-external', (_, url: string) => {
  shell.openExternal(url);
  return { success: true };
});

// IPC Handlers - Password Management
ipcMain.handle('is-password-set', () => auth.isPasswordSet());

ipcMain.handle('change-password', async (_, currentPassword: string, newPassword: string) => {
  return auth.changePassword(currentPassword, newPassword);
});

ipcMain.handle('reset-password', () => {
  auth.resetPassword();
  return { success: true };
});

// Listen for maximize/unmaximize events
mainWindow?.on('maximize', () => {
  mainWindow?.webContents.send('window-maximized', true);
});

mainWindow?.on('unmaximize', () => {
  mainWindow?.webContents.send('window-maximized', false);
});
