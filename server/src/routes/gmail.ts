import { Router, Request, Response } from 'express';
import { callInteractorApi } from '../lib/interactor.js';
import { IntegrationService } from '../services/IntegrationService.js';

const router = Router();

/**
 * GET /api/gmail/profile
 * Get user's Gmail profile information
 */
router.get('/profile', async (req: Request, res: Response) => {
  try {
    const account = (req as any).user?.email;
    if (!account) return res.status(401).json({ ok: false, error: 'Unauthorized: missing user context' });

    const status = await IntegrationService.getStatus('gmail', account);
    if (!status.connected) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Gmail not connected. Please connect first.' 
      });
    }

    const api = await callInteractorApi({
      account,
      connector: 'gmail-v1',
      action: 'gmail.users.getProfile',
      data: { userId: 'me' }
    });

    if (!api.success) {
      return res.status(502).json({ ok: false, error: api.error || 'Failed to fetch Gmail profile' });
    }

    return res.json({ ok: true, profile: api.output });
  } catch (e: any) {
    console.error('[Gmail Profile] Error:', e);
    return res.status(500).json({ ok: false, error: e?.message || 'Internal server error' });
  }
});

/**
 * GET /api/gmail/messages/list
 * List messages with optional query parameters
 */
router.get('/messages/list', async (req: Request, res: Response) => {
  try {
    const account = (req as any).user?.email;
    if (!account) return res.status(401).json({ ok: false, error: 'Unauthorized: missing user context' });

    const status = await IntegrationService.getStatus('gmail', account);
    if (!status.connected) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Gmail not connected. Please connect first.' 
      });
    }

    const { 
      q, 
      labelIds, 
      maxResults = 10, 
      pageToken, 
      includeSpamTrash = false 
    } = req.query;

    const api = await callInteractorApi({
      account,
      connector: 'gmail-v1',
      action: 'gmail.users.messages.list',
      data: {
        userId: 'me',
        q: q || undefined,
        labelIds: labelIds || undefined,
        maxResults: Math.min(Number(maxResults), 100),
        pageToken: pageToken || undefined,
        includeSpamTrash: includeSpamTrash === 'true'
      }
    });

    if (!api.success) {
      return res.status(502).json({ ok: false, error: api.error || 'Failed to fetch messages' });
    }

    return res.json({ ok: true, messages: api.output });
  } catch (e: any) {
    console.error('[Gmail Messages List] Error:', e);
    return res.status(500).json({ ok: false, error: e?.message || 'Internal server error' });
  }
});

/**
 * GET /api/gmail/messages/:messageId
 * Get specific message by ID
 */
router.get('/messages/:messageId', async (req: Request, res: Response) => {
  try {
    const account = (req as any).user?.email;
    const { messageId } = req.params;
    const { format = 'full' } = req.query;

    if (!account) return res.status(401).json({ ok: false, error: 'Unauthorized: missing user context' });

    const status = await IntegrationService.getStatus('gmail', account);
    if (!status.connected) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Gmail not connected. Please connect first.' 
      });
    }

    const api = await callInteractorApi({
      account,
      connector: 'gmail-v1',
      action: 'gmail.users.messages.get',
      data: {
        userId: 'me',
        id: messageId,
        format: format
      }
    });

    if (!api.success) {
      return res.status(502).json({ ok: false, error: api.error || 'Failed to fetch message' });
    }

    return res.json({ ok: true, message: api.output });
  } catch (e: any) {
    console.error('[Gmail Message Get] Error:', e);
    return res.status(500).json({ ok: false, error: e?.message || 'Internal server error' });
  }
});

/**
 * POST /api/gmail/messages/send
 * Send an email message
 * Body: { to: string, subject: string, body: string, isHtml?: boolean }
 */
router.post('/messages/send', async (req: Request, res: Response) => {
  try {
    const account = (req as any).user?.email;
    const { to, subject, body, isHtml = false } = req.body || {};

    if (!account) return res.status(401).json({ ok: false, error: 'Unauthorized: missing user context' });
    
    if (!to || !subject || !body) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Missing required fields: to, subject, body' 
      });
    }

    const status = await IntegrationService.getStatus('gmail', account);
    if (!status.connected) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Gmail not connected. Please connect first.' 
      });
    }

    // Create MIME message
    const contentType = isHtml ? 'text/html' : 'text/plain';
    const mimeMessage = [
      `From: ${account}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      `Content-Type: ${contentType}; charset=UTF-8`,
      '',
      body
    ].join('\r\n');

    // Base64url encode the message
    const raw = Buffer.from(mimeMessage).toString('base64url');

    const api = await callInteractorApi({
      account,
      connector: 'gmail-v1',
      action: 'gmail.users.messages.send',
      data: {
        userId: 'me',
        raw: raw
      }
    });

    if (!api.success) {
      return res.status(502).json({ ok: false, error: api.error || 'Failed to send message' });
    }

    return res.json({ ok: true, sent: true, messageId: api.output?.id });
  } catch (e: any) {
    console.error('[Gmail Send Message] Error:', e);
    return res.status(500).json({ ok: false, error: e?.message || 'Internal server error' });
  }
});

/**
 * GET /api/gmail/labels/list
 * Get all labels for the user
 */
router.get('/labels/list', async (req: Request, res: Response) => {
  try {
    const account = (req as any).user?.email;
    if (!account) return res.status(401).json({ ok: false, error: 'Unauthorized: missing user context' });

    const status = await IntegrationService.getStatus('gmail', account);
    if (!status.connected) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Gmail not connected. Please connect first.' 
      });
    }

    const api = await callInteractorApi({
      account,
      connector: 'gmail-v1',
      action: 'gmail.users.labels.list',
      data: { userId: 'me' }
    });

    if (!api.success) {
      return res.status(502).json({ ok: false, error: api.error || 'Failed to fetch labels' });
    }

    return res.json({ ok: true, labels: api.output });
  } catch (e: any) {
    console.error('[Gmail Labels List] Error:', e);
    return res.status(500).json({ ok: false, error: e?.message || 'Internal server error' });
  }
});

/**
 * POST /api/gmail/labels/create
 * Create a new label
 * Body: { name: string, color?: { backgroundColor: string, textColor: string } }
 */
router.post('/labels/create', async (req: Request, res: Response) => {
  try {
    const account = (req as any).user?.email;
    const { name, color } = req.body || {};

    if (!account) return res.status(401).json({ ok: false, error: 'Unauthorized: missing user context' });
    
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ ok: false, error: 'Label name is required' });
    }

    const status = await IntegrationService.getStatus('gmail', account);
    if (!status.connected) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Gmail not connected. Please connect first.' 
      });
    }

    const api = await callInteractorApi({
      account,
      connector: 'gmail-v1',
      action: 'gmail.users.labels.create',
      data: {
        userId: 'me',
        name: name.trim(),
        color: color || undefined
      }
    });

    if (!api.success) {
      return res.status(502).json({ ok: false, error: api.error || 'Failed to create label' });
    }

    return res.json({ ok: true, label: api.output });
  } catch (e: any) {
    console.error('[Gmail Create Label] Error:', e);
    return res.status(500).json({ ok: false, error: e?.message || 'Internal server error' });
  }
});

/**
 * GET /api/gmail/drafts/list
 * List email drafts
 */
router.get('/drafts/list', async (req: Request, res: Response) => {
  try {
    const account = (req as any).user?.email;
    if (!account) return res.status(401).json({ ok: false, error: 'Unauthorized: missing user context' });

    const status = await IntegrationService.getStatus('gmail', account);
    if (!status.connected) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Gmail not connected. Please connect first.' 
      });
    }

    const { maxResults = 10, pageToken, q } = req.query;

    const api = await callInteractorApi({
      account,
      connector: 'gmail-v1',
      action: 'gmail.users.drafts.list',
      data: {
        userId: 'me',
        maxResults: Math.min(Number(maxResults), 100),
        pageToken: pageToken || undefined,
        q: q || undefined
      }
    });

    if (!api.success) {
      return res.status(502).json({ ok: false, error: api.error || 'Failed to fetch drafts' });
    }

    return res.json({ ok: true, drafts: api.output });
  } catch (e: any) {
    console.error('[Gmail Drafts List] Error:', e);
    return res.status(500).json({ ok: false, error: e?.message || 'Internal server error' });
  }
});

/**
 * POST /api/gmail/drafts/create
 * Create a new draft
 * Body: { to: string, subject: string, body: string, isHtml?: boolean }
 */
router.post('/drafts/create', async (req: Request, res: Response) => {
  try {
    const account = (req as any).user?.email;
    const { to, subject, body, isHtml = false } = req.body || {};

    if (!account) return res.status(401).json({ ok: false, error: 'Unauthorized: missing user context' });
    
    if (!to || !subject || !body) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Missing required fields: to, subject, body' 
      });
    }

    const status = await IntegrationService.getStatus('gmail', account);
    if (!status.connected) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Gmail not connected. Please connect first.' 
      });
    }

    // Create MIME message for draft
    const contentType = isHtml ? 'text/html' : 'text/plain';
    const mimeMessage = [
      `From: ${account}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      `Content-Type: ${contentType}; charset=UTF-8`,
      '',
      body
    ].join('\r\n');

    console.log("server-api")

    const raw = "VG86IHRlc3RAZXhhbXBsZS5jb20KRnJvbTogCkNjOiAKQmNjOiAKU3ViamVjdDogPT9VVEYtOD9RP1Rlc3Q9MjBTdWJqZWN0Pz0KQ29udGVudC1UeXBlOiB0ZXh0L3BsYWluOyBjaGFyc2V0PSJVVEYtOCIKCnNkZg==";

    const api = await callInteractorApi({
      account,
      connector: 'gmail-v1',
      action: 'gmail.users.drafts.create',
      data: {
        userId: 'me',
        message: { raw }
      }
    });

    if (!api.success) {
      return res.status(502).json({ ok: false, error: api.error || 'Failed to create draft' });
    }

    return res.json({ ok: true, draft: api.output });
  } catch (e: any) {
    console.error('[Gmail Create Draft] Error:', e);
    return res.status(500).json({ ok: false, error: e?.message || 'Internal server error' });
  }
});

/**
 * POST /api/gmail/drafts/:draftId/send
 * Send a draft by ID
 */
router.post('/drafts/:draftId/send', async (req: Request, res: Response) => {
  try {
    const account = (req as any).user?.email;
    const { draftId } = req.params;

    if (!account) return res.status(401).json({ ok: false, error: 'Unauthorized: missing user context' });

    const status = await IntegrationService.getStatus('gmail', account);
    if (!status.connected) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Gmail not connected. Please connect first.' 
      });
    }

    const api = await callInteractorApi({
      account,
      connector: 'gmail-v1',
      action: 'gmail.users.drafts.send',
      data: {
        userId: 'me',
        id: draftId
      }
    });

    if (!api.success) {
      return res.status(502).json({ ok: false, error: api.error || 'Failed to send draft' });
    }

    return res.json({ ok: true, sent: true, messageId: api.output?.id });
  } catch (e: any) {
    console.error('[Gmail Send Draft] Error:', e);
    return res.status(500).json({ ok: false, error: e?.message || 'Internal server error' });
  }
});

/**
 * DELETE /api/gmail/drafts/:draftId
 * Delete a draft by ID
 */
router.delete('/drafts/:draftId', async (req: Request, res: Response) => {
  try {
    const account = (req as any).user?.email;
    const { draftId } = req.params;

    if (!account) return res.status(401).json({ ok: false, error: 'Unauthorized: missing user context' });

    const status = await IntegrationService.getStatus('gmail', account);
    if (!status.connected) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Gmail not connected. Please connect first.' 
      });
    }

    const api = await callInteractorApi({
      account,
      connector: 'gmail-v1',
      action: 'gmail.users.drafts.delete',
      data: {
        userId: 'me',
        id: draftId
      }
    });

    if (!api.success) {
      return res.status(502).json({ ok: false, error: api.error || 'Failed to delete draft' });
    }

    return res.json({ ok: true, deleted: true });
  } catch (e: any) {
    console.error('[Gmail Delete Draft] Error:', e);
    return res.status(500).json({ ok: false, error: e?.message || 'Internal server error' });
  }
});

export default router;