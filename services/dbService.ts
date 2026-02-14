import { CandleDBEntry, OHLC, Timeframe, DBStatus, ProviderConfig, SavedSession } from '../types';
import { TIMEFRAMES } from '../constants';

// ==========================================
// LOCAL DATABASE ENGINE (IndexedDB / SQL-Like)
// ==========================================
const DB_NAME = 'FXReplayDesktopDB';
const DB_VERSION = 4; // Increment DB version for schema changes (Sessions)
const STORE_CANDLES = 'candles';
const STORE_SETTINGS = 'settings';
const STORE_SYNC_STATUS = 'sync_status'; 
const STORE_CUSTOM_PROVIDERS = 'custom_providers';
const STORE_SESSIONS = 'sessions'; // NEW: Store for saved sessions
const INDEX_COMPOUND = 'idx_symbol_tf_time';

let dbInstance: IDBDatabase | null = null;

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (dbInstance) return resolve(dbInstance);
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => {
        console.error("DB Open Error:", request.error);
        reject(`DB Error: ${request.error?.message}`);
    };
    
    request.onsuccess = () => {
      dbInstance = request.result;
      dbInstance.onversionchange = () => {
          console.warn(`[DB] Database version changed. Closing DB instance for update.`);
          dbInstance?.close();
          dbInstance = null;
          // You might want to reload the page or prompt the user to refresh here
          // For now, it will just ensure a fresh connection on next attempt.
      };
      resolve(dbInstance);
    };
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      if (!db.objectStoreNames.contains(STORE_CANDLES)) {
        const store = db.createObjectStore(STORE_CANDLES, { keyPath: 'id', autoIncrement: true });
        store.createIndex(INDEX_COMPOUND, ['symbol', 'timeframe', 'time'], { unique: true });
      }
      if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
        db.createObjectStore(STORE_SETTINGS, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORE_SYNC_STATUS)) {
          db.createObjectStore(STORE_SYNC_STATUS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_CUSTOM_PROVIDERS)) {
          db.createObjectStore(STORE_CUSTOM_PROVIDERS, { keyPath: 'id' });
      }
      // NEW: Create sessions store
      if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
          db.createObjectStore(STORE_SESSIONS, { keyPath: 'id' });
      }
    };
  });
};

// --- TIMESTAMP ALIGNMENT UTIL ---
// Ensures that 10:04:23 on a 5m chart becomes 10:00:00
export const alignTimestamp = (timestamp: number, timeframe: Timeframe): number => {
    const date = new Date(timestamp);
    // Reset seconds and ms for standard TFs
    date.setSeconds(0);
    date.setMilliseconds(0);

    const ms = date.getTime();
    
    // Helper to round down
    const floorTo = (val: number, interval: number) => Math.floor(val / interval) * interval;

    switch (timeframe) {
        case '1m': return floorTo(ms, 60 * 1000);
        case '5m': return floorTo(ms, 5 * 60 * 1000);
        case '15m': return floorTo(ms, 15 * 60 * 1000);
        case '1h': return floorTo(ms, 60 * 60 * 1000);
        case '4h': return floorTo(ms, 4 * 60 * 60 * 1000);
        case '1D': 
            date.setUTCHours(0, 0, 0, 0); // Align to day start UTC
            return date.getTime();
        case '1W':
            const day = date.getUTCDay();
            const diff = date.getUTCDate() - day + (day === 0 ? -6 : 1); // Adjust to Monday
            date.setUTCDate(diff);
            date.setUTCHours(0,0,0,0);
            return date.getTime();
        case '1M':
            date.setUTCDate(1);
            date.setUTCHours(0,0,0,0);
            return date.getTime();
        case '12M':
            date.setUTCMonth(0, 1); // Force to January 1st
            date.setUTCHours(0,0,0,0);
            return date.getTime();
        default: return ms;
    }
};

export const checkDatabaseStatus = async (): Promise<DBStatus> => {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
        if (!db.objectStoreNames.contains(STORE_CANDLES)) {
             resolve({ isInstalled: false, candleCount: 0, dbVersion: db.version });
             return;
        }
        const tx = db.transaction([STORE_CANDLES], 'readonly');
        const req = tx.objectStore(STORE_CANDLES).count();
        req.onsuccess = () => resolve({ isInstalled: true, candleCount: req.result, dbVersion: db.version });
        req.onerror = () => resolve({ isInstalled: false, candleCount: 0, dbVersion: 0 });
    });
  } catch (e) { 
      return { isInstalled: false, candleCount: 0, dbVersion: 0 }; 
  }
};

export const installDatabase = async (): Promise<boolean> => {
    if (dbInstance) {
        dbInstance.close();
        dbInstance = null;
    }
    return new Promise((resolve, reject) => {
        const delReq = indexedDB.deleteDatabase(DB_NAME);
        delReq.onerror = (e) => reject(delReq.error);
        delReq.onsuccess = () => {
            // Re-open with incremented version to trigger onupgradeneeded
            const openReq = indexedDB.open(DB_NAME, DB_VERSION);
            openReq.onupgradeneeded = (e) => {
                const db = (e.target as IDBOpenDBRequest).result;
                if (!db.objectStoreNames.contains(STORE_CANDLES)) {
                    const store = db.createObjectStore(STORE_CANDLES, { keyPath: 'id', autoIncrement: true });
                    store.createIndex(INDEX_COMPOUND, ['symbol', 'timeframe', 'time'], { unique: true });
                }
                if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
                    db.createObjectStore(STORE_SETTINGS, { keyPath: 'key' });
                }
                if (!db.objectStoreNames.contains(STORE_SYNC_STATUS)) {
                    db.createObjectStore(STORE_SYNC_STATUS, { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains(STORE_CUSTOM_PROVIDERS)) {
                    db.createObjectStore(STORE_CUSTOM_PROVIDERS, { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
                    db.createObjectStore(STORE_SESSIONS, { keyPath: 'id' });
                }
            };
            openReq.onsuccess = () => {
                dbInstance = openReq.result;
                resolve(true);
            };
            openReq.onerror = (e) => reject(openReq.error);
        };
    });
};

// --- SESSION MANAGEMENT ---

export const saveSession = async (session: SavedSession): Promise<void> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_SESSIONS], 'readwrite');
        const store = tx.objectStore(STORE_SESSIONS);
        const req = store.put(session);
        req.onsuccess = () => resolve();
        req.onerror = (e) => reject(req.error);
    });
};

export const getSessions = async (): Promise<SavedSession[]> => {
    const db = await openDB();
    return new Promise((resolve) => {
        const tx = db.transaction([STORE_SESSIONS], 'readonly');
        const store = tx.objectStore(STORE_SESSIONS);
        const req = store.getAll();
        req.onsuccess = () => {
            // Sort by lastUpdated desc
            const sessions = (req.result as SavedSession[]).sort((a, b) => b.lastUpdated - a.lastUpdated);
            resolve(sessions);
        };
        req.onerror = () => resolve([]);
    });
};

export const deleteSession = async (sessionId: string): Promise<void> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_SESSIONS], 'readwrite');
        const store = tx.objectStore(STORE_SESSIONS);
        const req = store.delete(sessionId);
        req.onsuccess = () => resolve();
        req.onerror = (e) => reject(req.error);
    });
};


// --- CUSTOM PROVIDER OPERATIONS ---
export const getCustomProvidersDB = async (): Promise<ProviderConfig[]> => {
    const db = await openDB();
    return new Promise((resolve) => {
        const tx = db.transaction([STORE_CUSTOM_PROVIDERS], 'readonly');
        const store = tx.objectStore(STORE_CUSTOM_PROVIDERS);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve([]);
    });
};

export const addCustomProviderDB = async (provider: ProviderConfig): Promise<void> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_CUSTOM_PROVIDERS], 'readwrite');
        const store = tx.objectStore(STORE_CUSTOM_PROVIDERS);
        const req = store.put(provider); // 'put' will add or update
        req.onsuccess = () => resolve();
        req.onerror = (e) => reject(req.error);
    });
};

export const deleteCustomProviderDB = async (providerId: string): Promise<void> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_CUSTOM_PROVIDERS], 'readwrite');
        const store = tx.objectStore(STORE_CUSTOM_PROVIDERS);
        const req = store.delete(providerId);
        req.onsuccess = () => resolve();
        req.onerror = (e) => reject(req.error);
    });
};


// --- DATA OPERATIONS ---

export const bulkInsertCandles = async (symbol: string, timeframe: Timeframe, candles: OHLC[]): Promise<number> => {
    const db = await openDB();
    return new Promise((resolve) => {
        const tx = db.transaction([STORE_CANDLES], 'readwrite');
        const store = tx.objectStore(STORE_CANDLES);
        let insertedCount = 0;
        
        // Optimize: Deduplicate incoming batch before inserting to minimize constraint errors
        const batchMap = new Map<number, OHLC>();
        
        candles.forEach(c => {
            if (!c.time || c.open === undefined) return;
            // CRITICAL: Align timestamp to grid to prevent ghosts/duplicates
            // This ensures that even if API sends 10:00:05, we store it as 10:00:00
            const alignedTime = alignTimestamp(c.time, timeframe);
            
            // If multiple ticks fall into same aligned candle (e.g. from tick data), 
            // we overwrite with the latest processed one.
            batchMap.set(alignedTime, { ...c, time: alignedTime });
        });

        const processedCandles = Array.from(batchMap.values());

        processedCandles.forEach(c => {
            const entry: Omit<CandleDBEntry, 'id'> = {
                symbol, timeframe,
                time: c.time,
                open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume || 0
            };
            
            // Using 'add' with unique index will fail if key exists.
            // We want to skip existing keys to simulate INSERT IGNORE.
            const request = store.add(entry); 
            request.onsuccess = () => insertedCount++;
            request.onerror = (e) => { 
                // Error likely due to constraint violation (duplicate symbol+tf+time)
                e.preventDefault(); 
                e.stopPropagation(); 
            };
        });

        tx.oncomplete = () => resolve(insertedCount);
        tx.onerror = () => resolve(insertedCount);
    });
};

// NEW: Trim function to enforce history limits (Requirement 4)
export const trimOldCandles = async (symbol: string, timeframe: Timeframe, maxCount: number): Promise<void> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_CANDLES], 'readwrite');
        const store = tx.objectStore(STORE_CANDLES);
        const index = store.index(INDEX_COMPOUND);
        
        // Use count to check if we exceed limit
        const range = IDBKeyRange.bound([symbol, timeframe, 0], [symbol, timeframe, Infinity]);
        const countReq = index.count(range);
        
        countReq.onsuccess = () => {
            const total = countReq.result;
            if (total <= maxCount) {
                resolve();
                return;
            }
            
            // Delete oldest excess
            const deleteCount = total - maxCount;
            let deleted = 0;
            const cursorReq = index.openKeyCursor(range); // Default direction is 'next' (ascending time)
            
            cursorReq.onsuccess = (e) => {
                const cursor = (e.target as IDBRequest).result;
                if (cursor && deleted < deleteCount) {
                    store.delete(cursor.primaryKey);
                    deleted++;
                    cursor.continue();
                } else {
                    // Done deleting
                }
            };
        };
        
        tx.oncomplete = () => resolve();
        tx.onerror = (e) => reject(tx.error);
    });
};

export const getCandlesInRange = async (symbol: string, timeframe: Timeframe, startTime: number, endTime: number): Promise<OHLC[]> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_CANDLES], 'readonly');
        const index = tx.objectStore(STORE_CANDLES).index(INDEX_COMPOUND);
        const range = IDBKeyRange.bound([symbol, timeframe, startTime], [symbol, timeframe, endTime]);
        const req = index.getAll(range);
        req.onsuccess = () => {
            // Map and Sort
            const res = req.result.map(r => ({
                time: r.time, open: r.open, high: r.high, low: r.low, close: r.close, volume: r.volume
            }));
            res.sort((a, b) => a.time - b.time);
            resolve(res);
        };
        req.onerror = () => reject(req.error);
    });
};

// Lazy loading pagination function
export const getOlderCandles = async (symbol: string, timeframe: Timeframe, beforeTime: number, limit: number): Promise<OHLC[]> => {
    const db = await openDB();
    return new Promise((resolve) => {
        const tx = db.transaction([STORE_CANDLES], 'readonly');
        const index = tx.objectStore(STORE_CANDLES).index(INDEX_COMPOUND);
        // Range from 0 to just before current time
        const range = IDBKeyRange.bound([symbol, timeframe, 0], [symbol, timeframe, beforeTime - 1]);
        
        // Open cursor backwards
        const req = index.openCursor(range, 'prev');
        const results: OHLC[] = [];
        
        req.onsuccess = (event) => {
            const cursor = (event.target as IDBRequest).result;
            if (cursor && results.length < limit) {
                const r = cursor.value;
                results.push({
                    time: r.time, open: r.open, high: r.high, low: r.low, close: r.close, volume: r.volume
                });
                cursor.continue();
            } else {
                resolve(results.reverse());
            }
        };
        req.onerror = () => resolve([]);
    });
};

export const deleteCandlesForAsset = async (symbol: string, timeframe: Timeframe): Promise<number> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_CANDLES, STORE_SYNC_STATUS], 'readwrite');
        const store = tx.objectStore(STORE_CANDLES);
        const index = store.index(INDEX_COMPOUND);
        const range = IDBKeyRange.bound([symbol, timeframe, 0], [symbol, timeframe, Infinity]);
        
        let deletedCount = 0;
        const req = index.openKeyCursor(range);
        
        req.onsuccess = (e) => {
            const cursor = (e.target as IDBRequest).result;
            if (cursor) {
                store.delete(cursor.primaryKey);
                deletedCount++;
                cursor.continue();
            }
        };
        const syncStore = tx.objectStore(STORE_SYNC_STATUS);
        syncStore.delete(`${symbol}-${timeframe}`);
        tx.oncomplete = () => resolve(deletedCount);
        tx.onerror = (e) => reject(tx.error);
    });
};

export const deleteAssetAllTimeframes = async (symbol: string): Promise<number> => {
  let totalDeleted = 0;
  for (const tf of TIMEFRAMES) {
    try { totalDeleted += await deleteCandlesForAsset(symbol, tf); } catch (e) {}
  }
  return totalDeleted;
};

export const hasAnyCandlesForAsset = async (symbol: string): Promise<boolean> => {
    const db = await openDB();
    return new Promise((resolve) => {
        const tx = db.transaction([STORE_CANDLES], 'readonly');
        const index = tx.objectStore(STORE_CANDLES).index(INDEX_COMPOUND);
        let found = false;
        let tfIndex = 0;
        const checkNextTimeframe = () => {
            if (tfIndex >= TIMEFRAMES.length) { resolve(found); return; }
            const tf = TIMEFRAMES[tfIndex];
            const range = IDBKeyRange.bound([symbol, tf, 0], [symbol, tf, Infinity]);
            const req = index.count(range);
            req.onsuccess = () => {
                if (req.result > 0) { resolve(true); } 
                else { tfIndex++; checkNextTimeframe(); }
            };
            req.onerror = () => { tfIndex++; checkNextTimeframe(); };
        };
        checkNextTimeframe();
    });
};

export const hasAnyCandles = async (symbol: string, timeframe: Timeframe): Promise<boolean> => {
    const db = await openDB();
    return new Promise((resolve) => {
        const tx = db.transaction([STORE_CANDLES], 'readonly');
        const index = tx.objectStore(STORE_CANDLES).index(INDEX_COMPOUND);
        const range = IDBKeyRange.bound([symbol, timeframe, 0], [symbol, timeframe, Date.now()]);
        const req = index.getKey(range); 
        req.onsuccess = () => resolve(!!req.result);
        req.onerror = () => resolve(false);
    });
};

export const getTfStats = async (symbol: string, timeframe: Timeframe): Promise<{ count: number, minTime: number, maxTime: number }> => {
    const db = await openDB();
    return new Promise((resolve) => {
        const tx = db.transaction([STORE_CANDLES], 'readonly');
        const index = tx.objectStore(STORE_CANDLES).index(INDEX_COMPOUND);
        const range = IDBKeyRange.bound([symbol, timeframe, 0], [symbol, timeframe, Infinity]);
        const countReq = index.count(range);
        countReq.onsuccess = () => {
             const count = countReq.result;
             if (count === 0) { resolve({ count: 0, minTime: 0, maxTime: 0 }); return; }
             const minReq = index.openKeyCursor(range, 'next');
             let minTime = 0;
             minReq.onsuccess = () => {
                 const cursor = minReq.result;
                 if (cursor) minTime = (cursor.key as any[])[2];
                 const maxReq = index.openKeyCursor(range, 'prev');
                 let maxTime = 0;
                 maxReq.onsuccess = () => {
                     const cursorMax = maxReq.result;
                     if (cursorMax) maxTime = (cursorMax.key as any[])[2];
                     resolve({ count, minTime, maxTime });
                 };
                 maxReq.onerror = () => resolve({ count, minTime, maxTime: 0 });
             };
             minReq.onerror = () => resolve({ count, minTime: 0, maxTime: 0 });
        };
        countReq.onerror = () => resolve({ count: 0, minTime: 0, maxTime: 0 });
    });
};

export const getLastCandle = async (symbol: string, timeframe: Timeframe): Promise<OHLC | null> => {
    const db = await openDB();
    return new Promise((resolve) => {
        const tx = db.transaction([STORE_CANDLES], 'readonly');
        const index = tx.objectStore(STORE_CANDLES).index(INDEX_COMPOUND);
        const range = IDBKeyRange.bound([symbol, timeframe, 0], [symbol, timeframe, Infinity]);
        const req = index.openCursor(range, 'prev');
        req.onsuccess = () => {
            const cursor = req.result;
            if (cursor) resolve({ ...cursor.value });
            else resolve(null);
        };
        req.onerror = () => resolve(null);
    });
};

export const exportAssetData = async (symbol: string): Promise<Blob> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_CANDLES], 'readonly');
        const index = tx.objectStore(STORE_CANDLES).index(INDEX_COMPOUND);
        let allData: any[] = [];
        let completedTfs = 0;
        TIMEFRAMES.forEach(tf => {
             const range = IDBKeyRange.bound([symbol, tf, 0], [symbol, tf, Infinity]);
             const req = index.getAll(range);
             req.onsuccess = () => {
                 allData = allData.concat(req.result);
                 completedTfs++;
                 if (completedTfs === TIMEFRAMES.length) {
                     const json = JSON.stringify(allData, null, 2);
                     const blob = new Blob([json], { type: 'application/json' });
                     resolve(blob);
                 }
             };
             req.onerror = (e) => reject(e);
        });
    });
};

export const exportFullDatabase = async (): Promise<Blob> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_CANDLES], 'readonly');
        const store = tx.objectStore(STORE_CANDLES);
        const req = store.getAll();
        req.onsuccess = () => {
             const json = JSON.stringify(req.result, null, 2);
             const blob = new Blob([json], { type: 'application/json' });
             resolve(blob);
        };
        req.onerror = (e) => reject(e);
    });
};

export const getSetting = async (key: string) => {
    try {
        const db = await openDB();
        return new Promise(res => {
            const req = db.transaction(STORE_SETTINGS).objectStore(STORE_SETTINGS).get(key);
            req.onsuccess = () => res(req.result?.value ?? null);
            req.onerror = () => res(null);
        });
    } catch (e) { return null; }
};

export const setSetting = async (key: string, value: any) => {
    const db = await openDB();
    return new Promise<void>((res, rej) => {
        const tx = db.transaction(STORE_SETTINGS, 'readwrite');
        tx.objectStore(STORE_SETTINGS).put({ key, value });
        tx.oncomplete = () => res();
        tx.onerror = () => rej();
    });
};

export const getSyncStatus = async (symbol: string, timeframe: Timeframe): Promise<{ lastSync: number, status: string } | null> => {
    try {
        const db = await openDB();
        return new Promise((resolve) => {
            if (!db.objectStoreNames.contains(STORE_SYNC_STATUS)) { resolve(null); return; }
            const tx = db.transaction([STORE_SYNC_STATUS], 'readonly');
            const store = tx.objectStore(STORE_SYNC_STATUS);
            const req = store.get(`${symbol}-${timeframe}`);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => resolve(null);
        });
    } catch (e) { return null; }
};

export const updateSyncStatus = async (symbol: string, timeframe: Timeframe, timestamp: number, status: string): Promise<void> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_SYNC_STATUS], 'readwrite');
        const store = tx.objectStore(STORE_SYNC_STATUS);
        const req = store.put({ id: `${symbol}-${timeframe}`, symbol, timeframe, lastSync: timestamp, status });
        req.onsuccess = () => resolve();
        req.onerror = (e) => reject(req.error);
    });
};