import { app, BrowserWindow, ipcMain, shell, protocol, net } from 'electron';
import * as auth from './database/auth';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import { initDatabase, closeDatabase } from './database';
import * as server from './server';
import * as devices from './database/devices';
import * as metrics from './database/metrics';
import * as settings from './database/settings';
import * as poller from './axeos-poller';
import * as tunnel from './cloudflare-tunnel';
import * as bitcoin from './bitcoin-price';
import * as profitability from './profitability';

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
    // Use custom protocol for proper ES module support
    mainWindow.loadURL('app://renderer/index.html');
  }

  // Set up poller callback to forward metrics to renderer
  poller.setMetricsCallback((deviceId, data, isOnline) => {
    mainWindow?.webContents.send('device-metrics', { deviceId, data, isOnline });
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
      // Close database
      closeDatabase();
      app.quit();
    }
  });
}

// IPC Handlers - Auth
ipcMain.handle('check-setup', async () => {
  return auth.needsSetup();
});

ipcMain.handle('setup-pin', async (_, pin: string) => {
  return auth.setupPin(pin);
});

ipcMain.handle('verify-pin', async (_, pin: string) => {
  return auth.verifyPin(pin);
});

ipcMain.handle('change-pin', async (_, currentPin: string, newPin: string) => {
  return auth.changePin(currentPin, newPin);
});

// IPC Handlers - Devices
ipcMain.handle('get-devices', async () => {
  return devices.getAllDevices();
});

ipcMain.handle('add-device', async (_, device: { name: string; ip: string }) => {
  const newDevice = devices.addDevice(device.name, device.ip);
  if (newDevice) {
    poller.startPolling(newDevice);
  }
  return newDevice;
});

ipcMain.handle('remove-device', async (_, id: number) => {
  poller.stopPolling(id);
  return devices.removeDevice(id);
});

ipcMain.handle('update-device', async (_, id: number, device: { name?: string; ip?: string }) => {
  const updated = devices.updateDevice(id, device);
  if (updated) {
    // Restart polling with new settings
    poller.stopPolling(id);
    poller.startPolling(updated);
  }
  return updated;
});

// IPC Handlers - Metrics
ipcMain.handle('get-device-metrics', async (_, deviceId: number, hours?: number) => {
  return metrics.getDeviceMetrics(deviceId, hours || 24);
});

ipcMain.handle('get-all-metrics', async (_, hours?: number) => {
  return metrics.getAllMetrics(hours || 24);
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

// IPC Handlers - Tunnel Status
ipcMain.handle('get-tunnel-status', async () => {
  return tunnel.getTunnelStatus();
});

ipcMain.handle('start-tunnel', async () => {
  return tunnel.startTunnel();
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
ipcMain.handle('get-network-stats', async () => {
  return profitability.fetchNetworkStats();
});

ipcMain.handle('get-electricity-cost', async () => {
  const cost = settings.getSetting('electricity_cost');
  return cost ? parseFloat(cost) : 0.12; // Default to $0.12/kWh
});

ipcMain.handle('set-electricity-cost', async (_, cost: number) => {
  settings.setSetting('electricity_cost', cost.toString());
  return true;
});

ipcMain.handle('calculate-profitability', async (_, hashrateGH: number, powerWatts: number, btcPriceUsd: number, electricityCost?: number) => {
  return profitability.calculateProfitability(hashrateGH, powerWatts, btcPriceUsd, electricityCost);
});
