import { ProviderConfig, DataProvider, OHLC, AssetCategory } from '../types';
import { DATA_PROVIDERS } from '../constants';
import { getCustomProvidersDB } from './dbService'; // Import for custom providers

/**
 * Simulates a backend endpoint `/api/providers/available`
 * This function filters pre-defined providers to only include 'free' ones,
 * and merges them with user-added custom providers from IndexedDB.
 * It also simulates an 'alive'/'inactive' status.
 * 
 * @param globalApiKey - The global API key from the frontend (used for TwelveData in this simulation).
 * @returns A promise that resolves to an array of active ProviderConfig objects.
 */
export const getAvailableProviders = async (globalApiKey: string): Promise<ProviderConfig[]> => {
    await new Promise(resolve => setTimeout(resolve, 300)); // Simulate network delay

    // 1. Process pre-defined providers (whitelist: only free ones)
    const predefinedProviders = DATA_PROVIDERS
        .filter(p => p.free) // Only include free providers
        .map(p => {
            let status: 'alive' | 'inactive' = 'inactive';
            // Simulate 'alive' status based on globalApiKey presence for these free providers
            if (globalApiKey && globalApiKey.trim() !== '') {
                status = 'alive';
            }
            return { ...p, status };
        });

    // 2. Process custom providers from DB
    const customProviders = await getCustomProvidersDB();
    const processedCustomProviders = customProviders.map(p => {
        let status: 'alive' | 'inactive' = 'inactive';
        // For custom providers, consider them 'alive' if they have an API key (if required)
        // or just active by default if no key is supplied, assuming they passed validation when added.
        if (p.apiKey && p.apiKey.trim() !== '') {
             status = 'alive';
        } else if (!p.apiKey) { // If no API key is set for a custom provider, assume it's free/public and active.
            status = 'alive';
        }
        // In a real app, you'd re-test their endpoint.
        return { ...p, status, isCustom: true };
    });

    // Combine and sort: Free first, then custom, then alphabetically by name
    const allAvailable = [...predefinedProviders, ...processedCustomProviders].filter(p => p.status === 'alive');
    
    allAvailable.sort((a, b) => {
        // Custom providers appear after predefined free ones but before any (non-existent now) paid ones
        if (a.isCustom && !b.isCustom) return 1;
        if (!a.isCustom && b.isCustom) return -1;
        return a.name.localeCompare(b.name);
    });

    return allAvailable;
};

/**
 * **CRITICAL SECURITY WARNING**:
 * This function makes a REAL external API call directly from the frontend.
 * In a production environment, this logic MUST be moved to a secure backend server
 * to prevent exposure of the user's API key.
 *
 * Simulates a backend endpoint `POST /api/providers/test`
 * for validating a custom data provider's configuration by making a real API call.
 * 
 * @param providerData - Configuration for the custom provider to test.
 * @returns An object indicating validity, simulated latency, and a message.
 */
export const testCustomProvider = async (providerData: { id: string, name: string, baseUrl: string, testEndpoint: string, apiKey: string, supportedMarkets: AssetCategory[] }): Promise<{ valid: boolean; latency: number; message: string }> => {
    const startTime = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 seconds timeout

    try {
        // Basic validation: Check for essential fields
        if (!providerData.name || !providerData.baseUrl || !providerData.testEndpoint) {
            return { valid: false, latency: Date.now() - startTime, message: 'Missing essential provider configuration (name, base URL, or test endpoint).' };
        }
        if (!providerData.apiKey || providerData.apiKey.trim() === '') {
             return { valid: false, latency: Date.now() - startTime, message: 'API Key is required for this provider.' };
        }

        // URL Normalization: Remove trailing slash from Base and leading slash from Endpoint
        const cleanBase = providerData.baseUrl.replace(/\/$/, '');
        const cleanEndpoint = providerData.testEndpoint.replace(/^\//, '');
        
        let testUrlStr = `${cleanBase}/${cleanEndpoint}`;
        
        // AUTO-INJECT API KEY
        // Most financial APIs (TwelveData, AlphaVantage, etc.) use 'apikey' or 'api_key' query param.
        // We append 'apikey' here to ensure the test passes for the requested provider (TwelveData).
        try {
            const urlObj = new URL(testUrlStr);
            urlObj.searchParams.append('apikey', providerData.apiKey);
            testUrlStr = urlObj.toString();
        } catch (e) {
            return { valid: false, latency: 0, message: 'Invalid URL format constructed. Check Base URL and Endpoint.' };
        }

        console.log(`[Custom Provider Test] Attempting real API call to: ${testUrlStr}`);

        const response = await fetch(testUrlStr, { signal: controller.signal });
        clearTimeout(timeoutId);

        const latency = Date.now() - startTime;

        if (!response.ok) { // Check for HTTP status 200-299
            let errorMessage = `API Test Failed: HTTP Status ${response.status}.`;
            if (response.status === 401 || response.status === 403) {
                errorMessage = 'API Test Failed: Invalid API Key or Unauthorized access (401/403).';
            } else if (response.status === 404) {
                errorMessage = 'API Test Failed: Endpoint not found (404). Check URL path.';
            } else if (response.status === 429) {
                errorMessage = 'API Test Failed: Rate Limit Exceeded (429).';
            } else {
                try {
                    const errorJson = await response.json();
                    errorMessage += ` Message: ${errorJson.message || JSON.stringify(errorJson)}.`;
                } catch (e) {
                    errorMessage += ` Could not parse error response.`;
                }
            }
            return { valid: false, latency, message: errorMessage };
        }

        let jsonResponse;
        try {
            jsonResponse = await response.json();
        } catch (e) {
             return { valid: false, latency, message: 'API Test Failed: Response is not valid JSON.' };
        }
        
        // Basic data format validation (assuming OHLC-like data)
        const isValidFormat = (data: any): boolean => {
            if (!data) return false;
            // TwelveData example: { values: [{ datetime: "...", open: "...", ... }] }
            if (Array.isArray(data.values) && data.values.length > 0 && data.values[0].close !== undefined) return true;
            // Other APIs might return a direct array of OHLC objects
            if (Array.isArray(data) && data.length > 0 && data[0].close !== undefined) return true;
            // Generic Success Object check
            if (data.status === 'ok' || data.success === true) return true;
            // Check for error inside 200 OK (TwelveData sometimes does this)
            if (data.status === 'error') return false;
            
            return false;
        };

        if (isValidFormat(jsonResponse)) {
            return { valid: true, latency, message: 'API Test Successful! Data format looks good.' };
        } else {
            // TwelveData error inside 200 OK check
            if (jsonResponse.status === 'error') {
                 return { valid: false, latency, message: `API Error: ${jsonResponse.message || 'Unknown error'}` };
            }
            return { valid: false, latency, message: 'API Test Successful (200 OK), but data format is unexpected. Check test endpoint response.' };
        }

    } catch (error: any) {
        clearTimeout(timeoutId);
        const latency = Date.now() - startTime;
        
        if (error.name === 'AbortError') {
            return { valid: false, latency, message: 'API Test Failed: Request timed out after 8 seconds.' };
        }
        
        console.error("[Custom Provider Test] Error during API test:", error);
        
        let msg = error.message;
        // Common fetch error for CORS
        if (msg === 'Failed to fetch') {
            msg = 'Network Error / CORS Issue. Ensure the API allows Cross-Origin requests.';
        }
        
        return { valid: false, latency, message: `API Test Failed: ${msg}` };
    }
};


/**
 * Placeholder for provider-specific API call logic.
 * This is crucial for the single-provider logic in dataService.ts.
 * It now handles predefined and custom providers.
 * 
 * **CRITICAL SECURITY WARNING**:
 * This function makes REAL external API calls directly from the frontend.
 * In a production environment, this logic MUST be moved to a secure backend server
 * to prevent exposure of the user's API key.
 */
export const fetchCandlesFromProvider = async (
    providerConfig: ProviderConfig, // Pass full config for custom providers
    symbol: string, 
    interval: string, 
    apiKey: string, // This is the globally active API key, if any
    params: { startDate?: string, endDate?: string, outputSize?: number }
): Promise<{ data: OHLC[], error?: string, provider: DataProvider }> => {
    await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 300)); // Simulate network delay

    const providerId = providerConfig.id;
    // Use custom provider's own key if available, otherwise the global one (for predefined)
    const providerApiKey = providerConfig.isCustom ? providerConfig.apiKey : apiKey; 

    if (!providerApiKey || providerApiKey.trim() === '') {
        return { data: [], error: 'AUTH_ERROR', provider: providerId };
    }

    // Common query parameters
    const queryParams = new URLSearchParams();
    queryParams.append('symbol', symbol);
    queryParams.append('interval', interval);
    queryParams.append('apikey', providerApiKey);
    if (params.startDate) queryParams.append('start_date', params.startDate);
    if (params.endDate) queryParams.append('end_date', params.endDate);
    if (params.outputSize) queryParams.append('outputsize', String(params.outputSize));
    queryParams.append('format', 'JSON');


    let url = '';

    // Simulate different provider responses
    switch (providerId) {
        case 'TwelveData':
            // Real TwelveData fetch
            url = `https://api.twelvedata.com/time_series?${queryParams.toString()}`;
            break;
        
        case 'AlphaVantage':
            // AlphaVantage uses a different API structure and sometimes different params
            // For now, simulate specific behavior for AlphaVantage as a placeholder.
            // In a real app, this would be a real fetch to AlphaVantage's endpoint.
            if (symbol === 'EUR/USD' && interval === '1min') { 
                return { 
                    data: [{time: Date.now() - 3600000, open:1.1, high:1.105, low:1.095, close:1.102, volume:1000}], 
                    provider: providerId 
                };
            }
            return { data: [], error: 'NO_DATA_FOR_ASSET', provider: providerId };

        default:
            // Handle custom providers
            if (providerConfig.isCustom && providerConfig.baseUrl) {
                // Dynamically construct URL for custom provider
                // Normalize URL similarly to test function
                const cleanBase = providerConfig.baseUrl.replace(/\/$/, '');
                // Defaulting to /time_series for now as per FX Replay typical structure
                // But we could make this dynamic in the future.
                url = `${cleanBase}/time_series?${queryParams.toString()}`;
                console.log(`[Custom Provider Fetch] Requesting: ${url}`);
            } else {
                return { data: [], error: 'UNKNOWN_PROVIDER', provider: providerId };
            }
    }

    console.log("[ProviderBackend] Full URL:", url); // Log full URL for inspection

    try {
        const res = await fetch(url);
        const json = await res.json();

        if (json.status === 'error' || json.code === 401 || !res.ok) {
            return { data: [], error: json.message || 'API_ERROR', provider: providerId };
        }
        if (!json.values && !Array.isArray(json)) { // Check for TwelveData's `values` or a direct array
            return { data: [], error: 'NO_DATA_FOUND_OR_UNEXPECTED_FORMAT', provider: providerId };
        }

        const rawData = json.values || json; // Use `values` for TwelveData, or direct array for others

        if (!Array.isArray(rawData) || rawData.length === 0) {
            return { data: [], error: 'NO_DATA_FOUND', provider: providerId };
        }
        
        const data = rawData.map((v: any) => ({
            time: new Date(v.datetime || v.time * 1000).getTime(), // Adjust if custom provider sends unix timestamp
            open: parseFloat(v.open), high: parseFloat(v.high), low: parseFloat(v.low), close: parseFloat(v.close), volume: parseInt(v.volume || '0')
        })).reverse(); // Reverse to get oldest first

        return { data, provider: providerId };

    } catch (e: any) {
        console.error(`[Data Fetch Error - ${providerId}]`, e);
        return { data: [], error: e.message || 'NETWORK_ERROR', provider: providerId };
    }
};