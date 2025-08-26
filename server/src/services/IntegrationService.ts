import axios from 'axios';
import { IntegrationConfig, AuthUrlResponse, StatusResponse, DisconnectResponse } from '../types/integrations.js';

const INTERACTOR_BASE_URL = (process.env.INTERACTOR_BASE_URL || 'https://console.interactor.com/api/v1').replace(/\/$/, '');
const INTERACTOR_API_KEY = process.env.INTERACTOR_API_KEY;

if (!INTERACTOR_API_KEY) {
  console.warn('[IntegrationService] Missing INTERACTOR_API_KEY. Set it in server/.env');
}

export class IntegrationService {
  private static integrations: Map<string, IntegrationConfig> = new Map([
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

    try {
      // Use correct Interactor auth-url endpoint (GET request)
      const url = `${INTERACTOR_BASE_URL}/connector/interactor/${integration.interactorConnectorName}/auth-url`;
      const response = await axios.get(url, {
        params: { account: userEmail },
        headers: {
          'x-api-key': String(INTERACTOR_API_KEY),
          'Content-Type': 'application/json'
        },
        timeout: 10000
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

    try {
      // Try to call a simple calendar list to check if user is connected
      const url = `${INTERACTOR_BASE_URL}/connector/interactor/${integration.interactorConnectorName}/action/calendar.calendarList.get/execute`;
      const response = await axios.post(url, {
        calendarId: userEmail
      }, {
        params: { account: userEmail },
        headers: {
          'x-api-key': String(INTERACTOR_API_KEY),
          'Content-Type': 'application/json'
        },
        timeout: 5000
      });

      // If we get a successful response, user is connected
      return { ok: true, connected: true };
    } catch (error: any) {
      // If the API call fails, assume not connected
      console.warn(`[IntegrationService] Status check failed for ${integrationId}:`, error.message);
      return { ok: true, connected: false };
    }
  }

  static async disconnect(integrationId: string, userEmail: string): Promise<DisconnectResponse> {
    const integration = this.getIntegration(integrationId);
    if (!integration) {
      return { ok: false, error: 'Integration not found' };
    }

    try {
      const url = `${INTERACTOR_BASE_URL}/connector/interactor/${integration.interactorConnectorName}/disconnect`;
      const response = await axios.post(url, {
        account: userEmail
      }, {
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

      return { 
        ok: true, 
        message: `${integration.name} disconnected successfully` 
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