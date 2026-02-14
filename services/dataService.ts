import { OHLC, Timeframe, DataProvider, AssetConfig, AssetCategory, ProviderConfig } from '../types';
import { bulkInsertCandles, getTfStats, updateSyncStatus, deleteAssetAllTimeframes as dbDeleteAssetAllTimeframes, deleteCandlesForAsset, getSetting, setSetting, alignTimestamp, getCustomProvidersDB, addCustomProviderDB, deleteCustomProviderDB, trimOldCandles } from './dbService';
import { TIMEFRAMES, TIMEFRAME_MS, ASSET_CONFIGS, DATA_PROVIDERS as PREDEFINED_PROVIDERS } from '../constants';
import { fetchCandlesFromProvider, getAvailableProviders } from './mockProviderBackend'; 

// Define constants for retry logic
const MAX_RETRIES = 3;
const BASE_DELAY = 1000; 
const HISTORY_LIMIT = 50000; 

// Global state for active provider's API key and the provider itself
let activeApiKey: string = ''; 
let activeProviderId: DataProvider = 'TwelveData'; 
let activeProviderConfig: ProviderConfig | null = null; 

// --- REQUEST GUARD (Debounce / Duplicate Protection) ---
const pendingRequests = new Map<string, Promise<{ data: OHLC[], error?: string, providerId?: DataProvider }>>();

export const initializeDataService = async () => {
    const [savedKey, savedProviderId, savedCustomProviders] = await Promise.all([
        getSetting('fx_pro_api_key'),
        getSetting('fx_pro_provider'),
        getCustomProvidersDB() 
    ]);

    if (savedKey) activeApiKey = savedKey as string;
    if (savedProviderId) activeProviderId = savedProviderId as DataProvider;
    
    const allProviders = [...PREDEFINED_PROVIDERS, ...savedCustomProviders];
    activeProviderConfig = allProviders.find(p => p.id === activeProviderId) || null;

    if (!activeProviderConfig) {
        activeProviderId = 'TwelveData';
        activeProviderConfig = PREDEFINED_PROVIDERS.find(p => p.id === 'TwelveData') || null;
    }

    if (activeProviderConfig?.isCustom && activeProviderConfig.apiKey) {
        activeApiKey = activeProviderConfig.apiKey;
    } else if (activeProviderConfig?.id === 'AlphaVantage' || activeProviderConfig?.id === 'TwelveData') {
        // Keep the globally stored key for these if it's valid
    } else {
        activeApiKey = ''; 
    }

    console.log("[DataService] Initialized. Active Provider:", activeProviderConfig?.name, "API Key Present:", activeApiKey ? 'YES' : 'NO');
};

export const getGlobalApiKey = () => activeApiKey;
export const setGlobalApiKey = async (key: string) => { 
    activeApiKey = key; 
    await setSetting('fx_pro_api_key', key); 
    if (activeProviderConfig?.isCustom) {
        activeProviderConfig.apiKey = key;
        await addCustomProviderDB(activeProviderConfig); 
    }
};

export const getGlobalProvider = () => activeProviderId; 
export const getGlobalProviderConfig = () => activeProviderConfig; 

export const setGlobalProvider = async (providerId: DataProvider) => { 
    activeProviderId = providerId; 
    await setSetting('fx_pro_provider', providerId); 
    
    const customProviders = await getCustomProvidersDB();
    const allProviders = [...PREDEFINED_PROVIDERS, ...customProviders];
    activeProviderConfig = allProviders.find(p => p.id === providerId) || null;

    if (activeProviderConfig?.isCustom && activeProviderConfig.apiKey) {
        activeApiKey = activeProviderConfig.apiKey;
    } else if (activeProviderConfig?.id === 'AlphaVantage' || activeProviderConfig?.id === 'TwelveData') {
        activeApiKey = await getSetting('fx_pro_api_key') as string || '';
    } else {
        activeApiKey = ''; 
    }
};

export const addCustomProvider = async (provider: ProviderConfig) => {
    if (!provider.id) {
        provider.id = `custom_${Math.random().toString(36).slice(2, 11)}`;
        provider.isCustom = true;
        provider.free = false; 
        provider.description = provider.description || 'User-added custom data provider.';
        provider.link = provider.link || '#';
    }
    await addCustomProviderDB(provider);
    await initializeDataService(); 
};

export const getAllCustomProviders = async () => {
    return getCustomProvidersDB();
};

export const removeCustomProvider = async (providerId: DataProvider) => {
    await deleteCustomProviderDB(providerId);
    if (activeProviderId === providerId) {
        await setGlobalProvider('TwelveData'); 
    }
    await initializeDataService(); 
};


const mapTimeframeToTwelveData = (tf: Timeframe): string => {
    const map: Record<Timeframe, string> = { 
        '1m': '1min', '5m': '5min', '15m': '15min', 
        '1h': '1h', '4h': '4h', '1D': '1day', '1W': '1week', 
        '1M': '1month', '12M': '1month' 
    };
    return map[tf] || '1h';
};

const getTimeframeMs = (tf: Timeframe): number => {
    return TIMEFRAME_MS[tf] || 3600000;
};

const getBatchSize = (tf: Timeframe): number => 5000;

// --- DYNAMIC ASSET LIST FETCHING ---
export const fetchRemoteAssets = async (): Promise<AssetConfig[]> => {
    const currentProvider = getGlobalProviderConfig(); 
    const currentApiKey = getGlobalApiKey();

    if (!currentApiKey || !currentProvider) {
        console.warn("No API key or provider set, cannot fetch remote assets. Using default list.");
        return Object.values(ASSET_CONFIGS);
    }

    try {
        let newAssets: AssetConfig[] = [];
        let fetchedSuccessfully = false;

        console.log(`[API GUARD] Authorized fetchRemoteAssets call for provider: ${currentProvider.name}`);
        
        const isTwelveData = currentProvider.id === 'TwelveData' || (currentProvider.baseUrl && currentProvider.baseUrl.includes('twelvedata.com'));

        if (isTwelveData) { 
            const baseUrl = currentProvider.baseUrl || 'https://api.twelvedata.com';
            const cleanBase = baseUrl.replace(/\/$/, '');

            const fxRes = await fetch(`${cleanBase}/forex_pairs?format=JSON&apikey=${currentApiKey}`);
            const fxJson = await fxRes.json();
            const cryptoRes = await fetch(`${cleanBase}/cryptocurrencies?currency_quote=USD,USDT&format=JSON&apikey=${currentApiKey}`);
            const cryptoJson = await cryptoRes.json();

            if (fxJson.data && Array.isArray(fxJson.data)) {
                fxJson.data.forEach((item: any) => {
                    const isJpy = item.symbol.includes('JPY');
                    const decimals = isJpy ? 3 : 5;
                    const tick = isJpy ? 0.001 : 0.00001;
                    newAssets.push({
                        symbol: item.symbol, name: `${item.currency_base} / ${item.currency_quote}`, category: 'Forex',
                        pipDecimal: decimals, tickSize: tick, contractSize: 100000
                    });
                });
            }
            if (cryptoJson.data && Array.isArray(cryptoJson.data)) {
                cryptoJson.data.forEach((item: any) => {
                    newAssets.push({
                        symbol: item.symbol, name: `${item.currency_base_name} / ${item.currency_quote_name}`, category: 'Crypto',
                        pipDecimal: 2, tickSize: 0.01, contractSize: 1
                    });
                });
            }
            if (newAssets.length > 0) {
                fetchedSuccessfully = true;
            }
        } else if (currentProvider.isCustom && currentProvider.baseUrl) {
            console.warn(`Asset discovery not implemented for custom provider '${currentProvider.name}'. Returning default assets.`);
            newAssets.push({ symbol: 'EUR/USD', name: 'Euro / US Dollar', category: 'Forex', pipDecimal: 5, tickSize: 0.00001, contractSize: 100000 });
            newAssets.push({ symbol: 'BTC/USDT', name: 'Bitcoin / Tether', category: 'Crypto', pipDecimal: 2, tickSize: 0.01, contractSize: 1 });
            fetchedSuccessfully = true;

        } else {
            console.warn(`Asset discovery not implemented for provider '${currentProvider.name}'. Skipping.`);
        }
        

        if (!fetchedSuccessfully) {
            console.warn("No remote assets fetched successfully from active provider. Falling back to default list.");
        }

        const defaults = Object.values(ASSET_CONFIGS).filter(a => a.category === 'Indices' || a.category === 'Commodities');
        
        const combined = [...newAssets, ...defaults];
        const unique = Array.from(new Map(combined.map(item => [item.symbol, item])).values());
        
        return unique.sort((a, b) => a.symbol.localeCompare(b.symbol));

    } catch (e) {
        console.error("Failed to fetch remote assets (e.g., network error, API key issue). Falling back to default list.", e);
        return Object.values(ASSET_CONFIGS); 
    }
};

export const checkAssetAvailability = async (symbol: string): Promise<boolean> => {
    // STRICT MODE: Do NOT call API to check availability.
    // Return true optimistically to allow "Download" button to be clickable.
    // The actual check will happen when user clicks Download and we attempt to fetch.
    return true; 
};

export const deleteAssetData = async (symbol: string): Promise<number> => {
    try { return await dbDeleteAssetAllTimeframes(symbol); } 
    catch (e) { return 0; }
};

export const deleteLocalTimeframeData = async (symbol: string, timeframe: Timeframe): Promise<number> => {
    try { return await deleteCandlesForAsset(symbol, timeframe); }
    catch (e) { return 0; }
};

export const testApiConnection = async (key: string): Promise<{ success: boolean; message: string }> => {
    if (!key) return { success: false, message: 'API Key is empty' };
    
    try {
        const res = await fetch(`https://api.twelvedata.com/time_series?symbol=AAPL&interval=1min&outputsize=1&apikey=${key}`);
        const json = await res.json(); 
        if (json.code === 401) return { success: false, message: 'Invalid API Key.' };
        if (json.status === 'error') return { success: false, message: json.message || 'API Error' };
        
        if (json.values && Array.isArray(json.values)) {
             return { success: true, message: 'Connected to TwelveData (Time Series OK)' };
        }
        
        return { success: false, message: 'Connected, but data format unexpected.' };
    } catch (e) { 
        console.error("Error testing API connection for TwelveData:", e); 
        return { success: false, message: 'Network Error or API endpoint unavailable.' }; 
    }
};

export const checkProviderAvailability = async (providerId: DataProvider, apiKey: string): Promise<boolean> => {
    const availableProviders = await getAvailableProviders(apiKey);
    const provider = availableProviders.find(p => p.id === providerId);
    return provider?.status === 'alive';
};

// --- CORE DATA FETCHING (GATEKEEPER) ---
const fetchSegment = async ( 
    symbol: string, 
    tf: Timeframe, 
    params: { startDate?: string, endDate?: string, outputSize?: number },
    intent: string // Required intent for logs
): Promise<{ data: OHLC[], error?: string, providerId?: DataProvider }> => {
    const currentProviderConfig = getGlobalProviderConfig();
    const currentApiKey = getGlobalApiKey(); 

    if (!currentApiKey || !currentProviderConfig) return { data: [], error: 'AUTH_ERROR' };

    const apiInterval = mapTimeframeToTwelveData(tf);
    const requestKey = `${symbol}-${tf}-${params.startDate}-${params.endDate}`;

    // Deduplication check
    if (pendingRequests.has(requestKey)) {
        console.log(`[API GUARD] Skipping duplicate request for ${requestKey}`);
        return pendingRequests.get(requestKey)!;
    }

    console.log(`[API GUARD] ALLOWED REQUEST: ${intent} | ${symbol} | ${tf} | Provider: ${currentProviderConfig.name}`);
    
    const requestPromise = (async () => {
        try {
            const { data, error } = await fetchCandlesFromProvider(
                currentProviderConfig, symbol, apiInterval, currentApiKey, params
            );

            if (!error && data && data.length > 0) {
                return { data, providerId: currentProviderConfig.id }; 
            } else {
                console.error(`[DataService] Failed from ${currentProviderConfig.name}: ${error || 'Unknown error'}`);
                return { data: [], error: error || 'API_FETCH_FAILED', providerId: currentProviderConfig.id };
            }
        } catch (e: any) {
            console.error(`[DataService] Network error for ${currentProviderConfig.name}: ${e.message}`);
            return { data: [], error: e.message || 'NETWORK_ERROR', providerId: currentProviderConfig.id };
        } finally {
            pendingRequests.delete(requestKey);
        }
    })();

    pendingRequests.set(requestKey, requestPromise);
    return requestPromise;
};

export const syncLatestData = async (symbol: string, tf: Timeframe): Promise<OHLC[]> => {
    const stats = await getTfStats(symbol, tf);
    if (stats.count === 0) return []; 

    const lastTime = stats.maxTime;
    const startDateStr = new Date(lastTime + 1).toISOString(); 

    // Explicit intent passed
    const result = await fetchSegment(symbol, tf, { startDate: startDateStr, outputSize: 500 }, "LIVE_SYNC_UPDATE"); 

    if (result.error || !result.data || result.data.length === 0) {
        return [];
    }

    const lastAligned = alignTimestamp(lastTime, tf);
    const newCandles = result.data.filter(c => alignTimestamp(c.time, tf) > lastAligned);

    if (newCandles.length > 0) {
        console.log(`[LiveSync] Found ${newCandles.length} new candles.`);
        await bulkInsertCandles(symbol, tf, newCandles);
        await trimOldCandles(symbol, tf, HISTORY_LIMIT);
        await updateSyncStatus(symbol, tf, Date.now(), 'SUCCESS');
        return newCandles;
    }

    return [];
};


export const downloadSingleTimeframe = async (
    symbol: string, 
    tf: Timeframe, 
    action: 'full' | 'update',
    onProgress: (current: number, total: number, message: string) => void,
    signal?: AbortSignal,
    onGlobalProgress?: (details: { symbol: string, tf: Timeframe, current: number, total: number, phase: string }) => void
): Promise<'SUCCESS' | 'AUTH_ERROR' | 'NETWORK_ERROR' | 'PARTIAL' | 'CANCELLED'> => { 
    if (!activeApiKey) return 'AUTH_ERROR';
    if (!activeProviderId) return 'NETWORK_ERROR'; 

    const batchSize = getBatchSize(tf);
    const stats = await getTfStats(symbol, tf);
    let totalInserted = 0;
    
    const msPerCandle = getTimeframeMs(tf);
    const now = Date.now();
    
    let estimatedTotal = 0;
    if (stats.count > 0) {
        const diffMs = now - stats.maxTime;
        estimatedTotal = Math.ceil(diffMs / msPerCandle);
        if (['1m', '5m', '15m', '1h', '4h', '1D'].includes(tf)) {
            estimatedTotal = Math.floor(estimatedTotal * 0.71); 
        }
        if (estimatedTotal < 10) estimatedTotal = 10;
    } else {
        if (tf === '1m') estimatedTotal = 80000;
        else if (tf === '5m') estimatedTotal = 40000;
        else estimatedTotal = 10000;
    }

    if (signal?.aborted) {
        await updateSyncStatus(symbol, tf, Date.now(), 'CANCELLED');
        return 'CANCELLED';
    }

    // --- FORWARD (UPDATE RECURSIVE) ---
    if (stats.count > 0) {
        onProgress(0, estimatedTotal, `Checking for updates...`);
        if(onGlobalProgress) onGlobalProgress({ symbol, tf, current: 0, total: estimatedTotal, phase: 'Updating' });

        let currentMaxTime = stats.maxTime;
        
        while (true) {
            if (signal?.aborted) {
                await updateSyncStatus(symbol, tf, Date.now(), 'CANCELLED');
                return 'CANCELLED';
            }

            if (Date.now() - currentMaxTime < msPerCandle) break;

            const startDateStr = new Date(currentMaxTime + 1).toISOString();
            
            const result = await fetchSegment(symbol, tf, { startDate: startDateStr, outputSize: 5000 }, "BATCH_UPDATE"); 
            
            if (result.error === 'AUTH_ERROR') return 'AUTH_ERROR';
            if (result.error && result.error.includes('RATE_LIMIT')) {
                onProgress(totalInserted, estimatedTotal, `Rate Limit. Retrying...`);
                await new Promise(r => setTimeout(r, BASE_DELAY * 2));
                continue;
            }
            if (result.error) {
                console.warn("Update failed", result.error);
                break; 
            }
            
            if (!result.data || result.data.length === 0) {
                break;
            }

            const lastAligned = alignTimestamp(currentMaxTime, tf);
            const newCandles = result.data.filter(c => alignTimestamp(c.time, tf) > lastAligned);
            
            if (newCandles.length === 0) {
                break; 
            }

            const count = await bulkInsertCandles(symbol, tf, newCandles);
            totalInserted += count;
            
            currentMaxTime = newCandles[newCandles.length - 1].time;
            
            onProgress(totalInserted, estimatedTotal, `Updated +${totalInserted} candles...`);
            
            if (newCandles.length < 100) break;
            
            await new Promise(r => setTimeout(r, 200)); 
        }
    } 
    
    // --- BACKWARD (HISTORY FILL) ---
    const needsHistory = stats.count === 0 || action === 'full';
    
    if (needsHistory) {
        let cursorDate: string | null = stats.count > 0 ? new Date(stats.minTime).toISOString() : null;
        let consecutiveEmpty = 0;
        
        while (true) {
            if (signal?.aborted) {
                onProgress(totalInserted, estimatedTotal, "Stopping...");
                await updateSyncStatus(symbol, tf, Date.now(), 'CANCELLED');
                return 'CANCELLED';
            }

            if (totalInserted > estimatedTotal) estimatedTotal = Math.floor(totalInserted * 1.05);

            const percentage = Math.min(99, Math.floor((totalInserted / estimatedTotal) * 100));
            onProgress(totalInserted, estimatedTotal, `Downloading history (${percentage}%)...`);
            if(onGlobalProgress) onGlobalProgress({ symbol, tf, current: totalInserted, total: estimatedTotal, phase: `Downloading` });

            let chunkSuccess = false;
            let chunkData: OHLC[] = [];
            
            for (let retry = 0; retry < MAX_RETRIES; retry++) {
                if (signal?.aborted) break; 

                const params: any = { outputSize: batchSize };
                if (cursorDate) params.endDate = cursorDate;

                const res = await fetchSegment(symbol, tf, params, "BATCH_HISTORY");

                if (res.error === 'AUTH_ERROR') return 'AUTH_ERROR';

                if (res.error && res.error.includes('RATE_LIMIT')) {
                    onProgress(totalInserted, estimatedTotal, `Rate limit. Pause...`);
                    await new Promise(r => setTimeout(r, BASE_DELAY * (retry + 1)));
                } else if (res.error) {
                    if (retry === MAX_RETRIES - 1) return 'NETWORK_ERROR'; 
                    await new Promise(r => setTimeout(r, 2000));
                } else {
                    chunkData = res.data;
                    chunkSuccess = true;
                    break;
                }
            }

            if (signal?.aborted) {
                await updateSyncStatus(symbol, tf, Date.now(), 'CANCELLED');
                return 'CANCELLED';
            }

            if (!chunkSuccess) break;

            if (chunkData.length === 0) {
                consecutiveEmpty++;
                if (consecutiveEmpty >= 2) break;
                continue;
            }
            consecutiveEmpty = 0;

            const count = await bulkInsertCandles(symbol, tf, chunkData);
            totalInserted += count;

            const oldest = chunkData[0].time;
            cursorDate = new Date(oldest).toISOString();

            await new Promise(r => setTimeout(r, 0));
        }
    }

    if (totalInserted > 0 || (stats.count > 0 && !needsHistory)) {
        await updateSyncStatus(symbol, tf, Date.now(), 'SUCCESS');
        await trimOldCandles(symbol, tf, HISTORY_LIMIT);
    }

    onProgress(totalInserted, totalInserted, `Complete. +${totalInserted} candles.`);
    if(onGlobalProgress) onGlobalProgress({ symbol, tf, current: totalInserted, total: totalInserted, phase: 'Complete' });
    
    return 'SUCCESS';
};

export const manageAssetData = async (
    symbol: string, action: 'full' | 'update',
    onProgress?: (current: number, total: number, message: string) => void,
    onGlobalProgress?: (details: { symbol: string, tf: Timeframe, current: number, total: number, phase: string }) => void,
    signal?: AbortSignal
): Promise<'SUCCESS' | 'AUTH_ERROR' | 'NETWORK_ERROR' | 'PARTIAL' | 'CANCELLED'> => { 
    if (!activeApiKey) return 'AUTH_ERROR';
    if (!activeProviderId) return 'NETWORK_ERROR'; 

    let overallSuccess = true;
    let wasCancelled = false;
    const failedTimeframes: Timeframe[] = [];

    const sequence = TIMEFRAMES; 

    for (const tf of sequence) {
        if (signal?.aborted) {
            wasCancelled = true;
            break;
        }

        const result = await downloadSingleTimeframe(symbol, tf, action, (curr, tot, msg) => {
            if (onProgress) onProgress(curr, tot, msg);
        }, signal, onGlobalProgress);

        if (result === 'AUTH_ERROR') return 'AUTH_ERROR';
        if (result === 'CANCELLED') {
            wasCancelled = true;
            break; 
        }
        if (result !== 'SUCCESS') {
            overallSuccess = false;
            failedTimeframes.push(tf);
        }
    }
    
    if (wasCancelled) {
        if (onProgress) onProgress(0, 0, "Operation Cancelled.");
        return 'CANCELLED';
    }
    
    return overallSuccess ? 'SUCCESS' : failedTimeframes.length > 0 ? 'PARTIAL' : 'NETWORK_ERROR';
};