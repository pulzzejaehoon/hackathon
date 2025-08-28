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

    // Check for error status codes in response body (Interactor API pattern)
    // Only treat as error if status_code exists AND is >= 400
    if (responseData && responseData.status_code && responseData.status_code >= 400) {
      const errorMessage = responseData.body?.error?.message || 
                          responseData.body?.error || 
                          `HTTP ${responseData.status_code} error`;
      console.error(`[Interactor] API returned error status ${responseData.status_code}:`, errorMessage);
      return { 
        success: false, 
        error: errorMessage,
        raw: responseData
      };
    }

    // Interactor API responses structure handling
    // If no error status code, treat as success
    if (responseData && (responseData.success !== false)) {
      return { 
        success: true, 
        output: responseData,
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
