import { Router, Request, Response } from 'express';
import axios from 'axios';

const router = Router();

const INTERACTOR_BASE_URL = (process.env.INTERACTOR_BASE_URL || 'https://console.interactor.com/api/v1').replace(/\/$/, '');
const INTERACTOR_API_KEY = process.env.INTERACTOR_API_KEY;

if (!INTERACTOR_API_KEY) {
  console.warn('[Drive OAuth] Missing INTERACTOR_API_KEY. Set it in server/.env');
}

/**
 * GET /api/connectors/drive/auth-url
 * Returns: { ok: true, url: string }
 * Uses the logged-in user's email as Interactor "account".
 */
router.get('/auth-url', async (req: Request, res: Response) => {
  try {
    const account = (req as any).user?.email; // authMiddleware must set req.user
    if (!account) {
      return res.status(401).json({ ok: false, error: 'Unauthorized: missing user context' });
    }

    const url = `${INTERACTOR_BASE_URL}/connector/interactor/drive-v1/auth-url?account=${encodeURIComponent(account)}`;

    const interactorResp = await axios.get(url, {
      headers: {
        'x-api-key': String(INTERACTOR_API_KEY),
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    const data = interactorResp.data;
    console.log('[Drive Auth URL] Interactor Response Data:', data);
    const urlFromOutput = data?.output?.url || data?.url;
    const urlString = typeof data === 'string' ? data : undefined;
    const finalUrl: string | undefined = urlFromOutput || urlString;
    console.log('[Drive Auth URL] Final URL:', finalUrl);

    if (!finalUrl) {
      return res.status(502).json({
        ok: false,
        error: 'Failed to resolve auth-url from Interactor response',
        debug: data
      });
    }

    return res.json({ ok: true, url: finalUrl });
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
 * POST /api/connectors/drive/disconnect
 * Revokes the Google Drive token for the logged-in user.
 */
router.post('/disconnect', async (req: Request, res: Response) => {
  try {
    const account = (req as any).user?.email; // authMiddleware must set req.user
    if (!account) {
      return res.status(401).json({ ok: false, error: 'Unauthorized: missing user context' });
    }

    // TODO: Replace with actual Interactor API call to revoke token
    // This is a placeholder. You'll need to consult Interactor's documentation
    // for the correct endpoint and method to revoke a token.
    const disconnectResult = await axios.post(`${INTERACTOR_BASE_URL}/connector/interactor/drive-v1/disconnect`, {
      account,
    }, {
      headers: {
        'x-api-key': String(INTERACTOR_API_KEY),
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    if (!disconnectResult.data.ok) {
      throw new Error(disconnectResult.data.error || 'Interactor disconnect failed');
    }

    return res.json({ ok: true, message: 'Google Drive disconnected successfully.' });
  } catch (err: any) {
    console.error('[disconnect] error', err);
    const status = err?.response?.status;
    const body = err?.response?.data;
    return res.status(500).json({
      ok: false,
      error: 'Failed to disconnect Google Drive',
      detail: { status, body, message: err?.message }
    });
  }
});

/**
 * GET /api/connectors/drive/callback
 * Handles the OAuth callback from Interactor.
 */
router.get('/callback', async (req: Request, res: Response) => {
  console.log('[Drive Callback] Received callback:', req.query);
  const { code, state, error, error_description } = req.query;

  if (error) {
    console.error('[Drive Callback] OAuth Error:', error_description || error);
    return res.redirect(`${process.env.FRONTEND_ORIGIN}/integrations/drive/settings?status=error&message=${encodeURIComponent(String(error_description || error))}`);
  }

  if (!code) {
    console.error('[Drive Callback] Missing authorization code.');
    return res.redirect(`${process.env.FRONTEND_ORIGIN}/integrations/drive/settings?status=error&message=${encodeURIComponent(String('Missing authorization code'))}`);
  }

  try {
    const account = (req as any).user?.email; // authMiddleware must set req.user
    if (!account) {
      console.error('[Drive Callback] Unauthorized: missing user context');
      return res.redirect(`${process.env.FRONTEND_ORIGIN}/integrations/drive/settings?status=error&message=${encodeURIComponent('Unauthorized')}`);
    }

    // Exchange code for token with Interactor
    const tokenExchangeUrl = `${INTERACTOR_BASE_URL}/connector/interactor/drive-v1/token`;
    const tokenExchangeResp = await axios.post(tokenExchangeUrl, {
      code,
      account,
      // You might need to send redirect_uri here as well, depending on Interactor's API
      redirect_uri: `${process.env.BACKEND_ORIGIN}/api/connectors/drive/callback` // Assuming backend origin is set
    }, {
      headers: {
        'x-api-key': String(INTERACTOR_API_KEY),
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    const tokenData = tokenExchangeResp.data;
    console.log('[Drive Callback] Token Exchange Response:', tokenData);

    if (!tokenData.ok) {
      console.error('[Drive Callback] Token exchange failed:', tokenData.error || 'Unknown error');
      return res.redirect(`${process.env.FRONTEND_ORIGIN}/integrations/drive/settings?status=error&message=${encodeURIComponent(tokenData.error || 'Token exchange failed')}`);
    }

    // TODO: Store tokenData (access_token, refresh_token, etc.) securely in your database
    // For now, we'll just redirect to success.

    return res.redirect(`${process.env.FRONTEND_ORIGIN}/integrations/drive/settings?status=success`);

  } catch (err: any) {
    console.error('[Drive Callback] Token exchange error:', err);
    const status = err?.response?.status;
    const body = err?.response?.data;
    return res.redirect(`${process.env.FRONTEND_ORIGIN}/integrations/drive/settings?status=error&message=${encodeURIComponent(String(body?.message || err?.message || 'Server error during token exchange'))}`);
  }
});

export default router;
