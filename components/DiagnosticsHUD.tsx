
import React, { useState, useEffect } from 'react';
import { Terminal, CheckCircle2, AlertCircle, XCircle, Download } from 'lucide-react';

interface TestLog {
  id: string;
  label: string;
  type: string;
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED';
  timestamp: number;
  details?: string;
}

const DiagnosticsHUD: React.FC = () => {
  const [logs, setLogs] = useState<TestLog[]>([]);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleTestEvent = (e: any) => {
      const { label, status, details, type } = e.detail;
      setLogs(prev => [{
        // FIX: `substr` is deprecated, using `slice` instead.
        id: Math.random().toString(36).slice(2, 11),
        label,
        type: type || 'Click',
        status,
        details,
        timestamp: Date.now()
      }, ...prev].slice(0, 50));
    };

    window.addEventListener('app-test-event', handleTestEvent);
    return () => window.removeEventListener('app-test-event', handleTestEvent);
  }, []);

  const exportReport = () => {
    const data = JSON.stringify(logs, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fx-replay-test-report-${Date.now()}.json`;
    a.click();
  };

  if (!isVisible) return (
    <button 
      onClick={() => setIsVisible(true)}
      className="fixed bottom-10 left-4 z-[200] p-2 bg-slate-800 border border-slate-700 rounded-full text-blue-500 shadow-2xl"
    >
      <Terminal size={20} />
    </button>
  );

  return (
    <div className="fixed bottom-10 left-4 z-[200] w-80 bg-[#1e222d] border border-slate-800 rounded-2xl shadow-2xl flex flex-col max-h-[400px] overflow-hidden animate-in slide-in-from-left-4">
      <div className="p-3 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
        <span className="text-[10px] font-black text-white uppercase tracking-widest flex items-center gap-2">
          <Terminal size={14} className="text-blue-500" /> Interaction Monitor
        </span>
        <div className="flex gap-2">
          <button onClick={exportReport} className="text-slate-500 hover:text-white"><Download size={14}/></button>
          <button onClick={() => setIsVisible(false)} className="text-slate-500 hover:text-white"><XCircle size={14}/></button>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
        {logs.length === 0 && (
          <div className="text-[9px] text-slate-600 text-center py-10 uppercase font-bold italic">No events recorded. Start clicking...</div>
        )}
        {logs.map(log => (
          <div key={log.id} className="p-2 bg-slate-800/50 border border-slate-700/50 rounded-lg flex items-start gap-3">
            {log.status === 'SUCCESS' ? <CheckCircle2 size={14} className="text-emerald-500 shrink-0" /> : 
             log.status === 'PARTIAL' ? <AlertCircle size={14} className="text-amber-500 shrink-0" /> : 
             <XCircle size={14} className="text-rose-500 shrink-0" />}
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-bold text-white truncate">{log.label}</div>
              <div className="text-[8px] text-slate-500 uppercase">{log.type} • {new Date(log.timestamp).toLocaleTimeString()}</div>
              {log.details && <div className="text-[8px] text-slate-400 mt-1 italic">{log.details}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DiagnosticsHUD;