import { app, BrowserWindow, ipcMain, shell, protocol, net } from 'electron';
import * as auth from './database/auth';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import { initDatabase, closeDatabase } from './database';
import * as server from './server';
import * as devices from './database/devices';
import * as groups from './database/groups';
import * as metrics from './database/metrics';
import * as settings from './database/settings';
import * as poller from './axeos-poller';
import * as tunnel from './cloudflare-tunnel';
import * as bitcoin from './bitcoin-price';
import * as profitability from './profitability';
import * as discovery from './device-discovery';
import * as systemTray from './system-tray';
import * as alertSystem from './alert-system';
import * as deviceControl from './device-control';

let mainWindow: BrowserWindow | null = null;

// Register custom protocol for serving files with proper MIME types
function registerProtocol(): void {
  protocol.handle('app', (request) => {
    const url = request.url.replace('app://', '');
    const filePath = join(__dirname, '..', url);
    return net.fetch(pathToFileURL(filePath).href);
  });
}

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
      devTools: true,
    },
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show();
    // Open DevTools in development or if DEBUG env is set
    if (process.env.NODE_ENV === 'development' || process.env.DEBUG) {
      mainWindow?.webContents.openDevTools();
    }

    // Create system tray
    if (mainWindow) {
      systemTray.createTray(mainWindow);
      alertSystem.initialize(mainWindow);
    }
  });

  // Handle close event - minimize to tray instead of closing
  mainWindow.on('close', (event) => {
    systemTray.handleWindowClose(event);
  });

  // Enable F12 to toggle DevTools
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12') {
      mainWindow?.webContents.toggleDevTools();
    }
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  // Load the app
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    // Use custom protocol for proper ES module support
    mainWindow.loadURL('app://renderer/index.html');
  }

  // Set up poller callback to forward metrics to renderer and process alerts
  poller.setMetricsCallback((deviceId, data, isOnline) => {
    mainWindow?.webContents.send('device-metrics', { deviceId, data, isOnline });

    // Process alerts
    const device = devices.getDeviceById(deviceId);
    if (device) {
      alertSystem.processDeviceMetrics(
        deviceId,
        device.name,
        isOnline,
        data?.hashRate || 0,
        data?.temp || 0
      );
    }
  });

  // Set up callback for new best difficulty records
  poller.setNewBestDiffCallback((deviceId, deviceName, newBestDiff, previousBest) => {
    mainWindow?.webContents.send('new-best-diff', { deviceId, deviceName, newBestDiff, previousBest });
  });
}

// Register app:// as privileged scheme (must be before app ready)
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

// Single instance lock - prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // Someone tried to run a second instance, focus our window
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  // Initialize application
  app.whenReady().then(async () => {
    // Set app user model id for windows
    electronApp.setAppUserModelId('com.axeos.vpn');

    // Default open or close DevTools by F12 in development
    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window);
    });

    // Register custom protocol
    registerProtocol();

    // Initialize database
    await initDatabase();

    // Start the web server
    server.startServer();

    // Start polling saved devices
    const savedDevices = devices.getAllDevices();
    savedDevices.forEach((device) => {
      poller.startPolling(device);
    });

    // Create main window
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      // Stop all polling
      poller.stopAllPolling();
      // Destroy tray
      systemTray.destroyTray();
      // Close database
      closeDatabase();
      app.quit();
    }
  });

  // Clean up before quit
  app.on('before-quit', () => {
    systemTray.destroyTray();
  });
}

// IPC Handlers - App Info
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('check-for-updates', async () => {
  try {
    const currentVersion = app.getVersion();
    const response = await fetch('https://api.github.com/repos/ShaeOJ/AxeOS-VPN/releases/latest', {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'AxeOS-VPN-Monitor'
      }
    });

    if (!response.ok) {
      return {
        hasUpdate: false,
        latestVersion: null,
        downloadUrl: null,
        error: `GitHub API error: ${response.status}`
      };
    }

    const release = await response.json();
    const latestVersion = release.tag_name?.replace(/^v/, '') || release.name?.replace(/^v/, '');

    if (!latestVersion) {
      return {
        hasUpdate: false,
        latestVersion: null,
        downloadUrl: null,
        error: 'Could not parse version from release'
      };
    }

    // Compare versions (simple semver comparison)
    const currentParts = currentVersion.split('.').map(Number);
    const latestParts = latestVersion.split('.').map(Number);

    let hasUpdate = false;
    for (let i = 0; i < 3; i++) {
      const current = currentParts[i] || 0;
      const latest = latestParts[i] || 0;
      if (latest > current) {
        hasUpdate = true;
        break;
      } else if (current > latest) {
        break;
      }
    }

    // Find Windows installer asset
    const windowsAsset = release.assets?.find((a: { name: string }) =>
      a.name.endsWith('.exe') || a.name.endsWith('-Setup.exe')
    );

    return {
      hasUpdate,
      latestVersion,
      downloadUrl: windowsAsset?.browser_download_url || release.html_url,
      error: undefined
    };
  } catch (err) {
    return {
      hasUpdate: false,
      latestVersion: null,
      downloadUrl: null,
      error: err instanceof Error ? err.message : 'Failed to check for updates'
    };
  }
});

// IPC Handlers - Auth
ipcMain.handle('check-setup', async () => {
  return !auth.isPasswordSet();
});

ipcMain.handle('setup-pin', async (_, pin: string) => {
  await auth.setPassword(pin);
  return true;
});

ipcMain.handle('verify-pin', async (_, pin: string) => {
  return auth.verifyPassword(pin);
});

ipcMain.handle('change-pin', async (_, currentPin: string, newPin: string) => {
  return auth.changePassword(currentPin, newPin);
});

// IPC Handlers - Password Management (for Settings page)
ipcMain.handle('is-password-set', () => {
  return auth.isPasswordSet();
});

ipcMain.handle('change-password', async (_, currentPassword: string, newPassword: string) => {
  return auth.changePassword(currentPassword, newPassword);
});

ipcMain.handle('reset-password', async () => {
  // Clear the password hash from settings
  const db = require('./database').getDatabase();
  db.prepare('DELETE FROM settings WHERE key = ?').run('password_hash');
  return { success: true };
});

// IPC Handlers - System Tray
ipcMain.handle('get-minimize-to-tray', () => {
  return systemTray.isMinimizeToTrayEnabled();
});

ipcMain.handle('set-minimize-to-tray', (_, enabled: boolean) => {
  systemTray.setMinimizeToTray(enabled);
  return { success: true };
});

// IPC Handlers - Alert System
ipcMain.handle('get-alert-config', () => {
  return alertSystem.getConfig();
});

ipcMain.handle('set-alert-config', async (_, config: Partial<alertSystem.AlertConfig>) => {
  await alertSystem.saveConfig(config);
  return { success: true };
});

ipcMain.handle('test-alert-notification', () => {
  return alertSystem.testNotification();
});

// IPC Handlers - Device Control
ipcMain.handle('restart-device', async (_, ipAddress: string) => {
  return deviceControl.restartDevice(ipAddress);
});

ipcMain.handle('set-device-fan-speed', async (_, ipAddress: string, speed: number) => {
  return deviceControl.setFanSpeed(ipAddress, speed);
});

ipcMain.handle('set-device-frequency', async (_, ipAddress: string, frequency: number) => {
  return deviceControl.setFrequency(ipAddress, frequency);
});

ipcMain.handle('set-device-voltage', async (_, ipAddress: string, voltage: number) => {
  return deviceControl.setCoreVoltage(ipAddress, voltage);
});

ipcMain.handle('update-device-settings', async (_, ipAddress: string, settings: deviceControl.DeviceSettings) => {
  return deviceControl.updateDeviceSettings(ipAddress, settings);
});

ipcMain.handle('update-pool-settings', async (_, ipAddress: string, stratumURL: string, stratumPort: number, stratumUser: string, stratumPassword?: string) => {
  return deviceControl.updatePoolSettings(ipAddress, stratumURL, stratumPort, stratumUser, stratumPassword);
});

// IPC Handlers - Device Groups
ipcMain.handle('get-groups', () => {
  return groups.getAllGroups().map(g => ({
    id: g.id,
    name: g.name,
    color: g.color,
    sortOrder: g.sort_order,
    createdAt: g.created_at,
  }));
});

ipcMain.handle('create-group', (_, name: string, color: string) => {
  const group = groups.createGroup(name, color);
  return {
    id: group.id,
    name: group.name,
    color: group.color,
    sortOrder: group.sort_order,
    createdAt: group.created_at,
  };
});

ipcMain.handle('update-group', (_, id: string, name: string, color: string) => {
  groups.updateGroup(id, name, color);
  return { success: true };
});

ipcMain.handle('delete-group', (_, id: string) => {
  groups.deleteGroup(id);
  return { success: true };
});

ipcMain.handle('set-device-group', (_, deviceId: string, groupId: string | null) => {
  devices.setDeviceGroup(deviceId, groupId);
  return { success: true };
});

// IPC Handlers - Devices
ipcMain.handle('get-devices', async () => {
  // Transform snake_case database fields to camelCase for frontend
  const allDevices = devices.getAllDevices();
  return allDevices.map(d => ({
    id: d.id,
    name: d.name,
    ipAddress: d.ip_address,
    deviceType: d.device_type || 'bitaxe',
    isOnline: d.is_online === 1,
    lastSeen: d.last_seen,
    createdAt: d.created_at,
    groupId: d.group_id,
    allTimeBestDiff: d.all_time_best_diff,
    allTimeBestDiffAt: d.all_time_best_diff_at,
    latestMetrics: poller.getLatestMetrics(d.id)?.data || null,
  }));
});

ipcMain.handle('test-device-connection', async (_, ipAddress: string, username?: string, password?: string) => {
  // Use auto-detection to find device type
  return poller.testConnectionWithDetection(ipAddress, username, password);
});

ipcMain.handle('add-device', async (_, ipAddress: string, name?: string, username?: string, password?: string) => {
  // Test connection with auto-detection
  const testResult = await poller.testConnectionWithDetection(ipAddress, username, password);

  // If requires auth and no credentials provided, return error
  if (testResult.requiresAuth && (!username || !password)) {
    return { success: false, requiresAuth: true, error: 'This device requires authentication. Please provide username and password.' };
  }

  if (!testResult.success) {
    return { success: false, error: testResult.error || 'Could not connect to device' };
  }

  // Use hostname from device if no name provided
  const deviceName = name || testResult.data?.hostname || ipAddress;
  const deviceType = testResult.deviceType || 'bitaxe';

  console.log(`[Add Device] Adding ${deviceName} (${ipAddress}) as ${deviceType}`);

  const newDevice = devices.createDevice(deviceName, ipAddress, deviceType, username, password);
  if (newDevice) {
    poller.startPolling(newDevice);
    return { success: true, device: newDevice };
  }
  return { success: false, error: 'Failed to create device' };
});

ipcMain.handle('delete-device', async (_, id: string) => {
  poller.stopPolling(id);
  devices.deleteDevice(id);
  return { success: true };
});

ipcMain.handle('remove-device', async (_, id: string) => {
  poller.stopPolling(id);
  devices.deleteDevice(id);
  return { success: true };
});

ipcMain.handle('update-device-name', async (_, id: string, name: string) => {
  devices.updateDeviceName(id, name);
  return { success: true };
});

ipcMain.handle('update-device-ip', async (_, id: string, ipAddress: string) => {
  devices.updateDeviceIp(id, ipAddress);
  const updated = devices.getDeviceById(id);
  if (updated) {
    poller.stopPolling(id);
    poller.startPolling(updated);
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
    return { success: true, data };
  }
  return { success: false, error: 'Could not fetch device data' };
});

ipcMain.handle('update-device', async (_, id: string, device: { name?: string; ip?: string }) => {
  if (device.name) {
    devices.updateDeviceName(id, device.name);
  }
  if (device.ip) {
    devices.updateDeviceIp(id, device.ip);
  }
  const updated = devices.getDeviceById(id);
  if (updated) {
    poller.stopPolling(id);
    poller.startPolling(updated);
  }
  return updated;
});

// IPC Handlers - Device Discovery
ipcMain.handle('start-device-discovery', async (event) => {
  const checkExisting = (ip: string): boolean => {
    const existing = devices.getDeviceByIp(ip);
    return existing !== null;
  };

  const onProgress = (progress: discovery.DiscoveryProgress): void => {
    // Send progress to renderer
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('discovery-progress', progress);
    }
  };

  try {
    const discovered = await discovery.discoverDevices(onProgress, checkExisting);
    return { success: true, devices: discovered };
  } catch (err) {
    console.error('Discovery failed:', err);
    return { success: false, error: 'Discovery failed' };
  }
});

ipcMain.handle('cancel-device-discovery', () => {
  discovery.cancelDiscovery();
  return { success: true };
});

ipcMain.handle('add-discovered-device', async (_, ip: string, hostname: string) => {
  // Check if already exists
  const existing = devices.getDeviceByIp(ip);
  if (existing) {
    return { success: false, error: 'Device already added' };
  }

  const newDevice = devices.createDevice(hostname, ip);
  if (newDevice) {
    poller.startPolling(newDevice);
    return { success: true, device: newDevice };
  }
  return { success: false, error: 'Failed to create device' };
});

// IPC Handlers - Metrics
ipcMain.handle('get-device-metrics', async (_, deviceId: string, hours?: number) => {
  const startTime = Date.now() - (hours || 24) * 60 * 60 * 1000;
  return metrics.getMetrics(deviceId, { startTime, limit: 1000 });
});

ipcMain.handle('get-metrics', async (_, deviceId: string, options?: { startTime?: number; endTime?: number; limit?: number }) => {
  const metricsData = metrics.getMetrics(deviceId, options || {});
  // Transform to match expected MetricData interface
  return metricsData.map(m => ({
    timestamp: m.timestamp,
    hashrate: m.hashrate,
    temperature: m.temperature,
    power: m.power,
    data: m.data ? JSON.parse(m.data) : null
  }));
});

ipcMain.handle('get-all-metrics', async (_, hours?: number) => {
  // Get metrics for all devices
  const allDevices = devices.getAllDevices();
  const startTime = Date.now() - (hours || 24) * 60 * 60 * 1000;
  const result: Record<string, any[]> = {};
  for (const device of allDevices) {
    result[device.id] = metrics.getMetrics(device.id, { startTime, limit: 1000 });
  }
  return result;
});

// IPC Handlers - Settings
ipcMain.handle('get-settings', async () => {
  return settings.getAllSettings();
});

ipcMain.handle('get-setting', async (_, key: string) => {
  return settings.getSetting(key);
});

ipcMain.handle('set-setting', async (_, key: string, value: string) => {
  return settings.setSetting(key, value);
});

ipcMain.handle('reset-app-data', async () => {
  // Stop all services
  poller.stopAllPolling();
  tunnel.stopTunnel();
  server.stopServer();
  closeDatabase();

  // Delete database files
  const userDataPath = app.getPath('userData');
  const dataPath = join(userDataPath, 'data');
  const { rmSync, existsSync } = await import('fs');

  if (existsSync(dataPath)) {
    rmSync(dataPath, { recursive: true, force: true });
  }

  // Restart the app
  app.relaunch();
  app.exit(0);
});

// IPC Handlers - Tunnel Status
ipcMain.handle('get-tunnel-status', async () => {
  return tunnel.getTunnelStatus();
});

ipcMain.handle('start-tunnel', async () => {
  try {
    const port = server.getServerPort();
    const url = await tunnel.startTunnel(port);
    return { success: true, url };
  } catch (error) {
    console.error('Tunnel start error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to start tunnel' };
  }
});

ipcMain.handle('stop-tunnel', async () => {
  return tunnel.stopTunnel();
});

ipcMain.handle('get-tunnel-url', async () => {
  return tunnel.getTunnelUrl();
});

ipcMain.handle('get-web-port', async () => {
  return server.getServerPort();
});

ipcMain.handle('get-local-addresses', async () => {
  return server.getLocalAddresses();
});

// IPC Handlers - Window Controls
ipcMain.handle('minimize-window', async () => {
  mainWindow?.minimize();
});

ipcMain.handle('maximize-window', async () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});

ipcMain.handle('close-window', async () => {
  mainWindow?.close();
});

ipcMain.handle('is-maximized', () => mainWindow?.isMaximized() ?? false);

// IPC Handlers - Server
ipcMain.handle('get-server-status', () => server.getServerStatus());

ipcMain.handle('restart-server', () => {
  server.stopServer();
  return server.startServer();
});

// IPC Handlers - External Links
ipcMain.handle('open-external', async (_, url: string) => {
  shell.openExternal(url);
});

// IPC Handlers - Crypto Prices
ipcMain.handle('get-bitcoin-price', async () => {
  return bitcoin.fetchBitcoinPrice();
});

ipcMain.handle('get-crypto-price', async (_, coinId: string, currency?: string) => {
  return bitcoin.fetchCryptoPrice(coinId, currency || 'usd');
});

ipcMain.handle('get-supported-coins', () => {
  return bitcoin.getSupportedCoins();
});

ipcMain.handle('get-supported-currencies', () => {
  return bitcoin.getSupportedCurrencies();
});

ipcMain.handle('get-price-history', async (_, coinId: string, currency?: string, days?: number) => {
  return bitcoin.fetchPriceHistory(coinId, currency || 'usd', days || 7);
});

// IPC Handlers - Profitability Calculator
ipcMain.handle('get-network-stats', async (_, coin?: profitability.MiningCoin) => {
  return profitability.fetchNetworkStats(coin || 'btc');
});

ipcMain.handle('get-electricity-cost', async () => {
  const cost = settings.getSetting('electricity_cost');
  return cost ? parseFloat(cost) : 0.12; // Default to $0.12/kWh
});

ipcMain.handle('set-electricity-cost', async (_, cost: number) => {
  settings.setSetting('electricity_cost', cost.toString());
  return true;
});

ipcMain.handle('calculate-profitability', async (_, coin: profitability.MiningCoin, hashrateGH: number, powerWatts: number, cryptoPriceUsd: number, electricityCost?: number) => {
  return profitability.calculateProfitability(coin, hashrateGH, powerWatts, cryptoPriceUsd, electricityCost);
});

ipcMain.handle('get-mining-coins', async () => {
  return profitability.getSupportedCoins();
});

ipcMain.handle('fetch-coin-price', async (_, coin: profitability.MiningCoin, currency: string) => {
  return profitability.fetchCoinPrice(coin, currency);
});
