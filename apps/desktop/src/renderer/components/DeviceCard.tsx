import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';

// Matrix rain effect component for share acceptance visualization
// Manages its own animation state to handle rapid share triggers smoothly
function ShareMatrixEffect({ triggerCount }: { triggerCount: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<{
    animationId: number | null;
    endTime: number;
    columns: Array<{
      x: number;
      y: number;
      speed: number;
      chars: string;
      charIndex: number;
      brightness: number;
    }> | null;
    lastTrigger: number;
    frameCount: number;
  }>({
    animationId: null,
    endTime: 0,
    columns: null,
    lastTrigger: 0,
    frameCount: 0
  });

  const getAccentColor = useCallback(() => {
    const style = getComputedStyle(document.documentElement);
    return style.getPropertyValue('--color-accent').trim() || '#FFB000';
  }, []);

  const hexToRgb = useCallback((hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 255, g: 176, b: 0 };
  }, []);

  useEffect(() => {
    if (triggerCount === 0) return;

    const state = stateRef.current;
    const now = Date.now();
    const baseDuration = 2500;

    // Skip if this trigger was already processed
    if (triggerCount === state.lastTrigger) return;
    state.lastTrigger = triggerCount;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // If animation is running, just extend the end time
    if (state.animationId !== null && state.endTime > now) {
      const remaining = state.endTime - now;
      state.endTime = now + Math.min(remaining + 1000, baseDuration);
      return;
    }

    // Set canvas size
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width || 300;
    canvas.height = rect.height || 200;

    // Initialize columns
    const fontSize = 10;
    const hexChars = '0123456789abcdef';
    const columnCount = Math.ceil(canvas.width / (fontSize * 2));

    state.columns = [];
    for (let i = 0; i < columnCount; i++) {
      let segment = '';
      const length = 8 + Math.floor(Math.random() * 12);
      for (let j = 0; j < length; j++) {
        segment += hexChars[Math.floor(Math.random() * 16)];
      }
      state.columns.push({
        x: i * fontSize * 2 + Math.random() * fontSize,
        y: Math.random() * canvas.height * 0.3,
        speed: 0.15 + Math.random() * 0.25,
        chars: segment,
        charIndex: 0,
        brightness: 0.15 + Math.random() * 0.2
      });
    }

    state.endTime = now + baseDuration;
    state.frameCount = 0;

    const draw = () => {
      state.frameCount++;

      // Only update every 2nd frame for slower animation
      if (state.frameCount % 2 !== 0) {
        state.animationId = requestAnimationFrame(draw);
        return;
      }

      const currentTime = Date.now();
      const remaining = state.endTime - currentTime;

      if (remaining <= 0 || !state.columns) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        state.animationId = null;
        state.columns = null;
        return;
      }

      // Smooth fade out in last 700ms
      const fadeOut = remaining < 700 ? remaining / 700 : 1;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const accentHex = getAccentColor();
      const rgb = hexToRgb(accentHex);
      ctx.font = `${fontSize}px "Share Tech Mono", monospace`;

      state.columns.forEach((col) => {
        for (let j = 0; j < 5; j++) {
          const charY = col.y - j * fontSize;
          if (charY < -fontSize || charY > canvas.height + fontSize) continue;

          const char = col.chars[(col.charIndex - j + col.chars.length) % col.chars.length];
          const alpha = col.brightness * (1 - j / 5) * fadeOut;

          if (j === 0) {
            ctx.shadowColor = accentHex;
            ctx.shadowBlur = 3;
          }

          ctx.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`;
          ctx.fillText(char, col.x, charY);

          if (j === 0) {
            ctx.shadowBlur = 0;
          }
        }

        col.y += col.speed * fontSize * 0.3;
        col.charIndex++;

        if (col.y > canvas.height + fontSize * 5) {
          col.y = -fontSize * 2;
          col.charIndex = 0;
        }
      });

      state.animationId = requestAnimationFrame(draw);
    };

    // Cancel any existing animation before starting new one
    if (state.animationId !== null) {
      cancelAnimationFrame(state.animationId);
    }

    state.animationId = requestAnimationFrame(draw);
  }, [triggerCount, getAccentColor, hexToRgb]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const state = stateRef.current;
      if (state.animationId !== null) {
        cancelAnimationFrame(state.animationId);
        state.animationId = null;
      }
    };
  }, []);

  if (triggerCount === 0) return null;

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none rounded-lg"
      style={{ opacity: 0.7, zIndex: 5 }}
    />
  );
}

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

// Bitmain board info
interface BitmainBoard {
  index: number;
  power: number;
  temp: number;
  freq: number;
  hashrate: number;
}

// AxeOS system info
interface AxeOSSystemInfo {
  power: number;
  voltage: number;
  current: number;
  temp: number;
  hashRate: number;
  efficiency: number;
  sharesAccepted: number;
  sharesRejected: number;
  ASICModel: string;
  fanspeed: number;
  isClusterMaster?: boolean;
  clusterInfo?: ClusterInfo;
  // Bitmain-specific fields
  isBitmain?: boolean;
  chainCount?: number;
  boards?: BitmainBoard[];
  mainsVoltage?: number;
  [key: string]: unknown;
}

interface NetworkStats {
  difficulty: number;
  blockReward: number;
  blockHeight: number;
}

interface DeviceGroup {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
  createdAt: number;
}

type DeviceType = 'bitaxe' | 'bitmain';

interface Device {
  id: string;
  name: string;
  ipAddress: string;
  deviceType?: DeviceType;
  isOnline: boolean;
  lastSeen: number | null;
  createdAt: number;
  groupId?: string | null;
  allTimeBestDiff?: number | null;
  allTimeBestDiffAt?: number | null;
  latestMetrics?: AxeOSSystemInfo | null;
}

interface DeviceCardProps {
  device: Device;
  groups?: DeviceGroup[];
  onGroupChange?: (groupId: string | null) => void;
  isNewRecord?: boolean;
  networkStats?: NetworkStats | null;
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

function formatAmps(currentMa: number | null | undefined, power?: number, _voltage?: number): string {
  // Use mains voltage for amps calculation (wall current is what users care about)
  const MAINS_VOLTAGE = 120; // US standard, could be made configurable

  // Use reported current if available and reasonable (AxeOS reports in milliamps)
  // Current should be reasonable: 0.1A to 20A range at mains voltage for mining devices
  if (currentMa && currentMa > 100 && currentMa < 20000) {
    return `${(currentMa / 1000).toFixed(2)} A`;
  }

  // Calculate from power using mains voltage
  if (power && power > 0) {
    const amps = power / MAINS_VOLTAGE;
    return `${amps.toFixed(2)} A`;
  }
  return '--';
}

function calculateBlockChance(hashRateGH: number, difficulty: number): { daysToBlock: number; dailyOdds: number } | null {
  if (!hashRateGH || !difficulty || hashRateGH <= 0 || difficulty <= 0) return null;

  // Network hashrate in H/s: difficulty * 2^32 / 600 (average block time)
  const networkHashrateHs = (difficulty * Math.pow(2, 32)) / 600;
  // Convert hashrate from GH/s to H/s
  const ourHashrateHs = hashRateGH * 1e9;
  // Probability of finding any given block
  const probPerBlock = ourHashrateHs / networkHashrateHs;
  // Blocks per day (144 on average)
  const blocksPerDay = 144;
  // Expected time to find a block (in days)
  const daysToBlock = 1 / (probPerBlock * blocksPerDay);
  // Daily odds
  const dailyOdds = 1 - Math.pow(1 - probPerBlock, blocksPerDay);

  return { daysToBlock, dailyOdds };
}

function formatTimeToBlock(days: number): string {
  if (days < 1) return `${Math.round(days * 24)} hrs`;
  if (days < 30) return `${Math.round(days)} days`;
  if (days < 365) return `${(days / 30).toFixed(1)} mos`;
  if (days < 3650) return `${(days / 365).toFixed(1)} yrs`;
  const years = days / 365;
  if (years < 1e6) return `${(years / 1000).toFixed(0)}k yrs`;
  return `${(years / 1e6).toFixed(1)}M yrs`;
}

function formatOdds(prob: number): string {
  const pct = prob * 100;
  if (pct >= 1) return `${pct.toFixed(2)}%`;
  if (pct >= 0.01) return `${pct.toFixed(4)}%`;
  if (pct >= 0.0001) return `${pct.toFixed(6)}%`;
  if (pct >= 0.000001) return `${pct.toFixed(8)}%`;
  return `${pct.toFixed(10)}%`;
}

function formatRelativeTime(timestamp: number | null): string {
  if (!timestamp) return 'Never';
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function formatDifficulty(diff: number | null | undefined): string {
  if (!diff) return '--';
  if (diff >= 1e12) return `${(diff / 1e12).toFixed(2)}T`;
  if (diff >= 1e9) return `${(diff / 1e9).toFixed(2)}G`;  // Use "G" (giga) to match miner firmware
  if (diff >= 1e6) return `${(diff / 1e6).toFixed(2)}M`;
  if (diff >= 1e3) return `${(diff / 1e3).toFixed(2)}K`;
  return diff.toLocaleString();
}

// Parse difficulty from various formats - handles both raw numbers and formatted strings like "56.4M", "18.6G"
function parseDifficulty(value: unknown): number {
  if (typeof value === 'number' && !isNaN(value)) return value;
  if (typeof value === 'string') {
    // Try to parse formatted strings like "56.4M", "18.6G", "3.31G", "1.2T", "500K"
    const match = value.match(/^([\d.]+)\s*([KMGBT])?$/i);
    if (match) {
      const num = parseFloat(match[1]);
      const suffix = match[2]?.toUpperCase();
      const multipliers: Record<string, number> = { K: 1e3, M: 1e6, G: 1e9, B: 1e9, T: 1e12 };
      return num * (multipliers[suffix] || 1);
    }
    // Try plain number string
    const parsed = parseFloat(value);
    if (!isNaN(parsed)) return parsed;
  }
  return 0;
}

export function DeviceCard({ device, groups, onGroupChange, networkStats, isNewRecord }: DeviceCardProps) {
  const metrics = device.latestMetrics;
  const blockChance = metrics?.hashRate && networkStats?.difficulty
    ? calculateBlockChance(metrics.hashRate, networkStats.difficulty)
    : null;
  const [isRestarting, setIsRestarting] = useState(false);
  const [showRestartConfirm, setShowRestartConfirm] = useState(false);
  const [showGroupDropdown, setShowGroupDropdown] = useState(false);
  const [shareEffectTrigger, setShareEffectTrigger] = useState(0);
  const prevSharesRef = useRef<number>(0);

  // Detect share acceptance and trigger effect - increment counter instead of boolean
  useEffect(() => {
    const currentShares = metrics?.sharesAccepted || 0;
    if (prevSharesRef.current > 0 && currentShares > prevSharesRef.current) {
      // Shares increased - trigger effect by incrementing counter
      console.log(`[ShareEffect] ${device.name}: shares ${prevSharesRef.current} -> ${currentShares}`);
      setShareEffectTrigger(prev => prev + 1);
    }
    prevSharesRef.current = currentShares;
  }, [metrics?.sharesAccepted, device.name]);

  // Check if current session best diff equals all-time best (new record achieved this session)
  // Parse bestDiff which may be a formatted string like "56.4M" or a raw number
  const currentBestDiff = parseDifficulty(metrics?.bestDiff);
  const allTimeBest = device.allTimeBestDiff || 0;
  // Use the higher of current session or all-time best
  const displayBestDiff = Math.max(currentBestDiff, allTimeBest);
  const isCurrentSessionRecord = currentBestDiff > 0 && currentBestDiff > allTimeBest;

  const currentGroup = groups?.find(g => g.id === device.groupId);

  const handleGroupSelect = (groupId: string | null) => {
    onGroupChange?.(groupId);
    setShowGroupDropdown(false);
  };

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
    <div className="vault-card card-interactive block hover:border-accent/50 transition-all duration-200 hover:shadow-vault-glow relative overflow-hidden">
      {/* Share acceptance Matrix effect */}
      <ShareMatrixEffect triggerCount={shareEffectTrigger} />
      <Link to={`/devices/${device.id}`} className="block p-4 relative z-10">
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
              {device.deviceType === 'bitmain' && (
                <span className="px-1.5 py-0.5 text-[10px] bg-warning/20 border border-warning/40 text-warning uppercase font-bold">
                  BETA
                </span>
              )}
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
              <div className="text-xs text-text-secondary mb-1 flex items-center gap-1">
                <svg className="w-3 h-3 text-accent" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                </svg>
                Hashrate
              </div>
              <div className="text-sm font-semibold text-accent">
                {formatHashrate(metrics.hashRate)}
              </div>
            </div>
            <div>
              <div className={`text-xs mb-1 flex items-center gap-1 ${
                metrics.temp > 80 ? 'text-danger' : metrics.temp > 70 ? 'text-warning' : 'text-success'
              }`}>
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 2a1 1 0 011 1v6.5a.5.5 0 00.5.5h.5a.5.5 0 01.5.5V12a4 4 0 11-5 0v-1.5a.5.5 0 01.5-.5h.5a.5.5 0 00.5-.5V3a1 1 0 011-1z" clipRule="evenodd" />
                </svg>
                Temp
              </div>
              <div
                className={`text-sm font-semibold ${
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
              <div className="text-xs text-border-highlight mb-1 flex items-center gap-1">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                </svg>
                Power
              </div>
              <div className="text-sm font-semibold text-text-primary">
                {formatPower(metrics.power)}
              </div>
              <div className="text-xs text-text-secondary">
                {metrics.isBitmain && metrics.chainCount ? (
                  <span title={`${metrics.chainCount} boards @ ~${metrics.mainsVoltage || 120}V`}>
                    ~{formatAmps(metrics.current, metrics.power, metrics.voltage)} ({metrics.chainCount} boards)
                  </span>
                ) : (
                  formatAmps(metrics.current, metrics.power, metrics.voltage)
                )}
              </div>
            </div>
          </div>

          {/* Secondary Metrics */}
          <div className="grid grid-cols-3 gap-3 pt-2 border-t border-border/50">
            <div>
              <div className="text-xs text-success mb-1 flex items-center gap-1">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zm6-4a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zm6-3a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
                </svg>
                Efficiency
              </div>
              <div className="text-sm font-medium text-text-primary">
                {metrics.efficiency ? `${metrics.efficiency.toFixed(1)} J/TH` : '--'}
              </div>
            </div>
            <div>
              <div className="text-xs text-success mb-1 flex items-center gap-1">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Shares
              </div>
              <div className="text-sm font-medium text-success">
                {metrics.sharesAccepted?.toLocaleString() || '0'}
              </div>
            </div>
            <div>
              <div className="text-xs text-text-secondary mb-1 flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Fan
              </div>
              <div className="text-sm font-medium text-text-primary">
                {metrics.fanspeed ? `${metrics.fanspeed}%` : '--'}
              </div>
            </div>
          </div>

          {/* Block Chance */}
          {blockChance && (
            <div className="pt-2 border-t border-border/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <svg className="w-3 h-3 text-warning" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                  <span className="text-[10px] text-text-secondary">Solo Block</span>
                </div>
                <div className="text-right">
                  <span className="text-xs font-mono text-warning">{formatTimeToBlock(blockChance.daysToBlock)}</span>
                  <span className="text-[10px] text-text-secondary ml-1">({formatOdds(blockChance.dailyOdds)}/day)</span>
                </div>
              </div>
            </div>
          )}

          {/* Best Difficulty */}
          {displayBestDiff > 0 && (
            <div className="pt-2 border-t border-border/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  {(isNewRecord || isCurrentSessionRecord) ? (
                    <svg className="w-3 h-3 text-yellow-400 animate-pulse" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 1l2.928 6.856 6.072.514-4.928 4.286 1.5 6.344L10 15.572 4.428 19l1.5-6.344L1 8.37l6.072-.514L10 1z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <svg className="w-3 h-3 text-accent" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 1l2.928 6.856 6.072.514-4.928 4.286 1.5 6.344L10 15.572 4.428 19l1.5-6.344L1 8.37l6.072-.514L10 1z" clipRule="evenodd" />
                    </svg>
                  )}
                  <span className="text-[10px] text-text-secondary">Best Diff</span>
                  {(isNewRecord || isCurrentSessionRecord) && (
                    <span className="text-[9px] px-1 py-0.5 bg-yellow-500/20 text-yellow-400 rounded uppercase font-bold animate-pulse">NEW!</span>
                  )}
                </div>
                <div className="text-right">
                  <span className={`text-xs font-mono ${(isNewRecord || isCurrentSessionRecord) ? 'text-yellow-400' : 'text-accent'}`}>
                    {formatDifficulty(displayBestDiff)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="text-sm text-text-secondary">
          {device.isOnline ? 'Waiting for metrics...' : 'Device offline'}
        </div>
      )}
      </Link>

      {/* Control Bar */}
      <div className="px-4 py-2 border-t border-border/30 flex items-center justify-between gap-2">
        {/* Group Selector */}
        {groups && onGroupChange && (
          <div className="relative">
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowGroupDropdown(!showGroupDropdown);
              }}
              className="flex items-center gap-1.5 px-2 py-1 text-xs rounded bg-bg-tertiary text-text-secondary hover:text-accent hover:bg-accent/10 transition-colors"
            >
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: currentGroup?.color || '#666' }}
              />
              <span className="max-w-[80px] truncate">{currentGroup?.name || 'No group'}</span>
              <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Dropdown Menu */}
            {showGroupDropdown && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowGroupDropdown(false);
                  }}
                />
                <div className="absolute left-0 bottom-full mb-1 z-20 w-40 bg-bg-secondary border border-border rounded-lg shadow-lg overflow-hidden">
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleGroupSelect(null);
                    }}
                    className={`w-full px-3 py-2 text-xs text-left flex items-center gap-2 hover:bg-bg-tertiary transition-colors ${
                      !device.groupId ? 'bg-accent/10 text-accent' : 'text-text-secondary'
                    }`}
                  >
                    <div className="w-2 h-2 rounded-full bg-text-secondary/50" />
                    No group
                  </button>
                  {groups.map((group) => (
                    <button
                      key={group.id}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleGroupSelect(group.id);
                      }}
                      className={`w-full px-3 py-2 text-xs text-left flex items-center gap-2 hover:bg-bg-tertiary transition-colors ${
                        device.groupId === group.id ? 'bg-accent/10 text-accent' : 'text-text-primary'
                      }`}
                    >
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: group.color }}
                      />
                      {group.name}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Right side controls */}
        <div className="flex items-center gap-2 ml-auto">
          {device.isOnline && (
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
          )}
        </div>
      </div>
    </div>
  );
}
