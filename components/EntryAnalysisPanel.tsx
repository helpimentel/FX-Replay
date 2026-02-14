import React, { useState, useMemo, useEffect, useRef } from 'react';
import { OHLC, Position, AssetConfig, Theme, OrderType } from '../types';
import { calculatePerformance } from '../services/performanceService';
import { createChart, IChartApi, ISeriesApi, ColorType, LineStyle } from 'lightweight-charts';
import { Scale, Filter, GitCommit, Target, ArrowUp, ArrowDown, TrendingUp, TrendingDown, BarChart2, Hash, Calculator, Sigma, Eye, EyeOff } from 'lucide-react';

interface EntryAnalysisPanelProps {
  positions: Position[];
  chartData: OHLC[];
  currentReplayTime: number;
  asset: AssetConfig;
  theme: Theme;
  onHighlightPosition: (positionId: string) => void;
  hiddenTradeIds?: Set<string>;
  onToggleVisibility?: (id: string) => void;
  onToggleAllVisibility?: () => void;
  highlightedPositionId?: string | null; // Added prop for active styling
}

// Helper function to calculate Pips
const calculatePips = (priceDiff: number, pipDecimal: number): number => {
  return Math.abs(priceDiff) * Math.pow(10, pipDecimal);
};

const EntryAnalysisPanel: React.FC<EntryAnalysisPanelProps> = ({ 
  positions, chartData, currentReplayTime, asset, theme, onHighlightPosition,
  hiddenTradeIds = new Set(), onToggleVisibility, onToggleAllVisibility, highlightedPositionId
}) => {
  const [filterType, setFilterType] = useState<'ALL' | 'BUY' | 'SELL'>('ALL');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'OPEN' | 'CLOSED'>('ALL');
  const [sortBy, setSortBy] = useState<'entryTime' | 'duration' | 'pnl' | 'rr'>('entryTime');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Chart Refs
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartApiRef = useRef<IChartApi | null>(null);
  const seriesApiRef = useRef<ISeriesApi<'Area'> | null>(null);

  // --- DERIVED DATA & STATS ---
  const { analyzedPositions, metrics, equityCurve } = useMemo(() => {
    // 1. Process All Positions for Table & Basic Stats
    const processed = positions
      .filter(pos => pos.status !== 'PENDING')
      .map(pos => {
        // PnL Calculation
        const isClosed = pos.status === 'CLOSED';
        const exitPrice = isClosed ? (pos.exitPrice || pos.entryPrice) : (chartData[chartData.length - 1]?.close || pos.entryPrice);
        
        const priceDiff = pos.type === 'BUY' ? exitPrice - pos.entryPrice : pos.entryPrice - exitPrice;
        const pnl = priceDiff * pos.size * asset.contractSize;
        
        // R:R Calculation Logic
        let realizedRR = 0;
        let plannedRR = 0;
        
        // Risk Calculation: |Entry - SL|
        // Only calculate R if SL exists and is distinct from Entry (Risk > 0)
        const risk = pos.sl ? Math.abs(pos.entryPrice - pos.sl) : 0;
        const hasValidRisk = risk > asset.tickSize * 0.1; // Tolerance for floating point

        if (hasValidRisk) {
            // Reward (or Loss) is purely the distance traveled in/against direction
            const rewardDist = pos.type === 'BUY' 
                ? exitPrice - pos.entryPrice 
                : pos.entryPrice - exitPrice;
            
            realizedRR = rewardDist / risk;

            if (pos.tp) {
                const plannedReward = Math.abs(pos.tp - pos.entryPrice);
                plannedRR = plannedReward / risk;
            }
        }

        const duration = isClosed && pos.exitTime ? pos.exitTime - pos.entryTime : currentReplayTime - pos.entryTime;
        const pips = calculatePips(priceDiff, asset.pipDecimal);

        return { 
            ...pos, 
            currentPnl: pnl, 
            finalPnl: isClosed ? (pos.closedPnl || pnl) : pnl, 
            duration, 
            pips, 
            realizedRR,
            plannedRR,
            hasValidRisk
        };
      });

    // 2. Filter for Table Display
    const filtered = processed.filter(pos => {
        if (filterType !== 'ALL' && pos.type !== filterType) return false;
        if (filterStatus !== 'ALL' && pos.status !== filterStatus) return false;
        return true;
    }).sort((a, b) => {
        let valA: any = a[sortBy as keyof typeof a];
        let valB: any = b[sortBy as keyof typeof b];
        
        // Map specific sort keys
        if (sortBy === 'pnl') { valA = a.finalPnl; valB = b.finalPnl; }
        if (sortBy === 'rr') { valA = a.realizedRR; valB = b.realizedRR; }

        if (valA === undefined) return 1;
        if (valB === undefined) return -1;
        
        return sortDirection === 'asc' ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1);
    });

    // 3. Calculate Advanced Metrics (Only CLOSED trades for accuracy)
    const closedTrades = processed.filter(p => p.status === 'CLOSED');
    const winTrades = closedTrades.filter(p => p.finalPnl > 0);
    const lossTrades = closedTrades.filter(p => p.finalPnl <= 0);

    const totalTrades = closedTrades.length;
    const winRate = totalTrades > 0 ? (winTrades.length / totalTrades) * 100 : 0;
    
    const grossProfit = winTrades.reduce((sum, p) => sum + p.finalPnl, 0);
    const grossLoss = lossTrades.reduce((sum, p) => sum + p.finalPnl, 0);
    const netProfit = grossProfit + grossLoss; // grossLoss is negative
    
    // R:R Stats - Only include trades where Risk was defined to avoid skewing average with 0s (trades without SL)
    // or Infinite values.
    const closedWithRisk = closedTrades.filter(p => p.hasValidRisk);

    const cumRR = closedWithRisk.reduce((a, b) => a + b.realizedRR, 0); // Total Cumulative R
    const avgRR = closedWithRisk.length > 0 ? cumRR / closedWithRisk.length : 0;
    
    const rrs = closedWithRisk.map(p => p.realizedRR);
    const maxRR = rrs.length > 0 ? Math.max(...rrs) : 0;
    const minRR = rrs.length > 0 ? Math.min(...rrs) : 0;

    // Expectancy
    const avgWin = winTrades.length > 0 ? grossProfit / winTrades.length : 0;
    const avgLoss = lossTrades.length > 0 ? Math.abs(grossLoss) / lossTrades.length : 0;
    const expectancy = (avgWin * (winRate/100)) - (avgLoss * ((100-winRate)/100));

    // 4. Equity Curve Data (Accumulated PnL)
    const curveData = closedTrades
        .sort((a, b) => (a.exitTime || 0) - (b.exitTime || 0))
        .reduce((acc, trade, i) => {
            const prevVal = acc.length > 0 ? acc[acc.length - 1].value : 0;
            acc.push({
                time: (trade.exitTime || 0) / 1000 as any, // Lightweight charts wants seconds
                value: prevVal + trade.finalPnl,
                customValues: { tradeId: trade.id }
            });
            return acc;
        }, [] as { time: number, value: number, customValues?: any }[]);

    // If no closed trades, start at 0
    if (curveData.length === 0 && positions.length > 0) {
        curveData.push({ time: currentReplayTime / 1000 as any, value: 0 });
    }

    return { 
        analyzedPositions: filtered, 
        metrics: { totalTrades, winRate, avgRR, maxRR, minRR, cumRR, netProfit, expectancy, grossProfit, grossLoss },
        equityCurve: curveData 
    };
  }, [positions, chartData, currentReplayTime, asset, filterType, filterStatus, sortBy, sortDirection]);

  // --- CHART RENDERING ---
  useEffect(() => {
    if (!chartContainerRef.current) return;

    if (chartApiRef.current) {
        chartApiRef.current.remove();
        chartApiRef.current = null;
    }

    const gridColor = theme === 'dark' ? '#334155' : '#e2e8f0';

    const chart = createChart(chartContainerRef.current, {
        layout: {
            background: { type: ColorType.Solid, color: 'transparent' },
            textColor: theme === 'dark' ? '#94a3b8' : '#64748b',
            fontFamily: 'Inter, sans-serif',
            fontSize: 11, // Increased font size for better readability
        },
        grid: {
            vertLines: { visible: true, color: gridColor, style: LineStyle.Dotted },
            horzLines: { visible: true, color: gridColor, style: LineStyle.Dotted },
        },
        width: chartContainerRef.current.clientWidth,
        height: 280, // Reduced height as requested (was 350/400)
        timeScale: {
            visible: true, 
            borderVisible: true,
            borderColor: gridColor,
            timeVisible: true,
            secondsVisible: false,
        },
        rightPriceScale: {
            borderVisible: true,
            borderColor: gridColor,
            scaleMargins: { top: 0.1, bottom: 0.1 }, // Reduced margins to use more vertical space
        },
        crosshair: {
            vertLine: { visible: true, labelVisible: true },
            horzLine: { visible: true, labelVisible: true },
        },
        handleScroll: true, // Allow scrolling if zoomed
        handleScale: true,
    });

    const series = chart.addAreaSeries({
        lineColor: '#3b82f6',
        topColor: 'rgba(59, 130, 246, 0.4)',
        bottomColor: 'rgba(59, 130, 246, 0.0)',
        lineWidth: 3, // Thicker line
    });

    seriesApiRef.current = series;
    chartApiRef.current = chart;

    if (equityCurve.length > 0) {
        const uniqueData: typeof equityCurve = [];
        equityCurve.forEach((point, i) => {
            if (i > 0 && point.time <= uniqueData[uniqueData.length - 1].time) {
                point.time = uniqueData[uniqueData.length - 1].time + 1;
            }
            uniqueData.push(point);
        });
        
        series.setData(uniqueData);
        chart.timeScale().fitContent();
        
        const isPositive = uniqueData[uniqueData.length - 1].value >= 0;
        series.applyOptions({
            lineColor: isPositive ? '#10b981' : '#f23645',
            topColor: isPositive ? 'rgba(16, 185, 129, 0.4)' : 'rgba(242, 54, 69, 0.4)',
        });
    }

    const resizeObserver = new ResizeObserver(entries => {
        if (entries[0]?.contentRect && chartApiRef.current) {
            chartApiRef.current.applyOptions({ 
                width: entries[0].contentRect.width,
                height: entries[0].contentRect.height 
            });
        }
    });
    resizeObserver.observe(chartContainerRef.current);

    return () => resizeObserver.disconnect();
  }, [theme, equityCurve.length]); 

  // Update data without full re-creation
  useEffect(() => {
      if (seriesApiRef.current && equityCurve.length > 0) {
          const uniqueData: typeof equityCurve = [];
          equityCurve.forEach((point, i) => {
              if (i > 0 && point.time <= uniqueData[uniqueData.length - 1].time) {
                  point.time = uniqueData[uniqueData.length - 1].time + 1;
              }
              uniqueData.push(point);
          });
          seriesApiRef.current.setData(uniqueData);
          chartApiRef.current?.timeScale().fitContent();
          
          const isPositive = uniqueData[uniqueData.length - 1].value >= 0;
          seriesApiRef.current.applyOptions({
              lineColor: isPositive ? '#10b981' : '#f23645',
              topColor: isPositive ? 'rgba(16, 185, 129, 0.4)' : 'rgba(242, 54, 69, 0.4)',
          });
      }
  }, [equityCurve]);

  // --- UI CLASSES ---
  const bgClasses = theme === 'dark' ? "bg-[#131722]" : "bg-white";
  const cardClasses = theme === 'dark' ? "bg-[#1e222d] border-slate-800" : "bg-slate-50 border-slate-200";
  const textClasses = theme === 'dark' ? "text-[#d1d4dc]" : "text-slate-700";
  const mutedTextClass = theme === 'dark' ? "text-slate-500" : "text-slate-400";
  const headerTextClasses = theme === 'dark' ? "text-slate-400" : "text-slate-600";
  const tableHeaderBg = theme === 'dark' ? 'bg-slate-900/90' : 'bg-slate-100/90';

  const formatCurrency = (val: number) => `$${Math.abs(val).toFixed(2)}`;

  return (
    <div 
      className={`w-full h-full flex flex-col gap-4 p-4 overflow-y-auto [&::-webkit-scrollbar]:hidden ${bgClasses}`}
      style={{ scrollbarWidth: 'none' }}
    >
      
      {/* 1. METRICS DASHBOARD */}
      <div className={`flex-shrink-0 grid grid-cols-2 gap-3`}>
          {/* Win Rate & Expectancy */}
          <div className={`${cardClasses} border p-3 rounded-xl flex flex-col justify-between h-24 relative overflow-hidden`}>
              <div className="z-10">
                  <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1 flex items-center gap-1"><Target size={10}/> Win Rate</div>
                  <div className={`text-2xl font-black ${metrics.winRate >= 50 ? 'text-emerald-500' : 'text-rose-500'}`}>
                      {metrics.winRate.toFixed(1)}%
                  </div>
              </div>
              <div className="z-10 flex justify-between items-end">
                  <div className="text-[9px] text-slate-500 font-mono">{metrics.totalTrades} Trades</div>
                  <div className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${metrics.expectancy >= 0 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                      Exp: {metrics.expectancy.toFixed(2)}
                  </div>
              </div>
              <div className={`absolute -right-4 -bottom-4 opacity-5 ${metrics.winRate >= 50 ? 'text-emerald-500' : 'text-rose-500'}`}>
                  {metrics.winRate >= 50 ? <TrendingUp size={80}/> : <TrendingDown size={80}/>}
              </div>
          </div>

          {/* R:R Stats - SPLIT VIEW (Average & Total) */}
          <div className={`${cardClasses} border p-3 rounded-xl flex flex-col justify-between h-24 relative overflow-hidden`}>
              <div className="z-10 grid grid-cols-2 gap-2 h-full">
                  
                  {/* Left: Average R */}
                  <div className="flex flex-col justify-center">
                      <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1 flex items-center gap-1">
                          <Scale size={10}/> Avg R:R
                      </div>
                      <div className={`text-xl font-black ${metrics.avgRR >= 1 ? 'text-blue-500' : 'text-amber-500'}`}>
                          {metrics.avgRR.toFixed(2)}R
                      </div>
                  </div>

                  {/* Right: Total Cumulative R */}
                  <div className={`flex flex-col justify-center text-right pl-2 border-l ${theme==='dark'?'border-slate-800':'border-slate-200'}`}>
                      <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1 flex items-center justify-end gap-1">
                          <Sigma size={10}/> Total R
                      </div>
                      <div className={`text-xl font-black ${metrics.cumRR >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                          {metrics.cumRR > 0 ? '+' : ''}{metrics.cumRR.toFixed(2)}R
                      </div>
                  </div>

              </div>
          </div>
      </div>

      {/* 2. EVOLUTION CHART (Equity Curve) - REDUCED HEIGHT */}
      <div className={`flex-shrink-0 ${cardClasses} border rounded-xl overflow-hidden flex flex-col h-[280px] min-h-[280px] relative`}>
          <div className="absolute top-3 left-3 z-10 flex items-center gap-2 bg-black/20 backdrop-blur-[2px] px-2 py-1 rounded-lg">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1"><BarChart2 size={10}/> P&L Evolution</span>
              <span className={`text-[10px] font-bold ${metrics.netProfit >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                  {metrics.netProfit >= 0 ? '+' : '-'}{formatCurrency(metrics.netProfit)}
              </span>
          </div>
          <div className="flex-1 w-full relative" ref={chartContainerRef}>
              {equityCurve.length === 0 && (
                  <div className="absolute inset-0 flex items-center justify-center text-[10px] text-slate-500 italic">
                      No closed trades to analyze
                  </div>
              )}
          </div>
      </div>

      {/* 3. FILTERS */}
      <div className={`flex-shrink-0 space-y-2 pt-2 border-t ${theme === 'dark' ? 'border-slate-800/60' : 'border-slate-100'}`}>
        <div className="flex items-center justify-between">
            <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
            <Filter size={14} className="text-blue-500" /> Filters
            </h2>
            <div className="flex gap-1">
                <button onClick={() => setFilterType('ALL')} className={`px-2 py-0.5 text-[8px] font-bold rounded ${filterType === 'ALL' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400'}`}>ALL</button>
                <button onClick={() => setFilterType('BUY')} className={`px-2 py-0.5 text-[8px] font-bold rounded ${filterType === 'BUY' ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-400'}`}>BUY</button>
                <button onClick={() => setFilterType('SELL')} className={`px-2 py-0.5 text-[8px] font-bold rounded ${filterType === 'SELL' ? 'bg-rose-600 text-white' : 'bg-slate-700 text-slate-400'}`}>SELL</button>
            </div>
        </div>
      </div>

      {/* 4. POSITIONS TABLE - Natural Height */}
      <div className="flex flex-col pt-1 min-h-0 shrink-0">
        <div className="flex items-center justify-between mb-2">
            <h2 className="flex-shrink-0 text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <GitCommit size={14} className="text-blue-500" /> Trade Log
            </h2>
            {onToggleAllVisibility && (
                <button 
                    onClick={onToggleAllVisibility}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded text-[9px] font-black uppercase transition-colors ${theme === 'dark' ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-slate-200 hover:bg-slate-300 text-slate-600'}`}
                    title="Show/Hide All Trade Lines"
                >
                    {hiddenTradeIds.size === positions.length && positions.length > 0 ? (
                        <><EyeOff size={10} /> Show All</>
                    ) : (
                        <><Eye size={10} /> Hide All</>
                    )}
                </button>
            )}
        </div>
        
        <div className={`border rounded-xl overflow-visible ${theme === 'dark' ? 'border-slate-800' : 'border-slate-200'}`}>
          <table className="w-full text-left table-fixed">
            <thead className={`sticky top-0 z-10 ${tableHeaderBg} backdrop-blur-sm text-[11px] font-black uppercase tracking-wider ${headerTextClasses}`}>
              <tr className={`border-b ${theme === 'dark' ? 'border-slate-800' : 'border-slate-200'}`}>
                <th className="p-3 w-[12%]">ID</th>
                <th className="p-3 w-[22%] cursor-pointer hover:text-blue-500" onClick={() => { setSortBy('entryTime'); setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc'); }}>
                  Time {sortBy === 'entryTime' && (sortDirection === 'asc' ? <ArrowUp size={10} className="inline"/> : <ArrowDown size={10} className="inline"/>)}
                </th>
                <th className="p-3 w-[16%] text-center cursor-pointer hover:text-blue-500" onClick={() => { setSortBy('rr'); setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc'); }}>
                  R:R {sortBy === 'rr' && (sortDirection === 'asc' ? <ArrowUp size={10} className="inline"/> : <ArrowDown size={10} className="inline"/>)}
                </th>
                <th className="p-3 w-[20%] text-right">Price</th>
                <th className="p-3 w-[30%] cursor-pointer hover:text-blue-500 text-right" onClick={() => { setSortBy('pnl'); setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc'); }}>
                  P/L {sortBy === 'pnl' && (sortDirection === 'asc' ? <ArrowUp size={10} className="inline"/> : <ArrowDown size={10} className="inline"/>)}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {analyzedPositions.length === 0 ? (
                <tr>
                  <td colSpan={5} className={`p-8 text-center text-[10px] italic ${mutedTextClass}`}>
                    <div className="flex flex-col items-center gap-2">
                        <Target size={24} className="opacity-20"/>
                        No entries match.
                    </div>
                  </td>
                </tr>
              ) : (
                analyzedPositions.map(pos => {
                  const isProfit = pos.finalPnl >= 0;
                  const pnlColor = isProfit ? 'text-emerald-500' : 'text-rose-500';
                  const entryDate = new Date(pos.entryTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
                  const isHidden = hiddenTradeIds.has(pos.id);
                  const isSelected = pos.id === highlightedPositionId;
                  
                  return (
                    <tr 
                      key={pos.id} 
                      onClick={() => {
                          onHighlightPosition(pos.id);
                          if (onToggleVisibility) onToggleVisibility(pos.id);
                      }}
                      className={`text-xs cursor-pointer transition-all group border-l-4 
                          ${isHidden ? 'opacity-50 grayscale border-transparent' : 'opacity-100'}
                          ${isSelected ? (theme === 'dark' ? 'bg-blue-900/20 border-blue-500' : 'bg-blue-50 border-blue-500') : 'border-transparent'}
                          hover:${theme === 'dark' ? 'bg-slate-800/50' : 'bg-slate-50'}
                      `}
                      title="Click to toggle visibility"
                    >
                      <td className="p-3 font-mono text-slate-500 group-hover:text-blue-400 flex items-center gap-1 font-bold">
                          {isHidden ? <EyeOff size={12} className="text-slate-500"/> : <Eye size={12} className={`opacity-0 group-hover:opacity-100 ${isSelected ? 'opacity-100 text-blue-500' : ''}`} />}
                          {pos.id.substring(0, 3)}
                      </td>
                      <td className={`p-3 ${textClasses} whitespace-nowrap font-medium`}>{entryDate}</td>
                      <td className={`p-3 text-center font-black ${pos.realizedRR >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {pos.realizedRR !== 0 ? `${pos.realizedRR > 0 ? '+' : ''}${pos.realizedRR.toFixed(1)}` : '-'}
                      </td>
                      <td className={`p-3 font-mono text-right font-bold ${textClasses}`}>{pos.entryPrice.toFixed(asset.pipDecimal)}</td>
                      <td className={`p-3 font-mono font-black ${pnlColor} text-right`}>
                        {isProfit ? '+' : ''}{Math.round(pos.finalPnl)} 
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default React.memo(EntryAnalysisPanel);