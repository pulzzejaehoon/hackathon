import { Router } from 'express';
import { IntegrationService } from '../services/IntegrationService.js';
import OpenAI from 'openai';
import axios from 'axios';
const router = Router();
// Initialize OpenAI (using OpenRouter)
const openai = new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL || 'https://openrouter.ai/api/v1'
});
// Smart chat function - Pure conversational responses
async function getSmartResponse(messages, account) {
    const lastMessage = messages[messages.length - 1]?.content || '';
    // Generate natural conversational responses
    const responses = [
        // Greetings
        { keywords: ['안녕', 'hello', 'hi', '하이'], responses: [
                '안녕하세요! 오늘 하루는 어떠세요?',
                '안녕하세요! 무엇을 도와드릴까요?',
                '반가워요! 좋은 하루 보내고 계신가요?'
            ] },
        // Questions about work/productivity
        { keywords: ['일', '작업', '업무', 'work'], responses: [
                '오늘 어떤 일을 하고 계신가요? 도움이 필요하시면 언제든 말씀해주세요!',
                '업무가 많으시군요! 스케줄 관리나 일정 정리가 필요하시면 아래 퀵 액션 버튼을 활용해보세요.',
                '일하시느라 고생 많으세요. 무엇인가 정리하거나 관리할 것이 있으시면 도와드릴게요!'
            ] },
        // Calendar/schedule related
        { keywords: ['일정', '캘린더', '스케줄', '약속'], responses: [
                '일정 관리는 정말 중요하죠! 아래 캘린더 버튼을 사용해서 오늘 일정을 확인하거나 새로운 일정을 추가해보세요.',
                '스케줄이 복잡하실 것 같네요. 캘린더 연동이 되어 있다면 빠른 액션으로 쉽게 관리할 수 있어요!',
                '약속이나 일정이 많으시군요! 구글 캘린더와 연동해서 더 편리하게 관리해보시는 건 어떨까요?'
            ] },
        // Email related  
        { keywords: ['메일', '이메일', 'email', 'gmail'], responses: [
                '이메일 관리도 업무에서 중요한 부분이죠. Gmail 기능은 곧 추가될 예정이니 조금만 기다려주세요!',
                '메일함이 복잡하시나봐요. 곧 Gmail 연동 기능을 추가해서 더 편리하게 관리할 수 있도록 할게요.',
                '이메일 확인하시느라 바쁘시겠네요! Gmail 기능은 개발 중이에요.'
            ] },
        // General conversation
        { keywords: ['어떻게', '뭐', '무엇', '어디', '언제', '왜'], responses: [
                '궁금한 게 있으시군요! 구체적으로 어떤 도움이 필요하신지 말씀해주시면 더 잘 도와드릴 수 있어요.',
                '질문이 있으시네요. 서비스 연동이나 일정 관리 등 필요한 기능이 있으시면 알려주세요!',
                '더 자세히 설명해주시면 맞춤형으로 도움을 드릴 수 있을 것 같아요.'
            ] },
        // Positive responses
        { keywords: ['좋아', '감사', '고마워', '최고', '훌륭'], responses: [
                '기뻐해주셔서 감사해요! 더 도움이 필요하시면 언제든 말씀해주세요.',
                '칭찬해주셔서 고맙습니다! 앞으로도 더 나은 서비스로 도움드리겠어요.',
                '만족해주셔서 다행이에요! 계속해서 유용한 기능들을 제공해드릴게요.'
            ] }
    ];
    // Find matching response
    for (const responseGroup of responses) {
        if (responseGroup.keywords.some(keyword => lastMessage.toLowerCase().includes(keyword))) {
            const randomResponse = responseGroup.responses[Math.floor(Math.random() * responseGroup.responses.length)];
            return randomResponse;
        }
    }
    // Default conversational responses
    const defaultResponses = [
        '흥미로운 이야기네요! 더 자세히 들려주세요.',
        '그렇군요! 제가 어떻게 도와드릴까요?',
        '말씀해주셔서 감사해요. 다른 도움이 필요한 것은 없나요?',
        '이해했어요. 필요한 기능이나 도움이 있으시면 아래 버튼들을 활용해보세요!',
        '좋은 생각이네요! 무엇인가 더 도움드릴 것이 있을까요?'
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
    }
    catch (error) {
        console.error('[Chatbot Stream] Error:', error);
        res.write(`data: ${JSON.stringify({ error: 'Internal server error' })}\n\n`);
        res.end();
    }
});
/**
 * POST /api/chatbot/action
 * Handle chatbot actions for integrated services
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
                // Create Gmail draft using Interactor API
                const url = `${process.env.INTERACTOR_BASE_URL || 'https://console.interactor.com/api/v1'}/connector/interactor/gmail-v1/action/gmail.users.drafts.create/execute`;
                console.log(`[Gmail Draft Create] URL: ${url}?account=${account}`);
                console.log(`[Gmail Draft Create] Data:`, {
                    userId: account,
                    message: {
                        to: [to],
                        subject: subject,
                        textBody: body || ''
                    }
                });
                const response = await axios.post(url, {
                    userId: account,
                    message: {
                        to: [to],
                        subject: subject,
                        textBody: body || ''
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
                    userId: account,
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
                console.log(`[Gmail Labels List] Data:`, { userId: account });
                const response = await axios.post(url, {
                    userId: account
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
