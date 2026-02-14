
import React, { useState, useMemo, useEffect } from 'react';
import { X, Check, TrendingUp, TrendingDown, Scale, PieChart, Wallet } from 'lucide-react';
import { Position, AssetConfig, Theme } from '../types';

interface PartialCloseModalProps {
  data: { position: Position; percentage: number };
  currentPrice: number;
  balance: number;
  asset: AssetConfig;
  theme: Theme;
  onConfirm: (positionId: string, sizeToClose: number, exitPrice: number) => void;
  onClose: () => void;
}

const PartialCloseModal: React.FC<PartialCloseModalProps> = ({ data, currentPrice, balance, asset, theme, onConfirm, onClose }) => {
  const { position, percentage: initialPercentage } = data;
  const [closePercentage, setClosePercentage] = useState(initialPercentage);

  useEffect(() => {
    setClosePercentage(initialPercentage);
  }, [initialPercentage, position.id]);
  
  const calculations = useMemo(() => {
    const sizeToClose = Math.max(0.01, parseFloat((position.size * (closePercentage / 100)).toFixed(2)));
    const remainingSize = position.size - sizeToClose;
    
    const pnlPerLot = (position.type === 'BUY' 
      ? (currentPrice - position.entryPrice) 
      : (position.entryPrice - currentPrice)) * asset.contractSize;
      
    const realizedPnl = sizeToClose * pnlPerLot;
    const floatingPnlAfter = remainingSize * pnlPerLot;
    const newBalance = balance + realizedPnl;
    const newEquity = newBalance + floatingPnlAfter;

    return { sizeToClose, remainingSize, realizedPnl, newBalance, newEquity };
  }, [closePercentage, position, currentPrice, balance, asset]);

  const handleConfirm = () => {
    onConfirm(position.id, calculations.sizeToClose, currentPrice);
    onClose();
  };
  
  const isProfit = calculations.realizedPnl >= 0;
  const pnlColor = isProfit ? 'text-emerald-500' : 'text-rose-500';

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className={`${theme === 'dark' ? 'bg-[#1e222d] border-slate-800' : 'bg-white border-slate-200'} border w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden`}>
        <div className={`px-6 py-4 border-b ${theme === 'dark' ? 'border-slate-800 bg-slate-900/40' : 'border-slate-100 bg-slate-50'} flex items-center justify-between`}>
          <h2 className={`text-[10px] font-black ${theme === 'dark' ? 'text-white' : 'text-slate-800'} uppercase tracking-widest flex items-center gap-2`}>
            {position.type === 'BUY' ? <TrendingUp size={14} className="text-emerald-500" /> : <TrendingDown size={14} className="text-rose-500" />}
            Confirm Partial Close
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-800/10 rounded-full text-slate-500 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-8 space-y-8">
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Amount to Close</label>
              <span className={`text-2xl font-black font-mono ${theme === 'dark' ? 'text-white' : 'text-slate-800'}`}>{closePercentage}%</span>
            </div>
            <input
              type="range"
              min="1"
              max="100"
              value={closePercentage}
              onChange={(e) => setClosePercentage(Number(e.target.value))}
              className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer range-lg accent-blue-600"
            />
          </div>
          
          <div className="grid grid-cols-2 gap-6 text-sm">
            <div className={`p-4 rounded-xl space-y-4 ${theme === 'dark' ? 'bg-[#131722]' : 'bg-slate-50'}`}>
              <h3 className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2"><Scale size={12}/> Transaction Details</h3>
              <div className="flex justify-between items-baseline">
                <span className={`${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>Closing Lots:</span>
                <span className={`font-mono font-bold ${theme === 'dark' ? 'text-white' : 'text-slate-800'}`}>{calculations.sizeToClose.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className={`${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>Exit Price:</span>
                <span className={`font-mono font-bold ${theme === 'dark' ? 'text-white' : 'text-slate-800'}`}>{currentPrice.toFixed(asset.pipDecimal + 1)}</span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className={`${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>Realized P/L:</span>
                <span className={`font-mono font-bold ${pnlColor}`}>{isProfit ? '+' : ''}${calculations.realizedPnl.toFixed(2)}</span>
              </div>
            </div>

            <div className={`p-4 rounded-xl space-y-4 ${theme === 'dark' ? 'bg-[#131722]' : 'bg-slate-50'}`}>
              <h3 className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2"><Wallet size={12}/> Account Impact</h3>
              <div className="flex justify-between items-baseline">
                <span className={`${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>Remaining Lots:</span>
                <span className={`font-mono font-bold ${theme === 'dark' ? 'text-white' : 'text-slate-800'}`}>{Math.max(0, calculations.remainingSize).toFixed(2)}</span>
              </div>
               <div className="flex justify-between items-baseline">
                <span className={`${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>New Balance:</span>
                <span className={`font-mono font-bold ${theme === 'dark' ? 'text-white' : 'text-slate-800'}`}>${calculations.newBalance.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className={`${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>New Equity:</span>
                <span className={`font-mono font-bold ${theme === 'dark' ? 'text-white' : 'text-slate-800'}`}>${calculations.newEquity.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className={`p-4 ${theme === 'dark' ? 'bg-slate-900/50 border-slate-800' : 'bg-slate-50 border-slate-100'} border-t grid grid-cols-2 gap-4`}>
          <button 
            onClick={onClose}
            className={`w-full py-3 ${theme === 'dark' ? 'bg-slate-700 hover:bg-slate-600' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'} text-white text-[10px] font-black rounded-xl uppercase tracking-widest transition-all shadow-lg active:scale-[0.98]`}
          >
            Cancel
          </button>
          <button 
            onClick={handleConfirm}
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-black rounded-xl uppercase tracking-widest transition-all shadow-lg shadow-blue-900/40 active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <Check size={14} /> Confirm & Close {calculations.sizeToClose.toFixed(2)} Lots
          </button>
        </div>
      </div>
    </div>
  );
};

export default PartialCloseModal;
