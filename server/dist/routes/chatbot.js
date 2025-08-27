import { Router } from 'express';
import { IntegrationService } from '../services/IntegrationService.js';
import { InteractorCore } from '../lib/InteractorCore.js';
import OpenAI from 'openai';
import axios from 'axios';
const router = Router();
// Initialize OpenAI (using OpenRouter)
const openai = new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL || 'https://openrouter.ai/api/v1'
});
// Smart chat function - Real LLM integration with OpenRouter
async function getSmartResponse(messages, account) {
    // Check if OpenRouter API key is available
    if (!process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY === 'your-openrouter-api-key-here') {
        console.warn('[LLM] OpenRouter API key not configured, using fallback responses');
        return getFallbackResponse(messages);
    }
    try {
        // Prepare system message for context
        const systemMessage = {
            role: 'system',
            content: `당신은 Interactor Office AI 어시스턴트입니다. 사용자의 업무 효율성을 높이는 것이 목표입니다.

주요 기능:
- Google Calendar 연동 (일정 조회/생성)
- Gmail 연동 (메일 관리)
- Google Drive 연동 (파일 관리)

응답 가이드라인:
- 친근하고 도움이 되는 톤으로 답변
- 한국어로 자연스럽게 대화
- 구체적이고 실용적인 도움 제공
- 필요하면 아래 퀵 액션 버튼 활용을 권장
- 답변은 간결하게 2-3문장 내외로 작성`
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
    }
    catch (error) {
        console.error('[LLM] OpenRouter API error:', error.message);
        // Check for specific error types
        if (error.status === 401) {
            console.error('[LLM] Authentication error - check API key');
        }
        else if (error.status === 429) {
            console.error('[LLM] Rate limit exceeded');
        }
        else if (error.status >= 500) {
            console.error('[LLM] OpenRouter server error');
        }
        return getFallbackResponse(messages);
    }
}
// Fallback response system for when LLM is unavailable
function getFallbackResponse(messages) {
    const lastMessage = messages[messages.length - 1]?.content || '';
    // Smart keyword-based responses as fallback
    const responses = [
        // Greetings
        { keywords: ['안녕', 'hello', 'hi', '하이'], responses: [
                '안녕하세요! 무엇을 도와드릴까요? 📝',
                '반가워요! 오늘도 좋은 하루 보내세요! ✨'
            ] },
        // Questions about coding/technical
        { keywords: ['코드', 'code', '프로그래밍', 'programming', '개발', 'python', 'javascript'], responses: [
                '죄송하지만 현재 AI 모델에 연결할 수 없어 코딩 관련 도움을 드리기 어렵습니다. 잠시 후 다시 시도해주세요.',
                '기술적인 질문은 AI 모델이 필요한데, 현재 연결에 문제가 있네요. 다시 시도해보시겠어요?'
            ] },
        // Calendar/schedule related
        { keywords: ['일정', '캘린더', '스케줄', '약속'], responses: [
                '일정 관리가 필요하시군요! 아래 캘린더 버튼으로 일정을 확인하거나 추가해보세요! 📅',
                '스케줄 관리는 Google 캘린더 연동 기능을 활용해보세요! 🗓️'
            ] },
        // Email related  
        { keywords: ['메일', '이메일', 'email', 'gmail'], responses: [
                '이메일 관리는 Gmail 연동 기능을 사용해보세요! 📧',
                '메일 관련 작업은 아래 Gmail 버튼을 활용해보시는 건 어떨까요? ✉️'
            ] },
        // Daily briefing related
        { keywords: ['브리핑', '요약', '오늘', '일일', 'briefing', 'summary'], responses: [
                '오늘의 업무 브리핑을 확인해보세요! 📋 아래 "오늘 브리핑" 버튼을 클릭하시거나 "오늘 브리핑 보여줘"라고 말씀해보세요.',
                '일일 브리핑으로 오늘의 일정, 이메일, 파일을 한눈에 확인하세요! 📊'
            ] }
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
        '현재 AI 모델 연결에 문제가 있어 자세한 답변을 드리기 어렵습니다. 아래 퀵 액션 버튼들을 활용해보세요!',
        '죄송합니다. AI 서비스가 일시적으로 불안정합니다. 통합된 서비스 기능들을 대신 이용해보시겠어요?',
        'AI 응답 생성에 문제가 발생했습니다. 캘린더나 Gmail 등의 연동 기능은 정상 작동합니다! 🔧'
    ];
    return defaultResponses[Math.floor(Math.random() * defaultResponses.length)];
}
/**
 * POST /api/chatbot/chat
 * Handle regular chat messages
 */
router.post('/chat', async (req, res) => {
    try {
        const { messages } = req.body;
        const account = req.user?.email;
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
    }
    catch (error) {
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
router.post('/stream', async (req, res) => {
    try {
        const { messages } = req.body;
        const account = req.user?.email;
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
                    content: `당신은 Interactor Office AI 어시스턴트입니다. 사용자의 업무 효율성을 높이는 것이 목표입니다.

주요 기능:
- Google Calendar 연동 (일정 조회/생성)
- Gmail 연동 (메일 관리)
- Google Drive 연동 (파일 관리)

응답 가이드라인:
- 친근하고 도움이 되는 톤으로 답변
- 한국어로 자연스럽게 대화
- 구체적이고 실용적인 도움 제공
- 필요하면 아래 퀵 액션 버튼 활용을 권장
- 답변은 간결하게 2-3문장 내외로 작성`
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
            }
            else {
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
        }
        catch (streamError) {
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
    }
    catch (error) {
        console.error('[Chatbot Stream] Error:', error);
        res.write(`data: ${JSON.stringify({ error: 'Internal server error' })}\n\n`);
        res.end();
    }
});
/**
 * POST /api/chatbot/command
 * Handle structured commands via InteractorCore (PRD-compliant)
 */
router.post('/command', async (req, res) => {
    try {
        const { service, action, params } = req.body;
        const userEmail = req.user?.email;
        const userId = req.user?.userId?.toString();
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
            userId: userEmail // Use email as userId for InteractorCore
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
    }
    catch (error) {
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
router.post('/action', async (req, res) => {
    try {
        const { service, action, params } = req.body;
        const account = req.user?.email;
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
                error: { message: result.error || 'Action failed' }
            });
        }
        return res.json({
            ok: true,
            reply: {
                content: result.content
            }
        });
    }
    catch (error) {
        console.error('[Chatbot Action] Error:', error);
        return res.status(500).json({
            ok: false,
            error: { message: 'Internal server error' }
        });
    }
});
async function handleCalendarAction(account, action, params) {
    console.log(`[Calendar Action] account: ${account}, action: ${action}, params:`, params);
    // Check if user is connected
    const status = await IntegrationService.getStatus('googlecalendar', account);
    console.log(`[Calendar Action] Status check result:`, status);
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
                        content: `📅 일정 생성에 실패했습니다: ${response.data?.error || 'API 오류'}`
                    };
                }
                // Handle multiple possible response structures
                let event = null;
                if (response.data.body) {
                    event = response.data.body;
                }
                else if (response.data.output?.body) {
                    event = response.data.output.body;
                }
                else if (response.data.output) {
                    event = response.data.output;
                }
                else {
                    event = response.data;
                }
                console.log(`[Calendar QuickAdd] Extracted event:`, JSON.stringify(event, null, 2));
                if (!event) {
                    return {
                        success: true,
                        content: `📅 일정이 생성되었지만 세부 정보를 가져올 수 없습니다.`
                    };
                }
                const eventTitle = event.summary || event.title || '제목 없음';
                let eventTime = '시간 정보 없음';
                if (event.start) {
                    if (event.start.dateTime) {
                        eventTime = new Date(event.start.dateTime).toLocaleString('ko-KR', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            timeZone: 'Asia/Seoul'
                        });
                    }
                    else if (event.start.date) {
                        eventTime = new Date(event.start.date + 'T00:00:00').toLocaleDateString('ko-KR', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                        }) + ' (종일)';
                    }
                }
                return {
                    success: true,
                    content: `📅 일정이 성공적으로 생성되었습니다!\n\n제목: ${eventTitle}\n시간: ${eventTime}`
                };
            }
            case 'getTodaysEvents':
            case 'listEvents': {
                // Use Korea timezone for today's events
                const now = new Date();
                const koreaTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
                // Start of today in Korea timezone
                const todayStart = new Date(koreaTime.getFullYear(), koreaTime.getMonth(), koreaTime.getDate(), 0, 0, 0);
                // End of today in Korea timezone  
                const todayEnd = new Date(koreaTime.getFullYear(), koreaTime.getMonth(), koreaTime.getDate(), 23, 59, 59);
                const url = `${process.env.INTERACTOR_BASE_URL || 'https://console.interactor.com/api/v1'}/connector/interactor/googlecalendar-v1/action/calendar.events.list/execute`;
                console.log(`[Calendar Events List] URL: ${url}?account=${account}`);
                console.log(`[Calendar Events List] Korea time range:`, {
                    koreaTime: koreaTime.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }),
                    todayStart: todayStart.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }),
                    todayEnd: todayEnd.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
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
                        content: `📅 일정을 가져오는데 실패했습니다: ${response.data?.error || 'API 오류'}`
                    };
                }
                // Handle multiple possible response structures
                let events = [];
                if (response.data.body?.items) {
                    events = response.data.body.items;
                }
                else if (response.data.output?.body?.items) {
                    events = response.data.output.body.items;
                }
                else if (response.data.output?.items) {
                    events = response.data.output.items;
                }
                else if (response.data.items) {
                    events = response.data.items;
                }
                else if (Array.isArray(response.data.body)) {
                    events = response.data.body;
                }
                else if (Array.isArray(response.data.output)) {
                    events = response.data.output;
                }
                else if (Array.isArray(response.data)) {
                    events = response.data;
                }
                console.log(`[Calendar Events List] Extracted ${events.length} events:`, JSON.stringify(events, null, 2));
                if (!events || events.length === 0) {
                    return {
                        success: true,
                        content: '📅 오늘 예정된 일정이 없습니다.'
                    };
                }
                let content = '📅 오늘의 일정:\n\n';
                events.forEach((event, index) => {
                    const eventTitle = event.summary || event.title || '제목 없음';
                    let startTime = '시간 정보 없음';
                    if (event.start) {
                        if (event.start.dateTime) {
                            startTime = new Date(event.start.dateTime).toLocaleTimeString('ko-KR', {
                                hour: '2-digit',
                                minute: '2-digit',
                                timeZone: 'Asia/Seoul'
                            });
                        }
                        else if (event.start.date) {
                            startTime = '종일';
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
                    content: `📅 알 수 없는 캘린더 액션: ${action}`
                };
        }
    }
    catch (error) {
        return {
            success: true,
            content: `📅 캘린더 작업 중 오류가 발생했습니다: ${error.message}`
        };
    }
}
async function handleGmailAction(account, action, params) {
    console.log(`[Gmail Action] account: ${account}, action: ${action}, params:`, params);
    const status = await IntegrationService.getStatus('gmail', account);
    console.log(`[Gmail Action] Status check result:`, status);
    if (!status.connected) {
        return {
            success: true,
            content: '📧 Gmail이 연결되어 있지 않습니다. 먼저 설정에서 연결해주세요!'
        };
    }
    try {
        switch (action) {
            case 'createDraft': {
                const { to, subject, body } = params || {};
                if (!to || !subject) {
                    return {
                        success: true,
                        content: '📧 받는 사람과 제목을 입력해주세요.'
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
                        content: `📧 초안 생성에 실패했습니다: ${response.data?.error || 'API 오류'}`
                    };
                }
                return {
                    success: true,
                    content: `📧 이메일 초안이 성공적으로 생성되었습니다!\n\n받는 사람: ${to}\n제목: ${subject}\n\nGmail에서 확인하고 발송할 수 있습니다.`
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
                        content: `📧 메일 목록을 가져오는데 실패했습니다: ${response.data?.error || 'API 오류'}`
                    };
                }
                // Handle multiple possible response structures
                let messages = [];
                if (response.data.body?.messages) {
                    messages = response.data.body.messages;
                }
                else if (response.data.output?.body?.messages) {
                    messages = response.data.output.body.messages;
                }
                else if (response.data.output?.messages) {
                    messages = response.data.output.messages;
                }
                else if (response.data.messages) {
                    messages = response.data.messages;
                }
                else if (Array.isArray(response.data.body)) {
                    messages = response.data.body;
                }
                else if (Array.isArray(response.data.output)) {
                    messages = response.data.output;
                }
                else if (Array.isArray(response.data)) {
                    messages = response.data;
                }
                console.log(`[Gmail Messages List] Extracted ${messages.length} messages`);
                if (!messages || messages.length === 0) {
                    return {
                        success: true,
                        content: '📧 받은편지함에 메일이 없습니다.'
                    };
                }
                let content = '📧 최근 받은 메일 목록:\n\n';
                messages.slice(0, 5).forEach((message, index) => {
                    // Note: Gmail API might return just message IDs, would need additional call to get details
                    content += `${index + 1}. 메시지 ID: ${message.id || '정보 없음'}\n`;
                });
                content += `\n💡 상세 내용은 Gmail에서 확인하세요.`;
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
                        content: `📧 라벨 목록을 가져오는데 실패했습니다: ${response.data?.error || 'API 오류'}`
                    };
                }
                // Handle multiple possible response structures for labels
                let labels = [];
                if (response.data.body?.labels) {
                    labels = response.data.body.labels;
                }
                else if (response.data.output?.body?.labels) {
                    labels = response.data.output.body.labels;
                }
                else if (response.data.output?.labels) {
                    labels = response.data.output.labels;
                }
                else if (response.data.labels) {
                    labels = response.data.labels;
                }
                console.log(`[Gmail Labels List] Extracted ${labels.length} labels`);
                if (!labels || labels.length === 0) {
                    return {
                        success: true,
                        content: '📧 Gmail 라벨이 없습니다.'
                    };
                }
                let content = '📧 Gmail 라벨 목록:\n\n';
                labels.slice(0, 10).forEach((label, index) => {
                    const labelName = label.name || label.id || '이름 없음';
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
                    content: `📧 알 수 없는 Gmail 액션: ${action}`
                };
        }
    }
    catch (error) {
        console.error(`[Gmail Action] Error:`, error);
        return {
            success: true,
            content: `📧 Gmail 작업 중 오류가 발생했습니다: ${error.message}`
        };
    }
}
async function handleDriveAction(account, action, params) {
    console.log(`[Drive Action] account: ${account}, action: ${action}, params:`, params);
    const status = await IntegrationService.getStatus('googledrive', account);
    console.log(`[Drive Action] Status check result:`, status);
    if (!status.connected) {
        return {
            success: true,
            content: '📁 Google Drive가 연결되어 있지 않습니다. 먼저 설정에서 연결해주세요!'
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
                        content: `📁 파일 목록을 가져오는데 실패했습니다: ${response.data?.error || 'API 오류'}`
                    };
                }
                // Handle multiple possible response structures
                let files = [];
                if (response.data.body?.files) {
                    files = response.data.body.files;
                }
                else if (response.data.output?.body?.files) {
                    files = response.data.output.body.files;
                }
                else if (response.data.output?.files) {
                    files = response.data.output.files;
                }
                else if (response.data.files) {
                    files = response.data.files;
                }
                console.log(`[Drive Files List] Extracted ${files.length} files`);
                if (!files || files.length === 0) {
                    return {
                        success: true,
                        content: '📁 Google Drive에 파일이 없습니다.'
                    };
                }
                let content = '📁 Google Drive 파일 목록:\n\n';
                files.slice(0, 8).forEach((file, index) => {
                    const fileName = file.name || '이름 없음';
                    const fileSize = file.size ? `(${Math.round(file.size / 1024)}KB)` : '';
                    const fileType = file.mimeType?.includes('folder') ? '📂' : '📄';
                    content += `${fileType} ${index + 1}. ${fileName} ${fileSize}\n`;
                });
                if (files.length > 8) {
                    content += `\n... 그 외 ${files.length - 8}개 파일이 더 있습니다.`;
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
                        content: '📁 생성할 폴더 이름을 입력해주세요.'
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
                        content: `📁 폴더 생성에 실패했습니다: ${response.data?.error || 'API 오류'}`
                    };
                }
                // Handle multiple possible response structures
                let folder = null;
                if (response.data.body) {
                    folder = response.data.body;
                }
                else if (response.data.output?.body) {
                    folder = response.data.output.body;
                }
                else if (response.data.output) {
                    folder = response.data.output;
                }
                else {
                    folder = response.data;
                }
                const folderCreatedName = folder?.name || folderName;
                return {
                    success: true,
                    content: `📁 폴더 "${folderCreatedName}"가 성공적으로 생성되었습니다!`
                };
            }
            case 'searchFiles': {
                const query = params?.query || params?.q;
                if (!query) {
                    return {
                        success: true,
                        content: '📁 검색할 파일명이나 키워드를 입력해주세요.'
                    };
                }
                const url = `${process.env.INTERACTOR_BASE_URL || 'https://console.interactor.com/api/v1'}/connector/interactor/googledrive-v1/action/drive.files.list/execute`;
                console.log(`[Drive Search Files] URL: ${url}?account=${account}`);
                console.log(`[Drive Search Files] Data:`, {
                    pageSize: 10,
                    q: `name contains '${query}' and trashed=false`,
                    fields: "files(id,name,mimeType,size,webViewLink)"
                });
                const response = await axios.post(url, {
                    pageSize: 10,
                    q: `name contains '${query}' and trashed=false`,
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
                        content: `📁 파일 검색에 실패했습니다: ${response.data?.error || 'API 오류'}`
                    };
                }
                // Handle multiple possible response structures
                let files = [];
                if (response.data.body?.files) {
                    files = response.data.body.files;
                }
                else if (response.data.output?.body?.files) {
                    files = response.data.output.body.files;
                }
                else if (response.data.output?.files) {
                    files = response.data.output.files;
                }
                else if (response.data.files) {
                    files = response.data.files;
                }
                console.log(`[Drive Search Files] Found ${files.length} files matching "${query}"`);
                if (!files || files.length === 0) {
                    return {
                        success: true,
                        content: `📁 "${query}"와 관련된 파일을 찾을 수 없습니다.`
                    };
                }
                let content = `📁 "${query}" 검색 결과:\n\n`;
                files.forEach((file, index) => {
                    const fileName = file.name || '이름 없음';
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
                    content: `📁 알 수 없는 Google Drive 액션: ${action}\n\n사용 가능한 액션:\n- 파일 목록 보기\n- 폴더 생성\n- 파일 검색`
                };
        }
    }
    catch (error) {
        console.error(`[Drive Action] Error:`, error);
        return {
            success: true,
            content: `📁 Google Drive 작업 중 오류가 발생했습니다: ${error.message}`
        };
    }
}
async function handleBriefingAction(account, action, params) {
    console.log(`[Briefing Action] account: ${account}, action: ${action}, params:`, params);
    try {
        switch (action) {
            case 'getDailyBriefing':
            case 'daily': {
                // Call our briefing API
                const response = await fetch(`${process.env.BACKEND_ORIGIN || 'http://localhost:3001'}/api/briefing/daily`, {
                    headers: {
                        'Authorization': `Bearer ${generateInternalToken(account)}`, // Would need to implement this
                        'Content-Type': 'application/json'
                    }
                });
                if (!response.ok) {
                    return {
                        success: true,
                        content: '📋 브리핑 정보를 가져올 수 없습니다. 잠시 후 다시 시도해주세요.'
                    };
                }
                const data = await response.json();
                if (!data.ok || !data.briefing) {
                    return {
                        success: true,
                        content: '📋 브리핑 데이터를 처리할 수 없습니다.'
                    };
                }
                return {
                    success: true,
                    content: formatBriefingResponse(data.briefing)
                };
            }
            default:
                return {
                    success: true,
                    content: `📋 알 수 없는 브리핑 액션: ${action}`
                };
        }
    }
    catch (error) {
        console.error(`[Briefing Action] Error:`, error);
        return {
            success: true,
            content: `📋 브리핑 작업 중 오류가 발생했습니다: ${error.message}`
        };
    }
}
function formatBriefingResponse(briefing) {
    let content = `📋 ${new Date(briefing.date).toLocaleDateString('ko-KR')} 일일 브리핑\n\n`;
    // Calendar summary
    if (briefing.summary.calendar && !briefing.summary.calendar.error) {
        const cal = briefing.summary.calendar;
        content += `📅 **오늘 일정 ${cal.todayEvents}개**\n`;
        if (cal.nextEvent) {
            content += `   ⏰ 다음: ${cal.nextEvent.time} ${cal.nextEvent.title}\n`;
        }
        if (cal.freeTimeBlocks && cal.freeTimeBlocks.length > 0) {
            content += `   🕐 여유시간: ${cal.freeTimeBlocks[0].start}-${cal.freeTimeBlocks[0].end}\n`;
        }
    }
    else if (briefing.services.calendar) {
        content += `📅 일정 정보를 가져올 수 없습니다\n`;
    }
    else {
        content += `📅 캘린더 연동 필요\n`;
    }
    content += '\n';
    // Gmail summary
    if (briefing.summary.gmail && !briefing.summary.gmail.error) {
        const gmail = briefing.summary.gmail;
        content += `📧 **읽지 않은 메일 ${gmail.unreadCount}개**\n`;
        if (gmail.urgentCount > 0) {
            content += `   🔥 긴급: ${gmail.urgentCount}개\n`;
        }
        if (gmail.needsReply > 0) {
            content += `   📝 답장 필요: ${gmail.needsReply}개\n`;
        }
    }
    else if (briefing.services.gmail) {
        content += `📧 이메일 정보를 가져올 수 없습니다\n`;
    }
    else {
        content += `📧 Gmail 연동 필요\n`;
    }
    content += '\n';
    // Drive summary
    if (briefing.summary.drive && !briefing.summary.drive.error) {
        const drive = briefing.summary.drive;
        content += `📁 **최근 파일 ${drive.recentFiles}개**\n`;
        if (drive.todayModified > 0) {
            content += `   ✏️ 오늘 수정: ${drive.todayModified}개\n`;
        }
        if (drive.sharedWithMe > 0) {
            content += `   👥 공유받은 파일: ${drive.sharedWithMe}개\n`;
        }
    }
    else if (briefing.services.drive) {
        content += `📁 파일 정보를 가져올 수 없습니다\n`;
    }
    else {
        content += `📁 Drive 연동 필요\n`;
    }
    // Add suggestions
    if (briefing.suggestions && briefing.suggestions.length > 0) {
        content += '\n💡 **오늘의 제안**\n';
        briefing.suggestions.forEach((suggestion) => {
            content += `   ${suggestion}\n`;
        });
    }
    return content.trim();
}
// Temporary function - would need proper JWT token generation
function generateInternalToken(email) {
    // In a real implementation, you'd generate a proper JWT token
    // For now, we'll work around this by calling the briefing logic directly
    return 'internal-token';
}
// Helper function to format action responses for chat display
function formatActionResponse(action, data) {
    try {
        switch (action) {
            case 'getTodaysEvents':
            case 'listEvents': {
                if (data.body?.items || data.output?.body?.items || data.items) {
                    const items = data.body?.items || data.output?.body?.items || data.items || [];
                    if (items.length === 0) {
                        return '📅 오늘 예정된 일정이 없습니다.';
                    }
                    let content = '📅 오늘의 일정:\n\n';
                    items.forEach((event, index) => {
                        const title = event.summary || '제목 없음';
                        const start = event.start?.dateTime || event.start?.date;
                        const time = start ? new Date(start).toLocaleTimeString('ko-KR', {
                            hour: '2-digit',
                            minute: '2-digit'
                        }) : '';
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
                        return '📧 받은편지함에 메시지가 없습니다.';
                    }
                    let content = '📧 최근 이메일:\n\n';
                    messages.slice(0, 5).forEach((msg, index) => {
                        const snippet = msg.snippet || '내용 없음';
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
                        return '📧 라벨이 없습니다.';
                    }
                    let content = '📧 Gmail 라벨:\n\n';
                    labels.forEach((label, index) => {
                        content += `${index + 1}. ${label.name || '이름 없음'}\n`;
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
                        return '📁 파일이 없습니다.';
                    }
                    let content = '📁 최근 파일:\n\n';
                    files.forEach((file, index) => {
                        const fileName = file.name || '이름 없음';
                        const fileType = file.mimeType?.includes('folder') ? '📂' : '📄';
                        content += `${fileType} ${index + 1}. ${fileName}\n`;
                    });
                    return content.trim();
                }
                break;
            }
            default:
                return JSON.stringify(data, null, 2);
        }
        return 'Action completed successfully';
    }
    catch (error) {
        console.error('[formatActionResponse] Error:', error);
        return 'Response formatting failed';
    }
}
export default router;
