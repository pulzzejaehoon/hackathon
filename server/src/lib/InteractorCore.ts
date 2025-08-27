// PRD-compliant Interactor Core Module
// Processes structured command JSON objects and executes external service API calls

import { IntegrationService } from '../services/IntegrationService.js';
import { callInteractorApi } from './interactor.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { getTodayStartKorea, getTodayEndKorea, formatKoreaDateTime, formatKoreaTime, formatKoreaDate } from '../utils/timezone.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// PRD-specified structured command interface
export interface StructuredCommand {
  service: string; // e.g., "google.calendar", "gmail", "googledrive"
  action: string;  // e.g., "create_event", "list_messages", "search_files"
  params: Record<string, any>; // Action-specific parameters
  userId: string; // User identifier for token lookup
}

// Standardized response interface
export interface InteractorResponse {
  success: boolean;
  data?: any;
  error?: string;
  message?: string;
}

// User data interface matching current users.json structure
interface UserData {
  id: number;
  email: string;
  password_hash: string;
  created_at: string;
  last_login?: string;
}

export class InteractorCore {
  private static usersFilePath = path.join(__dirname, '../../data/users.json');

  /**
   * Main entry point: processes structured commands according to PRD specification
   */
  static async processCommand(command: StructuredCommand): Promise<InteractorResponse> {
    try {
      console.log(`[InteractorCore] Processing command:`, {
        service: command.service,
        action: command.action,
        userId: command.userId
      });

      // Step 1: Validate command structure
      const validation = this.validateCommand(command);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }

      // Step 2: Resolve user email and check authentication
      const userData = await this.getUserData(command.userId);
      if (!userData) {
        return { success: false, error: 'User not found or not authenticated' };
      }

      // Step 3: Handle special services
      if (command.service === 'briefing') {
        // Briefing service doesn't require integration check
        if (command.action === 'daily') {
          try {
            // Call briefing API directly
            const result = { success: true, data: { message: 'Daily briefing feature will be available once services are connected.' } };
            return result;
          } catch (error: any) {
            return { success: false, error: `Briefing failed: ${error.message}` };
          }
        }
        return { success: false, error: `Unsupported briefing action: ${command.action}` };
      }

      // Step 4: Map service to integration ID
      const integrationId = this.mapServiceToIntegrationId(command.service);
      if (!integrationId) {
        return { success: false, error: `Unsupported service: ${command.service}` };
      }

      // Step 5: Check service connection status
      const status = await IntegrationService.getStatus(integrationId, userData.email);
      if (!status.connected) {
        return { 
          success: false, 
          error: `Service ${command.service} is not connected. Please connect it first.` 
        };
      }

      // Step 5: Execute the API call via appropriate connector
      const result = await this.executeServiceAction(
        integrationId,
        command.action,
        command.params,
        userData.email
      );

      // Format the response for better user experience
      if (result.success && result.data) {
        const formattedMessage = this.formatApiResponseToUserFriendly(
          command.action,
          result.data,
          integrationId
        );
        return {
          ...result,
          message: formattedMessage
        };
      }

      return result;

    } catch (error: any) {
      console.error('[InteractorCore] Command processing failed:', error);
      return { 
        success: false, 
        error: `Command processing failed: ${error.message}` 
      };
    }
  }

  /**
   * Validates structured command format according to PRD
   */
  private static validateCommand(command: StructuredCommand): { valid: boolean; error?: string } {
    if (!command.service || typeof command.service !== 'string') {
      return { valid: false, error: 'Missing or invalid service field' };
    }

    if (!command.action || typeof command.action !== 'string') {
      return { valid: false, error: 'Missing or invalid action field' };
    }

    if (!command.params || typeof command.params !== 'object') {
      return { valid: false, error: 'Missing or invalid params field' };
    }

    if (!command.userId || typeof command.userId !== 'string') {
      return { valid: false, error: 'Missing or invalid userId field' };
    }

    return { valid: true };
  }

  /**
   * Maps PRD service names to IntegrationService IDs
   */
  private static mapServiceToIntegrationId(service: string): string | null {
    const serviceMap: Record<string, string> = {
      'google.calendar': 'googlecalendar',
      'calendar': 'googlecalendar',
      'googlecalendar': 'googlecalendar',
      'gmail': 'gmail',
      'google.gmail': 'gmail',
      'googledrive': 'googledrive',
      'drive': 'googledrive',
      'google.drive': 'googledrive',
      'slack': 'slack'
    };

    return serviceMap[service.toLowerCase()] || null;
  }

  /**
   * Retrieves user data from users.json file
   */
  private static async getUserData(userId: string): Promise<UserData | null> {
    try {
      const data = await fs.readFile(this.usersFilePath, 'utf-8');
      const parsed = JSON.parse(data);
      const users: UserData[] = parsed.users || [];
      
      // Find user by ID (number) or email (string)
      const user = users.find(u => 
        u.id.toString() === userId || 
        u.email === userId ||
        u.id === parseInt(userId, 10)
      );
      return user || null;
    } catch (error) {
      console.error('[InteractorCore] Failed to read user data:', error);
      return null;
    }
  }

  /**
   * Executes service action by calling appropriate connector
   */
  private static async executeServiceAction(
    integrationId: string,
    action: string,
    params: Record<string, any>,
    userEmail: string
  ): Promise<InteractorResponse> {
    try {
      // Get integration config
      const integration = IntegrationService.getIntegration(integrationId);
      if (!integration) {
        return { success: false, error: `Integration ${integrationId} not found` };
      }

      // Map action to Interactor API action
      const interactorAction = this.mapActionToInteractorAction(integrationId, action);
      if (!interactorAction) {
        return { 
          success: false, 
          error: `Action ${action} not supported for service ${integrationId}` 
        };
      }

      // Execute via Interactor API - correct format with connector
      console.log(`[InteractorCore] Executing ${integrationId}/${action} with params:`, params);
      const result = await callInteractorApi({
        account: userEmail,
        connector: integration.interactorConnectorName,
        action: interactorAction,
        data: params
      });

      if (result.success) {
        return {
          success: true,
          data: result.output,
          message: `${action} completed successfully`
        };
      } else {
        return {
          success: false,
          error: result.error || 'Service action failed'
        };
      }

    } catch (error: any) {
      console.error(`[InteractorCore] Service action failed for ${integrationId}:`, error);
      return {
        success: false,
        error: `Service execution failed: ${error.message}`
      };
    }
  }

  /**
   * Maps high-level actions to specific Interactor API actions
   */
  private static mapActionToInteractorAction(integrationId: string, action: string): string | null {
    const actionMaps: Record<string, Record<string, string>> = {
      'googlecalendar': {
        'create_event': 'calendar.events.insert',
        'list_events': 'calendar.events.list',
        'get_today_events': 'calendar.events.list',
        'quick_add': 'calendar.events.quickAdd',
        'update_event': 'calendar.events.update',
        'delete_event': 'calendar.events.delete'
      },
      'gmail': {
        'list_messages': 'gmail.users.messages.list',
        'get_message': 'gmail.users.messages.get',
        'send_message': 'gmail.users.messages.send',
        'create_draft': 'gmail.users.drafts.create',
        'list_labels': 'gmail.users.labels.list',
        'search_messages': 'gmail.users.messages.list'
      },
      'googledrive': {
        'list_files': 'drive.files.list',
        'get_file': 'drive.files.get',
        'create_folder': 'drive.files.create',
        'search_files': 'drive.files.list',
        'upload_file': 'drive.files.create',
        'delete_file': 'drive.files.delete'
      },
      'slack': {
        'send_message': 'chat_postMessage',
        'schedule_message': 'chat_scheduleMessage',
        'list_channels': 'conversations_list',
        'get_user_info': 'users_info',
        'auth_test': 'auth_test'
      }
    };

    return actionMaps[integrationId]?.[action] || null;
  }

  /**
   * Quick Start Button action mapping - converts button actions to structured commands
   */
  static createQuickStartCommand(
    buttonAction: string,
    userId: string,
    params: Record<string, any> = {}
  ): StructuredCommand | null {
    const quickActionMap: Record<string, { service: string; action: string; defaultParams: Record<string, any> }> = {
      'getTodaysEvents': {
        service: 'google.calendar',
        action: 'list_events',
        defaultParams: {
          calendarId: 'primary',
          timeMin: getTodayStartKorea(),
          timeMax: getTodayEndKorea(),
          singleEvents: true,
          orderBy: 'startTime'
        }
      },
      'listMessages': {
        service: 'gmail',
        action: 'list_messages',
        defaultParams: {
          userId: 'me',
          maxResults: 10,
          q: 'in:inbox'
        }
      },
      'listLabels': {
        service: 'gmail',
        action: 'list_labels',
        defaultParams: {
          userId: 'me'
        }
      },
      'getRecentFiles': {
        service: 'googledrive',
        action: 'list_files',
        defaultParams: {
          pageSize: 10,
          orderBy: 'modifiedTime desc',
          fields: 'files(id,name,mimeType,modifiedTime,webViewLink)'
        }
      },
      'createEvent': {
        service: 'google.calendar',
        action: 'quick_add',
        defaultParams: {
          calendarId: 'primary',
          text: 'New Meeting - 1 hour'
        }
      },
      'createDraft': {
        service: 'gmail',
        action: 'create_draft',
        defaultParams: {
          userId: 'me',
          to: '',
          subject: 'New Draft',
          body: 'Draft content'
        }
      },
      'createFolder': {
        service: 'googledrive',
        action: 'create_folder',
        defaultParams: {
          name: 'New Folder',
          mimeType: 'application/vnd.google-apps.folder'
        }
      },
      'searchFiles': {
        service: 'googledrive',
        action: 'search_files',
        defaultParams: {
          pageSize: 20,
          fields: 'files(id,name,mimeType,modifiedTime,webViewLink)'
        }
      },
      'getDailyBriefing': {
        service: 'briefing',
        action: 'daily',
        defaultParams: {}
      },
      'sendSlackMessage': {
        service: 'slack',
        action: 'schedule_message',
        defaultParams: {
          channel: '#general',
          text: '안녕하세요! Slack 연동 테스트입니다.',
          post_at: Math.floor(Date.now() / 1000) + 60 // 1분 후 전송
        }
      },
      'listSlackChannels': {
        service: 'slack',
        action: 'list_channels',
        defaultParams: {
          types: 'public_channel,private_channel'
        }
      }
    };

    const mapping = quickActionMap[buttonAction];
    if (!mapping) {
      console.warn(`[InteractorCore] Unknown quick action: ${buttonAction}`);
      return null;
    }

    return {
      service: mapping.service,
      action: mapping.action,
      params: { ...mapping.defaultParams, ...params },
      userId
    };
  }

  /**
   * Batch command processing for multiple operations
   */
  static async processBatchCommands(commands: StructuredCommand[]): Promise<InteractorResponse[]> {
    const results = await Promise.allSettled(
      commands.map(command => this.processCommand(command))
    );

    return results.map(result => 
      result.status === 'fulfilled' 
        ? result.value 
        : { success: false, error: 'Command processing failed' }
    );
  }

  /**
   * Formats raw API response data into user-friendly messages
   */
  /**
   * Public format response method (for external use)
   */
  static formatResponse(action: string, data: any, integrationId?: string): string {
    try {
      // If integrationId not provided, try to infer from action pattern
      if (!integrationId) {
        if (action.includes('event') || action.includes('calendar')) {
          integrationId = 'googlecalendar';
        } else if (action.includes('message') || action.includes('gmail')) {
          integrationId = 'gmail';
        } else if (action.includes('file') || action.includes('drive')) {
          integrationId = 'googledrive';
        } else if (action.includes('slack') || action.includes('channel')) {
          integrationId = 'slack';
        }
      }

      return this.formatApiResponseToUserFriendly(action, data, integrationId || 'unknown');
    } catch (error) {
      console.error(`[InteractorCore] Format error for ${action}:`, error);
      return '작업이 완료되었습니다.';
    }
  }

  private static formatApiResponseToUserFriendly(
    action: string,
    data: any,
    integrationId: string
  ): string {
    try {
      switch (integrationId) {
        case 'googlecalendar':
          return this.formatCalendarResponse(action, data);
        case 'gmail':
          return this.formatGmailResponse(action, data);
        case 'googledrive':
          return this.formatDriveResponse(action, data);
        case 'slack':
          return this.formatSlackResponse(action, data);
        default:
          return 'Action completed successfully';
      }
    } catch (error) {
      console.error(`[InteractorCore] Format error for ${action}:`, error);
      return 'Action completed successfully';
    }
  }

  /**
   * Formats Google Calendar API responses
   */
  private static formatCalendarResponse(action: string, data: any): string {
    switch (action) {
      case 'list_events':
      case 'get_today_events': {
        // Extract events from various possible response structures
        let events = [];
        if (data.body?.items) {
          events = data.body.items;
        } else if (data.output?.body?.items) {
          events = data.output.body.items;
        } else if (data.items) {
          events = data.items;
        } else if (Array.isArray(data.body)) {
          events = data.body;
        } else if (Array.isArray(data)) {
          events = data;
        }

        if (!events || events.length === 0) {
          return '📅 오늘 예정된 일정이 없습니다.';
        }

        let content = '📅 **오늘의 일정:**\n\n';
        events.forEach((event: any, index: number) => {
          const title = event.summary || '제목 없음';
          let time = '';
          
          if (event.start) {
            if (event.start.dateTime) {
              time = formatKoreaTime(event.start.dateTime);
            } else if (event.start.date) {
              time = '종일';
            }
          }

          const location = event.location ? ` 📍 ${event.location}` : '';
          content += `${index + 1}. **${title}** ${time ? `(${time})` : ''}${location}\n`;
        });

        return content.trim();
      }

      case 'quick_add':
      case 'create_event': {
        // Extract event from response
        let event = null;
        if (data.body) {
          event = data.body;
        } else if (data.output?.body) {
          event = data.output.body;
        } else if (data.output) {
          event = data.output;
        } else {
          event = data;
        }

        const title = event?.summary || '새 일정';
        let time = '';
        
        if (event?.start) {
          if (event.start.dateTime) {
            time = formatKoreaDateTime(event.start.dateTime);
          } else if (event.start.date) {
            time = formatKoreaDate(event.start.date) + ' (종일)';
          }
        }

        return `📅 **일정이 생성되었습니다!**\n\n📋 **제목:** ${title}\n⏰ **시간:** ${time || '시간 미정'}`;
      }

      default:
        return '📅 캘린더 작업이 완료되었습니다.';
    }
  }

  /**
   * Formats Gmail API responses
   */
  private static formatGmailResponse(action: string, data: any): string {
    switch (action) {
      case 'list_messages': {
        let messages = [];
        if (data.body?.messages) {
          messages = data.body.messages;
        } else if (data.output?.body?.messages) {
          messages = data.output.body.messages;
        } else if (data.messages) {
          messages = data.messages;
        }

        if (!messages || messages.length === 0) {
          return '📧 받은편지함에 메일이 없습니다.';
        }

        let content = '📧 **최근 메일 목록:**\n\n';
        messages.slice(0, 5).forEach((message: any, index: number) => {
          // Note: list messages only returns message IDs
          content += `${index + 1}. 메시지 ID: ${message.id}\n`;
        });
        content += '\n💡 상세 내용을 보려면 Gmail을 확인해주세요.';

        return content.trim();
      }

      case 'list_labels': {
        let labels = [];
        if (data.body?.labels) {
          labels = data.body.labels;
        } else if (data.output?.body?.labels) {
          labels = data.output.body.labels;
        } else if (data.labels) {
          labels = data.labels;
        }

        if (!labels || labels.length === 0) {
          return '📧 Gmail 라벨이 없습니다.';
        }

        let content = '📧 **Gmail 라벨 목록:**\n\n';
        
        // Show only user-friendly system labels and custom labels
        const userFriendlyLabels = labels.filter((label: any) => {
          const systemLabels = ['INBOX', 'SENT', 'DRAFT', 'STARRED', 'IMPORTANT', 'TRASH', 'SPAM'];
          return systemLabels.includes(label.name) || label.type === 'user';
        });

        userFriendlyLabels.forEach((label: any, index: number) => {
          let labelName = label.name;
          
          // Translate system labels to Korean
          const labelTranslations: Record<string, string> = {
            'INBOX': '받은편지함',
            'SENT': '보낸편지함',
            'DRAFT': '임시보관함',
            'STARRED': '중요편지함',
            'IMPORTANT': '중요',
            'TRASH': '휴지통',
            'SPAM': '스팸'
          };
          
          labelName = labelTranslations[label.name] || label.name;
          content += `${index + 1}. ${labelName}\n`;
        });

        return content.trim();
      }

      case 'create_draft': {
        return '📧 **이메일 초안이 생성되었습니다!**\n\n✅ Gmail에서 확인하고 발송할 수 있습니다.';
      }

      default:
        return '📧 Gmail 작업이 완료되었습니다.';
    }
  }

  /**
   * Formats Google Drive API responses
   */
  private static formatDriveResponse(action: string, data: any): string {
    switch (action) {
      case 'list_files': {
        let files = [];
        if (data.body?.files) {
          files = data.body.files;
        } else if (data.output?.body?.files) {
          files = data.output.body.files;
        } else if (data.files) {
          files = data.files;
        }

        if (!files || files.length === 0) {
          return '📁 Google Drive에 파일이 없습니다.';
        }

        let content = '📁 **Google Drive 파일 목록:**\n\n';
        files.slice(0, 10).forEach((file: any, index: number) => {
          const fileName = file.name || '이름 없음';
          const isFolder = file.mimeType?.includes('folder');
          const icon = isFolder ? '📂' : '📄';
          const size = file.size && !isFolder ? ` (${Math.round(file.size / 1024)}KB)` : '';
          
          content += `${icon} ${index + 1}. **${fileName}**${size}\n`;
        });

        if (files.length > 10) {
          content += `\n... 그 외 ${files.length - 10}개 파일`;
        }

        return content.trim();
      }

      case 'create_folder': {
        let folder = null;
        if (data.body) {
          folder = data.body;
        } else if (data.output?.body) {
          folder = data.output.body;
        } else {
          folder = data;
        }

        const folderName = folder?.name || '새 폴더';
        return `📂 **폴더가 생성되었습니다!**\n\n📋 **이름:** ${folderName}`;
      }

      case 'search_files': {
        let files = [];
        if (data.body?.files) {
          files = data.body.files;
        } else if (data.output?.body?.files) {
          files = data.output.body.files;
        } else if (data.files) {
          files = data.files;
        }

        if (!files || files.length === 0) {
          return '📁 검색 결과가 없습니다.';
        }

        let content = '📁 **검색 결과:**\n\n';
        files.forEach((file: any, index: number) => {
          const fileName = file.name || '이름 없음';
          const isFolder = file.mimeType?.includes('folder');
          const icon = isFolder ? '📂' : '📄';
          
          content += `${icon} ${index + 1}. **${fileName}**\n`;
        });

        return content.trim();
      }

      default:
        return '📁 Google Drive 작업이 완료되었습니다.';
    }
  }

  /**
   * Formats Slack API responses
   */
  private static formatSlackResponse(action: string, data: any): string {
    switch (action) {
      case 'schedule_message': {
        let result = null;
        if (data.body) {
          result = data.body;
        } else if (data.output?.body) {
          result = data.output.body;
        } else {
          result = data;
        }

        if (result?.ok || result?.scheduled_message_id) {
          const scheduleTime = result.post_at 
            ? formatKoreaDateTime(new Date(result.post_at * 1000))
            : '예약 시간 미정';
          
          return `💬 **Slack 메시지가 예약되었습니다!**\n\n📋 **채널:** ${result.channel || '알 수 없음'}\n⏰ **전송 시간:** ${scheduleTime}`;
        } else {
          return `💬 **Slack 메시지 예약에 실패했습니다.**\n\n❌ ${result?.error || '알 수 없는 오류'}`;
        }
      }

      case 'list_channels': {
        let channels = [];
        if (data.body?.channels) {
          channels = data.body.channels;
        } else if (data.output?.body?.channels) {
          channels = data.output.body.channels;
        } else if (data.channels) {
          channels = data.channels;
        }

        if (!channels || channels.length === 0) {
          return '💬 접근 가능한 Slack 채널이 없습니다.';
        }

        let content = '💬 **Slack 채널 목록:**\n\n';
        channels.slice(0, 10).forEach((channel: any, index: number) => {
          const channelName = channel.name || 'unknown';
          const isPrivate = channel.is_private ? '🔒' : '#';
          const memberCount = channel.num_members ? ` (${channel.num_members}명)` : '';
          
          content += `${isPrivate} ${index + 1}. **${channelName}**${memberCount}\n`;
        });

        if (channels.length > 10) {
          content += `\n... 그 외 ${channels.length - 10}개 채널`;
        }

        return content.trim();
      }

      case 'auth_test': {
        let result = null;
        if (data.body) {
          result = data.body;
        } else if (data.output?.body) {
          result = data.output.body;
        } else {
          result = data;
        }

        if (result?.ok) {
          const user = result.user || 'Unknown User';
          const team = result.team || 'Unknown Team';
          return `💬 **Slack 연결 확인 완료!**\n\n👤 **사용자:** ${user}\n🏢 **팀:** ${team}`;
        } else {
          return `💬 **Slack 연결 확인 실패**\n\n❌ ${result?.error || '알 수 없는 오류'}`;
        }
      }

      default:
        return '💬 Slack 작업이 완료되었습니다.';
    }
  }
}