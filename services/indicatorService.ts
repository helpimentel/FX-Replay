
import { OHLC } from '../types';

export const calculateSMA = (data: OHLC[], period: number): (number | null)[] => {
  return data.map((_, i) => {
    if (i < period - 1) return null;
    const sum = data.slice(i - period + 1, i + 1).reduce((acc, curr) => acc + curr.close, 0);
    return sum / period;
  });
};

export const calculateEMA = (data: OHLC[], period: number): (number | null)[] => {
  const k = 2 / (period + 1);
  let emaValue = data[0]?.close || 0;
  return data.map((d, i) => {
    if (i === 0) return emaValue;
    emaValue = d.close * k + emaValue * (1 - k);
    return emaValue;
  });
};

export const calculateStdev = (values: (number | null)[], period: number): (number | null)[] => {
  return values.map((v, i) => {
    if (i < period - 1 || v === null) return null;
    const slice = values.slice(i - period + 1, i + 1).filter(val => val !== null) as number[];
    const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
    const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / slice.length;
    return Math.sqrt(variance);
  });
};

export const calculateRSI = (data: OHLC[], period: number): (number | null)[] => {
  const results: (number | null)[] = [];
  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 0; i < data.length; i++) {
    if (i === 0) {
      results.push(null);
      continue;
    }
    const diff = data[i].close - data[i - 1].close;
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;

    if (i <= period) {
      avgGain += gain / period;
      avgLoss += loss / period;
      if (i === period) {
        const rs = avgGain / (avgLoss || 1e-10);
        results.push(100 - (100 / (1 + rs)));
      } else {
        results.push(null);
      }
    } else {
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
      const rs = avgGain / (avgLoss || 1e-10);
      results.push(100 - (100 / (1 + rs)));
    }
  }
  return results;
};

export const findPivots = (values: (number | null)[], left: number, right: number): { highs: (number | null)[], lows: (number | null)[] } => {
  const highs: (number | null)[] = new Array(values.length).fill(null);
  const lows: (number | null)[] = new Array(values.length).fill(null);

  for (let i = left; i < values.length - right; i++) {
    const current = values[i];
    if (current === null) continue;

    let isHigh = true;
    let isLow = true;

    for (let j = i - left; j <= i + right; j++) {
      if (j === i || values[j] === null) continue;
      if (values[j]! >= current) isHigh = false;
      if (values[j]! <= current) isLow = false;
    }

    if (isHigh) highs[i] = current;
    if (isLow) lows[i] = current;
  }

  return { highs, lows };
};

export const calculateMACD = (data: OHLC[], fast: number = 12, slow: number = 26, signal: number = 9) => {
  const fastEMA = calculateEMA(data, fast);
  const slowEMA = calculateEMA(data, slow);
  
  const macdLine = fastEMA.map((f, i) => {
    const s = slowEMA[i];
    return (f !== null && s !== null) ? f - s : null;
  });

  const k = 2 / (signal + 1);
  let signalEMA = 0;
  const signalLine = macdLine.map((m, i) => {
    if (m === null) return null;
    if (signalEMA === 0) {
      signalEMA = m;
      return m;
    }
    signalEMA = m * k + signalEMA * (1 - k);
    return signalEMA;
  });

  const histogram = macdLine.map((m, i) => {
    const s = signalLine[i];
    return (m !== null && s !== null) ? m - s : null;
  });

  return { macdLine, signalLine, histogram };
};

export const calculateBB = (data: OHLC[], period: number = 20, stdDev: number = 2) => {
  const middle = calculateSMA(data, period);
  const upper: (number | null)[] = [];
  const lower: (number | null)[] = [];

  middle.forEach((m, i) => {
    if (m === null) {
      upper.push(null);
      lower.push(null);
      return;
    }
    const slice = data.slice(i - period + 1, i + 1);
    const variance = slice.reduce((acc, d) => acc + Math.pow(d.close - m, 2), 0) / period;
    const sd = Math.sqrt(variance);
    upper.push(m + sd * stdDev);
    lower.push(m - sd * stdDev);
  });

  return { middle, upper, lower };
};

export const calculateATR = (data: OHLC[], period: number = 14): (number | null)[] => {
  const tr: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i === 0) {
      tr.push(data[i].high - data[i].low);
    } else {
      tr.push(Math.max(
        data[i].high - data[i].low,
        Math.abs(data[i].high - data[i - 1].close),
        Math.abs(data[i].low - data[i - 1].close)
      ));
    }
  }

  const atr: (number | null)[] = [];
  let currentATR = 0;
  for (let i = 0; i < tr.length; i++) {
    if (i < period - 1) {
      atr.push(null);
    } else if (i === period - 1) {
      currentATR = tr.slice(0, period).reduce((a, b) => a + b, 0) / period;
      atr.push(currentATR);
    } else {
      currentATR = (currentATR * (period - 1) + tr[i]) / period;
      atr.push(currentATR);
    }
  }
  return atr;
};
