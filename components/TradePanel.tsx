import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Zap, X, ShieldAlert, DollarSign, Percent, Calculator, Edit3, Target, PieChart, Trash2, ShieldCheck, ArrowRight } from 'lucide-react';
import { Position, VisualTool, OrderType, AssetConfig, Theme } from '../types';
import { ASSET_CONFIGS } from '../constants';

interface TradePanelProps {
  currentPrice: number;
  balance: number;
  onTrade: (type: 'BUY' | 'SELL', orderType: OrderType, size: number, entry: number, sl?: number, tp?: number) => void;
  positions: Position[];
  onClosePosition: (id: string, exitPrice: number) => void;
  onPartialClose: (position: Position, percentage: number) => void;
  onDeletePosition: (id: string) => void;
  onUpdatePosition: (positionId: string, updates: Partial<Pick<Position, 'sl' | 'tp' | 'entryPrice'>>) => void;
  visualTool: VisualTool | null;
  onActivateVisualTool: (type: 'LONG' | 'SHORT', orderType: OrderType, riskValue: number, riskType: 'Fixed' | 'Percent') => void;
  onCancelVisualTool: () => void;
  onUpdateVisualTool: (tool: VisualTool) => void;
  asset: AssetConfig;
  theme: Theme;
}

const TradePanel: React.FC<TradePanelProps> = ({ 
  currentPrice, balance, onTrade, positions, onClosePosition, onPartialClose, onDeletePosition, onUpdatePosition,
  visualTool, onActivateVisualTool, onCancelVisualTool, onUpdateVisualTool, asset, theme
}) => {
  const [riskType, setRiskType] = useState<'Fixed' | 'Percent'>('Percent');
  const [riskValue, setRiskValue] = useState(1);
  const [orderType, setOrderType] = useState<OrderType>('MARKET');
  
  const [slPipsInput, setSlPipsInput] = useState('');
  const [tpPipsInput, setTpPipsInput] = useState('');

  useEffect(() => {
    if (visualTool) {
      setSlPipsInput(String(visualTool.pipsSl));
      setTpPipsInput(String(visualTool.pipsTp));
      if (visualTool.orderType !== orderType) {
          setOrderType(visualTool.orderType);
      }
    }
  }, [visualTool, orderType]);

  const activePositions = positions.filter(p => p.status === 'OPEN' || p.status === 'PENDING');
  
  const calculateLots = (entry: number, sl: number) => {
    const riskAmt = riskType === 'Percent' ? (balance * riskValue) / 100 : riskValue;
    const pf = Math.pow(10, asset.pipDecimal);
    const pips = Math.abs(entry - sl) * pf;
    const pipValueInQuote = asset.tickSize * asset.contractSize;
    const riskPerLot = pips * pipValueInQuote;
    const lots = riskAmt / (riskPerLot || 0.00000001);
    return Math.max(0.01, Number(lots.toFixed(2)));
  };

  const handleManualPipChange = (field: 'sl' | 'tp', value: string) => {
    if (field === 'sl') setSlPipsInput(value);
    if (field === 'tp') setTpPipsInput(value);
    if (!visualTool) return;
    const pips = parseFloat(value);
    if (isNaN(pips) || pips < 0) return;

    const newTool = { ...visualTool };
    const pf = Math.pow(10, asset.pipDecimal);
    const priceDistance = pips / pf;

    if (field === 'sl') {
      newTool.pipsSl = pips;
      newTool.sl = newTool.type === 'LONG' ? newTool.entry - priceDistance : newTool.entry + priceDistance;
    } else {
      newTool.pipsTp = pips;
      newTool.tp = newTool.type === 'LONG' ? newTool.entry + priceDistance : newTool.entry - priceDistance;
    }
    newTool.rr = newTool.pipsTp / (newTool.pipsSl || 0.000001);
    const currentRisk = riskType === 'Percent' ? (balance * riskValue) / 100 : riskValue;
    newTool.cashRisk = currentRisk;
    newTool.cashReward = currentRisk * newTool.rr;
    onUpdateVisualTool(newTool);
  };

  const handleOrderTypeChange = (newOrderType: OrderType) => {
    setOrderType(newOrderType);
    if (visualTool?.active) {
      let updatedEntry = visualTool.entry;
      const offsetPips = 20; 
      const priceOffset = offsetPips * (1 / Math.pow(10, asset.pipDecimal));

      if (newOrderType === 'MARKET') {
        updatedEntry = currentPrice; 
      } else if (newOrderType === 'LIMIT') {
        updatedEntry = visualTool.type === 'LONG' 
            ? currentPrice - priceOffset 
            : currentPrice + priceOffset;
      } else if (newOrderType === 'STOP') {
        updatedEntry = visualTool.type === 'LONG' 
            ? currentPrice + priceOffset 
            : currentPrice - priceOffset;
      }

      const pf = Math.pow(10, asset.pipDecimal);
      const slDist = visualTool.pipsSl / pf;
      const tpDist = visualTool.pipsTp / pf;

      const newSl = visualTool.type === 'LONG' ? updatedEntry - slDist : updatedEntry + slDist;
      const newTp = visualTool.type === 'LONG' ? updatedEntry + tpDist : updatedEntry - tpDist;

      const newTool: VisualTool = { 
          ...visualTool, 
          orderType: newOrderType, 
          entry: updatedEntry,
          sl: newSl,
          tp: newTp
      };
      
      newTool.pipsSl = Math.abs(newTool.entry - newTool.sl) * pf;
      newTool.pipsTp = Math.abs(newTool.entry - newTool.tp) * pf;
      newTool.rr = newTool.pipsTp / (newTool.pipsSl || 0.000001);
      newTool.cashReward = newTool.cashRisk * newTool.rr;
      
      onUpdateVisualTool(newTool);
    }
  };

  const handleMoveToBreakEven = (pos: Position) => {
      onUpdatePosition(pos.id, { sl: pos.entryPrice });
  };

  const precision = asset.pipDecimal + 1;
  const bgClasses = theme === 'dark' ? "bg-[#131722]" : "bg-white"; 
  const inputBgClasses = theme === 'dark' ? "bg-[#1e222d] border-slate-800" : "bg-slate-50 border-slate-200";

  return (
    <div className={`w-full h-full ${bgClasses} p-5 flex flex-col gap-6 overflow-hidden`}>
      {/* Risk Management */}
      <div className="space-y-4 flex-shrink-0">
        <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
          <ShieldAlert size={14} className="text-blue-500" /> Risk Management
        </h2>
        <div className={`flex ${theme === 'dark' ? 'bg-[#2a2e39]/50 border-slate-800' : 'bg-slate-100 border-slate-200'} rounded-xl p-1.5 border`}>
          {(['Percent', 'Fixed'] as const).map(t => {
            const isSelected = riskType === t;
            return (
              <button 
                key={t} 
                onClick={() => setRiskType(t)} 
                className={`
                  flex-1 py-4 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all
                  ${isSelected 
                    ? (theme === 'dark' 
                        ? 'border-2 border-blue-500 text-blue-400 bg-transparent shadow-[0_0_15px_rgba(59,130,246,0.1)]' 
                        : 'bg-blue-600 text-white shadow-lg border-2 border-transparent') 
                    : (theme === 'dark'
                        ? 'border-2 border-transparent text-slate-400 hover:text-slate-300 hover:bg-white/5'
                        : 'border-2 border-transparent text-slate-500 hover:text-blue-600 hover:bg-white/60')
                  }
                `}
              >
                {t === 'Percent' ? 'PERCENT' : 'CASH'}
              </button>
            );
          })}
        </div>
        <div className="relative">
          <input type="number" step="0.01" value={riskValue} onChange={(e) => setRiskValue(Number(e.target.value))} className={`w-full ${inputBgClasses} rounded-lg px-3 py-3 text-xs font-mono outline-none focus:border-blue-500 ${theme === 'dark' ? 'text-white' : 'text-slate-800'} transition-all`} />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-black text-slate-400 uppercase">{riskType === 'Percent' ? '%' : 'USD'}</div>
        </div>
      </div>

      {/* Strategy */}
      <div className={`space-y-4 pt-4 border-t ${theme === 'dark' ? 'border-slate-800/60' : 'border-slate-100'} flex-shrink-0`}>
        <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Strategy</h2>
        <div className={`grid grid-cols-3 gap-1 ${inputBgClasses} p-1 rounded-xl border`}>
          {(['MARKET', 'LIMIT', 'STOP'] as OrderType[]).map(t => <button key={t} onClick={() => handleOrderTypeChange(t)} className={`py-2 rounded-lg text-[9px] font-black transition-all ${orderType === t ? (theme === 'dark' ? 'bg-slate-700 text-white' : 'bg-white text-blue-600 shadow-sm') : 'text-slate-500 hover:text-slate-400'}`}>{t}</button>)}
        </div>

        {visualTool?.active ? (
          <div className={`${theme === 'dark' ? 'bg-slate-900/40 border-slate-800' : 'bg-slate-50 border-slate-200'} border rounded-2xl p-4 space-y-5 animate-in fade-in slide-in-from-right-4 border-t-2 border-t-blue-500 shadow-xl`}>
            <div className="flex justify-between items-center">
              <span className={`text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest ${visualTool.type === 'LONG' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>{visualTool.orderType} {visualTool.type} PREP</span>
              <button onClick={onCancelVisualTool} className="p-1 hover:bg-slate-800/10 rounded text-slate-400 transition-colors"><X size={14}/></button>
            </div>
            <div className="space-y-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[9px] font-black text-slate-400 uppercase flex justify-between"><span>Activation Price</span><span className="text-blue-500 font-mono">{visualTool.entry.toFixed(precision)}</span></label>
                <div className="relative"><Edit3 size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input type="number" value={visualTool.entry} disabled={visualTool.orderType === 'MARKET'} className={`w-full ${theme === 'dark' ? 'bg-[#131722] border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-800'} rounded-lg pl-8 pr-3 py-2 text-xs font-mono outline-none ${visualTool.orderType === 'MARKET' ? 'opacity-50 cursor-not-allowed' : 'focus:border-blue-500'}`} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                   <label className="text-[9px] font-black text-rose-500 uppercase flex justify-between"><span>Stop Loss (Pips)</span><span className="font-mono text-rose-500/70">{visualTool.sl.toFixed(precision)}</span></label>
                  <input type="text" inputMode="decimal" value={slPipsInput} onChange={e => handleManualPipChange('sl', e.target.value)} className={`w-full ${theme === 'dark' ? 'bg-[#131722] border-rose-500/20 text-white' : 'bg-white border-rose-200 text-slate-800'} rounded-lg px-3 py-2 text-xs font-mono outline-none focus:border-rose-500`} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[9px] font-black text-emerald-500 uppercase flex justify-between"><span>Take Profit (Pips)</span><span className="font-mono text-emerald-500/70">{visualTool.tp.toFixed(precision)}</span></label>
                  <input type="text" inputMode="decimal" value={tpPipsInput} onChange={e => handleManualPipChange('tp', e.target.value)} className={`w-full ${theme === 'dark' ? 'bg-[#131722] border-emerald-500/20 text-white' : 'bg-white border-emerald-200 text-slate-800'} rounded-lg px-3 py-2 text-xs font-mono outline-none focus:border-emerald-500`} />
                </div>
              </div>
              
              <div className={`grid grid-cols-2 gap-3 ${theme === 'dark' ? 'bg-black/40 border-slate-800' : 'bg-white border-slate-200'} p-3 rounded-xl border`}>
                <div className={`p-1 flex flex-col items-center border-r ${theme === 'dark' ? 'border-slate-800' : 'border-slate-200'}`}>
                  <span className="text-[9px] font-black text-slate-400 uppercase mb-1 tracking-widest">Lot Size</span>
                  <span className="text-xl font-black text-blue-500 font-mono tracking-tight">{calculateLots(visualTool.entry, visualTool.sl)}</span>
                </div>
                <div className="p-1 flex flex-col items-center">
                  <span className="text-[9px] font-black text-slate-400 uppercase mb-1 tracking-widest">R:R Ratio</span>
                  <span className={`text-xl font-black ${theme === 'dark' ? 'text-white' : 'text-slate-800'} font-mono tracking-tight`}>1 : {visualTool.rr.toFixed(2)}</span>
                </div>
              </div>

            </div>
            <button onClick={() => onTrade(visualTool.type === 'LONG' ? 'BUY' : 'SELL', visualTool.orderType, calculateLots(visualTool.entry, visualTool.sl), visualTool.entry, visualTool.sl, visualTool.tp)} className={`w-full py-4 text-white text-[10px] font-black rounded-xl shadow-2xl flex items-center justify-center gap-2 active:scale-95 transition-all uppercase tracking-[0.2em] ${visualTool.type === 'LONG' ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/30' : 'bg-rose-600 hover:bg-rose-500 shadow-rose-900/30'}`}><Zap size={14} fill="currentColor" /> Execute {visualTool.type}</button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <button onClick={() => onActivateVisualTool('LONG', orderType, riskValue, riskType)} className={`group flex flex-col items-center py-6 ${theme === 'dark' ? 'bg-emerald-500/5 hover:bg-emerald-500/10' : 'bg-white hover:bg-emerald-50 shadow-sm'} rounded-2xl text-[10px] font-black border border-emerald-500/20 transition-all active:scale-95 text-emerald-500 hover:border-emerald-500/40`}><TrendingUp size={24} className="mb-2 group-hover:scale-110 transition-transform" /> BUY SETUP</button>
            <button onClick={() => onActivateVisualTool('SHORT', orderType, riskValue, riskType)} className={`group flex flex-col items-center py-6 ${theme === 'dark' ? 'bg-rose-500/5 hover:bg-rose-500/10' : 'bg-white hover:bg-rose-50 shadow-sm'} rounded-2xl text-[10px] font-black border border-rose-500/20 transition-all active:scale-95 text-rose-500 hover:border-rose-500/40`}><TrendingDown size={24} className="mb-2 group-hover:scale-110 transition-transform" /> SELL SETUP</button>
          </div>
        )}
      </div>

      {/* Portfolio Exposure */}
      <div className={`flex-1 min-h-0 flex flex-col pt-4 border-t ${theme === 'dark' ? 'border-slate-800/60' : 'border-slate-100'}`}>
        <h2 className="flex-shrink-0 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-4">Portfolio Exposure</h2>
        
        <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-2 pb-2">
          {activePositions.length === 0 ? (
            <div className={`h-full min-h-[120px] flex flex-col items-center justify-center border-2 border-dashed ${theme === 'dark' ? 'border-slate-800 bg-slate-900/10' : 'bg-slate-100 bg-slate-50'} rounded-2xl opacity-40 grayscale`}>
              <Target size={32} className="mb-2 text-slate-400" />
              <span className="text-[9px] uppercase tracking-[0.4em] font-black text-slate-400">No Positions</span>
            </div>
          ) : (
            activePositions.map(pos => {
              const isPending = pos.status === 'PENDING';
              const pnl = isPending ? 0 : (pos.type === 'BUY' ? (currentPrice - pos.entryPrice) : (pos.entryPrice - currentPrice)) * pos.size * asset.contractSize;
              const pnlPercent = (pnl / balance) * 100;
              const isProfit = pnl >= 0;
              const pColor = isPending ? (theme === 'dark' ? 'text-amber-500' : 'text-amber-600') : isProfit ? 'text-emerald-500' : 'text-rose-500';
              const bgColor = isPending ? (theme === 'dark' ? 'bg-amber-500/5 border-amber-500/20' : 'bg-amber-50 border-amber-100') : isProfit ? (theme === 'dark' ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-emerald-50 border-emerald-100') : (theme === 'dark' ? 'bg-rose-500/5 border-rose-500/20' : 'bg-rose-50 border-rose-100');
              
              // Check if SL is at Break Even (tolerance for floating point)
              const isAtBE = pos.sl !== undefined && Math.abs(pos.sl - pos.entryPrice) < asset.tickSize;
              
              // Planned Risk/Reward Calc
              const risk = pos.sl ? Math.abs(pos.entryPrice - pos.sl) : 0;
              const reward = pos.tp ? Math.abs(pos.tp - pos.entryPrice) : 0;
              const plannedRR = (risk > 0 && reward > 0) ? (reward / risk).toFixed(2) : '-';

              return (
                <div key={pos.id} className={`border p-5 rounded-2xl shadow-md relative transition-all animate-in slide-in-from-right-2 mb-3 ${bgColor}`}>
                  
                  {/* CARD HEADER: Direction | Size | Actions */}
                  <div className={`flex justify-between items-center mb-4 border-b pb-3 ${theme === 'dark' ? 'border-black/10' : 'border-slate-200'}`}>
                    <div className="flex items-center gap-3">
                        <span className={`text-xs font-black px-2.5 py-1 rounded-md shadow-sm tracking-wide ${pos.type === 'BUY' ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'}`}>
                            {isPending ? pos.orderType : pos.type}
                        </span>
                        <span className={`text-sm font-black ${theme === 'dark' ? 'text-white' : 'text-slate-800'}`}>
                            {pos.size.toFixed(2)} Lots
                        </span>
                    </div>
                    
                    {/* Action Toolbar */}
                    {!isPending && (
                        <div className="flex items-center gap-1.5">
                            {!isAtBE && pos.sl !== undefined && (
                                <button 
                                    onClick={() => handleMoveToBreakEven(pos)} 
                                    className="text-[9px] font-black bg-blue-600 hover:bg-blue-500 px-2 py-1.5 rounded-lg text-white shadow transition-all active:scale-95 flex items-center gap-1"
                                    title="Move SL to BE"
                                >
                                    <ShieldCheck size={10} /> BE
                                </button>
                            )}
                            <div className={`flex ${theme === 'dark' ? 'bg-slate-700/50' : 'bg-slate-200'} rounded-lg p-0.5 gap-0.5`}>
                                {[25, 50].map(p => (
                                    <button key={p} onClick={() => onPartialClose(pos, p)} className={`w-7 h-5 text-[9px] font-black ${theme==='dark'?'text-slate-300 hover:bg-slate-600 hover:text-white':'text-slate-600 hover:bg-white'} rounded transition-colors`}>{p}</button>
                                ))}
                            </div>
                            <button onClick={() => onClosePosition(pos.id, currentPrice)} className="text-[9px] font-black bg-slate-800 hover:bg-rose-600 text-white px-3 py-1.5 rounded-lg shadow transition-all active:scale-95 ml-1">
                                CLOSE
                            </button>
                        </div>
                    )}
                    {isPending && (
                        <button onClick={() => onDeletePosition(pos.id)} className="p-1.5 hover:bg-rose-500/10 text-slate-400 hover:text-rose-500 rounded transition-colors"><X size={16}/></button>
                    )}
                  </div>

                  {/* MAIN METRICS GRID */}
                  <div className="grid grid-cols-2 gap-x-6 gap-y-4 mb-3">
                    <div>
                        <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Entry Price</div>
                        <div className={`text-xl font-mono font-bold tracking-tight ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                            {pos.entryPrice.toFixed(precision)}
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Profit / Loss</div>
                        <div className={`text-xl font-mono font-black tracking-tight ${pColor}`}>
                           {isPending ? '---' : (
                               <div className="flex flex-col items-end leading-none">
                                   <span>{isProfit ? '+' : ''}${pnl.toFixed(2)}</span>
                                   <span className={`text-xs font-bold mt-1 opacity-80`}>{isProfit ? '+' : ''}{pnlPercent.toFixed(2)}%</span>
                               </div>
                           )}
                        </div>
                    </div>
                  </div>

                  {/* SECONDARY METRICS (SL/TP/RR) */}
                  <div className={`grid grid-cols-3 gap-2 pt-3 border-t ${theme === 'dark' ? 'border-black/10' : 'border-slate-200'}`}>
                      <div>
                          <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Stop Loss</div>
                          <div className={`text-sm font-mono font-bold ${pos.sl ? 'text-rose-500' : 'text-slate-400'}`}>
                              {pos.sl ? pos.sl.toFixed(precision) : '-'}
                          </div>
                      </div>
                      <div className="text-center">
                           <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Planned R:R</div>
                           <div className={`text-sm font-mono font-bold ${theme==='dark'?'text-slate-300':'text-slate-600'}`}>
                               {plannedRR}
                           </div>
                      </div>
                      <div className="text-right">
                          <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Take Profit</div>
                          <div className={`text-sm font-mono font-bold ${pos.tp ? 'text-emerald-500' : 'text-slate-400'}`}>
                              {pos.tp ? pos.tp.toFixed(precision) : '-'}
                          </div>
                      </div>
                  </div>

                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default React.memo(TradePanel);