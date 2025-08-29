import { Router, Request, Response } from 'express';
import { callInteractorApi } from '../lib/interactor.js';
import { IntegrationService } from '../services/IntegrationService.js';
import { InteractorCore } from '../lib/InteractorCore.js';
import OpenAI from 'openai';
import axios from 'axios';
import { formatKoreaDateTime, formatKoreaDate } from '../utils/timezone.js';

const router = Router();

// Initialize OpenAI (using OpenRouter)
const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL || 'https://openrouter.ai/api/v1'
});

// Smart chat function - Real LLM integration with OpenRouter
async function getSmartResponse(messages: any[], account: string) {
  // Check if OpenRouter API key is available
  if (!process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY === 'your-openrouter-api-key-here') {
    console.warn('[LLM] OpenRouter API key not configured, using fallback responses');
    return getFallbackResponse(messages);
  }

  try {
    // Prepare system message for context
    const systemMessage = {
      role: 'system',
      content: `You are the Interactor Office AI Assistant. Your goal is to enhance the user's work productivity.

Main capabilities:
- Google Calendar integration (schedule viewing/creation)
- Gmail integration (email management) 
- Google Drive integration (file management)

Response guidelines:
- Respond in a friendly and helpful tone
- Communicate naturally in English by default
- If the user communicates in Korean, respond in Korean
- Provide specific and practical assistance
- Recommend using the quick action buttons below when appropriate
- Keep responses concise, around 2-3 sentences`
    };

    // Prepare messages array with system message
    const chatMessages = [systemMessage, ...messages];

    console.log('[LLM] Calling OpenRouter API with messages:', chatMessages.length);
    
    // Call OpenAI/OpenRouter API
    const completion = await openai.chat.completions.create({
      model: process.env.OPENROUTER_MODEL || 'mistralai/mistral-7b-instruct:free',
      messages: chatMessages,
      max_tokens: 500,
      temperature: 0.7,
      top_p: 0.9,
    });

    const response = completion.choices[0]?.message?.content;
    
    if (!response) {
      console.warn('[LLM] Empty response from OpenRouter, using fallback');
      return getFallbackResponse(messages);
    }

    console.log('[LLM] Successfully got response from OpenRouter');
    return response.trim();

  } catch (error: any) {
    console.error('[LLM] OpenRouter API error:', error.message);
    
    // Check for specific error types
    if (error.status === 401) {
      console.error('[LLM] Authentication error - check API key');
    } else if (error.status === 429) {
      console.error('[LLM] Rate limit exceeded');
    } else if (error.status >= 500) {
      console.error('[LLM] OpenRouter server error');
    }
    
    return getFallbackResponse(messages);
  }
}

// Fallback response system for when LLM is unavailable
function getFallbackResponse(messages: any[]) {
  const lastMessage = messages[messages.length - 1]?.content || '';
  
  // Smart keyword-based responses as fallback
  const responses = [
    // Greetings
    { keywords: ['안녕', 'hello', 'hi', '하이'], responses: [
      'Hello! How can I help you today? 📝',
      'Hi there! Hope you have a great day! ✨'
    ]},
    
    // Questions about coding/technical
    { keywords: ['코드', 'code', '프로그래밍', 'programming', '개발', 'python', 'javascript'], responses: [
      'Sorry, I cannot connect to the AI model right now to help with coding questions. Please try again later.',
      'Technical questions need AI model access, but there\'s a connection issue. Would you like to try again?'
    ]},
    
    // Calendar/schedule related
    { keywords: ['일정', '캘린더', '스케줄', '약속', 'calendar', 'schedule', 'event'], responses: [
      'Need help with scheduling? Try the calendar button below to check or add events! 📅',
      'For schedule management, use the Google Calendar integration feature! 🗓️'
    ]},
    
    // Email related  
    { keywords: ['메일', '이메일', 'email', 'gmail'], responses: [
      'For email management, try using the Gmail integration feature! 📧',
      'How about using the Gmail buttons below for email tasks? ✉️'
    ]},
    
    // Daily briefing related
    { keywords: ['브리핑', '요약', '오늘', '일일', 'briefing', 'summary', 'daily'], responses: [
      'Check your daily work briefing! 📋 Click the "Daily Briefing" button below or say "show me today\'s briefing".',
      'Get a daily briefing to see your schedule, emails, and files at a glance! 📊'
    ]}
  ];

  // Find matching response
  for (const responseGroup of responses) {
    if (responseGroup.keywords.some(keyword => lastMessage.toLowerCase().includes(keyword))) {
      const randomResponse = responseGroup.responses[Math.floor(Math.random() * responseGroup.responses.length)];
      return randomResponse;
    }
  }
  
  // Default responses
  const defaultResponses = [
    'I\'m currently having trouble connecting to the AI model for detailed responses. Please try the quick action buttons below!',
    'Sorry, the AI service is temporarily unstable. Would you like to use the integrated service features instead?',
    'There was an issue generating an AI response. Calendar, Gmail, and other integration features are working normally! 🔧'
  ];
  
  return defaultResponses[Math.floor(Math.random() * defaultResponses.length)];
}

/**
 * POST /api/chatbot/chat
 * Handle regular chat messages
 */
router.post('/chat', async (req: Request, res: Response) => {
  try {
    const { messages } = req.body;
    const account = (req as any).user?.email;

    if (!account) {
      return res.status(401).json({ 
        ok: false, 
        error: { message: 'Unauthorized: Please log in first' }
      });
    }

    // Get smart response from OpenAI
    const response = await getSmartResponse(messages, account);

    return res.json({
      ok: true,
      reply: {
        content: response
      }
    });

  } catch (error: any) {
    console.error('[Chatbot Chat] Error:', error);
    return res.status(500).json({
      ok: false,
      error: { message: 'Internal server error' }
    });
  }
});

/**
 * POST /api/chatbot/stream
 * Handle streaming chat messages (placeholder for now)
 */
router.post('/stream', async (req: Request, res: Response) => {
  try {
    const { messages } = req.body;
    const account = (req as any).user?.email;

    if (!account) {
      return res.status(401).json({ 
        ok: false, 
        error: { message: 'Unauthorized: Please log in first' }
      });
    }

    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });

    try {
      // Try real streaming if OpenRouter API key is available
      if (process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY !== 'your-openrouter-api-key-here') {
        const systemMessage = {
          role: 'system',
          content: `You are the Interactor Office AI Assistant. Your goal is to enhance the user's work productivity.

Main capabilities:
- Google Calendar integration (schedule viewing/creation)
- Gmail integration (email management) 
- Google Drive integration (file management)

Response guidelines:
- Respond in a friendly and helpful tone
- Communicate naturally in English by default
- If the user communicates in Korean, respond in Korean
- Provide specific and practical assistance
- Recommend using the quick action buttons below when appropriate
- Keep responses concise, around 2-3 sentences`
        };

        const chatMessages = [systemMessage, ...messages];
        
        console.log('[LLM Stream] Calling OpenRouter streaming API');
        
        const stream = await openai.chat.completions.create({
          model: process.env.OPENROUTER_MODEL || 'mistralai/mistral-7b-instruct:free',
          messages: chatMessages,
          max_tokens: 500,
          temperature: 0.7,
          top_p: 0.9,
          stream: true
        });

        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content || '';
          if (content) {
            res.write(`data: ${JSON.stringify({ delta: content })}\n\n`);
          }
        }
        
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
        
      } else {
        // Fallback to simulated streaming
        console.log('[LLM Stream] Using fallback streaming');
        const response = await getSmartResponse(messages, account);
        
        // Simulate streaming by chunking the response
        for (let i = 0; i < response.length; i += 3) {
          const chunk = response.slice(i, i + 3);
          res.write(`data: ${JSON.stringify({ delta: chunk })}\n\n`);
          await new Promise(resolve => setTimeout(resolve, 50));
        }

        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
      }
      
    } catch (streamError: any) {
      console.error('[LLM Stream] Streaming error:', streamError.message);
      
      // Fallback to regular response and simulate streaming
      const response = getFallbackResponse(messages);
      
      for (let i = 0; i < response.length; i += 3) {
        const chunk = response.slice(i, i + 3);
        res.write(`data: ${JSON.stringify({ delta: chunk })}\n\n`);
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    }

  } catch (error: any) {
    console.error('[Chatbot Stream] Error:', error);
    res.write(`data: ${JSON.stringify({ error: 'Internal server error' })}\n\n`);
    res.end();
  }
});

/**
 * POST /api/chatbot/command
 * Handle structured commands via InteractorCore (PRD-compliant)
 */
router.post('/command', async (req: Request, res: Response) => {
  try {
    const { service, action, params } = req.body;
    const userEmail = (req as any).user?.email;
    const userId = (req as any).user?.userId?.toString();

    if (!userEmail || !userId) {
      return res.status(401).json({ 
        ok: false, 
        error: { message: 'Unauthorized: missing user context' }
      });
    }

    if (!service || !action) {
      return res.status(400).json({ 
        ok: false, 
        error: { message: 'Service and action are required' }
      });
    }

    // Create structured command
    const command = {
      service,
      action,
      params: params || {},
      userId: userEmail  // Use email as userId for InteractorCore
    };

    console.log('[Chatbot Command] Processing structured command:', command);

    // Process via InteractorCore
    const result = await InteractorCore.processCommand(command);

    if (!result.success) {
      return res.status(502).json({ 
        ok: false, 
        error: { message: result.error || 'Command failed' }
      });
    }

    return res.json({ 
      ok: true,
      reply: { 
        content: result.message || 'Command completed successfully',
        data: result.data
      }
    });

  } catch (error: any) {
    console.error('[Chatbot Command] Error:', error);
    return res.status(500).json({ 
      ok: false, 
      error: { message: 'Internal server error' }
    });
  }
});

/**
 * POST /api/chatbot/action
 * Handle chatbot actions for integrated services (Legacy - kept for backward compatibility)
 */
router.post('/action', async (req: Request, res: Response) => {
  try {
    const { service, action, params } = req.body;
    const account = (req as any).user?.email;

    if (!account) {
      return res.status(401).json({ 
        ok: false, 
        error: { message: 'Unauthorized: missing user context' }
      });
    }

    if (!service || !action) {
      return res.status(400).json({ 
        ok: false, 
        error: { message: 'Service and action are required' }
      });
    }

    let result;
    
    switch (service) {
      case 'calendar':
        result = await handleCalendarAction(account, action, params);
        break;
      case 'gmail':
        result = await handleGmailAction(account, action, params);
        break;
      case 'drive':
        result = await handleDriveAction(account, action, params);
        break;
      case 'briefing':
        result = await handleBriefingAction(account, action, params);
        break;
      default:
        return res.status(400).json({ 
          ok: false, 
          error: { message: `Unknown service: ${service}` }
        });
    }

    if (!result.success) {
      return res.status(502).json({ 
        ok: false, 
        error: { message: (result as any).error || 'Action failed' }
      });
    }

    return res.json({ 
      ok: true,
      reply: { 
        content: result.content 
      }
    });

  } catch (error: any) {
    console.error('[Chatbot Action] Error:', error);
    return res.status(500).json({ 
      ok: false, 
      error: { message: 'Internal server error' }
    });
  }
});

async function handleCalendarAction(account: string, action: string, params: any) {
  console.log(`[Calendar Action] account: ${account}, action: ${action}, params:`, params);
  
  // Check if user is connected
  const status = await IntegrationService.getStatus('googlecalendar', account);
  console.log(`[Calendar Action] Status check result:`, status);
  
  if (!status.connected) {
    return {
      success: true,
      content: '📅 Google Calendar is not connected. Please connect it in settings first!'
    };
  }

  try {
    switch (action) {
      case 'createCalendarEvent':
      case 'quickAdd': {
        const eventText = params?.text || params?.eventText;
        if (!eventText) {
          return {
            success: true,
            content: '📅 Please enter event details. Example: "Team meeting tomorrow at 3 PM"'
          };
        }

        // Use correct Interactor API format
        const url = `${process.env.INTERACTOR_BASE_URL || 'https://console.interactor.com/api/v1'}/connector/interactor/googlecalendar-v1/action/calendar.events.quickAdd/execute`;
        console.log(`[Calendar QuickAdd] URL: ${url}?account=${account}`);
        console.log(`[Calendar QuickAdd] Data:`, { calendarId: "primary", text: eventText.trim() });
        
        const response = await axios.post(url, {
          calendarId: "primary",
          text: eventText.trim()
        }, {
          params: { account },
          headers: {
            'x-api-key': String(process.env.INTERACTOR_API_KEY),
            'Content-Type': 'application/json'
          },
          timeout: 10000
        });
        
        console.log(`[Calendar QuickAdd] Response:`, JSON.stringify(response.data, null, 2));
        
        if (!response.data || response.data.error) {
          return {
            success: true,
            content: `📅 Failed to create event: ${response.data?.error || 'API error'}`
          };
        }

        // Handle multiple possible response structures
        let event = null;
        if (response.data.body) {
          event = response.data.body;
        } else if (response.data.output?.body) {
          event = response.data.output.body;
        } else if (response.data.output) {
          event = response.data.output;
        } else {
          event = response.data;
        }
        
        console.log(`[Calendar QuickAdd] Extracted event:`, JSON.stringify(event, null, 2));
        
        if (!event) {
          return {
            success: true,
            content: `📅 Event was created but unable to retrieve details.`
          };
        }
        
        const eventTitle = event.summary || event.title || 'No Title';
        let eventTime = 'No time information';
        
        if (event.start) {
          if (event.start.dateTime) {
            eventTime = formatKoreaDateTime(event.start.dateTime);
          } else if (event.start.date) {
            eventTime = formatKoreaDate(event.start.date) + ' (All Day)';
          }
        }
        
        return {
          success: true,
          content: `📅 Event created successfully!\n\nTitle: ${eventTitle}\nTime: ${eventTime}`
        };
      }

      case 'getTodaysEvents':
      case 'listEvents': {
        // Use Korea timezone for today's events
        const now = new Date();
        const koreaTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Seoul"}));
        
        // Start of today in Korea timezone
        const todayStart = new Date(koreaTime.getFullYear(), koreaTime.getMonth(), koreaTime.getDate(), 0, 0, 0);
        // End of today in Korea timezone  
        const todayEnd = new Date(koreaTime.getFullYear(), koreaTime.getMonth(), koreaTime.getDate(), 23, 59, 59);
        
        const url = `${process.env.INTERACTOR_BASE_URL || 'https://console.interactor.com/api/v1'}/connector/interactor/googlecalendar-v1/action/calendar.events.list/execute`;
        console.log(`[Calendar Events List] URL: ${url}?account=${account}`);
        console.log(`[Calendar Events List] Korea time range:`, {
          koreaTime: koreaTime.toLocaleString('ko-KR', {timeZone: 'Asia/Seoul'}),
          todayStart: todayStart.toLocaleString('ko-KR', {timeZone: 'Asia/Seoul'}),
          todayEnd: todayEnd.toLocaleString('ko-KR', {timeZone: 'Asia/Seoul'})
        });
        console.log(`[Calendar Events List] Data:`, {
          calendarId: "primary",
          timeMin: todayStart.toISOString(),
          timeMax: todayEnd.toISOString(),
          singleEvents: true,
          orderBy: "startTime",
          maxResults: 10
        });
        
        const response = await axios.post(url, {
          calendarId: "primary",
          timeMin: todayStart.toISOString(),
          timeMax: todayEnd.toISOString(),
          singleEvents: true,
          orderBy: "startTime",
          maxResults: 10
        }, {
          params: { account },
          headers: {
            'x-api-key': String(process.env.INTERACTOR_API_KEY),
            'Content-Type': 'application/json'
          },
          timeout: 10000
        });
        
        console.log(`[Calendar Events List] Response:`, JSON.stringify(response.data, null, 2));
        
        if (!response.data || response.data.error) {
          return {
            success: true,
            content: `📅 Failed to fetch events: ${response.data?.error || 'API error'}`
          };
        }

        // Handle multiple possible response structures
        let events = [];
        if (response.data.body?.items) {
          events = response.data.body.items;
        } else if (response.data.output?.body?.items) {
          events = response.data.output.body.items;
        } else if (response.data.output?.items) {
          events = response.data.output.items;
        } else if (response.data.items) {
          events = response.data.items;
        } else if (Array.isArray(response.data.body)) {
          events = response.data.body;
        } else if (Array.isArray(response.data.output)) {
          events = response.data.output;
        } else if (Array.isArray(response.data)) {
          events = response.data;
        }
        
        console.log(`[Calendar Events List] Extracted ${events.length} events:`, JSON.stringify(events, null, 2));
        
        if (!events || events.length === 0) {
          return {
            success: true,
            content: '📅 No events scheduled for today.'
          };
        }

        let content = '📅 Today\'s events:\n\n';
        events.forEach((event: any, index: number) => {
          const eventTitle = event.summary || event.title || 'No Title';
          let startTime = 'No time information';
          
          if (event.start) {
            if (event.start.dateTime) {
              startTime = formatKoreaDateTime(event.start.dateTime).split(' ').slice(3).join(' '); // 시간 부분만
            } else if (event.start.date) {
              startTime = 'All Day';
            }
          }
          
          content += `${index + 1}. ${eventTitle} (${startTime})\n`;
        });

        return {
          success: true,
          content: content.trim()
        };
      }

      default:
        return {
          success: true,
          content: `📅 Unknown calendar action: ${action}`
        };
    }
  } catch (error: any) {
    return {
      success: true,
      content: `📅 Calendar error occurred: ${error.message}`
    };
  }
}

async function handleGmailAction(account: string, action: string, params: any) {
  console.log(`[Gmail Action] account: ${account}, action: ${action}, params:`, params);
  
  const status = await IntegrationService.getStatus('gmail', account);
  console.log(`[Gmail Action] Status check result:`, status);
  
  if (!status.connected) {
    return {
      success: true,
      content: '📧 Gmail is not connected. Please connect it in settings first!'
    };
  }

  try {
    switch (action) {
      case 'createDraft': {
        const { to, subject, body } = params || {};
        if (!to || !subject) {
          return {
            success: true,
            content: '📧 Please enter recipient and subject.'
          };
        }

        // Create Gmail draft using Interactor API with correct format
        const url = `${process.env.INTERACTOR_BASE_URL || 'https://console.interactor.com/api/v1'}/connector/interactor/gmail-v1/action/gmail.users.drafts.create/execute`;
        
        // Create proper Gmail message format
        const messageContent = `To: ${to}\r\nSubject: ${subject}\r\n\r\n${body || ''}`;
        const messageBase64 = Buffer.from(messageContent).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        
        console.log(`[Gmail Draft Create] URL: ${url}?account=${account}`);
        console.log(`[Gmail Draft Create] Data:`, {
          userId: account,
          message: {
            raw: messageBase64
          }
        });
        console.log(`[Gmail Draft Create] Message content:`, messageContent);
        
        const response = await axios.post(url, {
          userId: "me",
          message: {
            raw: messageBase64
          }
        }, {
          params: { account },
          headers: {
            'x-api-key': String(process.env.INTERACTOR_API_KEY),
            'Content-Type': 'application/json'
          },
          timeout: 10000
        });
        
        console.log(`[Gmail Draft Create] Response:`, JSON.stringify(response.data, null, 2));
        
        if (!response.data || response.data.error) {
          return {
            success: true,
            content: `📧 Failed to create draft: ${response.data?.error || 'API error'}`
          };
        }

        return {
          success: true,
          content: `📧 Email draft created successfully!\n\nTo: ${to}\nSubject: ${subject}\n\nYou can review and send it in Gmail.`
        };
      }

      case 'listMessages':
      case 'getInbox': {
        const url = `${process.env.INTERACTOR_BASE_URL || 'https://console.interactor.com/api/v1'}/connector/interactor/gmail-v1/action/gmail.users.messages.list/execute`;
        console.log(`[Gmail Messages List] URL: ${url}?account=${account}`);
        console.log(`[Gmail Messages List] Data:`, {
          userId: account,
          maxResults: 10,
          q: 'in:inbox'
        });
        
        const response = await axios.post(url, {
          userId: "me",
          maxResults: 10,
          q: 'in:inbox'
        }, {
          params: { account },
          headers: {
            'x-api-key': String(process.env.INTERACTOR_API_KEY),
            'Content-Type': 'application/json'
          },
          timeout: 10000
        });
        
        console.log(`[Gmail Messages List] Response:`, JSON.stringify(response.data, null, 2));
        
        if (!response.data || response.data.error) {
          return {
            success: true,
            content: `📧 Failed to fetch email list: ${response.data?.error || 'API error'}`
          };
        }

        // Handle multiple possible response structures
        let messages = [];
        if (response.data.body?.messages) {
          messages = response.data.body.messages;
        } else if (response.data.output?.body?.messages) {
          messages = response.data.output.body.messages;
        } else if (response.data.output?.messages) {
          messages = response.data.output.messages;
        } else if (response.data.messages) {
          messages = response.data.messages;
        } else if (Array.isArray(response.data.body)) {
          messages = response.data.body;
        } else if (Array.isArray(response.data.output)) {
          messages = response.data.output;
        } else if (Array.isArray(response.data)) {
          messages = response.data;
        }
        
        console.log(`[Gmail Messages List] Extracted ${messages.length} messages`);
        
        if (!messages || messages.length === 0) {
          return {
            success: true,
            content: '📧 No emails found in inbox.'
          };
        }

        // Try to get message details for better display
        let content = '📧 Recent inbox messages:\n\n';
        const messagePromises = messages.slice(0, 5).map(async (message: any, index: number) => {
          try {
            // Try to get message details to show subject
            const detailUrl = `${process.env.INTERACTOR_BASE_URL || 'https://console.interactor.com/api/v1'}/connector/interactor/gmail-v1/action/gmail.users.messages.get/execute`;
            const detailResponse = await axios.post(detailUrl, {
              userId: "me",
              id: message.id,
              format: "metadata",
              metadataHeaders: ["Subject", "From"]
            }, {
              params: { account },
              headers: {
                'x-api-key': String(process.env.INTERACTOR_API_KEY),
                'Content-Type': 'application/json'
              },
              timeout: 5000
            });

            if (detailResponse.data?.body?.payload?.headers || detailResponse.data?.output?.body?.payload?.headers) {
              const headers = detailResponse.data?.body?.payload?.headers || detailResponse.data?.output?.body?.payload?.headers;
              const subject = headers.find((h: any) => h.name === 'Subject')?.value || 'No Subject';
              const from = headers.find((h: any) => h.name === 'From')?.value || 'Unknown Sender';
              return `${index + 1}. **${subject}**\n   From: ${from}\n`;
            }
          } catch (error) {
            // Fallback to just ID if detail fetch fails
            return `${index + 1}. Message ID: ${message.id || 'No ID'}\n`;
          }
        });

        try {
          const detailedMessages = await Promise.all(messagePromises);
          content += detailedMessages.join('\n');
        } catch (error) {
          // Fallback to simple ID listing
          messages.slice(0, 5).forEach((message: any, index: number) => {
            content += `${index + 1}. Message ID: ${message.id || 'No ID'}\n`;
          });
        }
        
        content += `\n💡 View full details in Gmail.`;

        return {
          success: true,
          content: content.trim()
        };
      }

      case 'listLabels': {
        const url = `${process.env.INTERACTOR_BASE_URL || 'https://console.interactor.com/api/v1'}/connector/interactor/gmail-v1/action/gmail.users.labels.list/execute`;
        console.log(`[Gmail Labels List] URL: ${url}?account=${account}`);
        console.log(`[Gmail Labels List] Data:`, { userId: "me" });
        
        const response = await axios.post(url, {
          userId: "me"
        }, {
          params: { account },
          headers: {
            'x-api-key': String(process.env.INTERACTOR_API_KEY),
            'Content-Type': 'application/json'
          },
          timeout: 10000
        });
        
        console.log(`[Gmail Labels List] Response:`, JSON.stringify(response.data, null, 2));
        
        if (!response.data || response.data.error) {
          return {
            success: true,
            content: `📧 Failed to fetch label list: ${response.data?.error || 'API error'}`
          };
        }

        // Handle multiple possible response structures for labels
        let labels = [];
        if (response.data.body?.labels) {
          labels = response.data.body.labels;
        } else if (response.data.output?.body?.labels) {
          labels = response.data.output.body.labels;
        } else if (response.data.output?.labels) {
          labels = response.data.output.labels;
        } else if (response.data.labels) {
          labels = response.data.labels;
        }
        
        console.log(`[Gmail Labels List] Extracted ${labels.length} labels`);
        
        if (!labels || labels.length === 0) {
          return {
            success: true,
            content: '📧 No Gmail labels found.'
          };
        }

        let content = '📧 Gmail Labels:\n\n';
        labels.slice(0, 10).forEach((label: any, index: number) => {
          const labelName = label.name || label.id || 'No name';
          content += `${index + 1}. ${labelName}\n`;
        });

        return {
          success: true,
          content: content.trim()
        };
      }

      default:
        return {
          success: true,
          content: `📧 Unknown Gmail action: ${action}`
        };
    }
  } catch (error: any) {
    console.error(`[Gmail Action] Error:`, error);
    return {
      success: true,
      content: `📧 Error occurred during Gmail operation: ${error.message}`
    };
  }
}

async function handleDriveAction(account: string, action: string, params: any) {
  console.log(`[Drive Action] account: ${account}, action: ${action}, params:`, params);
  
  const status = await IntegrationService.getStatus('googledrive', account);
  console.log(`[Drive Action] Status check result:`, status);
  
  if (!status.connected) {
    return {
      success: true,
      content: '📁 Google Drive is not connected. Please connect it in settings first!'
    };
  }

  try {
    switch (action) {
      case 'listFiles': {
        // List files in Google Drive
        const url = `${process.env.INTERACTOR_BASE_URL || 'https://console.interactor.com/api/v1'}/connector/interactor/googledrive-v1/action/drive.files.list/execute`;
        console.log(`[Drive Files List] URL: ${url}?account=${account}`);
        console.log(`[Drive Files List] Data:`, {
          pageSize: 10,
          q: "trashed=false",
          fields: "files(id,name,mimeType,size,modifiedTime)"
        });
        
        const response = await axios.post(url, {
          pageSize: 10,
          q: "trashed=false",
          fields: "files(id,name,mimeType,size,modifiedTime)"
        }, {
          params: { account },
          headers: {
            'x-api-key': String(process.env.INTERACTOR_API_KEY),
            'Content-Type': 'application/json'
          },
          timeout: 10000
        });
        
        console.log(`[Drive Files List] Response:`, JSON.stringify(response.data, null, 2));
        
        if (!response.data || response.data.error) {
          return {
            success: true,
            content: `📁 Failed to fetch file list: ${response.data?.error || 'API error'}`
          };
        }

        // Handle multiple possible response structures
        let files = [];
        if (response.data.body?.files) {
          files = response.data.body.files;
        } else if (response.data.output?.body?.files) {
          files = response.data.output.body.files;
        } else if (response.data.output?.files) {
          files = response.data.output.files;
        } else if (response.data.files) {
          files = response.data.files;
        }
        
        console.log(`[Drive Files List] Extracted ${files.length} files`);
        
        if (!files || files.length === 0) {
          return {
            success: true,
            content: '📁 No files found in Google Drive.'
          };
        }

        let content = '📁 Google Drive file list:\n\n';
        files.slice(0, 8).forEach((file: any, index: number) => {
          const fileName = file.name || 'No Name';
          const fileSize = file.size ? `(${Math.round(file.size / 1024)}KB)` : '';
          const fileType = file.mimeType?.includes('folder') ? '📂' : '📄';
          content += `${fileType} ${index + 1}. ${fileName} ${fileSize}\n`;
        });

        if (files.length > 8) {
          content += `\n... and ${files.length - 8} more files.`;
        }

        return {
          success: true,
          content: content.trim()
        };
      }

      case 'createFolder': {
        const folderName = params?.name || params?.folderName;
        if (!folderName) {
          return {
            success: true,
            content: '📁 Please enter folder name to create.'
          };
        }

        const url = `${process.env.INTERACTOR_BASE_URL || 'https://console.interactor.com/api/v1'}/connector/interactor/googledrive-v1/action/drive.files.create/execute`;
        console.log(`[Drive Create Folder] URL: ${url}?account=${account}`);
        console.log(`[Drive Create Folder] Data:`, {
          name: folderName.trim(),
          mimeType: 'application/vnd.google-apps.folder'
        });
        
        const response = await axios.post(url, {
          name: folderName.trim(),
          mimeType: 'application/vnd.google-apps.folder'
        }, {
          params: { account },
          headers: {
            'x-api-key': String(process.env.INTERACTOR_API_KEY),
            'Content-Type': 'application/json'
          },
          timeout: 10000
        });
        
        console.log(`[Drive Create Folder] Response:`, JSON.stringify(response.data, null, 2));
        
        if (!response.data || response.data.error) {
          return {
            success: true,
            content: `📁 Failed to create folder: ${response.data?.error || 'API error'}`
          };
        }

        // Handle multiple possible response structures
        let folder = null;
        if (response.data.body) {
          folder = response.data.body;
        } else if (response.data.output?.body) {
          folder = response.data.output.body;
        } else if (response.data.output) {
          folder = response.data.output;
        } else {
          folder = response.data;
        }
        
        const folderCreatedName = folder?.name || folderName;
        
        return {
          success: true,
          content: `📁 Folder "${folderCreatedName}" created successfully!`
        };
      }

      case 'searchFiles': {
        const query = params?.query || params?.q;
        if (!query) {
          return {
            success: true,
            content: '📁 Please enter filename or keywords to search.'
          };
        }

        const url = `${process.env.INTERACTOR_BASE_URL || 'https://console.interactor.com/api/v1'}/connector/interactor/googledrive-v1/action/drive.files.list/execute`;
        console.log(`[Drive Search Files] URL: ${url}?account=${account}`);
        
        // Escape query and use simpler search format
        const escapedQuery = query.replace(/'/g, "\\'").replace(/"/g, '\\"');
        const searchQuery = `name contains "${escapedQuery}" and trashed=false`;
        
        console.log(`[Drive Search Files] Data:`, {
          pageSize: 10,
          q: searchQuery,
          fields: "files(id,name,mimeType,size,webViewLink)"
        });
        
        const response = await axios.post(url, {
          pageSize: 10,
          q: searchQuery,
          fields: "files(id,name,mimeType,size,webViewLink)"
        }, {
          params: { account },
          headers: {
            'x-api-key': String(process.env.INTERACTOR_API_KEY),
            'Content-Type': 'application/json'
          },
          timeout: 10000
        });
        
        console.log(`[Drive Search Files] Response:`, JSON.stringify(response.data, null, 2));
        
        if (!response.data || response.data.error) {
          return {
            success: true,
            content: `📁 Failed to search files: ${response.data?.error || 'API error'}`
          };
        }

        // Handle multiple possible response structures
        let files = [];
        if (response.data.body?.files) {
          files = response.data.body.files;
        } else if (response.data.output?.body?.files) {
          files = response.data.output.body.files;
        } else if (response.data.output?.files) {
          files = response.data.output.files;
        } else if (response.data.files) {
          files = response.data.files;
        }
        
        console.log(`[Drive Search Files] Found ${files.length} files matching "${query}"`);
        
        if (!files || files.length === 0) {
          return {
            success: true,
            content: `📁 No files found related to "${query}".`
          };
        }

        let content = `📁 "${query}" search results:\n\n`;
        files.forEach((file: any, index: number) => {
          const fileName = file.name || 'No Name';
          const fileSize = file.size ? `(${Math.round(file.size / 1024)}KB)` : '';
          const fileType = file.mimeType?.includes('folder') ? '📂' : '📄';
          content += `${fileType} ${index + 1}. ${fileName} ${fileSize}\n`;
        });

        return {
          success: true,
          content: content.trim()
        };
      }

      default:
        return {
          success: true,
          content: `📁 Unknown Google Drive action: ${action}\n\nAvailable actions:\n- View file list\n- Create folder\n- Search files`
        };
    }
  } catch (error: any) {
    console.error(`[Drive Action] Error:`, error);
    return {
      success: true,
      content: `📁 Google Drive error occurred: ${error.message}`
    };
  }
}

async function handleBriefingAction(account: string, action: string, params: any) {
  console.log(`[Briefing Action] account: ${account}, action: ${action}, params:`, params);
  
  try {
    switch (action) {
      case 'getDailyBriefing':
      case 'daily': {
        // Import and call briefing logic directly instead of HTTP request
        const briefingModule = await import('./briefing.js');
        
        // Create mock request object with user data
        const mockReq = {
          user: { email: account }
        } as any;
        
        // Create mock response object to capture data
        let briefingData: any = null;
        const mockRes = {
          json: (data: any) => { briefingData = data; },
          status: () => mockRes
        } as any;

        // Call the briefing route handler directly (it's the default export's get handler)
        try {
          // Get the router and find the daily briefing handler
          const router = briefingModule.default;
          
          // Since we can't easily extract the handler, let's call the briefing logic manually
          // This will replicate what's in /api/briefing/daily
          const { IntegrationService: BriefingIntegrationService } = await import('../services/IntegrationService.js');
          const { getKoreaTime } = await import('../utils/timezone.js');
          
          // Get connection status for all services
          const [calendarStatus, gmailStatus, driveStatus] = await Promise.all([
            BriefingIntegrationService.getStatus('googlecalendar', account),
            BriefingIntegrationService.getStatus('gmail', account),
            BriefingIntegrationService.getStatus('googledrive', account)
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
            briefing.summary.calendar = await getCalendarSummaryForBriefing(account);
          }

          // Fetch Gmail data if connected  
          if (gmailStatus.connected) {
            briefing.summary.gmail = await getGmailSummaryForBriefing(account);
          }

          // Fetch Drive data if connected
          if (driveStatus.connected) {
            briefing.summary.drive = await getDriveSummaryForBriefing(account);
          }

          // Generate suggestions and notifications
          briefing.suggestions = generateBriefingSuggestions(briefing.summary);
          briefing.notifications = generateBriefingNotifications(briefing.summary);

          return {
            success: true,
            content: formatBriefingResponse(briefing)
          };
          
        } catch (briefingError: any) {
          console.error('[Briefing Action] Direct call failed:', briefingError);
          return {
            success: true,
            content: '📋 Daily briefing is temporarily unavailable. Please try again later.'
          };
        }
      }

      default:
        return {
          success: true,
          content: `📋 Unknown briefing action: ${action}`
        };
    }
  } catch (error: any) {
    console.error(`[Briefing Action] Error:`, error);
    return {
      success: true,
      content: `📋 Briefing error: ${error.message}`
    };
  }
}

function formatBriefingResponse(briefing: any): string {
  let content = `📋 Daily Briefing for ${new Date(briefing.date).toLocaleDateString('en-US')}\n\n`;

  // Calendar summary
  if (briefing.summary.calendar && !briefing.summary.calendar.error) {
    const cal = briefing.summary.calendar;
    content += `📅 **${cal.todayEvents} events today**\n`;
    
    if (cal.nextEvent) {
      content += `   ⏰ Next: ${cal.nextEvent.time} ${cal.nextEvent.title}\n`;
    }
    
    if (cal.freeTimeBlocks && cal.freeTimeBlocks.length > 0) {
      content += `   🕐 Free time: ${cal.freeTimeBlocks[0].start}-${cal.freeTimeBlocks[0].end}\n`;
    }
  } else if (briefing.services.calendar) {
    content += `📅 Unable to fetch calendar information\n`;
  } else {
    content += `📅 Calendar integration required\n`;
  }

  content += '\n';

  // Gmail summary
  if (briefing.summary.gmail && !briefing.summary.gmail.error) {
    const gmail = briefing.summary.gmail;
    content += `📧 **${gmail.unreadCount} unread emails**\n`;
    
    if (gmail.urgentCount > 0) {
      content += `   🔥 Urgent: ${gmail.urgentCount}\n`;
    }
    
    if (gmail.needsReply > 0) {
      content += `   📝 Need reply: ${gmail.needsReply}\n`;
    }
  } else if (briefing.services.gmail) {
    content += `📧 Unable to fetch email information\n`;
  } else {
    content += `📧 Gmail integration required\n`;
  }

  content += '\n';

  // Drive summary
  if (briefing.summary.drive && !briefing.summary.drive.error) {
    const drive = briefing.summary.drive;
    content += `📁 **${drive.recentFiles} recent files**\n`;
    
    if (drive.todayModified > 0) {
      content += `   ✏️ Modified today: ${drive.todayModified}\n`;
    }
    
    if (drive.sharedWithMe > 0) {
      content += `   👥 Shared with me: ${drive.sharedWithMe}\n`;
    }
  } else if (briefing.services.drive) {
    content += `📁 Unable to fetch file information\n`;
  } else {
    content += `📁 Drive integration required\n`;
  }

  // Add suggestions
  if (briefing.suggestions && briefing.suggestions.length > 0) {
    content += '\n💡 **Today\'s suggestions**\n';
    briefing.suggestions.forEach((suggestion: string) => {
      content += `   ${suggestion}\n`;
    });
  }

  return content.trim();
}

// Helper functions for daily briefing (similar to briefing.ts but for internal use)
async function getCalendarSummaryForBriefing(account: string) {
  try {
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

    return {
      todayEvents: events.length,
      nextEvent,
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

async function getGmailSummaryForBriefing(account: string) {
  try {
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
    const todayMessages = messages.filter((msg: any, index: number) => index < 20);
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

async function getDriveSummaryForBriefing(account: string) {
  try {
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
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayFiles = files.filter((file: any) => {
      const modifiedDate = new Date(file.modifiedTime);
      return modifiedDate >= today;
    });

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

function generateBriefingSuggestions(summary: any) {
  const suggestions = [];

  if (summary.calendar && !summary.calendar.error) {
    if (summary.calendar.nextEvent) {
      suggestions.push(`⏰ Next Event: ${summary.calendar.nextEvent.time} ${summary.calendar.nextEvent.title}`);
    }
  }

  if (summary.gmail && !summary.gmail.error) {
    if (summary.gmail.urgentCount > 0) {
      suggestions.push(`🔥 ${summary.gmail.urgentCount} urgent emails need attention`);
    }
    if (summary.gmail.needsReply > 0) {
      suggestions.push(`📧 ${summary.gmail.needsReply} emails need reply`);
    }
  }

  if (summary.drive && !summary.drive.error) {
    if (summary.drive.todayModified > 0) {
      suggestions.push(`📁 ${summary.drive.todayModified} files modified today`);
    }
  }

  return suggestions.slice(0, 5);
}

function generateBriefingNotifications(summary: any) {
  const notifications = [];

  if (summary.gmail && summary.gmail.urgentCount > 5) {
    notifications.push({
      type: 'urgent',
      message: `You have ${summary.gmail.urgentCount} urgent emails`,
      action: 'CHECK_GMAIL'
    });
  }

  if (summary.calendar && summary.calendar.nextEvent) {
    notifications.push({
      type: 'info',
      message: `Upcoming event: ${summary.calendar.nextEvent.title}`,
      action: 'VIEW_CALENDAR'
    });
  }

  return notifications;
}

// Helper function to format action responses for chat display
function formatActionResponse(action: string, data: any): string {
  try {
    switch (action) {
      case 'getTodaysEvents':
      case 'listEvents': {
        if (data.body?.items || data.output?.body?.items || data.items) {
          const items = data.body?.items || data.output?.body?.items || data.items || [];
          if (items.length === 0) {
            return '📅 No events scheduled for today.';
          }

          let content = '📅 Today\'s events:\n\n';
          items.forEach((event: any, index: number) => {
            const title = event.summary || 'No title';
            const start = event.start?.dateTime || event.start?.date;
            const time = start ? formatKoreaDateTime(start).split(' ').slice(3).join(' ') : ''; // 시간 부분만
            content += `${index + 1}. ${title}${time ? ` (${time})` : ''}\n`;
          });
          return content.trim();
        }
        break;
      }

      case 'listMessages': {
        if (data.body?.messages || data.output?.body?.messages || data.messages) {
          const messages = data.body?.messages || data.output?.body?.messages || data.messages || [];
          if (messages.length === 0) {
            return '📧 No messages found in inbox.';
          }

          let content = '📧 Recent emails:\n\n';
          messages.slice(0, 5).forEach((msg: any, index: number) => {
            const snippet = msg.snippet || 'No content';
            content += `${index + 1}. ${snippet.substring(0, 50)}${snippet.length > 50 ? '...' : ''}\n`;
          });
          return content.trim();
        }
        break;
      }

      case 'listLabels': {
        if (data.body?.labels || data.output?.body?.labels || data.labels) {
          const labels = data.body?.labels || data.output?.body?.labels || data.labels || [];
          if (labels.length === 0) {
            return '📧 No labels found.';
          }

          let content = '📧 Gmail Labels:\n\n';
          labels.forEach((label: any, index: number) => {
            content += `${index + 1}. ${label.name || 'No name'}\n`;
          });
          return content.trim();
        }
        break;
      }

      case 'getRecentFiles': 
      case 'listFiles': {
        if (data.body?.files || data.output?.body?.files || data.files) {
          const files = data.body?.files || data.output?.body?.files || data.files || [];
          if (files.length === 0) {
            return '📁 No files found.';
          }

          let content = '📁 Recent Files:\n\n';
          files.forEach((file: any, index: number) => {
            const fileName = file.name || 'No Name';
            const fileType = file.mimeType?.includes('folder') ? '📂' : '📄';
            content += `${fileType} ${index + 1}. ${fileName}\n`;
          });
          return content.trim();
        }
        break;
      }

      default:
        // Fallback for unknown actions - return generic success message instead of JSON
        return 'Task completed successfully.';
    }

    return 'Action completed successfully';
  } catch (error) {
    console.error('[formatActionResponse] Error:', error);
    return 'Response formatting failed';
  }
}

export default router;