import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { createChart, IChartApi, ISeriesApi, ColorType, LineStyle, CrosshairMode, Time, MouseEventParams, IPriceLine } from 'lightweight-charts';
import { OHLC, Position, IndicatorConfig, VisualTool, ChartSettings, AssetConfig, Theme, ChartTheme, TriggeredEvent, Drawing, DrawingType, PineScript, Timeframe } from '../types';
import { calculateSMA, calculateEMA, calculateRSI, calculateMACD, calculateBB, calculateATR } from '../services/indicatorService';
import { executePineScript } from '../services/pineEngine';

interface ChartProps {
  data: OHLC[];
  chartType: string;
  positions: Position[];
  indicators: IndicatorConfig[];
  scripts: PineScript[];
  replayIndex: number;
  visualTool: VisualTool | null;
  onUpdateVisualTool: (tool: VisualTool) => void;
  onUpdatePosition: (id: string, updates: Partial<Pick<Position, 'sl' | 'tp' | 'entryPrice'>>) => void;
  chartSettings: ChartSettings;
  pipDecimal: number;
  asset: AssetConfig;
  theme: Theme;
  chartTheme: ChartTheme;
  currentPrice: number;
  triggeredEvents: TriggeredEvent[];
  drawings: Drawing[];
  activeDrawingTool: DrawingType | 'CURSOR' | 'DELETE';
  onUpdateDrawings: (drawings: Drawing[]) => void;
  onDrawingComplete: () => void;
  onLoadMoreHistory: () => void;
  highlightedPositionId: string | null;
  timeframe: Timeframe;
  hiddenTradeIds?: Set<string>; // NEW PROP
}

const Chart: React.FC<ChartProps> = ({
  data,
  chartType,
  positions,
  indicators,
  scripts,
  replayIndex,
  visualTool,
  onUpdateVisualTool,
  onUpdatePosition,
  chartSettings,
  pipDecimal,
  asset,
  theme,
  chartTheme,
  currentPrice,
  triggeredEvents,
  drawings,
  activeDrawingTool,
  onUpdateDrawings,
  onDrawingComplete,
  onLoadMoreHistory,
  highlightedPositionId,
  timeframe,
  hiddenTradeIds = new Set()
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const mainSeriesRef = useRef<ISeriesApi<"Candlestick" | "Bar" | "Line"> | null>(null);
  
  // NEW: Connector Series for Highlighted Trade
  const connectorSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);

  // Indicators
  const indicatorSeriesRef = useRef<Map<string, ISeriesApi<"Line" | "Histogram">>>(new Map());
  
  // Position Lines
  const activePositionLinesRef = useRef<Map<string, { entry?: IPriceLine, sl?: IPriceLine, tp?: IPriceLine, exit?: IPriceLine }>>(new Map());
  
  // Visual Tool Refs
  const visualToolLinesRef = useRef<{ entry?: IPriceLine, sl?: IPriceLine, tp?: IPriceLine }>({});
  
  // Dragging State
  const draggingState = useRef<{ 
      active: boolean; 
      type: 'POSITION' | 'VISUAL'; 
      id?: string; 
      lineType: 'entry' | 'sl' | 'tp'; 
      startPrice: number;
  } | null>(null);
  
  // History Loading
  const isLoadingHistoryRef = useRef(false);

  // Helper to format data based on chart type
  const getChartData = useCallback((ohlcData: OHLC[]) => {
      if (chartType === 'Line') {
          return ohlcData.map(d => ({
              time: d.time / 1000 as Time,
              value: d.close
          }));
      }
      return ohlcData.map(d => ({
          time: d.time / 1000 as Time,
          open: d.open,
          high: d.high,
          low: d.low,
          close: d.close,
      }));
  }, [chartType]);

  // 1. CHART INITIALIZATION & RESIZE OBSERVER
  useEffect(() => {
    if (!chartContainerRef.current) return;
    
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: chartTheme.background },
        textColor: chartTheme.textColor,
      },
      grid: {
        vertLines: { color: chartTheme.gridColor },
        horzLines: { color: chartTheme.gridColor },
      },
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      handleScroll: {
          mouseWheel: true,
          pressedMouseMove: true,
      },
      handleScale: {
          axisPressedMouseMove: true,
          mouseWheel: true,
          pinch: true,
      },
    });
    
    chartRef.current = chart;

    const resizeObserver = new ResizeObserver(entries => {
        if (!chartRef.current || entries.length === 0 || !entries[0].contentRect) return;
        const { width, height } = entries[0].contentRect;
        chartRef.current.applyOptions({ width, height });
    });
    
    resizeObserver.observe(chartContainerRef.current);
    
    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      mainSeriesRef.current = null;
      connectorSeriesRef.current = null;
    };
  }, []); 

  // 2. THEME & GRID UPDATES
  useEffect(() => {
    if (!chartRef.current) return;
    
    // Apply Grid Settings immediately
    const gridColor = chartSettings.showGrid ? chartTheme.gridColor : 'transparent';
    
    chartRef.current.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: chartTheme.background },
        textColor: chartTheme.textColor,
      },
      grid: {
        vertLines: { color: gridColor },
        horzLines: { color: gridColor },
      },
    });
  }, [chartTheme, chartSettings.showGrid]);

  // 3. SERIES CREATION
  useEffect(() => {
    if (!chartRef.current) return;
    
    if (mainSeriesRef.current) {
      chartRef.current.removeSeries(mainSeriesRef.current);
      mainSeriesRef.current = null;
      activePositionLinesRef.current.clear();
      visualToolLinesRef.current = {};
    }

    let series: ISeriesApi<any>;
    if (chartType === 'Line') {
      series = chartRef.current.addLineSeries({ 
          color: '#2962ff', 
          lineWidth: 2,
          crosshairMarkerVisible: true
      });
    } else if (chartType === 'Bar') {
      series = chartRef.current.addBarSeries({
         upColor: chartTheme.candleUp, 
         downColor: chartTheme.candleDown,
      });
    } else {
      series = chartRef.current.addCandlestickSeries({
        upColor: chartTheme.candleUp,
        downColor: chartTheme.candleDown,
        borderUpColor: chartTheme.candleUp,
        borderDownColor: chartTheme.candleDown,
        wickUpColor: chartTheme.wickUp,
        wickDownColor: chartTheme.wickDown,
      });
    }
    
    mainSeriesRef.current = series;
    
    const visibleData = getChartData(data.slice(0, replayIndex + 1));
    
    if (visibleData.length > 0) {
        series.setData(visibleData);
    }
    
  }, [chartType]); // Dependencies for series re-creation

  // 4. SERIES THEME UPDATES
  useEffect(() => {
    if (!mainSeriesRef.current) return;
    if (chartType === 'Candlestick') {
        mainSeriesRef.current.applyOptions({
          upColor: chartTheme.candleUp,
          downColor: chartTheme.candleDown,
          borderUpColor: chartTheme.candleUp,
          borderDownColor: chartTheme.candleDown,
          wickUpColor: chartTheme.wickUp,
          wickDownColor: chartTheme.wickDown,
        });
    } else if (chartType === 'Bar') {
        mainSeriesRef.current.applyOptions({
           upColor: chartTheme.candleUp, 
           downColor: chartTheme.candleDown,
        });
    } else if (chartType === 'Line') {
        // Line chart specific theme updates if needed
        mainSeriesRef.current.applyOptions({
            color: '#2962ff', // Could be themed if desired
        });
    }
  }, [chartTheme, chartType]);

  // 5. DATA UPDATES
  useEffect(() => {
    if (!mainSeriesRef.current) return;
    const visibleData = getChartData(data.slice(0, replayIndex + 1));
    if (visibleData.length > 0) {
        mainSeriesRef.current.setData(visibleData);
    }
  }, [data, replayIndex, getChartData]);

  // --- INTERACTIVE LINES LOGIC (DRAG & DROP) ---
  useEffect(() => {
      const container = chartContainerRef.current;
      if (!container || !mainSeriesRef.current) return;

      const handleMouseDown = (e: MouseEvent) => {
          if (!chartRef.current || !mainSeriesRef.current) return;
          
          const rect = container.getBoundingClientRect();
          const y = e.clientY - rect.top;
          const price = mainSeriesRef.current.coordinateToPrice(y);
          if (price === null) return;

          // Check Positions
          for (const p of positions) {
              if (p.status === 'CLOSED') continue; // Don't drag closed positions
              if (hiddenTradeIds.has(p.id)) continue; // Don't interact with hidden trades
              
              const checkLine = (targetPrice: number | undefined, type: 'entry' | 'sl' | 'tp') => {
                  if (targetPrice === undefined) return false;
                  const targetY = mainSeriesRef.current!.priceToCoordinate(targetPrice);
                  if (targetY !== null && Math.abs(targetY - y) < 8) { // 8px tolerance
                      // Only allow dragging Entry if Pending
                      if (type === 'entry' && p.status !== 'PENDING') return false;
                      
                      draggingState.current = { active: true, type: 'POSITION', id: p.id, lineType: type, startPrice: price };
                      // Disable scrolling while dragging
                      chartRef.current!.applyOptions({ handleScroll: false, handleScale: false });
                      return true;
                  }
                  return false;
              };

              if (checkLine(p.sl, 'sl')) return;
              if (checkLine(p.tp, 'tp')) return;
              if (checkLine(p.entryPrice, 'entry')) return;
          }

          // Check Visual Tool
          if (visualTool?.active) {
               const checkVisual = (targetPrice: number, type: 'entry' | 'sl' | 'tp') => {
                  const targetY = mainSeriesRef.current!.priceToCoordinate(targetPrice);
                  if (targetY !== null && Math.abs(targetY - y) < 8) {
                      draggingState.current = { active: true, type: 'VISUAL', lineType: type, startPrice: price };
                      chartRef.current!.applyOptions({ handleScroll: false, handleScale: false });
                      return true;
                  }
                  return false;
               };
               if (checkVisual(visualTool.sl, 'sl')) return;
               if (checkVisual(visualTool.tp, 'tp')) return;
               if (checkVisual(visualTool.entry, 'entry')) return;
          }
      };

      const handleMouseMove = (e: MouseEvent) => {
          if (!chartRef.current || !mainSeriesRef.current) return;
          const rect = container.getBoundingClientRect();
          const y = e.clientY - rect.top;
          
          // CURSOR HOVER LOGIC
          if (!draggingState.current?.active) {
              let hovering = false;
              const price = mainSeriesRef.current.coordinateToPrice(y);
              
              if (price) {
                  // Check Positions
                  positions.forEach(p => {
                      if (p.status === 'CLOSED') return;
                      if (hiddenTradeIds.has(p.id)) return;
                      [p.entryPrice, p.sl, p.tp].forEach(val => {
                          if (val === undefined) return;
                          const ly = mainSeriesRef.current!.priceToCoordinate(val);
                          if (ly !== null && Math.abs(ly - y) < 8) hovering = true;
                      });
                  });
                  // Check Visual Tool
                  if (visualTool?.active) {
                      [visualTool.entry, visualTool.sl, visualTool.tp].forEach(val => {
                          const ly = mainSeriesRef.current!.priceToCoordinate(val);
                          if (ly !== null && Math.abs(ly - y) < 8) hovering = true;
                      });
                  }
              }
              container.style.cursor = hovering ? 'ns-resize' : 'crosshair';
              return;
          }

          // DRAGGING LOGIC
          const newPrice = mainSeriesRef.current.coordinateToPrice(y);
          if (newPrice === null) return;
          
          const state = draggingState.current;

          if (state.type === 'POSITION' && state.id) {
              onUpdatePosition(state.id, { [state.lineType === 'entry' ? 'entryPrice' : state.lineType]: newPrice });
          } else if (state.type === 'VISUAL' && visualTool) {
               const updates: any = {};
               if (state.lineType === 'entry') updates.entry = newPrice;
               if (state.lineType === 'sl') updates.sl = newPrice;
               if (state.lineType === 'tp') updates.tp = newPrice;
               
               const pf = Math.pow(10, pipDecimal);
               const entry = state.lineType === 'entry' ? newPrice : visualTool.entry;
               const sl = state.lineType === 'sl' ? newPrice : visualTool.sl;
               const tp = state.lineType === 'tp' ? newPrice : visualTool.tp;

               updates.pipsSl = Math.abs(entry - sl) * pf;
               updates.pipsTp = Math.abs(entry - tp) * pf;
               updates.rr = updates.pipsTp / (updates.pipsSl || 0.0001);
               updates.cashReward = visualTool.cashRisk * updates.rr;
               
               onUpdateVisualTool({ ...visualTool, ...updates });
          }
      };

      const handleMouseUp = () => {
          if (draggingState.current?.active) {
              draggingState.current = null;
              // Re-enable scrolling
              chartRef.current?.applyOptions({ handleScroll: { mouseWheel: true, pressedMouseMove: true }, handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true } });
          }
      };

      container.addEventListener('mousedown', handleMouseDown);
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);

      return () => {
          container.removeEventListener('mousedown', handleMouseDown);
          window.removeEventListener('mousemove', handleMouseMove);
          window.removeEventListener('mouseup', handleMouseUp);
      };
  }, [positions, visualTool, pipDecimal, chartSettings, activeDrawingTool, hiddenTradeIds]);


  // --- POSITION PRICE LINES (RENDER & UPDATE) ---
  useEffect(() => {
      if (!mainSeriesRef.current) return;
      
      const activeIds = new Set(positions.map(p => p.id));
      const formatMoney = (val: number) => `$${Math.abs(val).toFixed(2)}`;

      // Cleanup orphan lines
      for (const [id, lines] of activePositionLinesRef.current.entries()) {
          // If position deleted OR hidden, remove lines
          if (!activeIds.has(id) || hiddenTradeIds.has(id)) { 
              if (lines.sl) { try { mainSeriesRef.current.removePriceLine(lines.sl); } catch(e){} }
              if (lines.tp) { try { mainSeriesRef.current.removePriceLine(lines.tp); } catch(e){} }
              if (lines.entry) { try { mainSeriesRef.current.removePriceLine(lines.entry); } catch(e){} }
              if (lines.exit) { try { mainSeriesRef.current.removePriceLine(lines.exit); } catch(e){} }
              activePositionLinesRef.current.delete(id); 
          }
      }

      positions.forEach(p => {
          if (hiddenTradeIds.has(p.id)) return; // Skip rendering hidden positions

          let lines = activePositionLinesRef.current.get(p.id) || {};
          if (!activePositionLinesRef.current.has(p.id)) activePositionLinesRef.current.set(p.id, lines);
          
          const isHighlighted = p.id === highlightedPositionId;
          const isClosed = p.status === 'CLOSED';

          const syncLine = (
              type: 'sl' | 'tp' | 'entry' | 'exit', 
              price: number | undefined, 
              color: string, 
              style: LineStyle, 
              title: string,
              lineWidth: number = 1
          ) => {
              if (price === undefined) {
                  if (lines[type]) { try { mainSeriesRef.current!.removePriceLine(lines[type]!); } catch(e){} lines[type] = undefined; }
                  return;
              }

              const lineOptions = { price, color, lineWidth, lineStyle: style, axisLabelVisible: true, title };

              if (!lines[type]) {
                  try { lines[type] = mainSeriesRef.current!.createPriceLine(lineOptions); } catch(e) {}
              } else {
                  try { lines[type]!.applyOptions(lineOptions); } catch(e) {
                      try { lines[type] = mainSeriesRef.current!.createPriceLine(lineOptions); } catch(err){}
                  }
              }
          };

          if (isClosed) {
              // Only show closed lines if highlighted to reduce clutter
              if (isHighlighted) {
                  syncLine('entry', p.entryPrice, '#787b86', LineStyle.Dotted, `OPEN ${p.type}`, 1);
                  syncLine('exit', p.exitPrice, '#a855f7', LineStyle.Solid, `CLOSE ${p.closedPnl && p.closedPnl>0 ? '+' : ''}$${Math.round(p.closedPnl||0)}`, 2);
              } else {
                  syncLine('entry', undefined, '', 0, '', 0);
                  syncLine('exit', undefined, '', 0, '', 0);
              }
              syncLine('sl', undefined, '', 0, '', 0);
              syncLine('tp', undefined, '', 0, '', 0);
          } else {
              // Open/Pending Visualization
              const size = p.size;
              let slText = "SL";
              let tpText = "TP";
              if (p.sl) {
                  const lossVal = Math.abs(p.entryPrice - p.sl) * size * asset.contractSize;
                  slText = `SL -${formatMoney(lossVal)}`;
              }
              if (p.tp) {
                  const profitVal = Math.abs(p.tp - p.entryPrice) * size * asset.contractSize;
                  tpText = `TP +${formatMoney(profitVal)}`;
              }
              
              const entryColor = p.status === 'PENDING' ? '#787b86' : (p.type === 'BUY' ? '#2962ff' : '#e91e63');
              const entryStyle = p.status === 'PENDING' ? LineStyle.Dashed : LineStyle.Dotted;
              const entryTitle = p.status === 'PENDING' ? 'PENDING' : 'ENTRY';

              syncLine('entry', p.entryPrice, entryColor, entryStyle, entryTitle, isHighlighted ? 2 : 1);
              syncLine('sl', p.sl, '#ef4444', LineStyle.Solid, slText, 1);
              syncLine('tp', p.tp, '#10b981', LineStyle.Solid, tpText, 1);
              syncLine('exit', undefined, '', 0, '', 0);
          }
      });
  }, [positions, data, asset.contractSize, highlightedPositionId, chartType, hiddenTradeIds]); 


  // --- HIGHLIGHTED TRADE CONNECTOR (ENTRY TO EXIT) ---
  useEffect(() => {
    if (!chartRef.current) return;
    
    // Lazy initialization of connector series
    if (!connectorSeriesRef.current) {
        try {
            connectorSeriesRef.current = chartRef.current.addLineSeries({
                lineWidth: 2,
                lineStyle: LineStyle.Dashed,
                crosshairMarkerVisible: false,
                lastValueVisible: false,
                priceLineVisible: false,
                color: '#2962ff'
            });
        } catch(e) { console.warn("Could not create connector series", e); }
    }
    
    const series = connectorSeriesRef.current;
    if (!series) return;

    const p = positions.find(pos => pos.id === highlightedPositionId);
    
    // Check if hidden or non-existent
    if (p && !hiddenTradeIds.has(p.id) && (p.status === 'CLOSED' || p.status === 'OPEN')) {
        const startTime = (p.entryTime / 1000) as Time;
        let endTime: Time;
        let exitPrice: number;

        if (p.status === 'CLOSED' && p.exitTime) {
            endTime = (p.exitTime / 1000) as Time;
            exitPrice = p.exitPrice!;
        } else {
            // If OPEN, connect to current price candle
            const currentCandle = data[replayIndex];
            if (!currentCandle) { series.setData([]); return; }
            endTime = (currentCandle.time / 1000) as Time;
            exitPrice = currentPrice;
        }

        // Validate time order (LW charts requires strict time order for LineSeries)
        if (startTime < endTime) {
            // Determine color based on Profit/Loss
            let isWin = false;
            if (p.status === 'CLOSED') isWin = (p.closedPnl || 0) >= 0;
            else {
                const diff = p.type === 'BUY' ? exitPrice - p.entryPrice : p.entryPrice - exitPrice;
                isWin = diff >= 0;
            }
            
            series.applyOptions({ color: isWin ? '#10b981' : '#ef4444' });
            series.setData([
                { time: startTime, value: p.entryPrice },
                { time: endTime, value: exitPrice }
            ]);
        } else {
            // Cannot draw line if start == end or invalid
            series.setData([]);
        }
    } else {
        // Clear if no highlighted trade or pending or hidden
        series.setData([]);
    }
  }, [highlightedPositionId, positions, replayIndex, currentPrice, data, hiddenTradeIds]);


  // --- VISUAL TOOL LINES ---
  useEffect(() => {
    if (!mainSeriesRef.current) return;
    
    if (!visualTool || !visualTool.active) {
        Object.values(visualToolLinesRef.current).forEach(l => { if(l) try { mainSeriesRef.current!.removePriceLine(l); } catch(e){} });
        visualToolLinesRef.current = {};
        return;
    }

    const updateVisualLine = (type: 'entry' | 'sl' | 'tp', price: number, color: string, title: string) => {
        let line = visualToolLinesRef.current[type];
        const opts = { price, color, lineWidth: 2, lineStyle: LineStyle.Solid, axisLabelVisible: true, title };
        
        if (!line) {
             try {
                line = mainSeriesRef.current!.createPriceLine(opts);
                visualToolLinesRef.current[type] = line;
             } catch(e) {}
        } else {
             try { line.applyOptions(opts); } 
             catch(e) { try { line = mainSeriesRef.current!.createPriceLine(opts); visualToolLinesRef.current[type] = line; } catch(err){} }
        }
    };

    updateVisualLine('entry', visualTool.entry, '#3b82f6', 'ENTRY PREP');
    updateVisualLine('sl', visualTool.sl, '#ef4444', `SL (-$${visualTool.cashRisk.toFixed(2)})`);
    updateVisualLine('tp', visualTool.tp, '#10b981', `TP (+$${visualTool.cashReward.toFixed(2)})`);

  }, [visualTool, chartType]);

  // --- TRADE MARKERS ---
  useEffect(() => {
      if (!mainSeriesRef.current) return;
      if (!chartSettings.showTrades) {
          mainSeriesRef.current.setMarkers([]);
          return;
      }

      const markers: any[] = [];
      positions.forEach(p => {
          if (hiddenTradeIds.has(p.id)) return; // Skip hidden markers

          if (p.entryTime) {
              markers.push({
                  time: p.entryTime / 1000 as Time,
                  position: p.type === 'BUY' ? 'belowBar' : 'aboveBar',
                  color: p.type === 'BUY' ? '#2962ff' : '#e91e63',
                  shape: p.type === 'BUY' ? 'arrowUp' : 'arrowDown',
                  text: `${p.type} ${p.size}L`
              });
          }
          if (p.status === 'CLOSED' && p.exitTime) {
              markers.push({
                  time: p.exitTime / 1000 as Time,
                  position: p.type === 'BUY' ? 'aboveBar' : 'belowBar',
                  color: p.closedPnl && p.closedPnl > 0 ? '#10b981' : '#ef4444',
                  shape: p.type === 'BUY' ? 'arrowDown' : 'arrowUp',
                  text: `CLOSE (${p.closedPnl && p.closedPnl > 0 ? '+' : ''}${Math.round(p.closedPnl || 0)})`
              });
          }
      });
      markers.sort((a, b) => (a.time as number) - (b.time as number));
      try {
        mainSeriesRef.current.setMarkers(markers);
      } catch(e) {}
  }, [positions, chartSettings.showTrades, chartType, hiddenTradeIds]);

  // Infinite Scroll
  useEffect(() => {
    if(!chartRef.current) return;
    const handleVisibleRangeChange = (newVisibleRange: any) => {
        if (newVisibleRange === null) return;
        const timeScale = chartRef.current!.timeScale();
        const logicalRange = timeScale.getVisibleLogicalRange();
        if (logicalRange && logicalRange.from < 10 && !isLoadingHistoryRef.current) {
            isLoadingHistoryRef.current = true;
            onLoadMoreHistory();
            setTimeout(() => { isLoadingHistoryRef.current = false; }, 2000);
        }
    };
    
    chartRef.current.timeScale().subscribeVisibleTimeRangeChange(handleVisibleRangeChange);
    return () => chartRef.current?.timeScale().unsubscribeVisibleTimeRangeChange(handleVisibleRangeChange);
  }, [onLoadMoreHistory]);

  return (
    <div className="relative w-full h-full">
        <div ref={chartContainerRef} className="w-full h-full" />
        {data.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                <div className="bg-black/50 text-white px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest backdrop-blur-sm">
                    NO DATA AVAILABLE
                </div>
            </div>
        )}
    </div>
  );
};

export default Chart;