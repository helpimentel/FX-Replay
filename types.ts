export interface OHLC {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// Granular DB Entry
export interface CandleDBEntry extends OHLC {
  symbol: string;
  timeframe: string;
}

export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1D' | '1W' | '1M' | '12M';
export type ChartType = 'Candlestick' | 'Line' | 'Bar';
export type OrderType = 'MARKET' | 'LIMIT' | 'STOP';
export type AssetCategory = 'Forex' | 'Crypto' | 'Indices' | 'Commodities' | 'Stocks';
export type Theme = 'dark' | 'light';
export type DataProvider = string; // Reverted to string to allow custom provider IDs

// UPDATED: Provider Configuration
export interface ProviderConfig {
  id: DataProvider;
  name: string;
  free: boolean; 
  description: string;
  link: string; // Optional: link to provider's website
  supportedMarkets: AssetCategory[]; // Markets this provider supports
  status?: 'alive' | 'inactive'; // Status from backend check
  rateLimit?: string; // Optional rate limit info from backend

  // NEW: Fields for custom providers
  baseUrl?: string;
  testEndpoint?: string;
  apiKey?: string; // Stored here for custom providers, for pre-defined it's global
  isCustom?: boolean;
}

export interface AssetConfig {
  symbol: string;
  name: string;
  category: AssetCategory;
  pipDecimal: number;
  tickSize: number;
  contractSize: number;
}

export interface SessionConfig {
  symbol: string;
  timeframe: Timeframe;
  startDate: string;
  endDate: string;
}

export interface Position {
  id: string;
  type: 'BUY' | 'SELL';
  orderType: OrderType;
  entryPrice: number;
  entryTime: number;
  size: number;
  initialSize: number;
  riskAmount: number;
  tp?: number;
  sl?: number;
  trailingStop?: {
    enabled: boolean;
    distancePips: number;
    activationPrice: number;
  };
  status: 'PENDING' | 'OPEN' | 'CLOSED';
  exitPrice?: number;
  exitTime?: number;
  pnl?: number;
  closedPnl?: number;
  asset: string;
  exitReason?: 'TP' | 'SL' | 'MANUAL' | 'PARTIAL';
  breakEvenPrice?: number;
  parentId?: string;
}

// NEW: Saved Session Interface
export interface SavedSession {
  id: string;
  name: string;
  symbol: string;
  timeframe: Timeframe;
  startDate: string;
  endDate: string;
  created: number;
  lastUpdated: number;
  positions: Position[];
  balance: number;
  initialBalance: number;
}

export interface VisualTool {
  active: boolean;
  type: 'LONG' | 'SHORT';
  orderType: OrderType;
  entry: number;
  sl: number;
  tp: number;
  rr: number;
  pipsSl: number;
  pipsTp: number;
  cashRisk: number;
  cashReward: number;
  draggingPart: 'NONE' | 'ENTRY' | 'SL' | 'TP';
}

export type IndicatorType = 'SMA' | 'EMA' | 'RSI' | 'MACD' | 'BB' | 'ATR' | 'PINE' | 'SESSIONS';

export interface IndicatorConfig {
  id: string;
  type: IndicatorType;
  params: Record<string, any>;
  visible: boolean;
  color: string;
  pane: 'overlay' | 'subgraph';
  scriptId?: string;
}

export interface PineScript {
  id: string;
  name: string;
  code: string;
  enabled: boolean;
  isOverlay: boolean;
  inputs: Record<string, { label: string, value: any, type: 'number' | 'string' | 'bool' | 'color' }>;
}

export interface PerformanceStats {
  winRate: number;
  profitFactor: number;
  totalTrades: number;
  maxDrawdown: number;
  netProfit: number;
  expectancy: number;
  averageWin: number;
  averageLoss: number;
  consecutiveLosses: number;
  maxConsecutiveLosses: number;
  averageRR: number;
}

export interface MarketSession {
  name: string;
  start: string;
  end: string;
  enabled: boolean;
  color: string;
}

export type TriggeredEventType = 'SL' | 'TP' | 'PENDING_ENTRY';

export interface TriggeredEvent {
  id: string;
  time: number;
  price: number;
  type: TriggeredEventType;
  positionId: string;
  candleTime: number; 
}

export interface ChartSettings {
  showTrades: boolean;
  showPartials: boolean;
  showConnections: boolean;
  autoPauseOnTrigger: boolean;
  showGrid: boolean;
  showInfoCard: boolean;
}

// NEW: Chart Visual Theme Interface
export interface ChartTheme {
  background: string;
  textColor: string;
  gridColor: string;
  candleUp: string;
  candleDown: string;
  wickUp: string;
  wickDown: string;
}

export interface DBStatus {
  isInstalled: boolean;
  candleCount: number;
  dbVersion: number;
}

// DRAWING TOOLS
export type DrawingType = 
  'TRENDLINE' | 'HORIZONTAL' | 'RAY' | 'FIBONACCI' | 'RECTANGLE' | 'TEXT' |
  'VERTICAL' | 'PARALLEL_CHANNEL' | 'ELLIPSE' | 'TRIANGLE' | 'ARROW_LINE';

export interface DrawingPoint {
    time: number;
    price: number;
}

export interface Drawing {
    id: string;
    type: DrawingType;
    points: DrawingPoint[]; // Can be 1, 2, or 3+ points
    properties: {
        color: string;
        lineWidth: number;
        lineStyle: number; // 0=Solid, 1=Dotted, 2=Dashed
        filled?: boolean; // For shapes (Rectangle, Ellipse, Triangle, Parallel Channel)
        fillColor?: string;
        text?: string; // For TEXT type
        fontSize?: number;
        textColor?: string;
        lineColor2?: string; // Optional for Parallel Channel
        showLevels?: boolean; // Optional for Fibonacci
    };
    selected?: boolean;
}