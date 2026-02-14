

import { AssetConfig, Timeframe, ProviderConfig } from './types';

export const ASSET_CONFIGS: Record<string, AssetConfig> = {
  // Forex (FCS API Parity) - Updated to 5 decimals for Majors
  'EUR/USD': { symbol: 'EUR/USD', name: 'Euro / US Dollar', category: 'Forex', pipDecimal: 5, tickSize: 0.00001, contractSize: 100000 },
  'GBP/USD': { symbol: 'GBP/USD', name: 'British Pound / US Dollar', category: 'Forex', pipDecimal: 5, tickSize: 0.00001, contractSize: 100000 },
  'USD/JPY': { symbol: 'USD/JPY', name: 'US Dollar / Japanese Yen', category: 'Forex', pipDecimal: 3, tickSize: 0.001, contractSize: 100000 },
  
  // Crypto (Binance Parity)
  'BTC/USDT': { symbol: 'BTC/USDT', name: 'Bitcoin / Tether', category: 'Crypto', pipDecimal: 2, tickSize: 0.01, contractSize: 1 },
  'ETH/USDT': { symbol: 'ETH/USDT', name: 'Ethereum / Tether', category: 'Crypto', pipDecimal: 2, tickSize: 0.01, contractSize: 1 },
  
  // Indices (FCS/HistData Parity)
  'SPX500': { symbol: 'SPX500', name: 'S&P 500 Index', category: 'Indices', pipDecimal: 2, tickSize: 0.01, contractSize: 10 },
  'NAS100': { symbol: 'NAS100', name: 'Nasdaq 100 Index', category: 'Indices', pipDecimal: 2, tickSize: 0.01, contractSize: 10 },
  'US30': { symbol: 'US30', name: 'Dow Jones 30 Index', category: 'Indices', pipDecimal: 2, tickSize: 0.01, contractSize: 10 },
  'DE40': { symbol: 'DE40', name: 'DAX 40 Index', category: 'Indices', pipDecimal: 2, tickSize: 0.01, contractSize: 10 },
  'UK100': { symbol: 'UK100', name: 'FTSE 100 Index', category: 'Indices', pipDecimal: 2, tickSize: 0.01, contractSize: 10 },
  'JP225': { symbol: 'JP225', name: 'Nikkei 225 Index', category: 'Indices', pipDecimal: 2, tickSize: 0.01, contractSize: 10 },
  
  // Commodities
  'XAU/USD': { symbol: 'XAU/USD', name: 'Gold / US Dollar', category: 'Commodities', pipDecimal: 2, tickSize: 0.01, contractSize: 100 },
};

export const FOREX_PAIRS = Object.keys(ASSET_CONFIGS);
export const TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1D', '1W', '1M', '12M'];
export const CHART_SPEEDS = [0.25, 0.5, 1, 2, 5, 10, 25, 50, 100];

// Precise milliseconds map for all supported timeframes
export const TIMEFRAME_MS: Record<Timeframe, number> = {
    '1m': 60 * 1000,
    '5m': 5 * 60 * 1000,
    '15m': 15 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '4h': 4 * 60 * 60 * 1000,
    '1D': 24 * 60 * 60 * 1000,
    '1W': 7 * 24 * 60 * 60 * 1000,
    '1M': 30 * 24 * 60 * 60 * 1000, // Approx
    '12M': 365 * 24 * 60 * 60 * 1000 // Approx
};

// UPDATED: Data Provider Configurations (Whitelist - only Free)
export const DATA_PROVIDERS: ProviderConfig[] = [
  {
    id: 'AlphaVantage',
    name: 'Alpha Vantage',
    free: true, 
    description: 'Free historical data with generous rate limits. (Requires API Key)',
    link: 'https://www.alphavantage.co/',
    supportedMarkets: ['Forex', 'Stocks', 'Crypto', 'Commodities']
  },
  {
    id: 'TwelveData',
    name: 'Twelve Data',
    free: true, 
    description: 'High-fidelity historical data. Free basic tier, paid for full history & real-time access.',
    link: 'https://twelvedata.com/',
    supportedMarkets: ['Forex', 'Stocks', 'Crypto', 'Indices', 'Commodities']
  },
  // Finage and other paid/internal providers are removed as per requirement.
];
