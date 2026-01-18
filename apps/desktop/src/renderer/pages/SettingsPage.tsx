import { useState, useEffect } from 'react';
import { useServerStore } from '../stores/serverStore';

interface TunnelStatus {
  enabled: boolean;
  url: string | null;
  isStarting: boolean;
}

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

  useEffect(() => {
    window.electronAPI.getAppVersion().then(setAppVersion);
    fetchStatus();
    loadTunnelStatus();
    loadPasswordStatus();
  }, []);

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
              <div
                className="text-sm font-mono text-accent cursor-pointer hover:underline break-all flex items-center gap-2"
                onClick={() => openUrl(tunnelStatus.url!)}
              >
                {tunnelStatus.url}
                <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </div>
              <p className="text-xs text-text-secondary mt-1">Click to open. Share this URL to access from anywhere.</p>
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

      {/* About Section */}
      <section className="rounded-xl bg-bg-secondary border border-border overflow-hidden">
        <div className="p-4 border-b border-border">
          <h2 className="text-lg font-medium text-text-primary">About</h2>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm text-text-secondary mb-1">Version</label>
            <div className="text-text-primary">{appVersion || 'Unknown'}</div>
          </div>
          <div>
            <label className="block text-sm text-text-secondary mb-1">Platform</label>
            <div className="text-text-primary capitalize">{navigator.platform}</div>
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
    </div>
  );
}
