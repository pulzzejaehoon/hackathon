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
    const status = await IntegrationService.getStatus('google-calendar', account);
    if (!status.connected) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Google Calendar not connected. Please connect first.' 
      });
    }

    const api = await callInteractorApi({
      account,
      connector: 'googlecalendar-v1',
      action: 'calendar.calendarList.list',
      data: {
        maxResults: 250,
        showHidden: false
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
    const status = await IntegrationService.getStatus('google-calendar', account);
    if (!status.connected) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Google Calendar not connected. Please connect first.' 
      });
    }

    const created = await callInteractorApi({
      account,
      connector: 'googlecalendar-v1',
      action: 'calendar.events.quickAdd',
      data: { 
        calendarId: "primary",
        text: text.trim(),
        sendNotifications: false
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

/**
 * GET /api/calendar/events/list
 * List events from a calendar with optional query parameters
 */
router.get('/events/list', async (req: Request, res: Response) => {
  try {
    const account = (req as any).user?.email;
    if (!account) return res.status(401).json({ ok: false, error: 'Unauthorized: missing user context' });

    const status = await IntegrationService.getStatus('google-calendar', account);
    if (!status.connected) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Google Calendar not connected. Please connect first.' 
      });
    }

    const { 
      calendarId = 'primary', 
      timeMin, 
      timeMax, 
      maxResults = 10, 
      orderBy = 'startTime', 
      singleEvents = 'true',
      q 
    } = req.query;

    const api = await callInteractorApi({
      account,
      connector: 'googlecalendar-v1',
      action: 'calendar.events.list',
      data: {
        calendarId,
        timeMin: timeMin || undefined,
        timeMax: timeMax || undefined,
        maxResults: Math.min(Number(maxResults), 250),
        orderBy,
        singleEvents: singleEvents === 'true',
        q: q || undefined
      }
    });

    if (!api.success) {
      return res.status(502).json({ ok: false, error: api.error || 'Failed to fetch events' });
    }

    return res.json({ ok: true, events: api.output });
  } catch (e: any) {
    console.error('[Calendar Events List] Error:', e);
    return res.status(500).json({ ok: false, error: e?.message || 'Internal server error' });
  }
});

/**
 * POST /api/calendar/events/create
 * Create a new calendar event
 * Body: { calendarId?, summary: string, start: object, end: object, description?, location?, attendees? }
 */
router.post('/events/create', async (req: Request, res: Response) => {
  try {
    const account = (req as any).user?.email;
    const { 
      calendarId = 'primary', 
      summary, 
      start, 
      end, 
      description, 
      location, 
      attendees 
    } = req.body || {};

    if (!account) return res.status(401).json({ ok: false, error: 'Unauthorized: missing user context' });
    
    if (!summary || !start || !end) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Missing required fields: summary, start, end' 
      });
    }

    const status = await IntegrationService.getStatus('google-calendar', account);
    if (!status.connected) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Google Calendar not connected. Please connect first.' 
      });
    }

    const api = await callInteractorApi({
      account,
      connector: 'googlecalendar-v1',
      action: 'calendar.events.insert',
      data: {
        calendarId,
        summary,
        start,
        end,
        description: description || undefined,
        location: location || undefined,
        attendees: attendees || undefined,
        sendNotifications: false
      }
    });

    if (!api.success) {
      return res.status(502).json({ ok: false, error: api.error || 'Failed to create event' });
    }

    return res.json({ ok: true, event: api.output });
  } catch (e: any) {
    console.error('[Calendar Create Event] Error:', e);
    return res.status(500).json({ ok: false, error: e?.message || 'Internal server error' });
  }
});

/**
 * GET /api/calendar/events/:eventId
 * Get a specific event by ID
 */
router.get('/events/:eventId', async (req: Request, res: Response) => {
  try {
    const account = (req as any).user?.email;
    const { eventId } = req.params;
    const { calendarId = 'primary' } = req.query;

    if (!account) return res.status(401).json({ ok: false, error: 'Unauthorized: missing user context' });

    const status = await IntegrationService.getStatus('google-calendar', account);
    if (!status.connected) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Google Calendar not connected. Please connect first.' 
      });
    }

    const api = await callInteractorApi({
      account,
      connector: 'googlecalendar-v1',
      action: 'calendar.events.get',
      data: {
        calendarId,
        eventId
      }
    });

    if (!api.success) {
      return res.status(502).json({ ok: false, error: api.error || 'Failed to fetch event' });
    }

    return res.json({ ok: true, event: api.output });
  } catch (e: any) {
    console.error('[Calendar Get Event] Error:', e);
    return res.status(500).json({ ok: false, error: e?.message || 'Internal server error' });
  }
});

/**
 * PUT /api/calendar/events/:eventId
 * Update a specific event by ID
 */
router.put('/events/:eventId', async (req: Request, res: Response) => {
  try {
    const account = (req as any).user?.email;
    const { eventId } = req.params;
    const { 
      calendarId = 'primary', 
      summary, 
      start, 
      end, 
      description, 
      location, 
      attendees 
    } = req.body || {};

    if (!account) return res.status(401).json({ ok: false, error: 'Unauthorized: missing user context' });

    const status = await IntegrationService.getStatus('google-calendar', account);
    if (!status.connected) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Google Calendar not connected. Please connect first.' 
      });
    }

    const api = await callInteractorApi({
      account,
      connector: 'googlecalendar-v1',
      action: 'calendar.events.update',
      data: {
        calendarId,
        eventId,
        summary: summary || undefined,
        start: start || undefined,
        end: end || undefined,
        description: description || undefined,
        location: location || undefined,
        attendees: attendees || undefined,
        sendNotifications: false
      }
    });

    if (!api.success) {
      return res.status(502).json({ ok: false, error: api.error || 'Failed to update event' });
    }

    return res.json({ ok: true, event: api.output });
  } catch (e: any) {
    console.error('[Calendar Update Event] Error:', e);
    return res.status(500).json({ ok: false, error: e?.message || 'Internal server error' });
  }
});

/**
 * DELETE /api/calendar/events/:eventId
 * Delete a specific event by ID
 */
router.delete('/events/:eventId', async (req: Request, res: Response) => {
  try {
    const account = (req as any).user?.email;
    const { eventId } = req.params;
    const { calendarId = 'primary' } = req.query;

    if (!account) return res.status(401).json({ ok: false, error: 'Unauthorized: missing user context' });

    const status = await IntegrationService.getStatus('google-calendar', account);
    if (!status.connected) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Google Calendar not connected. Please connect first.' 
      });
    }

    const api = await callInteractorApi({
      account,
      connector: 'googlecalendar-v1',
      action: 'calendar.events.delete',
      data: {
        calendarId,
        eventId,
        sendNotifications: false
      }
    });

    if (!api.success) {
      return res.status(502).json({ ok: false, error: api.error || 'Failed to delete event' });
    }

    return res.json({ ok: true, deleted: true });
  } catch (e: any) {
    console.error('[Calendar Delete Event] Error:', e);
    return res.status(500).json({ ok: false, error: e?.message || 'Internal server error' });
  }
});

/**
 * POST /api/calendar/calendars/create
 * Create a new secondary calendar
 * Body: { summary: string, description?, timeZone? }
 */
router.post('/calendars/create', async (req: Request, res: Response) => {
  try {
    const account = (req as any).user?.email;
    const { summary, description, timeZone = 'UTC' } = req.body || {};

    if (!account) return res.status(401).json({ ok: false, error: 'Unauthorized: missing user context' });
    
    if (!summary) {
      return res.status(400).json({ ok: false, error: 'Calendar summary is required' });
    }

    const status = await IntegrationService.getStatus('google-calendar', account);
    if (!status.connected) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Google Calendar not connected. Please connect first.' 
      });
    }

    const api = await callInteractorApi({
      account,
      connector: 'googlecalendar-v1',
      action: 'calendar.calendars.insert',
      data: {
        summary,
        description: description || undefined,
        timeZone
      }
    });

    if (!api.success) {
      return res.status(502).json({ ok: false, error: api.error || 'Failed to create calendar' });
    }

    return res.json({ ok: true, calendar: api.output });
  } catch (e: any) {
    console.error('[Calendar Create] Error:', e);
    return res.status(500).json({ ok: false, error: e?.message || 'Internal server error' });
  }
});

/**
 * GET /api/calendar/freebusy
 * Check free/busy information for calendars
 * Query: { timeMin: string, timeMax: string, items: string (comma-separated calendar IDs) }
 */
router.get('/freebusy', async (req: Request, res: Response) => {
  try {
    const account = (req as any).user?.email;
    const { timeMin, timeMax, items } = req.query;

    if (!account) return res.status(401).json({ ok: false, error: 'Unauthorized: missing user context' });
    
    if (!timeMin || !timeMax || !items) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Missing required parameters: timeMin, timeMax, items' 
      });
    }

    const status = await IntegrationService.getStatus('google-calendar', account);
    if (!status.connected) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Google Calendar not connected. Please connect first.' 
      });
    }

    // Parse comma-separated calendar IDs into items array
    const calendarItems = String(items).split(',').map(id => ({ id: id.trim() }));

    const api = await callInteractorApi({
      account,
      connector: 'googlecalendar-v1',
      action: 'calendar.freebusy.query',
      data: {
        timeMin,
        timeMax,
        items: calendarItems
      }
    });

    if (!api.success) {
      return res.status(502).json({ ok: false, error: api.error || 'Failed to query free/busy' });
    }

    return res.json({ ok: true, freebusy: api.output });
  } catch (e: any) {
    console.error('[Calendar FreeBusy] Error:', e);
    return res.status(500).json({ ok: false, error: e?.message || 'Internal server error' });
  }
});

export default router;
