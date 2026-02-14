import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { History, Play, Trash2, Calendar, TrendingUp, TrendingDown, ChevronDown, ChevronRight, Eye, EyeOff, Target, Clock, ArrowRight, Activity, PieChart, CornerDownRight, Layers, RefreshCw } from 'lucide-react';
import { SavedSession, Theme, Position, AssetConfig } from '../types';
import { getSessions, deleteSession } from '../services/dbService';
import { ASSET_CONFIGS } from '../constants';

interface SessionsPanelProps {
  theme: Theme;
  onLoadSession: (session: SavedSession) => void;
  currentSessionId: string | null;
  hiddenTradeIds?: Set<string>;
  onToggleVisibility?: (id: string) => void;
  onDeleteSession?: (id: string) => void;
  onHighlightPosition?: (id: string) => void; 
}

const SessionsPanel: React.FC<SessionsPanelProps> = ({ theme, onLoadSession, currentSessionId, hiddenTradeIds = new Set(), onToggleVisibility, onDeleteSession, onHighlightPosition }) => {
  const [sessions, setSessions] = useState<SavedSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    setIsLoading(true);
    try {
        const data = await getSessions();
        setSessions(data || []);
    } catch (e) {
        console.error("Failed to load sessions", e);
        setSessions([]);
    } finally {
        setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions, currentSessionId]);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this session history permanently?')) {
        if (onDeleteSession) {
            onDeleteSession(id);
        } else {
            await deleteSession(id);
        }
        fetchSessions();
    }
  };

  const toggleExpand = (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      setExpandedSessionId(prev => prev === id ? null : id);
  };

  const bgClasses = theme === 'dark' ? "bg-[#131722]" : "bg-white";
  const cardClasses = theme === 'dark' ? "bg-[#1e222d] border-slate-800" : "bg-slate-50 border-slate-200";
  const tradeCardClasses = theme === 'dark' ? "bg-[#131722] border-slate-800" : "bg-white border-slate-200";
  const textPrimary = theme === 'dark' ? "text-white" : "text-slate-900";
  const textSecondary = theme === 'dark' ? "text-slate-400" : "text-slate-500";

  return (
    <div className={`w-full h-full flex flex-col gap-4 p-4 overflow-hidden ${bgClasses}`}>
      <div className="flex-shrink-0 flex items-center justify-between pb-2 border-b border-slate-800/10">
        <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
          <History size={14} className="text-blue-500" /> Saved Sessions
        </h2>
        <div className="flex items-center gap-2">
            <span className="text-[9px] font-bold text-slate-500 bg-slate-100/10 px-2 py-0.5 rounded-full">
                {sessions.length}
            </span>
            <button onClick={fetchSessions} className={`p-1 rounded hover:bg-slate-700/20 text-slate-500 transition-colors`} title="Refresh Sessions">
                <RefreshCw size={12} />
            </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 pr-1 min-h-0">
        {isLoading ? (
            <div className="flex flex-col items-center justify-center h-40 gap-3 opacity-50">
                <RefreshCw className="animate-spin text-blue-500" size={20} />
                <span className="text-[10px] text-slate-500 font-bold uppercase">Loading sessions...</span>
            </div>
        ) : sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-slate-500 gap-2 border-2 border-dashed border-slate-800/20 rounded-xl">
                <History size={24} className="opacity-20" />
                <span className="text-xs font-bold">No saved sessions found</span>
            </div>
        ) : (
            sessions.map(session => {
                const isActive = session.id === currentSessionId;
                const isExpanded = expandedSessionId === session.id;
                const positions = session.positions || []; // Defensive check
                
                // --- METRICS CALCULATION ---
                const closedTrades = positions.filter(p => p.status === 'CLOSED');
                const winCount = closedTrades.filter(p => (p.closedPnl || 0) > 0).length;
                const winRate = closedTrades.length > 0 ? (winCount / closedTrades.length) * 100 : 0;
                const totalPnL = closedTrades.reduce((acc, p) => acc + (p.closedPnl || 0), 0);
                const isProfit = totalPnL >= 0;
                
                const totalRR = closedTrades.reduce((acc, p) => {
                     const risk = p.sl ? Math.abs(p.entryPrice - p.sl) : 0;
                     if (risk < 0.0000001) return acc;
                     const reward = p.type === 'BUY' ? (p.exitPrice || 0) - p.entryPrice : p.entryPrice - (p.exitPrice || 0);
                     return acc + (reward/risk);
                }, 0);
                // const avgRR = closedTrades.length > 0 ? totalRR / closedTrades.length : 0; // Unused but available
                const assetInfo = ASSET_CONFIGS[session.symbol] || { pipDecimal: 4 };

                // --- GROUPING LOGIC FOR PARTIALS ---
                // Safe grouping that handles potentially malformed or old data structure
                const groupedTrades = positions
                    .filter(p => p.status !== 'PENDING')
                    .reduce((groups, t) => {
                        // If it's a child (partial), try to find parent
                        if (t.parentId) {
                            if (groups[t.parentId]) {
                                groups[t.parentId].parts.push(t);
                            } else {
                                // Orphan partial? Treat as main for safety, or push to a fallback
                                groups[t.id] = { main: t, parts: [] };
                            }
                        } else {
                            // It's a parent/main trade
                            if (!groups[t.id]) {
                                groups[t.id] = { main: t, parts: [] };
                            } else {
                                // If partials arrived before parent (unlikely but possible), attach parent now
                                groups[t.id].main = t; 
                            }
                        }
                        return groups;
                    }, {} as Record<string, { main: Position, parts: Position[] }>);

                const sortedGroups = (Object.values(groupedTrades) as { main: Position, parts: Position[] }[]).sort((a, b) => a.main.entryTime - b.main.entryTime);

                return (
                    <div key={session.id} className="flex flex-col transition-all duration-300">
                        {/* 1) CARD PRINCIPAL (SESSÃO) */}
                        <div 
                            className={`group relative p-5 rounded-xl border cursor-pointer transition-all z-10 
                                ${isActive ? 'bg-blue-600/5 border-blue-500/50 shadow-blue-900/10' : `${cardClasses} hover:border-blue-400/50`}`}
                            onClick={() => !isActive && onLoadSession(session)}
                        >
                            {/* Header */}
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h3 className={`text-lg font-black tracking-tight ${textPrimary}`}>{session.symbol}</h3>
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wide ${theme==='dark'?'bg-slate-700 text-slate-300':'bg-slate-200 text-slate-600'}`}>{session.timeframe}</span>
                                        {isActive && <span className="text-[9px] font-black bg-blue-500 text-white px-2 py-0.5 rounded animate-pulse shadow-blue-500/20 shadow-lg">ACTIVE</span>}
                                    </div>
                                    <div className="flex items-center gap-1.5 mt-1.5">
                                        <Calendar size={12} className={textSecondary} />
                                        <span className={`text-[10px] font-medium ${textSecondary}`}>{session.name}</span>
                                    </div>
                                </div>
                                <div className="flex gap-1">
                                    <button 
                                        onClick={(e) => toggleExpand(e, session.id)}
                                        className={`p-1.5 rounded transition-all ${theme==='dark'?'text-slate-400 hover:bg-slate-700 hover:text-white':'text-slate-500 hover:bg-slate-200'}`}
                                    >
                                        {isExpanded ? <ChevronDown size={18}/> : <ChevronRight size={18}/>}
                                    </button>
                                    <button 
                                        onClick={(e) => handleDelete(e, session.id)} 
                                        className="p-1.5 hover:bg-rose-500/10 text-slate-400 hover:text-rose-500 rounded transition-all opacity-0 group-hover:opacity-100"
                                        title="Delete Session"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            </div>

                            {/* Metrics Grid */}
                            <div className="grid grid-cols-2 gap-y-3 gap-x-6 pt-4 border-t border-slate-500/10">
                                <div className="flex items-center justify-between">
                                    <span className={`text-[10px] font-bold uppercase tracking-wider ${textSecondary}`}>Trades</span>
                                    <span className={`text-sm font-mono font-black ${textPrimary}`}>{sortedGroups.length}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className={`text-[10px] font-bold uppercase tracking-wider ${textSecondary}`}>Win Rate</span>
                                    <span className={`text-sm font-mono font-black ${winRate >= 50 ? 'text-emerald-500' : 'text-rose-500'}`}>{winRate.toFixed(1)}%</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className={`text-[10px] font-bold uppercase tracking-wider ${textSecondary}`}>Total P&L</span>
                                    <span className={`text-sm font-mono font-black ${isProfit ? 'text-emerald-500' : 'text-rose-500'}`}>
                                        {isProfit ? '+' : ''}{totalPnL.toFixed(2)}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className={`text-[10px] font-bold uppercase tracking-wider ${textSecondary}`}>Global R:R</span>
                                    <span className={`text-sm font-mono font-black ${totalRR >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                        {totalRR > 0 ? '+' : ''}{totalRR.toFixed(2)}R
                                    </span>
                                </div>
                            </div>

                            {/* Action Hint Overlay (Load) */}
                            {!isActive && (
                                <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
                                    <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 backdrop-blur-[1px] rounded-xl px-4 py-2 flex items-center gap-2 pointer-events-auto transform translate-y-2 group-hover:translate-y-0 duration-200">
                                        <span className="text-[10px] font-black uppercase text-white tracking-widest flex items-center gap-2">
                                            <Play size={12} fill="currentColor"/> Load
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* 2) CARDS MENORES (TRADES AGRUPADAS) */}
                        {isExpanded && (
                            <div className={`mt-3 ml-2 space-y-3 pl-3 border-l-2 ${theme==='dark'?'border-slate-800':'border-slate-200'} animate-in slide-in-from-top-2 fade-in duration-300`}>
                                {sortedGroups.length === 0 ? (
                                    <div className={`text-[10px] italic p-3 ${textSecondary}`}>No executed trades in this session.</div>
                                ) : (
                                    sortedGroups.map(({ main, parts }) => {
                                        const hasPartials = parts.length > 0;
                                        const isClosed = main.status === 'CLOSED';
                                        const isOpen = main.status === 'OPEN';
                                        const isHidden = isActive && hiddenTradeIds.has(main.id);
                                        
                                        // Calculations for the group
                                        const mainProfit = (main.closedPnl || 0);
                                        const partialProfit = parts.reduce((acc, p) => acc + (p.closedPnl || 0), 0);
                                        const totalGroupPnL = mainProfit + partialProfit;
                                        const isGroupProfit = totalGroupPnL >= 0;

                                        // R:R Logic
                                        const risk = main.sl ? Math.abs(main.entryPrice - main.sl) : 0;
                                        let tradeRR = 0;
                                        if (isClosed && risk > 0.0000001) {
                                            const reward = main.type === 'BUY' ? (main.exitPrice||0) - main.entryPrice : main.entryPrice - (main.exitPrice||0);
                                            tradeRR = reward / risk;
                                        }

                                        return (
                                            <div 
                                                key={main.id}
                                                className={`group flex flex-col rounded-xl border cursor-pointer transition-all hover:scale-[1.01] 
                                                    ${tradeCardClasses} 
                                                    ${isActive ? (isHidden ? 'opacity-50 grayscale' : 'shadow-md border-l-4 border-l-blue-500') : 'opacity-70'}
                                                `}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (isActive) {
                                                        if (onHighlightPosition) onHighlightPosition(main.id);
                                                        if (hiddenTradeIds.has(main.id) && onToggleVisibility) {
                                                            onToggleVisibility(main.id);
                                                        }
                                                    }
                                                }}
                                            >
                                                {/* MAIN TRADE HEADER */}
                                                <div className="p-4">
                                                    <div className="flex justify-between items-center mb-3 border-b border-slate-500/10 pb-2">
                                                        <div className="flex items-center gap-2">
                                                            <span className={`text-[10px] font-black px-2 py-0.5 rounded shadow-sm tracking-wide ${main.type==='BUY'?'bg-emerald-500 text-white':'bg-rose-500 text-white'}`}>
                                                                {main.type}
                                                            </span>
                                                            <span className={`text-[10px] font-mono font-bold ${textSecondary}`}>#{main.id.substring(0,4)}</span>
                                                            
                                                            {/* Status Badges */}
                                                            {isOpen && <span className="text-[9px] font-black bg-amber-500/20 text-amber-500 px-1.5 rounded uppercase">Open</span>}
                                                            {hasPartials && (
                                                                <span className="flex items-center gap-1 text-[9px] font-black bg-purple-500/20 text-purple-500 px-1.5 rounded uppercase border border-purple-500/30">
                                                                    <PieChart size={10} fill="currentColor" /> Partial
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-3">
                                                            {isActive && (
                                                                <div 
                                                                    className={`transition-colors p-1.5 rounded hover:bg-slate-500/20 ${isHidden ? 'text-slate-500' : 'text-blue-500'}`}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation(); 
                                                                        if (onToggleVisibility) onToggleVisibility(main.id);
                                                                    }}
                                                                >
                                                                    {isHidden ? <EyeOff size={14}/> : <Eye size={14}/>}
                                                                </div>
                                                            )}
                                                            {(isClosed || hasPartials) && (
                                                                <span className={`text-sm font-mono font-black ${isGroupProfit ? 'text-emerald-500' : 'text-rose-500'}`}>
                                                                    {isGroupProfit ? '+' : ''}{Math.round(totalGroupPnL)}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    
                                                    {/* Details Grid: Entry, Exit, SL, TP */}
                                                    <div className="grid grid-cols-2 gap-y-1.5 gap-x-4 text-xs mb-3">
                                                        <div className="flex justify-between items-baseline">
                                                            <span className={`text-[10px] font-semibold ${textSecondary}`}>Entry:</span>
                                                            <span className={`font-mono font-bold ${textPrimary}`}>{main.entryPrice.toFixed(assetInfo.pipDecimal)}</span>
                                                        </div>
                                                        <div className="flex justify-between items-baseline">
                                                            <span className={`text-[10px] font-semibold ${textSecondary}`}>{isClosed ? 'Exit:' : 'Current:'}</span>
                                                            <span className={`font-mono font-bold ${textPrimary}`}>{main.exitPrice ? main.exitPrice.toFixed(assetInfo.pipDecimal) : '---'}</span>
                                                        </div>
                                                        <div className="flex justify-between items-baseline">
                                                            <span className={`text-[10px] font-semibold ${textSecondary}`}>Size:</span>
                                                            <span className={`font-mono font-bold ${textPrimary}`}>{main.size.toFixed(2)} Lots</span>
                                                        </div>
                                                        <div className="flex justify-between items-baseline">
                                                            <span className={`text-[10px] font-semibold ${textSecondary}`}>Status:</span>
                                                            <span className={`font-mono font-bold ${textPrimary}`}>{main.status}</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* PARTIALS SECTION (Connected via visual line) */}
                                                {hasPartials && (
                                                    <div className={`px-4 pb-4 pt-0 border-t ${theme==='dark' ? 'border-slate-800' : 'border-slate-100'}`}>
                                                        <div className="relative mt-2 space-y-2">
                                                            {/* Vertical Connector Line */}
                                                            <div className={`absolute top-0 bottom-2 left-[5px] w-px ${theme==='dark' ? 'bg-slate-700' : 'bg-slate-300'} border-l border-dashed`}></div>

                                                            {parts.map((part, idx) => {
                                                                const partProfit = (part.closedPnl || 0) >= 0;
                                                                return (
                                                                    <div key={part.id} className="relative pl-5 flex justify-between items-center text-xs group/part">
                                                                        {/* Elbow Connector */}
                                                                        <div className={`absolute left-[5px] top-1/2 w-3 h-px ${theme==='dark' ? 'bg-slate-700' : 'bg-slate-300'} border-t border-dashed`}></div>
                                                                        
                                                                        <div className="flex items-center gap-2">
                                                                            <CornerDownRight size={12} className="text-purple-500 opacity-70" />
                                                                            <span className={`text-[10px] font-bold uppercase ${textSecondary}`}>Closed Partial</span>
                                                                            <span className={`font-mono font-bold ${textPrimary}`}>{part.size.toFixed(2)} Lots</span>
                                                                            <span className={`text-[10px] text-slate-500`}>@ {part.exitPrice?.toFixed(assetInfo.pipDecimal)}</span>
                                                                        </div>
                                                                        <span className={`font-mono font-bold text-[10px] ${partProfit ? 'text-emerald-500' : 'text-rose-500'}`}>
                                                                            {partProfit ? '+' : ''}{Math.round(part.closedPnl || 0)}
                                                                        </span>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        )}
                    </div>
                );
            })
        )}
      </div>
    </div>
  );
};

export default SessionsPanel;