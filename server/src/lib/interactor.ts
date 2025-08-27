// server/src/lib/interactor.ts (optional utility)
import axios from 'axios';

const BASE = (process.env.INTERACTOR_BASE_URL || 'https://console.interactor.com/api/v1').replace(/\/$/, '');
const KEY = process.env.INTERACTOR_API_KEY;

if (!KEY) {
  console.warn('[Interactor] Missing INTERACTOR_API_KEY');
}

export async function interactorGet(path: string, params?: Record<string, any>) {
  const url = `${BASE}${path}`;
  const { data } = await axios.get(url, {
    params,
    headers: { 'x-api-key': String(KEY), 'Content-Type': 'application/json' },
    timeout: 30000
  });
  return data;
}

export async function callInteractorApi(options: { 
  account: string, 
  connector: string, 
  action: string, 
  data: Record<string, any> 
}) {
  try {
    const { account, connector, action, data } = options;
    
    // Correct Interactor endpoint format: /connector/interactor/{connector}/action/{action}/execute
    const path = `/connector/interactor/${connector}/action/${action}/execute`;
    const url = `${BASE}${path}?account=${encodeURIComponent(account)}`;

    console.log(`[Interactor] Calling API:`, {
      url,
      connector,
      action,
      dataKeys: Object.keys(data)
    });

    const response = await axios.post(url, data, {
      headers: { 'x-api-key': String(KEY), 'Content-Type': 'application/json' },
      timeout: 30000
    });

    const responseData = response.data;

    // Interactor API responses structure handling
    if (responseData && (responseData.success !== false)) {
      return { 
        success: true, 
        output: responseData.output || responseData.body || responseData,
        raw: responseData 
      };
    } else {
      return { 
        success: false, 
        error: responseData.error || responseData.message || 'Unknown Interactor API error',
        raw: responseData
      };
    }
  } catch (e: any) {
    const errorMsg = e.response?.data?.error || e.message || 'Interactor API call failed';
    console.error(`[Interactor] API call failed for ${options.connector}/${options.action}:`, errorMsg);
    return { success: false, error: errorMsg };
  }
}
