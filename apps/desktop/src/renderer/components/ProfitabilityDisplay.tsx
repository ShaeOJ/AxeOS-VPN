import { useState, useEffect } from 'react';
import { useDeviceStore } from '../stores/deviceStore';

type MiningCoin = 'btc' | 'bch' | 'dgb';

interface MiningCoinConfig {
  id: MiningCoin;
  name: string;
  symbol: string;
  blockReward: number;
  blockTimeSeconds: number;
}

interface ProfitabilityResult {
  dailyCrypto: number;
  weeklyCrypto: number;
  monthlyCrypto: number;
  yearlyCrypto: number;
  dailyFiat: number;
  weeklyFiat: number;
  monthlyFiat: number;
  yearlyFiat: number;
  dailyPowerCost: number;
  weeklyPowerCost: number;
  monthlyPowerCost: number;
  yearlyPowerCost: number;
  dailyProfit: number;
  weeklyProfit: number;
  monthlyProfit: number;
  yearlyProfit: number;
  coin: string;
  coinSymbol: string;
  hashrate: number;
  power: number;
  difficulty: number;
  cryptoPrice: number;
  electricityCost: number;
  blockReward: number;
  blockTimeSeconds: number;
}

interface NetworkStats {
  coin: string;
  difficulty: number;
  blockReward: number;
  blockHeight?: number;
  blockTimeSeconds: number;
  lastUpdated: number;
}

const MINING_COINS: MiningCoinConfig[] = [
  { id: 'btc', name: 'Bitcoin', symbol: 'BTC', blockReward: 3.125, blockTimeSeconds: 600 },
  { id: 'bch', name: 'Bitcoin Cash', symbol: 'BCH', blockReward: 3.125, blockTimeSeconds: 600 },
  { id: 'dgb', name: 'DigiByte', symbol: 'DGB', blockReward: 665, blockTimeSeconds: 15 },
];

export function ProfitabilityDisplay() {
  const { devices } = useDeviceStore();
  const [selectedMiningCoin, setSelectedMiningCoin] = useState<MiningCoin>('btc');
  const [coinPrice, setCoinPrice] = useState<number | null>(null);
  const [profitability, setProfitability] = useState<ProfitabilityResult | null>(null);
  const [networkStats, setNetworkStats] = useState<NetworkStats | null>(null);
  const [electricityCost, setElectricityCost] = useState(0.10);
  const [loading, setLoading] = useState(true);
  const [showDetails, setShowDetails] = useState(false);
  const [showCoinSelector, setShowCoinSelector] = useState(false);

  const selectedCoinConfig = MINING_COINS.find(c => c.id === selectedMiningCoin) || MINING_COINS[0];

  // Load electricity cost and saved mining coin setting
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await window.electronAPI.getSettings();
        if (settings['electricity_cost']) {
          setElectricityCost(parseFloat(settings['electricity_cost']));
        }
        if (settings['mining_coin']) {
          const savedCoin = settings['mining_coin'] as MiningCoin;
          if (MINING_COINS.some(c => c.id === savedCoin)) {
            setSelectedMiningCoin(savedCoin);
          }
        }
      } catch (err) {
        console.error('Failed to load settings:', err);
      }
    };
    loadSettings();
  }, []);

  // Fetch coin price when coin changes
  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const price = await window.electronAPI.fetchMiningCoinPrice(selectedMiningCoin, 'usd');
        setCoinPrice(price);
      } catch (err) {
        console.error('Failed to fetch coin price:', err);
      }
    };
    fetchPrice();
    const interval = setInterval(fetchPrice, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, [selectedMiningCoin]);

  // Calculate profitability when devices, coin, price, or settings change
  useEffect(() => {
    const calculateProfitability = async () => {
      // Get online devices with metrics
      const onlineDevices = devices.filter(d => d.isOnline && d.latestMetrics);

      if (onlineDevices.length === 0) {
        setProfitability(null);
        setLoading(false);
        return;
      }

      // If we have devices but no price yet, keep loading
      if (!coinPrice) {
        setLoading(true);
        return;
      }

      // Sum up total hashrate and power from all devices
      let totalHashrateGH = 0;
      let totalPowerWatts = 0;

      for (const device of onlineDevices) {
        if (device.latestMetrics) {
          totalHashrateGH += device.latestMetrics.hashRate || 0;
          totalPowerWatts += device.latestMetrics.power || 0;
        }
      }

      if (totalHashrateGH === 0) {
        setProfitability(null);
        setLoading(false);
        return;
      }

      try {
        // Get network stats for selected coin
        const stats = await window.electronAPI.getNetworkStats(selectedMiningCoin);
        if (stats) {
          setNetworkStats(stats);
        }

        // Calculate profitability for selected coin
        const result = await window.electronAPI.calculateProfitability(
          selectedMiningCoin,
          totalHashrateGH,
          totalPowerWatts,
          coinPrice,
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
    const interval = setInterval(calculateProfitability, 60000);
    return () => clearInterval(interval);
  }, [devices, electricityCost, coinPrice, selectedMiningCoin]);

  // Handle coin change
  const handleCoinChange = async (coin: MiningCoin) => {
    setSelectedMiningCoin(coin);
    setShowCoinSelector(false);
    setLoading(true);
    setCoinPrice(null); // Reset price to trigger fresh fetch
    try {
      await window.electronAPI.setSetting('mining_coin', coin);
    } catch (err) {
      console.error('Failed to save mining coin:', err);
    }
  };

  // Handle electricity cost change
  const handleElectricityCostChange = async (newCost: number) => {
    setElectricityCost(newCost);
    try {
      await window.electronAPI.setSetting('electricity_cost', newCost.toString());
    } catch (err) {
      console.error('Failed to save electricity cost:', err);
    }
  };

  const formatCryptoAmount = (amount: number): string => {
    if (selectedMiningCoin === 'btc' || selectedMiningCoin === 'bch') {
      const sats = Math.round(amount * 100000000);
      return sats.toLocaleString();
    }
    // DGB
    if (amount < 1) return amount.toFixed(4);
    if (amount < 100) return amount.toFixed(2);
    return amount.toFixed(0);
  };

  const getCryptoUnit = (): string => {
    if (selectedMiningCoin === 'btc' || selectedMiningCoin === 'bch') {
      return 'sats';
    }
    return selectedCoinConfig.symbol;
  };

  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const formatDifficulty = (diff: number): string => {
    if (diff >= 1e12) return (diff / 1e12).toFixed(2) + 'T';
    if (diff >= 1e9) return (diff / 1e9).toFixed(2) + 'B';
    if (diff >= 1e6) return (diff / 1e6).toFixed(2) + 'M';
    if (diff >= 1e3) return (diff / 1e3).toFixed(2) + 'K';
    return diff.toLocaleString();
  };

  // Calculate block finding probability
  const calculateBlockChance = () => {
    if (!networkStats || !profitability || profitability.hashrate <= 0) return null;

    const blockTimeSeconds = profitability.blockTimeSeconds;
    const networkHashrateHs = (networkStats.difficulty * Math.pow(2, 32)) / blockTimeSeconds;
    const ourHashrateHs = profitability.hashrate * 1e9;
    const probPerBlock = ourHashrateHs / networkHashrateHs;
    const blocksPerDay = 86400 / blockTimeSeconds;
    const daysToBlock = 1 / (probPerBlock * blocksPerDay);

    const probDaily = 1 - Math.pow(1 - probPerBlock, blocksPerDay);
    const probWeekly = 1 - Math.pow(1 - probPerBlock, blocksPerDay * 7);
    const probMonthly = 1 - Math.pow(1 - probPerBlock, blocksPerDay * 30);
    const probYearly = 1 - Math.pow(1 - probPerBlock, blocksPerDay * 365);

    return {
      daysToBlock,
      probDaily,
      probWeekly,
      probMonthly,
      probYearly,
      networkHashrateEH: networkHashrateHs / 1e18,
    };
  };

  const formatTimeToBlock = (days: number): string => {
    if (days < 1) return `${Math.round(days * 24)} hours`;
    if (days < 30) return `${Math.round(days)} days`;
    if (days < 365) return `${(days / 30).toFixed(1)} months`;
    if (days < 3650) return `${(days / 365).toFixed(1)} years`;
    if (days < 36500) return `${Math.round(days / 365)} years`;
    if (days < 365000) return `${(days / 365 / 1000).toFixed(1)}k years`;
    if (days < 3650000) return `${Math.round(days / 365 / 1000)}k years`;
    return `${(days / 365 / 1e6).toFixed(1)}M years`;
  };

  const formatProbability = (prob: number): string => {
    if (prob >= 0.01) return `${(prob * 100).toFixed(2)}%`;
    if (prob >= 0.0001) return `${(prob * 100).toFixed(4)}%`;
    if (prob >= 1e-8) return `${(prob * 100).toExponential(2)}%`;
    return `${(prob * 100).toExponential(1)}%`;
  };

  const blockChance = calculateBlockChance();

  if (loading) {
    return (
      <div className="p-3 border-b border-border/30 bg-bg-tertiary/30 flex-shrink-0">
        <div className="text-[10px] text-text-secondary uppercase tracking-wider mb-1">Est. Earnings</div>
        <div className="animate-pulse">
          <div className="h-4 bg-bg-tertiary rounded w-20 mb-1"></div>
          <div className="h-3 bg-bg-tertiary rounded w-14"></div>
        </div>
      </div>
    );
  }

  if (!profitability) {
    return (
      <div className="p-3 border-b border-border/30 bg-bg-tertiary/30 flex-shrink-0">
        <div className="text-[10px] text-text-secondary uppercase tracking-wider mb-1">Est. Earnings</div>
        <div className="text-[10px] text-text-secondary font-mono">NO ACTIVE MINERS</div>
      </div>
    );
  }

  const isProfitable = profitability.dailyProfit >= 0;

  return (
    <div className="p-3 border-b border-border/30 bg-bg-tertiary/30 flex-shrink-0">
      {/* Header with coin selector and toggle */}
      <div className="flex items-center justify-between mb-1">
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="text-left flex-1"
        >
          <div className="text-[10px] text-text-secondary uppercase tracking-wider flex items-center gap-1">
            <svg className="w-2.5 h-2.5 text-accent flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="truncate">Earnings</span>
            <svg
              className={`w-2.5 h-2.5 ml-1 flex-shrink-0 transition-transform ${showDetails ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </button>

        {/* Coin selector button */}
        <div className="relative">
          <button
            onClick={() => setShowCoinSelector(!showCoinSelector)}
            className="px-2 py-0.5 text-[10px] font-mono bg-accent/20 text-accent rounded hover:bg-accent/30 transition-colors flex items-center gap-1"
          >
            {selectedCoinConfig.symbol}
            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Coin dropdown */}
          {showCoinSelector && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowCoinSelector(false)} />
              <div className="absolute right-0 top-full mt-1 bg-bg-secondary border border-border rounded-lg shadow-lg z-50 min-w-[120px]">
                {MINING_COINS.map((coin) => (
                  <button
                    key={coin.id}
                    onClick={() => handleCoinChange(coin.id)}
                    className={`w-full px-3 py-2 text-left text-xs hover:bg-bg-tertiary transition-colors first:rounded-t-lg last:rounded-b-lg ${
                      selectedMiningCoin === coin.id ? 'bg-accent/10 text-accent' : 'text-text-primary'
                    }`}
                  >
                    <div className="font-medium">{coin.symbol}</div>
                    <div className="text-[10px] text-text-secondary">{coin.name}</div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Daily earnings summary */}
      <div className="space-y-0.5">
        <div className="flex justify-between items-baseline">
          <span className="text-[10px] text-text-secondary">Daily:</span>
          <span className="text-xs font-mono text-accent terminal-glow">
            {formatCryptoAmount(profitability.dailyCrypto)} {getCryptoUnit()}
          </span>
        </div>
        <div className="flex justify-between items-baseline">
          <span className="text-[10px] text-text-secondary"></span>
          <span className={`text-[10px] font-mono ${isProfitable ? 'text-success' : 'text-danger'}`}>
            {formatCurrency(profitability.dailyProfit)} net
          </span>
        </div>
      </div>

      {/* Expanded details */}
      {showDetails && (
        <div className="mt-3 pt-3 border-t border-border/30 space-y-3">
          {/* Price info */}
          <div className="text-xs text-text-secondary/70 bg-bg-primary/50 rounded px-2 py-1">
            {selectedCoinConfig.name} price: {formatCurrency(coinPrice || 0)}
          </div>

          {/* Monthly earnings */}
          <div>
            <div className="text-xs text-text-secondary uppercase tracking-wider mb-1">Monthly</div>
            <div className="flex justify-between text-xs">
              <span className="text-text-secondary">Earnings:</span>
              <span className="font-mono text-accent">{formatCryptoAmount(profitability.monthlyCrypto)} {getCryptoUnit()}</span>
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
              <div className="text-xs text-text-secondary uppercase tracking-wider mb-1">{selectedCoinConfig.symbol} Network</div>
              <div className="flex justify-between text-xs">
                <span className="text-text-secondary">Difficulty:</span>
                <span className="font-mono text-text-terminal">{formatDifficulty(networkStats.difficulty)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-text-secondary">Block Reward:</span>
                <span className="font-mono text-text-terminal">{profitability.blockReward} {selectedCoinConfig.symbol}</span>
              </div>
              {networkStats.blockHeight && (
                <div className="flex justify-between text-xs">
                  <span className="text-text-secondary">Block:</span>
                  <span className="font-mono text-text-terminal">#{networkStats.blockHeight.toLocaleString()}</span>
                </div>
              )}
              {blockChance && (
                <div className="flex justify-between text-xs">
                  <span className="text-text-secondary">Network HR:</span>
                  <span className="font-mono text-text-terminal">
                    {blockChance.networkHashrateEH >= 0.01
                      ? `${blockChance.networkHashrateEH.toFixed(2)} EH/s`
                      : `${(blockChance.networkHashrateEH * 1000).toFixed(2)} PH/s`}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Solo Mining / Block Chance */}
          {blockChance && (
            <div>
              <div className="text-xs text-text-secondary uppercase tracking-wider mb-1 flex items-center gap-1">
                <svg className="w-3 h-3 text-warning" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
                Solo Block Chance
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-text-secondary">Expected time:</span>
                <span className="font-mono text-warning">{formatTimeToBlock(blockChance.daysToBlock)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-text-secondary">Daily odds:</span>
                <span className="font-mono text-text-terminal">{formatProbability(blockChance.probDaily)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-text-secondary">Monthly odds:</span>
                <span className="font-mono text-text-terminal">{formatProbability(blockChance.probMonthly)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-text-secondary">Yearly odds:</span>
                <span className="font-mono text-text-terminal">{formatProbability(blockChance.probYearly)}</span>
              </div>
              <div className="text-[10px] text-text-secondary/60 mt-1 italic">
                Solo mining is a lottery - these are statistical averages
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
