// PRD-compliant Interactor Core Module
// Processes structured command JSON objects and executes external service API calls
import { IntegrationService } from '../services/IntegrationService.js';
import { callInteractorApi } from './interactor.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export class InteractorCore {
    static usersFilePath = path.join(__dirname, '../../data/users.json');
    /**
     * Main entry point: processes structured commands according to PRD specification
     */
    static async processCommand(command) {
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
            // Step 3: Map service to integration ID
            const integrationId = this.mapServiceToIntegrationId(command.service);
            if (!integrationId) {
                return { success: false, error: `Unsupported service: ${command.service}` };
            }
            // Step 4: Check service connection status
            const status = await IntegrationService.getStatus(integrationId, userData.email);
            if (!status.connected) {
                return {
                    success: false,
                    error: `Service ${command.service} is not connected. Please connect it first.`
                };
            }
            // Step 5: Execute the API call via appropriate connector
            const result = await this.executeServiceAction(integrationId, command.action, command.params, userData.email);
            return result;
        }
        catch (error) {
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
    static validateCommand(command) {
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
    static mapServiceToIntegrationId(service) {
        const serviceMap = {
            'google.calendar': 'googlecalendar',
            'calendar': 'googlecalendar',
            'googlecalendar': 'googlecalendar',
            'gmail': 'gmail',
            'google.gmail': 'gmail',
            'googledrive': 'googledrive',
            'drive': 'googledrive',
            'google.drive': 'googledrive'
        };
        return serviceMap[service.toLowerCase()] || null;
    }
    /**
     * Retrieves user data from users.json file
     */
    static async getUserData(userId) {
        try {
            const data = await fs.readFile(this.usersFilePath, 'utf-8');
            const parsed = JSON.parse(data);
            const users = parsed.users || [];
            // Find user by ID (number) or email (string)
            const user = users.find(u => u.id.toString() === userId ||
                u.email === userId ||
                u.id === parseInt(userId, 10));
            return user || null;
        }
        catch (error) {
            console.error('[InteractorCore] Failed to read user data:', error);
            return null;
        }
    }
    /**
     * Executes service action by calling appropriate connector
     */
    static async executeServiceAction(integrationId, action, params, userEmail) {
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
            }
            else {
                return {
                    success: false,
                    error: result.error || 'Service action failed'
                };
            }
        }
        catch (error) {
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
    static mapActionToInteractorAction(integrationId, action) {
        const actionMaps = {
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
            }
        };
        return actionMaps[integrationId]?.[action] || null;
    }
    /**
     * Quick Start Button action mapping - converts button actions to structured commands
     */
    static createQuickStartCommand(buttonAction, userId, params = {}) {
        const quickActionMap = {
            'getTodaysEvents': {
                service: 'google.calendar',
                action: 'list_events',
                defaultParams: {
                    calendarId: 'primary',
                    timeMin: new Date().toISOString().split('T')[0] + 'T00:00:00.000Z',
                    timeMax: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0] + 'T23:59:59.000Z',
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
                defaultParams: {}
            },
            'createDraft': {
                service: 'gmail',
                action: 'create_draft',
                defaultParams: {}
            },
            'createFolder': {
                service: 'googledrive',
                action: 'create_folder',
                defaultParams: {
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
    static async processBatchCommands(commands) {
        const results = await Promise.allSettled(commands.map(command => this.processCommand(command)));
        return results.map(result => result.status === 'fulfilled'
            ? result.value
            : { success: false, error: 'Command processing failed' });
    }
}
