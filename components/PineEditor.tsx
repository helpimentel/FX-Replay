
import React, { useState, useEffect } from 'react';
import { Save, X, Code2, Terminal } from 'lucide-react';
import { PineScript } from '../types';
import { parsePineScript } from '../services/pineEngine';

interface PineEditorProps {
  onClose: () => void;
  onSave: (script: PineScript) => void;
  activeScript?: PineScript;
  initialCode?: string;
}

const DEFAULT_SCRIPT = `//@version=5
indicator("My Script", overlay=true)
length = input(20, "Period")
src = close
basis = ta.sma(src, length)
plot(basis, color=color.blue)`;

const PineEditor: React.FC<PineEditorProps> = ({ onClose, onSave, activeScript, initialCode }) => {
  const [code, setCode] = useState(activeScript?.code || initialCode || DEFAULT_SCRIPT);
  const [name, setName] = useState(activeScript?.name || "New Strategy");

  // Sync if props change (e.g. switching between different scripts)
  useEffect(() => {
    if (activeScript) {
      setCode(activeScript.code);
      setName(activeScript.name);
    } else if (initialCode) {
      setCode(initialCode);
      // Try to extract name from indicator() function
      const nameMatch = initialCode.match(/indicator\((?:"|')(.*?)(?:"|')/);
      if (nameMatch) setName(nameMatch[1]);
    }
  }, [activeScript, initialCode]);

  const handleSave = () => {
    const meta = parsePineScript(code);
    onSave({
      id: activeScript?.id || '', // App.tsx will generate if empty
      name,
      code,
      enabled: true,
      isOverlay: meta.isOverlay ?? true,
      inputs: meta.inputs || {}
    });
  };

  return (
    <div className="fixed inset-y-14 right-80 w-[500px] bg-[#131722] border-l border-slate-800 flex flex-col z-[110] shadow-2xl animate-in slide-in-from-right-4">
      <div className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Code2 size={18} className="text-emerald-400" />
          <input 
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="bg-transparent border-none text-sm font-bold focus:ring-0 outline-none w-48 text-white"
          />
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={handleSave}
            className="flex items-center gap-1.5 px-3 py-1 bg-emerald-600 hover:bg-emerald-500 rounded text-[10px] font-black transition-colors text-white"
          >
            <Save size={14} /> SAVE & ATTACH
          </button>
          <button onClick={onClose} className="p-1 hover:bg-slate-800 rounded text-slate-400"><X size={18} /></button>
        </div>
      </div>
      
      <div className="flex-1 relative font-mono text-xs">
        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="w-full h-full bg-transparent p-6 outline-none resize-none text-slate-300 leading-relaxed font-mono"
          spellCheck={false}
        />
      </div>

      <div className="h-24 border-t border-slate-800 bg-black/40 p-3 flex flex-col">
        <div className="flex items-center gap-2 text-[8px] text-slate-500 font-black uppercase mb-2">
          <Terminal size={12} /> Console
        </div>
        <div className="text-[10px] font-mono text-emerald-500/80 italic">
          {`> ${activeScript ? `Editing ${activeScript.name}` : 'New script initialized'}`}
        </div>
      </div>
    </div>
  );
};

export default PineEditor;
