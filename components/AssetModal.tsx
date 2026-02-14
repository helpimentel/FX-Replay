import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Search, Globe, Coins, BarChart4, Flame, X, Calendar, Timer, CheckCircle2, AlertCircle, Loader2, Play, History, Database, CloudDownload, RefreshCw, Trash2, Check, Wifi, Table2, AlertTriangle, ArrowRight, StopCircle, FileDown } from 'lucide-react';
import { ASSET_CONFIGS, TIMEFRAMES } from '../constants';
import { AssetCategory, SessionConfig, Timeframe, AssetConfig, Theme } from '../types';
import { manageAssetData, testApiConnection, getGlobalApiKey, downloadSingleTimeframe, deleteAssetData, deleteLocalTimeframeData, fetchRemoteAssets } from '../services/dataService';
import { hasAnyCandlesForAsset, getTfStats, getSyncStatus, exportAssetData, getCandlesInRange } from '../services/dbService'; 

interface AssetModalProps {
  onClose: () => void;
  onStartSession: (config: SessionConfig) => Promise<void>;
  activeSymbol: string;
  onRequireApiKey: () => void;
  onDataDeleted: (symbol: string) => void;
  onDownloadProgress: (status: { active: boolean; symbol: string; timeframe: string; added: number; total: number; phase: string } | null) => void;
  onDataChange: (symbol: string) => void; 
  theme: Theme;
}

const CATEGORIES: { id: AssetCategory; icon: any; label: string }[] = [
  { id: 'Forex', icon: Globe, label: 'Forex' },
  { id: 'Crypto', icon: Coins, label: 'Crypto' },
  { id: 'Indices', icon: BarChart4, label: 'Indices' },
  { id: 'Commodities', icon: Flame, label: 'Commodities' },
];

interface TimeframeStats {
    count: number;
    minTime: number;
    maxTime: number;
    lastSync: number | null;
}

interface ActiveDownload {
    controller: AbortController;
    current: number;
    total: number;
    message: string;
    status: 'pending' | 'downloading' | 'cancelled' | 'error' | 'success';
}

const AssetModal: React.FC<AssetModalProps> = ({ onClose, onStartSession, activeSymbol, onRequireApiKey, onDataDeleted, onDownloadProgress, onDataChange, theme }) => {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<AssetCategory | 'All'>('All');
  
  const [selectedSymbol, setSelectedSymbol] = useState(activeSymbol);
  const [replayTimeframe, setReplayTimeframe] = useState<Timeframe>('1h'); 
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [isSyncing, setIsSyncing] = useState(false);
  
  // Progress & State
  const [managingAsset, setManagingAsset] = useState<string | null>(null);
  const [dlCurrent, setDlCurrent] = useState(0);
  const [dlTotal, setDlTotal] = useState(0);
  const [downloadMessage, setDownloadMessage] = useState(''); 

  const [activeDownloads, setActiveDownloads] = useState<Record<string, ActiveDownload>>({});
  const [deletingTfs, setDeletingTfs] = useState<Record<string, boolean>>({}); // Track deletions per timeframe

  const [isExporting, setIsExporting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  
  const globalAbortController = useRef<AbortController | null>(null);
  const [showDownloadOptions, setShowDownloadOptions] = useState(false);

  const [hasAnyDataForAsset, setHasAnyDataForAsset] = useState<Record<string, boolean>>({});
  const [assetStats, setAssetStats] = useState<Record<string, TimeframeStats>>({});
  const [assetSyncStatus, setAssetSyncStatus] = useState<Record<string, string>>({}); 
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'checking' | 'connected' | 'error' | 'no-key'>('checking');

  // Dynamic Assets State
  const [assetList, setAssetList] = useState<AssetConfig[]>(Object.values(ASSET_CONFIGS));
  const [isLoadingAssets, setIsLoadingAssets] = useState(false);

  // --- MANUAL LIST REFRESH ONLY ---
  const handleRefreshAssetList = async () => {
      const key = getGlobalApiKey();
      if (key) {
          setIsLoadingAssets(true);
          const remoteAssets = await fetchRemoteAssets();
          setAssetList(remoteAssets);
          setIsLoadingAssets(false);
      }
  };

  // --- STATS ENGINE ---
  const fetchAssetStats = async (symbol: string) => {
      // Don't show full loading stats spinner if just deleting a single row, for better UX
      const isDeletingSingle = Object.keys(deletingTfs).length > 0;
      if (!managingAsset && Object.keys(activeDownloads).length === 0 && !isDeletingSingle) setIsLoadingStats(true);
      
      const newStats: Record<string, TimeframeStats> = {};
      const newSyncStatus: Record<string, string> = {};

      const promises = TIMEFRAMES.map(async (tf) => {
          const stats = await getTfStats(symbol, tf);
          const sync = await getSyncStatus(symbol, tf);
          return { tf, stats, lastSync: sync ? sync.lastSync : null, status: sync ? sync.status : null };
      });

      const results = await Promise.all(promises);
      results.forEach(r => { 
          newStats[r.tf] = { ...r.stats, lastSync: r.lastSync }; 
          if(r.status) newSyncStatus[r.tf] = r.status;
      });

      setAssetStats(newStats);
      setAssetSyncStatus(newSyncStatus);
      
      if (newStats[replayTimeframe]?.count === 0) {
          const firstAvailable = TIMEFRAMES.find(tf => newStats[tf].count > 0);
          if (firstAvailable) setReplayTimeframe(firstAvailable);
      }
      setIsLoadingStats(false);
  };

  useEffect(() => {
      let interval: ReturnType<typeof setInterval>;
      const isAnyLoading = managingAsset === selectedSymbol || Object.keys(activeDownloads).length > 0;
      if (isAnyLoading) {
          interval = setInterval(() => fetchAssetStats(selectedSymbol), 1000);
      }
      return () => clearInterval(interval);
  }, [managingAsset, selectedSymbol, activeDownloads]);

  useEffect(() => { fetchAssetStats(selectedSymbol); }, [selectedSymbol]);

  useEffect(() => {
    // Basic connectivity check - purely informational, DOES NOT TRIGGER ASSET FETCH
    const checkConn = async () => {
        const key = getGlobalApiKey();
        if (!key) { setConnectionStatus('no-key'); return; }
        // We only test connection if explicitly requested or on modal open to show status
        // But for strict compliance, let's skip automatic test too unless user action.
        // setConnectionStatus('connected'); // Optimistic
    };
    checkConn();
  }, []);

  const filteredAssets = useMemo(() => {
    return assetList.filter(asset => {
      return (asset.symbol.toLowerCase().includes(search.toLowerCase()) || 
              asset.name.toLowerCase().includes(search.toLowerCase())) &&
             (activeCategory === 'All' || asset.category === activeCategory);
    });
  }, [search, activeCategory, assetList]);

  useEffect(() => {
    // Only check DB status for visual cues (green ticks)
    const checkStatus = async () => {
        const anyDataResults: Record<string, boolean> = {};
        for (const asset of filteredAssets) {
            anyDataResults[asset.symbol] = await hasAnyCandlesForAsset(asset.symbol);
        }
        setHasAnyDataForAsset(prev => ({ ...prev, ...anyDataResults }));
    };
    if (filteredAssets.length > 0) {
        checkStatus();
    }
  }, [filteredAssets, managingAsset, activeDownloads]);

  const handleTimeframeSelect = (t: Timeframe) => {
      setReplayTimeframe(t);
      // AUTO-SET Start Date to the earliest available data for this timeframe
      const stats = assetStats[t];
      if (stats && stats.minTime > 0) {
          const minDate = new Date(stats.minTime);
          const minDateStr = minDate.toISOString().split('T')[0];
          setStartDate(minDateStr);
          
          // Also set End Date to max time just for convenience
          if (stats.maxTime > 0) {
              const maxDate = new Date(stats.maxTime);
              const maxDateStr = maxDate.toISOString().split('T')[0];
              setEndDate(maxDateStr);
          }
      }
  };

  const handleStart = async () => {
    // Basic validation
    const startTs = new Date(startDate).getTime();
    const endTs = new Date(endDate).getTime();
    
    if (startTs > endTs) {
        alert("Start date cannot be after end date.");
        return;
    }

    setIsSyncing(true);
    await onStartSession({ symbol: selectedSymbol, timeframe: replayTimeframe, startDate, endDate });
    setIsSyncing(false);
  };

  // --- DOWNLOAD FLOW ---
  const handleDownloadClick = () => {
      const hasData = hasAnyDataForAsset[selectedSymbol];
      if (hasData) setShowDownloadOptions(true);
      else executeDownload('full');
  };

  const handleCancelGlobal = () => {
      if (globalAbortController.current && !isCancelling) {
          setIsCancelling(true);
          setDownloadMessage("Cancellation requested, finishing current fetch...");
          globalAbortController.current.abort();
      }
  };

  const executeDownload = async (mode: 'full' | 'update' | 'wipe_and_full') => {
      setShowDownloadOptions(false);
      const key = getGlobalApiKey();
      if (!key) { onRequireApiKey(); return; }

      setManagingAsset(selectedSymbol);
      setDlCurrent(0);
      setDlTotal(0);
      setDownloadMessage('Starting...');
      setIsCancelling(false);
      
      const controller = new AbortController();
      globalAbortController.current = controller;

      const progressCallback = (curr: number, tot: number, msg: string) => {
          setDlCurrent(curr);
          setDlTotal(tot);
          if (!globalAbortController.current?.signal.aborted) setDownloadMessage(msg);
      };
      
      const globalStatusCallback = (details: { symbol: string, tf: Timeframe, current: number, total: number, phase: string }) => {
          onDownloadProgress({ active: true, symbol: details.symbol, timeframe: details.tf, added: details.current, total: details.total, phase: details.phase });
      };

      let result;
      if (mode === 'wipe_and_full') {
          setDownloadMessage('Cleaning data...');
          await deleteAssetData(selectedSymbol);
          setHasAnyDataForAsset(prev => ({ ...prev, [selectedSymbol]: false }));
          await new Promise(r => setTimeout(r, 300));
          result = await manageAssetData(selectedSymbol, 'full', progressCallback, globalStatusCallback, controller.signal);
      } else {
          result = await manageAssetData(selectedSymbol, mode, progressCallback, globalStatusCallback, controller.signal);
      }

      await fetchAssetStats(selectedSymbol);
      const hasDataNow = await hasAnyCandlesForAsset(selectedSymbol);
      setHasAnyDataForAsset(prev => ({ ...prev, [selectedSymbol]: hasDataNow }));
      
      // Notify parent app that data changed for this symbol
      onDataChange(selectedSymbol);

      setManagingAsset(null);
      setDlCurrent(0);
      setIsCancelling(false);
      onDownloadProgress(null); 
      globalAbortController.current = null;

      if (result === 'CANCELLED') setDownloadMessage("Cancelled.");
  };

  const handleSingleUpdate = async (tf: Timeframe) => {
      if (activeDownloads[tf] || managingAsset) return;
      const key = getGlobalApiKey();
      if (!key) { onRequireApiKey(); return; }

      const controller = new AbortController();
      setActiveDownloads(prev => ({ ...prev, [tf]: { controller, current: 0, total: 0, message: 'Starting...', status: 'downloading' } }));

      const result = await downloadSingleTimeframe(selectedSymbol, tf, 'update', (curr, tot, msg) => {
          setActiveDownloads(prev => {
              if(!prev[tf]) return prev;
              if (controller.signal.aborted) return prev;
              return { ...prev, [tf]: { ...prev[tf], current: curr, total: tot, message: msg } };
          });
      }, controller.signal, (details) => {
          onDownloadProgress({ active: true, symbol: details.symbol, timeframe: details.tf, added: details.current, total: details.total, phase: details.phase });
      });

      await fetchAssetStats(selectedSymbol);
      // Notify parent app
      onDataChange(selectedSymbol);
      
      setActiveDownloads(prev => { const n = { ...prev }; delete n[tf]; return n; });
      onDownloadProgress(null);
  };

  const handleCancelUpdate = (tf: Timeframe) => {
      if (activeDownloads[tf]) {
          setActiveDownloads(prev => ({ ...prev, [tf]: { ...prev[tf], message: 'Stopping...', status: 'cancelled' } }));
          activeDownloads[tf].controller.abort();
      }
  };

  const handleDownloadCSV = async (tf: Timeframe) => {
      console.log(`[CSV] Initiating export for ${selectedSymbol} - ${tf}`);
      try {
          const data = await getCandlesInRange(selectedSymbol, tf, 0, Infinity);
          console.log(`[CSV] Retrieved ${data.length} records for ${selectedSymbol} - ${tf}`);
          
          if (!data || data.length === 0) {
              alert("No data available to download for this timeframe.");
              return;
          }

          const header = "time,open,high,low,close,volume\n";
          const rows = data.map(c => 
              `${new Date(c.time).toISOString()},${c.open},${c.high},${c.low},${c.close},${c.volume}`
          ).join("\n");
          const csvContent = header + rows;

          const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = `${selectedSymbol.replace('/', '')}_${tf}_data.csv`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
      } catch (e) {
          console.error("CSV Download Failed:", e);
          alert("Failed to generate CSV file.");
      }
  };

  const handleDeleteTimeframe = async (tf: Timeframe) => {
      if (activeDownloads[tf] || deletingTfs[tf]) return; 
      
      // 1. SET LOADING STATE
      setDeletingTfs(prev => ({ ...prev, [tf]: true }));
      
      try {
          // 2. DELETE ACTION
          await deleteLocalTimeframeData(selectedSymbol, tf);
          
          // 3. REFRESH STATS
          await fetchAssetStats(selectedSymbol);
          const hasDataNow = await hasAnyCandlesForAsset(selectedSymbol);
          setHasAnyDataForAsset(prev => ({ ...prev, [selectedSymbol]: hasDataNow }));
          
          // 4. NOTIFY APP
          onDataChange(selectedSymbol);
          
      } catch (e) {
          console.error("Delete failed", e);
          alert("Failed to delete timeframe data.");
      } finally {
          // 5. REMOVE LOADING STATE
          setDeletingTfs(prev => { 
              const n = { ...prev }; 
              delete n[tf]; 
              return n; 
          });
      }
  };

  const handleDelete = async (symbol: string) => {
      if (confirm(`Delete ALL history for ${symbol}?`)) {
          setManagingAsset(symbol);
          await deleteAssetData(symbol); 
          onDataDeleted(symbol);
          setHasAnyDataForAsset(prev => ({ ...prev, [symbol]: false }));
          fetchAssetStats(symbol);
          setManagingAsset(null);
          onDataChange(symbol);
      }
  };

  const handleExport = async (symbol: string) => {
      setIsExporting(true);
      try {
          const blob = await exportAssetData(symbol);
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `FXReplay_${symbol.replace('/', '')}.json`;
          a.click();
          URL.revokeObjectURL(url);
      } catch (e) {
          alert("Export failed.");
      } finally {
          setIsExporting(false);
      }
  };

  const formatDate = (ts: number) => ts === 0 ? '-' : new Date(ts).toISOString().split('T')[0];
  const formatLastSync = (ts: number | null) => {
      if (!ts) return 'Never';
      const d = new Date(ts);
      return `${d.toISOString().split('T')[0]} ${d.toTimeString().substring(0,5)}`;
  };

  const progressPercent = dlTotal > 0 ? Math.min(100, (dlCurrent / dlTotal) * 100) : 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-300">
      <div className={`${theme === 'dark' ? 'bg-[#1e222d] border-slate-800' : 'bg-white border-slate-200'} border w-full max-w-5xl rounded-2xl shadow-2xl flex flex-col h-[600px] max-h-[90vh] overflow-hidden border-t-blue-500 border-t-2 relative`}>
        
        {/* --- DOWNLOAD MODAL --- */}
        {showDownloadOptions && (
            <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-200">
                <div className={`${theme === 'dark' ? 'bg-[#1e222d] border-slate-700' : 'bg-slate-100 border-slate-200'} border w-full max-w-md rounded-2xl shadow-2xl overflow-hidden`}>
                    <div className="p-6 text-center space-y-4">
                        <div className="w-12 h-12 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto text-blue-500 mb-2">
                            <Database size={24} />
                        </div>
                        <h3 className={`text-lg font-black ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>Manage Existing Data</h3>
                        <div className="grid gap-3 mt-6">
                            <button onClick={() => executeDownload('update')} className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl flex items-center justify-between px-6 group transition-all">
                                <div className="text-left"><div className="text-xs font-black uppercase">Update</div></div>
                                <ArrowRight size={16} />
                            </button>
                            <button onClick={() => executeDownload('wipe_and_full')} className={`w-full py-4 border text-white rounded-xl flex items-center justify-between px-6 group transition-all ${theme === 'dark' ? 'bg-[#131722] hover:bg-slate-800 border-slate-700' : 'bg-white text-slate-800 hover:bg-slate-50 border-slate-200'}`}>
                                <div className="text-left"><div className="text-xs font-black uppercase text-amber-500">Fresh Download</div></div>
                                <RefreshCw size={16} className="text-slate-500" />
                            </button>
                        </div>
                    </div>
                    <div className={`p-4 border-t ${theme === 'dark' ? 'bg-slate-900/50 border-slate-800' : 'bg-slate-50 border-slate-100'}`}>
                        <button onClick={() => setShowDownloadOptions(false)} className={`w-full py-3 hover:text-white text-xs font-bold transition-colors ${theme === 'dark' ? 'text-slate-500' : 'text-slate-600'}`}>Cancel</button>
                    </div>
                </div>
            </div>
        )}

        <div className="flex h-full overflow-hidden">
          {/* LEFT: Asset Browser */}
          <div className={`w-[35%] flex flex-col ${theme === 'dark' ? 'border-r border-slate-800 bg-[#131722]/60' : 'border-r border-slate-200 bg-slate-50/60'}`}>
            <div className={`px-4 py-3 border-b flex items-center justify-between ${theme === 'dark' ? 'border-slate-800 bg-[#1e222d]' : 'border-slate-200 bg-slate-100'}`}>
              <h2 className={`text-xs font-black uppercase tracking-widest flex items-center gap-2 ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                <Database size={14} className="text-blue-500" /> Market Library
              </h2>
              <button 
                onClick={handleRefreshAssetList}
                disabled={isLoadingAssets}
                className={`p-1 rounded-lg transition-colors ${theme==='dark'?'hover:bg-slate-700 text-slate-400':'hover:bg-slate-200 text-slate-500'}`}
                title="Sync Asset List from Provider"
              >
                  {isLoadingAssets ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              </button>
            </div>
            <div className="p-3 space-y-3">
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Find asset..." className={`w-full border rounded-xl px-3 py-2 text-xs font-bold outline-none ${theme === 'dark' ? 'bg-[#1e222d] border-slate-800 text-white' : 'bg-white border-slate-300 text-slate-900'}`} />
              <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                {CATEGORIES.map(cat => (
                  <button key={cat.id} onClick={() => setActiveCategory(cat.id)} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${activeCategory === cat.id ? 'bg-blue-600 text-white shadow-lg' : theme === 'dark' ? 'bg-slate-800 text-slate-400' : 'bg-slate-200 text-slate-500'}`}>
                    <cat.icon size={10} /> {cat.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1 custom-scrollbar">
              {isLoadingAssets && assetList.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-40 text-slate-500 gap-2">
                      <Loader2 className="animate-spin" />
                      <span className="text-xs font-bold">Syncing Asset Library...</span>
                  </div>
              ) : (
                  filteredAssets.map(asset => {
                    const hasData = hasAnyDataForAsset[asset.symbol];
                    const isSelected = selectedSymbol === asset.symbol;
                    return (
                    <div key={asset.symbol} onClick={() => setSelectedSymbol(asset.symbol)} className={`flex items-center justify-between p-2 rounded-xl cursor-pointer transition-all border ${isSelected ? 'bg-blue-600/10 border-blue-600/50' : `border-transparent ${theme === 'dark' ? 'hover:bg-slate-800/40' : 'hover:bg-slate-100'}`}`}>
                    <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-[9px] ${theme === 'dark' ? 'bg-slate-800 text-slate-400' : 'bg-slate-200 text-slate-500'}`}>{asset.symbol.substring(0, 3)}</div>
                        <div>
                        <div className={`text-xs font-black ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>{asset.symbol}</div>
                        <div className={`text-[9px] font-bold uppercase ${theme === 'dark' ? 'text-slate-500' : 'text-slate-400'}`}>{asset.name}</div>
                        </div>
                    </div>
                    {hasData && <CheckCircle2 size={14} className="text-emerald-500/50" />}
                    </div>
                    );
                })
              )}
            </div>
          </div>

          {/* RIGHT: Data Manager */}
          <div className="flex-1 flex flex-col overflow-hidden">
            
            {/* 1. Header (Fixed) */}
            <div className={`flex-shrink-0 flex items-center justify-between px-6 py-3 border-b ${theme === 'dark' ? 'border-slate-800' : 'border-slate-200'}`}>
              <h2 className={`text-xs font-black uppercase tracking-widest italic flex items-center gap-2 ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}><History size={14} className="text-blue-500" /> Data Audit</h2>
              <button onClick={onClose} className={`p-1.5 rounded-full text-slate-400 ${theme === 'dark' ? 'hover:bg-slate-800' : 'hover:bg-slate-100'}`}><X size={18} /></button>
            </div>

            {/* 2. Scrollable Body */}
            <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-4 space-y-6">
              
              {/* Asset Card */}
              <div className={`border p-4 rounded-2xl flex items-center justify-between relative overflow-hidden ${theme === 'dark' ? 'bg-[#131722] border-slate-800' : 'bg-slate-100 border-slate-200'}`}>
                <div className="relative z-10">
                  <div className="text-[9px] font-black text-slate-500 uppercase mb-1 tracking-widest">Selected Asset</div>
                  <div className={`text-2xl font-black tracking-tight ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>{selectedSymbol}</div>
                </div>
                <div className="flex items-center gap-2 z-10">
                    {hasAnyDataForAsset[selectedSymbol] && !managingAsset && (
                        <button onClick={() => handleExport(selectedSymbol)} disabled={isExporting} className={`px-3 py-1.5 text-white border rounded-lg text-[9px] font-black uppercase flex items-center gap-2 ${theme === 'dark' ? 'bg-slate-700 hover:bg-slate-600 border-slate-600' : 'bg-slate-600 hover:bg-slate-700 border-slate-500'}`}>
                            {isExporting ? <Loader2 size={12} className="animate-spin"/> : <FileDown size={12}/>} Export
                        </button>
                    )}
                    {managingAsset === selectedSymbol ? (
                        <button onClick={handleCancelGlobal} disabled={isCancelling} className={`px-3 py-1.5 text-white rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center gap-2 transition-all shadow-lg ${isCancelling ? 'bg-slate-600' : 'bg-rose-600 hover:bg-rose-500'}`}>
                            {isCancelling ? <Loader2 size={12} className="animate-spin" /> : <StopCircle size={12} />} 
                            {isCancelling ? 'Stopping...' : 'Stop Download'}
                        </button>
                    ) : (
                        <button onClick={handleDownloadClick} disabled={managingAsset !== null} className={`px-3 py-1.5 text-white rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center gap-2 transition-all shadow-lg ${hasAnyDataForAsset[selectedSymbol] ? 'bg-indigo-600 hover:bg-indigo-500' : 'bg-blue-600 hover:bg-blue-500'}`}>
                            {managingAsset === selectedSymbol ? <Loader2 size={12} className="animate-spin"/> : <CloudDownload size={12}/>} 
                            {hasAnyDataForAsset[selectedSymbol] ? 'Update Data' : 'Download All'}
                        </button>
                    )}
                    {hasAnyDataForAsset[selectedSymbol] && !managingAsset && (
                        <button onClick={() => handleDelete(selectedSymbol)} className="px-3 py-1.5 bg-rose-600/10 hover:bg-rose-600 hover:text-white text-rose-500 border border-rose-600/20 rounded-lg text-[9px] font-black uppercase"><Trash2 size={12}/></button>
                    )}
                </div>
                
                {/* GLOBAL PROGRESS BAR (INSIDE HEADER) */}
                {managingAsset === selectedSymbol && (
                    <div className={`absolute bottom-0 left-0 right-0 h-1.5 ${theme === 'dark' ? 'bg-slate-800' : 'bg-slate-200'}`}>
                        <div 
                            className={`h-full bg-blue-500 transition-all duration-300 ${isCancelling ? 'bg-rose-500' : ''}`} 
                            style={{ width: `${progressPercent}%` }} 
                        />
                    </div>
                )}
              </div>
              
              {managingAsset === selectedSymbol && (
                  <div className={`border p-2 rounded-xl flex items-center gap-3 animate-in slide-in-from-top-2 ${isCancelling ? 'bg-rose-500/10 border-rose-500/20' : 'bg-blue-500/10 border-blue-500/20'}`}>
                      {isCancelling ? <AlertTriangle size={14} className="text-rose-500" /> : <Loader2 size={14} className="text-blue-500 animate-spin" />}
                      <span className={`text-[9px] font-mono ${isCancelling ? 'text-rose-200' : 'text-blue-200'}`}>{downloadMessage}</span>
                      <span className="ml-auto text-[9px] font-black text-blue-500">
                          {dlCurrent.toLocaleString()} / {dlTotal > 0 ? dlTotal.toLocaleString() : '?'} ({progressPercent.toFixed(1)}%)
                      </span>
                  </div>
              )}

              <div className="space-y-3">
                  <div className={`${theme === 'dark' ? 'bg-[#131722] border-slate-800' : 'bg-white border-slate-200'} border rounded-xl overflow-hidden`}>
                      <table className="w-full text-left border-collapse">
                          <thead>
                              <tr className={`border-b ${theme === 'dark' ? 'border-slate-800 bg-slate-900/50' : 'border-slate-200 bg-slate-100'}`}>
                                  <th className="p-2 text-[9px] font-black text-slate-500 uppercase tracking-wider">Timeframe</th>
                                  <th className="p-2 text-[9px] font-black text-slate-500 uppercase tracking-wider text-right">Candles</th>
                                  <th className="p-2 text-[9px] font-black text-slate-500 uppercase tracking-wider text-right">Range</th>
                                  <th className="p-2 text-[9px] font-black text-slate-500 uppercase tracking-wider text-right">Last Sync</th>
                                  <th className="p-2 text-[9px] font-black text-slate-500 uppercase tracking-wider text-center">Status</th>
                                  <th className="p-2 text-[9px] font-black text-slate-500 uppercase tracking-wider text-right">Action</th>
                              </tr>
                          </thead>
                          <tbody>
                              {TIMEFRAMES.map(tf => {
                                  const stat = assetStats[tf] || { count: 0, minTime: 0, maxTime: 0, lastSync: null };
                                  const dbStatus = assetSyncStatus[tf]; 
                                  const active = activeDownloads[tf];
                                  const isDeleting = deletingTfs[tf];
                                  const hasData = stat.count > 0;
                                  let statusBadgeClass = 'text-slate-500 bg-slate-800';
                                  let statusText = 'Empty';

                                  if (active) {
                                      statusText = active.status === 'cancelled' ? 'Stopping...' : 'Downloading';
                                      statusBadgeClass = 'text-blue-500 bg-blue-500/10';
                                  } else if (isDeleting) {
                                      statusText = 'Deleting...';
                                      statusBadgeClass = 'text-rose-500 bg-rose-500/10 animate-pulse';
                                  } else if (hasData) {
                                      statusText = dbStatus === 'PARTIAL' ? 'Partial' : (dbStatus === 'CANCELLED' ? 'Cancelled' : 'Ready');
                                      statusBadgeClass = dbStatus === 'PARTIAL' ? 'text-amber-500 bg-amber-500/10' : 
                                                         dbStatus === 'CANCELLED' ? 'text-rose-500 bg-rose-500/10' :
                                                         'text-emerald-500 bg-emerald-500/10';
                                  }

                                  return (
                                      <tr key={tf} className={`border-b ${theme === 'dark' ? 'border-slate-800/50' : 'border-slate-200'} hover:${theme === 'dark' ? 'bg-slate-800/30' : 'bg-slate-50'}`}>
                                          <td className={`p-2 text-[9px] font-bold ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>{tf}</td>
                                          <td className="p-2 text-[9px] font-mono text-slate-400 text-right">{stat.count.toLocaleString()}</td>
                                          <td className="p-2 text-[9px] font-mono text-slate-500 text-right">{hasData ? `${formatDate(stat.minTime)} -> ${formatDate(stat.maxTime)}` : '-'}</td>
                                          <td className="p-2 text-[9px] font-mono text-blue-400 text-right">{formatLastSync(stat.lastSync)}</td>
                                          <td className="p-2 text-center align-middle">
                                              {active ? <div className="text-[9px] text-blue-500 animate-pulse">
                                                  {active.current.toLocaleString()} / {active.total > 0 ? active.total.toLocaleString() : '?'}
                                                  </div> : <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded ${statusBadgeClass}`}>{statusText}</span>}
                                          </td>
                                          <td className="p-2 text-right">
                                              <div className="flex justify-end gap-1.5">
                                                {active ? (
                                                    <button onClick={() => handleCancelUpdate(tf)} className="text-rose-500 p-1 hover:bg-rose-500/10 rounded"><X size={12}/></button>
                                                ) : (
                                                    <>
                                                        {hasData && !isDeleting && (
                                                            <button 
                                                                onClick={() => handleDownloadCSV(tf)} 
                                                                className="text-slate-400 p-1 hover:bg-slate-500/10 hover:text-slate-600 rounded disabled:opacity-30" 
                                                                disabled={managingAsset !== null}
                                                                title="Download CSV"
                                                            >
                                                                <FileDown size={12}/>
                                                            </button>
                                                        )}
                                                        {hasData && !isDeleting && (
                                                            <button 
                                                                onClick={() => handleDeleteTimeframe(tf)} 
                                                                className="text-rose-500 p-1 hover:bg-rose-500/10 rounded disabled:opacity-30" 
                                                                disabled={managingAsset !== null}
                                                                title="Delete this timeframe data"
                                                            >
                                                                <Trash2 size={12}/>
                                                            </button>
                                                        )}
                                                        {isDeleting ? (
                                                            <div className="p-1"><Loader2 size={12} className="animate-spin text-rose-500"/></div>
                                                        ) : (
                                                            <button 
                                                                onClick={() => handleSingleUpdate(tf)} 
                                                                className="text-blue-500 p-1 hover:bg-blue-500/10 rounded disabled:opacity-30" 
                                                                disabled={managingAsset !== null}
                                                                title={hasData ? "Update Data" : "Download Data"}
                                                            >
                                                                {hasData ? <RefreshCw size={12}/> : <CloudDownload size={12} />}
                                                            </button>
                                                        )}
                                                    </>
                                                )}
                                              </div>
                                          </td>
                                      </tr>
                                  );
                              })}
                          </tbody>
                      </table>
                  </div>
              </div>
            </div>

            {/* 3. Footer (Fixed) */}
            <div className={`flex-shrink-0 pt-4 px-6 pb-6 grid grid-cols-2 gap-6 ${theme === 'dark' ? 'border-t border-slate-800 bg-[#1e222d]' : 'border-t border-slate-200 bg-white'}`}>
                  <div className="space-y-3">
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-slate-500 uppercase flex items-center gap-2"><Timer size={12} className="text-blue-500" /> Replay Timeframe</label>
                        <div className="flex flex-wrap gap-1.5">
                            {TIMEFRAMES.filter(t => assetStats[t]?.count > 0).map(t => (
                            <button key={t} onClick={() => handleTimeframeSelect(t)} className={`px-2.5 py-1.5 rounded text-[10px] font-bold ${replayTimeframe === t ? 'bg-blue-600 text-white' : (theme === 'dark' ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-500')}`}>{t}</button>
                            ))}
                            {TIMEFRAMES.every(t => assetStats[t]?.count === 0) && <span className="text-[9px] text-slate-600 italic">Download data first</span>}
                        </div>
                      </div>
                      
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-slate-500 uppercase flex items-center gap-2"><Calendar size={12} className="text-blue-500" /> Start Date</label>
                         <input 
                            type="date" 
                            value={startDate} 
                            onChange={(e) => setStartDate(e.target.value)} 
                            className={`w-full border rounded-xl px-3 py-2 text-xs font-bold outline-none focus:border-blue-500/50 transition-colors ${theme === 'dark' ? 'bg-[#131722] border-slate-800 text-white hover:border-slate-600' : 'bg-white border-slate-300 text-slate-900 hover:border-slate-400'}`}
                            style={{ colorScheme: theme }} 
                         />
                      </div>
                  </div>
                  
                  <div className="flex flex-col justify-end">
                      <button onClick={handleStart} disabled={isSyncing || TIMEFRAMES.every(t => assetStats[t]?.count === 0)} className="w-full h-11 bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase rounded-xl shadow-xl flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-xs tracking-wider">
                        {isSyncing ? <Loader2 className="animate-spin" /> : <Play fill="currentColor" size={14} />} Launch Replay Session
                    </button>
                  </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

export default AssetModal;