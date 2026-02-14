
import { Position, PerformanceStats } from '../types';

export const calculatePerformance = (history: Position[]): PerformanceStats => {
  const closed = history.filter(t => t.status === 'CLOSED');
  if (closed.length === 0) {
    return {
      winRate: 0, profitFactor: 0, totalTrades: 0, maxDrawdown: 0, 
      netProfit: 0, expectancy: 0, averageWin: 0, averageLoss: 0,
      consecutiveLosses: 0, maxConsecutiveLosses: 0, averageRR: 0
    };
  }

  const wins = closed.filter(t => (t.closedPnl || 0) > 0);
  const losses = closed.filter(t => (t.closedPnl || 0) <= 0);

  const totalWinAmount = wins.reduce((acc, t) => acc + (t.closedPnl || 0), 0);
  const totalLossAmount = Math.abs(losses.reduce((acc, t) => acc + (t.closedPnl || 0), 0));
  
  const netProfit = totalWinAmount - totalLossAmount;
  const winRate = (wins.length / closed.length) * 100;
  const profitFactor = totalWinAmount / (totalLossAmount || 1);
  const averageWin = wins.length > 0 ? totalWinAmount / wins.length : 0;
  const averageLoss = losses.length > 0 ? totalLossAmount / losses.length : 0;
  
  const expectancy = ( (winRate/100) * averageWin ) - ( ((100-winRate)/100) * averageLoss );

  // Calculate Average Realized R:R
  // Realized RR for a trade = PnL / Initial Risk
  // Initial Risk = |Entry - SL| * size * contractSize (Need to handle trades with no SL)
  let totalRR = 0;
  let tradesWithRR = 0;

  closed.forEach(pos => {
      if (pos.sl && pos.entryPrice !== pos.sl) {
          const riskDistance = Math.abs(pos.entryPrice - pos.sl);
          const pnlDistance = pos.type === 'BUY' ? (pos.exitPrice || 0) - pos.entryPrice : pos.entryPrice - (pos.exitPrice || 0);
          const realizedRR = pnlDistance / riskDistance;
          totalRR += realizedRR;
          tradesWithRR++;
      }
  });

  const averageRR = tradesWithRR > 0 ? totalRR / tradesWithRR : 0;

  // Max consecutive losses
  let currentLossStreak = 0;
  let maxLossStreak = 0;
  closed.forEach(t => {
    if ((t.closedPnl || 0) <= 0) {
      currentLossStreak++;
      maxLossStreak = Math.max(maxLossStreak, currentLossStreak);
    } else {
      currentLossStreak = 0;
    }
  });

  return {
    winRate,
    profitFactor,
    totalTrades: closed.length,
    maxDrawdown: 0, // Simplified for now
    netProfit,
    expectancy,
    averageWin,
    averageLoss,
    consecutiveLosses: currentLossStreak,
    maxConsecutiveLosses: maxLossStreak,
    averageRR
  };
};
