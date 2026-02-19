import { useState, useEffect } from 'react';
import { useServerStore } from '../stores/serverStore';
import { QRCodeDisplay } from '../components/QRCodeDisplay';

interface TunnelStatus {
  enabled: boolean;
  url: string | null;
  isStarting: boolean;
}

// Theme definitions
const THEMES = [
  {
    id: 'vault-tec',
    name: 'Vault-Tec',
    description: 'Classic yellow/green',
    colors: {
      bg: '#0a1929',
      accent: '#FFB000',
      success: '#00FF41',
    },
  },
  {
    id: 'nuka-cola',
    name: 'Nuka-Cola',
    description: 'Red/pink tones',
    colors: {
      bg: '#1a0a0a',
      accent: '#FF3131',
      success: '#FF6B6B',
    },
  },
  {
    id: 'brotherhood',
    name: 'Brotherhood',
    description: 'Blue/silver military',
    colors: {
      bg: '#0a0a1a',
      accent: '#4A90D9',
      success: '#87CEEB',
    },
  },
  {
    id: 'institute',
    name: 'Institute',
    description: 'Clean white/teal',
    colors: {
      bg: '#f0f0f0',
      accent: '#00A0A0',
      success: '#00CED1',
    },
  },
  {
    id: 'ncr',
    name: 'NCR',
    description: 'Desert tan/brown',
    colors: {
      bg: '#1a1408',
      accent: '#C4A35A',
      success: '#8B7355',
    },
  },
  {
    id: 'enclave',
    name: 'Enclave',
    description: 'Dark patriotic',
    colors: {
      bg: '#0a0a14',
      accent: '#B22222',
      success: '#FFD700',
    },
  },
];

export function SettingsPage() {
  const { status, fetchStatus } = useServerStore();
  const [appVersion, setAppVersion] = useState('');
  const [isRestartingServer, setIsRestartingServer] = useState(false);

  // Tunnel state
  const [tunnelStatus, setTunnelStatus] = useState<TunnelStatus | null>(null);
  const [isStartingTunnel, setIsStartingTunnel] = useState(false);
  const [tunnelError, setTunnelError] = useState<string | null>(null);

  // Password state
  const [isPasswordSet, setIsPasswordSet] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // System Tray state
  const [minimizeToTray, setMinimizeToTray] = useState(true);

  // Alert state
  const [alertConfig, setAlertConfig] = useState({
    deviceOffline: true,
    temperatureThreshold: 70,
    temperatureEnabled: true,
    hashrateDropPercent: 20,
    hashrateEnabled: true,
    notificationsEnabled: true
  });
  const [notificationTestResult, setNotificationTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Theme state
  const [currentTheme, setCurrentTheme] = useState('vault-tec');
  const [scanlinesEnabled, setScanlinesEnabled] = useState(true);

  // Update check state
  const [updateStatus, setUpdateStatus] = useState<{
    checking: boolean;
    hasUpdate: boolean;
    latestVersion: string | null;
    downloadUrl: string | null;
    error: string | null;
  }>({
    checking: false,
    hasUpdate: false,
    latestVersion: null,
    downloadUrl: null,
    error: null
  });

  useEffect(() => {
    window.electronAPI.getAppVersion().then(setAppVersion);
    fetchStatus();
    loadTunnelStatus();
    loadPasswordStatus();
    loadTraySettings();
    loadAlertConfig();
    loadTheme();
  }, []);

  const loadTheme = async () => {
    const settings = await window.electronAPI.getSettings();
    if (settings.theme) {
      setCurrentTheme(settings.theme);
    }
    // Load scanlines setting (default to true if not set)
    const scanlines = settings.scanlinesEnabled !== false;
    setScanlinesEnabled(scanlines);
    // Apply scanlines state to body
    if (!scanlines) {
      document.body.classList.add('scanline-disabled');
    }
  };

  const checkForUpdates = async () => {
    setUpdateStatus(prev => ({ ...prev, checking: true, error: null }));
    try {
      const result = await window.electronAPI.checkForUpdates();
      setUpdateStatus({
        checking: false,
        hasUpdate: result.hasUpdate,
        latestVersion: result.latestVersion,
        downloadUrl: result.downloadUrl,
        error: result.error || null
      });
    } catch (err) {
      setUpdateStatus(prev => ({
        ...prev,
        checking: false,
        error: err instanceof Error ? err.message : 'Failed to check for updates'
      }));
    }
  };

  const handleThemeChange = async (themeId: string) => {
    setCurrentTheme(themeId);
    await window.electronAPI.setSetting('theme', themeId);
    // Apply theme to document
    document.documentElement.className = `theme-${themeId}`;
  };

  const handleScanlinesChange = async (enabled: boolean) => {
    setScanlinesEnabled(enabled);
    await window.electronAPI.setSetting('scanlinesEnabled', enabled);
    // Apply scanlines state to body
    if (enabled) {
      document.body.classList.remove('scanline-disabled');
    } else {
      document.body.classList.add('scanline-disabled');
    }
  };

  const loadTraySettings = async () => {
    const enabled = await window.electronAPI.getMinimizeToTray();
    setMinimizeToTray(enabled);
  };

  const handleMinimizeToTrayChange = async (enabled: boolean) => {
    setMinimizeToTray(enabled);
    await window.electronAPI.setMinimizeToTray(enabled);
  };

  const loadAlertConfig = async () => {
    const config = await window.electronAPI.getAlertConfig();
    setAlertConfig(config);
  };

  const handleAlertConfigChange = async (key: string, value: boolean | number) => {
    const newConfig = { ...alertConfig, [key]: value };
    setAlertConfig(newConfig);
    await window.electronAPI.setAlertConfig({ [key]: value });
  };

  const handleTestNotification = async () => {
    setNotificationTestResult(null);
    const result = await window.electronAPI.testAlertNotification();
    setNotificationTestResult(result);
    // Clear the message after 5 seconds
    setTimeout(() => setNotificationTestResult(null), 5000);
  };

  const loadTunnelStatus = async () => {
    const status = await window.electronAPI.getTunnelStatus();
    setTunnelStatus(status);
  };

  const loadPasswordStatus = async () => {
    const isSet = await window.electronAPI.isPasswordSet();
    setIsPasswordSet(isSet);
  };

  const handleStartTunnel = async () => {
    setIsStartingTunnel(true);
    setTunnelError(null);
    try {
      const result = await window.electronAPI.startTunnel();
      if (result.success) {
        await loadTunnelStatus();
      } else {
        setTunnelError(result.error || 'Failed to start tunnel');
      }
    } catch (err) {
      setTunnelError(err instanceof Error ? err.message : 'Failed to start tunnel');
    } finally {
      setIsStartingTunnel(false);
    }
  };

  const handleStopTunnel = async () => {
    await window.electronAPI.stopTunnel();
    await loadTunnelStatus();
  };

  const handleRestartServer = async () => {
    setIsRestartingServer(true);
    try {
      await window.electronAPI.restartServer();
      await fetchStatus();
    } finally {
      setIsRestartingServer(false);
    }
  };

  const openUrl = (url: string) => {
    window.electronAPI.openExternal(url);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const handleChangePassword = async () => {
    setPasswordError(null);
    setPasswordSuccess(null);

    if (newPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match');
      return;
    }

    setIsSavingPassword(true);
    try {
      const result = await window.electronAPI.changePassword(currentPassword, newPassword);
      if (result.success) {
        setPasswordSuccess('Password changed successfully');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setShowPasswordForm(false);
      } else {
        setPasswordError(result.error || 'Failed to change password');
      }
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setIsSavingPassword(false);
    }
  };

  const handleResetPassword = async () => {
    await window.electronAPI.resetPassword();
    setIsPasswordSet(false);
    setShowResetConfirm(false);
    await fetchStatus();
  };

  return (
    <div className="p-6 space-y-6 animate-page-glitch">
      <h1 className="text-2xl font-bold text-text-primary">Settings</h1>

      {/* Server Status Section */}
      <section className="rounded-xl bg-bg-secondary border border-border overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="text-lg font-medium text-text-primary">Local Network Access</h2>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${status?.running ? 'bg-success' : 'bg-danger'}`} />
            <span className="text-sm text-text-secondary">
              {status?.running ? 'Running' : 'Stopped'}
            </span>
          </div>
        </div>
        <div className="p-4 space-y-4">
          <p className="text-sm text-text-secondary">
            Access your dashboard from any device on your local network using these addresses.
          </p>
          <div>
            <label className="block text-sm text-text-secondary mb-2">Network Addresses</label>
            <div className="space-y-2">
              {status?.addresses.map((addr, i) => {
                const url = `http://${addr}:${status.port}`;
                return (
                  <div
                    key={i}
                    className="flex items-center gap-2 p-2 rounded-lg bg-bg-primary border border-border hover:border-accent transition-colors group"
                  >
                    <span
                      className="flex-1 font-mono text-sm text-accent cursor-pointer hover:underline"
                      onClick={() => openUrl(url)}
                    >
                      {url}
                    </span>
                    <button
                      onClick={() => openUrl(url)}
                      className="p-1.5 rounded hover:bg-bg-tertiary text-text-secondary hover:text-accent transition-colors"
                      title="Open in browser"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </button>
                    <button
                      onClick={() => {
                        copyToClipboard(url);
                      }}
                      className="p-1.5 rounded hover:bg-bg-tertiary text-text-secondary hover:text-accent transition-colors"
                      title="Copy to clipboard"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
          {/* QR Code for Local Network Access */}
          {status?.addresses && status.addresses.length > 0 && (
            <div className="flex justify-center">
              <QRCodeDisplay url={`http://${status.addresses[0]}:${status.port}`} />
            </div>
          )}
          <div className="flex items-center gap-4">
            <div>
              <label className="block text-sm text-text-secondary mb-1">Port</label>
              <div className="text-text-primary font-mono">{status?.port || '--'}</div>
            </div>
            <button
              onClick={handleRestartServer}
              disabled={isRestartingServer}
              className="ml-auto px-4 py-2 rounded-lg border border-border text-text-secondary hover:bg-bg-tertiary transition-colors disabled:opacity-50"
            >
              {isRestartingServer ? 'Restarting...' : 'Restart Server'}
            </button>
          </div>
        </div>
      </section>

      {/* Remote Access (Cloudflare Tunnel) */}
      <section className="rounded-xl bg-bg-secondary border border-border overflow-hidden">
        <div className="p-4 border-b border-border">
          <h2 className="text-lg font-medium text-text-primary">Remote Access (Internet)</h2>
        </div>
        <div className="p-4 space-y-4">
          <p className="text-sm text-text-secondary">
            Access your dashboard from anywhere on the internet using a secure Cloudflare tunnel.
            No port forwarding or router configuration required.
          </p>

          {tunnelError && (
            <div className="p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm">
              {tunnelError}
            </div>
          )}

          {tunnelStatus?.enabled && tunnelStatus.url ? (
            <div className="p-4 rounded-lg bg-success/10 border border-success/20">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-success">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-sm font-medium">Remote Access Active</span>
                </div>
                <button
                  onClick={handleStopTunnel}
                  className="px-3 py-1 rounded text-xs bg-danger/20 text-danger hover:bg-danger/30 transition-colors"
                >
                  Disconnect
                </button>
              </div>
              <div className="flex items-center gap-2">
                <div
                  className="text-sm font-mono text-accent cursor-pointer hover:underline break-all flex items-center gap-2 flex-1"
                  onClick={() => openUrl(tunnelStatus.url!)}
                >
                  {tunnelStatus.url}
                  <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </div>
                <button
                  onClick={() => navigator.clipboard.writeText(tunnelStatus.url!)}
                  className="p-1.5 rounded hover:bg-bg-tertiary text-text-secondary hover:text-accent transition-colors flex-shrink-0"
                  title="Copy to clipboard"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
              </div>
              <QRCodeDisplay url={tunnelStatus.url} />
            </div>
          ) : (
            <button
              onClick={handleStartTunnel}
              disabled={isStartingTunnel || tunnelStatus?.isStarting}
              className="w-full py-3 px-4 rounded-lg bg-accent text-bg-primary font-medium hover:bg-accent-hover transition-colors disabled:opacity-50"
            >
              {isStartingTunnel || tunnelStatus?.isStarting ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Starting Tunnel...
                </span>
              ) : (
                'Enable Remote Access'
              )}
            </button>
          )}

          <div className="p-3 rounded-lg bg-bg-primary">
            <p className="text-sm text-text-secondary">
              <strong className="text-text-primary">Note:</strong> The tunnel URL is temporary and changes each time you enable it.
              Remote access is protected by password authentication.
              {status?.setupRequired ? (
                <span className="text-warning"> Password not yet set.</span>
              ) : (
                <span className="text-success"> Password is configured.</span>
              )}
            </p>
          </div>
        </div>
      </section>

      {/* Password Management */}
      <section className="rounded-xl bg-bg-secondary border border-border overflow-hidden">
        <div className="p-4 border-b border-border">
          <h2 className="text-lg font-medium text-text-primary">Security</h2>
        </div>
        <div className="p-4 space-y-4">
          <p className="text-sm text-text-secondary">
            Password protects remote access to your dashboard when using Cloudflare Tunnel or accessing from other devices.
          </p>

          {passwordSuccess && (
            <div className="p-3 rounded-lg bg-success/10 border border-success/20 text-success text-sm">
              {passwordSuccess}
            </div>
          )}

          {passwordError && (
            <div className="p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm">
              {passwordError}
            </div>
          )}

          {isPasswordSet ? (
            <>
              <div className="flex items-center gap-2 text-success">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <span className="text-sm font-medium">Password is set</span>
              </div>

              {showPasswordForm ? (
                <div className="space-y-3">
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-bg-primary border border-border text-text-primary focus:outline-none focus:border-accent"
                    placeholder="Current password"
                  />
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-bg-primary border border-border text-text-primary focus:outline-none focus:border-accent"
                    placeholder="New password (min 6 characters)"
                  />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-bg-primary border border-border text-text-primary focus:outline-none focus:border-accent"
                    placeholder="Confirm new password"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleChangePassword}
                      disabled={isSavingPassword}
                      className="px-4 py-2 rounded-lg bg-accent text-bg-primary font-medium hover:bg-accent-hover transition-colors disabled:opacity-50"
                    >
                      {isSavingPassword ? 'Saving...' : 'Save Password'}
                    </button>
                    <button
                      onClick={() => {
                        setShowPasswordForm(false);
                        setCurrentPassword('');
                        setNewPassword('');
                        setConfirmPassword('');
                        setPasswordError(null);
                      }}
                      className="px-4 py-2 rounded-lg border border-border text-text-secondary hover:bg-bg-tertiary transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowPasswordForm(true)}
                    className="px-4 py-2 rounded-lg border border-border text-text-secondary hover:bg-bg-tertiary transition-colors"
                  >
                    Change Password
                  </button>
                  <button
                    onClick={() => setShowResetConfirm(true)}
                    className="px-4 py-2 rounded-lg border border-danger/50 text-danger hover:bg-danger/10 transition-colors"
                  >
                    Reset Password
                  </button>
                </div>
              )}

              {showResetConfirm && (
                <div className="p-4 rounded-lg bg-danger/10 border border-danger/20">
                  <p className="text-sm text-danger mb-3">
                    Are you sure you want to reset your password? You will need to set a new password to access remotely.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleResetPassword}
                      className="px-4 py-2 rounded-lg bg-danger text-white font-medium hover:bg-danger/80 transition-colors"
                    >
                      Yes, Reset Password
                    </button>
                    <button
                      onClick={() => setShowResetConfirm(false)}
                      className="px-4 py-2 rounded-lg border border-border text-text-secondary hover:bg-bg-tertiary transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="p-3 rounded-lg bg-warning/10 border border-warning/20">
              <div className="flex items-center gap-2 text-warning mb-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span className="text-sm font-medium">No password set</span>
              </div>
              <p className="text-xs text-text-secondary">
                Enable Remote Access and set a password through the web interface to secure your dashboard.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Appearance / Theme Selector */}
      <section className="rounded-xl bg-bg-secondary border border-border overflow-hidden">
        <div className="p-4 border-b border-border">
          <h2 className="text-lg font-medium text-text-primary">Appearance</h2>
        </div>
        <div className="p-4 space-y-4">
          <p className="text-sm text-text-secondary">
            Choose a color theme for your dashboard. Changes apply immediately.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {THEMES.map((theme) => (
              <button
                key={theme.id}
                onClick={() => handleThemeChange(theme.id)}
                className={`p-3 rounded-lg border-2 transition-all text-left ${
                  currentTheme === theme.id
                    ? 'border-accent bg-accent/10'
                    : 'border-border hover:border-accent/50 bg-bg-primary'
                }`}
              >
                {/* Color preview */}
                <div className="flex gap-1 mb-2">
                  <div
                    className="w-6 h-6 rounded"
                    style={{ backgroundColor: theme.colors.bg }}
                    title="Background"
                  />
                  <div
                    className="w-6 h-6 rounded"
                    style={{ backgroundColor: theme.colors.accent }}
                    title="Accent"
                  />
                  <div
                    className="w-6 h-6 rounded"
                    style={{ backgroundColor: theme.colors.success }}
                    title="Success"
                  />
                </div>
                <div className="text-sm font-medium text-text-primary">{theme.name}</div>
                <div className="text-xs text-text-secondary">{theme.description}</div>
                {currentTheme === theme.id && (
                  <div className="mt-2 flex items-center gap-1 text-xs text-accent">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    Active
                  </div>
                )}
              </button>
            ))}
          </div>

          {/* Scanlines Toggle */}
          <div className="pt-4 border-t border-border/30">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-text-primary">CRT Scanlines</div>
                <div className="text-xs text-text-secondary">
                  Animated scanline overlay for retro CRT effect
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={scanlinesEnabled}
                  onChange={(e) => handleScanlinesChange(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-bg-tertiary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-text-secondary after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent peer-checked:after:bg-bg-primary"></div>
              </label>
            </div>
          </div>
        </div>
      </section>

      {/* Keyboard Shortcuts */}
      <section className="rounded-xl bg-bg-secondary border border-border overflow-hidden">
        <div className="p-4 border-b border-border">
          <h2 className="text-lg font-medium text-text-primary">Keyboard Shortcuts</h2>
        </div>
        <div className="p-4">
          <div className="space-y-2">
            {[
              { key: 'Ctrl+R', action: 'Refresh data' },
              { key: 'Ctrl+,', action: 'Open settings' },
              { key: 'Escape', action: 'Close modal' },
            ].map(({ key, action }) => (
              <div key={key} className="flex items-center justify-between py-2">
                <span className="text-text-secondary">{action}</span>
                <kbd className="px-2 py-1 rounded bg-bg-primary text-xs text-text-primary font-mono">
                  {key}
                </kbd>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Application Settings */}
      <section className="rounded-xl bg-bg-secondary border border-border overflow-hidden">
        <div className="p-4 border-b border-border">
          <h2 className="text-lg font-medium text-text-primary">Application</h2>
        </div>
        <div className="p-4 space-y-4">
          {/* Minimize to Tray */}
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-text-primary">Minimize to System Tray</div>
              <div className="text-xs text-text-secondary">
                When enabled, closing the window will minimize to the system tray instead of quitting
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={minimizeToTray}
                onChange={(e) => handleMinimizeToTrayChange(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-bg-tertiary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-text-secondary after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent peer-checked:after:bg-bg-primary"></div>
            </label>
          </div>
        </div>
      </section>

      {/* Alert Settings */}
      <section className="rounded-xl bg-bg-secondary border border-border overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="text-lg font-medium text-text-primary">Alerts & Notifications</h2>
          <button
            onClick={handleTestNotification}
            className="px-3 py-1 text-xs rounded bg-accent/20 text-accent border border-accent/30 hover:bg-accent/30 transition-colors"
          >
            Test Notification
          </button>
        </div>
        {notificationTestResult && (
          <div className={`mx-4 mb-4 p-3 rounded text-sm ${notificationTestResult.success ? 'bg-success/10 text-success border border-success/20' : 'bg-warning/10 text-warning border border-warning/20'}`}>
            {notificationTestResult.message}
          </div>
        )}
        <div className="p-4 space-y-4">
          {/* Master Notifications Toggle */}
          <div className="flex items-center justify-between pb-4 border-b border-border/30">
            <div>
              <div className="text-sm font-medium text-text-primary">Desktop Notifications</div>
              <div className="text-xs text-text-secondary">
                Show system notifications for alerts
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={alertConfig.notificationsEnabled}
                onChange={(e) => handleAlertConfigChange('notificationsEnabled', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-bg-tertiary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-text-secondary after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent peer-checked:after:bg-bg-primary"></div>
            </label>
          </div>

          {/* Device Offline Alert */}
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-text-primary">Device Offline Alert</div>
              <div className="text-xs text-text-secondary">
                Notify when a device goes offline
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={alertConfig.deviceOffline}
                onChange={(e) => handleAlertConfigChange('deviceOffline', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-bg-tertiary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-text-secondary after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent peer-checked:after:bg-bg-primary"></div>
            </label>
          </div>

          {/* Temperature Alert */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-text-primary">High Temperature Alert</div>
                <div className="text-xs text-text-secondary">
                  Notify when device temperature exceeds threshold
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={alertConfig.temperatureEnabled}
                  onChange={(e) => handleAlertConfigChange('temperatureEnabled', e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-bg-tertiary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-text-secondary after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent peer-checked:after:bg-bg-primary"></div>
              </label>
            </div>
            {alertConfig.temperatureEnabled && (
              <div className="flex items-center gap-2 ml-4">
                <span className="text-xs text-text-secondary">Threshold:</span>
                <input
                  type="number"
                  value={alertConfig.temperatureThreshold}
                  onChange={(e) => handleAlertConfigChange('temperatureThreshold', parseInt(e.target.value) || 70)}
                  min={50}
                  max={100}
                  className="w-16 px-2 py-1 text-xs font-mono bg-bg-primary border border-border rounded focus:border-accent focus:outline-none"
                />
                <span className="text-xs text-text-secondary">°C</span>
              </div>
            )}
          </div>

          {/* Hashrate Drop Alert */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-text-primary">Hashrate Drop Alert</div>
                <div className="text-xs text-text-secondary">
                  Notify when hashrate drops significantly
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={alertConfig.hashrateEnabled}
                  onChange={(e) => handleAlertConfigChange('hashrateEnabled', e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-bg-tertiary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-text-secondary after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent peer-checked:after:bg-bg-primary"></div>
              </label>
            </div>
            {alertConfig.hashrateEnabled && (
              <div className="flex items-center gap-2 ml-4">
                <span className="text-xs text-text-secondary">Drop threshold:</span>
                <input
                  type="number"
                  value={alertConfig.hashrateDropPercent}
                  onChange={(e) => handleAlertConfigChange('hashrateDropPercent', parseInt(e.target.value) || 20)}
                  min={5}
                  max={90}
                  className="w-16 px-2 py-1 text-xs font-mono bg-bg-primary border border-border rounded focus:border-accent focus:outline-none"
                />
                <span className="text-xs text-text-secondary">%</span>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* About Section */}
      <section className="rounded-xl bg-bg-secondary border border-border overflow-hidden">
        <div className="p-4 border-b border-border">
          <h2 className="text-lg font-medium text-text-primary">About</h2>
        </div>
        <div className="p-4 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <label className="block text-sm text-text-secondary mb-1">Version</label>
              <div className="text-text-primary font-mono text-lg">{appVersion || 'Unknown'}</div>
            </div>
            <button
              onClick={checkForUpdates}
              disabled={updateStatus.checking}
              className="px-4 py-2 rounded-lg border border-border text-text-secondary hover:bg-bg-tertiary hover:text-accent transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {updateStatus.checking ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Checking...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Check for Updates
                </>
              )}
            </button>
          </div>

          {/* Update Status */}
          {updateStatus.error && (
            <div className="p-3 rounded-lg bg-warning/10 border border-warning/20 text-warning text-sm">
              {updateStatus.error}
            </div>
          )}

          {updateStatus.hasUpdate && updateStatus.latestVersion && (
            <div className="p-4 rounded-lg bg-accent/10 border border-accent/30">
              <div className="flex items-center gap-2 text-accent mb-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                </svg>
                <span className="font-medium">Update Available!</span>
              </div>
              <p className="text-sm text-text-secondary mb-3">
                Version <span className="text-accent font-mono">{updateStatus.latestVersion}</span> is available.
                You are currently running <span className="font-mono">{appVersion}</span>.
              </p>
              {updateStatus.downloadUrl && (
                <button
                  onClick={() => window.electronAPI.openExternal(updateStatus.downloadUrl!)}
                  className="px-4 py-2 rounded-lg bg-accent text-bg-primary font-medium hover:bg-accent-hover transition-colors"
                >
                  Download Update
                </button>
              )}
            </div>
          )}

          {!updateStatus.checking && !updateStatus.hasUpdate && updateStatus.latestVersion && (
            <div className="p-3 rounded-lg bg-success/10 border border-success/20 flex items-center gap-2 text-success text-sm">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              You're running the latest version!
            </div>
          )}

          <div className="pt-2 border-t border-border/30">
            <label className="block text-sm text-text-secondary mb-1">Platform</label>
            <div className="text-text-primary">{navigator.platform}</div>
          </div>

          <div>
            <label className="block text-sm text-text-secondary mb-1">GitHub</label>
            <button
              onClick={() => window.electronAPI.openExternal('https://github.com/ShaeOJ/AxeOS-VPN')}
              className="text-accent hover:underline text-sm flex items-center gap-1"
            >
              ShaeOJ/AxeOS-VPN
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </button>
          </div>

          <div className="pt-3 border-t border-border/30">
            <label className="block text-sm text-text-secondary mb-2">Support Development</label>
            <button
              onClick={() => window.electronAPI.openExternal('https://buymeacoffee.com/shaeoj')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#FFDD00] text-[#000000] font-medium hover:bg-[#FFDD00]/90 transition-colors"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.216 6.415l-.132-.666c-.119-.598-.388-1.163-1.001-1.379-.197-.069-.42-.098-.57-.241-.152-.143-.196-.366-.231-.572-.065-.378-.125-.756-.192-1.133-.057-.325-.102-.69-.25-.987-.195-.4-.597-.634-.996-.788a5.723 5.723 0 00-.626-.194c-1-.263-2.05-.36-3.077-.416a25.834 25.834 0 00-3.7.062c-.915.083-1.88.184-2.75.5-.318.116-.646.256-.888.501-.297.302-.393.77-.177 1.146.154.267.415.456.692.58.36.162.737.284 1.123.366 1.075.238 2.189.331 3.287.37 1.218.05 2.437.01 3.65-.118.299-.033.598-.073.896-.119.352-.054.578-.513.474-.834-.124-.383-.457-.531-.834-.473-.466.074-.96.108-1.382.146-1.177.08-2.358.082-3.536.006a22.228 22.228 0 01-1.157-.107c-.086-.01-.18-.025-.258-.036-.243-.036-.484-.08-.724-.13-.111-.027-.111-.185 0-.212h.005c.277-.06.557-.108.838-.147h.002c.131-.009.263-.032.394-.048a25.076 25.076 0 013.426-.12c.674.019 1.347.067 2.017.144l.228.031c.267.04.533.088.798.145.392.085.895.113 1.07.542.055.137.08.288.111.431l.319 1.484a.237.237 0 01-.199.284h-.003c-.037.006-.075.01-.112.015a36.704 36.704 0 01-4.743.295 37.059 37.059 0 01-4.699-.304c-.14-.017-.293-.042-.417-.06-.326-.048-.649-.108-.973-.161-.393-.065-.768-.032-1.123.161-.29.16-.527.404-.675.701-.154.316-.199.66-.267 1-.069.34-.176.707-.135 1.056.087.753.613 1.365 1.37 1.502a39.69 39.69 0 0011.343.376.483.483 0 01.535.53l-.071.697-1.018 9.907c-.041.41-.047.832-.125 1.237-.122.637-.553 1.028-1.182 1.171-.577.131-1.165.2-1.756.205-.656.004-1.31-.025-1.966-.022-.699.004-1.556-.06-2.095-.58-.475-.458-.54-1.174-.605-1.793l-.731-7.013-.322-3.094c-.037-.351-.286-.695-.678-.678-.336.015-.718.3-.678.679l.228 2.185.949 9.112c.147 1.344 1.174 2.068 2.446 2.272.742.12 1.503.144 2.257.156.966.016 1.942.053 2.892-.122 1.408-.258 2.465-1.198 2.616-2.657.34-3.332.683-6.663 1.024-9.995l.215-2.087a.484.484 0 01.39-.426c.402-.078.787-.212 1.074-.518.455-.488.546-1.124.385-1.766zm-1.478.772c-.145.137-.363.201-.578.233-2.416.359-4.866.54-7.308.46-1.748-.06-3.477-.254-5.207-.498-.17-.024-.353-.055-.47-.18-.22-.236-.111-.71-.054-.995.052-.26.152-.609.463-.646.484-.057 1.046.148 1.526.22.577.088 1.156.159 1.737.212 2.48.226 5.002.19 7.472-.14.45-.06.899-.13 1.345-.21.399-.072.84-.206 1.08.206.166.281.188.657.162.974a.544.544 0 01-.169.364zm-6.159 3.9c-.862.37-1.84.788-3.109.788a5.884 5.884 0 01-1.569-.217l.877 9.004c.065.78.717 1.38 1.5 1.38 0 0 1.243.065 1.658.065.447 0 1.786-.065 1.786-.065.783 0 1.434-.6 1.499-1.38l.94-9.95a3.996 3.996 0 00-1.322-.238c-.826 0-1.491.284-2.26.613z"/>
              </svg>
              Buy Me a Coffee
            </button>
          </div>
        </div>
      </section>

      {/* Reset App Data */}
      <section className="rounded-xl bg-bg-secondary border border-danger/30 overflow-hidden">
        <div className="p-4 border-b border-danger/30">
          <h2 className="text-lg font-medium text-danger">Danger Zone</h2>
        </div>
        <div className="p-4 space-y-4">
          <p className="text-sm text-text-secondary">
            Reset the application to its initial state. This will delete all devices, metrics, settings, and passwords.
            The app will restart automatically.
          </p>
          <button
            onClick={() => {
              if (confirm('Are you sure you want to reset all app data? This cannot be undone.')) {
                window.electronAPI.resetAppData();
              }
            }}
            className="px-4 py-2 rounded-lg bg-danger text-white font-medium hover:bg-danger/80 transition-colors"
          >
            Reset App Data
          </button>
        </div>
      </section>
    </div>
  );
}
