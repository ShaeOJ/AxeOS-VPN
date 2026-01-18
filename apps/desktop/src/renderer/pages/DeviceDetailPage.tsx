import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useDeviceStore } from '../stores/deviceStore';

interface MetricData {
  timestamp: number;
  hashrate: number | null;
  temperature: number | null;
  power: number | null;
  data: unknown;
}

function formatHashrate(hashrate: number | null | undefined): string {
  if (!hashrate) return '--';
  // AxeOS reports in GH/s
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

function formatUptime(seconds: number | null | undefined): string {
  if (!seconds) return '--';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString();
}

export function DeviceDetailPage() {
  const { deviceId } = useParams<{ deviceId: string }>();
  const navigate = useNavigate();
  const { devices, deleteDevice: removeDevice, refreshDevice } = useDeviceStore();
  const device = devices.find((d) => d.id === deviceId);

  const [isDeleting, setIsDeleting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [historicalMetrics, setHistoricalMetrics] = useState<MetricData[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  useEffect(() => {
    if (deviceId) {
      loadHistoricalMetrics();
    }
  }, [deviceId]);

  const loadHistoricalMetrics = async () => {
    if (!deviceId) return;
    setIsLoadingHistory(true);
    try {
      const metrics = await window.electronAPI.getMetrics(deviceId, { limit: 50 });
      setHistoricalMetrics(metrics);
    } catch (error) {
      console.error('Failed to load historical metrics:', error);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleRefresh = async () => {
    if (!deviceId) return;
    setIsRefreshing(true);
    try {
      await refreshDevice(deviceId);
    } finally {
      setIsRefreshing(false);
    }
  };

  if (!device) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <h2 className="text-lg font-medium text-text-primary mb-2">Device not found</h2>
          <Link to="/dashboard" className="text-accent hover:underline">
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const metrics = device.latestMetrics;

  const handleDelete = async () => {
    if (!deviceId) return;
    setIsDeleting(true);

    try {
      await removeDevice(deviceId);
      navigate('/dashboard');
    } catch (error) {
      console.error('Failed to delete device:', error);
      setIsDeleting(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            to="/dashboard"
            className="p-2 rounded-lg hover:bg-bg-secondary transition-colors"
          >
            <svg className="w-5 h-5 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-text-primary">{device.name}</h1>
              <div
                className={`w-3 h-3 rounded-full ${
                  device.isOnline ? 'bg-success animate-pulse-glow' : 'bg-text-secondary'
                }`}
              />
            </div>
            <p className="text-text-secondary font-mono text-sm">{device.ipAddress}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="px-4 py-2 rounded-lg border border-border text-text-primary hover:bg-bg-secondary transition-colors disabled:opacity-50"
          >
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </button>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="px-4 py-2 rounded-lg border border-danger/20 text-danger hover:bg-danger/10 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>

      {device.isOnline && metrics ? (
        <>
          {/* Device Info */}
          <div className="p-4 rounded-xl bg-bg-secondary border border-border">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-text-secondary mb-1">Model</div>
                <div className="text-text-primary font-medium">{metrics.ASICModel || 'Unknown'}</div>
              </div>
              <div>
                <div className="text-text-secondary mb-1">Hostname</div>
                <div className="text-text-primary font-medium">{metrics.hostname || device.name}</div>
              </div>
              <div>
                <div className="text-text-secondary mb-1">Firmware</div>
                <div className="text-text-primary font-medium">{metrics.version || 'Unknown'}</div>
              </div>
              <div>
                <div className="text-text-secondary mb-1">Uptime</div>
                <div className="text-text-primary font-medium">{formatUptime(metrics.uptimeSeconds)}</div>
              </div>
            </div>
          </div>

          {/* Main Metrics Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-6 rounded-xl bg-bg-secondary border border-border">
              <div className="text-sm text-text-secondary mb-2">Current Hashrate</div>
              <div className="text-3xl font-bold text-accent">
                {formatHashrate(metrics.hashRate)}
              </div>
              <div className="text-xs text-text-secondary mt-2">
                1h avg: {formatHashrate(metrics.hashRate_1h)}
              </div>
            </div>

            <div className="p-6 rounded-xl bg-bg-secondary border border-border">
              <div className="text-sm text-text-secondary mb-2">Temperature</div>
              <div
                className={`text-3xl font-bold ${
                  metrics.temp > 80
                    ? 'text-danger'
                    : metrics.temp > 70
                    ? 'text-warning'
                    : 'text-success'
                }`}
              >
                {formatTemperature(metrics.temp)}
              </div>
              <div className="text-xs text-text-secondary mt-2">
                VR: {formatTemperature(metrics.vrTemp)}
              </div>
            </div>

            <div className="p-6 rounded-xl bg-bg-secondary border border-border">
              <div className="text-sm text-text-secondary mb-2">Power Draw</div>
              <div className="text-3xl font-bold text-text-primary">
                {formatPower(metrics.power)}
              </div>
              <div className="text-xs text-text-secondary mt-2">
                {metrics.voltage?.toFixed(1)}V @ {metrics.current?.toFixed(2)}A
              </div>
            </div>

            <div className="p-6 rounded-xl bg-bg-secondary border border-border">
              <div className="text-sm text-text-secondary mb-2">Efficiency</div>
              <div className="text-3xl font-bold text-text-primary">
                {metrics.efficiency?.toFixed(1) || '--'} J/TH
              </div>
              <div className="text-xs text-text-secondary mt-2">
                Target: {formatHashrate(metrics.expectedHashrate)}
              </div>
            </div>
          </div>

          {/* Secondary Stats */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
            <div className="p-4 rounded-xl bg-bg-secondary border border-border">
              <div className="text-xs text-text-secondary mb-1">Shares Accepted</div>
              <div className="text-xl font-bold text-success">
                {metrics.sharesAccepted?.toLocaleString() || '0'}
              </div>
            </div>
            <div className="p-4 rounded-xl bg-bg-secondary border border-border">
              <div className="text-xs text-text-secondary mb-1">Shares Rejected</div>
              <div className="text-xl font-bold text-danger">
                {metrics.sharesRejected?.toLocaleString() || '0'}
              </div>
            </div>
            <div className="p-4 rounded-xl bg-bg-secondary border border-border">
              <div className="text-xs text-text-secondary mb-1">Best Difficulty</div>
              <div className="text-xl font-bold text-accent">
                {metrics.bestDiff ? metrics.bestDiff.toExponential(2) : '--'}
              </div>
            </div>
            <div className="p-4 rounded-xl bg-bg-secondary border border-border">
              <div className="text-xs text-text-secondary mb-1">Fan Speed</div>
              <div className="text-xl font-bold text-text-primary">
                {metrics.fanspeed ? `${metrics.fanspeed}%` : '--'}
              </div>
            </div>
            <div className="p-4 rounded-xl bg-bg-secondary border border-border">
              <div className="text-xs text-text-secondary mb-1">Frequency</div>
              <div className="text-xl font-bold text-text-primary">
                {metrics.frequency ? `${metrics.frequency} MHz` : '--'}
              </div>
            </div>
            <div className="p-4 rounded-xl bg-bg-secondary border border-border">
              <div className="text-xs text-text-secondary mb-1">Core Voltage</div>
              <div className="text-xl font-bold text-text-primary">
                {metrics.coreVoltage ? `${metrics.coreVoltage} mV` : '--'}
              </div>
            </div>
          </div>

          {/* Pool Info */}
          <div className="p-4 rounded-xl bg-bg-secondary border border-border">
            <h3 className="text-sm font-medium text-text-primary mb-3">Pool Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <div className="text-text-secondary mb-1">Stratum URL</div>
                <div className="text-text-primary font-mono text-xs truncate">
                  {metrics.stratumURL || 'Not configured'}
                </div>
              </div>
              <div>
                <div className="text-text-secondary mb-1">Worker</div>
                <div className="text-text-primary font-mono text-xs truncate">
                  {metrics.stratumUser || 'Not configured'}
                </div>
              </div>
              <div>
                <div className="text-text-secondary mb-1">Pool Difficulty</div>
                <div className="text-text-primary font-medium">
                  {metrics.poolDifficulty?.toLocaleString() || '--'}
                </div>
              </div>
            </div>
          </div>

          {/* Historical Metrics Table */}
          <div className="rounded-xl bg-bg-secondary border border-border overflow-hidden">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h2 className="text-lg font-medium text-text-primary">Recent Metrics</h2>
              <button
                onClick={loadHistoricalMetrics}
                disabled={isLoadingHistory}
                className="text-sm text-accent hover:underline disabled:opacity-50"
              >
                {isLoadingHistory ? 'Loading...' : 'Refresh'}
              </button>
            </div>
            <div className="overflow-x-auto max-h-80 overflow-y-auto">
              <table className="w-full">
                <thead className="sticky top-0 bg-bg-secondary">
                  <tr className="border-b border-border">
                    <th className="px-4 py-3 text-left text-sm font-medium text-text-secondary">Time</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-text-secondary">Hashrate</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-text-secondary">Temperature</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-text-secondary">Power</th>
                  </tr>
                </thead>
                <tbody>
                  {historicalMetrics.map((m, i) => (
                    <tr key={i} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 text-text-secondary text-sm">
                        {formatTime(m.timestamp)}
                      </td>
                      <td className="px-4 py-3 text-accent">
                        {m.hashrate ? formatHashrate(m.hashrate / 1e9) : '--'}
                      </td>
                      <td className={`px-4 py-3 ${
                        (m.temperature ?? 0) > 80
                          ? 'text-danger'
                          : (m.temperature ?? 0) > 70
                          ? 'text-warning'
                          : 'text-success'
                      }`}>
                        {formatTemperature(m.temperature)}
                      </td>
                      <td className="px-4 py-3 text-text-primary">
                        {formatPower(m.power)}
                      </td>
                    </tr>
                  ))}
                  {historicalMetrics.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-text-secondary">
                        No historical metrics available
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className="text-center py-12">
          <div className="w-16 h-16 rounded-xl bg-bg-secondary flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M18.364 5.636a9 9 0 010 12.728M5.636 18.364a9 9 0 010-12.728"
              />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-text-primary mb-2">Device Offline</h3>
          <p className="text-text-secondary mb-4">
            Cannot connect to {device.ipAddress}. Check that the device is powered on and connected to the network.
          </p>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="px-4 py-2 rounded-lg bg-accent text-bg-primary font-medium hover:bg-accent-hover transition-colors disabled:opacity-50"
          >
            {isRefreshing ? 'Checking...' : 'Retry Connection'}
          </button>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-bg-secondary rounded-xl border border-border w-full max-w-sm m-4 p-6 animate-fade-in">
            <h3 className="text-lg font-medium text-text-primary mb-2">Delete Device?</h3>
            <p className="text-text-secondary mb-6">
              This will remove {device.name} and all its historical data. This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-2 px-4 rounded-lg border border-border text-text-secondary hover:bg-bg-tertiary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="flex-1 py-2 px-4 rounded-lg bg-danger text-white font-medium hover:bg-danger/80 disabled:opacity-50 transition-colors"
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
