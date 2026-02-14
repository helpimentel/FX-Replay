
import React from 'react';
import { MousePointer2, Minus, MoveRight, BoxSelect, Percent, Type, Trash2, Slash, GripVertical, Square, Circle, Triangle, LineChart, ArrowRight } from 'lucide-react';
import { DrawingType, Theme } from '../types';

interface DrawingToolbarProps {
  activeTool: DrawingType | 'CURSOR' | 'DELETE';
  onSelectTool: (tool: DrawingType | 'CURSOR' | 'DELETE') => void;
  theme: Theme;
  onClearAll: () => void;
  isVisible: boolean;
}

const DrawingToolbar: React.FC<DrawingToolbarProps> = ({ activeTool, onSelectTool, theme, onClearAll, isVisible }) => {
  const bgClass = theme === 'dark' ? 'bg-[#1e222d] border-slate-800' : 'bg-white border-slate-200';
  const iconClass = (tool: string) => `p-2 rounded-md transition-all ${activeTool === tool ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-700/10 hover:text-blue-500'}`;

  // Layout: Fixed sidebar on the left, starting below the header
  return (
    <div className={`fixed top-16 left-4 flex flex-col ${bgClass} border rounded-lg shadow-xl z-[90] p-1.5 transition-all duration-300 gap-1
      ${isVisible ? 'opacity-100 -translate-x-0' : 'opacity-0 -translate-x-10 pointer-events-none'}`}>
      
      {/* Cursor - Top */}
      <button onClick={() => onSelectTool('CURSOR')} className={iconClass('CURSOR')} title="Cursor (Select/Move)">
        <MousePointer2 size={18} />
      </button>

      <div className="w-full h-px bg-slate-700/20 my-1" />

      {/* Line Tools */}
      <button onClick={() => onSelectTool('TRENDLINE')} className={iconClass('TRENDLINE')} title="Trend Line">
        <Slash size={18} />
      </button>
      <button onClick={() => onSelectTool('HORIZONTAL')} className={iconClass('HORIZONTAL')} title="Horizontal Line">
        <Minus size={18} />
      </button>
      <button onClick={() => onSelectTool('RAY')} className={iconClass('RAY')} title="Ray">
        <MoveRight size={18} />
      </button>
      <button onClick={() => onSelectTool('VERTICAL')} className={iconClass('VERTICAL')} title="Vertical Line">
        <GripVertical size={18} />
      </button>

      <div className="w-full h-px bg-slate-700/20 my-1" />

      {/* Shapes */}
      <button onClick={() => onSelectTool('RECTANGLE')} className={iconClass('RECTANGLE')} title="Rectangle">
        <Square size={18} />
      </button>
      <button onClick={() => onSelectTool('ELLIPSE')} className={iconClass('ELLIPSE')} title="Ellipse">
        <Circle size={18} />
      </button>
       <button onClick={() => onSelectTool('PARALLEL_CHANNEL')} className={iconClass('PARALLEL_CHANNEL')} title="Parallel Channel">
        <LineChart size={18} /> 
      </button>

      <div className="w-full h-px bg-slate-700/20 my-1" />
      
      {/* Fibonacci & Text */}
      <button onClick={() => onSelectTool('FIBONACCI')} className={iconClass('FIBONACCI')} title="Fibonacci Retracement">
        <Percent size={18} />
      </button>
      <button onClick={() => onSelectTool('TEXT')} className={iconClass('TEXT')} title="Text">
        <Type size={18} />
      </button>

      <div className="w-full h-px bg-slate-700/20 my-1" />

      {/* Utility - Bottom */}
      <button onClick={() => onSelectTool('DELETE')} className={iconClass('DELETE')} title="Eraser Mode">
        <Trash2 size={18} />
      </button>
      <button onClick={onClearAll} className="p-2 rounded-md text-rose-500 hover:bg-rose-500/10 transition-colors" title="Clear All Drawings">
        <Trash2 size={18} />
      </button>
    </div>
  );
};

export default DrawingToolbar;
