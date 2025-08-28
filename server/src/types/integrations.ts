export interface IntegrationConfig {
  id: string;
  name: string;
  description: string;
  interactorConnectorName: string;
  icon?: string;
  category: 'productivity' | 'communication' | 'storage' | 'calendar' | 'development' | 'other';
}

export interface IntegrationStatus {
  id: string;
  connected: boolean;
  lastChecked: Date;
  error?: string;
}

export interface AuthUrlResponse {
  ok: boolean;
  authUrl?: string;
  error?: string;
}

export interface StatusResponse {
  ok: boolean;
  connected: boolean;
  account?: string;
  error?: string;
}

export interface DisconnectResponse {
  ok: boolean;
  message?: string;
  error?: string;
}