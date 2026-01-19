/**
 * Crypto Price Service
 * Fetches live price data from CoinGecko API for multiple cryptocurrencies
 */

export interface CryptoPrice {
  usd: number;
  usd_24h_change: number;
  usd_24h_vol: number;
  last_updated: number;
}

export interface CoinInfo {
  id: string;        // CoinGecko API ID
  symbol: string;    // Trading symbol
  name: string;      // Display name
}

// Supported coins - focused on SHA-256 mineable coins relevant to BitAxe
export const SUPPORTED_COINS: CoinInfo[] = [
  { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin' },
  { id: 'bitcoin-cash', symbol: 'BCH', name: 'Bitcoin Cash' },
  { id: 'bitcoin-cash-sv', symbol: 'BSV', name: 'Bitcoin SV' },
  { id: 'digibyte', symbol: 'DGB', name: 'DigiByte' },
  { id: 'peercoin', symbol: 'PPC', name: 'Peercoin' },
  { id: 'namecoin', symbol: 'NMC', name: 'Namecoin' },
];

// Cache for each coin
const priceCache: Map<string, CryptoPrice> = new Map();
const lastFetchTime: Map<string, number> = new Map();
const CACHE_DURATION = 30000; // 30 seconds cache

/**
 * Get the list of supported coins
 */
export function getSupportedCoins(): CoinInfo[] {
  return SUPPORTED_COINS;
}

/**
 * Fetch price for a specific coin from CoinGecko
 */
export async function fetchCryptoPrice(coinId: string): Promise<CryptoPrice | null> {
  const now = Date.now();
  const lastFetch = lastFetchTime.get(coinId) || 0;
  const cached = priceCache.get(coinId);

  // Return cached price if still valid
  if (cached && now - lastFetch < CACHE_DURATION) {
    return cached;
  }

  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true`;
    const response = await fetch(url);

    if (!response.ok) {
      console.error(`Crypto price API error for ${coinId}:`, response.status);
      return cached || null;
    }

    const data = await response.json();

    if (data[coinId]) {
      const price: CryptoPrice = {
        usd: data[coinId].usd,
        usd_24h_change: data[coinId].usd_24h_change || 0,
        usd_24h_vol: data[coinId].usd_24h_vol || 0,
        last_updated: now,
      };
      priceCache.set(coinId, price);
      lastFetchTime.set(coinId, now);
      return price;
    }

    return cached || null;
  } catch (error) {
    console.error(`Failed to fetch ${coinId} price:`, error);
    return cached || null;
  }
}

/**
 * Fetch prices for all supported coins at once (more efficient)
 */
export async function fetchAllPrices(): Promise<Map<string, CryptoPrice>> {
  const now = Date.now();
  const coinIds = SUPPORTED_COINS.map(c => c.id).join(',');

  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coinIds}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true`;
    const response = await fetch(url);

    if (!response.ok) {
      console.error('Crypto price API error:', response.status);
      return priceCache;
    }

    const data = await response.json();

    for (const coin of SUPPORTED_COINS) {
      if (data[coin.id]) {
        const price: CryptoPrice = {
          usd: data[coin.id].usd,
          usd_24h_change: data[coin.id].usd_24h_change || 0,
          usd_24h_vol: data[coin.id].usd_24h_vol || 0,
          last_updated: now,
        };
        priceCache.set(coin.id, price);
        lastFetchTime.set(coin.id, now);
      }
    }

    return priceCache;
  } catch (error) {
    console.error('Failed to fetch crypto prices:', error);
    return priceCache;
  }
}

/**
 * Legacy function for backwards compatibility
 */
export async function fetchBitcoinPrice(): Promise<CryptoPrice | null> {
  return fetchCryptoPrice('bitcoin');
}

/**
 * Get cached price for a coin without fetching
 */
export function getCachedPrice(coinId: string = 'bitcoin'): CryptoPrice | null {
  return priceCache.get(coinId) || null;
}
