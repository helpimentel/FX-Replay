import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { createChart, IChartApi, ISeriesApi, ColorType, LineStyle, CrosshairMode, Time, MouseEventParams, IPriceLine } from 'lightweight-charts';
import { OHLC, Position, IndicatorConfig, VisualTool, ChartSettings, AssetConfig, Theme, ChartTheme, TriggeredEvent, Drawing, DrawingType, PineScript, Timeframe, ChartType } from '../types';
import { calculateSMA, calculateEMA, calculateRSI, calculateMACD, calculateBB, calculateATR } from '../services/indicatorService';
import { executePineScript } from '../services/pineEngine';

interface ChartProps {
  data: OHLC[];
  chartType: ChartType;
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
  hiddenTradeIds?: Set<string>; 
  isAutoPaused?: boolean;
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
  hiddenTradeIds = new Set(),
  isAutoPaused = false
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null); 
  const chartRef = useRef<IChartApi | null>(null);
  const mainSeriesRef = useRef<ISeriesApi<"Candlestick" | "Bar" | "Line"> | null>(null);
  
  // Use a ref to track chart settings within crosshair move listener
  const settingsRef = useRef({ ...chartSettings, isAutoPaused });
  useEffect(() => { settingsRef.current = { ...chartSettings, isAutoPaused }; }, [chartSettings, isAutoPaused]);

  const connectorSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const indicatorSeriesRef = useRef<Map<string, ISeriesApi<"Line" | "Histogram">>>(new Map());
  const activePositionLinesRef = useRef<Map<string, { entry?: IPriceLine, sl?: IPriceLine, tp?: IPriceLine, exit?: IPriceLine }>>(new Map());
  const visualToolLinesRef = useRef<{ entry?: IPriceLine, sl?: IPriceLine, tp?: IPriceLine }>({});
  
  const draggingState = useRef<{ 
      active: boolean; 
      type: 'POSITION' | 'VISUAL'; 
      id?: string; 
      lineType: 'entry' | 'sl' | 'tp'; 
      startPrice: number;
  } | null>(null);
  
  const isLoadingHistoryRef = useRef(false);

  const getChartData = useCallback((ohlcData: OHLC[]) => {
      if (chartType === 'Line') {
          return ohlcData.map(d => ({
              time: (d.time / 1000) as Time,
              value: d.close
          }));
      }
      return ohlcData.map(d => ({
          time: (d.time / 1000) as Time,
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
        fontSize: 11,
      },
      grid: {
        vertLines: { color: chartTheme.gridColor },
        horzLines: { color: chartTheme.gridColor },
      },
      localization: {
          priceFormatter: (price: number) => price.toFixed(asset.pipDecimal),
          timeFormatter: (time: number) => {
              const date = new Date(time * 1000);
              const day = date.toLocaleDateString('en-US', { weekday: 'short' });
              const dateStr = date.toISOString().split('T')[0];
              const timeStr = date.getUTCHours().toString().padStart(2, '0') + ':' + date.getUTCMinutes().toString().padStart(2, '0');
              return `${day}, ${dateStr} ${timeStr}`;
          }
      },
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
          visible: true,
          borderVisible: true,
          scaleMargins: { top: 0.08, bottom: 0.08 },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
    });
    
    chartRef.current = chart;

    // TOOLTIP LOGIC
    chart.subscribeCrosshairMove((param) => {
        if (!tooltipRef.current || !chartContainerRef.current) return;
        if (!settingsRef.current.showInfoCard || settingsRef.current.isAutoPaused || param.point === undefined || !param.time) {
            tooltipRef.current.style.display = 'none';
        } else {
            const data = param.seriesData.get(mainSeriesRef.current!);
            if (data) {
                tooltipRef.current.style.display = 'block';
                const date = new Date((param.time as number) * 1000);
                const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
                const price = (data as any);
                const o = price.open !== undefined ? price.open.toFixed(asset.pipDecimal) : '-';
                const h = price.high !== undefined ? price.high.toFixed(asset.pipDecimal) : '-';
                const l = price.low !== undefined ? price.low.toFixed(asset.pipDecimal) : '-';
                const c = (price.close !== undefined ? price.close : (price.value !== undefined ? price.value : 0)).toFixed(asset.pipDecimal);

                tooltipRef.current.innerHTML = `
                    <div style="font-size: 10px; font-weight: 800; color: #3b82f6; text-transform: uppercase; margin-bottom: 4px; letter-spacing: 0.05em;">${dayName}</div>
                    <div style="font-size: 11px; font-weight: 700; margin-bottom: 8px; border-bottom: 1px solid rgba(128,128,128,0.2); padding-bottom: 4px;">${date.toISOString().split('T')[0]} <span style="opacity: 0.6; margin-left: 4px;">${date.getUTCHours().toString().padStart(2, '0')}:${date.getUTCMinutes().toString().padStart(2, '0')}</span></div>
                    <div style="display: grid; grid-template-cols: 1fr 1fr; gap: 4px 12px; font-family: 'JetBrains Mono', monospace; font-size: 10px;">
                        <div style="color: #787b86">O: <span style="color: inherit">${o}</span></div>
                        <div style="color: #089981">H: <span style="color: inherit">${h}</span></div>
                        <div style="color: #f23645">L: <span style="color: inherit">${l}</span></div>
                        <div style="color: #787b86">C: <span style="color: inherit">${c}</span></div>
                    </div>
                `;
                const toolWidth = 160;
                let left = param.point.x + 20;
                if (left > chartContainerRef.current.clientWidth - toolWidth) left = param.point.x - toolWidth - 20;
                tooltipRef.current.style.left = left + 'px';
                tooltipRef.current.style.top = (param.point.y + 20) + 'px';
            } else {
                tooltipRef.current.style.display = 'none';
            }
        }
    });

    const resizeObserver = new ResizeObserver(entries => {
        if (!chartRef.current || entries.length === 0) return;
        const { width, height } = entries[0].contentRect;
        chartRef.current.applyOptions({ width, height });
    });
    resizeObserver.observe(chartContainerRef.current);
    
    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, []); 

  // 2. SERIES MANAGEMENT (EXCLUSIVE STYLES)
  useEffect(() => {
    if (!chartRef.current) return;
    
    // --- STAGE 1: COMPLETE CLEANUP ---
    if (mainSeriesRef.current) {
        chartRef.current.removeSeries(mainSeriesRef.current);
        mainSeriesRef.current = null;
        activePositionLinesRef.current.clear();
        visualToolLinesRef.current = {};
    }

    // --- STAGE 2: CREATE NEW EXCLUSIVE SERIES ---
    const seriesOptions = {
        priceFormat: { type: 'price' as const, precision: asset.pipDecimal, minMove: asset.tickSize },
    };

    let series: ISeriesApi<any>;
    if (chartType === 'Line') {
      series = chartRef.current.addLineSeries({ ...seriesOptions, color: '#2962ff', lineWidth: 2 });
    } else if (chartType === 'Bar') {
      series = chartRef.current.addBarSeries({ ...seriesOptions, upColor: chartTheme.candleUp, downColor: chartTheme.candleDown });
    } else {
      // Handles only 'Candlestick'
      series = chartRef.current.addCandlestickSeries({
        ...seriesOptions,
        upColor: chartTheme.candleUp,
        downColor: chartTheme.candleDown,
        borderUpColor: chartTheme.candleUp,
        borderDownColor: chartTheme.candleDown,
        wickUpColor: chartTheme.wickUp,
        wickDownColor: chartTheme.wickDown,
      });
    }
    
    mainSeriesRef.current = series;
    
    // --- STAGE 3: PLOT DATA ---
    const visibleData = getChartData(data.slice(0, replayIndex + 1));
    if (visibleData.length > 0) {
        series.setData(visibleData);
    }

    console.log(`[Chart Diagnostic] TF: ${timeframe} | Style: ${chartType} | Dataset Size: ${visibleData.length} | Source: IndexedDB`);

  }, [chartType, asset.pipDecimal, asset.tickSize, timeframe, data, replayIndex]); 

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

  // Interactive Lines Listeners
  useEffect(() => {
      const container = chartContainerRef.current;
      if (!container || !mainSeriesRef.current) return;
      const handleMouseDown = (e: MouseEvent) => {
          if (!chartRef.current || !mainSeriesRef.current) return;
          const rect = container.getBoundingClientRect();
          const y = e.clientY - rect.top;
          const price = mainSeriesRef.current.coordinateToPrice(y);
          if (price === null) return;
          for (const p of positions) {
              if (p.status === 'CLOSED' || hiddenTradeIds.has(p.id)) continue; 
              const checkLine = (targetPrice: number | undefined, type: 'entry' | 'sl' | 'tp') => {
                  if (targetPrice === undefined) return false;
                  const targetY = mainSeriesRef.current!.priceToCoordinate(targetPrice);
                  if (targetY !== null && Math.abs(targetY - y) < 8) {
                      if (type === 'entry' && p.status !== 'PENDING') return false;
                      draggingState.current = { active: true, type: 'POSITION', id: p.id, lineType: type, startPrice: price };
                      chartRef.current!.applyOptions({ handleScroll: false, handleScale: false });
                      return true;
                  }
                  return false;
              };
              if (checkLine(p.sl, 'sl')) return;
              if (checkLine(p.tp, 'tp')) return;
              if (checkLine(p.entryPrice, 'entry')) return;
          }
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
          if (!draggingState.current?.active) {
              let hovering = false;
              const price = mainSeriesRef.current.coordinateToPrice(y);
              if (price) {
                  positions.forEach(p => {
                      if (p.status === 'CLOSED' || hiddenTradeIds.has(p.id)) return;
                      [p.entryPrice, p.sl, p.tp].forEach(val => {
                          if (val === undefined) return;
                          const ly = mainSeriesRef.current!.priceToCoordinate(val);
                          if (ly !== null && Math.abs(ly - y) < 8) hovering = true;
                      });
                  });
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
              chartRef.current?.applyOptions({ handleScroll: { mouseWheel: true, pressedMouseMove: true }, handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true } });
          }
      };
      container.addEventListener('mousedown', handleMouseDown);
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
          container.removeEventListener('mousedown', handleMouseDown);
          window.removeEventListener('mousemove', handleMouseMove);
          window.addEventListener('mouseup', handleMouseUp);
      };
  }, [positions, visualTool, pipDecimal, hiddenTradeIds]);

  return (
    <div className="relative w-full h-full">
        <div ref={chartContainerRef} className="w-full h-full" />
        <div ref={tooltipRef} style={{ display: 'none', position: 'absolute', zIndex: 50, pointerEvents: 'none', padding: '12px', borderRadius: '8px', border: theme === 'dark' ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)', background: theme === 'dark' ? 'rgba(30, 34, 45, 0.95)' : 'rgba(255, 255, 255, 0.95)', color: theme === 'dark' ? '#d1d4dc' : '#131722', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)', width: '160px', backdropFilter: 'blur(4px)', transition: 'opacity 0.1s ease' }} />
        {data.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                <div className="bg-black/50 text-white px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest backdrop-blur-sm">NO DATA AVAILABLE</div>
            </div>
        )}
    </div>
  );
};

export default Chart;