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

function formatDifficulty(diff: number | null | undefined): string {
  if (!diff) return '--';
  if (diff >= 1e12) return `${(diff / 1e12).toFixed(2)}T`;
  if (diff >= 1e9) return `${(diff / 1e9).toFixed(2)}B`;
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

function formatTimeToBlock(days: number): string {
  if (!days || days <= 0 || !isFinite(days)) return '--';
  if (days < 1) return `${Math.round(days * 24)} hours`;
  if (days < 30) return `${Math.round(days)} days`;
  if (days < 365) return `${(days / 30).toFixed(1)} months`;
  const years = days / 365;
  if (years < 10) return `${years.toFixed(1)} years`;
  if (years < 1000) return `${Math.round(years)} years`;
  if (years < 1e6) return `${(years / 1000).toFixed(1)}k years`;
  if (years < 1e9) return `${(years / 1e6).toFixed(1)}M years`;
  return `${(years / 1e9).toFixed(1)}B years`;
}

function formatCost(cost: number | null | undefined): string {
  if (cost === null || cost === undefined) return '--';
  return `$${cost.toFixed(2)}/day`;
}

type ViewMode = 'grid' | 'list';
type SortField = 'name' | 'hashrate' | 'temp' | 'power' | 'shares';
type SortDirection = 'asc' | 'desc';

export function DashboardPage() {
  const { devices, groups, isLoading, error, fetchDevices, fetchGroups, setDeviceGroup } = useDeviceStore();
  const { status, fetchStatus } = useServerStore();
  const [showPairingModal, setShowPairingModal] = useState(false);
  const [showDiscoveryModal, setShowDiscoveryModal] = useState(false);
  const [showGroupManager, setShowGroupManager] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [networkStats, setNetworkStats] = useState<{ difficulty: number; blockReward: number; blockHeight: number } | null>(null);
  const [newRecordDevices, setNewRecordDevices] = useState<Set<string>>(new Set());
  const [electricityCost, setElectricityCost] = useState(0.10);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    return (localStorage.getItem('dashboard-view-mode') as ViewMode) || 'grid';
  });
  const [sortField, setSortField] = useState<SortField>(() => {
    return (localStorage.getItem('dashboard-sort-field') as SortField) || 'name';
  });
  const [sortDirection, setSortDirection] = useState<SortDirection>(() => {
    return (localStorage.getItem('dashboard-sort-direction') as SortDirection) || 'asc';
  });

  // Save preferences
  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem('dashboard-view-mode', mode);
  };

  const handleSortChange = (field: SortField) => {
    if (field === sortField) {
      const newDir = sortDirection === 'asc' ? 'desc' : 'asc';
      setSortDirection(newDir);
      localStorage.setItem('dashboard-sort-direction', newDir);
    } else {
      setSortField(field);
      setSortDirection('desc');
      localStorage.setItem('dashboard-sort-field', field);
      localStorage.setItem('dashboard-sort-direction', 'desc');
    }
  };

  // Sort devices
  const sortDevices = (deviceList: typeof devices) => {
    return [...deviceList].sort((a, b) => {
      let aVal: number | string = 0;
      let bVal: number | string = 0;

      switch (sortField) {
        case 'name':
          aVal = a.name.toLowerCase();
          bVal = b.name.toLowerCase();
          break;
        case 'hashrate':
          aVal = a.latestMetrics?.hashRate ?? 0;
          bVal = b.latestMetrics?.hashRate ?? 0;
          break;
        case 'temp':
          aVal = a.latestMetrics?.temp ?? 0;
          bVal = b.latestMetrics?.temp ?? 0;
          break;
        case 'power':
          aVal = a.latestMetrics?.power ?? 0;
          bVal = b.latestMetrics?.power ?? 0;
          break;
        case 'shares':
          aVal = a.latestMetrics?.sharesAccepted ?? 0;
          bVal = b.latestMetrics?.sharesAccepted ?? 0;
          break;
      }

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDirection === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
  };

  useEffect(() => {
    // Initial fetch - Layout handles the metrics listener
    fetchDevices();
    fetchStatus();
    fetchGroups();

    // Load electricity cost setting
    const loadSettings = async () => {
      try {
        const settings = await window.electronAPI.getSettings();
        if (settings['electricity_cost']) {
          setElectricityCost(parseFloat(settings['electricity_cost']));
        }
      } catch (err) {
        console.error('Failed to load electricity cost:', err);
      }
    };
    loadSettings();

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

  // Best difficulty from all devices (session best or all-time best)
  const bestDifficulty = devices.reduce((max, d) => {
    // Get all possible best diff values - check multiple field name variants
    const metrics = d.latestMetrics as Record<string, unknown> | null | undefined;
    const allTimeBest = parseDifficulty(d.allTimeBestDiff);
    // Check various field name formats that AxeOS might use - use parseDifficulty to handle formatted strings like "56.4M"
    const sessionBest = parseDifficulty(metrics?.bestDiff ?? metrics?.bestdiff ?? metrics?.best_diff ?? metrics?.BestDiff);
    const currentSessionBest = parseDifficulty(metrics?.bestSessionDiff ?? metrics?.bestsessiondiff ?? metrics?.best_session_diff);

    const deviceBest = Math.max(allTimeBest, sessionBest, currentSessionBest);

    // Debug: log what we found for each device
    if (metrics) {
      console.log(`[BestDiff] ${d.name}: allTimeBest=${allTimeBest}, sessionBest=${sessionBest}, currentSessionBest=${currentSessionBest}, raw bestDiff=${metrics?.bestDiff}, deviceBest=${deviceBest}`);
    }

    return Math.max(max, deviceBest);
  }, 0);

  console.log(`[BestDiff] Summary: ${bestDifficulty} (${formatDifficulty(bestDifficulty)})`);

  // Daily power cost calculation
  const dailyKwh = (totalPower * 24) / 1000;
  const dailyPowerCost = dailyKwh * electricityCost;

  // Calculate block chance (time to find a block)
  const calculateBlockChance = () => {
    if (!networkStats || totalHashrate <= 0) return null;
    // Network hashrate in H/s: difficulty * 2^32 / 600 (average block time)
    const networkHashrateHs = (networkStats.difficulty * Math.pow(2, 32)) / 600;
    // Convert our hashrate from GH/s to H/s
    const ourHashrateHs = totalHashrate * 1e9;
    // Probability of finding any given block
    const probPerBlock = ourHashrateHs / networkHashrateHs;
    // Blocks per day (144 on average)
    const blocksPerDay = 144;
    // Expected time to find a block (in days)
    const daysToBlock = 1 / (probPerBlock * blocksPerDay);
    // Daily probability (using 1 - (1-p)^n formula)
    const dailyChance = 1 - Math.pow(1 - probPerBlock, blocksPerDay);
    return { daysToBlock, dailyChance };
  };
  const blockChance = calculateBlockChance();

  // Format odds as percentage - always show decimal
  const formatOdds = (prob: number): string => {
    if (!prob || !isFinite(prob)) return '--';
    const pct = prob * 100;
    if (pct >= 1) return `${pct.toFixed(2)}%`;
    if (pct >= 0.01) return `${pct.toFixed(4)}%`;
    if (pct >= 0.0001) return `${pct.toFixed(6)}%`;
    if (pct >= 0.000001) return `${pct.toFixed(8)}%`;
    if (pct >= 0.00000001) return `${pct.toFixed(10)}%`;
    if (pct >= 0.0000000001) return `${pct.toFixed(12)}%`;
    // For extremely small values, show with enough precision
    return `${pct.toFixed(14)}%`;
  };

  return (
    <div className="p-6 space-y-6 animate-page-glitch">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-accent uppercase tracking-wider hover-glitch-rgb">Dashboard</h1>
          <p className="text-text-secondary">
            {onlineDevices.length} of {devices.length} devices online
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* View Toggle */}
          <div className="flex items-center bg-bg-secondary border border-border rounded-lg overflow-hidden">
            <button
              onClick={() => handleViewModeChange('grid')}
              className={`p-2 transition-colors ${viewMode === 'grid' ? 'bg-accent/20 text-accent' : 'text-text-secondary hover:text-text-primary'}`}
              title="Grid view"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
            </button>
            <button
              onClick={() => handleViewModeChange('list')}
              className={`p-2 transition-colors ${viewMode === 'list' ? 'bg-accent/20 text-accent' : 'text-text-secondary hover:text-text-primary'}`}
              title="List view"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
            </button>
          </div>

          {/* Sort Dropdown */}
          <div className="relative group">
            <button className="flex items-center gap-2 px-3 py-2 rounded-lg bg-bg-secondary border border-border text-text-secondary hover:text-text-primary hover:border-accent transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
              </svg>
              <span className="text-sm capitalize">{sortField}</span>
              <svg className={`w-3 h-3 transition-transform ${sortDirection === 'desc' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
            </button>
            <div className="absolute right-0 top-full mt-1 bg-bg-secondary border border-border rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-20 min-w-[140px]">
              {(['name', 'hashrate', 'temp', 'power', 'shares'] as SortField[]).map((field) => (
                <button
                  key={field}
                  onClick={() => handleSortChange(field)}
                  className={`w-full px-3 py-2 text-left text-sm capitalize hover:bg-bg-tertiary transition-colors flex items-center justify-between ${sortField === field ? 'text-accent' : 'text-text-secondary'}`}
                >
                  {field}
                  {sortField === field && (
                    <svg className={`w-3 h-3 ${sortDirection === 'desc' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>

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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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

        {/* Best Difficulty Card */}
        <div className="vault-card p-4 hover-glitch">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-warning/15 border border-warning/30">
              <svg className="w-5 h-5 text-warning" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
            </div>
            <div className="text-xs text-text-secondary uppercase tracking-wider">Best Diff</div>
          </div>
          <div className="text-2xl font-bold text-warning" style={{ textShadow: '0 0 8px var(--color-warning)' }}>
            {formatDifficulty(bestDifficulty)}
          </div>
        </div>

        {/* Power Cost Card */}
        <div className="vault-card p-4 hover-glitch">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-danger/15 border border-danger/30">
              <svg className="w-5 h-5 text-danger" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="text-xs text-text-secondary uppercase tracking-wider">Power Cost</div>
          </div>
          <div className="text-2xl font-bold text-danger" style={{ textShadow: '0 0 8px var(--color-danger)' }}>
            {formatCost(dailyPowerCost)}
          </div>
          <div className="text-xs text-text-secondary mt-1">
            @ ${electricityCost.toFixed(2)}/kWh
          </div>
        </div>

        {/* Block Chance Card */}
        <div className="vault-card p-4 hover-glitch">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-accent/15 border border-accent/30">
              <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <div className="text-xs text-text-secondary uppercase tracking-wider">Block Time</div>
          </div>
          <div className="text-2xl font-bold text-accent" style={{ textShadow: '0 0 8px var(--color-accent)' }}>
            {blockChance ? formatTimeToBlock(blockChance.daysToBlock) : '--'}
          </div>
          <div className="text-xs text-text-secondary mt-1">
            {blockChance ? (
              <span className="text-warning">{formatOdds(blockChance.dailyChance)}/day</span>
            ) : null}
          </div>
          <div className="text-xs text-text-secondary">
            {networkStats ? `Diff: ${formatDifficulty(networkStats.difficulty)}` : 'Loading...'}
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
      {devices.length > 0 && viewMode === 'grid' && (
        <div className="space-y-4">
          {/* Grouped Devices */}
          {groups.map((group) => {
            const groupDevices = sortDevices(devicesByGroup[group.id] || []);
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
                      {groupDevices.map((device, index) => (
                        <div key={device.id} className={`animate-card-enter animate-card-enter-${Math.min(index + 1, 8)}`}>
                          <DeviceCard
                            device={device}
                            groups={groups}
                            onGroupChange={(groupId) => setDeviceGroup(device.id, groupId)}
                            networkStats={networkStats}
                            isNewRecord={newRecordDevices.has(device.id)}
                          />
                        </div>
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
                    {sortDevices(devicesByGroup['ungrouped']).map((device, index) => (
                      <div key={device.id} className={`animate-card-enter animate-card-enter-${Math.min(index + 1, 8)}`}>
                        <DeviceCard
                          device={device}
                          groups={groups}
                          onGroupChange={(groupId) => setDeviceGroup(device.id, groupId)}
                          networkStats={networkStats}
                          isNewRecord={newRecordDevices.has(device.id)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Device List View */}
      {devices.length > 0 && viewMode === 'list' && (
        <div className="rounded-xl bg-bg-secondary border border-border overflow-hidden overflow-x-auto">
          {/* List Header */}
          <div className="grid grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-2 p-3 bg-bg-tertiary/50 border-b border-border text-xs text-text-secondary uppercase tracking-wider min-w-[500px]">
            <div className="col-span-3 md:col-span-3 lg:col-span-3 flex items-center gap-1 cursor-pointer hover:text-accent" onClick={() => handleSortChange('name')}>
              Device
              {sortField === 'name' && (
                <svg className={`w-3 h-3 ${sortDirection === 'desc' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
              )}
            </div>
            <div className="col-span-2 md:col-span-2 lg:col-span-2 text-center">Status</div>
            <div className="col-span-2 md:col-span-2 lg:col-span-2 flex items-center justify-center gap-1 cursor-pointer hover:text-accent" onClick={() => handleSortChange('hashrate')}>
              Hashrate
              {sortField === 'hashrate' && (
                <svg className={`w-3 h-3 ${sortDirection === 'desc' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
              )}
            </div>
            <div className="hidden md:flex col-span-1 items-center justify-center gap-1 cursor-pointer hover:text-accent" onClick={() => handleSortChange('temp')}>
              Temp
              {sortField === 'temp' && (
                <svg className={`w-3 h-3 ${sortDirection === 'desc' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
              )}
            </div>
            <div className="hidden md:flex col-span-1 items-center justify-center gap-1 cursor-pointer hover:text-accent" onClick={() => handleSortChange('power')}>
              Power
              {sortField === 'power' && (
                <svg className={`w-3 h-3 ${sortDirection === 'desc' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
              )}
            </div>
            <div className="hidden lg:flex col-span-1 items-center justify-center">Eff</div>
            <div className="col-span-1 md:col-span-1 lg:col-span-2 flex items-center justify-center gap-1 cursor-pointer hover:text-accent" onClick={() => handleSortChange('shares')}>
              <span className="hidden md:inline">Shares</span>
              <span className="md:hidden">✓</span>
              {sortField === 'shares' && (
                <svg className={`w-3 h-3 ${sortDirection === 'desc' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
              )}
            </div>
          </div>

          {/* List Items */}
          <div className="divide-y divide-border">
            {sortDevices(devices).map((device, index) => {
              const group = groups.find(g => g.id === device.groupId);
              const metrics = device.latestMetrics;
              const temp = metrics?.temp ?? 0;

              return (
                <a
                  key={device.id}
                  href={`#/device/${device.id}`}
                  className={`grid grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-2 p-3 hover:bg-bg-tertiary/30 transition-colors animate-card-enter animate-card-enter-${Math.min(index + 1, 8)} min-w-[500px]`}
                >
                  {/* Device Name */}
                  <div className="col-span-3 md:col-span-3 lg:col-span-3 flex items-center gap-2">
                    {group && (
                      <div
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: group.color }}
                        title={group.name}
                      />
                    )}
                    <span className="text-text-primary font-medium truncate">{device.name}</span>
                  </div>

                  {/* Status */}
                  <div className="col-span-2 md:col-span-2 lg:col-span-2 flex items-center justify-center">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs ${
                      device.isOnline ? 'bg-success/20 text-success' : 'bg-danger/20 text-danger'
                    }`}>
                      <div className={`w-1.5 h-1.5 rounded-full ${device.isOnline ? 'bg-success' : 'bg-danger'}`} />
                      <span className="hidden sm:inline">{device.isOnline ? 'Online' : 'Offline'}</span>
                    </span>
                  </div>

                  {/* Hashrate */}
                  <div className="col-span-2 md:col-span-2 lg:col-span-2 flex items-center justify-center text-accent font-mono text-sm">
                    {device.isOnline ? formatHashrate(metrics?.hashRate) : '--'}
                  </div>

                  {/* Temperature - hidden on mobile */}
                  <div className={`hidden md:flex col-span-1 items-center justify-center font-mono text-sm ${
                    temp > 80 ? 'text-danger' : temp > 70 ? 'text-warning' : 'text-success'
                  }`}>
                    {device.isOnline ? formatTemperature(metrics?.temp) : '--'}
                  </div>

                  {/* Power - hidden on mobile */}
                  <div className="hidden md:flex col-span-1 items-center justify-center text-border-highlight font-mono text-sm">
                    {device.isOnline ? formatPower(metrics?.power) : '--'}
                  </div>

                  {/* Efficiency - hidden on mobile and tablet */}
                  <div className="hidden lg:flex col-span-1 items-center justify-center text-text-secondary font-mono text-sm">
                    {device.isOnline && metrics?.hashRate ? formatEfficiency((metrics?.power ?? 0) / ((metrics?.hashRate ?? 1) / 1000)) : '--'}
                  </div>

                  {/* Shares */}
                  <div className="col-span-1 md:col-span-1 lg:col-span-2 flex items-center justify-center text-success font-mono text-sm">
                    {device.isOnline ? (metrics?.sharesAccepted ?? 0).toLocaleString() : '--'}
                  </div>
                </a>
              );
            })}
          </div>
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
