import { useState, useEffect, useRef, useCallback } from 'react';
import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts';
import { createPortal } from 'react-dom';
import { useCryptoStore, CoinInfo, CurrencyInfo } from '../stores/cryptoStore';

export function BitcoinTicker() {
  const {
    coins,
    currencies,
    selectedCoin,
    selectedCurrency,
    price,
    priceHistory,
    isLoading,
    isRefreshing,
    error,
    isInitialized,
    initialize,
    setSelectedCoin,
    setSelectedCurrency,
    startPolling,
  } = useCryptoStore();

  const [coinDropdownOpen, setCoinDropdownOpen] = useState(false);
  const [currencyDropdownOpen, setCurrencyDropdownOpen] = useState(false);
  const coinButtonRef = useRef<HTMLButtonElement>(null);
  const currencyButtonRef = useRef<HTMLButtonElement>(null);
  const [coinDropdownPos, setCoinDropdownPos] = useState({ top: 0, left: 0 });
  const [currencyDropdownPos, setCurrencyDropdownPos] = useState({ top: 0, left: 0 });

  // Initialize store and start polling
  useEffect(() => {
    initialize();
    const cleanup = startPolling();
    return cleanup;
  }, []);

  // Calculate dropdown position when opening
  const updateCoinDropdownPos = useCallback(() => {
    if (coinButtonRef.current) {
      const rect = coinButtonRef.current.getBoundingClientRect();
      setCoinDropdownPos({ top: rect.bottom + 4, left: rect.left });
    }
  }, []);

  const updateCurrencyDropdownPos = useCallback(() => {
    if (currencyButtonRef.current) {
      const rect = currencyButtonRef.current.getBoundingClientRect();
      setCurrencyDropdownPos({ top: rect.bottom + 4, left: rect.left });
    }
  }, []);

  // Handle coin selection
  const handleCoinSelect = (coin: CoinInfo) => {
    setSelectedCoin(coin);
    setCoinDropdownOpen(false);
  };

  // Handle currency selection
  const handleCurrencySelect = (currency: CurrencyInfo) => {
    setSelectedCurrency(currency);
    setCurrencyDropdownOpen(false);
  };

  const formatPrice = (value: number): string => {
    if (!selectedCurrency) return value.toString();

    // JPY and CNY typically don't use decimal places
    const noDecimalCurrencies = ['jpy', 'cny'];
    const useDecimals = !noDecimalCurrencies.includes(selectedCurrency.code);

    // Adjust decimal places based on price value
    let decimals = 0;
    if (useDecimals) {
      decimals = value < 1 ? 4 : value < 100 ? 2 : 0;
    }

    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: selectedCurrency.code.toUpperCase(),
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  };

  const formatChange = (change: number): string => {
    const sign = change >= 0 ? '+' : '';
    return `${sign}${change.toFixed(2)}%`;
  };

  if (isLoading && !price) {
    return (
      <div className="p-4 border-b border-border/30 bg-bg-tertiary/30">
        <div className="text-xs text-text-secondary uppercase tracking-wider mb-2">CRYPTO</div>
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
          {selectedCoin?.symbol || 'BTC'}/{selectedCurrency?.code.toUpperCase() || 'USD'}
        </div>
        <div className="text-xs text-danger font-mono">SIGNAL LOST</div>
      </div>
    );
  }

  const isPositive = price.change_24h >= 0;

  return (
    <div className={`p-4 border-b border-border/30 bg-bg-tertiary/30 relative transition-opacity duration-150 ${isRefreshing ? 'opacity-70' : 'opacity-100'}`}>
      {/* Coin + Currency Selector Header */}
      <div className="flex items-center gap-1 mb-2">
        {/* Coin Selector */}
        <div className="relative">
          <button
            ref={coinButtonRef}
            onClick={() => {
              if (!coinDropdownOpen) {
                updateCoinDropdownPos();
              }
              setCoinDropdownOpen(!coinDropdownOpen);
              setCurrencyDropdownOpen(false);
            }}
            className="text-xs text-text-secondary uppercase tracking-wider flex items-center gap-1 hover:text-accent transition-colors"
          >
            <svg className="w-3 h-3 text-accent" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.31-8.86c-1.77-.45-2.34-.94-2.34-1.67 0-.84.79-1.43 2.1-1.43 1.38 0 1.9.66 1.94 1.64h1.71c-.05-1.34-.87-2.57-2.49-2.97V5H10.9v1.69c-1.51.32-2.72 1.3-2.72 2.81 0 1.79 1.49 2.69 3.66 3.21 1.95.46 2.34 1.15 2.34 1.87 0 .53-.39 1.39-2.1 1.39-1.6 0-2.23-.72-2.32-1.64H8.04c.1 1.7 1.36 2.66 2.86 2.97V19h2.34v-1.67c1.52-.29 2.72-1.16 2.73-2.77-.01-2.2-1.9-2.96-3.66-3.42z" />
            </svg>
            <span>{selectedCoin?.symbol || 'BTC'}</span>
            <svg
              className={`w-2.5 h-2.5 transition-transform ${coinDropdownOpen ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Coin Dropdown Menu - Portal */}
          {coinDropdownOpen && createPortal(
            <div
              className="fixed bg-bg-secondary border border-border rounded-md shadow-lg z-[9999] overflow-hidden min-w-[120px]"
              style={{ top: coinDropdownPos.top, left: coinDropdownPos.left }}
            >
              {coins.map((coin) => (
                <button
                  key={coin.id}
                  onClick={() => handleCoinSelect(coin)}
                  className={`w-full px-3 py-2 text-left text-xs font-mono flex items-center justify-between hover:bg-bg-tertiary transition-colors ${
                    selectedCoin?.id === coin.id ? 'bg-accent/20 text-accent' : 'text-text-secondary'
                  }`}
                >
                  <span>{coin.symbol}</span>
                  <span className="text-text-secondary/50 text-[10px]">{coin.name}</span>
                </button>
              ))}
            </div>,
            document.body
          )}
        </div>

        <span className="text-xs text-text-secondary/50">/</span>

        {/* Currency Selector */}
        <div className="relative">
          <button
            ref={currencyButtonRef}
            onClick={() => {
              if (!currencyDropdownOpen) {
                updateCurrencyDropdownPos();
              }
              setCurrencyDropdownOpen(!currencyDropdownOpen);
              setCoinDropdownOpen(false);
            }}
            className="text-xs text-text-secondary uppercase tracking-wider flex items-center gap-1 hover:text-accent transition-colors"
          >
            <span>{selectedCurrency?.code.toUpperCase() || 'USD'}</span>
            <svg
              className={`w-2.5 h-2.5 transition-transform ${currencyDropdownOpen ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Currency Dropdown Menu - Portal */}
          {currencyDropdownOpen && createPortal(
            <div
              className="fixed bg-bg-secondary border border-border rounded-md shadow-lg z-[9999] overflow-hidden min-w-[140px]"
              style={{ top: currencyDropdownPos.top, left: currencyDropdownPos.left }}
            >
              {currencies.map((currency) => (
                <button
                  key={currency.code}
                  onClick={() => handleCurrencySelect(currency)}
                  className={`w-full px-3 py-2 text-left text-xs font-mono flex items-center justify-between hover:bg-bg-tertiary transition-colors ${
                    selectedCurrency?.code === currency.code ? 'bg-accent/20 text-accent' : 'text-text-secondary'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="w-6">{currency.symbol}</span>
                    <span>{currency.code.toUpperCase()}</span>
                  </span>
                </button>
              ))}
            </div>,
            document.body
          )}
        </div>
      </div>

      {/* Price Display */}
      <div className="flex items-baseline gap-2">
        <span className="text-xl font-bold font-mono text-accent terminal-glow">
          {formatPrice(price.price)}
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
          {formatChange(price.change_24h)}
        </span>
        <span className="text-xs text-text-secondary">24h</span>
      </div>

      {/* Sparkline Chart */}
      {priceHistory.length > 0 && (
        <div className="mt-2 h-8 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={priceHistory}>
              <YAxis domain={['dataMin', 'dataMax']} hide />
              <Line
                type="monotone"
                dataKey="price"
                stroke={isPositive ? '#00FF41' : '#FF3131'}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Click outside to close dropdowns - Portal overlay */}
      {(coinDropdownOpen || currencyDropdownOpen) && createPortal(
        <div
          className="fixed inset-0 z-[9998]"
          onClick={() => {
            setCoinDropdownOpen(false);
            setCurrencyDropdownOpen(false);
          }}
        />,
        document.body
      )}
    </div>
  );
}
