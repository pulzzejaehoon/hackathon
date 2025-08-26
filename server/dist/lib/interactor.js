// server/src/lib/interactor.ts (optional utility)
import axios from 'axios';
const BASE = (process.env.INTERACTOR_BASE_URL || 'https://console.interactor.com/api/v1').replace(/\/$/, '');
const KEY = process.env.INTERACTOR_API_KEY;
if (!KEY) {
    console.warn('[Interactor] Missing INTERACTOR_API_KEY');
}
export async function interactorGet(path, params) {
    const url = `${BASE}${path}`;
    const { data } = await axios.get(url, {
        params,
        headers: { 'x-api-key': String(KEY), 'Content-Type': 'application/json' },
        timeout: 30000
    });
    return data;
}
export async function callInteractorApi(options) {
    try {
        const { account, action, data } = options;
        // New execute endpoint format: /connector/interactor/{connector}/action/{action}/execute
        const path = `/connector/interactor/${action}/execute`;
        const url = `${BASE}${path}?account=${encodeURIComponent(account)}`;
        const response = await axios.post(url, data, {
            headers: { 'x-api-key': String(KEY), 'Content-Type': 'application/json' },
            timeout: 30000
        });
        const responseData = response.data;
        // Interactor API responses often have a 'success' and 'output' field
        if (responseData && (responseData.success !== false)) {
            return { success: true, output: responseData.output || responseData };
        }
        else {
            return { success: false, error: responseData.error || 'Unknown Interactor API error' };
        }
    }
    catch (e) {
        const errorMsg = e.response?.data?.error || e.message || 'Interactor API call failed';
        console.error(`[Interactor] API call failed for ${options.action}:`, errorMsg);
        return { success: false, error: errorMsg };
    }
}
