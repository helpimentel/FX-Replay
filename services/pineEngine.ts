
import { OHLC, PineScript } from '../types';
import { calculateSMA, calculateRSI, findPivots } from './indicatorService';

export interface ExecutionResult {
  values: (number | null)[];
  secondaryValues?: Record<string, (number | null)[]>;
  markers?: { time: number, text: string, color: string, position: 'aboveBar' | 'belowBar' | 'absolute', shape: string }[];
  hlines?: { value: number, color: string, label: string }[];
  type: 'line' | 'histogram';
  pane: 'overlay' | 'subgraph';
}

export const parsePineScript = (code: string): Partial<PineScript> => {
  const overlayMatch = code.match(/indicator\(.*overlay\s*=\s*(true|false).*\)/i);
  const isOverlay = overlayMatch ? overlayMatch[1].toLowerCase() === 'true' : true;

  const inputs: PineScript['inputs'] = {};
  const inputRegex = /input\.?(?:int|float|bool|string|color)?\((?:title\s*=\s*)?([^,]+),\s*(?:defval\s*=\s*)?([^,)]+).*\)/g;
  let match;
  
  while ((match = inputRegex.exec(code)) !== null) {
    const rawVal = match[1].trim();
    const rawDef = match[2].trim();
    
    let label = rawVal.replace(/['"]/g, '');
    let valueStr = rawDef;
    
    if (rawVal.startsWith('"') || rawVal.startsWith("'")) {
       label = rawVal.replace(/['"]/g, '');
       valueStr = rawDef;
    } else {
       valueStr = rawVal;
       label = rawDef.replace(/['"]/g, '');
    }

    const key = label.toLowerCase().replace(/\s+/g, '_');
    let value: any = valueStr;
    let type: 'number' | 'string' | 'bool' | 'color' = 'number';

    if (valueStr === 'true' || valueStr === 'false') {
      value = valueStr === 'true';
      type = 'bool';
    } else if (!isNaN(Number(valueStr))) {
      value = Number(valueStr);
      type = 'number';
    } else if (valueStr.startsWith('color.')) {
      type = 'color';
      value = '#2962ff';
    }

    inputs[key] = { label, value, type };
  }

  return { isOverlay, inputs };
};

export const executePineScript = (script: PineScript, data: OHLC[]): ExecutionResult => {
  const code = script.code.toLowerCase();
  
  // SPECIFIC HANDLER: ENTRY CONFIRMATION V2
  if (script.name.toUpperCase().includes("ENTRY CONFIRMATION V2") || code.includes("entry confirmation v2")) {
    const rsiLen = script.inputs['rsi_period']?.value || 50;
    const lbL = script.inputs['pivot_lookback_left']?.value || 5;
    const lbR = script.inputs['pivot_lookback_right']?.value || 5;
    const plotBull = script.inputs['plot_bullish']?.value !== false;
    const plotBear = script.inputs['plot_bearish']?.value !== false;

    // RSI Logic
    const osc = calculateRSI(data, rsiLen);
    
    // Slow MA on RSI (Implicitly handled for visual richness)
    const slowMAValues: (number | null)[] = osc.map((_, i) => {
      const period = 50;
      if (i < period - 1) return null;
      const slice = osc.slice(i - period + 1, i + 1).filter(v => v !== null) as number[];
      if (slice.length < period) return null;
      return slice.reduce((a, b) => a + b, 0) / period;
    });

    const { highs, lows } = findPivots(osc, lbL, lbR);
    const markers: any[] = [];

    // Divergence Logic (Optimized for Replay)
    for (let i = lbL + 10; i < data.length - lbR; i++) {
      if (osc[i] === null) continue;
      
      const pl = lows[i];
      const ph = highs[i];
      
      if (pl !== null && plotBull) {
        let prevPlIdx = -1;
        for (let j = i - 1; j > i - 60; j--) { if (lows[j] !== null) { prevPlIdx = j; break; } }
        if (prevPlIdx !== -1) {
          if (data[i].low < data[prevPlIdx].low && osc[i]! > osc[prevPlIdx]!) {
            markers.push({ time: data[i].time / 1000, text: 'BULL DIV', color: '#10b981', shape: 'arrowUp' });
          }
        }
      }

      if (ph !== null && plotBear) {
        let prevPhIdx = -1;
        for (let j = i - 1; j > i - 60; j--) { if (highs[j] !== null) { prevPhIdx = j; break; } }
        if (prevPhIdx !== -1) {
          if (data[i].high > data[prevPhIdx].high && osc[i]! < osc[prevPhIdx]!) {
            markers.push({ time: data[i].time / 1000, text: 'BEAR DIV', color: '#ef4444', shape: 'arrowDown' });
          }
        }
      }
    }

    return {
      values: osc,
      secondaryValues: { 'Signal MA': slowMAValues },
      markers,
      hlines: [
        { value: 70, color: '#f23645', label: 'Overbought' },
        { value: 50, color: '#787b86', label: 'Mid' },
        { value: 30, color: '#089981', label: 'Oversold' }
      ],
      type: 'line',
      pane: 'subgraph'
    };
  }

  // General Fallback Logic
  if (code.includes('ta.rsi')) {
    const p = script.inputs['period']?.value || 14;
    return { values: calculateRSI(data, p), type: 'line', pane: 'subgraph' };
  }

  const period = script.inputs['length']?.value || 20;
  return { values: calculateSMA(data, period), type: 'line', pane: 'overlay' };
};
