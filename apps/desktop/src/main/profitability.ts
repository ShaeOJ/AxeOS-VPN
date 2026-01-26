/**
 * Mining Profitability Calculator
 * Calculates estimated mining earnings based on hashrate, difficulty, and prices
 * Supports BTC, BCH, and DGB (SHA-256 algo)
 */

export type MiningCoin = 'btc' | 'bch' | 'dgb';

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
    blockReward: 665, // Approximate - varies with multi-algo
    blockTimeSeconds: 15, // 15 seconds (but SHA-256 is 1 of 5 algos, so effectively 75s for SHA-256)
    difficultyApi: 'https://digiexplorer.info/api/getdifficulty',
    coingeckoId: 'digibyte',
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

/**
 * Fetch network stats for a specific coin
 */
export async function fetchNetworkStats(coin: MiningCoin = 'btc'): Promise<NetworkStats | null> {
  const now = Date.now();
  const cached = cachedNetworkStats.get(coin);
  const lastFetch = lastNetworkFetch.get(coin) || 0;

  // Return cached stats if still valid
  if (cached && now - lastFetch < NETWORK_CACHE_DURATION) {
    return cached;
  }

  const config = COIN_CONFIGS[coin];

  try {
    let difficulty: number;
    let blockHeight: number | undefined;

    if (coin === 'btc') {
      // Bitcoin - blockchain.info API
      const diffResponse = await fetch(config.difficultyApi);
      if (!diffResponse.ok) {
        console.error(`Failed to fetch ${coin} difficulty:`, diffResponse.status);
        return cached || null;
      }
      difficulty = parseFloat(await diffResponse.text());

      if (config.blockHeightApi) {
        const heightResponse = await fetch(config.blockHeightApi);
        if (heightResponse.ok) {
          blockHeight = parseInt(await heightResponse.text(), 10);
        }
      }
    } else if (coin === 'bch') {
      // Bitcoin Cash - blockchair API
      const response = await fetch(config.difficultyApi);
      if (!response.ok) {
        console.error(`Failed to fetch ${coin} stats:`, response.status);
        return cached || null;
      }
      const data = await response.json();
      difficulty = data.data?.difficulty || 0;
      blockHeight = data.data?.blocks || undefined;
    } else if (coin === 'dgb') {
      // DigiByte - digiexplorer API
      // For DGB, we need SHA-256 specific difficulty
      // The API returns difficulty for the current algo
      try {
        const response = await fetch(config.difficultyApi);
        if (!response.ok) {
          // Fallback: estimate DGB SHA-256 difficulty
          // DGB total network is split across 5 algos
          console.warn('DGB API unavailable, using estimated difficulty');
          difficulty = 1000000; // Rough estimate
        } else {
          const text = await response.text();
          // DigiExplorer returns just the difficulty number
          difficulty = parseFloat(text) || 1000000;
        }
      } catch {
        // Fallback difficulty
        difficulty = 1000000;
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

  // For DGB SHA-256, adjust for multi-algo (SHA-256 is 1 of 5 algos)
  // Each algo gets roughly 20% of blocks, so effective block time is 5x
  if (coin === 'dgb') {
    blockTimeSeconds = blockTimeSeconds * 5; // 75 seconds effective for SHA-256
    blockReward = blockReward / 5; // Proportional reward
  }

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
