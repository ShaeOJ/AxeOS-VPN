/**
 * Mining Profitability Calculator
 * Calculates estimated mining earnings based on hashrate, difficulty, and prices
 * Supports BTC, BCH, DGB, BC2, and BTCS (SHA-256 algo)
 */

export type MiningCoin = 'btc' | 'bch' | 'dgb' | 'bc2' | 'btcs';

export interface CoinConfig {
  id: MiningCoin;
  name: string;
  symbol: string;
  blockReward: number;
  blockTimeSeconds: number;
  difficultyApi: string;
  blockHeightApi?: string;
  coingeckoId: string;
}

export const COIN_CONFIGS: Record<MiningCoin, CoinConfig> = {
  btc: {
    id: 'btc',
    name: 'Bitcoin',
    symbol: 'BTC',
    blockReward: 3.125, // Post-2024 halving
    blockTimeSeconds: 600, // 10 minutes
    difficultyApi: 'https://blockchain.info/q/getdifficulty',
    blockHeightApi: 'https://blockchain.info/q/getblockcount',
    coingeckoId: 'bitcoin',
  },
  bch: {
    id: 'bch',
    name: 'Bitcoin Cash',
    symbol: 'BCH',
    blockReward: 3.125, // Post-2024 halving (same schedule as BTC)
    blockTimeSeconds: 600, // 10 minutes
    difficultyApi: 'https://api.blockchair.com/bitcoin-cash/stats',
    coingeckoId: 'bitcoin-cash',
  },
  dgb: {
    id: 'dgb',
    name: 'DigiByte',
    symbol: 'DGB',
    blockReward: 274, // Current block reward for SHA-256 algo (from WhatToMine)
    blockTimeSeconds: 75, // 75 seconds effective for SHA-256 (1 of 5 algos)
    difficultyApi: 'https://whattomine.com/coins/113.json', // WhatToMine DGB-SHA API
    coingeckoId: 'digibyte',
  },
  bc2: {
    id: 'bc2',
    name: 'Bitcoin II',
    symbol: 'BC2',
    blockReward: 50, // Current block reward
    blockTimeSeconds: 5708, // ~95 minutes
    difficultyApi: 'https://whattomine.com/coins/452.json', // WhatToMine BC2 API
    coingeckoId: 'bitcoinii',
  },
  btcs: {
    id: 'btcs',
    name: 'Bitcoin Silver',
    symbol: 'BTCS',
    blockReward: 50, // Current block reward
    blockTimeSeconds: 319, // ~5.3 minutes
    difficultyApi: 'https://whattomine.com/coins/422.json', // WhatToMine BTCS API
    coingeckoId: 'bitcoin-silver',
  },
};

export interface NetworkStats {
  coin: MiningCoin;
  difficulty: number;
  blockReward: number;
  blockHeight?: number;
  blockTimeSeconds: number;
  lastUpdated: number;
}

export interface ProfitabilityResult {
  // Earnings in crypto
  dailyCrypto: number;
  weeklyCrypto: number;
  monthlyCrypto: number;
  yearlyCrypto: number;
  // Earnings in fiat
  dailyFiat: number;
  weeklyFiat: number;
  monthlyFiat: number;
  yearlyFiat: number;
  // Costs
  dailyPowerCost: number;
  weeklyPowerCost: number;
  monthlyPowerCost: number;
  yearlyPowerCost: number;
  // Net profit
  dailyProfit: number;
  weeklyProfit: number;
  monthlyProfit: number;
  yearlyProfit: number;
  // Stats used
  coin: MiningCoin;
  coinSymbol: string;
  hashrate: number;
  power: number;
  difficulty: number;
  cryptoPrice: number;
  electricityCost: number;
  blockReward: number;
  blockTimeSeconds: number;
}

// Cache for network stats per coin
const cachedNetworkStats: Map<MiningCoin, NetworkStats> = new Map();
const lastNetworkFetch: Map<MiningCoin, number> = new Map();
const NETWORK_CACHE_DURATION = 300000; // 5 minutes
const API_TIMEOUT = 5000; // 5 second timeout for API calls

// Fallback difficulties for when APIs are slow/unavailable
const FALLBACK_DIFFICULTIES: Record<MiningCoin, number> = {
  btc: 110000000000000, // ~110T
  bch: 500000000000,    // ~500B
  dgb: 500000000,       // ~500M
  bc2: 38000000000,     // ~38B
  btcs: 370000000,      // ~370M
};

/**
 * Fetch with timeout wrapper
 */
async function fetchWithTimeout(url: string, timeoutMs: number = API_TIMEOUT): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

/**
 * Get fallback stats immediately (for fast initial load)
 */
function getFallbackStats(coin: MiningCoin): NetworkStats {
  const config = COIN_CONFIGS[coin];
  return {
    coin,
    difficulty: FALLBACK_DIFFICULTIES[coin],
    blockReward: config.blockReward,
    blockTimeSeconds: config.blockTimeSeconds,
    lastUpdated: Date.now(),
  };
}

/**
 * Fetch network stats for a specific coin
 * Returns cached/fallback immediately, fetches fresh data in background
 */
export async function fetchNetworkStats(coin: MiningCoin = 'btc'): Promise<NetworkStats | null> {
  const now = Date.now();
  const cached = cachedNetworkStats.get(coin);
  const lastFetch = lastNetworkFetch.get(coin) || 0;

  // Return cached stats if still valid
  if (cached && now - lastFetch < NETWORK_CACHE_DURATION) {
    return cached;
  }

  // If no cache exists, return fallback immediately and fetch in background
  if (!cached) {
    const fallback = getFallbackStats(coin);
    cachedNetworkStats.set(coin, fallback);
    lastNetworkFetch.set(coin, now);
    // Fetch in background (don't await) - will update cache when done
    fetchNetworkStatsAsync(coin).catch((err) => {
      console.warn(`Background fetch for ${coin} failed:`, err);
    });
    return fallback;
  }

  // If cache is stale, return stale cache but refresh in background
  fetchNetworkStatsAsync(coin).catch((err) => {
    console.warn(`Background fetch for ${coin} failed:`, err);
  });
  return cached;
}

/**
 * Internal async fetch (with timeout)
 */
async function fetchNetworkStatsAsync(coin: MiningCoin): Promise<NetworkStats | null> {
  const config = COIN_CONFIGS[coin];
  const cached = cachedNetworkStats.get(coin);

  try {
    let difficulty: number;
    let blockHeight: number | undefined;

    if (coin === 'btc') {
      // Bitcoin - blockchain.info API
      const diffResponse = await fetchWithTimeout(config.difficultyApi);
      if (!diffResponse.ok) {
        console.error(`Failed to fetch ${coin} difficulty:`, diffResponse.status);
        return cached || getFallbackStats(coin);
      }
      difficulty = parseFloat(await diffResponse.text());

      if (config.blockHeightApi) {
        try {
          const heightResponse = await fetchWithTimeout(config.blockHeightApi);
          if (heightResponse.ok) {
            blockHeight = parseInt(await heightResponse.text(), 10);
          }
        } catch {
          // Ignore block height fetch failures
        }
      }
    } else if (coin === 'bch') {
      // Bitcoin Cash - blockchair API
      const response = await fetchWithTimeout(config.difficultyApi);
      if (!response.ok) {
        console.error(`Failed to fetch ${coin} stats:`, response.status);
        return cached || getFallbackStats(coin);
      }
      const data = await response.json();
      difficulty = data.data?.difficulty || FALLBACK_DIFFICULTIES[coin];
      blockHeight = data.data?.blocks || undefined;
    } else if (coin === 'dgb' || coin === 'bc2' || coin === 'btcs') {
      // WhatToMine API coins (DGB, BC2, BTCS)
      try {
        const response = await fetchWithTimeout(config.difficultyApi);
        if (!response.ok) {
          console.warn(`${coin.toUpperCase()} WhatToMine API unavailable, using fallback`);
          difficulty = FALLBACK_DIFFICULTIES[coin];
        } else {
          const data = await response.json();
          difficulty = data.difficulty || FALLBACK_DIFFICULTIES[coin];
          // WhatToMine provides current block reward
          if (data.block_reward) {
            COIN_CONFIGS[coin].blockReward = data.block_reward;
          }
        }
      } catch {
        difficulty = FALLBACK_DIFFICULTIES[coin];
      }
    } else {
      return null;
    }

    const stats: NetworkStats = {
      coin,
      difficulty,
      blockReward: config.blockReward,
      blockHeight,
      blockTimeSeconds: config.blockTimeSeconds,
      lastUpdated: now,
    };

    cachedNetworkStats.set(coin, stats);
    lastNetworkFetch.set(coin, now);

    return stats;
  } catch (error) {
    console.error(`Failed to fetch ${coin} network stats:`, error);
    return cached || null;
  }
}

/**
 * Fetch coin price from CoinGecko
 */
export async function fetchCoinPrice(coin: MiningCoin, currency: string = 'usd'): Promise<number | null> {
  const config = COIN_CONFIGS[coin];

  try {
    const response = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${config.coingeckoId}&vs_currencies=${currency}`
    );

    if (!response.ok) {
      console.error(`Failed to fetch ${coin} price:`, response.status);
      return null;
    }

    const data = await response.json();
    return data[config.coingeckoId]?.[currency] || null;
  } catch (error) {
    console.error(`Failed to fetch ${coin} price:`, error);
    return null;
  }
}

/**
 * Calculate mining profitability for a specific coin
 * @param coin - The coin to calculate for (btc, bch, dgb)
 * @param hashrateGH - Hashrate in GH/s (gigahashes per second)
 * @param powerWatts - Power consumption in watts
 * @param cryptoPriceUsd - Current coin price in USD (or selected fiat)
 * @param electricityCostPerKwh - Electricity cost in $/kWh
 * @param difficulty - Network difficulty (optional, will fetch if not provided)
 */
export async function calculateProfitability(
  coin: MiningCoin,
  hashrateGH: number,
  powerWatts: number,
  cryptoPriceUsd: number,
  electricityCostPerKwh: number = 0.10,
  difficulty?: number
): Promise<ProfitabilityResult | null> {
  const config = COIN_CONFIGS[coin];

  // Get network difficulty if not provided
  let networkDifficulty = difficulty;
  let blockTimeSeconds = config.blockTimeSeconds;
  let blockReward = config.blockReward;

  if (!networkDifficulty) {
    const stats = await fetchNetworkStats(coin);
    if (!stats) {
      return null;
    }
    networkDifficulty = stats.difficulty;
    blockTimeSeconds = stats.blockTimeSeconds;
    blockReward = stats.blockReward;
  }

  // Note: DGB SHA-256 stats from WhatToMine already account for multi-algo
  // (75s effective block time, SHA-256 specific reward) - no adjustment needed

  // Convert GH/s to H/s
  const hashrateH = hashrateGH * 1e9;

  // Calculate daily crypto earnings
  // Formula: (hashrate * seconds_per_day * block_reward) / (difficulty * 2^32)
  const secondsPerDay = 86400;
  const dailyCrypto = (hashrateH * secondsPerDay * blockReward) / (networkDifficulty * Math.pow(2, 32));

  // Calculate earnings for different periods
  const weeklyCrypto = dailyCrypto * 7;
  const monthlyCrypto = dailyCrypto * 30;
  const yearlyCrypto = dailyCrypto * 365;

  // Convert to fiat
  const dailyFiat = dailyCrypto * cryptoPriceUsd;
  const weeklyFiat = weeklyCrypto * cryptoPriceUsd;
  const monthlyFiat = monthlyCrypto * cryptoPriceUsd;
  const yearlyFiat = yearlyCrypto * cryptoPriceUsd;

  // Calculate power costs
  const dailyKwh = (powerWatts * 24) / 1000;
  const dailyPowerCost = dailyKwh * electricityCostPerKwh;
  const weeklyPowerCost = dailyPowerCost * 7;
  const monthlyPowerCost = dailyPowerCost * 30;
  const yearlyPowerCost = dailyPowerCost * 365;

  // Calculate net profit
  const dailyProfit = dailyFiat - dailyPowerCost;
  const weeklyProfit = weeklyFiat - weeklyPowerCost;
  const monthlyProfit = monthlyFiat - monthlyPowerCost;
  const yearlyProfit = yearlyFiat - yearlyPowerCost;

  return {
    dailyCrypto,
    weeklyCrypto,
    monthlyCrypto,
    yearlyCrypto,
    dailyFiat,
    weeklyFiat,
    monthlyFiat,
    yearlyFiat,
    dailyPowerCost,
    weeklyPowerCost,
    monthlyPowerCost,
    yearlyPowerCost,
    dailyProfit,
    weeklyProfit,
    monthlyProfit,
    yearlyProfit,
    coin,
    coinSymbol: config.symbol,
    hashrate: hashrateGH,
    power: powerWatts,
    difficulty: networkDifficulty,
    cryptoPrice: cryptoPriceUsd,
    electricityCost: electricityCostPerKwh,
    blockReward,
    blockTimeSeconds,
  };
}

// Legacy function for backwards compatibility
export async function calculateProfitabilityLegacy(
  hashrateGH: number,
  powerWatts: number,
  btcPriceUsd: number,
  electricityCostPerKwh: number = 0.10,
  difficulty?: number
): Promise<ProfitabilityResult | null> {
  return calculateProfitability('btc', hashrateGH, powerWatts, btcPriceUsd, electricityCostPerKwh, difficulty);
}

/**
 * Get all supported mining coins
 */
export function getSupportedCoins(): CoinConfig[] {
  return Object.values(COIN_CONFIGS);
}

/**
 * Format coin amount for display
 */
export function formatCoinAmount(amount: number, coin: MiningCoin): string {
  const config = COIN_CONFIGS[coin];

  if (coin === 'btc' || coin === 'bch') {
    // Show in satoshis if small amount
    if (amount < 0.00001) {
      const sats = Math.round(amount * 100000000);
      return sats.toLocaleString() + ' sats';
    }
    return amount.toFixed(8) + ' ' + config.symbol;
  }

  // DGB - just show the amount
  if (amount < 1) {
    return amount.toFixed(4) + ' ' + config.symbol;
  }
  return amount.toFixed(2) + ' ' + config.symbol;
}
