
import React, { useState } from 'react';
import { Settings2, Trash2, Plus, X, Layers, Eye, EyeOff, Code2, Sparkles, Sliders, Edit3 } from 'lucide-react';
import { IndicatorConfig, IndicatorType, PineScript } from '../types';

interface IndicatorManagerProps {
  indicators: IndicatorConfig[];
  scripts: PineScript[];
  onAdd: (indicatorData: { type: IndicatorType; pane: 'overlay' | 'subgraph' }, scriptId?: string) => void;
  onRemove: (id: string) => void;
  onUpdate: (indicator: IndicatorConfig) => void;
  onAddScript: (initialCode?: string) => void;
  onOpenEditor: (scriptId?: string) => void;
  onClose: () => void;
}

const BUILT_INS: { type: IndicatorType; name: string, pane: 'overlay' | 'subgraph' }[] = [
  { type: 'SESSIONS', name: 'Market Sessions', pane: 'overlay' },
  { type: 'SMA', name: 'Simple Moving Average', pane: 'overlay' },
  { type: 'EMA', name: 'Exponential Moving Average', pane: 'overlay' },
  { type: 'RSI', name: 'Relative Strength Index', pane: 'subgraph' },
  { type: 'BB', name: 'Bollinger Bands', pane: 'overlay' },
  { type: 'ATR', name: 'Average True Range', pane: 'subgraph' },
];

const ENTRY_V2_CODE = `//@version=5
indicator(title="ENTRY CONFIRMATION V2", overlay=false)
rsi_period = input.int(50, "RSI Period")
pivot_lookback_left = input.int(5, "Pivot Left")
pivot_lookback_right = input.int(5, "Pivot Right")
plot_bullish = input.bool(true, "Plot Bullish")
plot_bearish = input.bool(true, "Plot Bearish")
plot(ta.rsi(close, rsi_period))`;

const IndicatorManager: React.FC<IndicatorManagerProps> = ({ 
  indicators, scripts, onAdd, onRemove, onUpdate, onAddScript, onOpenEditor, onClose 
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const active = indicators.find(i => i.id === editingId);

  const handleAddV2 = () => {
    const v2 = scripts.find(s => s.name === "ENTRY CONFIRMATION V2");
    if (!v2) {
       onAddScript(ENTRY_V2_CODE);
    } else {
       onAdd({ type: 'PINE', pane: v2.isOverlay ? 'overlay' : 'subgraph' }, v2.id);
    }
  };

  const handleAddBuiltIn = (b: typeof BUILT_INS[0]) => {
      let params = {};
      if (b.type === 'SESSIONS') {
          params = { start: '00:00', end: '09:00' }; // Default for Asia
      }
      onAdd({ id: Math.random().toString(36).slice(2, 11), type: b.type, pane: b.pane, params } as any); // Ensure new ID is passed
  };

  return (
    <div className="fixed inset-y-12 right-0 w-80 bg-[#1e222d] border-l border-[#2a2e39] flex flex-col z-[100] shadow-2xl animate-in slide-in-from-right-4 duration-300">
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#2a2e39] bg-slate-900/40">
        <h2 className="text-[10px] font-black text-white uppercase tracking-[0.2em] flex items-center gap-2">
          <Layers size={14} className="text-blue-500" /> Technical Analysis
        </h2>
        <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors"><X size={18} /></button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-8 custom-scrollbar">
        <div>
          <h3 className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-4 px-2">Active</h3>
          <div className="space-y-2">
            {indicators.map(ind => (
              <div key={ind.id} className="group bg-[#131722] border border-slate-800 p-3 rounded-xl flex items-center justify-between hover:border-blue-500/30 transition-all">
                <div className="flex items-center gap-3">
                  <div className={`w-1.5 h-1.5 rounded-full ${ind.pane === 'subgraph' ? 'bg-amber-500' : 'bg-blue-500'}`} />
                  <span className={`text-[11px] font-bold ${ind.visible ? 'text-slate-300' : 'text-slate-600'}`}>
                    {ind.type === 'PINE' ? scripts.find(s => s.id === ind.scriptId)?.name || 'Custom Script' : ind.type}
                  </span>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {ind.type === 'PINE' && ind.scriptId && (
                    <button onClick={() => onOpenEditor(ind.scriptId)} className="p-1.5 hover:bg-slate-800 rounded text-emerald-500" title="Edit Script Source">
                      <Edit3 size={14} />
                    </button>
                  )}
                  <button onClick={() => onUpdate({ ...ind, visible: !ind.visible })} className="p-1.5 hover:bg-slate-800 rounded text-slate-500">
                    {ind.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                  </button>
                  <button onClick={() => setEditingId(ind.id)} className="p-1.5 hover:bg-slate-800 rounded text-blue-500"><Settings2 size={14} /></button>
                  <button onClick={() => onRemove(ind.id)} className="p-1.5 hover:bg-slate-800 rounded text-rose-500" title="Remove Indicator">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="pt-6 border-t border-slate-800">
          <h3 className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-4 px-2">Market Presets</h3>
          <div className="grid grid-cols-1 gap-2">
            <button onClick={handleAddV2} className="text-left px-4 py-3 bg-indigo-600/10 hover:bg-indigo-600/20 border border-indigo-500/30 rounded-xl text-[11px] font-bold text-indigo-400 transition-all flex items-center justify-between group">
              <span className="flex items-center gap-2"><Sparkles size={14}/> ENTRY CONFIRMATION V2</span>
              <Plus size={12} />
            </button>
            {BUILT_INS.map(b => (
              <button key={b.name} onClick={() => handleAddBuiltIn(b)} className="text-left px-4 py-2.5 bg-[#131722] hover:bg-blue-600/10 border border-slate-800 rounded-xl text-[11px] font-bold text-slate-400 hover:text-white transition-all flex items-center justify-between group">
                {b.name} <Plus size={12} className="opacity-0 group-hover:opacity-100" />
              </button>
            ))}
            <button onClick={() => onAddScript()} className="text-left px-4 py-2.5 bg-slate-800/40 hover:bg-slate-700/60 border border-dashed border-slate-700 rounded-xl text-[10px] font-black text-slate-500 uppercase tracking-widest transition-all text-center">
              + New Custom Pine Script
            </button>
          </div>
        </div>
      </div>

      {active && (
        <div className="absolute inset-0 bg-[#1e222d] z-[110] p-6 flex flex-col animate-in fade-in slide-in-from-right-4">
          <div className="flex items-center justify-between mb-8 border-b border-slate-800 pb-4">
            <h3 className="text-[10px] font-black text-white uppercase tracking-widest flex items-center gap-2">
              <Sliders size={14} className="text-blue-500" /> {active.type} Setup
            </h3>
            <button onClick={() => setEditingId(null)} className="text-slate-500 hover:text-white transition-colors"><X size={20}/></button>
          </div>
          
          <div className="space-y-6 flex-1 overflow-y-auto custom-scrollbar pr-2">
             <div className="flex flex-col gap-2">
                <label className="text-[9px] font-black text-slate-500 uppercase">Pane Position</label>
                <select 
                  value={active.pane} 
                  onChange={e => onUpdate({ ...active, pane: e.target.value as any })}
                  className="bg-[#131722] border border-slate-800 rounded p-2 text-xs text-white outline-none focus:border-blue-500"
                >
                  <option value="overlay">Overlay (On Chart)</option>
                  <option value="subgraph">Subgraph (Bottom Panel)</option>
                </select>
             </div>
             <div className="space-y-2">
                <label className="text-[9px] font-black text-slate-500 uppercase">Color Theme</label>
                <input 
                  type="color" 
                  value={active.color} 
                  onChange={e => onUpdate({ ...active, color: e.target.value })}
                  className="w-full h-8 bg-transparent border-none cursor-pointer" 
                />
              </div>

            {active.type === 'SESSIONS' && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-500 uppercase">Start Time (UTC)</label>
                  <input type="time" value={active.params.start || '00:00'} onChange={e => onUpdate({...active, params: {...active.params, start: e.target.value}})} className="w-full bg-[#131722] border border-slate-800 rounded p-2 text-xs text-white" />
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-500 uppercase">End Time (UTC)</label>
                  <input type="time" value={active.params.end || '09:00'} onChange={e => onUpdate({...active, params: {...active.params, end: e.target.value}})} className="w-full bg-[#131722] border border-slate-800 rounded p-2 text-xs text-white" />
                </div>
              </div>
            )}

             {['SMA', 'EMA', 'RSI', 'ATR', 'BB'].includes(active.type) && (
               <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-slate-500 uppercase">Period (Lookback)</label>
                    <input 
                      type="number" 
                      value={active.params.period || 14} 
                      onChange={e => onUpdate({ ...active, params: { ...active.params, period: Number(e.target.value) } })}
                      className="w-full bg-[#131722] border border-slate-800 rounded p-2 text-xs text-white focus:border-blue-500 outline-none" 
                    />
                  </div>
               </div>
             )}
             
             {active.type === 'PINE' && active.scriptId && scripts.find(s => s.id === active.scriptId)?.inputs && (
               Object.entries(scripts.find(s => s.id === active.scriptId)!.inputs).map(([key, inputVal]) => {
                 const input = inputVal as { label: string, value: any, type: 'number' | 'string' | 'bool' | 'color' };
                 return (
                 <div key={key} className="space-y-2">
                   <label className="text-[9px] font-black text-slate-500 uppercase">{input.label}</label>
                   {input.type === 'bool' ? (
                     <input type="checkbox" checked={input.value} onChange={e => {
                        const script = scripts.find(s => s.id === active.scriptId)!;
                        script.inputs[key].value = e.target.checked;
                        onUpdate({ ...active });
                     }} className="w-4 h-4 accent-blue-600" />
                   ) : (
                     <input type={input.type === 'number' ? 'number' : 'text'} value={input.value} onChange={e => {
                        const script = scripts.find(s => s.id === active.scriptId)!;
                        script.inputs[key].value = input.type === 'number' ? Number(e.target.value) : e.target.value;
                        onUpdate({ ...active });
                     }} className="w-full bg-[#131722] border border-slate-800 rounded p-2 text-xs text-white outline-none focus:border-blue-500" />
                   )}
                 </div>
                 );
               })
             )}
          </div>
          <button onClick={() => setEditingId(null)} className="w-full py-4 bg-blue-600 text-white text-[10px] font-black rounded-xl uppercase tracking-widest mt-6 shadow-lg shadow-blue-900/40 active:scale-[0.98] transition-transform">Apply Configuration</button>
        </div>
      )}
    </div>
  );
};

export default IndicatorManager;