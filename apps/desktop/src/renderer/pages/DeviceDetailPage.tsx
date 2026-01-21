import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useDeviceStore } from '../stores/deviceStore';

interface MetricData {
  timestamp: number;
  hashrate: number | null;
  temperature: number | null;
  power: number | null;
  data: { bestDiff?: number; [key: string]: unknown } | null;
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

  // Device control state
  const [showControlPanel, setShowControlPanel] = useState(false);
  const [fanSpeed, setFanSpeed] = useState<number>(0);
  const [frequency, setFrequency] = useState<number>(0);
  const [voltage, setVoltage] = useState<number>(0);
  const [isSavingControl, setIsSavingControl] = useState<string | null>(null);
  const [controlError, setControlError] = useState<string | null>(null);
  const [controlSuccess, setControlSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (deviceId) {
      loadHistoricalMetrics();
    }
  }, [deviceId]);

  // Initialize control values when metrics change
  useEffect(() => {
    if (device?.latestMetrics) {
      const m = device.latestMetrics;
      if (m.fanspeed !== undefined) setFanSpeed(m.fanspeed);
      if (m.frequency !== undefined) setFrequency(m.frequency);
      if (m.coreVoltage !== undefined) setVoltage(m.coreVoltage);
    }
  }, [device?.latestMetrics]);

  const handleSaveFanSpeed = async () => {
    if (!device) return;
    setIsSavingControl('fan');
    setControlError(null);
    setControlSuccess(null);
    try {
      const result = await window.electronAPI.setDeviceFanSpeed(device.ipAddress, fanSpeed);
      if (result.success) {
        setControlSuccess('Fan speed updated');
        setTimeout(() => setControlSuccess(null), 3000);
      } else {
        setControlError(result.error || 'Failed to update fan speed');
      }
    } catch (err) {
      setControlError('Failed to update fan speed');
    } finally {
      setIsSavingControl(null);
    }
  };

  const handleSaveFrequency = async () => {
    if (!device) return;
    setIsSavingControl('freq');
    setControlError(null);
    setControlSuccess(null);
    try {
      const result = await window.electronAPI.setDeviceFrequency(device.ipAddress, frequency);
      if (result.success) {
        setControlSuccess('Frequency updated');
        setTimeout(() => setControlSuccess(null), 3000);
      } else {
        setControlError(result.error || 'Failed to update frequency');
      }
    } catch (err) {
      setControlError('Failed to update frequency');
    } finally {
      setIsSavingControl(null);
    }
  };

  const handleSaveVoltage = async () => {
    if (!device) return;
    setIsSavingControl('volt');
    setControlError(null);
    setControlSuccess(null);
    try {
      const result = await window.electronAPI.setDeviceVoltage(device.ipAddress, voltage);
      if (result.success) {
        setControlSuccess('Voltage updated');
        setTimeout(() => setControlSuccess(null), 3000);
      } else {
        setControlError(result.error || 'Failed to update voltage');
      }
    } catch (err) {
      setControlError('Failed to update voltage');
    } finally {
      setIsSavingControl(null);
    }
  };

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
    <div className="p-6 space-y-6 animate-page-glitch">
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

          {/* ClusterAxe Banner - Show when cluster mode active */}
          {metrics.isClusterMaster && metrics.clusterInfo && (
            <div className="vault-card p-4 border-2 border-accent animate-glitch-in bg-gradient-to-r from-accent/10 to-transparent">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-accent/20 border-2 border-accent rounded">
                    <svg className="w-8 h-8 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="3"/>
                      <circle cx="12" cy="5" r="2"/>
                      <circle cx="19" cy="12" r="2"/>
                      <circle cx="5" cy="12" r="2"/>
                      <circle cx="12" cy="19" r="2"/>
                      <line x1="12" y1="7" x2="12" y2="9"/>
                      <line x1="17" y1="12" x2="15" y2="12"/>
                      <line x1="7" y1="12" x2="9" y2="12"/>
                      <line x1="12" y1="17" x2="12" y2="15"/>
                    </svg>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-accent terminal-glow tracking-wider">CLUSTER MODE ACTIVE</div>
                    <div className="text-sm text-text-secondary mt-1">
                      <span className="text-success">{metrics.clusterInfo.activeSlaves} slaves</span> connected via {metrics.clusterInfo.transport.type.toUpperCase()}
                      {metrics.clusterInfo.transport.encrypted && <span className="ml-2 text-pip-green">● ENCRYPTED</span>}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-text-secondary uppercase">Combined Hashrate</div>
                  <div className="text-3xl font-bold text-accent terminal-glow">{formatHashrate(metrics.clusterInfo.totalHashrate / 100)}</div>
                </div>
              </div>
            </div>
          )}

          {/* Main Metrics Cards - Vault-Tec Style */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Hashrate Card */}
            <div className="vault-card p-5 hover-glitch group">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-accent/20 border border-accent/40 rounded">
                  <svg className="w-6 h-6 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div className="text-xs text-text-secondary uppercase tracking-wider">
                  {metrics.isClusterMaster ? 'Cluster Hashrate' : 'Hashrate'}
                </div>
              </div>
              <div className="text-3xl font-bold text-accent terminal-glow mb-2">
                {formatHashrate(metrics.hashRate)}
              </div>
              {/* Gauge Bar */}
              <div className="h-2 bg-bg-primary border border-border overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-accent to-accent-hover transition-all duration-500"
                  style={{ width: `${Math.min((metrics.hashRate || 0) / (metrics.expectedHashrate || metrics.hashRate || 1) * 100, 100)}%` }}
                />
              </div>
              <div className="text-xs text-text-secondary mt-2 flex justify-between">
                <span>{metrics.isClusterMaster ? `${metrics.clusterInfo?.activeSlaves || 0} devices` : `1h avg: ${formatHashrate(metrics.hashRate_1h)}`}</span>
                <span className="text-accent">{metrics.isClusterMaster ? 'TOTAL' : `${((metrics.hashRate || 0) / (metrics.expectedHashrate || metrics.hashRate || 1) * 100).toFixed(0)}%`}</span>
              </div>
            </div>

            {/* Temperature Card */}
            <div className="vault-card p-5 hover-glitch group">
              <div className="flex items-center gap-3 mb-3">
                <div className={`p-2 border rounded ${
                  metrics.temp > 80 ? 'bg-danger/20 border-danger/40' : metrics.temp > 70 ? 'bg-warning/20 border-warning/40' : 'bg-success/20 border-success/40'
                }`}>
                  <svg className={`w-6 h-6 ${metrics.temp > 80 ? 'text-danger' : metrics.temp > 70 ? 'text-warning' : 'text-success'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div className="text-xs text-text-secondary uppercase tracking-wider">Temperature</div>
              </div>
              <div className={`text-3xl font-bold mb-2 ${
                metrics.temp > 80 ? 'text-danger' : metrics.temp > 70 ? 'text-warning' : 'text-success terminal-glow'
              }`}>
                {formatTemperature(metrics.temp)}
              </div>
              {/* Temperature Gauge */}
              <div className="h-2 bg-bg-primary border border-border overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${
                    metrics.temp > 80 ? 'bg-danger' : metrics.temp > 70 ? 'bg-warning' : 'bg-success'
                  }`}
                  style={{ width: `${Math.min((metrics.temp || 0) / 100 * 100, 100)}%` }}
                />
              </div>
              <div className="text-xs text-text-secondary mt-2 flex justify-between">
                <span>VR: {formatTemperature(metrics.vrTemp)}</span>
                <span className={metrics.temp > 80 ? 'text-danger' : metrics.temp > 70 ? 'text-warning' : 'text-success'}>
                  {metrics.temp > 80 ? 'CRITICAL' : metrics.temp > 70 ? 'WARM' : 'OPTIMAL'}
                </span>
              </div>
            </div>

            {/* Power Card */}
            <div className="vault-card p-5 hover-glitch group">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-border-highlight/20 border border-border-highlight/40 rounded">
                  <svg className="w-6 h-6 text-border-highlight" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18.36 6.64A9 9 0 1 1 5.64 6.64M12 2v10" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div className="text-xs text-text-secondary uppercase tracking-wider">
                  {metrics.isClusterMaster ? 'Cluster Power' : 'Power Draw'}
                </div>
              </div>
              <div className="text-3xl font-bold text-border-highlight mb-2">
                {formatPower(metrics.power)}
              </div>
              {/* Power Bar */}
              <div className="h-2 bg-bg-primary border border-border overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-border-highlight to-border-glow transition-all duration-500"
                  style={{ width: `${Math.min((metrics.power || 0) / 20 * 100, 100)}%` }}
                />
              </div>
              <div className="text-xs text-text-secondary mt-2">
                {metrics.voltage?.toFixed(1)}V @ {metrics.current?.toFixed(2)}A
              </div>
            </div>

            {/* Efficiency Card */}
            <div className="vault-card p-5 hover-glitch group">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-pip-green/20 border border-pip-green/40 rounded">
                  <svg className="w-6 h-6 text-pip-green" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M12 6v6l4 2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div className="text-xs text-text-secondary uppercase tracking-wider">
                  {metrics.isClusterMaster ? 'Cluster Efficiency' : 'Efficiency'}
                </div>
              </div>
              <div className="text-3xl font-bold text-pip-green terminal-glow mb-2">
                {metrics.efficiency?.toFixed(1) || '--'} <span className="text-lg">J/TH</span>
              </div>
              {/* Efficiency gauge (lower is better, so invert) */}
              <div className="h-2 bg-bg-primary border border-border overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-pip-green to-success transition-all duration-500"
                  style={{ width: `${Math.max(100 - ((metrics.efficiency || 25) / 50 * 100), 10)}%` }}
                />
              </div>
              <div className="text-xs text-text-secondary mt-2">
                Target: {formatHashrate(metrics.expectedHashrate)}
              </div>
            </div>
          </div>

          {/* Secondary Stats - Vault-Tec Terminal Style */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <div className="vault-card p-4 hover-glitch">
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-4 h-4 text-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                <span className="text-xs text-text-secondary uppercase tracking-wide">
                  {metrics.isClusterMaster ? 'Cluster Accepted' : 'Accepted'}
                </span>
              </div>
              <div className="text-xl font-bold text-success terminal-glow">
                {metrics.sharesAccepted?.toLocaleString() || '0'}
              </div>
            </div>
            <div className="vault-card p-4 hover-glitch">
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-4 h-4 text-danger" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
                <span className="text-xs text-text-secondary uppercase tracking-wide">
                  {metrics.isClusterMaster ? 'Cluster Rejected' : 'Rejected'}
                </span>
              </div>
              <div className="text-xl font-bold text-danger">
                {metrics.sharesRejected?.toLocaleString() || '0'}
              </div>
            </div>
            <div className="vault-card p-4 hover-glitch">
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-4 h-4 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                </svg>
                <span className="text-xs text-text-secondary uppercase tracking-wide">Best Diff</span>
              </div>
              <div className="text-xl font-bold text-accent">
                {(() => {
                  const diff = metrics.bestDiff ?? (metrics as Record<string, unknown>).best_diff ?? (metrics as Record<string, unknown>).bestDifficulty ?? (metrics as Record<string, unknown>).best_difficulty ?? (metrics as Record<string, unknown>).difficulty;
                  if (!diff) return '--';
                  // Some firmware returns pre-formatted strings like "18.6G", others return numbers
                  if (typeof diff === 'string') return diff;
                  if (typeof diff === 'number') {
                    if (diff >= 1e9) return (diff / 1e9).toFixed(2) + 'B';
                    if (diff >= 1e6) return (diff / 1e6).toFixed(2) + 'M';
                    if (diff >= 1e3) return (diff / 1e3).toFixed(2) + 'K';
                    return diff.toLocaleString();
                  }
                  return String(diff);
                })()}
              </div>
            </div>
            <div className="vault-card p-4 hover-glitch">
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-4 h-4 text-border-highlight" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2"/>
                </svg>
                <span className="text-xs text-text-secondary uppercase tracking-wide">Fan</span>
              </div>
              <div className="text-xl font-bold text-border-highlight">
                {metrics.fanspeed ? `${metrics.fanspeed}%` : '--'}
              </div>
            </div>
            <div className="vault-card p-4 hover-glitch">
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-4 h-4 text-warning" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
                </svg>
                <span className="text-xs text-text-secondary uppercase tracking-wide">Frequency</span>
              </div>
              <div className="text-xl font-bold text-warning">
                {metrics.frequency ? `${metrics.frequency}` : '--'} <span className="text-xs">MHz</span>
              </div>
            </div>
            <div className="vault-card p-4 hover-glitch">
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-4 h-4 text-pip-green" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>
                </svg>
                <span className="text-xs text-text-secondary uppercase tracking-wide">Voltage</span>
              </div>
              <div className="text-xl font-bold text-pip-green">
                {metrics.coreVoltage ? `${metrics.coreVoltage}` : '--'} <span className="text-xs">mV</span>
              </div>
            </div>
          </div>

          {/* Pool Info - Vault-Tec Terminal Style */}
          <div className="vault-card p-4">
            <div className="flex items-center gap-2 mb-4 pb-2 border-b border-border">
              <svg className="w-5 h-5 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
              </svg>
              <h3 className="text-sm font-bold text-accent uppercase tracking-wider">Pool Connection</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div className="p-3 bg-bg-primary border border-border">
                <div className="flex items-center gap-2 mb-1">
                  <svg className="w-3 h-3 text-text-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                  </svg>
                  <span className="text-text-secondary uppercase text-xs tracking-wide">Stratum URL</span>
                </div>
                <div className="text-pip-green font-mono text-xs truncate terminal-glow">
                  {metrics.stratumURL || 'Not configured'}
                </div>
              </div>
              <div className="p-3 bg-bg-primary border border-border">
                <div className="flex items-center gap-2 mb-1">
                  <svg className="w-3 h-3 text-text-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                  </svg>
                  <span className="text-text-secondary uppercase text-xs tracking-wide">Worker</span>
                </div>
                <div className="text-pip-green font-mono text-xs truncate terminal-glow">
                  {metrics.stratumUser || 'Not configured'}
                </div>
              </div>
              <div className="p-3 bg-bg-primary border border-border">
                <div className="flex items-center gap-2 mb-1">
                  <svg className="w-3 h-3 text-text-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/>
                  </svg>
                  <span className="text-text-secondary uppercase text-xs tracking-wide">Pool Difficulty</span>
                </div>
                <div className="text-accent font-bold">
                  {(() => {
                    // Check for various field names used by different firmware
                    const m = metrics as Record<string, unknown>;
                    const diff = metrics.poolDifficulty ?? m.pool_difficulty ?? m.poolDiff ?? m.stratum_difficulty ?? m.stratumDifficulty ?? m.stratumSuggestedDifficulty;
                    if (diff === undefined || diff === null) return '--';
                    if (typeof diff === 'number') return diff.toLocaleString();
                    return String(diff);
                  })()}
                </div>
              </div>
            </div>
          </div>

          {/* Device Control Panel */}
          <div className="vault-card p-4">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-border">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-warning" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 15a3 3 0 100-6 3 3 0 000 6z"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
                </svg>
                <h3 className="text-sm font-bold text-warning uppercase tracking-wider">Device Control</h3>
              </div>
              <button
                onClick={() => setShowControlPanel(!showControlPanel)}
                className="text-xs px-3 py-1 rounded bg-warning/20 text-warning border border-warning/30 hover:bg-warning/30 transition-colors"
              >
                {showControlPanel ? 'Hide Controls' : 'Show Controls'}
              </button>
            </div>

            {showControlPanel && (
              <div className="space-y-4">
                {/* Status Messages */}
                {controlError && (
                  <div className="p-3 bg-danger/10 border border-danger/30 text-danger text-sm rounded">
                    {controlError}
                  </div>
                )}
                {controlSuccess && (
                  <div className="p-3 bg-success/10 border border-success/30 text-success text-sm rounded">
                    {controlSuccess}
                  </div>
                )}

                {/* Warning */}
                <div className="p-3 bg-warning/10 border border-warning/30 text-warning text-xs rounded flex items-start gap-2">
                  <svg className="w-4 h-4 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                  </svg>
                  <span>Changing frequency or voltage may cause instability. Use caution and monitor temperature closely.</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Fan Speed Control */}
                  <div className="p-4 bg-bg-primary border border-border rounded">
                    <div className="flex items-center gap-2 mb-3">
                      <svg className="w-4 h-4 text-border-highlight" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2"/>
                      </svg>
                      <span className="text-sm font-medium text-text-primary">Fan Speed</span>
                    </div>
                    <div className="space-y-2">
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={fanSpeed}
                        onChange={(e) => setFanSpeed(parseInt(e.target.value))}
                        className="w-full h-2 bg-bg-tertiary rounded-lg appearance-none cursor-pointer accent-border-highlight"
                      />
                      <div className="flex items-center justify-between">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={fanSpeed}
                          onChange={(e) => setFanSpeed(Math.max(0, Math.min(100, parseInt(e.target.value) || 0)))}
                          className="w-16 px-2 py-1 text-sm bg-bg-secondary border border-border rounded text-text-primary text-center"
                        />
                        <span className="text-text-secondary text-xs">%</span>
                        <button
                          onClick={handleSaveFanSpeed}
                          disabled={isSavingControl === 'fan'}
                          className="px-3 py-1 text-xs bg-border-highlight/20 text-border-highlight border border-border-highlight/30 rounded hover:bg-border-highlight/30 disabled:opacity-50 transition-colors"
                        >
                          {isSavingControl === 'fan' ? 'Saving...' : 'Apply'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Frequency Control */}
                  <div className="p-4 bg-bg-primary border border-border rounded">
                    <div className="flex items-center gap-2 mb-3">
                      <svg className="w-4 h-4 text-warning" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
                      </svg>
                      <span className="text-sm font-medium text-text-primary">Frequency</span>
                    </div>
                    <div className="space-y-2">
                      <input
                        type="range"
                        min="400"
                        max="650"
                        step="25"
                        value={frequency}
                        onChange={(e) => setFrequency(parseInt(e.target.value))}
                        className="w-full h-2 bg-bg-tertiary rounded-lg appearance-none cursor-pointer accent-warning"
                      />
                      <div className="flex items-center justify-between">
                        <input
                          type="number"
                          min="400"
                          max="650"
                          step="25"
                          value={frequency}
                          onChange={(e) => setFrequency(parseInt(e.target.value) || 0)}
                          className="w-16 px-2 py-1 text-sm bg-bg-secondary border border-border rounded text-text-primary text-center"
                        />
                        <span className="text-text-secondary text-xs">MHz</span>
                        <button
                          onClick={handleSaveFrequency}
                          disabled={isSavingControl === 'freq'}
                          className="px-3 py-1 text-xs bg-warning/20 text-warning border border-warning/30 rounded hover:bg-warning/30 disabled:opacity-50 transition-colors"
                        >
                          {isSavingControl === 'freq' ? 'Saving...' : 'Apply'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Voltage Control */}
                  <div className="p-4 bg-bg-primary border border-border rounded">
                    <div className="flex items-center gap-2 mb-3">
                      <svg className="w-4 h-4 text-pip-green" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                      </svg>
                      <span className="text-sm font-medium text-text-primary">Core Voltage</span>
                    </div>
                    <div className="space-y-2">
                      <input
                        type="range"
                        min="1000"
                        max="1300"
                        step="10"
                        value={voltage}
                        onChange={(e) => setVoltage(parseInt(e.target.value))}
                        className="w-full h-2 bg-bg-tertiary rounded-lg appearance-none cursor-pointer accent-pip-green"
                      />
                      <div className="flex items-center justify-between">
                        <input
                          type="number"
                          min="1000"
                          max="1300"
                          step="10"
                          value={voltage}
                          onChange={(e) => setVoltage(parseInt(e.target.value) || 0)}
                          className="w-16 px-2 py-1 text-sm bg-bg-secondary border border-border rounded text-text-primary text-center"
                        />
                        <span className="text-text-secondary text-xs">mV</span>
                        <button
                          onClick={handleSaveVoltage}
                          disabled={isSavingControl === 'volt'}
                          className="px-3 py-1 text-xs bg-pip-green/20 text-pip-green border border-pip-green/30 rounded hover:bg-pip-green/30 disabled:opacity-50 transition-colors"
                        >
                          {isSavingControl === 'volt' ? 'Saving...' : 'Apply'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <p className="text-xs text-text-secondary text-center mt-2">
                  Note: Not all devices support all settings. Changes take effect after device restart on some firmware.
                </p>
              </div>
            )}
          </div>

          {/* ClusterAxe Cluster Info - Shows when device is a cluster master */}
          {metrics.isClusterMaster && metrics.clusterInfo && (
            <div className="vault-card p-4 animate-glitch-in">
              <div className="flex items-center gap-2 mb-4 pb-2 border-b border-border">
                <div className="p-2 bg-accent/20 border border-accent/40 rounded">
                  <svg className="w-5 h-5 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="3"/>
                    <circle cx="12" cy="5" r="2"/>
                    <circle cx="19" cy="12" r="2"/>
                    <circle cx="12" cy="19" r="2"/>
                    <circle cx="5" cy="12" r="2"/>
                    <line x1="12" y1="7" x2="12" y2="9"/>
                    <line x1="17" y1="12" x2="15" y2="12"/>
                    <line x1="12" y1="15" x2="12" y2="17"/>
                    <line x1="7" y1="12" x2="9" y2="12"/>
                  </svg>
                </div>
                <h3 className="text-sm font-bold text-accent uppercase tracking-wider">ClusterAxe Network</h3>
                <span className="ml-auto px-2 py-1 text-xs bg-success/20 border border-success/40 text-success uppercase">
                  {metrics.clusterInfo.activeSlaves} Slaves Active
                </span>
              </div>

              {/* Cluster Summary */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
                <div className="p-3 bg-bg-primary border border-border text-center">
                  <div className="text-xs text-text-secondary uppercase mb-1">Total Hashrate</div>
                  <div className="text-lg font-bold text-accent terminal-glow">
                    {formatHashrate(metrics.clusterInfo.totalHashrate / 100)}
                  </div>
                </div>
                <div className="p-3 bg-bg-primary border border-border text-center">
                  <div className="text-xs text-text-secondary uppercase mb-1">Total Power</div>
                  <div className="text-lg font-bold text-border-highlight">
                    {formatPower(metrics.clusterInfo.totalPower)}
                  </div>
                </div>
                <div className="p-3 bg-bg-primary border border-border text-center">
                  <div className="text-xs text-text-secondary uppercase mb-1">Efficiency</div>
                  <div className="text-lg font-bold text-pip-green terminal-glow">
                    {metrics.clusterInfo.totalEfficiency.toFixed(1)} J/TH
                  </div>
                </div>
                <div className="p-3 bg-bg-primary border border-border text-center">
                  <div className="text-xs text-text-secondary uppercase mb-1">Accepted</div>
                  <div className="text-lg font-bold text-success">
                    {metrics.clusterInfo.totalSharesAccepted.toLocaleString()}
                  </div>
                </div>
                <div className="p-3 bg-bg-primary border border-border text-center">
                  <div className="text-xs text-text-secondary uppercase mb-1">Rejected</div>
                  <div className="text-lg font-bold text-danger">
                    {metrics.clusterInfo.totalSharesRejected.toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Transport Info */}
              <div className="flex items-center gap-4 mb-4 p-2 bg-bg-primary border border-border text-xs">
                <span className="text-text-secondary">Transport:</span>
                <span className="text-accent uppercase">{metrics.clusterInfo.transport.type}</span>
                <span className="text-text-secondary">Channel:</span>
                <span className="text-text-primary">{metrics.clusterInfo.transport.channel}</span>
                <span className="text-text-secondary">Encrypted:</span>
                <span className={metrics.clusterInfo.transport.encrypted ? 'text-success' : 'text-warning'}>
                  {metrics.clusterInfo.transport.encrypted ? 'Yes' : 'No'}
                </span>
                <span className="text-text-secondary">Peers:</span>
                <span className="text-text-primary">{metrics.clusterInfo.transport.peerCount}</span>
              </div>

              {/* Slave Devices */}
              <div className="text-xs text-text-secondary uppercase tracking-wider mb-2">Slave Devices</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {metrics.clusterInfo.slaves.map((slave, index) => (
                  <div key={slave.slaveId} className="vault-card p-3 hover-glitch">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${slave.state === 2 ? 'bg-success animate-pulse' : 'bg-warning'}`} />
                        <span className="font-bold text-accent text-sm">{slave.hostname}</span>
                      </div>
                      <span className="text-xs text-text-secondary">Slot {slave.slot}</span>
                    </div>
                    <div className="text-xs text-text-secondary mb-2">{slave.ipAddr}</div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-text-secondary">Hashrate:</span>
                        <span className="text-accent ml-1">{formatHashrate(slave.hashrate / 100)}</span>
                      </div>
                      <div>
                        <span className="text-text-secondary">Temp:</span>
                        <span className={`ml-1 ${slave.temperature > 60 ? 'text-warning' : 'text-success'}`}>
                          {slave.temperature.toFixed(1)}°C
                        </span>
                      </div>
                      <div>
                        <span className="text-text-secondary">Power:</span>
                        <span className="text-border-highlight ml-1">{slave.power.toFixed(1)}W</span>
                      </div>
                      <div>
                        <span className="text-text-secondary">Fan:</span>
                        <span className="text-text-primary ml-1">{slave.fanRpm} RPM</span>
                      </div>
                      <div>
                        <span className="text-text-secondary">Freq:</span>
                        <span className="text-warning ml-1">{slave.frequency} MHz</span>
                      </div>
                      <div>
                        <span className="text-text-secondary">Shares:</span>
                        <span className="text-success ml-1">{slave.sharesAccepted}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

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
                    <th className="px-4 py-3 text-left text-sm font-medium text-text-secondary">Best Diff</th>
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
                      <td className="px-4 py-3 text-accent">
                        {(() => {
                          // Check for various field names used by different firmware
                          const diff = m.data?.bestDiff ?? m.data?.best_diff ?? m.data?.bestDifficulty ?? m.data?.best_difficulty ?? m.data?.difficulty;
                          if (!diff) return '--';
                          // Some firmware returns pre-formatted strings like "18.6G", others return numbers
                          if (typeof diff === 'string') return diff;
                          if (typeof diff === 'number') {
                            if (diff >= 1e9) return (diff / 1e9).toFixed(2) + 'B';
                            if (diff >= 1e6) return (diff / 1e6).toFixed(2) + 'M';
                            if (diff >= 1e3) return (diff / 1e3).toFixed(2) + 'K';
                            return diff.toLocaleString();
                          }
                          return String(diff);
                        })()}
                      </td>
                    </tr>
                  ))}
                  {historicalMetrics.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-text-secondary">
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
