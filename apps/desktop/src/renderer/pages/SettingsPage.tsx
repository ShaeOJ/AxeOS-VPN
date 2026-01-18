import { useState, useEffect } from 'react';
import { useServerStore } from '../stores/serverStore';

export function SettingsPage() {
  const { status, fetchStatus, regenerateConnectionCode } = useServerStore();
  const [appVersion, setAppVersion] = useState('');
  const [isRegeneratingCode, setIsRegeneratingCode] = useState(false);
  const [isRestartingServer, setIsRestartingServer] = useState(false);

  useEffect(() => {
    window.electronAPI.getAppVersion().then(setAppVersion);
    fetchStatus();
  }, []);

  const handleRegenerateCode = async () => {
    setIsRegeneratingCode(true);
    try {
      await regenerateConnectionCode();
    } finally {
      setIsRegeneratingCode(false);
    }
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

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-text-primary">Settings</h1>

      {/* Server Status Section */}
      <section className="rounded-xl bg-bg-secondary border border-border overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="text-lg font-medium text-text-primary">Server Status</h2>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${status?.running ? 'bg-success' : 'bg-danger'}`} />
            <span className="text-sm text-text-secondary">
              {status?.running ? 'Running' : 'Stopped'}
            </span>
          </div>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm text-text-secondary mb-1">Port</label>
            <div className="text-text-primary font-mono">{status?.port || '--'}</div>
          </div>
          <div>
            <label className="block text-sm text-text-secondary mb-1">Network Addresses</label>
            <div className="space-y-1">
              {status?.addresses.map((addr, i) => (
                <div
                  key={i}
                  className="text-text-primary font-mono text-sm cursor-pointer hover:text-accent"
                  onClick={() => copyToClipboard(`${addr}:${status.port}`)}
                >
                  {addr}:{status?.port}
                </div>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm text-text-secondary mb-1">Connected Agents</label>
            <div className="text-text-primary">{status?.connectedAgents ?? 0}</div>
          </div>
          <button
            onClick={handleRestartServer}
            disabled={isRestartingServer}
            className="px-4 py-2 rounded-lg border border-border text-text-secondary hover:bg-bg-tertiary transition-colors disabled:opacity-50"
          >
            {isRestartingServer ? 'Restarting...' : 'Restart Server'}
          </button>
        </div>
      </section>

      {/* Connection Code Section */}
      <section className="rounded-xl bg-bg-secondary border border-border overflow-hidden">
        <div className="p-4 border-b border-border">
          <h2 className="text-lg font-medium text-text-primary">Connection Code</h2>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm text-text-secondary mb-2">
              Use this code when setting up agents on mining rigs
            </label>
            <div className="flex items-center gap-3">
              <div
                className="text-3xl font-mono font-bold text-accent tracking-widest cursor-pointer"
                onClick={() => status?.connectionCode && copyToClipboard(status.connectionCode)}
              >
                {status?.connectionCode || '------'}
              </div>
              <button
                onClick={handleRegenerateCode}
                disabled={isRegeneratingCode}
                className="p-2 rounded hover:bg-bg-tertiary transition-colors text-text-secondary"
                title="Generate new code"
              >
                <svg className={`w-5 h-5 ${isRegeneratingCode ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>
            <p className="text-xs text-text-secondary mt-2">Click code to copy</p>
          </div>
          <div className="p-3 rounded-lg bg-warning/10 border border-warning/20">
            <p className="text-sm text-warning">
              Regenerating the code will require re-pairing any agents that haven't connected yet.
            </p>
          </div>
        </div>
      </section>

      {/* Remote Access Section */}
      <section className="rounded-xl bg-bg-secondary border border-border overflow-hidden">
        <div className="p-4 border-b border-border">
          <h2 className="text-lg font-medium text-text-primary">Remote Web Access</h2>
        </div>
        <div className="p-4 space-y-4">
          <p className="text-sm text-text-secondary">
            Access your dashboard from any browser by visiting the server address.
            First-time access requires setting up a password.
          </p>
          {status?.addresses && status.addresses.length > 0 && (
            <div>
              <label className="block text-sm text-text-secondary mb-1">Web Dashboard URL</label>
              <div className="space-y-1">
                {status.addresses.map((addr, i) => (
                  <div
                    key={i}
                    className="text-accent font-mono text-sm cursor-pointer hover:underline"
                    onClick={() => copyToClipboard(`http://${addr}:${status.port}`)}
                  >
                    http://{addr}:{status.port}
                  </div>
                ))}
              </div>
              <p className="text-xs text-text-secondary mt-1">Click to copy</p>
            </div>
          )}
          <div className="p-3 rounded-lg bg-bg-primary">
            <p className="text-sm text-text-secondary">
              <strong className="text-text-primary">Note:</strong> Remote access is protected by password authentication.
              {status?.setupRequired ? (
                <span className="text-warning"> Password not yet set - visit the web dashboard to configure.</span>
              ) : (
                <span className="text-success"> Password is configured.</span>
              )}
            </p>
          </div>
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
