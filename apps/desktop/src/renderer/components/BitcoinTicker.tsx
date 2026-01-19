import { useState, useEffect } from 'react';

interface CryptoPrice {
  usd: number;
  usd_24h_change: number;
  usd_24h_vol: number;
  last_updated: number;
}

interface CoinInfo {
  id: string;
  symbol: string;
  name: string;
}

export function BitcoinTicker() {
  const [price, setPrice] = useState<CryptoPrice | null>(null);
  const [coins, setCoins] = useState<CoinInfo[]>([]);
  const [selectedCoin, setSelectedCoin] = useState<CoinInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Load supported coins and saved preference
  useEffect(() => {
    const loadCoins = async () => {
      try {
        const supportedCoins = await window.electronAPI.getSupportedCoins();
        setCoins(supportedCoins);

        // Load saved preference or default to Bitcoin
        const settings = await window.electronAPI.getSettings();
        const savedCoinId = settings['ticker_coin'] || 'bitcoin';
        const saved = supportedCoins.find((c) => c.id === savedCoinId) || supportedCoins[0];
        setSelectedCoin(saved);
      } catch (err) {
        console.error('Failed to load coins:', err);
        // Fallback to Bitcoin
        setSelectedCoin({ id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin' });
      }
    };
    loadCoins();
  }, []);

  // Fetch price when selected coin changes
  const fetchPrice = async () => {
    if (!selectedCoin) return;

    try {
      const data = await window.electronAPI.getCryptoPrice(selectedCoin.id);
      if (data) {
        setPrice(data);
        setError(false);
      } else {
        setError(true);
      }
    } catch (err) {
      console.error('Failed to fetch crypto price:', err);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedCoin) {
      setLoading(true);
      fetchPrice();
      // Refresh every 30 seconds
      const interval = setInterval(fetchPrice, 30000);
      return () => clearInterval(interval);
    }
  }, [selectedCoin]);

  // Handle coin selection
  const handleCoinSelect = async (coin: CoinInfo) => {
    setSelectedCoin(coin);
    setDropdownOpen(false);
    // Save preference
    try {
      await window.electronAPI.setSetting('ticker_coin', coin.id);
    } catch (err) {
      console.error('Failed to save coin preference:', err);
    }
  };

  const formatPrice = (value: number): string => {
    // Adjust decimal places based on price value
    const decimals = value < 1 ? 4 : value < 100 ? 2 : 0;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  };

  const formatChange = (change: number): string => {
    const sign = change >= 0 ? '+' : '';
    return `${sign}${change.toFixed(2)}%`;
  };

  if (loading && !price) {
    return (
      <div className="p-4 border-b border-border/30 bg-bg-tertiary/30">
        <div className="text-xs text-text-secondary uppercase tracking-wider mb-2">CRYPTO/USD</div>
        <div className="animate-pulse">
          <div className="h-6 bg-bg-tertiary rounded w-24 mb-1"></div>
          <div className="h-4 bg-bg-tertiary rounded w-16"></div>
        </div>
      </div>
    );
  }

  if (error || !price) {
    return (
      <div className="p-4 border-b border-border/30 bg-bg-tertiary/30">
        <div className="text-xs text-text-secondary uppercase tracking-wider mb-2">
          {selectedCoin?.symbol || 'BTC'}/USD
        </div>
        <div className="text-xs text-danger font-mono">SIGNAL LOST</div>
      </div>
    );
  }

  const isPositive = price.usd_24h_change >= 0;

  return (
    <div className="p-4 border-b border-border/30 bg-bg-tertiary/30 relative">
      {/* Coin Selector Header */}
      <div className="relative">
        <button
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="text-xs text-text-secondary uppercase tracking-wider mb-2 flex items-center gap-2 hover:text-accent transition-colors w-full"
        >
          <svg className="w-3 h-3 text-accent" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.31-8.86c-1.77-.45-2.34-.94-2.34-1.67 0-.84.79-1.43 2.1-1.43 1.38 0 1.9.66 1.94 1.64h1.71c-.05-1.34-.87-2.57-2.49-2.97V5H10.9v1.69c-1.51.32-2.72 1.3-2.72 2.81 0 1.79 1.49 2.69 3.66 3.21 1.95.46 2.34 1.15 2.34 1.87 0 .53-.39 1.39-2.1 1.39-1.6 0-2.23-.72-2.32-1.64H8.04c.1 1.7 1.36 2.66 2.86 2.97V19h2.34v-1.67c1.52-.29 2.72-1.16 2.73-2.77-.01-2.2-1.9-2.96-3.66-3.42z" />
          </svg>
          <span>{selectedCoin?.symbol || 'BTC'}/USD</span>
          <svg
            className={`w-3 h-3 ml-auto transition-transform ${dropdownOpen ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Dropdown Menu */}
        {dropdownOpen && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-bg-secondary border border-border rounded-md shadow-lg z-50 overflow-hidden">
            {coins.map((coin) => (
              <button
                key={coin.id}
                onClick={() => handleCoinSelect(coin)}
                className={`w-full px-3 py-2 text-left text-xs font-mono flex items-center justify-between hover:bg-bg-tertiary transition-colors ${
                  selectedCoin?.id === coin.id ? 'bg-accent/20 text-accent' : 'text-text-secondary'
                }`}
              >
                <span>{coin.symbol}</span>
                <span className="text-text-secondary/50">{coin.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Price Display */}
      <div className="flex items-baseline gap-2">
        <span className="text-xl font-bold font-mono text-accent terminal-glow">
          {formatPrice(price.usd)}
        </span>
      </div>

      {/* Change Indicator */}
      <div className="flex items-center gap-2 mt-1">
        <span
          className={`text-sm font-mono flex items-center gap-1 ${
            isPositive ? 'text-success' : 'text-danger'
          }`}
        >
          {isPositive ? (
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          ) : (
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          )}
          {formatChange(price.usd_24h_change)}
        </span>
        <span className="text-xs text-text-secondary">24h</span>
      </div>

      {/* Click outside to close dropdown */}
      {dropdownOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)} />
      )}
    </div>
  );
}
