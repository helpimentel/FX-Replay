import React, { useState, useEffect, useMemo } from 'react';
import { X, Settings, Wallet, Globe, Palette, Info, CheckCircle2, AlertCircle, Loader2, Key, ChevronDown, Database, HardDrive, RefreshCcw, Check, Download, List, PlusCircle, Trash2 } from 'lucide-react';
import { Theme, DataProvider, DBStatus, ProviderConfig, AssetCategory } from '../types';
import { getGlobalApiKey, setGlobalApiKey, testApiConnection, getGlobalProvider, setGlobalProvider, getGlobalProviderConfig, getAllCustomProviders, removeCustomProvider, initializeDataService as reinitDataService, fetchRemoteAssets } from '../services/dataService'; 
import { checkDatabaseStatus, installDatabase, exportFullDatabase } from '../services/dbService';
import { DATA_PROVIDERS as PREDEFINED_PROVIDERS } from '../constants'; 
import { getAvailableProviders } from '../services/mockProviderBackend'; 
import AddCustomProviderModal from './AddCustomProviderModal'; 

interface SettingsModalProps {
  balance: number;
  onUpdateBalance: (val: number) => void;
  theme: Theme;
  onUpdateTheme: (t: Theme) => void;
  onClose: () => void;
  onProvidersUpdated: () => void; 
}

const SettingsModal: React.FC<SettingsModalProps> = ({ balance, onUpdateBalance, theme, onUpdateTheme, onClose, onProvidersUpdated }) => {
  const [localBalance, setLocalBalance] = useState(balance);
  const [localTheme, setLocalTheme] = useState(theme);
  
  const [apiKey, setApiKey] = useState(''); 
  const [selectedProviderId, setSelectedProviderId] = useState<DataProvider>('TwelveData'); 
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [connectionMessage, setConnectionMessage] = useState('');

  // DB State
  const [dbStatus, setDbStatus] = useState<DBStatus>({ isInstalled: false, candleCount: 0, dbVersion: 0 });
  const [installStatus, setInstallStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [exportStatus, setExportStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  // State to store all available (whitelisted & custom) providers for the select dropdown
  const [availableProvidersForSelect, setAvailableProvidersForSelect] = useState<ProviderConfig[]>([]);
  const [isAddCustomProviderModalOpen, setIsAddCustomProviderModalOpen] = useState(false); 

  useEffect(() => {
    const initSettings = async () => {
      await refreshDbStatus();
      await loadProviderConfigAndKey();
    };
    initSettings();
  }, []); 

  useEffect(() => {
  }, [apiKey, selectedProviderId]); 

  const loadProviderConfigAndKey = async (forcedProviderId?: string) => {
    const storedApiKey = getGlobalApiKey();
    const storedProviderId = forcedProviderId || getGlobalProvider();
    
    const allAvailable = await getAvailableProviders(storedApiKey);
    setAvailableProvidersForSelect(allAvailable);

    const currentActiveConfig = allAvailable.find(p => p.id === storedProviderId) || PREDEFINED_PROVIDERS.find(p => p.id === storedProviderId) || null;
    
    if (currentActiveConfig) {
        setSelectedProviderId(currentActiveConfig.id);
        if (currentActiveConfig.isCustom && currentActiveConfig.apiKey) {
            setApiKey(currentActiveConfig.apiKey);
        } else {
            setApiKey(storedApiKey);
        }
        
        if (currentActiveConfig.id === 'TwelveData') {
            handleTestAndConnect(currentActiveConfig.id, storedApiKey);
        } else if (currentActiveConfig.isCustom) {
            if (currentActiveConfig.apiKey && currentActiveConfig.apiKey.trim() !== '') {
                setConnectionStatus('success');
                setConnectionMessage(`API Key present for ${currentActiveConfig.name}.`);
            } else {
                setConnectionStatus('idle'); 
                setConnectionMessage('');
            }
        } else {
            setConnectionStatus('idle');
            setConnectionMessage('');
        }
    } else if (allAvailable.length > 0) {
        setSelectedProviderId(allAvailable[0].id);
        setApiKey(''); 
    } else {
        setSelectedProviderId('TwelveData'); 
        setApiKey(storedApiKey);
    }
    
    onProvidersUpdated(); 
  };

  const refreshDbStatus = async () => {
      const status = await checkDatabaseStatus();
      setDbStatus(status);
  };

  const handleInstallDB = async () => {
      if (!confirm("This will RESET the local database and delete all downloaded history. Continue?")) return;
      
      setInstallStatus('loading');
      try {
          await installDatabase();
          await new Promise(resolve => setTimeout(resolve, 800)); 
          await refreshDbStatus();
          setInstallStatus('success');
          setTimeout(() => setInstallStatus('idle'), 3000);
      } catch (error) {
          console.error("Installation failed:", error);
          setInstallStatus('error');
          setTimeout(() => setInstallStatus('idle'), 4000);
      }
  };
  
  const handleExportDB = async () => {
      if (!dbStatus.isInstalled || dbStatus.candleCount === 0) {
          alert("Database is empty or not installed.");
          return;
      }
      setExportStatus('loading');
      try {
          const blob = await exportFullDatabase();
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `FXReplay_FULL_BACKUP_${new Date().toISOString().slice(0,10)}.json`;
          a.click();
          URL.revokeObjectURL(url);
          setExportStatus('success');
          setTimeout(() => setExportStatus('idle'), 3000);
      } catch (e) {
          console.error("Export failed", e);
          setExportStatus('error');
          setTimeout(() => setExportStatus('idle'), 4000);
      }
  };

  const handleTestAndConnect = async (providerIdToTest: DataProvider, keyToTest: string) => {
      if (providerIdToTest !== 'TwelveData') {
          const provider = availableProvidersForSelect.find(p => p.id === providerIdToTest);
          if (provider?.isCustom) {
               setConnectionStatus('success');
               setConnectionMessage('Custom Provider Ready');
               return;
          }
          setConnectionStatus('idle');
          setConnectionMessage('');
          return;
      }
      if (!keyToTest) {
        setConnectionStatus('error');
        setConnectionMessage('API Key is empty.');
        return;
      }

      setConnectionStatus('testing');
      setConnectionMessage('');
      
      const result = await testApiConnection(keyToTest); 
      if (result.success) {
          setConnectionStatus('success');
          setConnectionMessage(result.message);
      } else {
          setConnectionStatus('error');
          setConnectionMessage(result.message);
      }
  };

  const handleSelectProvider = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newProviderId = event.target.value as DataProvider;
    setSelectedProviderId(newProviderId);
    
    // Explicitly update global provider setting so fetchRemoteAssets knows which provider to use
    setGlobalProvider(newProviderId).then(() => {
        // TRIGGER API CALL: Update asset list from the new provider
        fetchRemoteAssets().then(() => {
            onProvidersUpdated(); // Notify parent
        });
    });

    const config = availableProvidersForSelect.find(p => p.id === newProviderId);
    if(config?.isCustom && config.apiKey) {
        setApiKey(config.apiKey);
        setConnectionStatus('success');
        setConnectionMessage('Stored Key Loaded');
    } else if (newProviderId === 'TwelveData') {
        const globalKey = getGlobalApiKey();
        setApiKey(globalKey);
        setConnectionStatus('idle');
    } else {
        setApiKey('');
        setConnectionStatus('idle');
    }
  };

  const handleSync = async () => {
    const finalBalance = isNaN(localBalance) ? 100000 : localBalance;
    onUpdateBalance(finalBalance);
    onUpdateTheme(localTheme);
    
    await setGlobalProvider(selectedProviderId); 
    
    const currentActiveConfig = getGlobalProviderConfig();
    if (currentActiveConfig?.isCustom) {
        await setGlobalApiKey(apiKey);
    } else if (currentActiveConfig?.id === 'TwelveData' || currentActiveConfig?.id === 'AlphaVantage') {
        await setGlobalApiKey(apiKey);
    } else {
        await setGlobalApiKey('');
    }

    onProvidersUpdated(); 
    onClose();
  };

  const handleDeleteCustomProvider = async (providerId: DataProvider) => {
      if (confirm(`Are you sure you want to delete custom provider "${providerId}"? This cannot be undone.`)) {
          await removeCustomProvider(providerId);
          await loadProviderConfigAndKey(); 
      }
  };

  const handleCustomProviderSaved = (newId: string) => {
      setIsAddCustomProviderModalOpen(false);
      loadProviderConfigAndKey(newId);
  };


  const sectionBg = theme === 'dark' ? 'bg-[#131722] border-slate-800' : 'bg-slate-50 border-slate-200';
  const inputBg = theme === 'dark' ? 'bg-[#1e222d] border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-800';

  const isSelectedProviderCustom = availableProvidersForSelect.find(p => p.id === selectedProviderId)?.isCustom || false;
  const isSelectedProviderTwelveData = selectedProviderId === 'TwelveData';

  return (
    <>
      <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
        <div className={`${theme === 'dark' ? 'bg-[#1e222d] border-slate-800' : 'bg-white border-slate-200'} border w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]`}>
          
          {/* Header */}
          <div className={`px-6 py-4 border-b ${theme === 'dark' ? 'border-slate-800 bg-slate-900/40' : 'border-slate-100 bg-slate-50'} flex items-center justify-between`}>
            <h2 className={`text-[10px] font-black ${theme === 'dark' ? 'text-white' : 'text-slate-800'} uppercase tracking-widest flex items-center gap-2`}>
              <Settings size={14} className="text-blue-500" /> System Configuration
            </h2>
            <button onClick={onClose} className="p-1 hover:bg-slate-800/10 rounded-full text-slate-500 transition-colors">
              <X size={18} />
            </button>
          </div>

          <div className="p-6 space-y-8 overflow-y-auto custom-scrollbar flex-1">
            
            {/* LOCAL DATABASE ENGINE */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                      <HardDrive size={14} className="text-blue-500"/> Local Database Engine
                  </label>
                  <div className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${dbStatus.isInstalled ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'}`}>
                      {dbStatus.isInstalled ? 'Installed & Ready' : 'Installation Required'}
                  </div>
              </div>
              
              <div className={`p-4 rounded-xl border space-y-4 ${sectionBg}`}>
                  <div className="flex items-center justify-between">
                      <div className="flex flex-col">
                          <span className={`text-xs font-bold ${theme==='dark'?'text-white':'text-slate-800'}`}>SQL-Like IndexedDB Storage</span>
                          <span className="text-[10px] text-slate-500">Records Indexed: {dbStatus.candleCount.toLocaleString()}</span>
                      </div>
                      
                      <button 
                          onClick={handleInstallDB}
                          disabled={installStatus === 'loading' || installStatus === 'success'}
                          className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase flex items-center gap-2 transition-all shadow-lg min-w-[140px] justify-center ${
                            installStatus === 'loading' 
                              ? (theme === 'dark' ? 'bg-slate-700 text-slate-300' : 'bg-slate-200 text-slate-500')
                              : installStatus === 'success' 
                              ? 'bg-emerald-600 text-white' 
                              : installStatus === 'error' 
                              ? 'bg-rose-600 text-white' 
                              : 'bg-blue-600 hover:bg-blue-500 text-white'
                          }`}
                      >
                          {installStatus === 'loading' ? (
                            <> <Loader2 size={14} className="animate-spin"/> Installing... </>
                          ) : installStatus === 'success' ? (
                            <> <Check size={14} /> Success! </>
                          ) : installStatus === 'error' ? (
                            <> <AlertCircle size={14} /> Failed </>
                          ) : (
                            <> <RefreshCcw size={14}/> {dbStatus.isInstalled ? 'Re-Install / Wipe' : 'Install Database'} </>
                          )}
                      </button>
                  </div>
                  
                  <div className="flex items-center justify-between pt-2 border-t border-slate-700/50">
                      <div className="flex flex-col">
                          <span className={`text-[10px] font-bold ${theme==='dark'?'text-slate-300':'text-slate-600'}`}>Data Backup</span>
                          <span className="text-[9px] text-slate-500">Export full database to JSON file</span>
                      </div>
                      <button 
                          onClick={handleExportDB}
                          disabled={exportStatus === 'loading' || !dbStatus.isInstalled}
                          className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase flex items-center gap-2 transition-all min-w-[140px] justify-center border ${
                              exportStatus === 'loading' 
                                  ? (theme === 'dark' ? 'bg-slate-800 text-slate-400 border-slate-700' : 'bg-slate-100 text-slate-400 border-slate-200')
                                  : exportStatus === 'success' 
                                  ? 'bg-emerald-600/20 text-emerald-500 border-emerald-500/50'
                                  : (theme === 'dark' ? 'border-slate-600 text-slate-300 hover:bg-slate-700' : 'border-slate-300 text-slate-600 hover:bg-slate-50 hover:text-slate-900 bg-white shadow-sm')
                          }`}
                      >
                          {exportStatus === 'loading' ? <Loader2 size={14} className="animate-spin"/> : <Download size={14}/>}
                          {exportStatus === 'success' ? 'Exported!' : 'Export Full DB'}
                      </button>
                  </div>

                  {!dbStatus.isInstalled && (
                      <div className="flex gap-2 items-center text-[10px] text-amber-500 bg-amber-500/10 p-2 rounded-lg">
                          <AlertCircle size={12}/>
                          <span>Application requires database installation to function offline.</span>
                      </div>
                  )}
              </div>
            </div>

            <hr className={`border-t ${theme === 'dark' ? 'border-slate-800' : 'border-slate-200'}`} />

            {/* Data Feed */}
            <div className="space-y-4">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                  <Globe size={14} /> Data Feed
              </label>
              <div className={`p-4 rounded-xl border space-y-4 ${sectionBg}`}>
                  <div className="space-y-1">
                      <label className="text-[9px] font-bold text-slate-500 uppercase flex items-center justify-between">
                        <span>Provider</span>
                        <button 
                            onClick={() => setIsAddCustomProviderModalOpen(true)}
                            className="flex items-center gap-1 text-[9px] font-bold text-blue-500 hover:text-blue-400 transition-colors"
                            title="Add a new custom data provider with your own API."
                        >
                            <PlusCircle size={12} /> Add New
                        </button>
                      </label>
                      <div className="relative flex gap-2">
                          {/* Standard HTML Select for single provider selection */}
                          <select 
                              value={selectedProviderId} 
                              onChange={handleSelectProvider}
                              className={`flex-1 ${inputBg} border rounded-lg pl-3 pr-8 py-2 text-xs font-mono font-bold outline-none cursor-pointer appearance-none`}
                              style={{ backgroundImage: `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${theme === 'dark' ? 'rgb(148, 163, 184)' : 'rgb(100, 116, 139)'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-down"><path d="m6 9 6 6 6-6"/></svg>')`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.75rem center' }}
                          >
                              {availableProvidersForSelect.length === 0 ? (
                                  <option value="" disabled className="text-red-500">No active providers (check API Key)</option>
                              ) : (
                                  availableProvidersForSelect.map(p => (
                                      <option key={p.id} value={p.id} className={`${theme === 'dark' ? 'bg-[#1e222d] text-white' : 'bg-white text-slate-800'}`}>
                                          {p.name} ({p.isCustom ? 'Custom' : (p.free ? 'Free' : 'Paid')})
                                      </option>
                                  ))
                              )}
                          </select>
                          {isSelectedProviderCustom && (
                            <button 
                                onClick={() => handleDeleteCustomProvider(selectedProviderId)}
                                className="p-2 bg-rose-600/10 hover:bg-rose-600 hover:text-white text-rose-500 border border-rose-600/20 rounded-lg text-[10px] font-black uppercase flex items-center justify-center transition-all"
                                title="Remove Custom Provider"
                            >
                                <Trash2 size={14} />
                            </button>
                          )}
                      </div>
                  </div>
                  <div className="space-y-1">
                      <label className="text-[9px] font-bold text-slate-500 uppercase">API Key (for selected provider)</label>
                      <div className="flex gap-2">
                          <input 
                              type="password" 
                              value={apiKey} 
                              onChange={(e) => {
                                  setApiKey(e.target.value);
                                  setConnectionStatus('idle'); // Reset status on key change
                              }} 
                              // Disable if custom provider already stores its key
                              disabled={isSelectedProviderCustom && !!availableProvidersForSelect.find(p => p.id === selectedProviderId)?.apiKey}
                              className={`w-full ${inputBg} border rounded-lg px-3 py-2 text-xs font-mono outline-none focus:border-blue-500 ${isSelectedProviderCustom && !!availableProvidersForSelect.find(p => p.id === selectedProviderId)?.apiKey ? 'opacity-50 cursor-not-allowed' : ''}`} 
                          />
                          <button 
                              onClick={() => handleTestAndConnect(selectedProviderId, apiKey)} 
                              disabled={connectionStatus === 'testing' || !isSelectedProviderTwelveData || !apiKey.trim()} // Only enable test for TwelveData if key is present
                              className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-[10px] font-black uppercase whitespace-nowrap"
                          >
                              {connectionStatus === 'testing' ? <Loader2 size={14} className="animate-spin" /> : 'Test'}
                          </button>
                      </div>
                  </div>
                  {connectionStatus !== 'idle' && (
                      <div className={`flex items-start gap-2 p-2 rounded-lg text-[10px] ${connectionStatus === 'success' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                          {connectionStatus === 'success' ? <CheckCircle2 size={14} className="shrink-0 mt-0.5" /> : <AlertCircle size={14} className="shrink-0 mt-0.5" />}
                          <span className="font-medium">{connectionMessage}</span>
                      </div>
                  )}
                  {isSelectedProviderCustom && !availableProvidersForSelect.find(p => p.id === selectedProviderId)?.apiKey && (
                    <div className="flex items-start gap-2 p-2 rounded-lg text-[10px] bg-amber-500/10 text-amber-500">
                        <Info size={14} className="shrink-0 mt-0.5" />
                        <span className="font-medium">This custom provider requires an API Key. Enter it above.</span>
                    </div>
                  )}
              </div>
            </div>

            <hr className={`border-t ${theme === 'dark' ? 'border-slate-800' : 'border-slate-200'}`} />

            {/* Account Balance */}
            <div className="space-y-3">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <Wallet size={14} /> Initial Balance
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-500 font-bold">$</span>
                <input type="number" value={localBalance} onChange={(e) => setLocalBalance(parseFloat(e.target.value) || 0)} className={`w-full ${inputBg} border rounded-xl pl-8 pr-4 py-3 text-xs font-mono font-bold outline-none focus:ring-1 focus:ring-blue-500/40`} />
              </div>
            </div>

            {/* Theme */}
            <div className="space-y-3">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <Palette size={14} /> Theme
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setLocalTheme('dark')} className={`py-3 border ${localTheme === 'dark' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-100 border-slate-200 text-slate-500'} rounded-xl text-[10px] font-black uppercase`}>Navy Dark</button>
                <button onClick={() => setLocalTheme('light')} className={`py-3 border ${localTheme === 'light' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-100 border-slate-200 text-slate-500'} rounded-xl text-[10px] font-black uppercase`}>Light</button>
              </div>
            </div>
          </div>

          <div className={`p-4 ${theme === 'dark' ? 'bg-slate-900/50 border-slate-800' : 'bg-slate-50 border-slate-100'} border-t`}>
            <button onClick={handleSync} className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-black rounded-xl uppercase tracking-widest transition-all shadow-lg active:scale-[0.98]">
              Save & Sync
            </button>
          </div>
        </div>
      </div>
      {isAddCustomProviderModalOpen && (
        <AddCustomProviderModal 
          theme={theme}
          onClose={() => setIsAddCustomProviderModalOpen(false)}
          onSave={handleCustomProviderSaved} 
        />
      )}
    </>
  );
};

export default SettingsModal;