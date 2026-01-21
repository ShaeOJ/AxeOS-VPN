import { useState, useEffect } from 'react';
import { useDeviceStore } from '../stores/deviceStore';
import { useCryptoStore } from '../stores/cryptoStore';

interface ProfitabilityResult {
  dailyBtc: number;
  weeklyBtc: number;
  monthlyBtc: number;
  yearlyBtc: number;
  dailyUsd: number;
  weeklyUsd: number;
  monthlyUsd: number;
  yearlyUsd: number;
  dailyPowerCost: number;
  weeklyPowerCost: number;
  monthlyPowerCost: number;
  yearlyPowerCost: number;
  dailyProfit: number;
  weeklyProfit: number;
  monthlyProfit: number;
  yearlyProfit: number;
  hashrate: number;
  power: number;
  difficulty: number;
  btcPrice: number;
  electricityCost: number;
}

interface NetworkStats {
  difficulty: number;
  blockReward: number;
  blockHeight: number;
  lastUpdated: number;
}

export function ProfitabilityDisplay() {
  const { devices } = useDeviceStore();
  const { price: cryptoPrice, selectedCoin, selectedCurrency } = useCryptoStore();
  const [profitability, setProfitability] = useState<ProfitabilityResult | null>(null);
  const [networkStats, setNetworkStats] = useState<NetworkStats | null>(null);
  const [electricityCost, setElectricityCost] = useState(0.10);
  const [loading, setLoading] = useState(true);
  const [showDetails, setShowDetails] = useState(false);

  // Load electricity cost setting
  useEffect(() => {
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
  }, []);

  // Calculate profitability when devices, crypto price, or settings change
  useEffect(() => {
    const calculateProfitability = async () => {
      // Get online devices with metrics
      const onlineDevices = devices.filter(d => d.isOnline && d.latestMetrics);

      if (onlineDevices.length === 0) {
        setProfitability(null);
        setLoading(false);
        return;
      }

      // Sum up total hashrate and power from all devices
      let totalHashrateGH = 0;
      let totalPowerWatts = 0;

      for (const device of onlineDevices) {
        if (device.latestMetrics) {
          // Convert hashrate to GH/s (device reports in various units)
          // BitAxe typically reports in GH/s already
          totalHashrateGH += device.latestMetrics.hashRate || 0;
          totalPowerWatts += device.latestMetrics.power || 0;
        }
      }

      if (totalHashrateGH === 0) {
        setProfitability(null);
        setLoading(false);
        return;
      }

      // Use price from crypto store
      if (!cryptoPrice || !cryptoPrice.price) {
        setLoading(false);
        return;
      }

      try {
        // Get network stats
        const stats = await window.electronAPI.getNetworkStats();
        if (stats) {
          setNetworkStats(stats);
        }

        // Calculate profitability using the selected coin's price
        const result = await window.electronAPI.calculateProfitability(
          totalHashrateGH,
          totalPowerWatts,
          cryptoPrice.price,
          electricityCost
        );

        setProfitability(result);
      } catch (err) {
        console.error('Failed to calculate profitability:', err);
      } finally {
        setLoading(false);
      }
    };

    calculateProfitability();
    // Refresh every 60 seconds
    const interval = setInterval(calculateProfitability, 60000);
    return () => clearInterval(interval);
  }, [devices, electricityCost, cryptoPrice]);

  // Handle electricity cost change
  const handleElectricityCostChange = async (newCost: number) => {
    setElectricityCost(newCost);
    try {
      await window.electronAPI.setSetting('electricity_cost', newCost.toString());
    } catch (err) {
      console.error('Failed to save electricity cost:', err);
    }
  };

  const formatSats = (btc: number): string => {
    const sats = Math.round(btc * 100000000);
    return sats.toLocaleString();
  };

  const formatCurrency = (value: number): string => {
    const currencyCode = selectedCurrency?.code?.toUpperCase() || 'USD';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const formatDifficulty = (diff: number): string => {
    if (diff >= 1e12) return (diff / 1e12).toFixed(2) + 'T';
    if (diff >= 1e9) return (diff / 1e9).toFixed(2) + 'B';
    if (diff >= 1e6) return (diff / 1e6).toFixed(2) + 'M';
    return diff.toLocaleString();
  };

  // Get coin symbol for display
  const coinSymbol = selectedCoin?.symbol || 'BTC';
  const coinName = selectedCoin?.name || 'Bitcoin';

  if (loading) {
    return (
      <div className="p-4 border-b border-border/30 bg-bg-tertiary/30">
        <div className="text-xs text-text-secondary uppercase tracking-wider mb-2">Est. Earnings</div>
        <div className="animate-pulse">
          <div className="h-5 bg-bg-tertiary rounded w-20 mb-1"></div>
          <div className="h-4 bg-bg-tertiary rounded w-16"></div>
        </div>
      </div>
    );
  }

  if (!profitability) {
    return (
      <div className="p-4 border-b border-border/30 bg-bg-tertiary/30">
        <div className="text-xs text-text-secondary uppercase tracking-wider mb-2">Est. Earnings</div>
        <div className="text-xs text-text-secondary font-mono">NO ACTIVE MINERS</div>
      </div>
    );
  }

  const isProfitable = profitability.dailyProfit >= 0;

  return (
    <div className="p-4 border-b border-border/30 bg-bg-tertiary/30">
      {/* Header with toggle */}
      <button
        onClick={() => setShowDetails(!showDetails)}
        className="w-full text-left"
      >
        <div className="text-xs text-text-secondary uppercase tracking-wider mb-2 flex items-center gap-2">
          <svg className="w-3 h-3 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Est. Earnings ({coinSymbol})
          <svg
            className={`w-3 h-3 ml-auto transition-transform ${showDetails ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Daily earnings summary */}
      <div className="space-y-1">
        <div className="flex justify-between items-baseline">
          <span className="text-xs text-text-secondary">Daily:</span>
          <span className="text-sm font-mono text-accent terminal-glow">
            {formatSats(profitability.dailyBtc)} sats
          </span>
        </div>
        <div className="flex justify-between items-baseline">
          <span className="text-xs text-text-secondary"></span>
          <span className={`text-xs font-mono ${isProfitable ? 'text-success' : 'text-danger'}`}>
            {formatCurrency(profitability.dailyProfit)} net
          </span>
        </div>
      </div>

      {/* Expanded details */}
      {showDetails && (
        <div className="mt-3 pt-3 border-t border-border/30 space-y-3">
          {/* Coin info */}
          <div className="text-xs text-text-secondary/70 bg-bg-primary/50 rounded px-2 py-1">
            Using {coinName} price: {formatCurrency(cryptoPrice?.price || 0)}
          </div>

          {/* Monthly earnings */}
          <div>
            <div className="text-xs text-text-secondary uppercase tracking-wider mb-1">Monthly</div>
            <div className="flex justify-between text-xs">
              <span className="text-text-secondary">Earnings:</span>
              <span className="font-mono text-accent">{formatSats(profitability.monthlyBtc)} sats</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-text-secondary">Power Cost:</span>
              <span className="font-mono text-danger">-{formatCurrency(profitability.monthlyPowerCost)}</span>
            </div>
            <div className="flex justify-between text-xs font-semibold">
              <span className="text-text-secondary">Net Profit:</span>
              <span className={`font-mono ${profitability.monthlyProfit >= 0 ? 'text-success' : 'text-danger'}`}>
                {formatCurrency(profitability.monthlyProfit)}
              </span>
            </div>
          </div>

          {/* Network stats */}
          {networkStats && (
            <div>
              <div className="text-xs text-text-secondary uppercase tracking-wider mb-1">Network</div>
              <div className="flex justify-between text-xs">
                <span className="text-text-secondary">Difficulty:</span>
                <span className="font-mono text-text-terminal">{formatDifficulty(networkStats.difficulty)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-text-secondary">Block:</span>
                <span className="font-mono text-text-terminal">#{networkStats.blockHeight.toLocaleString()}</span>
              </div>
            </div>
          )}

          {/* Electricity cost setting */}
          <div>
            <div className="text-xs text-text-secondary uppercase tracking-wider mb-1">Power Rate</div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={electricityCost}
                onChange={(e) => handleElectricityCostChange(parseFloat(e.target.value) || 0)}
                step="0.01"
                min="0"
                className="w-20 px-2 py-1 text-xs font-mono bg-bg-primary border border-border rounded focus:border-accent focus:outline-none"
              />
              <span className="text-xs text-text-secondary">$/kWh</span>
            </div>
          </div>

          {/* Mining stats */}
          <div className="text-xs text-text-secondary/70 pt-2 border-t border-border/20">
            <div className="flex justify-between">
              <span>Total Hashrate:</span>
              <span className="font-mono">{profitability.hashrate.toFixed(2)} GH/s</span>
            </div>
            <div className="flex justify-between">
              <span>Total Power:</span>
              <span className="font-mono">{profitability.power.toFixed(1)} W</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
