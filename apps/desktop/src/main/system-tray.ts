import { Tray, Menu, nativeImage, BrowserWindow, app } from 'electron';
import { join } from 'path';
import { readdirSync } from 'fs';
import * as devices from './database/devices';

let tray: Tray | null = null;

// Find logo file (handles vite's hashed filenames like logo-Bpla9I2K.png)
function findLogoFile(): string | null {
  const assetsDir = join(__dirname, '..', 'renderer', 'assets');
  try {
    const files = readdirSync(assetsDir);
    const logoFile = files.find(f => f.startsWith('logo') && f.endsWith('.png'));
    if (logoFile) {
      return join(assetsDir, logoFile);
    }
  } catch (e) {
    console.error('Failed to find logo file:', e);
  }
  return null;
}
let mainWindow: BrowserWindow | null = null;
let minimizeToTray = true;

interface DeviceStats {
  online: number;
  total: number;
  totalHashrate: number;
  totalPower: number;
}

let currentStats: DeviceStats = {
  online: 0,
  total: 0,
  totalHashrate: 0,
  totalPower: 0
};

/**
 * Create the system tray icon and menu
 */
export function createTray(window: BrowserWindow): Tray {
  mainWindow = window;

  // Create tray icon - dynamically find the logo file
  const iconPath = findLogoFile();
  if (!iconPath) {
    console.error('Could not find logo file for system tray');
  }

  // Create a smaller icon for the tray
  let icon = iconPath ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();

  // Resize icon for tray (Windows uses 16x16, macOS uses 22x22)
  const size = process.platform === 'darwin' ? 22 : 16;
  icon = icon.resize({ width: size, height: size });

  // Set as template on macOS for proper dark/light mode support
  if (process.platform === 'darwin') {
    icon.setTemplateImage(true);
  }

  tray = new Tray(icon);
  tray.setToolTip('AxeOS VPN Monitor');

  // Update the context menu
  updateTrayMenu();

  // Double-click to show window
  tray.on('double-click', () => {
    showWindow();
  });

  // Set up periodic stats refresh
  setInterval(updateStats, 5000);
  updateStats();

  return tray;
}

/**
 * Update device stats for tray display
 */
function updateStats(): void {
  const allDevices = devices.getAllDevices();
  const onlineDevices = allDevices.filter(d => d.is_online === 1);

  currentStats = {
    online: onlineDevices.length,
    total: allDevices.length,
    totalHashrate: 0,
    totalPower: 0
  };

  // Update tooltip
  if (tray) {
    const tooltip = `AxeOS VPN Monitor\n${currentStats.online}/${currentStats.total} devices online`;
    tray.setToolTip(tooltip);
  }
}

/**
 * Update the tray context menu
 */
function updateTrayMenu(): void {
  if (!tray) return;

  const contextMenu = Menu.buildFromTemplate([
    {
      label: `AxeOS VPN Monitor`,
      enabled: false,
      icon: undefined
    },
    { type: 'separator' },
    {
      label: `${currentStats.online}/${currentStats.total} Devices Online`,
      enabled: false
    },
    { type: 'separator' },
    {
      label: mainWindow?.isVisible() ? 'Hide Window' : 'Show Window',
      click: () => {
        if (mainWindow?.isVisible()) {
          mainWindow.hide();
        } else {
          showWindow();
        }
        updateTrayMenu();
      }
    },
    {
      label: 'Minimize to Tray',
      type: 'checkbox',
      checked: minimizeToTray,
      click: (item) => {
        minimizeToTray = item.checked;
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        // Force quit without minimize to tray
        app.exit(0);
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
}

/**
 * Show the main window
 */
function showWindow(): void {
  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.show();
    mainWindow.focus();
  }
}

/**
 * Handle window close - minimize to tray instead of quitting
 */
export function handleWindowClose(event: Electron.Event): boolean {
  if (minimizeToTray && mainWindow) {
    event.preventDefault();
    mainWindow.hide();
    updateTrayMenu();
    return true;
  }
  return false;
}

/**
 * Check if minimize to tray is enabled
 */
export function isMinimizeToTrayEnabled(): boolean {
  return minimizeToTray;
}

/**
 * Set minimize to tray setting
 */
export function setMinimizeToTray(enabled: boolean): void {
  minimizeToTray = enabled;
  updateTrayMenu();
}

/**
 * Destroy the tray icon
 */
export function destroyTray(): void {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

/**
 * Update device metrics for tray display (called from poller)
 */
export function updateDeviceMetrics(deviceId: string, hashrate: number, power: number): void {
  // This will be called by the poller when metrics come in
  // We could track individual device metrics here if needed
  updateStats();
  updateTrayMenu();
}
