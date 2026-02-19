import { useEffect } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { useDeviceStore } from '../stores/deviceStore';
import { useServerStore } from '../stores/serverStore';
import { BitcoinTicker } from './BitcoinTicker';
import { ProfitabilityDisplay } from './ProfitabilityDisplay';
import logoImage from '../assets/logo.png';

export function Layout() {
  const { devices, fetchDevices, setupMetricsListener } = useDeviceStore();
  const { status, fetchStatus } = useServerStore();

  useEffect(() => {
    // Fetch initial data
    fetchDevices();
    fetchStatus();

    // Load and apply saved theme and scanlines
    window.electronAPI.getSettings().then((settings) => {
      if (settings.theme) {
        document.documentElement.className = `theme-${settings.theme}`;
      }
      // Apply scanlines setting (default to enabled)
      if (settings.scanlinesEnabled === false) {
        document.body.classList.add('scanline-disabled');
      }
    });

    // Listen for real-time device metrics updates
    setupMetricsListener();

    // Refresh status periodically
    const interval = setInterval(() => {
      fetchStatus();
    }, 30000);

    return () => {
      clearInterval(interval);
      window.electronAPI.removeAllListeners('device-metrics');
    };
  }, []);

  const onlineDevices = devices.filter((d) => d.isOnline);

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2 px-3 py-2 transition-all duration-200 border-l-4 ${
      isActive
        ? 'bg-accent/20 text-accent border-accent'
        : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary border-transparent hover:border-accent/50'
    }`;

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Vault-Tec Sidebar */}
      <aside className="w-64 min-w-[200px] bg-bg-secondary border-r-2 border-border flex flex-col relative">
        {/* Decorative top accent */}
        <div className="h-1 flex-shrink-0 bg-gradient-to-r from-transparent via-accent to-transparent" />

        {/* Scrollable sidebar content */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col min-h-0">
          {/* Logo/Header */}
          <div className="p-3 border-b-2 border-border/50 flex-shrink-0">
            <div className="logo-glow-container">
              <img
                src={logoImage}
                alt="AxeOS VPN"
                className="w-full max-w-[120px] h-auto object-contain"
              />
            </div>
          </div>

          {/* Server Status - Pip-Boy Style */}
          <div className="p-3 border-b border-border/30 bg-bg-tertiary/30 flex-shrink-0">
            <div className="text-[10px] text-text-secondary uppercase tracking-wider mb-1">System Status</div>
            <div className="flex items-center gap-2 mb-1">
              <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${status?.running ? 'status-online' : 'status-offline'}`} />
              <span className={`text-xs font-mono ${status?.running ? 'text-success terminal-glow' : 'text-danger'}`}>
                {status?.running ? 'ONLINE' : 'OFFLINE'}
              </span>
            </div>
            {status?.running && (
              <div className="space-y-0.5">
                <div className="flex justify-between text-[10px]">
                  <span className="text-text-secondary">PORT:</span>
                  <span className="text-text-terminal font-mono">{status.port}</span>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span className="text-text-secondary">DEVICES:</span>
                  <span className="text-text-terminal font-mono">{onlineDevices.length} ACTIVE</span>
                </div>
              </div>
            )}
          </div>

          {/* Bitcoin Price Ticker */}
          <BitcoinTicker />

          {/* Mining Profitability */}
          <ProfitabilityDisplay />

          {/* Navigation */}
          <nav className="flex-1 py-2 flex-shrink-0">
            <div className="text-[10px] text-text-secondary uppercase tracking-wider px-3 mb-1">Navigation</div>

            <NavLink to="/dashboard" className={navLinkClass}>
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
                />
              </svg>
              <span className="uppercase tracking-wide text-xs">Dashboard</span>
            </NavLink>

            <NavLink to="/charts" className={navLinkClass}>
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4v16"
                />
              </svg>
              <span className="uppercase tracking-wide text-xs">Charts</span>
            </NavLink>

            <NavLink to="/settings" className={navLinkClass}>
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
              <span className="uppercase tracking-wide text-xs">Settings</span>
            </NavLink>
          </nav>
        </div>

        {/* Local Network Access Info - Terminal Style (pinned to bottom) */}
        <div className="p-3 border-t-2 border-border/50 bg-bg-terminal/30 flex-shrink-0">
          <div className="text-[10px] text-text-secondary uppercase tracking-wider mb-1">Network Access</div>
          {status?.addresses && status.addresses.length > 0 && (
            <button
              onClick={() => {
                const url = `http://${status.addresses[0]}:${status.port}`;
                window.electronAPI.openExternal(url);
              }}
              className="text-[10px] font-mono text-success terminal-glow break-all hover:text-accent transition-colors cursor-pointer text-left flex items-center gap-1 group w-full"
            >
              <span className="truncate">{status.addresses[0]}:{status.port}</span>
              <svg className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </button>
          )}
        </div>

        {/* Decorative bottom accent */}
        <div className="h-1 flex-shrink-0 bg-gradient-to-r from-transparent via-accent to-transparent" />
      </aside>

      {/* Main content with scanline animation */}
      <main className="flex-1 overflow-auto bg-bg-primary scanline-animate">
        <Outlet />
      </main>
    </div>
  );
}
