import { Notification, BrowserWindow } from 'electron';
import * as settings from './database/settings';

export interface AlertConfig {
  deviceOffline: boolean;
  temperatureThreshold: number; // Celsius
  temperatureEnabled: boolean;
  hashrateDropPercent: number; // Percentage drop to trigger alert
  hashrateEnabled: boolean;
  notificationsEnabled: boolean;
}

interface DeviceState {
  lastOnline: boolean;
  lastHashrate: number;
  lastTemp: number;
  hashrateBaseline: number; // Rolling baseline for comparison
  alertCooldown: Map<string, number>; // Alert type -> timestamp of last alert
}

const deviceStates: Map<string, DeviceState> = new Map();
const ALERT_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes between same alerts

let alertConfig: AlertConfig = {
  deviceOffline: true,
  temperatureThreshold: 70,
  temperatureEnabled: true,
  hashrateDropPercent: 20,
  hashrateEnabled: true,
  notificationsEnabled: true
};

let mainWindow: BrowserWindow | null = null;

/**
 * Initialize the alert system
 */
export async function initialize(window: BrowserWindow): Promise<void> {
  mainWindow = window;
  await loadConfig();
}

/**
 * Load alert configuration from settings
 */
async function loadConfig(): Promise<void> {
  const allSettings = settings.getAllSettings();

  alertConfig = {
    deviceOffline: allSettings['alert_device_offline'] !== 'false',
    temperatureThreshold: parseInt(allSettings['alert_temp_threshold'] || '70', 10),
    temperatureEnabled: allSettings['alert_temp_enabled'] !== 'false',
    hashrateDropPercent: parseInt(allSettings['alert_hashrate_drop'] || '20', 10),
    hashrateEnabled: allSettings['alert_hashrate_enabled'] !== 'false',
    notificationsEnabled: allSettings['alert_notifications'] !== 'false'
  };
}

/**
 * Save alert configuration to settings
 */
export async function saveConfig(config: Partial<AlertConfig>): Promise<void> {
  if (config.deviceOffline !== undefined) {
    settings.setSetting('alert_device_offline', config.deviceOffline.toString());
    alertConfig.deviceOffline = config.deviceOffline;
  }
  if (config.temperatureThreshold !== undefined) {
    settings.setSetting('alert_temp_threshold', config.temperatureThreshold.toString());
    alertConfig.temperatureThreshold = config.temperatureThreshold;
  }
  if (config.temperatureEnabled !== undefined) {
    settings.setSetting('alert_temp_enabled', config.temperatureEnabled.toString());
    alertConfig.temperatureEnabled = config.temperatureEnabled;
  }
  if (config.hashrateDropPercent !== undefined) {
    settings.setSetting('alert_hashrate_drop', config.hashrateDropPercent.toString());
    alertConfig.hashrateDropPercent = config.hashrateDropPercent;
  }
  if (config.hashrateEnabled !== undefined) {
    settings.setSetting('alert_hashrate_enabled', config.hashrateEnabled.toString());
    alertConfig.hashrateEnabled = config.hashrateEnabled;
  }
  if (config.notificationsEnabled !== undefined) {
    settings.setSetting('alert_notifications', config.notificationsEnabled.toString());
    alertConfig.notificationsEnabled = config.notificationsEnabled;
  }
}

/**
 * Get current alert configuration
 */
export function getConfig(): AlertConfig {
  return { ...alertConfig };
}

/**
 * Check if alert should be shown (respecting cooldown)
 */
function shouldShowAlert(deviceId: string, alertType: string): boolean {
  const state = deviceStates.get(deviceId);
  if (!state) return true;

  const lastAlert = state.alertCooldown.get(alertType);
  if (!lastAlert) return true;

  return Date.now() - lastAlert > ALERT_COOLDOWN_MS;
}

/**
 * Record that an alert was shown
 */
function recordAlert(deviceId: string, alertType: string): void {
  let state = deviceStates.get(deviceId);
  if (!state) {
    state = {
      lastOnline: true,
      lastHashrate: 0,
      lastTemp: 0,
      hashrateBaseline: 0,
      alertCooldown: new Map()
    };
    deviceStates.set(deviceId, state);
  }
  state.alertCooldown.set(alertType, Date.now());
}

/**
 * Show a desktop notification
 */
function showNotification(title: string, body: string): boolean {
  if (!alertConfig.notificationsEnabled) {
    console.log('[Alert] Notifications disabled, skipping:', title);
    return false;
  }

  if (Notification.isSupported()) {
    try {
      const notification = new Notification({
        title,
        body,
        icon: undefined, // Could add app icon here
        silent: false
      });

      notification.on('click', () => {
        // Show the main window when notification is clicked
        if (mainWindow) {
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.show();
          mainWindow.focus();
        }
      });

      notification.on('show', () => {
        console.log('[Alert] Notification shown:', title);
      });

      notification.on('failed', (_, error) => {
        console.error('[Alert] Notification failed:', error);
      });

      notification.show();
      return true;
    } catch (error) {
      console.error('[Alert] Failed to create notification:', error);
      return false;
    }
  } else {
    console.log('[Alert] Notifications not supported on this platform');
    return false;
  }
}

/**
 * Send alert to renderer for in-app display
 */
function sendAlertToRenderer(alert: {
  type: 'offline' | 'temperature' | 'hashrate';
  deviceId: string;
  deviceName: string;
  message: string;
  value?: number;
  threshold?: number;
}): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('device-alert', alert);
  }
}

/**
 * Process device metrics and check for alert conditions
 */
export function processDeviceMetrics(
  deviceId: string,
  deviceName: string,
  isOnline: boolean,
  hashrate: number,
  temperature: number
): void {
  let state = deviceStates.get(deviceId);

  // Initialize state for new devices
  if (!state) {
    state = {
      lastOnline: isOnline,
      lastHashrate: hashrate,
      lastTemp: temperature,
      hashrateBaseline: hashrate,
      alertCooldown: new Map()
    };
    deviceStates.set(deviceId, state);
    return; // Don't alert on first check
  }

  // Check for device offline
  if (alertConfig.deviceOffline && state.lastOnline && !isOnline) {
    if (shouldShowAlert(deviceId, 'offline')) {
      showNotification(
        'Device Offline',
        `${deviceName} has gone offline`
      );
      sendAlertToRenderer({
        type: 'offline',
        deviceId,
        deviceName,
        message: `${deviceName} has gone offline`
      });
      recordAlert(deviceId, 'offline');
    }
  }

  // Check for temperature threshold
  if (alertConfig.temperatureEnabled && isOnline && temperature > 0) {
    if (temperature >= alertConfig.temperatureThreshold) {
      if (shouldShowAlert(deviceId, 'temperature')) {
        showNotification(
          'High Temperature Warning',
          `${deviceName} temperature is ${temperature.toFixed(1)}°C (threshold: ${alertConfig.temperatureThreshold}°C)`
        );
        sendAlertToRenderer({
          type: 'temperature',
          deviceId,
          deviceName,
          message: `Temperature at ${temperature.toFixed(1)}°C`,
          value: temperature,
          threshold: alertConfig.temperatureThreshold
        });
        recordAlert(deviceId, 'temperature');
      }
    }
  }

  // Check for hashrate drop
  if (alertConfig.hashrateEnabled && isOnline && hashrate > 0 && state.hashrateBaseline > 0) {
    const dropPercent = ((state.hashrateBaseline - hashrate) / state.hashrateBaseline) * 100;

    if (dropPercent >= alertConfig.hashrateDropPercent) {
      if (shouldShowAlert(deviceId, 'hashrate')) {
        showNotification(
          'Hashrate Drop Detected',
          `${deviceName} hashrate dropped by ${dropPercent.toFixed(0)}% (${hashrate.toFixed(2)} GH/s)`
        );
        sendAlertToRenderer({
          type: 'hashrate',
          deviceId,
          deviceName,
          message: `Hashrate dropped by ${dropPercent.toFixed(0)}%`,
          value: hashrate,
          threshold: state.hashrateBaseline
        });
        recordAlert(deviceId, 'hashrate');
      }
    }
  }

  // Update state
  state.lastOnline = isOnline;
  state.lastTemp = temperature;

  // Update hashrate baseline with exponential moving average (slow adaptation)
  if (isOnline && hashrate > 0) {
    if (state.hashrateBaseline === 0) {
      state.hashrateBaseline = hashrate;
    } else {
      // Slow adaptation - 5% weight to new value
      state.hashrateBaseline = state.hashrateBaseline * 0.95 + hashrate * 0.05;
    }
    state.lastHashrate = hashrate;
  }
}

/**
 * Clear state for a device (when deleted)
 */
export function clearDeviceState(deviceId: string): void {
  deviceStates.delete(deviceId);
}

/**
 * Test notification (for settings page)
 * Returns result information for user feedback
 */
export function testNotification(): { success: boolean; message: string } {
  const notificationShown = showNotification(
    'Test Notification',
    'Alert system is working correctly!'
  );

  // Also send a test alert to the renderer for in-app display
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('device-alert', {
      type: 'offline',
      deviceId: 'test',
      deviceName: 'Test Alert',
      message: 'This is a test notification. If you see this, in-app alerts are working!'
    });
  }

  if (!alertConfig.notificationsEnabled) {
    return { success: false, message: 'Notifications are disabled in settings' };
  }

  if (!Notification.isSupported()) {
    return { success: false, message: 'System notifications not supported on this platform' };
  }

  if (notificationShown) {
    return { success: true, message: 'Test notification sent! Check your system tray/notification area.' };
  }

  return { success: false, message: 'Failed to show notification' };
}
