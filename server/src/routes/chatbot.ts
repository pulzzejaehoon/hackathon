import { Router, Request, Response } from 'express';
import { callInteractorApi } from '../lib/interactor.js';
import { IntegrationService } from '../services/IntegrationService.js';
import OpenAI from 'openai';
import axios from 'axios';

const router = Router();

// Initialize OpenAI (using OpenRouter)
const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL || 'https://openrouter.ai/api/v1'
});

// Smart chat function
async function getSmartResponse(messages: any[], account: string) {
  // Get user's connected services
  const statuses = await IntegrationService.getAllStatuses(account);
  const connectedServices = statuses
    .filter((s: {id: string, connected: boolean}) => s.connected)
    .map((s: {id: string, connected: boolean}) => s.id)
    .join(', ');
  
  const systemPrompt = "너는 사용자의 연결된 서비스를 관리하는데 도움을 주는 AI 어시스턴트야.\n\n현재 사용자가 연결한 서비스: " + (connectedServices || "없음") + "\n\n사용 가능한 기능:\n- Google Calendar: 오늘 일정 보기, 자연어로 새 일정 만들기\n- Gmail: 안읽은 메일 보기 (곧 추가될 예정)\n- Google Drive: 최근 파일 보기 (곧 추가될 예정)\n\n사용자가 연결되지 않은 서비스에 대한 작업을 요청하면, 먼저 오른쪽 패널에서 해당 서비스를 연결하라고 안내해줘.\n캘린더 일정의 경우 \"내일 오후 3시에 팀 회의\" 같은 자연어로 만들 수 있어.\n항상 한국어로 도움이 되고 간결하게 응답해줘.\n만약 사용자가 일정 보기나 일정 만들기 같은 작업을 요청하면, 퀵 액션 버튼을 사용하거나 구체적인 명령어를 제안해줘.";

  const lastMessage = messages[messages.length - 1]?.content || '';
  const hasConnectedServices = connectedServices && connectedServices !== 'none';

  // 간단한 키워드 기반 응답 (API 호출 실패 시 백업용)
  let fallbackResponse = '';
  if (lastMessage.includes('안녕') || lastMessage.includes('hello')) {
    if (hasConnectedServices) {
      fallbackResponse = "안녕하세요! 현재 " + connectedServices + " 서비스가 연결되어 있습니다. 무엇을 도와드릴까요?";
    } else {
      fallbackResponse = '안녕하세요! 오른쪽 패널에서 서비스를 먼저 연결해주세요. 그러면 일정 관리, 메일 확인 등을 도와드릴 수 있습니다.';
    }
  } else if (lastMessage.includes('일정') || lastMessage.includes('캘린더')) {
    if (connectedServices.includes('googlecalendar')) {
      fallbackResponse = '캘린더가 연결되어 있네요! "오늘 일정 보여줘" 버튼을 클릭하거나 "내일 오후 3시에 회의 일정 추가해줘" 같이 말씀해주세요.';
    } else {
      fallbackResponse = '캘린더 기능을 사용하려면 먼저 오른쪽 패널에서 Google Calendar를 연결해주세요.';
    }
  } else if (lastMessage.includes('메일') || lastMessage.includes('gmail')) {
    fallbackResponse = 'Gmail 기능은 곧 추가될 예정입니다. 현재는 캘린더 기능만 사용 가능합니다.';
  } else {
    if (hasConnectedServices) {
      fallbackResponse = "현재 " + connectedServices + " 서비스가 연결되어 있습니다. 아래 퀵 액션 버튼을 사용하거나 원하는 작업을 말씀해주세요.";
    } else {
      fallbackResponse = '먼저 오른쪽 패널에서 Google Calendar, Gmail, Drive 중 하나를 연결해주세요. 그러면 해당 서비스와 관련된 작업을 도와드릴 수 있습니다.';
    }
  }

  try {
    const response = await openai.chat.completions.create({
      model: process.env.OPENROUTER_MODEL || 'mistralai/mistral-7b-instruct:free',
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.map((m: any) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content
        }))
      ],
      max_tokens: 500,
      temperature: 0.7
    });

    return response.choices[0]?.message?.content || fallbackResponse || '죄송합니다. 응답을 생성할 수 없습니다.';
  } catch (error: any) {
    console.error('OpenAI API error:', error);
    // Use fallback response
    return fallbackResponse || '안녕하세요! AI 어시스턴트입니다. 연결된 서비스를 통해 도움을 드릴 수 있습니다. 오른쪽 패널에서 서비스를 연결하고 빠른 작업 버튼을 사용해보세요!';
  }
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

    // Get smart response
    const response = await getSmartResponse(messages, account);
    
    // Simulate streaming by chunking the response
    for (let i = 0; i < response.length; i += 3) {
      const chunk = response.slice(i, i + 3);
      res.write(`data: ${JSON.stringify({ delta: chunk })}\n\n`);
      await new Promise(resolve => setTimeout(resolve, 30));
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();

  } catch (error: any) {
    console.error('[Chatbot Stream] Error:', error);
    res.write(`data: ${JSON.stringify({ error: 'Internal server error' })}\n\n`);
    res.end();
  }
});

/**
 * POST /api/chatbot/action
 * Handle chatbot actions for integrated services
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
  // Check if user is connected
  const status = await IntegrationService.getStatus('googlecalendar', account);
  if (!status.connected) {
    return {
      success: true,
      content: '📅 Google 캘린더가 연결되어 있지 않습니다. 먼저 설정에서 연결해주세요!'
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
            content: '📅 일정 내용을 입력해주세요. 예: "내일 오후 3시에 회의"'
          };
        }

        // Use correct Interactor API format
        const url = `${process.env.INTERACTOR_BASE_URL || 'https://console.interactor.com/api/v1'}/connector/interactor/googlecalendar-v1/action/calendar.events.quickAdd/execute`;
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
        
        const result = { success: true, output: response.data };

        if (!result.success) {
          return {
            success: true,
            content: `📅 일정 생성에 실패했습니다: ${result.error}`
          };
        }

        const event = result.output;
        return {
          success: true,
          content: `📅 일정이 성공적으로 생성되었습니다!\n\n제목: ${event?.summary || '제목 없음'}\n시간: ${event?.start?.dateTime ? new Date(event.start.dateTime).toLocaleString('ko-KR') : '시간 정보 없음'}`
        };
      }

      case 'getTodaysEvents':
      case 'listEvents': {
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);
        
        const url = `${process.env.INTERACTOR_BASE_URL || 'https://console.interactor.com/api/v1'}/connector/interactor/googlecalendar-v1/action/calendar.events.list/execute`;
        const response = await axios.post(url, {
          calendarId: "primary",
          timeMin: today.toISOString(),
          timeMax: tomorrow.toISOString(),
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
        
        const result = { success: true, output: response.data };

        if (!result.success) {
          return {
            success: true,
            content: `📅 일정을 가져오는데 실패했습니다: ${result.error}`
          };
        }

        const events = result.output?.items || [];
        if (events.length === 0) {
          return {
            success: true,
            content: '📅 오늘 예정된 일정이 없습니다.'
          };
        }

        let content = '📅 오늘의 일정:\n\n';
        events.forEach((event: any, index: number) => {
          const startTime = event.start?.dateTime 
            ? new Date(event.start.dateTime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
            : '종일';
          content += `${index + 1}. ${event.summary || '제목 없음'} (${startTime})\n`;
        });

        return {
          success: true,
          content: content.trim()
        };
      }

      default:
        return {
          success: true,
          content: `📅 알 수 없는 캘린더 액션: ${action}`
        };
    }
  } catch (error: any) {
    return {
      success: true,
      content: `📅 캘린더 작업 중 오류가 발생했습니다: ${error.message}`
    };
  }
}

async function handleGmailAction(account: string, action: string, params: any) {
  const status = await IntegrationService.getStatus('gmail', account);
  if (!status.connected) {
    return {
      success: true,
      content: '📧 Gmail이 연결되어 있지 않습니다. 먼저 설정에서 연결해주세요!'
    };
  }

  return {
    success: true,
    content: '📧 Gmail 기능은 곧 추가될 예정입니다!'
  };
}

async function handleDriveAction(account: string, action: string, params: any) {
  const status = await IntegrationService.getStatus('googledrive', account);
  if (!status.connected) {
    return {
      success: true,
      content: '📁 Google Drive가 연결되어 있지 않습니다. 먼저 설정에서 연결해주세요!'
    };
  }

  return {
    success: true,
    content: '📁 Google Drive 기능은 곧 추가될 예정입니다!'
  };
}

export default router;