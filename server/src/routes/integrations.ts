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
    
    // Get fresh status
    const result = await IntegrationService.getStatus(id, account);
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

export default router;