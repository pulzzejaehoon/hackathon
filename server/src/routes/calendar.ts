import { Router, Request, Response } from 'express';
import { callInteractorApi } from '../lib/interactor.js';
import { IntegrationService } from '../services/IntegrationService.js';

const router = Router();

/**
 * GET /api/calendar/list
 * Returns the user's calendars (uses Interactor calendar.calendarList.list)
 */
router.get('/list', async (req: Request, res: Response) => {
  try {
    const account = (req as any).user?.email;
    if (!account) return res.status(401).json({ ok: false, error: 'Unauthorized: missing user context' });

    // Check if user is connected to Google Calendar
    const status = await IntegrationService.getStatus('googlecalendar', account);
    if (!status.connected) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Google Calendar not connected. Please connect first.' 
      });
    }

    const api = await callInteractorApi({
      account,
      action: 'googlecalendar-v1/action/calendar.calendarList.list',
      data: {
        maxResults: "250",
        showHidden: "false"
      }
    });

    if (!api.success) {
      return res.status(502).json({ ok: false, error: api.error || 'Failed to fetch calendars' });
    }

    return res.json({ ok: true, calendars: api.output });
  } catch (e: any) {
    console.error('[Calendar List] Error:', e);
    return res.status(500).json({ ok: false, error: e?.message || 'Internal server error' });
  }
});

/**
 * POST /api/calendar/quick-add
 * Body: { text: string, calendarId?: string }
 * If calendarId is omitted, we attempt to resolve the user's primary calendar.
 */
router.post('/quick-add', async (req: Request, res: Response) => {
  try {
    const account = (req as any).user?.email;
    const { text } = req.body || {};
    
    if (!account) return res.status(401).json({ ok: false, error: 'Unauthorized: missing user context' });
    
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ ok: false, error: 'Text is required for quick add' });
    }

    // Check if user is connected to Google Calendar
    const status = await IntegrationService.getStatus('googlecalendar', account);
    if (!status.connected) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Google Calendar not connected. Please connect first.' 
      });
    }

    const created = await callInteractorApi({
      account,
      action: 'googlecalendar-v1/action/calendar.events.quickAdd',
      data: { 
        calendarId: "primary",
        text: text.trim(),
        sendNotifications: "false",
        sendUpdates: "none"
      }
    });

    if (!created.success) {
      return res.status(502).json({ ok: false, error: created.error || 'Failed to create event' });
    }

    return res.json({ 
      ok: true, 
      event: created.output,
      created: !!created.output
    });
  } catch (e: any) {
    console.error('[Calendar Quick Add] Error:', e);
    return res.status(500).json({ ok: false, error: e?.message || 'Internal server error' });
  }
});

export default router;
