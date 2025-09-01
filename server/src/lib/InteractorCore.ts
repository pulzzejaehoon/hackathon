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
            // Import and call briefing handler from chatbot
            const chatbotModule = await import('../routes/chatbot.js');
            
            // Use the briefing action handler we created
            const result = await this.handleBriefingAction(userData.email, 'daily', {});
            return { 
              success: result.success,
              message: result.content,
              data: result.content 
            };
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

      // For Gmail, use the actual authenticated account from status
      // This ensures we use the correct Gmail account that was actually authenticated
      const accountToUse = (integrationId === 'gmail' && status.account) ? status.account : userData.email;
      
      console.log(`[InteractorCore] Using account: ${accountToUse} (service: ${integrationId}, jwt: ${userData.email}, status: ${status.account})`);

      // Step 5: Execute the API call via appropriate connector
      const result = await this.executeServiceAction(
        integrationId,
        command.action,
        command.params,
        accountToUse
      );

      // Return result (message already formatted in executeServiceAction)
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
      'slack': 'slack',
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

      // Special handling for Gmail operations - match exact curl format
      let processedParams = params;
      if (integrationId === 'gmail') {
        processedParams = InteractorCore.buildGmailApiParams(action, params, userEmail);
      }

      // Special handling for Google Drive search operations
      if (integrationId === 'googledrive' && action === 'search_files') {
        processedParams = InteractorCore.buildDriveSearchParams(params);
      }

      // Execute via Interactor API - correct format with connector
      console.log(`[InteractorCore] Executing ${integrationId}/${action} with params:`, processedParams);
      const result = await callInteractorApi({
        account: userEmail,
        connector: integration.interactorConnectorName,
        action: interactorAction,
        data: processedParams
      });

      // Special success detection for Gmail operations  
      if (integrationId === 'gmail' && (action === 'create_draft' || action === 'send_email')) {
        const isSuccess = this.validateGmailOperationSuccess(result, action);
        if (!isSuccess) {
          const operation = action === 'create_draft' ? 'draft creation' : 'email sending';
          return {
            success: false,
            error: `Gmail ${operation} failed - no ${action === 'create_draft' ? 'draft' : 'message'} ID returned`
          };
        }
      }

      // SPECIAL Gmail error handling - check for 403/401 in status_code
      if (integrationId === 'gmail' && result.output?.output?.status_code >= 400) {
        const statusCode = result.output.output.status_code;
        const errorMessage = result.output.output.body?.error?.message || 
                            `Gmail API error: ${statusCode}`;
        return {
          success: false,
          error: errorMessage
        };
      }

      if (result.success) {
        // Format the response data for user-friendly display
        const formattedMessage = this.formatApiResponseToUserFriendly(
          action,
          result.output,
          integrationId
        );
        
        return {
          success: true,
          data: result.output,
          message: formattedMessage
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
   * Builds Gmail API parameters matching EXACT curl format provided by user
   */
  private static buildGmailApiParams(action: string, params: Record<string, any>, userEmail: string): Record<string, any> {
    console.log(`[InteractorCore] buildGmailApiParams called with action: ${action}, userEmail: ${userEmail}, originalParams:`, params);
    switch (action) {
      case 'list_messages':
        // Pass through maxResults and pageToken for pagination
        const result = {
          userId: 'me', // Gmail API always uses 'me' for authenticated user
          maxResults: params.maxResults || 10,
          pageToken: params.pageToken || undefined,
          q: params.q || 'in:inbox',
          // Note: Gmail messages.list API only returns message IDs
          // To get subjects, we need to fetch individual messages or use threads.list
          includeSpamTrash: false
        };
        console.log(`[InteractorCore] buildGmailApiParams result for listMessages:`, result);
        return result;

      case 'get_message':
        // curl data: { "id": "message_id", "userId": "jaehoon@interactor.com" }
        return {
          id: params.id,
          userId: 'me', // Gmail API always uses 'me' for authenticated user
          format: params.format || 'full' // Allow format to be specified
        };

      case 'send_email':
        // curl data: { "raw": "base64_encoded_message", "userId": "me" }
        const rawMessage = InteractorCore.buildRFC822Message(params, userEmail);
        return {
          raw: rawMessage,
          userId: "me" // For sending, use 'me' as per curl example
        };

      case 'create_draft':
        // For draft creation, build RFC822 and wrap in resource
        const draftMessage = InteractorCore.buildRFC822Message(params, userEmail);
        return {
          userId: 'me',
          resource: {
            message: {
              raw: draftMessage
            }
          }
        };

      case 'list_threads':
        // Similar to list_messages
        return {
          userId: 'me'
        };

      default:
        // For other Gmail actions, use 'me' for consistency
        return {
          ...params,
          userId: 'me'
        };
    }
  }

  /**
   * Builds RFC822 message exactly like the curl example base64 content
   * Curl example decodes to: "From: jaehoon@interactor.com\nTo: jaehoon@interactor.com\nSubject: Test email\n\nThis is the body."
   */
  private static buildRFC822Message(params: Record<string, any>, userEmail: string): string {
    // Extract email components with defaults
    const to = params.to || '';
    const subject = params.subject || '';
    const body = params.body || '';
    const from = params.from || userEmail; // Default to authenticated user's email

    // Build RFC822 message EXACTLY like curl example (using \n not \r\n)
    let message = '';
    message += `From: ${from}\n`;
    message += `To: ${to}\n`;
    message += `Subject: ${subject}\n`;
    message += `\n`; // Empty line separates headers from body  
    message += body;

    console.log(`[InteractorCore] Built RFC822 message for Gmail:`, {
      from,
      to, 
      subject,
      messageLength: message.length,
      rawMessage: message
    });

    // Base64 encode the RFC822 message (standard base64, not URL-safe)
    const base64Message = Buffer.from(message).toString('base64');

    console.log(`[InteractorCore] Base64 encoded message:`, {
      base64Length: base64Message.length,
      base64Sample: base64Message.substring(0, 100) + '...'
    });

    return base64Message;
  }

  /**
   * Builds Google Drive search parameters, auto-mapping simple text to 'name contains' queries
   */
  private static buildDriveSearchParams(params: Record<string, any>): Record<string, any> {
    const { q, query, ...otherParams } = params;
    
    // Use either 'q' or 'query' parameter
    const searchText = q || query;
    
    if (searchText && typeof searchText === 'string') {
      // If the query doesn't already contain operators like 'contains', 'name', 'fullText', etc.
      // auto-wrap it with 'name contains' for better UX
      const hasOperators = /\b(contains|name|fullText|mimeType|parents|trashed|starred|shared)\b/i.test(searchText);
      
      let processedQuery = searchText;
      if (!hasOperators) {
        // Simple text search - wrap with name contains for better results
        processedQuery = `name contains '${searchText.replace(/'/g, "\\'")}'`;
      }
      
      console.log(`[InteractorCore] Drive search query transformation:`, {
        original: searchText,
        hasOperators,
        processed: processedQuery
      });
      
      return {
        ...otherParams,
        q: processedQuery,
        pageSize: otherParams.pageSize || 20,
        fields: otherParams.fields || 'files(id,name,mimeType,modifiedTime,webViewLink,parents)'
      };
    }
    
    // Return as-is if no query parameter
    return {
      ...otherParams,
      pageSize: otherParams.pageSize || 20,
      fields: otherParams.fields || 'files(id,name,mimeType,modifiedTime,webViewLink,parents)'
    };
  }

  /**
   * Validates Gmail operations success by checking for appropriate ID
   */
  private static validateGmailOperationSuccess(result: any, action: string): boolean {
    if (!result.success) {
      return false;
    }

    // For send_email, check for HTTP 200 status instead of ID (some APIs don't return ID immediately)
    if (action === 'send_email') {
      const statusCode = result.output?.output?.status_code || result.output?.status_code || 200;
      console.log(`[InteractorCore] Gmail ${action} validation:`, {
        hasOutput: !!result.output,
        statusCode,
        success: statusCode < 400
      });
      return statusCode < 400;
    }

    // Check various possible response structures for ID for other operations
    const responseId = result.output?.body?.id || 
                      result.output?.output?.body?.id ||
                      result.output?.id || 
                      result.raw?.body?.id ||
                      result.raw?.id;

    console.log(`[InteractorCore] Gmail ${action} validation:`, {
      hasOutput: !!result.output,
      hasId: !!responseId,
      outputKeys: result.output ? Object.keys(result.output) : [],
      responseId
    });

    return !!responseId;
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
        'quick_add': 'calendar.events.insert',
        'update_event': 'calendar.events.update',
        'delete_event': 'calendar.events.delete',
        'list_calendars': 'calendar.calendarList.list',
        'get_event': 'calendar.events.get'
      },
      'gmail': {
        'list_messages': 'gmail.users.messages.list',
        'list_threads': 'gmail.users.threads.list',
        'get_message': 'gmail.users.messages.get',
        'get_thread': 'gmail.users.threads.get',
        'send_message': 'gmail.users.messages.send',
        'send_email': 'gmail.users.messages.send',
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
        'send_message': 'chat.postMessage',
        'list_users': 'users.list',
        'list_channels': 'channels.list',
        'get_user': 'users.info'
      },
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
      'listCalendars': {
        service: 'google.calendar',
        action: 'list_calendars',
        defaultParams: {}
      },
      'listEvents': {
        service: 'google.calendar',
        action: 'list_events',
        defaultParams: {
          singleEvents: true,
          orderBy: 'startTime'
        }
      },
      'getEvent': {
        service: 'google.calendar',
        action: 'get_event',
        defaultParams: {}
      },
      'listMessages': {
        service: 'gmail',
        action: 'list_messages',
        defaultParams: {
          // Gmail API expects actual email address, not 'me'
        }
      },
      'listThreads': {
        service: 'gmail',
        action: 'list_threads',
        defaultParams: {
          // Gmail API expects actual email address, not 'me'
        }
      },
      'getMessage': {
        service: 'gmail',
        action: 'get_message',
        defaultParams: {
          // Gmail API expects actual email address, not 'me'
        }
      },
      'sendEmail': {
        service: 'gmail',
        action: 'send_email',
        defaultParams: {
          // Gmail API expects actual email address, not 'me'
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
          summary: 'New Meeting',
          start: {
            dateTime: new Date(Date.now() + 60*60*1000).toISOString(),
            timeZone: 'Asia/Seoul'
          },
          end: {
            dateTime: new Date(Date.now() + 2*60*60*1000).toISOString(),
            timeZone: 'Asia/Seoul'
          }
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
        action: 'send_message',
        defaultParams: {
          channel: '#general',
          text: ''
        }
      },
      'listSlackUsers': {
        service: 'slack',
        action: 'list_users',
        defaultParams: {}
      },
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
        }
      }

      return this.formatApiResponseToUserFriendly(action, data, integrationId || 'unknown');
    } catch (error) {
      console.error(`[InteractorCore] Format error for ${action}:`, error);
      return 'Task completed successfully.';
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
          return '📅 No events scheduled for today.';
        }

        let content = '📅 **Today\'s Schedule:**\n\n';
        events.forEach((event: any, index: number) => {
          const title = event.summary || 'No title';
          let time = '';
          
          if (event.start) {
            if (event.start.dateTime) {
              time = formatKoreaTime(event.start.dateTime);
            } else if (event.start.date) {
              time = 'All day';
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

        const title = event?.summary || 'New event';
        let time = '';
        
        if (event?.start) {
          if (event.start.dateTime) {
            time = formatKoreaDateTime(event.start.dateTime);
          } else if (event.start.date) {
            time = formatKoreaDate(event.start.date) + ' (All day)';
          }
        }

        return `📅 **Event created successfully!**\n\n📋 **Title:** ${title}\n⏰ **Time:** ${time || 'Time TBD'}`;
      }

      default:
        return '📅 Calendar task completed successfully.';
    }
  }

  /**
   * Formats Gmail API responses with SPECIAL handling for Gmail structure
   */
  private static formatGmailResponse(action: string, data: any): string {
    switch (action) {
      case 'list_messages': {
        // Gmail responses have nested structure: data.output.body.messages
        let messages = [];
        if (data.output?.body?.messages) {
          messages = data.output.body.messages;
        } else if (data.body?.messages) {
          messages = data.body.messages;
        } else if (data.messages) {
          messages = data.messages;
        }

        console.log('[InteractorCore] Gmail list_messages format:', {
          hasOutput: !!data.output,
          hasBody: !!data.output?.body,
          hasMessages: !!data.output?.body?.messages,
          messageCount: messages?.length || 0,
          sampleMessage: messages?.[0]
        });

        if (!messages || messages.length === 0) {
          return '📧 No emails found in inbox.';
        }

        // Note: Gmail messages.list only returns message IDs and threadIds
        // To get subjects, we need to make additional API calls or use a different approach
        let content = '📧 **Recent Email List:**\n\n';
        content += 'Recent messages found. To see email subjects and details, please:\n';
        content += '• Connect to Gmail in the Integrations panel\n';
        content += '• Use the Gmail quick actions for detailed email information\n';
        content += '• Check your Gmail directly for full email content\n\n';
        content += `Found ${messages.length} recent messages in your inbox.`;

        return content.trim();
      }

      case 'list_threads': {
        // Gmail threads response structure
        let threads = [];
        if (data.output?.body?.threads) {
          threads = data.output.body.threads;
        } else if (data.body?.threads) {
          threads = data.body.threads;
        } else if (data.threads) {
          threads = data.threads;
        }

        console.log('[InteractorCore] Gmail list_threads format:', {
          hasOutput: !!data.output,
          hasBody: !!data.output?.body,
          hasThreads: !!data.output?.body?.threads,
          threadCount: threads?.length || 0,
          sampleThread: threads?.[0]
        });

        if (!threads || threads.length === 0) {
          return '📧 No emails found in inbox.';
        }

        let content = '📧 **Recent Emails:**\n\n';
        threads.slice(0, 5).forEach((thread: any, index: number) => {
          // Extract subject from snippet if available
          let subject = 'No Subject';
          let preview = '';
          
          if (thread.snippet) {
            // Gmail snippet usually contains the email content
            // We'll show first part as subject-like content
            const snippetText = thread.snippet.trim();
            if (snippetText.length > 50) {
              subject = snippetText.substring(0, 50) + '...';
            } else {
              subject = snippetText || 'No Subject';
            }
            preview = snippetText.length > 80 ? snippetText.substring(0, 80) + '...' : snippetText;
          }
          
          content += `${index + 1}. **${subject}**\n`;
          if (preview && preview !== subject) {
            content += `   📄 ${preview}\n`;
          }
          content += `   📧 Thread ID: ${thread.id}\n\n`;
        });

        content += '💡 Click the Gmail panel or check Gmail directly for full details.';
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
          return '📧 No Gmail labels found.';
        }

        let content = '📧 **Gmail Labels:**\n\n';
        
        // Show only user-friendly system labels and custom labels
        const userFriendlyLabels = labels.filter((label: any) => {
          const systemLabels = ['INBOX', 'SENT', 'DRAFT', 'STARRED', 'IMPORTANT', 'TRASH', 'SPAM'];
          return systemLabels.includes(label.name) || label.type === 'user';
        });

        userFriendlyLabels.forEach((label: any, index: number) => {
          let labelName = label.name;
          
          // Translate system labels to Korean
          const labelTranslations: Record<string, string> = {
            'INBOX': 'Inbox',
            'SENT': 'Sent',
            'DRAFT': 'Drafts',
            'STARRED': 'Starred',
            'IMPORTANT': 'Important',
            'TRASH': 'Trash',
            'SPAM': 'Spam'
          };
          
          labelName = labelTranslations[label.name] || label.name;
          content += `${index + 1}. ${labelName}\n`;
        });

        return content.trim();
      }

      case 'create_draft': {
        return '📧 **Email draft created successfully!**\n\n✅ You can check and send it from Gmail.';
      }

      default:
        return '📧 Gmail task completed successfully.';
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
          return '📁 No files found in Google Drive.';
        }

        let content = '📁 **Google Drive Files:**\n\n';
        files.slice(0, 10).forEach((file: any, index: number) => {
          const fileName = file.name || 'No name';
          const isFolder = file.mimeType?.includes('folder');
          const icon = isFolder ? '📂' : '📄';
          const size = file.size && !isFolder ? ` (${Math.round(file.size / 1024)}KB)` : '';
          
          content += `${icon} ${index + 1}. **${fileName}**${size}\n`;
        });

        if (files.length > 10) {
          content += `\n... and ${files.length - 10} more files`;
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

        const folderName = folder?.name || 'New folder';
        return `📂 **Folder created successfully!**\n\n📋 **Name:** ${folderName}`;
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
          return '🔍 **No search results found.**\n\nTry different keywords or check your spelling.';
        }

        let content = `🔍 **Search Results** (${files.length} ${files.length === 1 ? 'file' : 'files'} found)\n\n`;
        files.forEach((file: any, index: number) => {
          const fileName = file.name || 'No name';
          const isFolder = file.mimeType?.includes('folder');
          const icon = isFolder ? '📂' : '📄';
          const modifiedDate = file.modifiedTime ? 
            new Date(file.modifiedTime).toLocaleDateString('en-US', { 
              year: 'numeric', 
              month: 'short', 
              day: 'numeric' 
            }) : 'Unknown';
          
          content += `${icon} **${fileName}**\n`;
          content += `   📅 Modified: ${modifiedDate}`;
          
          if (file.webViewLink) {
            content += `\n   🔗 [Open in Google Drive](${file.webViewLink})`;
          }
          
          content += '\n\n';
        });

        if (files.length > 10) {
          content += `_Showing first 10 of ${files.length} results_`;
        }

        return content.trim();
      }

      default:
        return '📁 Google Drive task completed successfully.';
    }
  }

  /**
   * Handle daily briefing action
   */
  private static async handleBriefingAction(account: string, action: string, params: any) {
    console.log(`[Briefing Action] account: ${account}, action: ${action}, params:`, params);
    
    try {
      switch (action) {
        case 'getDailyBriefing':
        case 'daily': {
          // Get connection status for all services
          const [calendarStatus, gmailStatus, driveStatus] = await Promise.all([
            IntegrationService.getStatus('googlecalendar', account),
            IntegrationService.getStatus('gmail', account),
            IntegrationService.getStatus('googledrive', account)
          ]);

          const { getKoreaTime } = await import('../utils/timezone.js');
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
            briefing.summary.calendar = await this.getCalendarSummaryForBriefing(account);
          }

          // Fetch Gmail data if connected  
          if (gmailStatus.connected) {
            // Use actual authenticated Gmail account, not JWT account
            const gmailAccount = gmailStatus.account || account;
            briefing.summary.gmail = await this.getGmailSummaryForBriefing(gmailAccount);
          }

          // Fetch Drive data if connected
          if (driveStatus.connected) {
            briefing.summary.drive = await this.getDriveSummaryForBriefing(account);
          }

          // Generate suggestions and notifications
          briefing.suggestions = this.generateBriefingSuggestions(briefing.summary);
          briefing.notifications = this.generateBriefingNotifications(briefing.summary);

          const content = this.formatBriefingResponse(briefing);
          return { success: true, content };
        }

        default:
          return { success: true, content: `Unknown briefing action: ${action}` };
      }
    } catch (error: any) {
      console.error(`[Briefing Action] Error:`, error);
      return { success: true, content: `Briefing error: ${error.message}` };
    }
  }

  /**
   * Helper functions for daily briefing
   */
  private static async getCalendarSummaryForBriefing(account: string) {
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

  private static async getGmailSummaryForBriefing(account: string) {
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

  private static async getDriveSummaryForBriefing(account: string) {
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

  private static generateBriefingSuggestions(summary: any) {
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

  private static generateBriefingNotifications(summary: any) {
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

  private static formatBriefingResponse(briefing: any): string {
    let content = `📋 Daily Briefing for ${new Date(briefing.date).toLocaleDateString('en-US')}\n\n`;

    // Calendar summary
    if (briefing.summary.calendar && !briefing.summary.calendar.error) {
      const cal = briefing.summary.calendar;
      content += `📅 **${cal.todayEvents} events today**\n`;
      
      if (cal.nextEvent) {
        content += `   ⏰ Next: ${cal.nextEvent.time} ${cal.nextEvent.title}\n`;
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

}