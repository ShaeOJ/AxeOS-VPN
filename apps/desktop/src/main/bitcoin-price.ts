/**
 * Crypto Price Service
 * Fetches live price data from CoinGecko API for multiple cryptocurrencies
 */

export interface CryptoPrice {
  price: number;
  change_24h: number;
  vol_24h: number;
  currency: string;
  last_updated: number;
}

export interface CurrencyInfo {
  code: string;
  symbol: string;
  name: string;
}

export interface PriceHistoryPoint {
  timestamp: number;
  price: number;
}

// Supported fiat currencies
export const SUPPORTED_CURRENCIES: CurrencyInfo[] = [
  { code: 'usd', symbol: '$', name: 'US Dollar' },
  { code: 'eur', symbol: '€', name: 'Euro' },
  { code: 'gbp', symbol: '£', name: 'British Pound' },
  { code: 'aud', symbol: 'A$', name: 'Australian Dollar' },
  { code: 'cad', symbol: 'C$', name: 'Canadian Dollar' },
  { code: 'jpy', symbol: '¥', name: 'Japanese Yen' },
  { code: 'chf', symbol: 'CHF', name: 'Swiss Franc' },
  { code: 'cny', symbol: '¥', name: 'Chinese Yuan' },
];

export interface CoinInfo {
  id: string;        // CoinGecko API ID
  symbol: string;    // Trading symbol
  name: string;      // Display name
}

// Supported coins - focused on SHA-256 mineable coins relevant to BitAxe
// CoinGecko IDs must match exactly: https://api.coingecko.com/api/v3/coins/list
export const SUPPORTED_COINS: CoinInfo[] = [
  { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin' },
  { id: 'bitcoin-cash', symbol: 'BCH', name: 'Bitcoin Cash' },
  { id: 'bitcoin-cash-sv', symbol: 'BSV', name: 'Bitcoin SV' },
  { id: 'digibyte', symbol: 'DGB', name: 'DigiByte' },
  { id: 'bitcoinii', symbol: 'BC2', name: 'Bitcoin II' },
  { id: 'bitcoin-silver', symbol: 'BTCS', name: 'Bitcoin Silver' },
  { id: 'peercoin', symbol: 'PPC', name: 'Peercoin' },
  { id: 'namecoin', symbol: 'NMC', name: 'Namecoin' },
];

// Cache for each coin+currency combination
const priceCache: Map<string, CryptoPrice> = new Map();
const lastFetchTime: Map<string, number> = new Map();
const CACHE_DURATION = 60000; // 60 seconds cache (reduced API calls)

// Separate cache for price history (less frequent updates)
const historyCache: Map<string, PriceHistoryPoint[]> = new Map();
const historyLastFetch: Map<string, number> = new Map();
const HISTORY_CACHE_DURATION = 300000; // 5 minutes cache for history

// Rate limit backoff - only activate after 429 error
let rateLimitedUntil = 0;

// Fallback prices when API is unavailable (approximate values, updated periodically)
const FALLBACK_PRICES: Record<string, number> = {
  'bitcoin': 95000,
  'bitcoin-cash': 450,
  'bitcoin-cash-sv': 50,
  'digibyte': 0.01,
  'bitcoinii': 0.80,
  'bitcoin-silver': 0.01,
  'peercoin': 0.50,
  'namecoin': 1.00,
};

/**
 * Get the list of supported coins
 */
export function getSupportedCoins(): CoinInfo[] {
  return SUPPORTED_COINS;
}

/**
 * Get the list of supported currencies
 */
export function getSupportedCurrencies(): CurrencyInfo[] {
  return SUPPORTED_CURRENCIES;
}

/**
 * Check if we should skip API call due to rate limiting
 */
function isRateLimited(): boolean {
  return Date.now() < rateLimitedUntil;
}

/**
 * Set rate limit backoff after 429 error
 */
function setRateLimitBackoff(): void {
  rateLimitedUntil = Date.now() + 60000; // Back off for 60 seconds
  console.warn('CoinGecko rate limited, backing off for 60 seconds');
}

/**
 * Get fallback price when API is unavailable
 */
function getFallbackPrice(coinId: string, currency: string): CryptoPrice | null {
  const fallbackPrice = FALLBACK_PRICES[coinId];
  if (fallbackPrice !== undefined) {
    return {
      price: fallbackPrice,
      change_24h: 0,
      vol_24h: 0,
      currency: currency,
      last_updated: Date.now(),
    };
  }
  return null;
}

/**
 * Fetch price for a specific coin from CoinGecko
 */
export async function fetchCryptoPrice(coinId: string, currency: string = 'usd'): Promise<CryptoPrice | null> {
  const cacheKey = `${coinId}_${currency}`;
  const now = Date.now();
  const lastFetch = lastFetchTime.get(cacheKey) || 0;
  const cached = priceCache.get(cacheKey);

  // Return cached price if still valid
  if (cached && now - lastFetch < CACHE_DURATION) {
    return cached;
  }

  try {
    // Skip if rate limited
    if (isRateLimited()) {
      return cached || getFallbackPrice(coinId, currency);
    }

    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=${currency}&include_24hr_change=true&include_24hr_vol=true`;
    const response = await fetch(url);

    if (!response.ok) {
      if (response.status === 429) {
        setRateLimitBackoff();
      } else {
        console.error(`Crypto price API error for ${coinId}:`, response.status);
      }
      return cached || getFallbackPrice(coinId, currency);
    }

    const data = await response.json();

    if (data[coinId]) {
      const price: CryptoPrice = {
        price: data[coinId][currency],
        change_24h: data[coinId][`${currency}_24h_change`] || 0,
        vol_24h: data[coinId][`${currency}_24h_vol`] || 0,
        currency: currency,
        last_updated: now,
      };
      priceCache.set(cacheKey, price);
      lastFetchTime.set(cacheKey, now);
      return price;
    }

    return cached || getFallbackPrice(coinId, currency);
  } catch (error) {
    console.error(`Failed to fetch ${coinId} price:`, error);
    return cached || getFallbackPrice(coinId, currency);
  }
}

/**
 * Populate cache with fallback prices for all coins
 */
function populateFallbackPrices(currency: string): void {
  const now = Date.now();
  for (const coin of SUPPORTED_COINS) {
    const cacheKey = `${coin.id}_${currency}`;
    if (!priceCache.has(cacheKey)) {
      const fallback = getFallbackPrice(coin.id, currency);
      if (fallback) {
        priceCache.set(cacheKey, fallback);
        lastFetchTime.set(cacheKey, now);
      }
    }
  }
}

/**
 * Fetch prices for all supported coins at once (more efficient)
 */
export async function fetchAllPrices(currency: string = 'usd'): Promise<Map<string, CryptoPrice>> {
  const now = Date.now();
  const coinIds = SUPPORTED_COINS.map(c => c.id).join(',');

  try {
    if (isRateLimited()) {
      // Ensure we have fallback prices if cache is empty
      if (priceCache.size === 0) {
        populateFallbackPrices(currency);
      }
      return priceCache;
    }

    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coinIds}&vs_currencies=${currency}&include_24hr_change=true&include_24hr_vol=true`;
    const response = await fetch(url);

    if (!response.ok) {
      if (response.status === 429) {
        setRateLimitBackoff();
      } else {
        console.error('Crypto price API error:', response.status);
      }
      // Ensure we have fallback prices if cache is empty
      if (priceCache.size === 0) {
        populateFallbackPrices(currency);
      }
      return priceCache;
    }

    const data = await response.json();

    for (const coin of SUPPORTED_COINS) {
      if (data[coin.id]) {
        const cacheKey = `${coin.id}_${currency}`;
        const price: CryptoPrice = {
          price: data[coin.id][currency],
          change_24h: data[coin.id][`${currency}_24h_change`] || 0,
          vol_24h: data[coin.id][`${currency}_24h_vol`] || 0,
          currency: currency,
          last_updated: now,
        };
        priceCache.set(cacheKey, price);
        lastFetchTime.set(cacheKey, now);
      }
    }

    return priceCache;
  } catch (error) {
    console.error('Failed to fetch crypto prices:', error);
    // Ensure we have fallback prices if cache is empty
    if (priceCache.size === 0) {
      populateFallbackPrices(currency);
    }
    return priceCache;
  }
}

/**
 * Fetch price history for sparkline chart
 */
export async function fetchPriceHistory(coinId: string, currency: string = 'usd', days: number = 7): Promise<PriceHistoryPoint[]> {
  const cacheKey = `${coinId}_${currency}_${days}`;
  const now = Date.now();
  const lastFetch = historyLastFetch.get(cacheKey) || 0;
  const cached = historyCache.get(cacheKey);

  // Return cached history if still valid
  if (cached && now - lastFetch < HISTORY_CACHE_DURATION) {
    return cached;
  }

  try {
    if (isRateLimited()) {
      return cached || [];
    }

    const url = `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=${currency}&days=${days}`;
    const response = await fetch(url);

    if (!response.ok) {
      if (response.status === 429) {
        setRateLimitBackoff();
      } else {
        console.error(`Price history API error for ${coinId}:`, response.status);
      }
      return cached || [];
    }

    const data = await response.json();

    if (data.prices && Array.isArray(data.prices)) {
      // Downsample to ~50 points for efficient rendering
      const prices: [number, number][] = data.prices;
      const targetPoints = 50;
      const step = Math.max(1, Math.floor(prices.length / targetPoints));

      const history: PriceHistoryPoint[] = [];
      for (let i = 0; i < prices.length; i += step) {
        history.push({
          timestamp: prices[i][0],
          price: prices[i][1],
        });
      }

      // Always include the last point
      if (prices.length > 0 && history[history.length - 1]?.timestamp !== prices[prices.length - 1][0]) {
        history.push({
          timestamp: prices[prices.length - 1][0],
          price: prices[prices.length - 1][1],
        });
      }

      historyCache.set(cacheKey, history);
      historyLastFetch.set(cacheKey, now);
      return history;
    }

    return cached || [];
  } catch (error) {
    console.error(`Failed to fetch ${coinId} price history:`, error);
    return cached || [];
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
export function getCachedPrice(coinId: string = 'bitcoin', currency: string = 'usd'): CryptoPrice | null {
  const cacheKey = `${coinId}_${currency}`;
  return priceCache.get(cacheKey) || null;
}
