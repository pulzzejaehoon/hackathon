import axios from 'axios';
const INTERACTOR_BASE_URL = (process.env.INTERACTOR_BASE_URL || 'https://console.interactor.com/api/v1').replace(/\/$/, '');
const INTERACTOR_API_KEY = process.env.INTERACTOR_API_KEY;
if (!INTERACTOR_API_KEY) {
    console.error('[IntegrationService] CRITICAL: Missing INTERACTOR_API_KEY. Set it in server/.env');
    console.error('[IntegrationService] Third-party integrations will not work without API key.');
}
// Retry configuration
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 1000; // ms
// Helper function for exponential backoff retry
async function retryWithBackoff(fn, attempts = RETRY_ATTEMPTS, delay = RETRY_DELAY) {
    try {
        return await fn();
    }
    catch (error) {
        if (attempts <= 1) {
            throw error;
        }
        console.log(`[IntegrationService] Retry attempt remaining: ${attempts - 1}, waiting ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return retryWithBackoff(fn, attempts - 1, delay * 2);
    }
}
export class IntegrationService {
    static statusCache = new Map();
    static CACHE_TTL = 60 * 1000; // 1 minute cache
    static integrations = new Map([
        ['googlecalendar', {
                id: 'googlecalendar',
                name: 'Google Calendar',
                description: 'Sync and manage your Google Calendar events',
                interactorConnectorName: 'googlecalendar-v1',
                category: 'calendar',
                icon: '📅'
            }],
        ['gmail', {
                id: 'gmail',
                name: 'Gmail',
                description: 'Access and manage your Gmail emails',
                interactorConnectorName: 'gmail-v1',
                category: 'communication',
                icon: '📧'
            }],
        ['googledrive', {
                id: 'googledrive',
                name: 'Google Drive',
                description: 'Access and manage your Google Drive files',
                interactorConnectorName: 'googledrive-v1',
                category: 'storage',
                icon: '📁'
            }]
    ]);
    static getAvailableIntegrations() {
        return Array.from(this.integrations.values());
    }
    static getIntegration(id) {
        return this.integrations.get(id);
    }
    static async getAuthUrl(integrationId, userEmail) {
        const integration = this.getIntegration(integrationId);
        if (!integration) {
            return { ok: false, error: 'Integration not found' };
        }
        // Validate inputs
        if (!userEmail || !userEmail.includes('@')) {
            return { ok: false, error: 'Valid user email is required' };
        }
        if (!INTERACTOR_API_KEY) {
            return { ok: false, error: 'Interactor API key not configured' };
        }
        try {
            const url = `${INTERACTOR_BASE_URL}/connector/interactor/${integration.interactorConnectorName}/auth-url`;
            const response = await retryWithBackoff(async () => {
                return await axios.get(url, {
                    params: { account: userEmail.toLowerCase().trim() },
                    headers: {
                        'x-api-key': String(INTERACTOR_API_KEY),
                        'Content-Type': 'application/json',
                        'User-Agent': 'AI-Agent-SaaS/1.0'
                    },
                    timeout: 15000,
                    validateStatus: (status) => status < 500 // Don't retry on 4xx errors
                });
            });
            const data = response.data;
            const authUrl = data?.output?.url || data?.url;
            const urlString = typeof data === 'string' ? data : undefined;
            const finalUrl = authUrl || urlString;
            if (!finalUrl) {
                return {
                    ok: false,
                    error: 'Failed to resolve auth URL from Interactor response'
                };
            }
            return { ok: true, authUrl: finalUrl };
        }
        catch (error) {
            console.error(`[IntegrationService] Auth URL error for ${integrationId}:`, error.message);
            return {
                ok: false,
                error: 'Failed to get auth URL from Interactor API'
            };
        }
    }
    static async getStatus(integrationId, userEmail) {
        const integration = this.getIntegration(integrationId);
        if (!integration) {
            return { ok: false, connected: false, error: 'Integration not found' };
        }
        // Validate inputs
        if (!userEmail || !userEmail.includes('@')) {
            return { ok: false, connected: false, error: 'Valid user email is required' };
        }
        if (!INTERACTOR_API_KEY) {
            console.warn(`[IntegrationService] No API key configured for ${integrationId} status check`);
            return { ok: true, connected: false }; // Don't error, just show as disconnected
        }
        // Check cache first
        const cacheKey = `${integrationId}:${userEmail.toLowerCase().trim()}`;
        const cached = this.statusCache.get(cacheKey);
        const now = Date.now();
        if (cached && (now - cached.timestamp) < cached.ttl) {
            console.log(`[IntegrationService] Using cached status for ${integrationId}`);
            return cached.status;
        }
        try {
            let url = '';
            let data = {};
            // Use appropriate API call for each service
            switch (integrationId) {
                case 'googlecalendar':
                    url = `${INTERACTOR_BASE_URL}/connector/interactor/${integration.interactorConnectorName}/action/calendar.calendarList.get/execute`;
                    data = { calendarId: userEmail.toLowerCase().trim() };
                    break;
                case 'gmail':
                    url = `${INTERACTOR_BASE_URL}/connector/interactor/${integration.interactorConnectorName}/action/gmail.users.labels.list/execute`;
                    data = { userId: userEmail.toLowerCase().trim() };
                    break;
                case 'googledrive':
                    url = `${INTERACTOR_BASE_URL}/connector/interactor/${integration.interactorConnectorName}/action/drive.about.get/execute`;
                    data = {};
                    break;
                default:
                    return { ok: true, connected: false };
            }
            const response = await retryWithBackoff(async () => {
                return await axios.post(url, data, {
                    params: { account: userEmail.toLowerCase().trim() },
                    headers: {
                        'x-api-key': String(INTERACTOR_API_KEY),
                        'Content-Type': 'application/json',
                        'User-Agent': 'AI-Agent-SaaS/1.0'
                    },
                    timeout: 8000, // Increased timeout
                    validateStatus: (status) => status < 500 // Don't retry on 4xx errors
                });
            });
            // Check if response indicates authentication/permission issues
            const responseBody = response.data?.body || response.data?.output?.body || response.data;
            if (responseBody?.error) {
                const errorCode = responseBody.error.code;
                const errorStatus = responseBody.error.status;
                // 401 (unauthorized), 403 (forbidden), delegation denied means not connected
                if (errorCode === 401 || errorCode === 403 ||
                    errorStatus === 'UNAUTHENTICATED' || errorStatus === 'PERMISSION_DENIED' ||
                    responseBody.error.message?.includes('Delegation denied')) {
                    console.warn(`[IntegrationService] ${integrationId} not connected - Auth error:`, responseBody.error.message);
                    return { ok: true, connected: false };
                }
            }
            // If we get a successful response (200) with no auth errors, user is connected
            const result = { ok: true, connected: true };
            // Cache the successful result
            this.statusCache.set(cacheKey, {
                status: result,
                timestamp: now,
                ttl: this.CACHE_TTL
            });
            return result;
        }
        catch (error) {
            // If the API call fails, assume not connected
            console.warn(`[IntegrationService] Status check failed for ${integrationId}:`, error.message);
            const result = { ok: true, connected: false };
            // Cache the failed result with shorter TTL
            this.statusCache.set(cacheKey, {
                status: result,
                timestamp: now,
                ttl: this.CACHE_TTL / 2 // 30 seconds for failed attempts
            });
            return result;
        }
    }
    static async disconnect(integrationId, userEmail) {
        const integration = this.getIntegration(integrationId);
        if (!integration) {
            return { ok: false, error: 'Integration not found' };
        }
        try {
            const url = `${INTERACTOR_BASE_URL}/connector/interactor/${integration.interactorConnectorName}/disconnect`;
            const response = await axios.post(url, {}, {
                params: { account: userEmail },
                headers: {
                    'x-api-key': String(INTERACTOR_API_KEY),
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            });
            const data = response.data;
            if (!data.ok && !data.success) {
                throw new Error(data.error || 'Disconnect failed');
            }
            // Clear cache for this user's integration status
            const cacheKey = `${integrationId}:${userEmail.toLowerCase().trim()}`;
            this.statusCache.delete(cacheKey);
            return {
                ok: true,
                message: `${integration.name} disconnected successfully`
            };
        }
        catch (error) {
            console.error(`[IntegrationService] Disconnect error for ${integrationId}:`, error.message);
            return {
                ok: false,
                error: `Failed to disconnect ${integration.name}`
            };
        }
    }
    static async getAllStatuses(userEmail) {
        const integrations = this.getAvailableIntegrations();
        const statuses = await Promise.all(integrations.map(async (integration) => {
            const status = await this.getStatus(integration.id, userEmail);
            return {
                id: integration.id,
                connected: status.connected
            };
        }));
        return statuses;
    }
}
