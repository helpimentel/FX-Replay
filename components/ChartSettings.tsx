import React, { useState, useEffect, useRef } from 'react';
import { Eye, GitCommit, Link2, Pause, GripHorizontal, X, Palette, Grid3X3, CandlestickChart } from 'lucide-react';
import { ChartSettings, Theme, ChartTheme } from '../types';

interface ChartSettingsProps {
  settings: ChartSettings;
  onUpdate: (newSettings: ChartSettings) => void;
  theme: Theme;
  chartTheme?: ChartTheme; // Optional for compatibility if not passed
  onUpdateChartTheme?: (newTheme: ChartTheme) => void;
  onClose: () => void;
}

const Toggle: React.FC<{ label: string; icon: React.ReactNode; isChecked: boolean; onToggle: () => void; theme: Theme }> = 
  ({ label, icon, isChecked, onToggle, theme }) => (
  <div 
    onClick={(e) => { e.stopPropagation(); onToggle(); }} 
    className="flex items-center justify-between cursor-pointer group hover:bg-black/5 p-1 rounded transition-colors"
  >
    <div className="flex items-center gap-3">
      <div className={`transition-colors ${isChecked ? '!text-blue-500' : (theme === 'dark' ? 'text-slate-500' : 'text-slate-400 group-hover:text-blue-500')}`}>
        {icon}
      </div>
      <span className={`text-[10px] font-bold uppercase tracking-wider transition-colors ${
          isChecked ? (theme === 'dark' ? 'text-white' : 'text-slate-900') : 
          (theme === 'dark' ? 'text-slate-400 group-hover:text-white' : 'text-slate-500 group-hover:text-slate-800')
      }`}>
        {label}
      </span>
    </div>
    <div className={`w-9 h-5 rounded-full p-0.5 transition-all duration-300 ${isChecked ? 'bg-blue-600' : (theme === 'dark' ? 'bg-slate-700' : 'bg-slate-300')}`}>
      <div className={`w-4 h-4 rounded-full bg-white transform transition-transform duration-300 ${isChecked ? 'translate-x-4' : 'translate-x-0'}`} />
    </div>
  </div>
);

const ColorPicker: React.FC<{ label: string; color: string; onChange: (c: string) => void; theme: Theme }> = ({ label, color, onChange, theme }) => (
    <div className="flex items-center justify-between p-1">
        <span className={`text-[10px] font-bold uppercase tracking-wider ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>{label}</span>
        <div className="relative overflow-hidden w-6 h-6 rounded-md border border-slate-600 shadow-sm">
            <input 
                type="color" 
                value={color} 
                onChange={(e) => onChange(e.target.value)} 
                className="absolute -top-2 -left-2 w-10 h-10 p-0 border-0 cursor-pointer"
            />
        </div>
    </div>
);

const ChartSettingsPanel: React.FC<ChartSettingsProps> = ({ settings, onUpdate, theme, chartTheme, onUpdateChartTheme, onClose }) => {
  // Initialize position from localStorage or default to Top Right
  const [position, setPosition] = useState(() => {
    const saved = localStorage.getItem('fx_pro_chart_settings_pos');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Safety check to ensure it's not off-screen
        const x = Math.min(Math.max(0, parsed.x), window.innerWidth - 200);
        const y = Math.min(Math.max(0, parsed.y), window.innerHeight - 200);
        return { x, y };
      } catch (e) {
        console.warn("Failed to parse settings position", e);
      }
    }
    return { x: window.innerWidth - 260, y: 80 };
  });

  const [activeTab, setActiveTab] = useState<'general' | 'visual'>('general');
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  // Handle Window Resize to keep panel on screen
  useEffect(() => {
    const handleResize = () => {
      setPosition(prev => ({
        x: Math.min(prev.x, window.innerWidth - 240),
        y: Math.min(prev.y, window.innerHeight - 100)
      }));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Global Mouse Events for smooth dragging
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      
      const newX = e.clientX - dragStartRef.current.x;
      const newY = e.clientY - dragStartRef.current.y;

      // Simple boundary check
      const maxX = window.innerWidth - (panelRef.current?.offsetWidth || 240);
      const maxY = window.innerHeight - (panelRef.current?.offsetHeight || 40);

      const boundedPos = {
        x: Math.max(0, Math.min(newX, maxX)),
        y: Math.max(0, Math.min(newY, maxY))
      };
      
      setPosition(boundedPos);
    };

    const handleMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
        // Persist position on drop
        localStorage.setItem('fx_pro_chart_settings_pos', JSON.stringify(position));
      }
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, position]);

  const handleMouseDown = (e: React.MouseEvent) => {
    // Only allow drag from header
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y
    };
  };

  const updateThemeColor = (key: keyof ChartTheme, value: string) => {
      if (chartTheme && onUpdateChartTheme) {
          onUpdateChartTheme({ ...chartTheme, [key]: value });
      }
  };

  return (
    <div 
      ref={panelRef}
      style={{ 
        left: position.x, 
        top: position.y,
        position: 'fixed',
        zIndex: 1001 // Ensure it's above the global UI overlay (z-1000)
      }}
      className={`w-60 transition-shadow duration-200 ${theme === 'dark' ? 'bg-[#1e222d]/95 border-slate-700' : 'bg-white/95 border-slate-200'} backdrop-blur-md border rounded-xl shadow-2xl flex flex-col overflow-hidden ${isDragging ? 'cursor-grabbing select-none scale-[1.02] shadow-blue-500/20' : ''}`}
    >
      {/* Draggable Header */}
      <div 
        onMouseDown={handleMouseDown}
        className={`px-3 py-2 border-b flex items-center justify-between cursor-grab active:cursor-grabbing ${theme === 'dark' ? 'bg-slate-800/50 border-slate-700' : 'bg-slate-50 border-slate-100'}`}
      >
        <div className="flex items-center gap-2 pointer-events-none">
          <GripHorizontal size={14} className="text-slate-400" />
          <h3 className={`text-[10px] font-black uppercase tracking-widest ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
            Chart Settings
          </h3>
        </div>
        <button 
          onMouseDown={(e) => e.stopPropagation()} 
          onClick={onClose}
          className="p-1 hover:bg-rose-500/10 rounded text-slate-400 hover:text-rose-500 transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      {/* Tabs */}
      <div className={`grid grid-cols-2 p-1 gap-1 border-b ${theme==='dark'?'border-slate-800':'border-slate-200'}`}>
          <button onClick={() => setActiveTab('general')} className={`text-[9px] font-black uppercase py-1.5 rounded transition-all ${activeTab==='general' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-700/20'}`}>General</button>
          <button onClick={() => setActiveTab('visual')} className={`text-[9px] font-black uppercase py-1.5 rounded transition-all ${activeTab==='visual' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-700/20'}`}>Visuals</button>
      </div>

      {/* Content Body */}
      <div className="p-3 space-y-3 animate-in slide-in-from-top-2 duration-200 max-h-[300px] overflow-y-auto custom-scrollbar">
        {activeTab === 'general' && (
            <>
                <Toggle 
                label="Trade Markers"
                icon={<Eye size={14} />}
                isChecked={settings.showTrades}
                onToggle={() => onUpdate({ ...settings, showTrades: !settings.showTrades })}
                theme={theme}
                />
                <Toggle 
                label="Partial Exits"
                icon={<GitCommit size={14} />}
                isChecked={settings.showPartials}
                onToggle={() => onUpdate({ ...settings, showPartials: !settings.showPartials })}
                theme={theme}
                />
                <Toggle 
                label="P/L Connectors"
                icon={<Link2 size={14} />}
                isChecked={settings.showConnections}
                onToggle={() => onUpdate({ ...settings, showConnections: !settings.showConnections })}
                theme={theme}
                />
                <Toggle 
                label="Grid Lines"
                icon={<Grid3X3 size={14} />}
                isChecked={settings.showGrid}
                onToggle={() => onUpdate({ ...settings, showGrid: !settings.showGrid })}
                theme={theme}
                />
                <Toggle 
                label="Auto-Pause Event"
                icon={<Pause size={14} />}
                isChecked={settings.autoPauseOnTrigger}
                onToggle={() => onUpdate({ ...settings, autoPauseOnTrigger: !settings.autoPauseOnTrigger })}
                theme={theme}
                />
            </>
        )}

        {activeTab === 'visual' && chartTheme && (
            <div className="space-y-4">
                <div className="space-y-1">
                    <div className="flex items-center gap-2 text-[9px] font-black text-slate-500 uppercase tracking-wider mb-2">
                        <CandlestickChart size={12} /> Candles
                    </div>
                    <ColorPicker label="Body Up" color={chartTheme.candleUp} onChange={(c) => updateThemeColor('candleUp', c)} theme={theme} />
                    <ColorPicker label="Body Down" color={chartTheme.candleDown} onChange={(c) => updateThemeColor('candleDown', c)} theme={theme} />
                    <ColorPicker label="Wick Up" color={chartTheme.wickUp} onChange={(c) => updateThemeColor('wickUp', c)} theme={theme} />
                    <ColorPicker label="Wick Down" color={chartTheme.wickDown} onChange={(c) => updateThemeColor('wickDown', c)} theme={theme} />
                </div>
                
                <div className="w-full h-px bg-slate-500/20 my-2" />

                <div className="space-y-1">
                    <div className="flex items-center gap-2 text-[9px] font-black text-slate-500 uppercase tracking-wider mb-2">
                        <Grid3X3 size={12} /> Environment
                    </div>
                    <ColorPicker label="Grid Lines" color={chartTheme.gridColor} onChange={(c) => updateThemeColor('gridColor', c)} theme={theme} />
                    <ColorPicker label="Background" color={chartTheme.background} onChange={(c) => updateThemeColor('background', c)} theme={theme} />
                </div>
            </div>
        )}
      </div>
    </div>
  );
};

export default ChartSettingsPanel;