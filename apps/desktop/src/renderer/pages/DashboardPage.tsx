import { useState, useEffect } from 'react';
import { useDeviceStore } from '../stores/deviceStore';
import { useServerStore } from '../stores/serverStore';
import { DeviceCard } from '../components/DeviceCard';
import { PairingModal } from '../components/PairingModal';
import { DiscoveryModal } from '../components/DiscoveryModal';
import { GroupManager } from '../components/GroupManager';

function formatHashrate(hashrate: number | null | undefined): string {
  if (!hashrate) return '--';
  // AxeOS reports hashrate in GH/s
  if (hashrate >= 1000) return `${(hashrate / 1000).toFixed(2)} TH/s`;
  return `${hashrate.toFixed(2)} GH/s`;
}

function formatTemperature(temp: number | null | undefined): string {
  if (!temp) return '--';
  return `${temp.toFixed(1)}°C`;
}

function formatPower(power: number | null | undefined): string {
  if (!power) return '--';
  return `${power.toFixed(1)} W`;
}

function formatEfficiency(efficiency: number | null | undefined): string {
  if (!efficiency) return '--';
  return `${efficiency.toFixed(1)} J/TH`;
}

export function DashboardPage() {
  const { devices, groups, isLoading, error, fetchDevices, fetchGroups, setDeviceGroup } = useDeviceStore();
  const { status, fetchStatus } = useServerStore();
  const [showPairingModal, setShowPairingModal] = useState(false);
  const [showDiscoveryModal, setShowDiscoveryModal] = useState(false);
  const [showGroupManager, setShowGroupManager] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [networkStats, setNetworkStats] = useState<{ difficulty: number; blockReward: number; blockHeight: number } | null>(null);
  const [newRecordDevices, setNewRecordDevices] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Initial fetch - Layout handles the metrics listener
    fetchDevices();
    fetchStatus();
    fetchGroups();

    // Fetch network stats for block chance calculations
    const fetchNetworkStats = async () => {
      try {
        const stats = await window.electronAPI.getNetworkStats();
        if (stats) {
          setNetworkStats(stats);
        }
      } catch (err) {
        console.error('Failed to fetch network stats:', err);
      }
    };
    fetchNetworkStats();
    // Refresh network stats every 5 minutes
    const interval = setInterval(fetchNetworkStats, 300000);

    // Listen for new best diff records
    window.electronAPI.onNewBestDiff(({ deviceId, deviceName, newBestDiff }) => {
      console.log(`New record for ${deviceName}: ${newBestDiff}`);
      setNewRecordDevices(prev => new Set(prev).add(deviceId));
      // Refresh devices to get updated all_time_best_diff
      fetchDevices();
      // Clear the "new" indicator after 30 seconds
      setTimeout(() => {
        setNewRecordDevices(prev => {
          const next = new Set(prev);
          next.delete(deviceId);
          return next;
        });
      }, 30000);
    });

    return () => clearInterval(interval);
  }, []);

  const toggleGroupCollapse = (groupId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  // Group devices by their groupId
  const devicesByGroup = devices.reduce((acc, device) => {
    const key = device.groupId || 'ungrouped';
    if (!acc[key]) acc[key] = [];
    acc[key].push(device);
    return acc;
  }, {} as Record<string, typeof devices>);

  const onlineDevices = devices.filter((d) => d.isOnline);
  const offlineDevices = devices.filter((d) => !d.isOnline);

  // Calculate totals from AxeOS metrics
  const totalHashrate = onlineDevices.reduce(
    (sum, d) => sum + (d.latestMetrics?.hashRate ?? 0),
    0
  );

  const temps = onlineDevices
    .filter(d => d.latestMetrics?.temp)
    .map(d => d.latestMetrics!.temp);
  const avgTemperature = temps.length > 0
    ? temps.reduce((sum, t) => sum + t, 0) / temps.length
    : 0;

  const totalPower = onlineDevices.reduce(
    (sum, d) => sum + (d.latestMetrics?.power ?? 0),
    0
  );

  const totalShares = onlineDevices.reduce(
    (sum, d) => sum + (d.latestMetrics?.sharesAccepted ?? 0),
    0
  );

  // Calculate overall efficiency (J/TH)
  const avgEfficiency = totalHashrate > 0
    ? (totalPower / (totalHashrate / 1000))
    : 0;

  return (
    <div className="p-6 space-y-6 animate-page-glitch">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-accent uppercase tracking-wider hover-glitch-rgb">Dashboard</h1>
          <p className="text-text-secondary">
            {onlineDevices.length} of {devices.length} devices online
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowGroupManager(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-bg-secondary border border-border text-text-primary font-medium hover:border-accent hover:text-accent transition-colors"
            title="Manage groups"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            Groups
          </button>
          <button
            onClick={() => setShowDiscoveryModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-bg-secondary border border-border text-text-primary font-medium hover:border-accent hover:text-accent transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            Scan Network
          </button>
          <button
            onClick={() => setShowPairingModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-bg-primary font-medium hover:bg-accent-hover transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Device
          </button>
        </div>
      </div>

      {/* Remote Access Info */}
      {status && status.running && (
        <div className="p-4 rounded-xl bg-bg-secondary border border-border">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-text-secondary mb-1">Remote Access</div>
              <div className="text-sm text-text-primary">
                Access your dashboard remotely at:
              </div>
              {status.addresses.map((addr, i) => (
                <div key={i} className="text-sm font-mono text-accent mt-1">
                  http://{addr}:{status.port}
                </div>
              ))}
            </div>
            <div className="text-right">
              <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs ${
                status.setupRequired ? 'bg-warning/20 text-warning' : 'bg-success/20 text-success'
              }`}>
                <div className={`w-2 h-2 rounded-full ${status.setupRequired ? 'bg-warning' : 'bg-success'}`} />
                {status.setupRequired ? 'Setup Required' : 'Ready'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Summary Cards - Vault-Tec Style */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {/* Hashrate Card */}
        <div className="vault-card p-4 hover-glitch">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-accent/15 border border-accent/30">
              <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div className="text-xs text-text-secondary uppercase tracking-wider">Hashrate</div>
          </div>
          <div className="text-2xl font-bold text-accent" style={{ textShadow: '0 0 8px var(--color-accent)' }}>
            {formatHashrate(totalHashrate)}
          </div>
        </div>

        {/* Temperature Card */}
        <div className="vault-card p-4 hover-glitch">
          <div className="flex items-center gap-3 mb-3">
            <div className={`p-2 rounded-lg ${avgTemperature > 80 ? 'bg-danger/15 border-danger/30' : avgTemperature > 70 ? 'bg-warning/15 border-warning/30' : 'bg-success/15 border-success/30'} border`}>
              <svg className={`w-5 h-5 ${avgTemperature > 80 ? 'text-danger' : avgTemperature > 70 ? 'text-warning' : 'text-success'}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
              </svg>
            </div>
            <div className="text-xs text-text-secondary uppercase tracking-wider">Temperature</div>
          </div>
          <div className={`text-2xl font-bold ${avgTemperature > 80 ? 'text-danger' : avgTemperature > 70 ? 'text-warning' : 'text-success'}`}>
            {avgTemperature > 0 ? formatTemperature(avgTemperature) : '--'}
          </div>
        </div>

        {/* Power Card */}
        <div className="vault-card p-4 hover-glitch">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-border-highlight/15 border border-border-highlight/30">
              <svg className="w-5 h-5 text-border-highlight" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
              </svg>
            </div>
            <div className="text-xs text-text-secondary uppercase tracking-wider">Power</div>
          </div>
          <div className="text-2xl font-bold text-border-highlight" style={{ textShadow: '0 0 8px var(--color-border-highlight)' }}>
            {formatPower(totalPower)}
          </div>
        </div>

        {/* Efficiency Card */}
        <div className="vault-card p-4 hover-glitch">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-success/15 border border-success/30">
              <svg className="w-5 h-5 text-success" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" />
              </svg>
            </div>
            <div className="text-xs text-text-secondary uppercase tracking-wider">Efficiency</div>
          </div>
          <div className="text-2xl font-bold text-success" style={{ textShadow: '0 0 8px var(--color-success)' }}>
            {formatEfficiency(avgEfficiency)}
          </div>
        </div>

        {/* Shares Card */}
        <div className="vault-card p-4 hover-glitch">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-success/15 border border-success/30">
              <svg className="w-5 h-5 text-success" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="text-xs text-text-secondary uppercase tracking-wider">Shares</div>
          </div>
          <div className="text-2xl font-bold text-success" style={{ textShadow: '0 0 8px var(--color-success)' }}>
            {totalShares.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="p-4 rounded-lg bg-danger/10 border border-danger/20 text-danger">
          {error}
        </div>
      )}

      {/* Loading State */}
      {isLoading && devices.length === 0 && (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Empty State */}
      {!isLoading && devices.length === 0 && (
        <div className="text-center py-12">
          <div className="w-16 h-16 rounded-xl bg-bg-secondary flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-text-primary mb-2">No devices yet</h3>
          <p className="text-text-secondary mb-4">
            Add your BitAxe devices by entering their IP address
          </p>
          <button
            onClick={() => setShowPairingModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-bg-primary font-medium hover:bg-accent-hover transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Device
          </button>
        </div>
      )}

      {/* Device Grid - Organized by Groups */}
      {devices.length > 0 && (
        <div className="space-y-4">
          {/* Grouped Devices */}
          {groups.map((group) => {
            const groupDevices = devicesByGroup[group.id] || [];
            if (groupDevices.length === 0) return null;

            const isCollapsed = collapsedGroups.has(group.id);
            const onlineCount = groupDevices.filter(d => d.isOnline).length;

            return (
              <div key={group.id} className="rounded-xl bg-bg-secondary border border-border overflow-hidden">
                {/* Group Header */}
                <button
                  onClick={() => toggleGroupCollapse(group.id)}
                  className="w-full p-4 flex items-center justify-between hover:bg-bg-tertiary/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: group.color }}
                    />
                    <h2 className="text-lg font-medium text-text-primary">{group.name}</h2>
                    <span className="text-sm text-text-secondary">
                      ({onlineCount}/{groupDevices.length} online)
                    </span>
                  </div>
                  <svg
                    className={`w-5 h-5 text-text-secondary transition-transform ${isCollapsed ? '' : 'rotate-180'}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Group Devices */}
                {!isCollapsed && (
                  <div className="p-4 pt-0">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {groupDevices.map((device) => (
                        <DeviceCard
                          key={device.id}
                          device={device}
                          groups={groups}
                          onGroupChange={(groupId) => setDeviceGroup(device.id, groupId)}
                          networkStats={networkStats}
                          isNewRecord={newRecordDevices.has(device.id)}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Ungrouped Devices */}
          {devicesByGroup['ungrouped']?.length > 0 && (
            <div className="rounded-xl bg-bg-secondary border border-border overflow-hidden">
              {/* Ungrouped Header */}
              <button
                onClick={() => toggleGroupCollapse('ungrouped')}
                className="w-full p-4 flex items-center justify-between hover:bg-bg-tertiary/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-text-secondary/50" />
                  <h2 className="text-lg font-medium text-text-secondary">Ungrouped</h2>
                  <span className="text-sm text-text-secondary">
                    ({devicesByGroup['ungrouped'].filter(d => d.isOnline).length}/{devicesByGroup['ungrouped'].length} online)
                  </span>
                </div>
                <svg
                  className={`w-5 h-5 text-text-secondary transition-transform ${collapsedGroups.has('ungrouped') ? '' : 'rotate-180'}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Ungrouped Devices */}
              {!collapsedGroups.has('ungrouped') && (
                <div className="p-4 pt-0">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {devicesByGroup['ungrouped'].map((device) => (
                      <DeviceCard
                        key={device.id}
                        device={device}
                        groups={groups}
                        onGroupChange={(groupId) => setDeviceGroup(device.id, groupId)}
                        networkStats={networkStats}
                        isNewRecord={newRecordDevices.has(device.id)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Pairing Modal */}
      {showPairingModal && (
        <PairingModal onClose={() => setShowPairingModal(false)} />
      )}

      {/* Discovery Modal */}
      <DiscoveryModal
        isOpen={showDiscoveryModal}
        onClose={() => setShowDiscoveryModal(false)}
      />

      {/* Group Manager Modal */}
      <GroupManager
        isOpen={showGroupManager}
        onClose={() => setShowGroupManager(false)}
      />
    </div>
  );
}
