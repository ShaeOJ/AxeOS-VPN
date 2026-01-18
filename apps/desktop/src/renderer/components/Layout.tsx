import { useEffect } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { useDeviceStore } from '../stores/deviceStore';
import { useServerStore } from '../stores/serverStore';

export function Layout() {
  const { devices, fetchDevices, setupMetricsListener } = useDeviceStore();
  const { status, fetchStatus } = useServerStore();

  useEffect(() => {
    // Fetch initial data
    fetchDevices();
    fetchStatus();

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
    `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
      isActive
        ? 'bg-accent/10 text-accent'
        : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'
    }`;

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-bg-secondary border-r border-border flex flex-col">
        {/* Server Status */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2 mb-2">
            <div className={`w-2 h-2 rounded-full ${status?.running ? 'bg-success' : 'bg-danger'}`} />
            <span className="text-sm text-text-secondary">
              {status?.running ? 'Server Running' : 'Server Stopped'}
            </span>
          </div>
          {status?.running && (
            <div className="text-xs text-text-secondary">
              Port {status.port} | {onlineDevices.length} device{onlineDevices.length !== 1 ? 's' : ''} online
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1">
          <NavLink to="/dashboard" className={navLinkClass}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
              />
            </svg>
            Dashboard
          </NavLink>

          <NavLink to="/settings" className={navLinkClass}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
            Settings
          </NavLink>
        </nav>

        {/* Remote Access Info */}
        <div className="p-4 border-t border-border">
          <div className="text-xs text-text-secondary mb-2">Remote Web Access</div>
          {status?.addresses && status.addresses.length > 0 && (
            <div className="text-xs font-mono text-text-primary truncate">
              http://{status.addresses[0]}:{status.port}
            </div>
          )}
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto bg-bg-primary">
        <Outlet />
      </main>
    </div>
  );
}
