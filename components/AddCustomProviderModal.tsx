
import React, { useState } from 'react';
import { X, CheckCircle2, AlertCircle, Loader2, PlusCircle, Server, Database } from 'lucide-react';
import { Theme, AssetCategory, ProviderConfig } from '../types';
import { testCustomProvider } from '../services/mockProviderBackend'; // Backend simulation for testing
import { addCustomProvider } from '../services/dataService'; // Frontend service to save

interface AddCustomProviderModalProps {
  theme: Theme;
  onClose: () => void;
  onSave: (newProviderId: string) => void; // Updated to accept ID
}

const ALL_ASSET_CATEGORIES: { id: AssetCategory; label: string }[] = [
  { id: 'Forex', label: 'Forex' },
  { id: 'Crypto', label: 'Crypto' },
  { id: 'Stocks', label: 'Stocks' },
  { id: 'Indices', label: 'Indices' },
  { id: 'Commodities', label: 'Commodities' },
];

const AddCustomProviderModal: React.FC<AddCustomProviderModalProps> = ({ theme, onClose, onSave }) => {
  // Pre-filled defaults for Twelve Data as per requirement
  const [name, setName] = useState('Twelve Data');
  const [baseUrl, setBaseUrl] = useState('https://api.twelvedata.com');
  const [testEndpoint, setTestEndpoint] = useState('/time_series?symbol=AAPL&interval=1min&outputsize=1');
  const [apiKey, setApiKey] = useState('');
  const [selectedMarkets, setSelectedMarkets] = useState<AssetCategory[]>(['Forex', 'Crypto', 'Indices', 'Stocks']);

  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');
  const [testLatency, setTestLatency] = useState<number | null>(null);

  const resetTestStatus = () => {
    setTestStatus('idle');
    setTestMessage('');
    setTestLatency(null);
  };

  const handleInputChange = (setter: React.Dispatch<React.SetStateAction<string>>, value: string) => {
    setter(value);
    resetTestStatus();
  };

  const handleToggleMarket = (market: AssetCategory) => {
    setSelectedMarkets(prev => {
      const newSelection = prev.includes(market) ? prev.filter(m => m !== market) : [...prev, market];
      resetTestStatus(); 
      return newSelection;
    });
  };

  const handleTestApi = async () => {
    if (!name.trim()) { setTestStatus('error'); setTestMessage('Please enter a Provider Name.'); return; }
    if (!baseUrl.trim()) { setTestStatus('error'); setTestMessage('Please enter the API Base URL.'); return; }
    if (!testEndpoint.trim()) { setTestStatus('error'); setTestMessage('Please enter a Test Endpoint Path.'); return; }
    if (!apiKey.trim()) { setTestStatus('error'); setTestMessage('API Key is required to perform the connection test.'); return; }
    if (selectedMarkets.length === 0) { setTestStatus('error'); setTestMessage('Please select at least one Supported Market category.'); return; }

    setTestStatus('testing');
    setTestMessage('Sending test request (with API Key)...');
    setTestLatency(null);

    const providerDataForTest = {
      id: '', 
      name,
      baseUrl,
      testEndpoint,
      apiKey,
      supportedMarkets: selectedMarkets,
    };

    try {
        const result = await testCustomProvider(providerDataForTest);
        setTestLatency(result.latency);
        if (result.valid) {
            setTestStatus('success');
            setTestMessage(result.message);
        } else {
            setTestStatus('error');
            setTestMessage(result.message);
        }
    } catch (e: any) {
        setTestStatus('error');
        setTestMessage(`Unexpected Client Error: ${e.message}`);
    }
  };

  const handleSaveProvider = async () => {
    if (testStatus !== 'success') {
      alert('Please successfully test the API connection before saving.');
      return;
    }

    const uniqueId = `custom_${name.trim().toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Math.random().toString(36).slice(2, 6)}`;

    const newProvider: ProviderConfig = {
      id: uniqueId,
      name: name.trim(),
      free: true, 
      description: `Custom data provider via ${baseUrl}`,
      link: baseUrl,
      baseUrl,
      testEndpoint,
      apiKey,
      supportedMarkets: selectedMarkets,
      isCustom: true,
    };

    try {
      await addCustomProvider(newProvider);
      onSave(uniqueId); // Pass the new ID back
      onClose();
    } catch (error) {
      console.error("Failed to save custom provider:", error);
      alert('Failed to save custom provider. Check console for details.');
    }
  };

  const bgClasses = theme === 'dark' ? 'bg-[#1e222d] border-slate-800' : 'bg-white border-slate-200';
  const inputBg = theme === 'dark' ? 'bg-[#131722] border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-800';
  const labelTextClass = theme === 'dark' ? 'text-slate-400' : 'text-slate-600';

  return (
    <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className={`${bgClasses} border w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]`}>
        
        {/* Header */}
        <div className={`px-6 py-4 border-b ${theme === 'dark' ? 'border-slate-800 bg-slate-900/40' : 'border-slate-100 bg-slate-50'} flex items-center justify-between`}>
          <h2 className={`text-[10px] font-black ${theme === 'dark' ? 'text-white' : 'text-slate-800'} uppercase tracking-widest flex items-center gap-2`}>
            <PlusCircle size={14} className="text-blue-500" /> Add Custom Data Provider
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-800/10 rounded-full text-slate-500 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar flex-1">
          <div className="space-y-2">
            <label className={`text-[9px] font-bold uppercase ${labelTextClass}`}>Provider Name</label>
            <input type="text" value={name} onChange={e => handleInputChange(setName, e.target.value)} placeholder="e.g., Twelve Data Custom" className={`w-full ${inputBg} border rounded-lg px-3 py-2 text-xs font-mono outline-none focus:border-blue-500`} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className={`text-[9px] font-bold uppercase ${labelTextClass}`}>API Base URL</label>
              <input type="text" value={baseUrl} onChange={e => handleInputChange(setBaseUrl, e.target.value)} placeholder="e.g., https://api.twelvedata.com" className={`w-full ${inputBg} border rounded-lg px-3 py-2 text-xs font-mono outline-none focus:border-blue-500`} />
            </div>
            <div className="space-y-2">
              <label className={`text-[9px] font-bold uppercase ${labelTextClass}`}>Test Endpoint Path</label>
              <input type="text" value={testEndpoint} onChange={e => handleInputChange(setTestEndpoint, e.target.value)} placeholder="/time_series?symbol=EUR/USD&interval=1min&outputsize=1" className={`w-full ${inputBg} border rounded-lg px-3 py-2 text-xs font-mono outline-none focus:border-blue-500`} />
            </div>
          </div>

          <div className="space-y-2">
            <label className={`text-[9px] font-bold uppercase ${labelTextClass}`}>API Key (Required for test)</label>
            <input type="password" value={apiKey} onChange={e => handleInputChange(setApiKey, e.target.value)} placeholder="e.g., EB4AE8B16EAE4805BA0883520F3A9DC3" className={`w-full ${inputBg} border rounded-lg px-3 py-2 text-xs font-mono outline-none focus:border-blue-500`} />
          </div>

          <div className="space-y-2">
            <label className={`text-[9px] font-bold uppercase ${labelTextClass}`}>Supported Market Categories</label>
            <div className="flex flex-wrap gap-2">
              {ALL_ASSET_CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => handleToggleMarket(cat.id)}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${selectedMarkets.includes(cat.id) ? 'bg-blue-600 text-white' : `${theme === 'dark' ? 'bg-slate-700 text-slate-300' : 'bg-slate-200 text-slate-700'} hover:${theme === 'dark' ? 'bg-slate-600' : 'bg-slate-300'}`}`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-700">
            <button 
              onClick={handleTestApi} 
              disabled={testStatus === 'testing'}
              className={`w-full py-3 text-white text-[10px] font-black rounded-xl uppercase tracking-widest transition-all shadow-lg active:scale-[0.98] flex items-center justify-center gap-2 ${testStatus === 'testing' ? 'bg-slate-600 cursor-wait' : 'bg-blue-600 hover:bg-blue-500'}`}
            >
              {testStatus === 'testing' ? <Loader2 size={14} className="animate-spin" /> : <Server size={14} />} 
              {testStatus === 'testing' ? 'Testing API...' : 'Test API Connection'}
            </button>
            {testStatus !== 'idle' && (
              <div className={`flex items-start gap-3 p-4 mt-4 rounded-xl text-xs shadow-inner animate-in fade-in slide-in-from-top-2 ${testStatus === 'success' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-500 border border-rose-500/20'}`}>
                {testStatus === 'success' ? <CheckCircle2 size={18} className="shrink-0 mt-0.5" /> : <AlertCircle size={18} className="shrink-0 mt-0.5" />}
                <div className="flex-1">
                    <span className="font-bold block mb-1">{testStatus === 'success' ? 'Connection Successful' : 'Connection Failed'}</span>
                    <span className="opacity-90 block">{testMessage}</span>
                    {testLatency !== null && <span className="block text-slate-400 opacity-80 mt-1 text-[10px] font-mono">Latency: {testLatency}ms</span>}
                </div>
              </div>
            )}
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
            onClick={handleSaveProvider}
            disabled={testStatus !== 'success'}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-black rounded-xl uppercase tracking-widest transition-all shadow-lg shadow-emerald-900/40 active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:grayscale"
          >
            <Database size={14} /> Save Provider
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddCustomProviderModal;
