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
    
    if (!account) {
      return res.status(401).json({ ok: false, error: 'Unauthorized: missing user context' });
    }

    const result = await IntegrationService.getAuthUrl(id, account);
    
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

    console.log('[Slack Users List] Checking Slack connection for account:', account);
    const status = await IntegrationService.getStatus('slack', account);
    console.log('[Slack Users List] Slack connection status:', status);
    
    if (!status.connected) {
      console.error('[Slack Users List] Slack not connected for account:', account);
      return res.status(400).json({ 
        ok: false, 
        error: 'Slack not connected. Please connect first.' 
      });
    }

    console.log('[Slack Users List] Calling users.list API directly...');
    
    const url = 'https://console.interactor.com/api/v1/connector/interactor/slack/action/users.list/execute';
    console.log('[Slack Users List] Using URL:', url);
    
    const response = await fetch(url + `?account=${encodeURIComponent(account)}`, {
      method: 'POST',
      headers: {
        'x-api-key': process.env.INTERACTOR_API_KEY!,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        limit: 100
      })
    });

    console.log('[Slack Users List] API response status:', response.status);

    if (!response.ok) {
      const errorData = await response.text();
      console.error('[Slack Users List] API Error:', response.status, errorData);
      return res.status(502).json({ 
        ok: false, 
        error: 'Failed to fetch users from Slack' 
      });
    }

    const data = await response.json();
    console.log('[Slack Users List] Raw API response:', JSON.stringify(data, null, 2));
    
    if (!data.output || !data.output.users) {
      console.error('[Slack Users List] API returned error or missing users data:', data);
      
      // Check if there's any useful information in the response
      if (data.output && Object.keys(data.output).length > 0) {
        console.log('[Slack Users List] Output contains keys:', Object.keys(data.output));
      }
      
      // Return error but with more information
      return res.status(502).json({ 
        ok: false, 
        error: 'Slack API returned empty user list. This usually means the Slack connection needs to be refreshed or the workspace has no accessible users.',
        details: {
          hasOutput: !!data.output,
          outputKeys: data.output ? Object.keys(data.output) : [],
          suggestion: 'Try disconnecting and reconnecting your Slack integration'
        }
      });
    }

    console.log('[Slack Users List] Found users:', data.output.users.length);
    return res.json({ ok: true, users: { members: data.output.users } });
    
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