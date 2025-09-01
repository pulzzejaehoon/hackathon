import axios from 'axios';
import { IntegrationConfig, AuthUrlResponse, StatusResponse, DisconnectResponse } from '../types/integrations.js';

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
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  attempts = RETRY_ATTEMPTS,
  delay = RETRY_DELAY
): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    if (attempts <= 1) {
      throw error;
    }
    
    console.log(`[IntegrationService] Retry attempt remaining: ${attempts - 1}, waiting ${delay}ms`);
    await new Promise(resolve => setTimeout(resolve, delay));
    return retryWithBackoff(fn, attempts - 1, delay * 2);
  }
}

// Status cache to avoid repeated API calls
interface CachedStatus {
  status: StatusResponse;
  timestamp: number;
  ttl: number; // time to live in milliseconds
}

export class IntegrationService {
  private static statusCache = new Map<string, CachedStatus>();
  private static readonly CACHE_TTL = 60 * 1000; // 1 minute cache
  
  private static integrations: Map<string, IntegrationConfig> = new Map([
    ['googlecalendar', {
      id: 'googlecalendar',
      name: 'Google Calendar',
      description: 'Sync and manage your Google Calendar events',
      interactorConnectorName: 'googlecalendar-v1',
      category: 'calendar',
      icon: '/logo001.svg'
    }],
    ['gmail', {
      id: 'gmail',
      name: 'Gmail',
      description: 'Access and manage your Gmail emails',
      interactorConnectorName: 'gmail-v1',
      category: 'communication',
      icon: '/logo002.svg'
    }],
    ['googledrive', {
      id: 'googledrive',
      name: 'Google Drive',
      description: 'Access and manage your Google Drive files',
      interactorConnectorName: 'googledrive-v1',
      category: 'storage',
      icon: '/logo003.svg'
    }],
    ['slack', {
      id: 'slack',
      name: 'Slack',
      description: 'Connect with your team workspace',
      interactorConnectorName: 'slack',
      category: 'communication',
      icon: '/slack_logo.svg'
    }],
    ['teams', {
      id: 'teams',
      name: 'Microsoft Teams',
      description: 'Collaborate with Microsoft Teams',
      interactorConnectorName: 'teams-v1',
      category: 'communication',
      icon: '/microsoft-teams_logo.svg'
    }],
    ['zoom', {
      id: 'zoom',
      name: 'Zoom',
      description: 'Video conferencing and meetings',
      interactorConnectorName: 'zoom-v1',
      category: 'communication',
      icon: '/zoom_logo.png'
    }],
    ['github', {
      id: 'github',
      name: 'GitHub',
      description: 'Code repository and collaboration',
      interactorConnectorName: 'github-v1',
      category: 'development',
      icon: '/github_logo.png'
    }],
    ['gitlab', {
      id: 'gitlab',
      name: 'GitLab',
      description: 'DevOps platform and repository',
      interactorConnectorName: 'gitlab-v1',
      category: 'development',
      icon: '/gitlab_logo.png'
    }],
    ['jira', {
      id: 'jira',
      name: 'Jira',
      description: 'Project management and issue tracking',
      interactorConnectorName: 'jira-v1',
      category: 'development',
      icon: '/jira_logo.svg'
    }]
  ]);

  static getAvailableIntegrations(): IntegrationConfig[] {
    return Array.from(this.integrations.values());
  }

  static getIntegration(id: string): IntegrationConfig | undefined {
    return this.integrations.get(id);
  }

  static async getAuthUrl(integrationId: string, userEmail: string): Promise<AuthUrlResponse> {
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
      
      // For Slack and Zoom, add redirect_uri to callback to our server
      const params: any = { account: userEmail.toLowerCase().trim() };
      if (integrationId === 'slack' || integrationId === 'zoom') {
        const backendOrigin = process.env.BACKEND_ORIGIN || 'http://localhost:3001';
        if (integrationId === 'slack') {
          params.redirect_uri = `${backendOrigin}/api/integrations/${integrationId}/oauth-callback`;
        } else if (integrationId === 'zoom') {
          params.redirect_uri = `${backendOrigin}/api/integrations/${integrationId}/oauth-callback`;
        }
      }
      
      const response = await retryWithBackoff(async () => {
        return await axios.get(url, {
          params,
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
    } catch (error: any) {
      console.error(`[IntegrationService] Auth URL error for ${integrationId}:`, error.message);
      return { 
        ok: false, 
        error: 'Failed to get auth URL from Interactor API' 
      };
    }
  }

  static async getStatus(integrationId: string, userEmail: string): Promise<StatusResponse> {
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

    // Check integration status normally  
    const cacheKey = `${integrationId}:${userEmail.toLowerCase().trim()}`;
    const now = Date.now();
    
    // Use cache if available and not expired
    const cached = this.statusCache.get(cacheKey);
    if (cached && (now - cached.timestamp) < cached.ttl) {
      console.log(`[IntegrationService] Using cached status for ${integrationId}: ${cached.status.connected}`);
      return cached.status;
    }

    try {
      let url = '';
      let data = {};

      // Use appropriate API call for each service
      switch (integrationId) {
        case 'googlecalendar':
          // Use calendar.calendarList.list to get all calendars including primary
          url = `${INTERACTOR_BASE_URL}/connector/interactor/${integration.interactorConnectorName}/action/calendar.calendarList.list/execute`;
          data = { minAccessRole: "reader" };
          break;
        case 'gmail':
          url = `${INTERACTOR_BASE_URL}/connector/interactor/${integration.interactorConnectorName}/action/gmail.users.getProfile/execute`;
          data = { userId: "me" };
          break;
        case 'googledrive':
          url = `${INTERACTOR_BASE_URL}/connector/interactor/${integration.interactorConnectorName}/action/drive.about.get/execute`;
          data = {
            fields: "user,storageQuota"
          };
          break;
        case 'slack':
          // Try actual Slack API call to check connection - use auth.test which is more reliable for status check
          url = `${INTERACTOR_BASE_URL}/connector/interactor/${integration.interactorConnectorName}/action/auth.test/execute`;
          data = {};
          break;
        case 'zoom':
          // Try actual Zoom API call to check connection  
          url = `${INTERACTOR_BASE_URL}/connector/interactor/${integration.interactorConnectorName}/action/user.get/execute`;
          data = {};
          break;
        case 'teams':
          // Try actual Microsoft Teams API call to check connection
          url = `${INTERACTOR_BASE_URL}/connector/interactor/${integration.interactorConnectorName}/action/me/execute`;
          data = {};
          break;
        case 'github':
          // Try actual GitHub API call to check connection
          url = `${INTERACTOR_BASE_URL}/connector/interactor/${integration.interactorConnectorName}/action/user.get/execute`;
          data = {};
          break;
        case 'gitlab':
          // Try actual GitLab API call to check connection
          url = `${INTERACTOR_BASE_URL}/connector/interactor/${integration.interactorConnectorName}/action/user.get/execute`;
          data = {};
          break;
        case 'jira':
          // Try actual Jira API call to check connection
          url = `${INTERACTOR_BASE_URL}/connector/interactor/${integration.interactorConnectorName}/action/myself.get/execute`;
          data = {};
          break;
        default:
          // Unknown service - return disconnected
          console.log(`[IntegrationService] Unknown integration: ${integrationId}`);
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

      console.log(`[IntegrationService] ${integrationId} status check - HTTP ${response.status}`);
      
      // Check HTTP status codes first
      if (response.status === 401 || response.status === 403 || response.status === 404) {
        console.log(`[IntegrationService] ${integrationId} not connected - HTTP ${response.status}`);
        const result = { ok: true, connected: false };
        
        // Cache the failed result
        this.statusCache.set(cacheKey, {
          status: result,
          timestamp: now,
          ttl: this.CACHE_TTL / 4 // 15 seconds for failed attempts
        });
        
        return result;
      }
      
      // Check if response indicates authentication/permission issues  
      const responseBody = response.data?.body || response.data?.output?.body || response.data;
      if (responseBody?.error) {
        const errorCode = responseBody.error.code;
        const errorStatus = responseBody.error.status;
        
        console.log(`[IntegrationService] ${integrationId} API error - Code: ${errorCode}, Status: ${errorStatus}`);
        
        // 401 (unauthorized), 403 (forbidden), 404 (not found), delegation denied, missing auth credential means not connected
        if (errorCode === 401 || errorCode === 403 || errorCode === 404 ||
            errorStatus === 'UNAUTHENTICATED' || errorStatus === 'PERMISSION_DENIED' ||
            responseBody.error.message?.includes('Delegation denied') ||
            responseBody.error.message?.includes('missing required authentication credential') ||
            responseBody.error.message?.includes('Expected OAuth 2 access token') ||
            responseBody.error.includes('Action') && responseBody.error.includes('not found')) {
          console.log(`[IntegrationService] ${integrationId} not connected - Auth error`);
          
          const result = { ok: true, connected: false };
          
          // Cache the failed result
          this.statusCache.set(cacheKey, {
            status: result,
            timestamp: now,
            ttl: this.CACHE_TTL / 4 // 15 seconds for failed attempts
          });
          
          return result;
        }
      }

      // If we get a successful response (200) with no auth errors, user is connected
      console.log(`[IntegrationService] ${integrationId} connected successfully`);
      
      // Extract actual connected account from API response
      let connectedAccount = userEmail; // fallback to user email
      try {
        const responseBody = response.data?.body || response.data?.output?.body || response.data;
        console.log(`[IntegrationService] API response for ${integrationId}:`, JSON.stringify(responseBody, null, 2));
        
        // Extract account info based on service type
        switch (integrationId) {
          case 'googlecalendar':
            // Google Calendar calendarList.list returns items array, find primary calendar
            if (responseBody?.items && Array.isArray(responseBody.items)) {
              const primaryCalendar = responseBody.items.find((item: any) => item.primary === true);
              if (primaryCalendar && primaryCalendar.id && primaryCalendar.id.includes('@')) {
                connectedAccount = primaryCalendar.id;
              } else if (primaryCalendar && primaryCalendar.summary && primaryCalendar.summary.includes('@')) {
                connectedAccount = primaryCalendar.summary;
              }
            }
            break;
            
          case 'googledrive':
            // Google Drive returns user info in various places
            if (responseBody?.user?.emailAddress) {
              connectedAccount = responseBody.user.emailAddress;
            } else if (responseBody?.emailAddress) {
              connectedAccount = responseBody.emailAddress;
            }
            break;
            
          case 'gmail':
            // Gmail getProfile API returns emailAddress directly
            if (responseBody?.emailAddress) {
              connectedAccount = responseBody.emailAddress;
            }
            break;
            
        }
      } catch (error) {
        console.warn(`[IntegrationService] Failed to extract account info for ${integrationId}:`, error);
      }
      
      console.log(`[IntegrationService] Account extracted for ${integrationId}: ${connectedAccount} (fallback: ${userEmail})`);
      const result = { ok: true, connected: true, account: connectedAccount };
      
      // Cache the successful result
      this.statusCache.set(cacheKey, {
        status: result,
        timestamp: now,
        ttl: this.CACHE_TTL
      });
      
      return result;
    } catch (error: any) {
      // If the API call fails, assume not connected
      console.log(`[IntegrationService] ${integrationId} status check failed: ${error.message}`);
      
      const result = { ok: true, connected: false };
      
      // Cache the failed result with shorter TTL
      this.statusCache.set(cacheKey, {
        status: result,
        timestamp: now,
        ttl: this.CACHE_TTL / 4 // 15 seconds for failed attempts
      });
      
      return result;
    }
  }

  static async disconnect(integrationId: string, userEmail: string): Promise<DisconnectResponse> {
    const integration = this.getIntegration(integrationId);
    if (!integration) {
      return { ok: false, error: 'Integration not found' };
    }

    try {
      console.log(`[IntegrationService] Disconnecting ${integrationId} for ${userEmail}`);
      
      // Get current connection status to find actual connected account
      const currentStatus = await this.getStatus(integrationId, userEmail);
      const actualConnectedAccount = currentStatus.account || userEmail;
      
      console.log(`[IntegrationService] Using actual connected account for revoke: ${actualConnectedAccount}`);
      
      // Clear cache for this user's integration status - multiple approaches to ensure complete clearing
      const cacheKey = `${integrationId}:${userEmail.toLowerCase().trim()}`;
      const actualAccountCacheKey = `${integrationId}:${actualConnectedAccount.toLowerCase().trim()}`;
      
      // Delete both user email and actual connected account cache keys
      this.statusCache.delete(cacheKey);
      if (actualAccountCacheKey !== cacheKey) {
        this.statusCache.delete(actualAccountCacheKey);
        console.log(`[IntegrationService] Also cleared cache for actual account: ${actualAccountCacheKey}`);
      }
      
      console.log(`[IntegrationService] Cleared cache keys for disconnect: ${cacheKey}`);
      
      // Try to revoke access via Interactor API
      if (INTERACTOR_API_KEY) {
        try {
          // Different revoke endpoints per service
          let revokeUrl = '';
          switch (integrationId) {
            case 'googlecalendar':
            case 'gmail':
            case 'googledrive':
              revokeUrl = `${INTERACTOR_BASE_URL}/connector/interactor/${integration.interactorConnectorName}/revoke`;
              break;
            default:
              // For services without specific revoke endpoint, just clear cache
              break;
          }
          
          if (revokeUrl) {
            const response = await retryWithBackoff(async () => {
              return await axios.post(revokeUrl, {}, {
                params: { account: actualConnectedAccount.toLowerCase().trim() },
                headers: {
                  'x-api-key': String(INTERACTOR_API_KEY),
                  'Content-Type': 'application/json',
                  'User-Agent': 'AI-Agent-SaaS/1.0'
                },
                timeout: 10000,
                validateStatus: (status) => status < 500 // Don't retry on 4xx errors
              });
            });
            
            console.log(`[IntegrationService] ${integrationId} revoke API call - HTTP ${response.status}`);
          }
        } catch (revokeError: any) {
          console.warn(`[IntegrationService] Failed to revoke ${integrationId} via API:`, revokeError.message);
          // Continue even if revoke fails - local cache clear is enough for UI
        }
      }
      
      // Don't cache disconnected status for too long to allow re-authentication
      // Just clear the cache completely instead of caching disconnected state
      console.log(`[IntegrationService] Not caching disconnected state to allow immediate re-authentication`);
      
      return { 
        ok: true, 
        message: `${integration.name} disconnected successfully. You may need to revoke access in your account settings for complete disconnection.` 
      };
    } catch (error: any) {
      console.error(`[IntegrationService] Disconnect error for ${integrationId}:`, error.message);
      return { 
        ok: false, 
        error: `Failed to disconnect ${integration.name}` 
      };
    }
  }

  static async getAllStatuses(userEmail: string): Promise<Array<{id: string, connected: boolean}>> {
    const integrations = this.getAvailableIntegrations();
    const statuses = await Promise.all(
      integrations.map(async (integration) => {
        const status = await this.getStatus(integration.id, userEmail);
        return {
          id: integration.id,
          connected: status.connected
        };
      })
    );
    return statuses;
  }

  // Clear all cached statuses for testing
  static clearAllCache(): void {
    console.log('[IntegrationService] Clearing all cache entries');
    this.statusCache.clear();
  }

  // Force disconnect all services for a user
  static async forceDisconnectAll(userEmail: string): Promise<void> {
    console.log(`[IntegrationService] Force disconnecting all services for ${userEmail}`);
    const integrations = this.getAvailableIntegrations();
    
    for (const integration of integrations) {
      const cacheKey = `${integration.id}:${userEmail.toLowerCase().trim()}`;
      
      // Cache as disconnected with very long TTL to prevent auto-reconnection  
      this.statusCache.set(cacheKey, {
        status: { ok: true, connected: false },
        timestamp: Date.now(),
        ttl: this.CACHE_TTL * 60 // 60 minutes to ensure disconnect persists
      });
      
      console.log(`[IntegrationService] Force cached ${integration.id} as disconnected with key: ${cacheKey}`);
    }
  }

  // Clear cache for specific user account across all integrations (for account switching)
  static clearUserCache(userEmail: string): void {
    console.log(`[IntegrationService] Clearing cache for user: ${userEmail}`);
    const integrations = this.getAvailableIntegrations();
    
    for (const integration of integrations) {
      const cacheKey = `${integration.id}:${userEmail.toLowerCase().trim()}`;
      if (this.statusCache.has(cacheKey)) {
        this.statusCache.delete(cacheKey);
        console.log(`[IntegrationService] Cleared cache for ${integration.id}:${userEmail}`);
      }
    }
  }

  // Clear cache for specific integration and user (for account switching within a service)
  static clearIntegrationUserCache(integrationId: string, userEmail: string): void {
    const cacheKey = `${integrationId}:${userEmail.toLowerCase().trim()}`;
    if (this.statusCache.has(cacheKey)) {
      this.statusCache.delete(cacheKey);
      console.log(`[IntegrationService] Cleared cache for ${integrationId}:${userEmail}`);
    }
  }

  // Debug method to inspect cache
  static getCacheState(userEmail: string): any {
    const integrations = this.getAvailableIntegrations();
    const cacheState: any = {};
    
    for (const integration of integrations) {
      const cacheKey = `${integration.id}:${userEmail.toLowerCase().trim()}`;
      const cached = this.statusCache.get(cacheKey);
      cacheState[integration.id] = cached || null;
    }
    
    return cacheState;
  }
}