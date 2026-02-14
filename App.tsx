import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Zap, Layout, SlidersHorizontal, BarChart3, Settings, PlayCircle, Loader2, RotateCcw, ChevronDown, Pause, AlertTriangle, Paintbrush, Wallet, TrendingUp, Eye, FileText, List, PenTool, History } from 'lucide-react';
import Chart from './components/Chart';
import Controls from './components/Controls';
import TradePanel from './components/TradePanel';
import AssetModal from './components/AssetModal';
import SettingsModal from './components/SettingsModal';
import ApiKeyModal from './components/ApiKeyModal'; 
import IndicatorManager from './components/IndicatorManager';
import PineEditor from './components/PineEditor';
import PartialCloseModal from './components/PartialCloseModal';
import ChartSettingsPanel from './components/ChartSettings';
import DrawingToolbar from './components/DrawingToolbar';
import GlobalStatusBar from './components/GlobalStatusBar'; 
import EntryAnalysisPanel from './components/EntryAnalysisPanel'; 
import SessionsPanel from './components/SessionsPanel'; 
import { initializeDataService, fetchRemoteAssets, syncLatestData } from './services/dataService'; 
import { getOlderCandles, saveSession, deleteSession } from './services/dbService'; 
import { parsePineScript } from './services/pineEngine';
import { getSetting, getTfStats, getCandlesInRange, setSetting } from './services/dbService';
import { OHLC, Position, IndicatorConfig, VisualTool, SessionConfig, PineScript, Timeframe, ChartType, Theme, ChartSettings, TriggeredEvent, Drawing, DrawingType, ChartTheme, OrderType, SavedSession } from './types';
import { FOREX_PAIRS, ASSET_CONFIGS, TIMEFRAMES, TIMEFRAME_MS } from './constants';

// --- THEME DEFAULTS ---
const DEFAULT_CHART_THEME_NAVY: ChartTheme = {
    background: '#131722',
    textColor: '#d1d4dc',
    gridColor: '#1e222d',
    candleUp: '#089981',
    candleDown: '#f23645',
    wickUp: '#089981',
    wickDown: '#f23645'
};

const DEFAULT_CHART_THEME_LIGHT: ChartTheme = {
    background: '#ffffff', // Pure White
    textColor: '#131722',  // Dark Text
    gridColor: '#f0f3fa',  // Subtle Grid
    candleUp: '#089981',
    candleDown: '#f23645',
    wickUp: '#089981',
    wickDown: '#f23645'
};

const App: React.FC = () => {
  // CORE DATA STATE
  const [chartData, setChartData] = useState<OHLC[]>([]); 
  const [availableTimeframes, setAvailableTimeframes] = useState<Timeframe[]>([]);
  
  // SESSION STATE
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null); 
  const [sessionStartDate, setSessionStartDate] = useState('');
  const [sessionEndDate, setSessionEndDate] = useState('');
  const [sessionStartTime, setSessionStartTime] = useState<number>(0);
  const [sessionEndTime, setSessionEndTime] = useState<number>(0);
  const [currentReplayTime, setCurrentReplayTime] = useState<number>(0);
  
  // UI FLAGS
  const [isReplayMode, setIsReplayMode] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState('Initializing...');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLiveSyncing, setIsLiveSyncing] = useState(false); 

  // SETTINGS
  const [speed, setSpeed] = useState(1);
  const [activeAsset, setActiveAsset] = useState(FOREX_PAIRS[0]);
  const [timeframe, setTimeframe] = useState<Timeframe>('1h');
  const [initialBalance, setInitialBalance] = useState(100000); 
  
  const [chartType, setChartType] = useState<ChartType>('Candlestick');
  const [theme, setTheme] = useState<Theme>('dark');
  
  const [chartTheme, setChartTheme] = useState<ChartTheme>(() => {
      const saved = localStorage.getItem('fx_pro_chart_theme_v2');
      if (saved) return JSON.parse(saved);
      return DEFAULT_CHART_THEME_NAVY;
  });

  useEffect(() => {
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(theme);
    setSetting('fx_pro_theme', theme);
  }, [theme]);

  useEffect(() => {
      localStorage.setItem('fx_pro_chart_theme_v2', JSON.stringify(chartTheme));
  }, [chartTheme]);
  
  const [balance, setBalance] = useState(100000);
  const [positions, setPositions] = useState<Position[]>([]);
  const [visualTool, setVisualTool] = useState<VisualTool | null>(null);
  const [chartSettings, setChartSettings] = useState<ChartSettings>({ 
      showTrades: true, 
      showPartials: true, 
      showConnections: true, 
      autoPauseOnTrigger: false,
      showGrid: true 
  });
  const [triggeredEvents, setTriggeredEvents] = useState<TriggeredEvent[]>([]); 
  
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [activeDrawingTool, setActiveDrawingTool] = useState<DrawingType | 'CURSOR' | 'DELETE'>('CURSOR');
  const [showDrawingToolbar, setShowDrawingToolbar] = useState(false); 
  const [isChartSettingsOpen, setIsChartSettingsOpen] = useState(false); 

  // MODALS
  const [isAssetModalOpen, setIsAssetModalOpen] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false); 
  const [partialCloseTarget, setPartialCloseTarget] = useState<{ position: Position; percentage: number } | null>(null);

  const [globalDownloadStatus, setGlobalDownloadStatus] = useState<{ active: boolean; symbol: string; timeframe: string; added: number; total: number; phase: string } | null>(null);

  const [scripts, setScripts] = useState<PineScript[]>([]);
  const [indicators, setIndicators] = useState<IndicatorConfig[]>([
    { id: 'sess-def', type: 'SESSIONS', params: {}, visible: true, color: '#3b82f6', pane: 'overlay' }
  ]);

  const [activeMainRightPanel, setActiveMainRightPanel] = useState<'trade' | 'analysis' | 'sessions'>('trade'); 
  const [highlightedPositionId, setHighlightedPositionId] = useState<string | null>(null);
  
  const [hiddenTradeIds, setHiddenTradeIds] = useState<Set<string>>(new Set());

  const handleToggleTradeVisibility = useCallback((id: string) => {
      setHiddenTradeIds(prev => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
      });
  }, []);

  const handleToggleAllVisibility = useCallback(() => {
      setHiddenTradeIds(prev => {
          if (prev.size === positions.length && positions.length > 0) {
              return new Set(); 
          } else {
              return new Set(positions.map(p => p.id)); 
          }
      });
  }, [positions]);


  const [sidebarWidth, setSidebarWidth] = useState(() => {
      const saved = localStorage.getItem('fx_pro_sidebar_width');
      return saved ? Math.max(250, Math.min(Number(saved), 800)) : 320;
  });
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);

  const replayStateRef = useRef({ positions, currentReplayTime, chartData, chartSettings, triggeredEvents, isPlaying, asset: ASSET_CONFIGS[activeAsset] });
  const animationFrameRef = useRef<number | undefined>(undefined);
  const lastTimestampRef = useRef<number | undefined>(undefined);
  
  const dataCacheRef = useRef<Map<string, OHLC[]>>(new Map());
  
  const asset = ASSET_CONFIGS[activeAsset];

  const startResizing = useCallback((e: React.MouseEvent) => {
      e.preventDefault();
      setIsResizingSidebar(true);
  }, []);

  useEffect(() => {
      const handleMouseMove = (e: MouseEvent) => {
          if (!isResizingSidebar) return;
          const newWidth = window.innerWidth - e.clientX;
          const constrainedWidth = Math.max(250, Math.min(newWidth, 800));
          setSidebarWidth(constrainedWidth);
      };

      const handleMouseUp = () => {
          if (isResizingSidebar) {
              setIsResizingSidebar(false);
              localStorage.setItem('fx_pro_sidebar_width', String(sidebarWidth));
          }
      };

      if (isResizingSidebar) {
          window.addEventListener('mousemove', handleMouseMove);
          window.addEventListener('mouseup', handleMouseUp);
          document.body.style.cursor = 'col-resize';
          document.body.style.userSelect = 'none';
      } else {
          document.body.style.cursor = '';
          document.body.style.userSelect = '';
      }

      return () => {
          window.removeEventListener('mousemove', handleMouseMove);
          window.removeEventListener('mouseup', handleMouseUp);
      };
  }, [isResizingSidebar, sidebarWidth]);


  const bootApp = useCallback(async () => {
    setIsLoading(true);
    setLoadingMessage('Initializing data service...');
    await initializeDataService();
    const [savedTheme, savedScripts, savedInds, savedBal, savedSettings] = await Promise.all([
      getSetting('fx_pro_theme'), 
      getSetting('fx_pro_v13_scripts'), 
      getSetting('fx_pro_v13_indicators'), 
      getSetting('fx_pro_balance'), 
      getSetting('fx_pro_chart_settings')
    ]);
    
    if(savedTheme) {
        const t = savedTheme as Theme;
        setTheme(t);
        if (!localStorage.getItem('fx_pro_chart_theme_v2')) {
            setChartTheme(t === 'light' ? DEFAULT_CHART_THEME_LIGHT : DEFAULT_CHART_THEME_NAVY);
        }
    } else {
        setTheme('dark');
        if (!localStorage.getItem('fx_pro_chart_theme_v2')) {
            setChartTheme(DEFAULT_CHART_THEME_NAVY);
        }
    }

    if(savedScripts) setScripts(savedScripts as PineScript[]);
    if(savedInds) setIndicators(savedInds as IndicatorConfig[]);
    if(savedBal) { setInitialBalance(Number(savedBal)); setBalance(Number(savedBal)); }
    if(savedSettings) setChartSettings(savedSettings as ChartSettings);
    setChartType(prev => (prev !== 'Line' && prev !== 'Candlestick') ? 'Candlestick' : prev);
    
    // Strict API Control: We do NOT fetch remote assets on boot.
    // We only rely on what's available locally or defaults.
    // User must explicitly fetch/sync in AssetModal or Settings to get new lists.
    
    await refreshAvailableTimeframes(activeAsset);
    setIsLoading(false);
  }, [activeAsset]);

  useEffect(() => {
    bootApp();
  }, [bootApp]);

  // STRICT API CONTROL: Removed automatic polling useEffect.
  // The system now relies entirely on downloaded data or explicit user updates.

  const refreshAvailableTimeframes = async (symbol: string) => {
      const available: Timeframe[] = [];
      for(const tf of TIMEFRAMES) {
          const stats = await getTfStats(symbol, tf);
          if(stats.count > 0) available.push(tf);
      }
      setAvailableTimeframes(available);
  };

  useEffect(() => {
    replayStateRef.current = { positions, currentReplayTime, chartData, chartSettings, triggeredEvents, isPlaying, asset };
  }, [positions, currentReplayTime, chartData, chartSettings, triggeredEvents, isPlaying, asset]);

  useEffect(() => {
      const realizedPnL = positions.reduce((acc, p) => acc + (p.closedPnl || 0), 0);
      setBalance(initialBalance + realizedPnL);
      
      if (currentSessionId) {
          saveSession({
              id: currentSessionId,
              name: `${activeAsset} ${timeframe} (${sessionStartDate})`,
              symbol: activeAsset,
              timeframe: timeframe,
              startDate: sessionStartDate,
              endDate: sessionEndDate,
              created: parseInt(currentSessionId.split('_')[1] || Date.now().toString()),
              lastUpdated: Date.now(),
              positions: positions,
              balance: initialBalance + realizedPnL,
              initialBalance: initialBalance
          }).catch(console.error);
      }
  }, [positions, initialBalance, currentSessionId, activeAsset, timeframe, sessionStartDate, sessionEndDate]);

  const loadInitialData = async (sym: string, tf: Timeframe, start: string, end: string) => {
      // NOTE: We do NOT setChartData([]) here. Keeping the old data visible while new data loads
      // prevents the chart from unmounting, which ensures lines/drawings persist visually.
      
      setIsLoading(true);
      setLoadingMessage(`Loading ${sym} (${tf})...`);
      
      const key = `${sym}-${tf}`;
      console.log(`[App] Accessing Data Key: ${key}`);

      const stats = await getTfStats(sym, tf);
      if (stats.count < 2) {
          setIsLoading(false);
          setErrorMessage("Insufficient data. Please download history.");
          return null;
      }

      const startObj = new Date(start);
      startObj.setUTCHours(0, 0, 0, 0);
      const startTs = startObj.getTime();

      const endObj = new Date(end);
      endObj.setUTCHours(23, 59, 59, 999);
      const endTs = endObj.getTime();

      const msPerBar = TIMEFRAME_MS[tf] || 3600000;
      const contextBuffer = msPerBar * 5000; 
      const contextStart = Math.max(stats.minTime, startTs - contextBuffer);
      
      const data = await getCandlesInRange(sym, tf, contextStart, endTs);
      
      dataCacheRef.current.set(key, data);
      console.log(`[App] Cached ${data.length} candles for ${key}`);

      if (data.length < 2) {
          setIsLoading(false);
          setErrorMessage("No data found in selected range.");
          return null;
      }
      
      setChartData(dataCacheRef.current.get(key) || []);
      setIsLoading(false);
      return data;
  };

  const handleLoadMoreData = useCallback(async () => {
      if (!chartData.length) return;
      const firstTime = chartData[0].time;
      const olderData = await getOlderCandles(activeAsset, timeframe, firstTime, 5000);
      if (olderData.length > 0) {
          setChartData(prev => {
              const lastNew = olderData[olderData.length-1].time;
              if (lastNew >= prev[0].time) return prev; 
              
              const key = `${activeAsset}-${timeframe}`;
              const merged = [...olderData, ...prev];
              dataCacheRef.current.set(key, merged);
              
              return merged;
          });
      }
  }, [chartData, activeAsset, timeframe]);

  const handleStartSession = async (config: SessionConfig) => {
      const newSessionId = `sess_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
      setCurrentSessionId(newSessionId);
      setPositions([]); setVisualTool(null); setInitialBalance(100000); setBalance(100000); setTriggeredEvents([]); setDrawings([]);
      setHiddenTradeIds(new Set()); 
      
      setChartData([]); // Clear for new session
      
      const data = await loadInitialData(config.symbol, config.timeframe, config.startDate, config.endDate);
      if (data && data.length >= 2) {
          setActiveAsset(config.symbol);
          setTimeframe(config.timeframe);
          setSessionStartDate(config.startDate);
          setSessionEndDate(config.endDate);
          
          const startObj = new Date(config.startDate);
          startObj.setUTCHours(0, 0, 0, 0);
          const startTs = startObj.getTime();

          const endObj = new Date(config.endDate);
          endObj.setUTCHours(23, 59, 59, 999);
          const endTs = endObj.getTime();
          
          setSessionStartTime(startTs); 
          setSessionEndTime(endTs);

          let safeStart = startTs - 1; 

          if (safeStart < data[0].time) {
              safeStart = data[0].time;
          }

          setCurrentReplayTime(safeStart);
          setIsReplayMode(true);
          setIsAssetModalOpen(false);
          
          await saveSession({
              id: newSessionId,
              name: `${config.symbol} ${config.timeframe} (${config.startDate})`,
              symbol: config.symbol,
              timeframe: config.timeframe,
              startDate: config.startDate,
              endDate: config.endDate,
              created: Date.now(),
              lastUpdated: Date.now(),
              positions: [],
              balance: 100000,
              initialBalance: 100000
          });
      }
  };

  const handleDeleteActiveSession = async (sessionId: string) => {
      await deleteSession(sessionId);
      if (currentSessionId === sessionId) {
          setCurrentSessionId(null);
          setPositions([]);
          setChartData([]);
          setIsReplayMode(false);
          setIsPlaying(false);
          setHiddenTradeIds(new Set());
          setBalance(initialBalance); 
          setActiveMainRightPanel('sessions'); 
      }
  };

  const handleLoadSession = async (session: SavedSession) => {
      setCurrentSessionId(session.id);
      setIsPlaying(false);
      setInitialBalance(session.initialBalance);
      setBalance(session.balance);
      setPositions(session.positions);
      setVisualTool(null);
      setHiddenTradeIds(new Set()); 
      
      setChartData([]); // Clear before loading new session data
      
      const data = await loadInitialData(session.symbol, session.timeframe, session.startDate, session.endDate);
      
      if (data && data.length >= 2) {
          setActiveAsset(session.symbol);
          setTimeframe(session.timeframe);
          setSessionStartDate(session.startDate);
          setSessionEndDate(session.endDate);
          
          const endTs = new Date(session.endDate);
          endTs.setUTCHours(23, 59, 59, 999);
          setSessionStartTime(endTs.getTime());
          setSessionEndTime(endTs.getTime());
          
          const startObj = new Date(session.startDate);
          startObj.setUTCHours(0, 0, 0, 0);
          const startTs = startObj.getTime();

          let resumeTime = startTs - 1;
          const closed = session.positions.filter(p => p.status === 'CLOSED');
          if (closed.length > 0) {
              const lastExit = Math.max(...closed.map(p => p.exitTime || 0));
              if (lastExit > resumeTime) resumeTime = lastExit;
          }
          
          if (resumeTime < data[0].time) resumeTime = data[0].time;

          setCurrentReplayTime(resumeTime);
          setIsReplayMode(true);
          setActiveMainRightPanel('trade');
      }
  };

  const visibleIndex = useMemo(() => {
    if (chartData.length < 2) return 0;
    let low = 0; let high = chartData.length - 1; let idx = -1;
    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        if (chartData[mid].time <= currentReplayTime) { idx = mid; low = mid + 1; } 
        else { high = mid - 1; }
    }
    return idx === -1 ? 0 : idx;
  }, [chartData, currentReplayTime]); 

  const candleDuration = useMemo(() => TIMEFRAME_MS[timeframe] || 3600000, [timeframe]);
  const currentPrice = useMemo(() => {
      const c = chartData[visibleIndex];
      return c ? c.close : 0;
  }, [chartData, visibleIndex]);

  useEffect(() => {
    if (visualTool?.active && visualTool.orderType === 'MARKET') {
        const diff = Math.abs(visualTool.entry - currentPrice);
        if (diff > asset.tickSize * 0.1) {
             const distSl = Math.abs(visualTool.entry - visualTool.sl);
             const distTp = Math.abs(visualTool.entry - visualTool.tp);
             const isLong = visualTool.type === 'LONG';
             const newSl = isLong ? currentPrice - distSl : currentPrice + distSl;
             const newTp = isLong ? currentPrice + distTp : currentPrice - distTp;
             setVisualTool(prev => prev ? ({ ...prev, entry: currentPrice, sl: newSl, tp: newTp }) : null);
        }
    }
  }, [currentPrice, visualTool?.active, visualTool?.orderType, asset.tickSize, visualTool?.type]);

  const equity = useMemo(() => {
    const unrealizedPnL = positions.reduce((acc, pos) => {
      if (pos.status !== 'OPEN') return acc;
      const priceDiff = pos.type === 'BUY' ? currentPrice - pos.entryPrice : pos.entryPrice - currentPrice;
      return acc + (priceDiff * pos.size * asset.contractSize);
    }, 0);
    return balance + unrealizedPnL;
  }, [balance, positions, currentPrice, asset.contractSize]);

  const processPriceAction = useCallback((index: number) => {
    if (index < 0 || index >= chartData.length) return;
    const currentCandle = chartData[index];
    const { high, low, time } = currentCandle;
    let newTriggeredEvents: TriggeredEvent[] = [];

    setPositions(prevPositions => {
        let hasChanges = false;
        const updatedPositions = prevPositions.map(p => {
            if (p.status === 'CLOSED' && p.exitTime && time < p.exitTime) {
                hasChanges = true;
                const shouldBePending = p.orderType !== 'MARKET' && time < p.entryTime;
                return { ...p, status: shouldBePending ? 'PENDING' : 'OPEN', size: p.initialSize, exitPrice: undefined, exitTime: undefined, exitReason: undefined, closedPnl: 0, pnl: 0 } as Position;
            }
            if (p.status === 'OPEN' && p.orderType !== 'MARKET' && time < p.entryTime) {
                 hasChanges = true;
                 return { ...p, status: 'PENDING', entryTime: 0 } as Position;
            }
            if (p.status === 'OPEN') {
                let hitSL = false; let hitTP = false; let exitPrice = 0;
                if (p.type === 'BUY') {
                     if (p.sl && low <= p.sl) { hitSL = true; exitPrice = p.sl; }
                     else if (p.tp && high >= p.tp) { hitTP = true; exitPrice = p.tp; }
                } else {
                     if (p.sl && high >= p.sl) { hitSL = true; exitPrice = p.sl; }
                     else if (p.tp && low <= p.tp) { hitTP = true; exitPrice = p.tp; }
                }
                if (hitSL || hitTP) {
                    hasChanges = true;
                    const pnl = (p.type === 'BUY' ? exitPrice - p.entryPrice : p.entryPrice - exitPrice) * p.size * asset.contractSize;
                    if(chartSettings.autoPauseOnTrigger && (isPlaying || isReplayMode)) {
                        newTriggeredEvents.push({ id: Math.random().toString(), time: Date.now(), price: exitPrice, type: hitSL ? 'SL' : 'TP', positionId: p.id, candleTime: time });
                    }
                    return { ...p, status: 'CLOSED', exitPrice, exitTime: time, closedPnl: pnl, exitReason: hitSL ? 'SL' : 'TP' } as Position;
                }
            }
            if (p.status === 'PENDING') {
                let triggered = false;
                const price = p.entryPrice;
                if (p.type === 'BUY' && p.orderType === 'LIMIT') { if (low <= price) triggered = true; }
                else if (p.type === 'BUY' && p.orderType === 'STOP') { if (high >= price) triggered = true; }
                else if (p.type === 'SELL' && p.orderType === 'LIMIT') { if (high >= price) triggered = true; }
                else if (p.type === 'SELL' && p.orderType === 'STOP') { if (low <= price) triggered = true; }
                if (triggered) {
                    hasChanges = true;
                    if(chartSettings.autoPauseOnTrigger && (isPlaying || isReplayMode)) {
                        newTriggeredEvents.push({ id: Math.random().toString(), time: Date.now(), price: p.entryPrice, type: 'PENDING_ENTRY', positionId: p.id, candleTime: time });
                    }
                    return { ...p, status: 'OPEN', entryTime: time } as Position;
                }
            }
            return p;
        });
        if (hasChanges && chartSettings.autoPauseOnTrigger && (isPlaying || isReplayMode) && newTriggeredEvents.length > 0) {
            setIsPlaying(false);
            setTriggeredEvents(prev => [...prev, ...newTriggeredEvents]);
        }
        return hasChanges ? updatedPositions : prevPositions;
    });
  }, [chartData, asset.contractSize, chartSettings.autoPauseOnTrigger, isPlaying, isReplayMode]);

  useEffect(() => { processPriceAction(visibleIndex); }, [visibleIndex, processPriceAction]);

  useEffect(() => {
      const loop = (ts: number) => {
          if (!lastTimestampRef.current) lastTimestampRef.current = ts;
          const dt = ts - lastTimestampRef.current;
          if (replayStateRef.current.isPlaying && !isLoading && replayStateRef.current.chartData.length >= 2) {
               const state = replayStateRef.current;
               const advance = (dt / 1000) * speed * candleDuration; 
               let nextTime = state.currentReplayTime + advance;
               if (nextTime >= sessionEndTime) { nextTime = sessionEndTime; setIsPlaying(false); }
               const lastDataTime = state.chartData[state.chartData.length - 1].time;
               if (nextTime >= lastDataTime) { nextTime = lastDataTime; setIsPlaying(false); }
               setCurrentReplayTime(nextTime);
          }
          lastTimestampRef.current = ts;
          animationFrameRef.current = requestAnimationFrame(loop);
      };
      if (isPlaying) animationFrameRef.current = requestAnimationFrame(loop);
      else { if(animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current); lastTimestampRef.current = undefined; }
      return () => { if(animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current); };
  }, [isPlaying, isLoading, speed, timeframe, sessionEndTime, candleDuration]);

  const handleStep = (dir: number) => {
      if (dir === 1) {
          const nextIndex = visibleIndex + 1;
          if (nextIndex < chartData.length) setCurrentReplayTime(chartData[nextIndex].time);
      } else {
          const prevIndex = visibleIndex - 1;
          if (prevIndex >= 0) setCurrentReplayTime(chartData[prevIndex].time);
      }
  };

  const handleAssetDataDeleted = useCallback((symbol: string) => {
      setChartData([]); setIsReplayMode(false); setIsPlaying(false); setIsAssetModalOpen(true);
      for (const key of dataCacheRef.current.keys()) {
          if (key.startsWith(symbol)) dataCacheRef.current.delete(key);
      }
      refreshAvailableTimeframes(activeAsset);
  }, [activeAsset]);

  const handleDataChange = useCallback(async (symbol: string) => {
      if (symbol === activeAsset) {
          await refreshAvailableTimeframes(symbol);
          const stats = await getTfStats(symbol, timeframe);
          if (stats.count === 0) {
              setChartData([]); 
              dataCacheRef.current.delete(`${symbol}-${timeframe}`); 
          } else {
              loadInitialData(activeAsset, timeframe, sessionStartDate, sessionEndDate);
          }
      }
  }, [activeAsset, timeframe, isReplayMode, sessionStartDate, sessionEndDate]);

  const handleTradeExecution = useCallback((type: 'BUY' | 'SELL', orderType: 'MARKET' | 'LIMIT' | 'STOP', size: number, entry: number, sl?: number, tp?: number) => {
      const id = Math.random().toString(36).slice(2);
      const finalEntry = orderType === 'MARKET' ? currentPrice : entry;
      const status = orderType === 'MARKET' ? 'OPEN' : 'PENDING';
      setPositions(p => [...p, { id, type, orderType, entryPrice: finalEntry, entryTime: currentReplayTime, size, initialSize: size, riskAmount: 0, sl, tp, status, asset: activeAsset }]);
      setVisualTool(null);
  }, [currentPrice, currentReplayTime, activeAsset]);

  const handleClosePosition = useCallback((id: string, price: number) => {
      setPositions(prev => {
          const p = prev.find(x => x.id === id);
          if(!p) return prev;
          const pnl = (p.type==='BUY' ? price - p.entryPrice : p.entryPrice - price) * p.size * asset.contractSize;
          return prev.map(x => x.id === id ? { ...x, status: 'CLOSED', exitPrice: price, exitTime: currentReplayTime, closedPnl: pnl, exitReason: 'MANUAL' } : x);
      });
  }, [currentReplayTime, asset.contractSize]);

  const handleDeletePosition = useCallback((id: string) => { setPositions(p => p.filter(x => x.id !== id)); }, []);
  const handlePartialClose = useCallback((position: Position, percentage: number) => { setPartialCloseTarget({ position, percentage }); }, []);
  const handleActivateVisualTool = useCallback((t: 'LONG' | 'SHORT', ot: OrderType, rv: number, rt: 'Fixed' | 'Percent') => {
      const en = currentPrice; const isLong = t === 'LONG'; const distSl = 0.0020; const distTp = 0.0040;
      setVisualTool({ active: true, type: t, orderType: ot, entry: en, sl: isLong ? en - distSl : en + distSl, tp: isLong ? en + distTp : en - distTp, rr: 2, pipsSl: 20, pipsTp: 40, cashRisk: 100, cashReward: 200, draggingPart: 'NONE' });
  }, [currentPrice]);

  const handleUpdatePosition = useCallback((positionId: string, updates: Partial<Pick<Position, 'sl' | 'tp' | 'entryPrice'>>) => {
      setPositions(p => p.map(x => x.id === positionId ? { ...x, ...updates } : x));
  }, []);

  const equityColor = equity > balance ? 'text-emerald-500' : equity < balance ? 'text-rose-500' : 'text-[var(--text-primary)]';

  return (
    <div className="flex h-screen bg-[var(--background)] text-[var(--text-primary)] font-sans overflow-hidden">
      <GlobalStatusBar status={globalDownloadStatus} />
      
      {isAssetModalOpen && !isLoading && (
        <AssetModal activeSymbol={activeAsset} onClose={() => setIsAssetModalOpen(false)} onStartSession={handleStartSession} onRequireApiKey={() => setIsApiKeyModalOpen(true)} onDataDeleted={handleAssetDataDeleted} onDownloadProgress={setGlobalDownloadStatus} onDataChange={handleDataChange} theme={theme} />
      )}
      
      {isSettingsOpen && (
        <SettingsModal 
            balance={initialBalance} 
            onUpdateBalance={setInitialBalance} 
            theme={theme} 
            onUpdateTheme={(newTheme) => { 
                setTheme(newTheme); 
                if (newTheme === 'dark') setChartTheme(DEFAULT_CHART_THEME_NAVY); 
                else setChartTheme(DEFAULT_CHART_THEME_LIGHT); 
            }} 
            onClose={() => setIsSettingsOpen(false)} 
            onProvidersUpdated={() => {
                // If providers changed, we might want to refresh available assets list, but strictly via user action later.
                // We do NOT call fetchRemoteAssets here automatically.
            }} 
        />
      )}
      
      <ApiKeyModal isOpen={isApiKeyModalOpen} onClose={() => setIsApiKeyModalOpen(false)} onSuccess={() => setIsApiKeyModalOpen(false)} theme={theme} />
      
      {errorMessage && (
        <div className="fixed inset-0 z-[200] bg-black/85 backdrop-blur-md flex flex-col items-center justify-center p-8 text-center animate-in fade-in zoom-in-95">
           <AlertTriangle size={64} className="text-amber-500 mb-6" />
           <h2 className="text-2xl font-black text-white uppercase tracking-widest mb-2">Data Issue Detected</h2>
           <p className="text-slate-400 font-mono text-sm max-w-md border-t border-slate-700 pt-4 mt-2">{errorMessage}</p>
           <div className="flex gap-4">
             <button onClick={() => { setErrorMessage(null); setIsAssetModalOpen(true); }} className="mt-8 px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white font-black uppercase rounded-xl">Open Library</button>
             <button onClick={() => setErrorMessage(null)} className="mt-8 px-8 py-3 bg-slate-700 hover:bg-slate-600 text-white font-black uppercase rounded-xl">Cancel</button>
           </div>
        </div>
      )}

      {isLoading && !errorMessage && (
          <div className="fixed inset-0 z-[200] bg-black/85 flex flex-col items-center justify-center gap-6 cursor-wait">
              <Loader2 size={64} className="text-blue-500 animate-spin" />
              <p className="text-slate-500 text-xs font-mono uppercase animate-pulse">{loadingMessage}</p>
          </div>
      )}

      <div className="flex-1 flex flex-col min-w-0 relative">
          <header className="h-12 border-b border-[var(--border)] bg-[var(--background)] flex items-center px-4 gap-4 z-50 shadow-sm transition-colors duration-200">
             <div className="flex items-center gap-2 pr-4 border-r border-[var(--border)] cursor-pointer hover:opacity-80 transition-opacity" onClick={() => setIsAssetModalOpen(true)}>
                <Zap size={18} className="text-blue-500 fill-blue-500" />
                <span className="font-black text-sm italic text-[var(--text-primary)]">{activeAsset}</span>
             </div>
             <div className="flex items-center gap-1 border-r border-[var(--border)] pr-4">
                {availableTimeframes.length > 0 ? (
                     <select value={timeframe} onChange={(e) => { 
                         const newTf = e.target.value as Timeframe; 
                         setTimeframe(newTf); 
                         loadInitialData(activeAsset, newTf, sessionStartDate, sessionEndDate); 
                     }} className="bg-transparent text-[10px] font-black uppercase text-[var(--text-primary)] outline-none cursor-pointer">
                        {availableTimeframes.map(tf => <option key={tf} value={tf} className="text-black">{tf}</option>)}
                     </select>
                 ) : <span className="text-[10px] font-black uppercase text-[var(--text-secondary)]">No Data</span>}
             </div>
             <div className="flex items-center gap-2">
                <BarChart3 size={16} className="text-[var(--text-secondary)]"/>
                <select value={chartType} onChange={(e) => setChartType(e.target.value as any)} className="bg-transparent text-[10px] font-black uppercase text-[var(--text-secondary)] outline-none cursor-pointer">
                    <option value="Candlestick" className="text-black">Candles</option>
                    <option value="Line" className="text-black">Line</option>
                </select>
             </div>
             <div className="h-6 w-px bg-[var(--border)] mx-2" />
             <div className="flex items-center gap-2">
                 <button onClick={() => setIsChartSettingsOpen(!isChartSettingsOpen)} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${isChartSettingsOpen ? 'bg-blue-600 text-white' : 'text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)]'}`}>
                     <Eye size={14} className={isChartSettingsOpen ? 'text-white' : 'text-[var(--text-secondary)]'} /> Display
                 </button>
                 <button onClick={() => setShowDrawingToolbar(!showDrawingToolbar)} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${showDrawingToolbar ? 'bg-blue-600 text-white' : 'text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)]'}`}>
                     <PenTool size={14} className={showDrawingToolbar ? 'text-white' : 'text-[var(--text-secondary)]'} /> Tools
                 </button>
                 {isLiveSyncing && (
                     <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/10 text-green-500 animate-pulse">
                         <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                         <span className="text-[10px] font-black uppercase">Live</span>
                     </div>
                 )}
             </div>
             <div className="ml-auto flex items-center gap-6">
                 <div className="flex flex-col items-end">
                     <span className="text-[8px] text-[var(--text-secondary)] font-black uppercase">Balance</span>
                     <span className="text-sm font-mono font-black text-[var(--text-primary)]">${balance.toLocaleString()}</span>
                 </div>
                 <div className="flex flex-col items-end">
                     <span className="text-[8px] text-[var(--text-secondary)] font-black uppercase">Equity</span>
                     <span className={`text-sm font-mono font-black ${equityColor}`}>${equity.toLocaleString()}</span>
                 </div>
                 <Settings size={18} className="text-[var(--text-secondary)] cursor-pointer hover:text-blue-500" onClick={() => setIsSettingsOpen(true)} />
             </div>
          </header>

          <main className="flex-1 flex flex-col relative overflow-hidden bg-[var(--background)] transition-colors duration-200">
              <DrawingToolbar activeTool={activeDrawingTool} onSelectTool={setActiveDrawingTool} theme={theme} onClearAll={() => setDrawings([])} isVisible={showDrawingToolbar} />
              <div className="flex-1 flex flex-col relative">
                  <div className="flex-1 relative isolate"> 
                     {/* Always render Chart if we are in replay mode or have data, handling empty data gracefully inside Chart */}
                     {(chartData.length >= 0 || isLoading) && ( 
                         <Chart 
                            data={chartData} 
                            chartType={chartType} 
                            positions={positions} 
                            indicators={indicators} 
                            scripts={scripts} 
                            replayIndex={visibleIndex} 
                            visualTool={visualTool} 
                            onUpdateVisualTool={setVisualTool} 
                            onUpdatePosition={handleUpdatePosition} 
                            chartSettings={chartSettings} 
                            pipDecimal={asset.pipDecimal} 
                            asset={asset} 
                            theme={theme} 
                            chartTheme={chartTheme} 
                            currentPrice={currentPrice} 
                            triggeredEvents={triggeredEvents} 
                            drawings={drawings} 
                            activeDrawingTool={activeDrawingTool} 
                            onUpdateDrawings={setDrawings} 
                            onDrawingComplete={() => setActiveDrawingTool('CURSOR')} 
                            onLoadMoreHistory={handleLoadMoreData} 
                            highlightedPositionId={highlightedPositionId} 
                            timeframe={timeframe} 
                            hiddenTradeIds={hiddenTradeIds} 
                         />
                     )}
                  </div>
                  {isReplayMode && <Controls isPlaying={isPlaying} onTogglePlay={() => setIsPlaying(!isPlaying)} onStep={handleStep} speed={speed} onSpeedChange={setSpeed} currentCandle={chartData[visibleIndex]} sessionEndTime={sessionEndTime} theme={theme} />}
              </div>
          </main>
      </div>
      
      <div ref={sidebarRef} className="flex flex-col border-l border-[var(--border)] h-full flex-shrink-0 relative bg-[var(--background)] shadow-2xl z-40 transition-colors duration-200" style={{ width: sidebarWidth }}>
          <div className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize z-50 hover:bg-blue-500/50 transition-colors" onMouseDown={startResizing} />
          <div className="flex-shrink-0 flex items-center gap-1 px-3 py-2 border-b border-[var(--border)] bg-[var(--surface-secondary)]" style={{ height: '48px' }}>
              <button onClick={() => setActiveMainRightPanel('trade')} className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${activeMainRightPanel === 'trade' ? 'bg-blue-600 text-white shadow-md' : 'text-[var(--text-secondary)] hover:bg-[var(--surface)] hover:text-blue-500'}`}>
                  <Wallet size={14} /> Trades
              </button>
              <button onClick={() => setActiveMainRightPanel('analysis')} className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${activeMainRightPanel === 'analysis' ? 'bg-blue-600 text-white shadow-md' : 'text-[var(--text-secondary)] hover:bg-[var(--surface)] hover:text-blue-500'}`}>
                  <FileText size={14} /> Analysis
              </button>
              <button onClick={() => setActiveMainRightPanel('sessions')} className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${activeMainRightPanel === 'sessions' ? 'bg-blue-600 text-white shadow-md' : 'text-[var(--text-secondary)] hover:bg-[var(--surface)] hover:text-blue-500'}`}>
                  <History size={14} /> Sessions
              </button>
          </div>
          <div className="flex-1 overflow-hidden relative flex flex-col">
              {activeMainRightPanel === 'trade' && <TradePanel currentPrice={currentPrice} balance={balance} positions={positions} theme={theme} asset={asset} visualTool={visualTool} onTrade={handleTradeExecution} onClosePosition={handleClosePosition} onDeletePosition={handleDeletePosition} onPartialClose={handlePartialClose} onActivateVisualTool={handleActivateVisualTool} onCancelVisualTool={() => setVisualTool(null)} onUpdateVisualTool={setVisualTool} onUpdatePosition={handleUpdatePosition} />}
              {activeMainRightPanel === 'analysis' && (
                  <EntryAnalysisPanel 
                    positions={positions} 
                    chartData={chartData} 
                    currentReplayTime={currentReplayTime} 
                    asset={asset} 
                    theme={theme} 
                    onHighlightPosition={setHighlightedPositionId} 
                    hiddenTradeIds={hiddenTradeIds}
                    onToggleVisibility={handleToggleTradeVisibility}
                    onToggleAllVisibility={handleToggleAllVisibility}
                    highlightedPositionId={highlightedPositionId} 
                  />
              )}
              {activeMainRightPanel === 'sessions' && (
                  <SessionsPanel 
                    theme={theme} 
                    onLoadSession={handleLoadSession} 
                    currentSessionId={currentSessionId}
                    hiddenTradeIds={hiddenTradeIds}
                    onToggleVisibility={handleToggleTradeVisibility}
                    onDeleteSession={handleDeleteActiveSession}
                    onHighlightPosition={setHighlightedPositionId}
                  />
              )}
          </div>
      </div>

      {isChartSettingsOpen && <ChartSettingsPanel settings={chartSettings} onUpdate={setChartSettings} theme={theme} chartTheme={chartTheme} onUpdateChartTheme={setChartTheme} onClose={() => setIsChartSettingsOpen(false)} />}
      
      {partialCloseTarget && (
        <PartialCloseModal data={partialCloseTarget} currentPrice={currentPrice} balance={balance} asset={asset} theme={theme} onClose={() => setPartialCloseTarget(null)} onConfirm={(id, sz, price) => { setPositions(prev => { const p = prev.find(x => x.id === id); if(!p) return prev; const rem = p.size - sz; const pnl = (p.type==='BUY'?price-p.entryPrice:p.entryPrice-price)*sz*asset.contractSize; const closedPortion = { ...p, id: Math.random().toString(), size: sz, initialSize: sz, status: 'CLOSED' as const, exitPrice: price, exitTime: currentReplayTime, closedPnl: pnl, parentId: p.id, exitReason: 'PARTIAL' as const }; if(rem < 0.01) return prev.map(x => x.id===id ? {...x, status:'CLOSED', exitPrice:price, exitTime:currentReplayTime, closedPnl:pnl, exitReason: 'MANUAL'} : x); return [...prev.map(x => x.id===id ? {...x, size: rem} : x), closedPortion]; }); }} />
      )}
    </div>
  );
};

export default App;