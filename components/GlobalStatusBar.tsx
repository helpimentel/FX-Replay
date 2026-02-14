
import React from 'react';
import { Loader2, Download, Cloud } from 'lucide-react';

interface GlobalStatusProps {
    status: {
        active: boolean;
        symbol: string;
        timeframe: string;
        added: number;
        total: number;
        phase: string;
    } | null;
}

const GlobalStatusBar: React.FC<GlobalStatusProps> = ({ status }) => {
    if (!status || !status.active) return null;

    const percent = status.total > 0 ? Math.min(100, (status.added / status.total) * 100) : 0;

    return (
        <div className="fixed bottom-0 left-0 right-0 bg-blue-600 text-white z-[200] shadow-[0_-4px_20px_rgba(0,0,0,0.3)] animate-in slide-in-from-bottom-full duration-300">
            <div className="max-w-7xl mx-auto px-6 py-2 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 font-black text-xs uppercase tracking-widest bg-blue-700/50 px-3 py-1 rounded-lg">
                        <Loader2 size={14} className="animate-spin" />
                        <span>Syncing Data</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm font-bold">
                        <Cloud size={16} className="opacity-80"/>
                        <span>{status.symbol}</span>
                        <span className="opacity-50">/</span>
                        <span className="bg-white/20 px-1.5 rounded text-xs">{status.timeframe}</span>
                        <span className="opacity-50 mx-2">•</span>
                        <span className="font-mono opacity-90">{status.phase}</span>
                    </div>
                </div>

                <div className="flex items-center gap-6">
                    <div className="flex flex-col items-end">
                        <span className="text-[9px] uppercase opacity-70 font-black tracking-widest">Progress</span>
                        <span className="text-xs font-mono font-bold">
                            {status.added.toLocaleString()} / {status.total > 0 ? status.total.toLocaleString() : '?'} ({percent.toFixed(0)}%)
                        </span>
                    </div>
                    <Download size={18} className="opacity-50" />
                </div>
            </div>
            {/* Determinate Progress Bar */}
            <div className="absolute top-0 left-0 w-full h-1 bg-blue-800 overflow-hidden">
                <div 
                    className="h-full bg-white transition-all duration-300 ease-out" 
                    style={{ width: `${percent}%` }}
                />
            </div>
        </div>
    );
};

export default GlobalStatusBar;
