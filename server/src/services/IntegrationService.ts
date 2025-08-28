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
      interactorConnectorName: 'slack-v1',
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
          url = `${INTERACTOR_BASE_URL}/connector/interactor/${integration.interactorConnectorName}/action/calendar.calendarList.list/execute`;
          data = { minAccessRole: "reader" };
          break;
        case 'gmail':
          url = `${INTERACTOR_BASE_URL}/connector/interactor/${integration.interactorConnectorName}/action/gmail.users.labels.list/execute`;
          data = { userId: "me" };
          break;
        case 'googledrive':
          url = `${INTERACTOR_BASE_URL}/connector/interactor/${integration.interactorConnectorName}/action/drive.about.get/execute`;
          data = {
            fields: "user,storageQuota"
          };
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

      console.log(`[IntegrationService] ${integrationId} status check - HTTP ${response.status}`);
      
      // Check if response indicates authentication/permission issues  
      const responseBody = response.data?.body || response.data?.output?.body || response.data;
      if (responseBody?.error) {
        const errorCode = responseBody.error.code;
        const errorStatus = responseBody.error.status;
        
        console.log(`[IntegrationService] ${integrationId} API error - Code: ${errorCode}, Status: ${errorStatus}`);
        
        // 401 (unauthorized), 403 (forbidden), delegation denied means not connected
        if (errorCode === 401 || errorCode === 403 || 
            errorStatus === 'UNAUTHENTICATED' || errorStatus === 'PERMISSION_DENIED' ||
            responseBody.error.message?.includes('Delegation denied')) {
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
      const result = { ok: true, connected: true, account: userEmail };
      
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
      console.log(`[IntegrationService] Disconnecting ${integrationId} for ${userEmail} (local cache clear only)`);
      
      // Clear cache for this user's integration status to force reconnection
      const cacheKey = `${integrationId}:${userEmail.toLowerCase().trim()}`;
      this.statusCache.delete(cacheKey);
      
      // NOTE: We're not calling Interactor's revoke API as it may not exist or is undocumented.
      // Users will need to manually revoke access through their Google/service settings if needed.
      // The local cache clearing will require them to reconnect via OAuth.
      
      return { 
        ok: true, 
        message: `${integration.name} disconnected locally. You may need to revoke access in your account settings for complete disconnection.` 
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
}