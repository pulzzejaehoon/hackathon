import { Router } from 'express';
import axios from 'axios';
const router = Router();
const INTERACTOR_BASE_URL = (process.env.INTERACTOR_BASE_URL || 'https://console.interactor.com/api/v1').replace(/\/$/, '');
const INTERACTOR_API_KEY = process.env.INTERACTOR_API_KEY;
if (!INTERACTOR_API_KEY) {
    console.warn('[Gmail OAuth] Missing INTERACTOR_API_KEY. Set it in server/.env');
}
/**
 * GET /api/connectors/gmail/auth-url
 * Returns: { ok: true, url: string }
 * Uses the logged-in user's email as Interactor "account".
 */
router.get('/auth-url', async (req, res) => {
    try {
        const account = req.user?.email; // authMiddleware must set req.user
        if (!account) {
            return res.status(401).json({ ok: false, error: 'Unauthorized: missing user context' });
        }
        const url = `${INTERACTOR_BASE_URL}/connector/interactor/gmail-v1/auth-url?account=${encodeURIComponent(account)}`;
        const interactorResp = await axios.get(url, {
            headers: {
                'x-api-key': String(INTERACTOR_API_KEY),
                'Content-Type': 'application/json'
            },
            timeout: 30000
        });
        const data = interactorResp.data;
        console.log('[Gmail Auth URL] Interactor Response Data:', data);
        const urlFromOutput = data?.output?.url || data?.url;
        const urlString = typeof data === 'string' ? data : undefined;
        const finalUrl = urlFromOutput || urlString;
        console.log('[Gmail Auth URL] Final URL:', finalUrl);
        if (!finalUrl) {
            return res.status(502).json({
                ok: false,
                error: 'Failed to resolve auth-url from Interactor response',
                debug: data
            });
        }
        return res.json({ ok: true, url: finalUrl });
    }
    catch (err) {
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
 * POST /api/connectors/gmail/disconnect
 * Revokes the Gmail token for the logged-in user.
 */
router.post('/disconnect', async (req, res) => {
    try {
        const account = req.user?.email; // authMiddleware must set req.user
        if (!account) {
            return res.status(401).json({ ok: false, error: 'Unauthorized: missing user context' });
        }
        // TODO: Replace with actual Interactor API call to revoke token
        // This is a placeholder. You'll need to consult Interactor's documentation
        // for the correct endpoint and method to revoke a token.
        const disconnectResult = await axios.post(`${INTERACTOR_BASE_URL}/connector/interactor/gmail-v1/disconnect`, {
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
        return res.json({ ok: true, message: 'Gmail disconnected successfully.' });
    }
    catch (err) {
        console.error('[disconnect] error', err);
        const status = err?.response?.status;
        const body = err?.response?.data;
        return res.status(500).json({
            ok: false,
            error: 'Failed to disconnect Gmail',
            detail: { status, body, message: err?.message }
        });
    }
});
/**
 * GET /api/connectors/gmail/callback
 * Handles the OAuth callback from Interactor.
 * Updated to use popup-based flow with postMessage.
 */
router.get('/callback', async (req, res) => {
    console.log('[Gmail Callback] Received callback:', req.query);
    const { code, state, error, error_description } = req.query;
    if (error) {
        console.error('[Gmail Callback] OAuth Error:', error_description || error);
        const errorMessage = error_description || error;
        return res.send(`
      <html>
        <head><title>Gmail Connection Error</title></head>
        <body style="display: flex; justify-content: center; align-items: center; height: 100vh; font-family: Arial, sans-serif;">
          <div style="text-align: center; padding: 20px; border-radius: 8px; background: #fef2f2; border: 1px solid #fecaca;">
            <h2 style="color: #dc2626; margin-bottom: 16px;">Connection Failed</h2>
            <p style="color: #dc2626; margin-bottom: 16px;">Gmail 연결에 실패했습니다: ${errorMessage}</p>
            <script>
              window.opener?.postMessage({ type: 'gmail_auth_error', error: '${errorMessage}' }, '*');
              window.close();
            </script>
          </div>
        </body>
      </html>
    `);
    }
    if (!code) {
        console.error('[Gmail Callback] Missing authorization code.');
        return res.send(`
      <html>
        <head><title>Gmail Connection Error</title></head>
        <body style="display: flex; justify-content: center; align-items: center; height: 100vh; font-family: Arial, sans-serif;">
          <div style="text-align: center; padding: 20px; border-radius: 8px; background: #fef2f2; border: 1px solid #fecaca;">
            <h2 style="color: #dc2626; margin-bottom: 16px;">Connection Failed</h2>
            <p style="color: #dc2626; margin-bottom: 16px;">인증 코드가 누락되었습니다.</p>
            <script>
              window.opener?.postMessage({ type: 'gmail_auth_error', error: 'Missing authorization code' }, '*');
              window.close();
            </script>
          </div>
        </body>
      </html>
    `);
    }
    try {
        const account = req.user?.email;
        if (!account) {
            console.error('[Gmail Callback] Unauthorized: missing user context');
            return res.send(`
        <html>
          <head><title>Gmail Connection Error</title></head>
          <body style="display: flex; justify-content: center; align-items: center; height: 100vh; font-family: Arial, sans-serif;">
            <div style="text-align: center; padding: 20px; border-radius: 8px; background: #fef2f2; border: 1px solid #fecaca;">
              <h2 style="color: #dc2626; margin-bottom: 16px;">Connection Failed</h2>
              <p style="color: #dc2626; margin-bottom: 16px;">사용자 정보가 없습니다.</p>
              <script>
                window.opener?.postMessage({ type: 'gmail_auth_error', error: 'Unauthorized' }, '*');
                window.close();
              </script>
            </div>
          </body>
        </html>
      `);
        }
        // Exchange code for token with Interactor
        const tokenExchangeUrl = `${INTERACTOR_BASE_URL}/connector/interactor/gmail-v1/execute`;
        const tokenExchangeResp = await axios.post(tokenExchangeUrl, {
            action: 'token',
            code: code,
            account: account,
            redirect_uri: `${process.env.BACKEND_ORIGIN}/api/connectors/gmail/callback`
        }, {
            headers: {
                'x-api-key': String(INTERACTOR_API_KEY),
                'Content-Type': 'application/json'
            },
            timeout: 30000
        });
        const tokenData = tokenExchangeResp.data;
        console.log('[Gmail Callback] Token Exchange Response:', tokenData);
        if (!tokenData.ok) {
            console.error('[Gmail Callback] Token exchange failed:', tokenData.error || 'Unknown error');
            return res.send(`
        <html>
          <head><title>Gmail Connection Error</title></head>
          <body style="display: flex; justify-content: center; align-items: center; height: 100vh; font-family: Arial, sans-serif;">
            <div style="text-align: center; padding: 20px; border-radius: 8px; background: #fef2f2; border: 1px solid #fecaca;">
              <h2 style="color: #dc2626; margin-bottom: 16px;">Connection Failed</h2>
              <p style="color: #dc2626; margin-bottom: 16px;">${tokenData.error || 'Unknown error'}</p>
              <script>
                window.opener?.postMessage({ type: 'gmail_auth_error', error: '${tokenData.error || 'Token exchange failed'}' }, '*');
                window.close();
              </script>
            </div>
          </body>
        </html>
      `);
        }
        // Token is now stored and managed by Interactor
        console.log(`[Gmail Callback] OAuth completed successfully for ${account}`);
        // Successful connection
        return res.send(`
      <html>
        <head><title>Gmail Connection Success</title></head>
        <body style="display: flex; justify-content: center; align-items: center; height: 100vh; font-family: Arial, sans-serif;">
          <div style="text-align: center; padding: 20px; border-radius: 8px; background: #f0fdf4; border: 1px solid #bbf7d0;">
            <h2 style="color: #059669; margin-bottom: 16px;">✅ Connected!</h2>
            <p style="color: #059669; margin-bottom: 16px;">Gmail이 성공적으로 연결되었습니다.</p>
            <script>
              window.opener?.postMessage({ type: 'gmail_auth_success' }, '*');
              window.close();
            </script>
          </div>
        </body>
      </html>
    `);
    }
    catch (err) {
        console.error('[Gmail Callback] Token exchange error:', err);
        const errorMessage = err?.response?.data?.message || err?.message || 'Server error during token exchange';
        return res.send(`
      <html>
        <head><title>Gmail Connection Error</title></head>
        <body style="display: flex; justify-content: center; align-items: center; height: 100vh; font-family: Arial, sans-serif;">
          <div style="text-align: center; padding: 20px; border-radius: 8px; background: #fef2f2; border: 1px solid #fecaca;">
            <h2 style="color: #dc2626; margin-bottom: 16px;">Connection Failed</h2>
            <p style="color: #dc2626; margin-bottom: 16px;">${errorMessage}</p>
            <script>
              window.opener?.postMessage({ type: 'gmail_auth_error', error: '${errorMessage}' }, '*');
              window.close();
            </script>
          </div>
        </body>
      </html>
    `);
    }
});
export default router;
