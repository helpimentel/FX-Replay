import React, { useState } from 'react';
import { Key, CheckCircle2, AlertCircle, Loader2, X, ShieldCheck, Globe } from 'lucide-react';
import { testApiConnection, setGlobalApiKey } from '../services/dataService';
import { Theme } from '../types';

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  theme: Theme;
}

const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ isOpen, onClose, onSuccess, theme }) => {
  const [apiKey, setApiKey] = useState('');
  const [status, setStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  if (!isOpen) return null;

  const handleValidation = async () => {
    if (!apiKey.trim()) {
        setStatus('error');
        setMessage('Please enter a valid API key.');
        return;
    }

    setStatus('testing');
    setMessage('Validating credentials...');

    // Save temporarily to test
    await setGlobalApiKey(apiKey);
    const result = await testApiConnection(apiKey);

    if (result.success) {
      setStatus('success');
      setMessage('API Key Verified Successfully!');
      setTimeout(() => {
          onSuccess();
          onClose();
      }, 1000);
    } else {
      setStatus('error');
      setMessage(result.message);
    }
  };

  const bgClasses = theme === 'dark' ? 'bg-[#1e222d] border-slate-700' : 'bg-white border-slate-200';
  const textClasses = theme === 'dark' ? 'text-white' : 'text-slate-800';
  const inputBg = theme === 'dark' ? 'bg-[#131722] border-slate-600 text-white' : 'bg-slate-50 border-slate-300 text-slate-900';

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className={`${bgClasses} border w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col`}>
        
        {/* Header */}
        <div className={`px-6 py-4 border-b ${theme === 'dark' ? 'border-slate-700 bg-slate-900/40' : 'border-slate-100 bg-slate-50'} flex items-center justify-between`}>
          <h2 className={`text-xs font-black ${textClasses} uppercase tracking-widest flex items-center gap-2`}>
            <Key size={16} className="text-blue-500" /> Data Provider Access
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-800/10 rounded-full text-slate-500 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          <div className="flex items-start gap-4 p-4 bg-blue-500/10 rounded-xl border border-blue-500/20">
            <Globe className="text-blue-500 shrink-0 mt-1" size={20} />
            <div>
              <h3 className={`text-xs font-bold ${textClasses} mb-1`}>External Data Required</h3>
              <p className="text-[10px] text-slate-500 leading-relaxed">
                To download high-fidelity historical candles (1m - 12M), you need a valid API Key from <b>Twelve Data</b>. This key is stored locally on your device.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">API Key</label>
            <div className="relative">
                <input 
                    type="password" 
                    value={apiKey}
                    onChange={(e) => { setApiKey(e.target.value); setStatus('idle'); }}
                    placeholder="Enter your API Key..."
                    className={`w-full ${inputBg} border rounded-xl pl-4 pr-4 py-3 text-xs font-mono font-bold outline-none focus:ring-1 focus:ring-blue-500/50 transition-all`}
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {/* Fix: Changed 'loading' to 'testing' to match the status type */}
                    {status === 'testing' && <Loader2 size={16} className="animate-spin text-blue-500" />}
                    {status === 'success' && <CheckCircle2 size={16} className="text-emerald-500" />}
                    {status === 'error' && <AlertCircle size={16} className="text-rose-500" />}
                </div>
            </div>
            {status === 'error' && (
                <p className="text-[10px] text-rose-500 font-bold animate-in slide-in-from-top-1">{message}</p>
            )}
            {status === 'success' && (
                <p className="text-[10px] text-emerald-500 font-bold animate-in slide-in-from-top-1">{message}</p>
            )}
          </div>

          <div className="flex gap-2">
            <button 
                onClick={handleValidation}
                disabled={status === 'testing'}
                className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-black rounded-xl uppercase tracking-widest transition-all shadow-lg shadow-blue-900/20 active:scale-[0.98] flex items-center justify-center gap-2"
            >
                {status === 'testing' ? 'Verifying...' : 'Validate & Save'} <ShieldCheck size={14} />
            </button>
            <button 
                onClick={onClose}
                className={`px-6 py-3 border ${theme === 'dark' ? 'border-slate-700 text-slate-400 hover:bg-slate-800' : 'border-slate-200 text-slate-600 hover:bg-slate-100'} text-[10px] font-black rounded-xl uppercase tracking-widest transition-all`}
            >
                Later
            </button>
          </div>
          
          <div className="text-center">
             <a href="https://twelvedata.com/pricing" target="_blank" rel="noreferrer" className="text-[9px] text-blue-500 hover:text-blue-400 underline decoration-dashed underline-offset-4">
                 Don't have a key? Get one for free here.
             </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ApiKeyModal;