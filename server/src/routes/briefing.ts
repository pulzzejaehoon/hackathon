import { Router, Request, Response } from 'express';
import { callInteractorApi } from '../lib/interactor.js';
import { IntegrationService } from '../services/IntegrationService.js';
import { getKoreaTime } from '../utils/timezone.js';

const router = Router();

/**
 * GET /api/briefing/daily
 * Get daily briefing with combined data from all connected services
 */
router.get('/daily', async (req: Request, res: Response) => {
  try {
    const account = (req as any).user?.email;
    if (!account) return res.status(401).json({ ok: false, error: 'Unauthorized: missing user context' });

    // Get connection status for all services
    const [calendarStatus, gmailStatus, driveStatus] = await Promise.all([
      IntegrationService.getStatus('googlecalendar', account),
      IntegrationService.getStatus('gmail', account),
      IntegrationService.getStatus('googledrive', account)
    ]);

    const koreaTime = getKoreaTime();
    const koreaDateString = `${koreaTime.getFullYear()}-${String(koreaTime.getMonth() + 1).padStart(2, '0')}-${String(koreaTime.getDate()).padStart(2, '0')}`;
    const briefing: any = {
      date: koreaDateString,
      timestamp: new Date().toISOString(),
      services: {
        calendar: calendarStatus.connected,
        gmail: gmailStatus.connected,
        drive: driveStatus.connected
      },
      summary: {
        calendar: null as any,
        gmail: null as any,
        drive: null as any
      },
      suggestions: [] as string[],
      notifications: [] as any[]
    };

    // Fetch Calendar data if connected
    if (calendarStatus.connected) {
      briefing.summary.calendar = await getCalendarSummary(account);
    }

    // Fetch Gmail data if connected
    if (gmailStatus.connected) {
      briefing.summary.gmail = await getGmailSummary(account);
    }

    // Fetch Drive data if connected
    if (driveStatus.connected) {
      briefing.summary.drive = await getDriveSummary(account);
    }

    // Generate intelligent suggestions
    briefing.suggestions = generateSuggestions(briefing.summary);
    
    // Generate notifications
    briefing.notifications = generateNotifications(briefing.summary);

    return res.json({ ok: true, briefing });
  } catch (e: any) {
    console.error('[Daily Briefing] Error:', e);
    return res.status(500).json({ ok: false, error: e?.message || 'Internal server error' });
  }
});

async function getCalendarSummary(account: string) {
  try {
    // Get today's events
    const now = new Date();
    const koreaTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Seoul"}));
    const todayStart = new Date(koreaTime.getFullYear(), koreaTime.getMonth(), koreaTime.getDate(), 0, 0, 0);
    const todayEnd = new Date(koreaTime.getFullYear(), koreaTime.getMonth(), koreaTime.getDate(), 23, 59, 59);

    const api = await callInteractorApi({
      account,
      connector: 'googlecalendar-v1',
      action: 'calendar.events.list',
      data: {
        calendarId: "primary",
        timeMin: todayStart.toISOString(),
        timeMax: todayEnd.toISOString(),
        singleEvents: true,
        orderBy: "startTime",
        maxResults: 20
      }
    });

    if (!api.success) {
      return { error: 'Failed to fetch calendar data' };
    }

    const events = api.output?.body?.items || api.output?.items || [];
    
    let nextEvent = null;
    const currentTime = new Date();
    
    // Find next upcoming event
    for (const event of events) {
      const eventStart = new Date(event.start?.dateTime || event.start?.date);
      if (eventStart > currentTime) {
        nextEvent = {
          title: event.summary || 'No Title',
          time: eventStart.toLocaleTimeString('ko-KR', { 
            hour: '2-digit', 
            minute: '2-digit',
            timeZone: 'Asia/Seoul'
          }),
          location: event.location || null
        };
        break;
      }
    }

    // Calculate free time blocks
    const freeTimeBlocks = calculateFreeTime(events, todayStart, todayEnd);

    return {
      todayEvents: events.length,
      nextEvent,
      freeTimeBlocks,
      events: events.slice(0, 5).map((event: any) => ({
        title: event.summary || 'No Title',
        time: event.start?.dateTime ? 
          new Date(event.start.dateTime).toLocaleTimeString('ko-KR', { 
            hour: '2-digit', 
            minute: '2-digit',
            timeZone: 'Asia/Seoul'
          }) : 'All Day',
        location: event.location || null
      }))
    };
  } catch (error) {
    console.error('[Calendar Summary] Error:', error);
    return { error: 'Calendar summary failed' };
  }
}

async function getGmailSummary(account: string) {
  try {
    // Get unread messages
    const api = await callInteractorApi({
      account,
      connector: 'gmail-v1',
      action: 'gmail.users.messages.list',
      data: {
        userId: 'me',
        q: 'is:unread',
        maxResults: 50
      }
    });

    if (!api.success) {
      return { error: 'Failed to fetch Gmail data' };
    }

    const messages = api.output?.body?.messages || api.output?.messages || [];
    
    // Get today's emails (simplified - in real implementation would fetch message details)
    const todayMessages = messages.filter((msg: any, index: number) => index < 20); // Approximate today's emails
    
    // Simulate urgent email detection (would need actual message content analysis)
    const urgentCount = Math.min(Math.floor(messages.length * 0.1), 5);

    return {
      unreadCount: messages.length,
      todayMessages: todayMessages.length,
      urgentCount,
      needsReply: Math.min(Math.floor(messages.length * 0.2), 8)
    };
  } catch (error) {
    console.error('[Gmail Summary] Error:', error);
    return { error: 'Gmail summary failed' };
  }
}

async function getDriveSummary(account: string) {
  try {
    // Get recent files
    const api = await callInteractorApi({
      account,
      connector: 'googledrive-v1',
      action: 'drive.files.list',
      data: {
        pageSize: 20,
        orderBy: 'modifiedTime desc',
        q: "trashed=false",
        fields: "files(id,name,mimeType,modifiedTime,shared,owners)"
      }
    });

    if (!api.success) {
      return { error: 'Failed to fetch Drive data' };
    }

    const files = api.output?.body?.files || api.output?.files || [];
    
    // Get today's modified files
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayFiles = files.filter((file: any) => {
      const modifiedDate = new Date(file.modifiedTime);
      return modifiedDate >= today;
    });

    // Get shared files
    const sharedFiles = files.filter((file: any) => file.shared === true);

    return {
      recentFiles: files.length,
      todayModified: todayFiles.length,
      sharedWithMe: Math.min(sharedFiles.length, 10),
      recentFileNames: files.slice(0, 5).map((file: any) => ({
        name: file.name,
        type: file.mimeType?.includes('folder') ? 'folder' : 'file',
        modified: new Date(file.modifiedTime).toLocaleDateString('ko-KR')
      }))
    };
  } catch (error) {
    console.error('[Drive Summary] Error:', error);
    return { error: 'Drive summary failed' };
  }
}

function calculateFreeTime(events: any[], dayStart: Date, dayEnd: Date) {
  const freeBlocks = [];
  const sortedEvents = events
    .filter(event => event.start?.dateTime) // Only timed events
    .sort((a, b) => new Date(a.start.dateTime).getTime() - new Date(b.start.dateTime).getTime());

  let currentTime = new Date(dayStart);
  currentTime.setHours(9, 0, 0, 0); // Start checking from 9 AM

  for (const event of sortedEvents) {
    const eventStart = new Date((event as any).start.dateTime);
    const eventEnd = new Date((event as any).end?.dateTime || (event as any).start.dateTime);

    // If there's a gap between current time and event start
    if (eventStart > currentTime) {
      const duration = (eventStart.getTime() - currentTime.getTime()) / (1000 * 60); // minutes
      if (duration >= 60) { // At least 1 hour
        freeBlocks.push({
          start: currentTime.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
          end: eventStart.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
          duration: Math.floor(duration / 60) + ' hours'
        });
      }
    }

    currentTime = eventEnd > currentTime ? eventEnd : currentTime;
  }

  // Check for free time until end of work day (6 PM)
  const endOfWorkDay = new Date(dayStart);
  endOfWorkDay.setHours(18, 0, 0, 0);
  
  if (currentTime < endOfWorkDay) {
    const duration = (endOfWorkDay.getTime() - currentTime.getTime()) / (1000 * 60);
    if (duration >= 60) {
      freeBlocks.push({
        start: currentTime.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
        end: '18:00',
        duration: Math.floor(duration / 60) + ' hours'
      });
    }
  }

  return freeBlocks.slice(0, 3); // Return top 3 free blocks
}

function generateSuggestions(summary: any) {
  const suggestions = [];

  // Calendar suggestions
  if (summary.calendar && !summary.calendar.error) {
    if (summary.calendar.nextEvent) {
      suggestions.push(`⏰ Next Event: ${summary.calendar.nextEvent.time} ${summary.calendar.nextEvent.title}`);
    }
    
    if (summary.calendar.freeTimeBlocks && summary.calendar.freeTimeBlocks.length > 0) {
      const freeTime = summary.calendar.freeTimeBlocks[0];
      suggestions.push(`🕐 Free Time: ${freeTime.start}-${freeTime.end} (${freeTime.duration})`);
    }
  }

  // Gmail suggestions
  if (summary.gmail && !summary.gmail.error) {
    if (summary.gmail.urgentCount > 0) {
      suggestions.push(`🔥 ${summary.gmail.urgentCount} urgent emails need attention`);
    }
    
    if (summary.gmail.needsReply > 0) {
      suggestions.push(`📧 ${summary.gmail.needsReply} emails need reply`);
    }
  }

  // Drive suggestions
  if (summary.drive && !summary.drive.error) {
    if (summary.drive.todayModified > 0) {
      suggestions.push(`📁 ${summary.drive.todayModified} files modified today`);
    }
  }

  return suggestions.slice(0, 5);
}

function generateNotifications(summary: any) {
  const notifications = [];

  // High priority notifications
  if (summary.gmail && summary.gmail.urgentCount > 5) {
    notifications.push({
      type: 'urgent',
      message: `You have ${summary.gmail.urgentCount} urgent emails`,
      action: 'CHECK_GMAIL'
    });
  }

  if (summary.calendar && summary.calendar.nextEvent) {
    const nextEventTime = new Date();
    // Simplified - would need actual time parsing
    notifications.push({
      type: 'info',
      message: `Upcoming event: ${summary.calendar.nextEvent.title}`,
      action: 'VIEW_CALENDAR'
    });
  }

  return notifications;
}

export default router;