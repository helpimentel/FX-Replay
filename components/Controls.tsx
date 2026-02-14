
import React from 'react';
import { Play, Pause, SkipBack, SkipForward, Clock, Calendar, BarChart2, Info } from 'lucide-react';
import { CHART_SPEEDS } from '../constants';
import { OHLC, Theme } from '../types';

interface ControlsProps {
  isPlaying: boolean;
  onTogglePlay: () => void;
  onStep: (dir: number) => void;
  speed: number;
  onSpeedChange: (speed: number) => void;
  currentCandle?: OHLC;
  sessionEndTime?: number;
  theme: Theme;
}

const Controls: React.FC<ControlsProps> = ({ 
  isPlaying, 
  onTogglePlay, 
  onStep, 
  speed, 
  onSpeedChange,
  currentCandle,
  sessionEndTime,
  theme
}) => {
  const formatTimeUTC = (ts: number) => {
    const d = new Date(ts);
    const year = d.getUTCFullYear();
    const month = (d.getUTCMonth() + 1).toString().padStart(2, '0');
    const day = d.getUTCDate().toString().padStart(2, '0');
    const hours = d.getUTCHours().toString().padStart(2, '0');
    const minutes = d.getUTCMinutes().toString().padStart(2, '0');
    const seconds = d.getUTCSeconds().toString().padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds} (UTC)`;
  };

  const remainingTime = sessionEndTime && currentCandle 
    ? Math.max(0, sessionEndTime - currentCandle.time)
    : 0;

  const formatRemaining = (ms: number) => {
    const hours = Math.floor(ms / 3600000);
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}d ${hours % 24}h remaining`;
    return `${hours}h ${Math.floor((ms % 3600000) / 60000)}m remaining`;
  };

  const bgClasses = theme === 'dark' ? "bg-[#131722] border-[#2a2e39]" : "bg-white border-slate-200";
  const dataBarClasses = theme === 'dark' ? "bg-[#1e222d] border-[#2a2e39]" : "bg-slate-50 border-slate-100";
  const textClasses = theme === 'dark' ? "text-[#d1d4dc]" : "text-slate-700";

  return (
    <div className={`flex flex-col border-t ${bgClasses} z-[60]`}>
      {/* Real-time Data Bar */}
      <div className={`flex items-center h-8 px-4 border-b ${dataBarClasses} gap-6 overflow-hidden whitespace-nowrap`}>
        {currentCandle ? (
          <>
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-black text-slate-500 uppercase">O:</span>
              <span className={`text-[10px] font-mono ${textClasses}`}>{currentCandle.open}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-black text-slate-500 uppercase">H:</span>
              <span className="text-[10px] font-mono text-emerald-500">{currentCandle.high}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-black text-slate-500 uppercase">L:</span>
              <span className="text-[10px] font-mono text-rose-500">{currentCandle.low}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-black text-slate-500 uppercase">C:</span>
              <span className={`text-[10px] font-mono ${textClasses}`}>{currentCandle.close}</span>
            </div>
            <div className={`h-4 w-px ${theme === 'dark' ? 'bg-slate-700' : 'bg-slate-300'} mx-2`} />
            <div className="flex items-center gap-2">
              <Calendar size={12} className="text-blue-500" />
              <span className={`text-[10px] font-mono ${textClasses}`}>{formatTimeUTC(currentCandle.time)}</span>
            </div>
          </>
        ) : (
          <span className="text-[10px] font-black text-slate-400 uppercase italic">Waiting for market data...</span>
        )}
        
        {sessionEndTime && (
          <div className="ml-auto flex items-center gap-2 text-slate-500">
            <Clock size={12} />
            <span className="text-[9px] font-black uppercase">{formatRemaining(remainingTime)}</span>
          </div>
        )}
      </div>

      {/* Playback Controls */}
      <div className="flex items-center h-14 px-6 gap-6 justify-between">
        <div className="flex items-center gap-3">
          <div className={`flex items-center ${theme === 'dark' ? 'bg-[#1e222d] border-[#2a2e39]' : 'bg-slate-100 border-slate-200'} rounded-lg p-1 border`}>
            <button 
              onClick={() => onStep(-1)}
              className="p-2 hover:bg-blue-600/10 rounded-md text-slate-400 hover:text-blue-600 transition-all active:scale-90"
              title="Step Backward"
            >
              <SkipBack size={18} />
            </button>
            <button 
              onClick={onTogglePlay}
              className="p-2 hover:bg-blue-600/10 rounded-md text-slate-400 hover:text-blue-600 transition-all active:scale-90"
              title={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
            </button>
            <button 
              onClick={() => onStep(1)}
              className="p-2 hover:bg-blue-600/10 rounded-md text-slate-400 hover:text-blue-600 transition-all active:scale-90"
              title="Step Forward"
            >
              <SkipForward size={18} />
            </button>
          </div>

          <div className={`h-8 w-px ${theme === 'dark' ? 'bg-slate-800' : 'bg-slate-200'} mx-2`} />

          <div className={`flex items-center gap-3 px-3 py-1.5 ${theme === 'dark' ? 'bg-[#1e222d] border-[#2a2e39]' : 'bg-slate-100 border-slate-200'} border rounded-lg`}>
            <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider">Speed</span>
            <div className="flex items-center gap-1">
              {CHART_SPEEDS.map(s => (
                <button
                  key={s}
                  onClick={() => onSpeedChange(s)}
                  className={`px-2 py-1 rounded text-[10px] font-black transition-colors ${speed === s ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-blue-600'}`}
                >
                  {s < 1 ? s : `${s}x`}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex flex-col items-end">
            <span className="text-[8px] font-black text-slate-500 uppercase">Engine Status</span>
            <div className="flex items-center gap-2">
               <div className={`w-1.5 h-1.5 rounded-full ${isPlaying ? 'bg-green-500 animate-pulse' : 'bg-amber-500'}`} />
               <span className={`text-[10px] font-black ${isPlaying ? 'text-green-500' : 'text-amber-500'}`}>
                {isPlaying ? 'ACTIVE STREAM' : 'PAUSED'}
              </span>
            </div>
          </div>
          <button className={`p-2 hover:bg-blue-600/10 rounded-lg text-slate-400 hover:text-blue-600 transition-colors`}>
            <Info size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default Controls;
