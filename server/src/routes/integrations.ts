import { Router, Request, Response } from 'express';
import { IntegrationService } from '../services/IntegrationService.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

/**
 * GET /api/integrations
 * Returns list of all available integrations
 */
router.get('/', (req: Request, res: Response) => {
  const integrations = IntegrationService.getAvailableIntegrations();
  return res.json({ ok: true, integrations });
});

/**
 * GET /api/integrations/:id/auth-url
 * Get OAuth URL for specific integration
 */
router.get('/:id/auth-url', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const account = (req as any).user?.email;
    
    console.log(`[Auth URL] Request for ${id} with account:`, account);
    
    if (!account) {
      return res.status(401).json({ ok: false, error: 'Unauthorized: missing user context' });
    }

    // For Teams, use specific account that has proper permissions
    const finalAccount = id === 'teams' ? 'interactor@interactorservice.onmicrosoft.com' : account;
    console.log(`[Auth URL] Using final account for ${id}:`, finalAccount);

    const result = await IntegrationService.getAuthUrl(id, finalAccount);
    
    if (!result.ok) {
      return res.status(400).json(result);
    }

    return res.json(result);
  } catch (error: any) {
    console.error('[Integrations] Auth URL error:', error);
    return res.status(500).json({ 
      ok: false, 
      error: 'Internal server error' 
    });
  }
});

/**
 * GET /api/integrations/:id/status
 * Check connection status for specific integration
 */
router.get('/:id/status', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const account = (req as any).user?.email;
    
    if (!account) {
      return res.status(401).json({ ok: false, error: 'Unauthorized: missing user context' });
    }

    const result = await IntegrationService.getStatus(id, account);
    return res.json(result);
  } catch (error: any) {
    console.error('[Integrations] Status check error:', error);
    return res.json({ ok: true, connected: false });
  }
});

/**
 * POST /api/integrations/:id/disconnect
 * Disconnect specific integration
 */
router.post('/:id/disconnect', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const account = (req as any).user?.email;
    
    if (!account) {
      return res.status(401).json({ ok: false, error: 'Unauthorized: missing user context' });
    }

    const result = await IntegrationService.disconnect(id, account);
    
    if (!result.ok) {
      return res.status(400).json(result);
    }

    return res.json(result);
  } catch (error: any) {
    console.error('[Integrations] Disconnect error:', error);
    return res.status(500).json({ 
      ok: false, 
      error: 'Internal server error' 
    });
  }
});

/**
 * GET /api/integrations/:id/oauth-callback
 * Handle OAuth callback for integrations
 */
router.get('/:id/oauth-callback', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { code, state, error, error_description } = req.query;
    
    // Handle OAuth errors
    if (error) {
      const errorMessage = error_description || error || 'OAuth authorization failed';
      console.error(`[Integration OAuth] Error for ${id}:`, errorMessage);
      
      return res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Authentication Error</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
            .container { max-width: 400px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; }
            .error { color: #dc3545; }
          </style>
        </head>
        <body>
          <div class="container">
            <h2 class="error">Authentication Failed</h2>
            <p>There was an error connecting your ${id} account:</p>
            <p><strong>${errorMessage}</strong></p>
            <p>You can close this window and try again.</p>
          </div>
          <script>
            if (window.opener && !window.opener.closed) {
              window.opener.postMessage({ 
                type: 'OAUTH_ERROR', 
                service: '${id}',
                error: '${errorMessage}' 
              }, '*');
            }
            setTimeout(() => window.close(), 3000);
          </script>
        </body>
        </html>
      `);
    }
    
    // Handle missing authorization code
    if (!code) {
      const errorMessage = 'Missing authorization code';
      return res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Authentication Error</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
            .container { max-width: 400px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; }
            .error { color: #dc3545; }
          </style>
        </head>
        <body>
          <div class="container">
            <h2 class="error">Authentication Failed</h2>
            <p>Missing authorization code from ${id}.</p>
            <p>You can close this window and try again.</p>
          </div>
          <script>
            if (window.opener && !window.opener.closed) {
              window.opener.postMessage({ 
                type: 'OAUTH_ERROR', 
                service: '${id}',
                error: '${errorMessage}' 
              }, '*');
            }
            setTimeout(() => window.close(), 3000);
          </script>
        </body>
        </html>
      `);
    }
    
    // Success case - process authorization code and notify parent window
    console.log(`[Integration OAuth] Processing callback for ${id} with code: ${code?.toString().substring(0, 10)}...`);
    
    // OAuth success - status check will now use real API calls to determine connection
    
    // Clear any cached disconnected state for this service after OAuth success
    try {
      console.log(`[Integration OAuth] OAuth success for ${id}, clearing all cached states`);
      
      // Clear all cache entries for this integration across all users
      // Since we don't have user context here, we'll use a broader approach
      const integration = IntegrationService.getIntegration(id);
      if (integration) {
        // Clear entire cache to ensure OAuth success is recognized immediately
        // This is safe because cache will repopulate with fresh status checks
        IntegrationService.clearAllCache();
        console.log(`[Integration OAuth] Cleared all cache for ${id} OAuth success`);
        
        // For Teams specifically, also clear disconnect flags that might have longer TTL
        if (id === 'teams') {
          console.log(`[Integration OAuth] Clearing Teams-specific disconnect flags`);
          // We don't have user context, but we can clear common Teams disconnect keys
          IntegrationService.clearIntegrationUserCache('teams', 'interactor@interactorservice.onmicrosoft.com');
          // Note: We can't clear user-specific keys without knowing the user email
        }
      }
    } catch (error) {
      console.warn(`[Integration OAuth] Failed to clear cache for ${id}:`, error);
    }
    
    return res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Authentication Successful</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
          .container { max-width: 400px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; }
          .success { color: #28a745; }
          .spinner { border: 4px solid #f3f3f3; border-top: 4px solid #3498db; border-radius: 50%; width: 40px; height: 40px; animation: spin 2s linear infinite; margin: 20px auto; }
          @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        </style>
      </head>
      <body>
        <div class="container">
          <h2 class="success">✓ Successfully Connected!</h2>
          <p>Your ${id} account has been connected successfully.</p>
          <div class="spinner"></div>
          <p>This window will close automatically...</p>
        </div>
        <script>
          // Notify parent window of success
          if (window.opener && !window.opener.closed) {
            window.opener.postMessage({ 
              type: 'OAUTH_SUCCESS', 
              service: '${id}' 
            }, '*');
          }
          setTimeout(() => {
            window.close();
          }, 2000);
        </script>
      </body>
      </html>
    `);
    
  } catch (error: any) {
    console.error('[Integration OAuth Callback] Error:', error);
    const errorMessage = error.message || 'Internal server error';
    
    return res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Authentication Error</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
          .container { max-width: 400px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; }
          .error { color: #dc3545; }
        </style>
      </head>
      <body>
        <div class="container">
          <h2 class="error">Authentication Error</h2>
          <p>An unexpected error occurred:</p>
          <p><strong>${errorMessage}</strong></p>
          <p>You can close this window and try again.</p>
        </div>
        <script>
          if (window.opener && !window.opener.closed) {
            window.opener.postMessage({ 
              type: 'OAUTH_ERROR', 
              service: '${req.params.id}',
              error: '${errorMessage}' 
            }, '*');
          }
          setTimeout(() => window.close(), 3000);
        </script>
      </body>
      </html>
    `);
  }
});

/**
 * POST /api/integrations/:id/refresh-status
 * Force refresh connection status for specific integration (clears cache)
 */
router.post('/:id/refresh-status', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const account = (req as any).user?.email;
    const { clearCache } = req.body; // Optional parameter to force cache clear
    
    if (!account) {
      return res.status(401).json({ ok: false, error: 'Unauthorized: missing user context' });
    }

    // Clear cache and get fresh status
    const integration = IntegrationService.getIntegration(id);
    if (!integration) {
      return res.status(404).json({ ok: false, error: 'Integration not found' });
    }

    // Clear cache for this integration
    const cacheKey = `${id}:${account.toLowerCase().trim()}`;
    (IntegrationService as any).statusCache.delete(cacheKey);
    console.log(`[Integrations] Refresh-status: Cleared cache for ${id}:${account}`);
    
    // For Zoom/Slack, OAuth success means connected - force connected state
    if (id === 'zoom' || id === 'slack') {
      const connectedResult = { ok: true, connected: true, account };
      // Cache the connected state 
      (IntegrationService as any).statusCache.set(cacheKey, {
        status: connectedResult,
        timestamp: Date.now(),
        ttl: 60 * 1000 // 1 minute
      });
      console.log(`[Integrations] Refresh-status: Force connected state for ${id}`);
      return res.json(connectedResult);
    }
    
    // Get fresh status for other services
    const result = await IntegrationService.getStatus(id, account);
    console.log(`[Integrations] Refresh-status result for ${id}:`, result);
    return res.json(result);
  } catch (error: any) {
    console.error('[Integrations] Refresh status error:', error);
    return res.status(500).json({ 
      ok: false, 
      error: 'Internal server error' 
    });
  }
});

/**
 * POST /api/integrations/:id/clear-cache
 * Clear cache for specific integration to handle account switching
 */
router.post('/:id/clear-cache', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const account = (req as any).user?.email;
    
    if (!account) {
      return res.status(401).json({ ok: false, error: 'Unauthorized: missing user context' });
    }

    // Clear cache for this specific integration and user
    IntegrationService.clearIntegrationUserCache(id, account);
    
    console.log(`[Integrations] Cache cleared for ${id}:${account}`);
    
    return res.json({ 
      ok: true, 
      message: `Cache cleared for ${id}` 
    });
  } catch (error: any) {
    console.error('[Integrations] Clear cache error:', error);
    return res.status(500).json({ 
      ok: false, 
      error: 'Internal server error' 
    });
  }
});

/**
 * GET /api/integrations/status/all
 * Get connection status for all integrations
 */
router.get('/status/all', authMiddleware, async (req: Request, res: Response) => {
  try {
    const account = (req as any).user?.email;
    
    if (!account) {
      return res.status(401).json({ ok: false, error: 'Unauthorized: missing user context' });
    }

    const integrations = IntegrationService.getAvailableIntegrations();
    const statuses = await Promise.all(
      integrations.map(async (integration) => {
        const status = await IntegrationService.getStatus(integration.id, account);
        return {
          id: integration.id,
          name: integration.name,
          connected: status.connected,
          account: status.account, // Include account info for UI display
          category: integration.category,
          icon: integration.icon
        };
      })
    );

    return res.json({ ok: true, statuses });
  } catch (error: any) {
    console.error('[Integrations] Status all error:', error);
    return res.status(500).json({ 
      ok: false, 
      error: 'Internal server error' 
    });
  }
});

/**
 * GET /api/integrations/proxy/auth-url
 * Handle Interactor's OAuth callback proxy
 */
router.get('/proxy/auth-url', async (req: Request, res: Response) => {
  try {
    const { code, state, error, error_description } = req.query;
    
    console.log('[Integration Proxy] Received callback:', { 
      code: code ? `${code.toString().substring(0, 10)}...` : 'missing',
      state: state ? `${state.toString().substring(0, 20)}...` : 'missing',
      error: error || 'none'
    });
    
    // Handle OAuth errors
    if (error) {
      const errorMessage = error_description || error || 'OAuth authorization failed';
      console.error('[Integration Proxy] OAuth Error:', errorMessage);
      
      return res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Authentication Error</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
            .container { max-width: 400px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; }
            .error { color: #dc3545; }
          </style>
        </head>
        <body>
          <div class="container">
            <h2 class="error">Authentication Failed</h2>
            <p>There was an error connecting your Slack account:</p>
            <p><strong>${errorMessage}</strong></p>
            <p>You can close this window and try again.</p>
          </div>
          <script>
            if (window.opener && !window.opener.closed) {
              window.opener.postMessage({ 
                type: 'OAUTH_ERROR', 
                service: 'slack',
                error: '${errorMessage}' 
              }, '*');
            }
            setTimeout(() => window.close(), 3000);
          </script>
        </body>
        </html>
      `);
    }
    
    // Handle missing authorization code
    if (!code) {
      const errorMessage = 'Missing authorization code';
      return res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Authentication Error</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
            .container { max-width: 400px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; }
            .error { color: #dc3545; }
          </style>
        </head>
        <body>
          <div class="container">
            <h2 class="error">Authentication Failed</h2>
            <p>Missing authorization code from Slack.</p>
            <p>You can close this window and try again.</p>
          </div>
          <script>
            if (window.opener && !window.opener.closed) {
              window.opener.postMessage({ 
                type: 'OAUTH_ERROR', 
                service: 'slack',
                error: '${errorMessage}' 
              }, '*');
            }
            setTimeout(() => window.close(), 3000);
          </script>
        </body>
        </html>
      `);
    }
    
    // Success case - process authorization code and notify parent window
    console.log('[Integration Proxy] Processing Slack OAuth success');
    
    return res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Authentication Successful</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
          .container { max-width: 400px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; }
          .success { color: #28a745; }
          .spinner { border: 4px solid #f3f3f3; border-top: 4px solid #3498db; border-radius: 50%; width: 40px; height: 40px; animation: spin 2s linear infinite; margin: 20px auto; }
          @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        </style>
      </head>
      <body>
        <div class="container">
          <h2 class="success">✓ Successfully Connected!</h2>
          <p>Your Slack account has been connected successfully.</p>
          <div class="spinner"></div>
          <p>This window will close automatically...</p>
        </div>
        <script>
          // Notify parent window of success
          if (window.opener && !window.opener.closed) {
            window.opener.postMessage({ 
              type: 'OAUTH_SUCCESS', 
              service: 'slack' 
            }, '*');
          }
          setTimeout(() => {
            window.close();
          }, 2000);
        </script>
      </body>
      </html>
    `);
    
  } catch (error: any) {
    console.error('[Integration Proxy Callback] Error:', error);
    const errorMessage = error.message || 'Internal server error';
    
    return res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Authentication Error</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
          .container { max-width: 400px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; }
          .error { color: #dc3545; }
        </style>
      </head>
      <body>
        <div class="container">
          <h2 class="error">Authentication Error</h2>
          <p>An unexpected error occurred:</p>
          <p><strong>${errorMessage}</strong></p>
          <p>You can close this window and try again.</p>
        </div>
        <script>
          if (window.opener && !window.opener.closed) {
            window.opener.postMessage({ 
              type: 'OAUTH_ERROR', 
              service: 'slack',
              error: '${errorMessage}' 
            }, '*');
          }
          setTimeout(() => window.close(), 3000);
        </script>
      </body>
      </html>
    `);
  }
});

/**
 * GET /api/integrations/slack/channels
 * Get Slack channels list - Returns common channel suggestions since Interactor doesn't support channels.list
 */
router.get('/slack/channels', authMiddleware, async (req: Request, res: Response) => {
  try {
    const account = (req as any).user?.email;
    
    if (!account) {
      return res.status(401).json({ ok: false, error: 'Unauthorized: missing user context' });
    }

    // Since Interactor doesn't support channels.list API, we return common channel suggestions
    // Users will need to type the exact channel name (e.g., #general, #random, etc.)
    const commonChannels = [
      { name: 'general', suggestion: true },
      { name: 'random', suggestion: true },
      { name: 'announcements', suggestion: true }
    ];
    
    return res.json({
      ok: true,
      channels: commonChannels,
      note: 'These are common channel suggestions. Please type your exact channel name (e.g., #general, @username)'
    });

  } catch (error: any) {
    console.error('[Slack] Failed to get channels:', error);
    return res.status(500).json({ ok: false, error: 'Failed to get channels' });
  }
});

/**
 * GET /api/integrations/slack/users
 * Get Slack users list for mentions
 */
router.get('/slack/users', authMiddleware, async (req: Request, res: Response) => {
  try {
    const account = (req as any).user?.email;
    
    if (!account) {
      console.error('[Slack Users List] No account found');
      return res.status(401).json({ ok: false, error: 'Unauthorized: missing user context' });
    }

    console.log('[Slack Users List] Testing user.list API for user list');
    
    // Use the correct user.list API from the curl example
    try {
      const userListUrl = 'https://console.interactor.com/api/v1/connector/interactor/slack/action/user.list/execute';
      console.log('[Slack Users List] Trying user.list API:', userListUrl);
      
      const userListResponse = await fetch(userListUrl + `?account=${encodeURIComponent(account)}`, {
        method: 'POST',
        headers: {
          'x-api-key': process.env.INTERACTOR_API_KEY!,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          limit: 100
        })
      });

      console.log('[Slack Users List] user.list API response status:', userListResponse.status);

      if (userListResponse.ok) {
        const userListData = await userListResponse.json();
        console.log('[Slack Users List] user.list response:', JSON.stringify(userListData, null, 2));
        
        if (userListData.output && userListData.output.members) {
          // Format users properly
          const users = userListData.output.members
            .filter((user: any) => !user.deleted && !user.is_bot)
            .map((user: any) => ({
              id: user.id,
              name: user.name || user.display_name || user.real_name || 'Unknown',
              display_name: user.display_name || user.real_name || user.name,
              real_name: user.real_name || user.display_name || user.name,
              is_bot: user.is_bot || false,
              deleted: user.deleted || false
            }));
          
          return res.json({
            ok: true,
            users: { members: users }
          });
        }
      } else {
        const errorText = await userListResponse.text();
        console.error('[Slack Users List] user.list API error:', userListResponse.status, errorText);
      }
    } catch (error) {
      console.warn('[Slack Users List] user.list failed:', error);
    }

    // Try users.list (plural) as fallback since Slack official API uses this
    try {
      const usersListUrl = 'https://console.interactor.com/api/v1/connector/interactor/slack/action/users.list/execute';
      console.log('[Slack Users List] Trying users.list API as fallback:', usersListUrl);
      
      const usersListResponse = await fetch(usersListUrl + `?account=${encodeURIComponent(account)}`, {
        method: 'POST',
        headers: {
          'x-api-key': process.env.INTERACTOR_API_KEY!,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          limit: 100
        })
      });

      console.log('[Slack Users List] users.list API response status:', usersListResponse.status);

      if (usersListResponse.ok) {
        const usersListData = await usersListResponse.json();
        console.log('[Slack Users List] users.list response:', JSON.stringify(usersListData, null, 2));
        
        if (usersListData.output && usersListData.output.members) {
          // Format users properly
          const users = usersListData.output.members
            .filter((user: any) => !user.deleted && !user.is_bot)
            .map((user: any) => ({
              id: user.id,
              name: user.name || user.display_name || user.real_name || 'Unknown',
              display_name: user.display_name || user.real_name || user.name,
              real_name: user.real_name || user.display_name || user.name,
              is_bot: user.is_bot || false,
              deleted: user.deleted || false
            }));
          
          console.log('[Slack Users List] Found users with users.list:', users.length);
          return res.json({
            ok: true,
            users: { members: users }
          });
        }
      } else {
        const errorText = await usersListResponse.text();
        console.error('[Slack Users List] users.list API error:', usersListResponse.status, errorText);
      }
    } catch (error) {
      console.warn('[Slack Users List] users.list failed:', error);
    }
    
    // Fallback to default suggestions
    console.log('[Slack Users List] Using fallback suggestions');
    const commonUsers = [
      { id: '@channel', name: '@channel', display_name: 'Notify all members in channel', is_channel_mention: true },
      { id: '@here', name: '@here', display_name: 'Notify active members in channel', is_channel_mention: true },
      { id: '@everyone', name: '@everyone', display_name: 'Notify everyone in workspace', is_channel_mention: true }
    ];

    return res.json({
      ok: true,
      users: { members: commonUsers },
      note: 'Specific user list not available. Use @username format for individual users.'
    });
    
  } catch (error) {
    console.error('[Slack Users List] Error:', error);
    return res.status(500).json({ 
      ok: false, 
      error: 'Internal server error while fetching users' 
    });
  }
});

/**
 * POST /api/integrations/slack/send-message
 * Send message to Slack channel
 */
router.post('/slack/send-message', authMiddleware, async (req: Request, res: Response) => {
  try {
    const account = (req as any).user?.email;
    const { channel, text } = req.body;
    
    if (!account) {
      return res.status(401).json({ ok: false, error: 'Unauthorized: missing user context' });
    }

    if (!channel || !text) {
      return res.status(400).json({ ok: false, error: 'Channel and text are required' });
    }

    if (!process.env.INTERACTOR_API_KEY) {
      return res.status(500).json({ ok: false, error: 'Interactor API key not configured' });
    }

    const url = 'https://console.interactor.com/api/v1/connector/interactor/slack/action/message.send/execute';
    const response = await fetch(url + `?account=${encodeURIComponent(account)}`, {
      method: 'POST',
      headers: {
        'x-api-key': process.env.INTERACTOR_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        channel,
        text
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    
    return res.json({
      ok: true,
      message: 'Message sent successfully',
      data
    });

  } catch (error: any) {
    console.error('[Slack] Failed to send message:', error);
    return res.status(500).json({ ok: false, error: 'Failed to send message' });
  }
});

/**
 * GET /api/integrations/gmail/status
 * Check Gmail connection status - dedicated endpoint for EmailView
 */
router.get('/gmail/status', authMiddleware, async (req: Request, res: Response) => {
  try {
    const account = (req as any).user?.email;
    
    if (!account) {
      return res.status(401).json({ ok: false, error: 'Unauthorized: missing user context' });
    }

    const result = await IntegrationService.getStatus('gmail', account);
    return res.json(result);
  } catch (error: any) {
    console.error('[Gmail Status] Error:', error);
    return res.status(500).json({ ok: false, error: 'Failed to check Gmail status' });
  }
});

/**
 * POST /api/integrations/gmail/send-message
 * Send email via Gmail
 */
router.post('/gmail/send-message', authMiddleware, async (req: Request, res: Response) => {
  try {
    const account = (req as any).user?.email;
    const { to, subject, body } = req.body;
    
    if (!account) {
      return res.status(401).json({ ok: false, error: 'Unauthorized: missing user context' });
    }

    if (!to || !subject || !body) {
      return res.status(400).json({ ok: false, error: 'To, subject, and body are required' });
    }

    if (!process.env.INTERACTOR_API_KEY) {
      return res.status(500).json({ ok: false, error: 'Interactor API key not configured' });
    }

    // Gmail 메시지 전송 API 호출 (Quick button과 동일한 방식)
    const url = 'https://console.interactor.com/api/v1/connector/interactor/gmail-v1/action/gmail.users.messages.send/execute';
    
    // Create MIME message (동일한 형식으로)
    const mimeMessage = [
      `From: ${account}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      `Content-Type: text/plain; charset=UTF-8`,
      '',
      body
    ].join('\r\n');

    // Base64url encode the message (동일한 방식)
    const raw = Buffer.from(mimeMessage).toString('base64url');

    const response = await fetch(url + `?account=${encodeURIComponent(account)}`, {
      method: 'POST',
      headers: {
        'x-api-key': process.env.INTERACTOR_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userId: 'me',
        raw: raw
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    
    return res.json({
      ok: true,
      message: 'Email sent successfully',
      data
    });

  } catch (error: any) {
    console.error('[Gmail] Failed to send email:', error);
    return res.status(500).json({ ok: false, error: 'Failed to send email' });
  }
});

// Testing endpoints for development
router.post('/testing/clear-all-cache', authMiddleware, async (req: Request, res: Response) => {
  try {
    IntegrationService.clearAllCache();
    res.json({ ok: true, message: 'All cache cleared' });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: 'Failed to clear cache' });
  }
});

router.post('/testing/force-disconnect-all', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const userEmail = user.email;
    
    await IntegrationService.forceDisconnectAll(userEmail);
    res.json({ ok: true, message: 'All services force disconnected' });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: 'Failed to force disconnect all' });
  }
});

router.get('/testing/check-status/:id/:email', async (req: Request, res: Response) => {
  try {
    const { id, email } = req.params;
    const result = await IntegrationService.getStatus(id, email);
    res.json({ service: id, email, status: result });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: 'Failed to check status' });
  }
});

router.get('/testing/cache-state/:email', async (req: Request, res: Response) => {
  try {
    const { email } = req.params;
    const cacheState = IntegrationService.getCacheState(email);
    res.json({ email, cacheState });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: 'Failed to get cache state' });
  }
});

/**
 * GET /api/integrations/teams/chats
 * Get Microsoft Teams chats list
 */
router.get('/teams/chats', authMiddleware, async (req: Request, res: Response) => {
  try {
    const account = (req as any).user?.email;
    
    if (!account) {
      return res.status(401).json({ ok: false, error: 'Unauthorized: missing user context' });
    }

    if (!process.env.INTERACTOR_API_KEY) {
      return res.status(500).json({ ok: false, error: 'Interactor API key not configured' });
    }

    const url = 'https://console.interactor.com/api/v1/connector/interactor/msteams/action/chat.list/execute';
    const response = await fetch(url + `?account=${encodeURIComponent(account)}`, {
      method: 'POST',
      headers: {
        'x-api-key': process.env.INTERACTOR_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    
    return res.json({
      ok: true,
      chats: data.output?.body?.value || [],
      data
    });

  } catch (error: any) {
    console.error('[Teams] Failed to get chats:', error);
    return res.status(500).json({ ok: false, error: 'Failed to get chats' });
  }
});

/**
 * POST /api/integrations/teams/clear-disconnect
 * Manually clear Teams disconnect flags for debugging
 */
router.post('/teams/clear-disconnect', authMiddleware, async (req: Request, res: Response) => {
  try {
    console.log('[Teams Clear Disconnect] Manually clearing disconnect flags');
    
    // Clear Teams disconnect flags for both accounts
    const teamsAccount = 'interactor@interactorservice.onmicrosoft.com';
    const userEmail = (req.user as any)?.email || 'jaehoon@interactor.com';
    
    IntegrationService.clearIntegrationUserCache('teams', teamsAccount);
    IntegrationService.clearIntegrationUserCache('teams', userEmail);
    
    // Also clear all cache to be safe
    IntegrationService.clearAllCache();
    
    console.log('[Teams Clear Disconnect] Cleared disconnect flags for both accounts');
    
    return res.json({ ok: true, message: 'Teams disconnect flags cleared' });
  } catch (error: any) {
    console.error('[Teams Clear Disconnect] Error:', error);
    return res.status(500).json({ ok: false, error: 'Failed to clear disconnect flags' });
  }
});

/**
 * POST /api/integrations/gmail/clear-disconnect
 * Manually clear Gmail disconnect flags for debugging
 */
router.post('/gmail/clear-disconnect', authMiddleware, async (req: Request, res: Response) => {
  try {
    console.log('[Gmail Clear Disconnect] Manually clearing disconnect flags');
    
    const userEmail = (req.user as any)?.email;
    if (!userEmail) {
      return res.status(401).json({ ok: false, error: 'Unauthorized: missing user context' });
    }
    
    IntegrationService.clearIntegrationUserCache('gmail', userEmail);
    
    // Also clear all cache to be safe
    IntegrationService.clearAllCache();
    
    console.log('[Gmail Clear Disconnect] Cleared disconnect flags');
    
    return res.json({ ok: true, message: 'Gmail disconnect flags cleared' });
  } catch (error: any) {
    console.error('[Gmail Clear Disconnect] Error:', error);
    return res.status(500).json({ ok: false, error: 'Failed to clear disconnect flags' });
  }
});

/**
 * POST /api/integrations/googlecalendar/clear-disconnect
 * Manually clear Google Calendar disconnect flags for debugging
 */
router.post('/googlecalendar/clear-disconnect', authMiddleware, async (req: Request, res: Response) => {
  try {
    console.log('[Calendar Clear Disconnect] Manually clearing disconnect flags');
    
    const userEmail = (req.user as any)?.email;
    if (!userEmail) {
      return res.status(401).json({ ok: false, error: 'Unauthorized: missing user context' });
    }
    
    IntegrationService.clearIntegrationUserCache('googlecalendar', userEmail);
    
    // Also clear all cache to be safe
    IntegrationService.clearAllCache();
    
    console.log('[Calendar Clear Disconnect] Cleared disconnect flags');
    
    return res.json({ ok: true, message: 'Google Calendar disconnect flags cleared' });
  } catch (error: any) {
    console.error('[Calendar Clear Disconnect] Error:', error);
    return res.status(500).json({ ok: false, error: 'Failed to clear disconnect flags' });
  }
});

/**
 * GET /api/integrations/teams/channels
 * Get Microsoft Teams channels list for a team
 */
router.get('/teams/channels', authMiddleware, async (req: Request, res: Response) => {
  console.log('[Teams Channels API] Request received');
  console.log('[Teams Channels API] Headers:', req.headers);
  console.log('[Teams Channels API] User:', req.user);
  try {
    const account = 'interactor@interactorservice.onmicrosoft.com'; // Use Teams-specific account
    
    // Hardcoded team info since team.list API is not available
    const team = {
      description: "Test-team",
      id: "11461220-3d6a-450c-912f-49fbe09be2f5",
      name: "Test-team"
    };

    if (!team) {
      return res.status(400).json({ ok: false, error: 'Team is required' });
    }

    if (!process.env.INTERACTOR_API_KEY) {
      return res.status(500).json({ ok: false, error: 'Interactor API key not configured' });
    }

    const url = 'https://console.interactor.com/api/v1/connector/interactor/msteamsplus/action/channel.list/execute';
    const response = await fetch(url + `?account=${encodeURIComponent(account)}`, {
      method: 'POST',
      headers: {
        'x-api-key': process.env.INTERACTOR_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        team: team
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    
    // Extract channels from the response and transform to expected format
    const rawChannels = data.output || [];
    const channels = rawChannels.map((channel: any) => ({
      id: channel.id,
      displayName: channel.label || channel.displayName || channel.name || 'Unknown Channel',
      description: channel.description || 'Teams Channel'
    }));
    
    return res.json({
      ok: true,
      channels: channels,
      data
    });

  } catch (error: any) {
    console.error('[Teams] Failed to get channels:', error);
    return res.status(500).json({ ok: false, error: 'Failed to get channels' });
  }
});

/**
 * POST /api/integrations/teams/send-message
 * Send message to Microsoft Teams chat or channel
 */
router.post('/teams/send-message', authMiddleware, async (req: Request, res: Response) => {
  try {
    const account = 'interactor@interactorservice.onmicrosoft.com'; // Use Teams-specific account
    const { channel, team, content } = req.body;
    
    console.log('[Teams] Send message request:', { channel, team, content });

    if (!content) {
      return res.status(400).json({ ok: false, error: 'Content is required' });
    }

    if (!channel || !team) {
      return res.status(400).json({ ok: false, error: 'Channel and team are required' });
    }

    if (!process.env.INTERACTOR_API_KEY) {
      return res.status(500).json({ ok: false, error: 'Interactor API key not configured' });
    }

    // Send to channel only (simplified)
    const url = 'https://console.interactor.com/api/v1/connector/interactor/msteamsplus/action/channel.message.send/execute';
    const requestBody = {
      channel: channel,
      team: team,
      content: content
    };

    const response = await fetch(url + `?account=${encodeURIComponent(account)}`, {
      method: 'POST',
      headers: {
        'x-api-key': process.env.INTERACTOR_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    
    return res.json({
      ok: true,
      message: `Teams message sent successfully to channel`,
      data
    });

  } catch (error: any) {
    console.error('[Teams] Failed to send message:', error);
    return res.status(500).json({ ok: false, error: 'Failed to send message' });
  }
});

/**
 * POST /api/integrations/teams/disconnect
 * Disconnect Teams integration
 */
router.post('/teams/disconnect', authMiddleware, async (req: Request, res: Response) => {
  try {
    const account = 'interactor@interactorservice.onmicrosoft.com'; // Teams-specific account
    
    // Clear Teams status cache for the user
    IntegrationService.clearIntegrationUserCache('teams', account);
    
    // Set manual disconnect flag
    const disconnectKey = `teams_disconnected:${account}`;
    (IntegrationService as any).statusCache.set(disconnectKey, {
      status: { disconnected: true },
      timestamp: Date.now(),
      ttl: 30 * 60 * 1000 // 30 minutes
    });
    
    console.log(`[Teams] Manually disconnected Teams for ${account}`);
    
    return res.json({
      ok: true,
      message: 'Teams disconnected successfully'
    });
    
  } catch (error: any) {
    console.error('[Teams] Failed to disconnect:', error);
    return res.status(500).json({ ok: false, error: 'Failed to disconnect Teams' });
  }
});

/**
 * GET /api/integrations/gmail/messages
 * Get Gmail messages list
 */
router.get('/gmail/messages', authMiddleware, async (req: Request, res: Response) => {
  try {
    const account = (req as any).user?.email;
    const { maxResults = '10', pageToken, q = 'in:inbox' } = req.query;
    
    if (!account) {
      return res.status(401).json({ ok: false, error: 'Unauthorized: missing user context' });
    }

    // Check if Gmail is connected first
    const status = await IntegrationService.getStatus('gmail', account);
    if (!status.connected) {
      return res.json({
        ok: false,
        error: 'Gmail not connected. Please connect Gmail first.',
        connected: false
      });
    }

    // Call InteractorCore to get messages
    const { InteractorCore } = await import('../lib/InteractorCore.js');
    
    const command = {
      service: 'gmail',
      action: 'list_messages', 
      params: {
        maxResults: parseInt(maxResults as string),
        pageToken: pageToken as string,
        q: q as string
      },
      userId: account
    };

    const result = await InteractorCore.processCommand(command);
    
    if (result.success) {
      // Extract message data from response
      const responseBody = result.data?.output?.body || {};
      const messages = responseBody.messages || [];
      
      // Return simplified response
      res.json({
        ok: true,
        connected: true,
        messages: messages,
        nextPageToken: responseBody.nextPageToken,
        hasMore: !!responseBody.nextPageToken,
        account: status.account
      });
    } else {
      res.status(400).json({
        ok: false,
        error: result.error || 'Failed to fetch messages',
        connected: true
      });
    }

  } catch (error: any) {
    console.error('[Gmail Messages] Error:', error);
    res.status(500).json({ 
      ok: false, 
      error: 'Internal server error',
      connected: false
    });
  }
});

export default router;