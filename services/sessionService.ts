
import { MarketSession, OHLC } from '../types';

export const isTimeInSession = (timestamp: number, start: string, end: string): boolean => {
  const date = new Date(timestamp);
  const hours = date.getUTCHours();
  const minutes = date.getUTCMinutes();
  const timeVal = hours * 60 + minutes;

  const [startH, startM] = start.split(':').map(Number);
  const [endH, endM] = end.split(':').map(Number);
  
  const startVal = startH * 60 + startM;
  const endVal = endH * 60 + endM;

  if (startVal < endVal) {
    return timeVal >= startVal && timeVal < endVal;
  } else {
    // Session crosses midnight
    return timeVal >= startVal || timeVal < endVal;
  }
};

export const getSessionActiveAt = (timestamp: number, sessions: MarketSession[]): MarketSession | null => {
  for (const session of sessions) {
    if (session.enabled && isTimeInSession(timestamp, session.start, session.end)) {
      return session;
    }
  }
  return null;
};
