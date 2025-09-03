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
    ['google-calendar', {
      id: 'google-calendar',
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
    ['google-drive', {
      id: 'google-drive',
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
      interactorConnectorName: 'msteamsplus',
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
        case 'google-calendar':
          // Check if manually disconnected first
          const calendarDisconnectedKey = `google-calendar_disconnected:${userEmail.toLowerCase().trim()}`;
          const calendarDisconnected = this.statusCache.get(calendarDisconnectedKey);
          if (calendarDisconnected && (now - calendarDisconnected.timestamp) < calendarDisconnected.ttl) {
            console.log(`[IntegrationService] Google Calendar manually disconnected - returning false`);
            return { ok: true, connected: false };
          }
          
          // Use calendar.calendarList.list to get all calendars including primary
          url = `${INTERACTOR_BASE_URL}/connector/interactor/${integration.interactorConnectorName}/action/calendar.calendarList.list/execute`;
          data = { minAccessRole: "reader" };
          break;
        case 'gmail':
          // Check if manually disconnected first
          const gmailDisconnectedKey = `gmail_disconnected:${userEmail.toLowerCase().trim()}`;
          const gmailDisconnected = this.statusCache.get(gmailDisconnectedKey);
          if (gmailDisconnected && (now - gmailDisconnected.timestamp) < gmailDisconnected.ttl) {
            console.log(`[IntegrationService] Gmail manually disconnected - returning false`);
            return { ok: true, connected: false };
          }
          
          url = `${INTERACTOR_BASE_URL}/connector/interactor/${integration.interactorConnectorName}/action/gmail.users.getProfile/execute`;
          data = { userId: "me" };
          break;
        case 'google-drive':
          // Check if manually disconnected first
          const driveDisconnectedKey = `google-drive_disconnected:${userEmail.toLowerCase().trim()}`;
          const driveDisconnected = this.statusCache.get(driveDisconnectedKey);
          if (driveDisconnected && (now - driveDisconnected.timestamp) < driveDisconnected.ttl) {
            console.log(`[IntegrationService] Google Drive manually disconnected - returning false`);
            return { ok: true, connected: false };
          }
          
          url = `${INTERACTOR_BASE_URL}/connector/interactor/${integration.interactorConnectorName}/action/drive.about.get/execute`;
          data = {
            fields: "user,storageQuota"
          };
          break;
        case 'slack':
          // For Slack, check if user has manually disconnected first
          const slackDisconnectedKey = `slack_disconnected:${userEmail.toLowerCase().trim()}`;
          const slackDisconnected = this.statusCache.get(slackDisconnectedKey);
          if (slackDisconnected && (now - slackDisconnected.timestamp) < slackDisconnected.ttl) {
            console.log(`[IntegrationService] Slack manually disconnected - returning false`);
            return { ok: true, connected: false };
          }
          
          // Slack connector only supports message.send reliably, so test actual connection
          console.log(`[IntegrationService] Slack status check - testing with actual message.send API`);
          url = `${INTERACTOR_BASE_URL}/connector/interactor/${integration.interactorConnectorName}/action/message.send/execute`;
          data = {
            channel: "#test-connection-check", 
            text: "Connection test - please ignore",
            dry_run: true  // If dry_run is supported, won't actually send
          };
          break;
        case 'zoom':
          // For Zoom, check if user has manually disconnected first
          const zoomDisconnectedKey = `zoom_disconnected:${userEmail.toLowerCase().trim()}`;
          const zoomDisconnected = this.statusCache.get(zoomDisconnectedKey);
          if (zoomDisconnected && (now - zoomDisconnected.timestamp) < zoomDisconnected.ttl) {
            console.log(`[IntegrationService] Zoom manually disconnected - returning false`);
            return { ok: true, connected: false };
          }
          
          // Try actual Zoom API call to check connection  
          url = `${INTERACTOR_BASE_URL}/connector/interactor/${integration.interactorConnectorName}/action/user.get/execute`;
          data = {};
          break;
        case 'teams':
          // Check if Teams was manually disconnected - check both possible accounts
          const teamsAccount = 'interactor@interactorservice.onmicrosoft.com';
          const teamsDisconnectKey1 = `teams_disconnected:${teamsAccount}`;
          const teamsDisconnectKey2 = `teams_disconnected:${userEmail}`;
          
          const teamsDisconnected1 = this.statusCache.get(teamsDisconnectKey1);
          const teamsDisconnected2 = this.statusCache.get(teamsDisconnectKey2);
          
          if ((teamsDisconnected1?.status as any)?.disconnected || (teamsDisconnected2?.status as any)?.disconnected) {
            console.log(`[IntegrationService] Teams manually disconnected - returning false`);
            return { ok: true, connected: false };
          }
          
          // Try actual Teams API call to check connection with real account
          console.log(`[IntegrationService] Teams status check - testing with channel.list API`);
          url = `${INTERACTOR_BASE_URL}/connector/interactor/${integration.interactorConnectorName}/action/channel.list/execute`;
          data = {
            "team": {
              "description": "Test-team",
              "id": "11461220-3d6a-450c-912f-49fbe09be2f5", 
              "name": "Test-team"
            }
          };
          console.log(`[IntegrationService] Teams using account: ${teamsAccount}`);
          
          try {
            const teamsResponse = await retryWithBackoff(async () => {
              return await axios.post(url, data, {
                params: { account: teamsAccount },
                headers: {
                  'x-api-key': INTERACTOR_API_KEY,
                  'Content-Type': 'application/json'
                },
                timeout: 30000
              });
            });

            console.log(`[IntegrationService] Teams API response:`, teamsResponse.data);
            return {
              ok: true,
              connected: true,
              account: teamsAccount
            };
          } catch (error: any) {
            console.log(`[IntegrationService] Teams API error:`, error.response?.status || error.message);
            return {
              ok: true,
              connected: false
            };
          }
          break;
        case 'github':
          // Check if manually disconnected first
          const githubDisconnectedKey = `github_disconnected:${userEmail.toLowerCase().trim()}`;
          const githubDisconnected = this.statusCache.get(githubDisconnectedKey);
          if (githubDisconnected && (now - githubDisconnected.timestamp) < githubDisconnected.ttl) {
            console.log(`[IntegrationService] GitHub manually disconnected - returning false`);
            return { ok: true, connected: false };
          }
          
          // Try actual GitHub API call to check connection
          url = `${INTERACTOR_BASE_URL}/connector/interactor/${integration.interactorConnectorName}/action/user.get/execute`;
          data = {};
          break;
        case 'gitlab':
          // Check if manually disconnected first
          const gitlabDisconnectedKey = `gitlab_disconnected:${userEmail.toLowerCase().trim()}`;
          const gitlabDisconnected = this.statusCache.get(gitlabDisconnectedKey);
          if (gitlabDisconnected && (now - gitlabDisconnected.timestamp) < gitlabDisconnected.ttl) {
            console.log(`[IntegrationService] GitLab manually disconnected - returning false`);
            return { ok: true, connected: false };
          }
          
          // Try actual GitLab API call to check connection
          url = `${INTERACTOR_BASE_URL}/connector/interactor/${integration.interactorConnectorName}/action/user.get/execute`;
          data = {};
          break;
        case 'jira':
          // Check if manually disconnected first
          const jiraDisconnectedKey = `jira_disconnected:${userEmail.toLowerCase().trim()}`;
          const jiraDisconnected = this.statusCache.get(jiraDisconnectedKey);
          if (jiraDisconnected && (now - jiraDisconnected.timestamp) < jiraDisconnected.ttl) {
            console.log(`[IntegrationService] Jira manually disconnected - returning false`);
            return { ok: true, connected: false };
          }
          
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

      // Extract actual connected account and validate the response has real data
      let connectedAccount = userEmail; // fallback to user email
      let hasValidData = false;
      
      try {
        // Extract the actual data from the response
        const responseBody = response.data?.body || response.data?.output?.body || response.data?.output || response.data;
        console.log(`[IntegrationService] API response for ${integrationId}:`, JSON.stringify(responseBody, null, 2));
        
        // Validate response has actual data based on service type
        switch (integrationId) {
          case 'google-calendar':
            // Google Calendar calendarList.list returns items array, find primary calendar
            if (responseBody?.items && Array.isArray(responseBody.items) && responseBody.items.length > 0) {
              hasValidData = true;
              const primaryCalendar = responseBody.items.find((item: any) => item.primary === true);
              if (primaryCalendar && primaryCalendar.id && primaryCalendar.id.includes('@')) {
                connectedAccount = primaryCalendar.id;
              } else if (primaryCalendar && primaryCalendar.summary && primaryCalendar.summary.includes('@')) {
                connectedAccount = primaryCalendar.summary;
              }
            }
            break;
            
          case 'google-drive':
            // Google Drive returns user info in various places
            if (responseBody?.user?.emailAddress) {
              hasValidData = true;
              connectedAccount = responseBody.user.emailAddress;
            } else if (responseBody?.emailAddress) {
              hasValidData = true;
              connectedAccount = responseBody.emailAddress;
            }
            break;
            
          case 'gmail':
            // Gmail getProfile API returns emailAddress directly
            if (responseBody?.emailAddress) {
              hasValidData = true;
              connectedAccount = responseBody.emailAddress;
            }
            break;
            
        }
        
        // For other services, assume they have valid data if no specific checks
        if (!hasValidData) {
          if (['slack', 'teams', 'zoom', 'github', 'gitlab', 'jira'].includes(integrationId)) {
            hasValidData = true; // Assume valid if HTTP 200 with no auth errors
          }
        }
        
      } catch (error) {
        console.warn(`[IntegrationService] Failed to extract account info for ${integrationId}:`, error);
      }
      
      // Only consider connected if we have valid data
      if (!hasValidData) {
        console.log(`[IntegrationService] ${integrationId} HTTP 200 but no valid data - not connected`);
        const result = { ok: true, connected: false };
        
        // Cache the failed result for a shorter time
        this.statusCache.set(cacheKey, {
          status: result,
          timestamp: now,
          ttl: this.CACHE_TTL / 4 // 15 seconds for failed attempts
        });
        
        return result;
      }
      
      console.log(`[IntegrationService] ${integrationId} connected successfully with valid data`);
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
            case 'google-calendar':
              // Gmail/Calendar revoke API returns 404, so set disconnect flag
              const calendarDisconnectedKey = `google-calendar_disconnected:${userEmail.toLowerCase().trim()}`;
              this.statusCache.set(calendarDisconnectedKey, {
                status: { ok: true, connected: false },
                timestamp: Date.now(),
                ttl: this.CACHE_TTL * 60 // 1 hour - long enough to show as disconnected
              });
              console.log(`[IntegrationService] Set Google Calendar disconnect flag: ${calendarDisconnectedKey}`);
              
              // Also try the revoke API in case it works in the future
              revokeUrl = `${INTERACTOR_BASE_URL}/connector/interactor/${integration.interactorConnectorName}/revoke`;
              break;
            case 'gmail':
              // Gmail/Calendar revoke API returns 404, so set disconnect flag
              const gmailDisconnectedKey = `gmail_disconnected:${userEmail.toLowerCase().trim()}`;
              this.statusCache.set(gmailDisconnectedKey, {
                status: { ok: true, connected: false },
                timestamp: Date.now(),
                ttl: this.CACHE_TTL * 60 // 1 hour - long enough to show as disconnected
              });
              console.log(`[IntegrationService] Set Gmail disconnect flag: ${gmailDisconnectedKey}`);
              
              // Also try the revoke API in case it works in the future
              revokeUrl = `${INTERACTOR_BASE_URL}/connector/interactor/${integration.interactorConnectorName}/revoke`;
              break;
            case 'google-drive':
              // Google Drive might have revoke issues, so set disconnect flag as backup
              const driveDisconnectedKey = `google-drive_disconnected:${userEmail.toLowerCase().trim()}`;
              this.statusCache.set(driveDisconnectedKey, {
                status: { ok: true, connected: false },
                timestamp: Date.now(),
                ttl: this.CACHE_TTL * 60 // 1 hour - long enough to show as disconnected
              });
              console.log(`[IntegrationService] Set Google Drive disconnect flag: ${driveDisconnectedKey}`);
              
              // Also try the revoke API
              revokeUrl = `${INTERACTOR_BASE_URL}/connector/interactor/${integration.interactorConnectorName}/revoke`;
              break;
            case 'slack':
              // For Slack, set special disconnect flag since it doesn't have proper revoke
              const slackDisconnectedKey = `slack_disconnected:${userEmail.toLowerCase().trim()}`;
              this.statusCache.set(slackDisconnectedKey, {
                status: { ok: true, connected: false },
                timestamp: Date.now(),
                ttl: this.CACHE_TTL * 60 // 1 hour - long enough to show as disconnected
              });
              console.log(`[IntegrationService] Set Slack disconnect flag: ${slackDisconnectedKey}`);
              break;
            case 'zoom':
              // For Zoom, set special disconnect flag since it doesn't have proper revoke
              const zoomDisconnectedKey = `zoom_disconnected:${userEmail.toLowerCase().trim()}`;
              this.statusCache.set(zoomDisconnectedKey, {
                status: { ok: true, connected: false },
                timestamp: Date.now(),
                ttl: this.CACHE_TTL * 60 // 1 hour - long enough to show as disconnected
              });
              console.log(`[IntegrationService] Set Zoom disconnect flag: ${zoomDisconnectedKey}`);
              break;
            case 'teams':
              // For Teams, set special disconnect flag for both possible accounts since it doesn't have proper revoke
              const teamsAccount = 'interactor@interactorservice.onmicrosoft.com';
              const teamsDisconnectedKey1 = `teams_disconnected:${teamsAccount}`;
              const teamsDisconnectedKey2 = `teams_disconnected:${userEmail.toLowerCase().trim()}`;
              
              // Set disconnect flag for both accounts - note we use 'disconnected' property that status check looks for
              this.statusCache.set(teamsDisconnectedKey1, {
                status: { ok: true, connected: false, disconnected: true } as any,
                timestamp: Date.now(),
                ttl: this.CACHE_TTL * 60 // 1 hour - long enough to show as disconnected
              });
              this.statusCache.set(teamsDisconnectedKey2, {
                status: { ok: true, connected: false, disconnected: true } as any,
                timestamp: Date.now(),
                ttl: this.CACHE_TTL * 60
              });
              console.log(`[IntegrationService] Set Teams disconnect flags: ${teamsDisconnectedKey1}, ${teamsDisconnectedKey2}`);
              break;
            case 'github':
              // For GitHub, set disconnect flag since revoke might not work reliably
              const githubDisconnectedKey = `github_disconnected:${userEmail.toLowerCase().trim()}`;
              this.statusCache.set(githubDisconnectedKey, {
                status: { ok: true, connected: false },
                timestamp: Date.now(),
                ttl: this.CACHE_TTL * 60 // 1 hour - long enough to show as disconnected
              });
              console.log(`[IntegrationService] Set GitHub disconnect flag: ${githubDisconnectedKey}`);
              break;
            case 'gitlab':
              // For GitLab, set disconnect flag since revoke might not work reliably
              const gitlabDisconnectedKey = `gitlab_disconnected:${userEmail.toLowerCase().trim()}`;
              this.statusCache.set(gitlabDisconnectedKey, {
                status: { ok: true, connected: false },
                timestamp: Date.now(),
                ttl: this.CACHE_TTL * 60 // 1 hour - long enough to show as disconnected
              });
              console.log(`[IntegrationService] Set GitLab disconnect flag: ${gitlabDisconnectedKey}`);
              break;
            case 'jira':
              // For Jira, set disconnect flag since revoke might not work reliably
              const jiraDisconnectedKey = `jira_disconnected:${userEmail.toLowerCase().trim()}`;
              this.statusCache.set(jiraDisconnectedKey, {
                status: { ok: true, connected: false },
                timestamp: Date.now(),
                ttl: this.CACHE_TTL * 60 // 1 hour - long enough to show as disconnected
              });
              console.log(`[IntegrationService] Set Jira disconnect flag: ${jiraDisconnectedKey}`);
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

  static async getAllStatuses(userEmail: string): Promise<Array<{id: string, connected: boolean, account?: string}>> {
    const integrations = this.getAvailableIntegrations();
    const statuses = await Promise.all(
      integrations.map(async (integration) => {
        const status = await this.getStatus(integration.id, userEmail);
        return {
          id: integration.id,
          connected: status.connected,
          account: status.account
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