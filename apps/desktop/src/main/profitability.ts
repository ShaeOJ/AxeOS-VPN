/**
 * Mining Profitability Calculator
 * Calculates estimated mining earnings based on hashrate, difficulty, and prices
 */

export interface NetworkStats {
  difficulty: number;
  blockReward: number;
  blockHeight: number;
  lastUpdated: number;
}

export interface ProfitabilityResult {
  // Earnings in crypto
  dailyBtc: number;
  weeklyBtc: number;
  monthlyBtc: number;
  yearlyBtc: number;
  // Earnings in USD
  dailyUsd: number;
  weeklyUsd: number;
  monthlyUsd: number;
  yearlyUsd: number;
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
  hashrate: number;
  power: number;
  difficulty: number;
  btcPrice: number;
  electricityCost: number;
}

// Cache for network stats
let cachedNetworkStats: NetworkStats | null = null;
let lastNetworkFetch = 0;
const NETWORK_CACHE_DURATION = 300000; // 5 minutes

// Current block reward after 2024 halving
const BLOCK_REWARD = 3.125;

/**
 * Fetch Bitcoin network stats from blockchain.info API
 */
export async function fetchNetworkStats(): Promise<NetworkStats | null> {
  const now = Date.now();

  // Return cached stats if still valid
  if (cachedNetworkStats && now - lastNetworkFetch < NETWORK_CACHE_DURATION) {
    return cachedNetworkStats;
  }

  try {
    // Fetch difficulty from blockchain.info
    const diffResponse = await fetch('https://blockchain.info/q/getdifficulty');
    if (!diffResponse.ok) {
      console.error('Failed to fetch difficulty:', diffResponse.status);
      return cachedNetworkStats;
    }
    const difficulty = parseFloat(await diffResponse.text());

    // Fetch block height
    const heightResponse = await fetch('https://blockchain.info/q/getblockcount');
    if (!heightResponse.ok) {
      console.error('Failed to fetch block height:', heightResponse.status);
      return cachedNetworkStats;
    }
    const blockHeight = parseInt(await heightResponse.text(), 10);

    cachedNetworkStats = {
      difficulty,
      blockReward: BLOCK_REWARD,
      blockHeight,
      lastUpdated: now,
    };
    lastNetworkFetch = now;

    return cachedNetworkStats;
  } catch (error) {
    console.error('Failed to fetch network stats:', error);
    return cachedNetworkStats;
  }
}

/**
 * Calculate mining profitability
 * @param hashrateGH - Hashrate in GH/s (gigahashes per second)
 * @param powerWatts - Power consumption in watts
 * @param btcPriceUsd - Current BTC price in USD
 * @param electricityCostPerKwh - Electricity cost in $/kWh
 * @param difficulty - Network difficulty (optional, will fetch if not provided)
 */
export async function calculateProfitability(
  hashrateGH: number,
  powerWatts: number,
  btcPriceUsd: number,
  electricityCostPerKwh: number = 0.10,
  difficulty?: number
): Promise<ProfitabilityResult | null> {
  // Get network difficulty if not provided
  let networkDifficulty = difficulty;
  if (!networkDifficulty) {
    const stats = await fetchNetworkStats();
    if (!stats) {
      return null;
    }
    networkDifficulty = stats.difficulty;
  }

  // Convert GH/s to H/s
  const hashrateH = hashrateGH * 1e9;

  // Calculate daily BTC earnings
  // Formula: (hashrate * seconds_per_day * block_reward) / (difficulty * 2^32)
  const secondsPerDay = 86400;
  const dailyBtc = (hashrateH * secondsPerDay * BLOCK_REWARD) / (networkDifficulty * Math.pow(2, 32));

  // Calculate earnings for different periods
  const weeklyBtc = dailyBtc * 7;
  const monthlyBtc = dailyBtc * 30;
  const yearlyBtc = dailyBtc * 365;

  // Convert to USD
  const dailyUsd = dailyBtc * btcPriceUsd;
  const weeklyUsd = weeklyBtc * btcPriceUsd;
  const monthlyUsd = monthlyBtc * btcPriceUsd;
  const yearlyUsd = yearlyBtc * btcPriceUsd;

  // Calculate power costs
  const dailyKwh = (powerWatts * 24) / 1000;
  const dailyPowerCost = dailyKwh * electricityCostPerKwh;
  const weeklyPowerCost = dailyPowerCost * 7;
  const monthlyPowerCost = dailyPowerCost * 30;
  const yearlyPowerCost = dailyPowerCost * 365;

  // Calculate net profit
  const dailyProfit = dailyUsd - dailyPowerCost;
  const weeklyProfit = weeklyUsd - weeklyPowerCost;
  const monthlyProfit = monthlyUsd - monthlyPowerCost;
  const yearlyProfit = yearlyUsd - yearlyPowerCost;

  return {
    dailyBtc,
    weeklyBtc,
    monthlyBtc,
    yearlyBtc,
    dailyUsd,
    weeklyUsd,
    monthlyUsd,
    yearlyUsd,
    dailyPowerCost,
    weeklyPowerCost,
    monthlyPowerCost,
    yearlyPowerCost,
    dailyProfit,
    weeklyProfit,
    monthlyProfit,
    yearlyProfit,
    hashrate: hashrateGH,
    power: powerWatts,
    difficulty: networkDifficulty,
    btcPrice: btcPriceUsd,
    electricityCost: electricityCostPerKwh,
  };
}

/**
 * Format satoshis for display
 */
export function formatSats(btc: number): string {
  const sats = Math.round(btc * 100000000);
  return sats.toLocaleString() + ' sats';
}

/**
 * Format BTC for display
 */
export function formatBtc(btc: number): string {
  if (btc < 0.00001) {
    return formatSats(btc);
  }
  return btc.toFixed(8) + ' BTC';
}
