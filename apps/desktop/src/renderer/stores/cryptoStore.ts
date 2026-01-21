import { create } from 'zustand';

export interface CoinInfo {
  id: string;
  symbol: string;
  name: string;
}

export interface CurrencyInfo {
  code: string;
  symbol: string;
  name: string;
}

export interface CryptoPrice {
  price: number;
  change_24h: number;
  vol_24h: number;
  currency: string;
  last_updated: number;
}

export interface PriceHistoryPoint {
  timestamp: number;
  price: number;
}

interface CryptoState {
  // Data
  coins: CoinInfo[];
  currencies: CurrencyInfo[];
  selectedCoin: CoinInfo | null;
  selectedCurrency: CurrencyInfo | null;
  price: CryptoPrice | null;
  priceHistory: PriceHistoryPoint[];

  // Loading states
  isInitialized: boolean;
  isLoading: boolean;
  isRefreshing: boolean;
  error: boolean;

  // Actions
  initialize: () => Promise<void>;
  setSelectedCoin: (coin: CoinInfo) => Promise<void>;
  setSelectedCurrency: (currency: CurrencyInfo) => Promise<void>;
  fetchPrice: () => Promise<void>;
  fetchHistory: () => Promise<void>;
  startPolling: () => () => void;
}

export const useCryptoStore = create<CryptoState>()((set, get) => ({
  coins: [],
  currencies: [],
  selectedCoin: null,
  selectedCurrency: null,
  price: null,
  priceHistory: [],
  isInitialized: false,
  isLoading: true,
  isRefreshing: false,
  error: false,

  initialize: async () => {
    if (get().isInitialized) return;

    try {
      const [supportedCoins, supportedCurrencies, settings] = await Promise.all([
        window.electronAPI.getSupportedCoins(),
        window.electronAPI.getSupportedCurrencies(),
        window.electronAPI.getSettings(),
      ]);

      // Load saved preferences or defaults
      const savedCoinId = settings['ticker_coin'] || 'bitcoin';
      const savedCoin = supportedCoins.find((c: CoinInfo) => c.id === savedCoinId) || supportedCoins[0];

      const savedCurrencyCode = settings['ticker_currency'] || 'usd';
      const savedCurrency = supportedCurrencies.find((c: CurrencyInfo) => c.code === savedCurrencyCode) || supportedCurrencies[0];

      set({
        coins: supportedCoins,
        currencies: supportedCurrencies,
        selectedCoin: savedCoin,
        selectedCurrency: savedCurrency,
        isInitialized: true,
      });

      // Fetch initial price and history
      await get().fetchPrice();
      await get().fetchHistory();
    } catch (err) {
      console.error('Failed to initialize crypto store:', err);
      // Set fallback defaults
      set({
        selectedCoin: { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin' },
        selectedCurrency: { code: 'usd', symbol: '$', name: 'US Dollar' },
        isInitialized: true,
        isLoading: false,
      });
    }
  },

  setSelectedCoin: async (coin: CoinInfo) => {
    set({ selectedCoin: coin });

    // Save preference
    try {
      await window.electronAPI.setSetting('ticker_coin', coin.id);
    } catch (err) {
      console.error('Failed to save coin preference:', err);
    }

    // Fetch new price and history
    await get().fetchPrice();
    await get().fetchHistory();
  },

  setSelectedCurrency: async (currency: CurrencyInfo) => {
    set({ selectedCurrency: currency });

    // Save preference
    try {
      await window.electronAPI.setSetting('ticker_currency', currency.code);
    } catch (err) {
      console.error('Failed to save currency preference:', err);
    }

    // Fetch new price and history
    await get().fetchPrice();
    await get().fetchHistory();
  },

  fetchPrice: async () => {
    const { selectedCoin, selectedCurrency } = get();
    if (!selectedCoin || !selectedCurrency) return;

    set({ isRefreshing: true });
    try {
      const data = await window.electronAPI.getCryptoPrice(selectedCoin.id, selectedCurrency.code);
      if (data) {
        set({ price: data, error: false });
      } else {
        set({ error: true });
      }
    } catch (err) {
      console.error('Failed to fetch crypto price:', err);
      set({ error: true });
    } finally {
      set({ isLoading: false, isRefreshing: false });
    }
  },

  fetchHistory: async () => {
    const { selectedCoin, selectedCurrency } = get();
    if (!selectedCoin || !selectedCurrency) return;

    try {
      const history = await window.electronAPI.getPriceHistory(selectedCoin.id, selectedCurrency.code, 7);
      set({ priceHistory: history });
    } catch (err) {
      console.error('Failed to fetch price history:', err);
    }
  },

  startPolling: () => {
    // Price updates every 30 seconds
    const priceInterval = setInterval(() => {
      get().fetchPrice();
    }, 30000);

    // History updates every 5 minutes
    const historyInterval = setInterval(() => {
      get().fetchHistory();
    }, 300000);

    // Return cleanup function
    return () => {
      clearInterval(priceInterval);
      clearInterval(historyInterval);
    };
  },
}));
