// PRD-compliant Interactor API routes
// Handles structured command processing according to PRD specifications

import express from 'express';
import { InteractorCore, type StructuredCommand } from '../lib/InteractorCore.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

/**
 * POST /api/interactor/execute
 * Main endpoint for processing structured commands
 * 
 * Request body format (PRD-specified):
 * {
 *   "service": "google.calendar",
 *   "action": "create_event", 
 *   "params": {
 *     "title": "Team Meeting",
 *     "duration_minutes": 50,
 *     "attendees": ["user@example.com"]
 *   },
 *   "userId": "user-id-123"
 * }
 */
router.post('/execute', authMiddleware, async (req, res) => {
  try {
    const command: StructuredCommand = req.body;
    
    // Ensure userId matches authenticated user
    const user = (req as any).user;
    if (command.userId !== user.email && command.userId !== user.id) {
      return res.status(403).json({
        success: false,
        error: 'UserId in command must match authenticated user'
      });
    }

    // Process the structured command
    const result = await InteractorCore.processCommand(command);
    
    // Return result with appropriate HTTP status
    const statusCode = result.success ? 200 : 400;
    res.status(statusCode).json(result);

  } catch (error: any) {
    console.error('[InteractorAPI] Execute command error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error processing command'
    });
  }
});

/**
 * POST /api/interactor/batch
 * Batch processing for multiple structured commands
 */
router.post('/batch', authMiddleware, async (req, res) => {
  try {
    const commands: StructuredCommand[] = req.body.commands || [];
    const user = (req as any).user;

    // Validate all commands belong to authenticated user
    const invalidCommand = commands.find(cmd => 
      cmd.userId !== user.email && cmd.userId !== user.id
    );

    if (invalidCommand) {
      return res.status(403).json({
        success: false,
        error: 'All commands must belong to authenticated user'
      });
    }

    // Process all commands
    const results = await InteractorCore.processBatchCommands(commands);
    
    res.json({
      success: true,
      results,
      processed: results.length
    });

  } catch (error: any) {
    console.error('[InteractorAPI] Batch execute error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error processing batch commands'
    });
  }
});

/**
 * POST /api/interactor/quick-action
 * Converts Quick Start Button actions to structured commands and executes them
 */
router.post('/quick-action', authMiddleware, async (req, res) => {
  try {
    const { action, params = {} } = req.body;
    const user = (req as any).user;

    console.log('[Quick Action] Received:', { action, params, userEmail: user.email });

    if (!action) {
      return res.status(400).json({
        success: false,
        error: 'Action is required'
      });
    }

    // Convert quick action to structured command
    const command = InteractorCore.createQuickStartCommand(action, user.email, params);
    console.log('[Quick Action] Generated command:', command);
    
    if (!command) {
      console.log('[Quick Action] Failed to create command for action:', action);
      return res.status(400).json({
        success: false,
        error: `Unknown quick action: ${action}`
      });
    }

    // Execute the structured command
    const result = await InteractorCore.processCommand(command);
    console.log('[Quick Action] Command result:', { 
      success: result.success, 
      error: result.error, 
      message: result.message,
      dataKeys: result.data ? Object.keys(result.data) : []
    });
    
    // Format response to match client expectations
    if (result.success) {
      res.json({
        success: true,
        reply: {
          content: result.message || 'Action completed successfully'
        },
        message: result.message || 'Action completed successfully',
        data: result.data
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error || 'Action failed'
      });
    }

  } catch (error: any) {
    console.error('[InteractorAPI] Quick action error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error processing quick action'
    });
  }
});

/**
 * GET /api/interactor/supported-actions
 * Returns list of supported actions for each service
 */
router.get('/supported-actions', authMiddleware, async (req, res) => {
  try {
    const supportedActions = {
      'google.calendar': [
        'create_event',
        'list_events', 
        'get_today_events',
        'quick_add',
        'update_event',
        'delete_event'
      ],
      'gmail': [
        'list_messages',
        'get_message',
        'send_message',
        'create_draft',
        'list_labels',
        'search_messages'
      ],
      'googledrive': [
        'list_files',
        'get_file',
        'create_folder',
        'search_files',
        'upload_file',
        'delete_file'
      ]
    };

    res.json({
      success: true,
      supportedActions
    });

  } catch (error: any) {
    console.error('[InteractorAPI] Get supported actions error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve supported actions'
    });
  }
});

/**
 * POST /api/interactor/validate-command
 * Validates structured command format without executing
 */
router.post('/validate-command', authMiddleware, async (req, res) => {
  try {
    const command: StructuredCommand = req.body;
    
    // Basic validation using InteractorCore private method (we'll need to expose this)
    if (!command.service || !command.action || !command.params || !command.userId) {
      return res.status(400).json({
        success: false,
        error: 'Invalid command structure. Required: service, action, params, userId'
      });
    }

    res.json({
      success: true,
      message: 'Command structure is valid',
      command: {
        service: command.service,
        action: command.action,
        paramCount: Object.keys(command.params).length,
        userId: command.userId
      }
    });

  } catch (error: any) {
    console.error('[InteractorAPI] Validate command error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate command'
    });
  }
});

/**
 * GET /api/interactor/gmail-attachment/:messageId/:attachmentId
 * Proxy Gmail attachments for secure image loading
 */
router.get('/gmail-attachment/:messageId/:attachmentId', authMiddleware, async (req, res) => {
  try {
    const { messageId, attachmentId } = req.params;
    const user = (req as any).user;

    if (!messageId || !attachmentId) {
      return res.status(400).json({
        success: false,
        error: 'Missing messageId or attachmentId'
      });
    }

    // Use InteractorCore to get attachment data
    const command: StructuredCommand = {
      service: 'gmail',
      action: 'get_attachment',
      params: {
        messageId,
        attachmentId
      },
      userId: user.email
    };

    const result = await InteractorCore.processCommand(command);
    
    if (!result.success) {
      return res.status(400).json(result);
    }

    // Extract base64 data from response
    const attachmentData = result.data?.output?.body?.data || result.data?.data;
    
    if (!attachmentData) {
      return res.status(404).json({
        success: false,
        error: 'Attachment data not found'
      });
    }

    // Convert base64url to buffer
    const buffer = Buffer.from(attachmentData, 'base64url');
    
    // Set appropriate headers for binary content
    res.set({
      'Content-Type': 'application/octet-stream',
      'Content-Length': buffer.length,
      'Cache-Control': 'public, max-age=3600' // Cache for 1 hour
    });
    
    res.send(buffer);

  } catch (error: any) {
    console.error('[InteractorAPI] Gmail attachment proxy error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve attachment'
    });
  }
});

export default router;