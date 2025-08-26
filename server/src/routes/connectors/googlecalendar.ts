// server/src/routes/connectors/googlecalendar.ts
import { Router, Request, Response } from 'express';
import axios from 'axios';

const router = Router();

const INTERACTOR_BASE_URL = (process.env.INTERACTOR_BASE_URL || 'https://console.interactor.com/api/v1').replace(/\/$/, '');
const INTERACTOR_API_KEY = process.env.INTERACTOR_API_KEY;

if (!INTERACTOR_API_KEY) {
  console.warn('[GC OAuth] Missing INTERACTOR_API_KEY. Set it in server/.env');
}

/**
 * GET /api/connectors/googlecalendar/auth-url
 * Returns: { ok: true, url: string }
 * Uses the logged-in user's email as Interactor "account".
 */
router.get('/auth-url', async (req: Request, res: Response) => {
  try {
    const account = (req as any).user?.email; // authMiddleware must set req.user
    if (!account) {
      return res.status(401).json({ ok: false, error: 'Unauthorized: missing user context' });
    }

    const url = `${INTERACTOR_BASE_URL}/connector/interactor/googlecalendar-v1/auth-url`;

    const interactorResp = await axios.get(url, {
      params: { account: account },
      headers: {
        'x-api-key': String(INTERACTOR_API_KEY),
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    const data = interactorResp.data;
    console.log('[GC Auth URL] Interactor Response Data:', data);
    const urlFromOutput = data?.output?.url || data?.url;
    const urlString = typeof data === 'string' ? data : undefined;
    const finalUrl: string | undefined = urlFromOutput || urlString;
    console.log('[GC Auth URL] Final URL:', finalUrl);

    if (!finalUrl) {
      return res.status(502).json({
        ok: false,
        error: 'Failed to resolve auth-url from Interactor response',
        debug: data
      });
    }

    return res.json({ ok: true, authUrl: finalUrl });
  } catch (err: any) {
    const status = err?.response?.status;
    const body = err?.response?.data;
    return res.status(502).json({
      ok: false,
      error: 'Interactor auth-url request failed',
      detail: { status, body, message: err?.message }
    });
  }
});

/**
 * GET /api/connectors/googlecalendar/status
 * Checks if the user has a valid Google Calendar connection.
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    const account = (req as any).user?.email;
    if (!account) {
      return res.status(401).json({ ok: false, error: 'Unauthorized: missing user context' });
    }

    // Check if user has valid token via Interactor - test with calendar list
    const statusUrl = `${INTERACTOR_BASE_URL}/connector/interactor/googlecalendar-v1/action/calendar.calendarList.get/execute`;
    const statusResp = await axios.post(statusUrl, {
      calendarId: account
    }, {
      params: { account: account },
      headers: {
        'x-api-key': String(INTERACTOR_API_KEY),
        'Content-Type': 'application/json'
      },
      timeout: 5000
    });

    const data = statusResp.data;
    // If we get a successful response, user is connected
    const isConnected = !!(data && !data.error);
    
    return res.json({ ok: true, connected: isConnected });
  } catch (err: any) {
    // If status check fails, assume not connected
    console.warn('[GC Status] Status check failed:', err.message);
    return res.json({ ok: true, connected: false });
  }
});

/**
 * POST /api/connectors/googlecalendar/disconnect
 * Revokes the Google Calendar token for the logged-in user.
 */
router.post('/disconnect', async (req: Request, res: Response) => {
  try {
    const account = (req as any).user?.email; // authMiddleware must set req.user
    if (!account) {
      return res.status(401).json({ ok: false, error: 'Unauthorized: missing user context' });
    }

    const disconnectResult = await axios.post(`${INTERACTOR_BASE_URL}/connector/interactor/googlecalendar-v1/execute`, {
      action: 'disconnect',
      account: account
    }, {
      headers: {
        'x-api-key': String(INTERACTOR_API_KEY),
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    if (!disconnectResult.data.ok) {
      throw new Error(disconnectResult.data.error || 'Interactor disconnect failed');
    }

    return res.json({ ok: true, message: 'Google Calendar disconnected successfully.' });
  } catch (err: any) {
    console.error('[disconnect] error', err);
    const status = err?.response?.status;
    const body = err?.response?.data;
    return res.status(500).json({
      ok: false,
      error: 'Failed to disconnect Google Calendar',
      detail: { status, body, message: err?.message }
    });
  }
});

/**
 * GET /api/connectors/googlecalendar/callback
 * Handles the OAuth callback from Interactor.
 */
router.get('/callback', async (req: Request, res: Response) => {
  console.log('[GC Callback] Received callback:', req.query);
  const { code, state, error, error_description } = req.query;

  if (error) {
    console.error('[GC Callback] OAuth Error:', error_description || error);
    return res.send(`
      <!DOCTYPE html>
      <html>
        <head><title>Authentication Error</title></head>
        <body>
          <div style="text-align: center; padding: 50px; font-family: Arial, sans-serif;">
            <h2>❌ Authentication Failed</h2>
            <p>${error_description || error}</p>
            <p>This window will close automatically...</p>
          </div>
          <script>
            if (window.opener && !window.opener.closed) {
              window.opener.postMessage({ 
                type: 'OAUTH_ERROR', 
                service: 'googlecalendar',
                error: '${error_description || error}' 
              }, '*');
            }
            setTimeout(() => window.close(), 2000);
          </script>
        </body>
      </html>
    `);
  }

  if (!code) {
    console.error('[GC Callback] Missing authorization code.');
    return res.send(`
      <!DOCTYPE html>
      <html>
        <head><title>Authentication Error</title></head>
        <body>
          <div style="text-align: center; padding: 50px; font-family: Arial, sans-serif;">
            <h2>❌ Authentication Failed</h2>
            <p>Missing authorization code</p>
            <p>This window will close automatically...</p>
          </div>
          <script>
            if (window.opener && !window.opener.closed) {
              window.opener.postMessage({ 
                type: 'OAUTH_ERROR', 
                service: 'googlecalendar',
                error: 'Missing authorization code' 
              }, '*');
            }
            setTimeout(() => window.close(), 2000);
          </script>
        </body>
      </html>
    `);
  }

  try {
    const account = (req as any).user?.email; // authMiddleware must set req.user
    if (!account) {
      console.error('[GC Callback] Unauthorized: missing user context');
      return res.send(`
        <!DOCTYPE html>
        <html>
          <head><title>Authentication Error</title></head>
          <body>
            <div style="text-align: center; padding: 50px; font-family: Arial, sans-serif;">
              <h2>❌ Unauthorized</h2>
              <p>Missing user context</p>
              <p>This window will close automatically...</p>
            </div>
            <script>
              if (window.opener && !window.opener.closed) {
                window.opener.postMessage({ 
                  type: 'OAUTH_ERROR', 
                  service: 'googlecalendar',
                  error: 'Unauthorized' 
                }, '*');
              }
              setTimeout(() => window.close(), 2000);
            </script>
          </body>
        </html>
      `);
    }

    // Exchange code for token with Interactor
    const tokenExchangeUrl = `${INTERACTOR_BASE_URL}/connector/interactor/googlecalendar-v1/execute`;
    const tokenExchangeResp = await axios.post(tokenExchangeUrl, {
      action: 'token',
      code: code,
      account: account,
      redirect_uri: `${process.env.BACKEND_ORIGIN}/api/connectors/googlecalendar/callback`
    }, {
      headers: {
        'x-api-key': String(INTERACTOR_API_KEY),
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    const tokenData = tokenExchangeResp.data;
    console.log('[GC Callback] Token Exchange Response:', tokenData);

    if (!tokenData.ok) {
      console.error('[GC Callback] Token exchange failed:', tokenData.error || 'Unknown error');
      return res.send(`
        <!DOCTYPE html>
        <html>
          <head><title>Authentication Error</title></head>
          <body>
            <div style="text-align: center; padding: 50px; font-family: Arial, sans-serif;">
              <h2>❌ Token Exchange Failed</h2>
              <p>${tokenData.error || 'Unknown error'}</p>
              <p>This window will close automatically...</p>
            </div>
            <script>
              if (window.opener && !window.opener.closed) {
                window.opener.postMessage({ 
                  type: 'OAUTH_ERROR', 
                  service: 'googlecalendar',
                  error: '${tokenData.error || 'Token exchange failed'}' 
                }, '*');
              }
              setTimeout(() => window.close(), 2000);
            </script>
          </body>
        </html>
      `);
    }

    // TODO: Store tokenData (access_token, refresh_token, etc.) securely in your database
    // For now, we'll return a popup close page that notifies the parent window

    return res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Authentication Success</title>
        </head>
        <body>
          <div style="text-align: center; padding: 50px; font-family: Arial, sans-serif;">
            <h2>✅ Google Calendar Connected Successfully!</h2>
            <p>This window will close automatically...</p>
          </div>
          <script>
            // Notify parent window and close popup
            if (window.opener && !window.opener.closed) {
              window.opener.postMessage({ 
                type: 'OAUTH_SUCCESS', 
                service: 'googlecalendar' 
              }, '*');
            }
            setTimeout(() => {
              window.close();
            }, 1000);
          </script>
        </body>
      </html>
    `);

  } catch (err: any) {
    console.error('[GC Callback] Token exchange error:', err);
    const status = err?.response?.status;
    const body = err?.response?.data;
    const errorMessage = body?.message || err?.message || 'Server error during token exchange';
    return res.send(`
      <!DOCTYPE html>
      <html>
        <head><title>Authentication Error</title></head>
        <body>
          <div style="text-align: center; padding: 50px; font-family: Arial, sans-serif;">
            <h2>❌ Server Error</h2>
            <p>${errorMessage}</p>
            <p>This window will close automatically...</p>
          </div>
          <script>
            if (window.opener && !window.opener.closed) {
              window.opener.postMessage({ 
                type: 'OAUTH_ERROR', 
                service: 'googlecalendar',
                error: '${errorMessage}' 
              }, '*');
            }
            setTimeout(() => window.close(), 2000);
          </script>
        </body>
      </html>
    `);
  }
});

export default router;
