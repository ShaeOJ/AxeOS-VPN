import { Link } from 'react-router-dom';

// ClusterAxe cluster info
interface ClusterInfo {
  activeSlaves: number;
  totalHashrate: number;
  totalPower: number;
  totalEfficiency: number;
  totalSharesAccepted: number;
  totalSharesRejected: number;
  slaves: unknown[];
}

// AxeOS system info
interface AxeOSSystemInfo {
  power: number;
  temp: number;
  hashRate: number;
  efficiency: number;
  sharesAccepted: number;
  sharesRejected: number;
  ASICModel: string;
  fanspeed: number;
  isClusterMaster?: boolean;
  clusterInfo?: ClusterInfo;
  [key: string]: unknown;
}

interface Device {
  id: string;
  name: string;
  ipAddress: string;
  isOnline: boolean;
  lastSeen: number | null;
  createdAt: number;
  latestMetrics?: AxeOSSystemInfo | null;
}

interface DeviceCardProps {
  device: Device;
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

function formatRelativeTime(timestamp: number | null): string {
  if (!timestamp) return 'Never';
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function DeviceCard({ device }: DeviceCardProps) {
  const metrics = device.latestMetrics;

  return (
    <Link
      to={`/devices/${device.id}`}
      className="vault-card block p-4 hover:border-accent/50 hover-glitch transition-all duration-200 hover:shadow-[0_0_20px_rgba(255,176,0,0.2)]"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-accent truncate">{device.name}</h3>
          <p className="text-xs text-text-secondary font-mono">{device.ipAddress}</p>
        </div>
        <div
          className={`w-3 h-3 rounded-full flex-shrink-0 ml-2 ${
            device.isOnline ? 'bg-success animate-pulse-glow' : 'bg-text-secondary'
          }`}
        />
      </div>

      {device.isOnline && metrics ? (
        <div className="space-y-3">
          {/* Model & Last Seen */}
          <div className="flex items-center justify-between text-xs text-text-secondary">
            <div className="flex items-center gap-2">
              <span>{metrics.ASICModel || 'BitAxe'}</span>
              {metrics.isClusterMaster && metrics.clusterInfo && (
                <span className="px-1.5 py-0.5 text-[10px] bg-accent/20 border border-accent/40 text-accent uppercase font-bold">
                  Cluster ({metrics.clusterInfo.activeSlaves})
                </span>
              )}
            </div>
            <span>{formatRelativeTime(device.lastSeen)}</span>
          </div>

          {/* Main Metrics */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <div className="text-xs text-text-secondary mb-1">Hashrate</div>
              <div className="text-sm font-medium text-accent">
                {formatHashrate(metrics.hashRate)}
              </div>
            </div>
            <div>
              <div className="text-xs text-text-secondary mb-1">Temp</div>
              <div
                className={`text-sm font-medium ${
                  metrics.temp > 80
                    ? 'text-danger'
                    : metrics.temp > 70
                    ? 'text-warning'
                    : 'text-success'
                }`}
              >
                {formatTemperature(metrics.temp)}
              </div>
            </div>
            <div>
              <div className="text-xs text-text-secondary mb-1">Power</div>
              <div className="text-sm font-medium text-text-primary">
                {formatPower(metrics.power)}
              </div>
            </div>
          </div>

          {/* Secondary Metrics */}
          <div className="grid grid-cols-3 gap-3 pt-2 border-t border-border/50">
            <div>
              <div className="text-xs text-text-secondary mb-1">Efficiency</div>
              <div className="text-xs font-medium text-text-primary">
                {metrics.efficiency ? `${metrics.efficiency.toFixed(1)} J/TH` : '--'}
              </div>
            </div>
            <div>
              <div className="text-xs text-text-secondary mb-1">Shares</div>
              <div className="text-xs font-medium text-success">
                {metrics.sharesAccepted?.toLocaleString() || '0'}
              </div>
            </div>
            <div>
              <div className="text-xs text-text-secondary mb-1">Fan</div>
              <div className="text-xs font-medium text-text-primary">
                {metrics.fanspeed ? `${metrics.fanspeed}%` : '--'}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-sm text-text-secondary">
          {device.isOnline ? 'Waiting for metrics...' : 'Device offline'}
        </div>
      )}
    </Link>
  );
}
