import { useState } from 'react';
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
  const [isRestarting, setIsRestarting] = useState(false);
  const [showRestartConfirm, setShowRestartConfirm] = useState(false);

  const handleRestart = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!showRestartConfirm) {
      setShowRestartConfirm(true);
      // Auto-hide after 3 seconds
      setTimeout(() => setShowRestartConfirm(false), 3000);
      return;
    }

    setIsRestarting(true);
    setShowRestartConfirm(false);

    try {
      const result = await window.electronAPI.restartDevice(device.ipAddress);
      if (!result.success) {
        console.error('Failed to restart device:', result.error);
      }
    } catch (err) {
      console.error('Error restarting device:', err);
    } finally {
      setIsRestarting(false);
    }
  };

  return (
    <div className="vault-card block hover:border-accent/50 hover-glitch transition-all duration-200 hover:shadow-[0_0_20px_rgba(255,176,0,0.2)]">
      <Link to={`/devices/${device.id}`} className="block p-4">
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

      {/* Control Bar */}
      {device.isOnline && (
        <div className="px-4 py-2 border-t border-border/30 flex items-center justify-end gap-2">
          <button
            onClick={handleRestart}
            disabled={isRestarting}
            className={`px-2 py-1 text-xs rounded flex items-center gap-1 transition-colors ${
              showRestartConfirm
                ? 'bg-danger text-white'
                : 'bg-bg-tertiary text-text-secondary hover:text-accent hover:bg-accent/10'
            } disabled:opacity-50`}
          >
            {isRestarting ? (
              <>
                <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Restarting...
              </>
            ) : showRestartConfirm ? (
              <>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                Confirm Restart
              </>
            ) : (
              <>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Restart
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
