import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '../../data');
const TOKENS_FILE = path.join(DATA_DIR, 'tokens.json');

interface ServiceTokens {
  [serviceName: string]: {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    scope?: string;
    tokenType?: string;
    connectedAt: number;
    lastUsed: number;
  };
}

interface UserTokens {
  [userEmail: string]: ServiceTokens;
}

export class TokenManager {
  private static tokens: UserTokens = {};
  private static initialized = false;

  // Initialize and load tokens from file
  static async initialize() {
    if (this.initialized) return;

    try {
      // Ensure data directory exists
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      // Load existing tokens
      if (fs.existsSync(TOKENS_FILE)) {
        const data = fs.readFileSync(TOKENS_FILE, 'utf8');
        this.tokens = JSON.parse(data);
        console.log(`[TokenManager] Loaded tokens for ${Object.keys(this.tokens).length} users`);
      } else {
        this.tokens = {};
        console.log('[TokenManager] No existing tokens file, starting fresh');
      }

      this.initialized = true;
    } catch (error) {
      console.error('[TokenManager] Failed to initialize:', error);
      this.tokens = {};
      this.initialized = true;
    }
  }

  // Save tokens to file
  private static async saveTokens() {
    try {
      fs.writeFileSync(TOKENS_FILE, JSON.stringify(this.tokens, null, 2));
      console.log('[TokenManager] Tokens saved to disk');
    } catch (error) {
      console.error('[TokenManager] Failed to save tokens:', error);
    }
  }

  // Store token for a user and service
  static async storeToken(
    userEmail: string, 
    serviceName: string, 
    tokenData: {
      accessToken?: string;
      refreshToken?: string;
      expiresAt?: number;
      scope?: string;
      tokenType?: string;
    }
  ) {
    await this.initialize();

    if (!this.tokens[userEmail]) {
      this.tokens[userEmail] = {};
    }

    this.tokens[userEmail][serviceName] = {
      ...tokenData,
      connectedAt: Date.now(),
      lastUsed: Date.now()
    };

    await this.saveTokens();
    console.log(`[TokenManager] Stored token for ${userEmail}:${serviceName}`);
  }

  // Get token for a user and service
  static async getToken(userEmail: string, serviceName: string) {
    await this.initialize();

    const userTokens = this.tokens[userEmail];
    if (!userTokens) return null;

    const serviceToken = userTokens[serviceName];
    if (!serviceToken) return null;

    // Update last used timestamp
    serviceToken.lastUsed = Date.now();
    await this.saveTokens();

    return serviceToken;
  }

  // Check if token exists and is valid
  static async hasValidToken(userEmail: string, serviceName: string): Promise<boolean> {
    await this.initialize();

    const token = await this.getToken(userEmail, serviceName);
    if (!token || !token.accessToken) return false;

    // Check if token is expired (if expiry info available)
    if (token.expiresAt && token.expiresAt < Date.now()) {
      console.log(`[TokenManager] Token expired for ${userEmail}:${serviceName}`);
      return false;
    }

    return true;
  }

  // Remove token for a user and service
  static async removeToken(userEmail: string, serviceName: string) {
    await this.initialize();

    if (this.tokens[userEmail] && this.tokens[userEmail][serviceName]) {
      delete this.tokens[userEmail][serviceName];
      
      // Remove user entry if no tokens left
      if (Object.keys(this.tokens[userEmail]).length === 0) {
        delete this.tokens[userEmail];
      }

      await this.saveTokens();
      console.log(`[TokenManager] Removed token for ${userEmail}:${serviceName}`);
    }
  }

  // Get all services connected for a user
  static async getConnectedServices(userEmail: string): Promise<string[]> {
    await this.initialize();

    const userTokens = this.tokens[userEmail];
    if (!userTokens) return [];

    const connectedServices = [];
    for (const [serviceName, tokenData] of Object.entries(userTokens)) {
      if (tokenData.accessToken) {
        connectedServices.push(serviceName);
      }
    }

    return connectedServices;
  }

  // Clean up expired tokens
  static async cleanupExpiredTokens() {
    await this.initialize();

    let cleaned = 0;
    for (const [userEmail, userTokens] of Object.entries(this.tokens)) {
      for (const [serviceName, tokenData] of Object.entries(userTokens)) {
        if (tokenData.expiresAt && tokenData.expiresAt < Date.now()) {
          delete this.tokens[userEmail][serviceName];
          cleaned++;
        }
      }
      
      // Remove user entry if no tokens left
      if (Object.keys(this.tokens[userEmail]).length === 0) {
        delete this.tokens[userEmail];
      }
    }

    if (cleaned > 0) {
      await this.saveTokens();
      console.log(`[TokenManager] Cleaned up ${cleaned} expired tokens`);
    }
  }

  // Get statistics
  static async getStats() {
    await this.initialize();

    const userCount = Object.keys(this.tokens).length;
    let totalTokens = 0;
    const serviceStats: { [service: string]: number } = {};

    for (const userTokens of Object.values(this.tokens)) {
      for (const [serviceName, _] of Object.entries(userTokens)) {
        totalTokens++;
        serviceStats[serviceName] = (serviceStats[serviceName] || 0) + 1;
      }
    }

    return {
      userCount,
      totalTokens,
      serviceStats
    };
  }

  // For debugging - get all tokens (without sensitive data)
  static async getDebugInfo() {
    await this.initialize();

    const debugInfo: any = {};
    for (const [userEmail, userTokens] of Object.entries(this.tokens)) {
      debugInfo[userEmail] = {};
      for (const [serviceName, tokenData] of Object.entries(userTokens)) {
        debugInfo[userEmail][serviceName] = {
          hasAccessToken: !!tokenData.accessToken,
          hasRefreshToken: !!tokenData.refreshToken,
          expiresAt: tokenData.expiresAt,
          connectedAt: new Date(tokenData.connectedAt).toISOString(),
          lastUsed: new Date(tokenData.lastUsed).toISOString(),
          scope: tokenData.scope
        };
      }
    }

    return debugInfo;
  }
}

// Initialize on module load
TokenManager.initialize();