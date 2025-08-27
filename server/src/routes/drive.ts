import { Router, Request, Response } from 'express';
import { callInteractorApi } from '../lib/interactor.js';
import { IntegrationService } from '../services/IntegrationService.js';

const router = Router();

/**
 * GET /api/drive/about
 * Get information about the user's Drive account and storage
 */
router.get('/about', async (req: Request, res: Response) => {
  try {
    const account = (req as any).user?.email;
    if (!account) return res.status(401).json({ ok: false, error: 'Unauthorized: missing user context' });

    const status = await IntegrationService.getStatus('googledrive', account);
    if (!status.connected) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Google Drive not connected. Please connect first.' 
      });
    }

    const api = await callInteractorApi({
      account,
      connector: 'googledrive-v1',
      action: 'drive.about.get',
      data: {
        fields: 'user,storageQuota,kind'
      }
    });

    if (!api.success) {
      return res.status(502).json({ ok: false, error: api.error || 'Failed to fetch Drive info' });
    }

    return res.json({ ok: true, about: api.output });
  } catch (e: any) {
    console.error('[Drive About] Error:', e);
    return res.status(500).json({ ok: false, error: e?.message || 'Internal server error' });
  }
});

/**
 * GET /api/drive/files/list
 * List files in Google Drive with optional query parameters
 */
router.get('/files/list', async (req: Request, res: Response) => {
  try {
    const account = (req as any).user?.email;
    if (!account) return res.status(401).json({ ok: false, error: 'Unauthorized: missing user context' });

    const status = await IntegrationService.getStatus('googledrive', account);
    if (!status.connected) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Google Drive not connected. Please connect first.' 
      });
    }

    const { 
      q, 
      pageSize = 10, 
      pageToken, 
      orderBy,
      spaces,
      fields = 'files(id,name,mimeType,parents,modifiedTime,size,webViewLink)'
    } = req.query;

    const api = await callInteractorApi({
      account,
      connector: 'googledrive-v1',
      action: 'drive.files.list',
      data: {
        q: q || undefined,
        pageSize: Math.min(Number(pageSize), 1000),
        pageToken: pageToken || undefined,
        orderBy: orderBy || undefined,
        spaces: spaces || undefined,
        fields: fields
      }
    });

    if (!api.success) {
      return res.status(502).json({ ok: false, error: api.error || 'Failed to list files' });
    }

    return res.json({ ok: true, files: api.output });
  } catch (e: any) {
    console.error('[Drive Files List] Error:', e);
    return res.status(500).json({ ok: false, error: e?.message || 'Internal server error' });
  }
});

/**
 * GET /api/drive/files/:fileId
 * Get metadata for a specific file
 */
router.get('/files/:fileId', async (req: Request, res: Response) => {
  try {
    const account = (req as any).user?.email;
    const { fileId } = req.params;
    const { fields = 'id,name,mimeType,parents,modifiedTime,size,webViewLink,downloadUrl' } = req.query;

    if (!account) return res.status(401).json({ ok: false, error: 'Unauthorized: missing user context' });

    const status = await IntegrationService.getStatus('googledrive', account);
    if (!status.connected) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Google Drive not connected. Please connect first.' 
      });
    }

    const api = await callInteractorApi({
      account,
      connector: 'googledrive-v1',
      action: 'drive.files.get',
      data: {
        fileId,
        fields: fields
      }
    });

    if (!api.success) {
      return res.status(502).json({ ok: false, error: api.error || 'Failed to get file' });
    }

    return res.json({ ok: true, file: api.output });
  } catch (e: any) {
    console.error('[Drive Get File] Error:', e);
    return res.status(500).json({ ok: false, error: e?.message || 'Internal server error' });
  }
});

/**
 * POST /api/drive/files/create
 * Create a new file or folder in Google Drive
 * Body: { name: string, parents?: string[], mimeType?: string, content?: string }
 */
router.post('/files/create', async (req: Request, res: Response) => {
  try {
    const account = (req as any).user?.email;
    const { name, parents, mimeType, content } = req.body || {};

    if (!account) return res.status(401).json({ ok: false, error: 'Unauthorized: missing user context' });
    
    if (!name) {
      return res.status(400).json({ ok: false, error: 'File name is required' });
    }

    const status = await IntegrationService.getStatus('googledrive', account);
    if (!status.connected) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Google Drive not connected. Please connect first.' 
      });
    }

    // Default to folder if no mimeType specified
    const fileData: any = {
      name,
      parents: parents || undefined,
      mimeType: mimeType || 'application/vnd.google-apps.folder'
    };

    // If content is provided, it's a file with content
    if (content) {
      fileData.mimeType = mimeType || 'text/plain';
      // Note: For actual file content upload, you'd typically need to use the media upload API
      // This is a simplified version for metadata-only creation
    }

    const api = await callInteractorApi({
      account,
      connector: 'googledrive-v1',
      action: 'drive.files.create',
      data: fileData
    });

    if (!api.success) {
      return res.status(502).json({ ok: false, error: api.error || 'Failed to create file' });
    }

    return res.json({ ok: true, file: api.output });
  } catch (e: any) {
    console.error('[Drive Create File] Error:', e);
    return res.status(500).json({ ok: false, error: e?.message || 'Internal server error' });
  }
});

/**
 * PUT /api/drive/files/:fileId
 * Update file metadata
 * Body: { name?, parents?, description? }
 */
router.put('/files/:fileId', async (req: Request, res: Response) => {
  try {
    const account = (req as any).user?.email;
    const { fileId } = req.params;
    const updateData = req.body || {};

    if (!account) return res.status(401).json({ ok: false, error: 'Unauthorized: missing user context' });

    const status = await IntegrationService.getStatus('googledrive', account);
    if (!status.connected) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Google Drive not connected. Please connect first.' 
      });
    }

    // Filter out undefined values
    const filteredData = Object.fromEntries(
      Object.entries(updateData).filter(([_, value]) => value !== undefined)
    );

    if (Object.keys(filteredData).length === 0) {
      return res.status(400).json({ ok: false, error: 'No update data provided' });
    }

    const api = await callInteractorApi({
      account,
      connector: 'googledrive-v1',
      action: 'drive.files.update',
      data: {
        fileId,
        ...filteredData
      }
    });

    if (!api.success) {
      return res.status(502).json({ ok: false, error: api.error || 'Failed to update file' });
    }

    return res.json({ ok: true, file: api.output });
  } catch (e: any) {
    console.error('[Drive Update File] Error:', e);
    return res.status(500).json({ ok: false, error: e?.message || 'Internal server error' });
  }
});

/**
 * DELETE /api/drive/files/:fileId
 * Delete a file from Google Drive
 */
router.delete('/files/:fileId', async (req: Request, res: Response) => {
  try {
    const account = (req as any).user?.email;
    const { fileId } = req.params;

    if (!account) return res.status(401).json({ ok: false, error: 'Unauthorized: missing user context' });

    const status = await IntegrationService.getStatus('googledrive', account);
    if (!status.connected) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Google Drive not connected. Please connect first.' 
      });
    }

    const api = await callInteractorApi({
      account,
      connector: 'googledrive-v1',
      action: 'drive.files.delete',
      data: { fileId }
    });

    if (!api.success) {
      return res.status(502).json({ ok: false, error: api.error || 'Failed to delete file' });
    }

    return res.json({ ok: true, deleted: true });
  } catch (e: any) {
    console.error('[Drive Delete File] Error:', e);
    return res.status(500).json({ ok: false, error: e?.message || 'Internal server error' });
  }
});

/**
 * POST /api/drive/files/:fileId/copy
 * Copy a file in Google Drive
 * Body: { name: string, parents?: string[] }
 */
router.post('/files/:fileId/copy', async (req: Request, res: Response) => {
  try {
    const account = (req as any).user?.email;
    const { fileId } = req.params;
    const { name, parents } = req.body || {};

    if (!account) return res.status(401).json({ ok: false, error: 'Unauthorized: missing user context' });
    
    if (!name) {
      return res.status(400).json({ ok: false, error: 'Copy name is required' });
    }

    const status = await IntegrationService.getStatus('googledrive', account);
    if (!status.connected) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Google Drive not connected. Please connect first.' 
      });
    }

    const api = await callInteractorApi({
      account,
      connector: 'googledrive-v1',
      action: 'drive.files.copy',
      data: {
        fileId,
        name,
        parents: parents || undefined
      }
    });

    if (!api.success) {
      return res.status(502).json({ ok: false, error: api.error || 'Failed to copy file' });
    }

    return res.json({ ok: true, file: api.output });
  } catch (e: any) {
    console.error('[Drive Copy File] Error:', e);
    return res.status(500).json({ ok: false, error: e?.message || 'Internal server error' });
  }
});

/**
 * GET /api/drive/files/:fileId/permissions
 * List permissions for a file
 */
router.get('/files/:fileId/permissions', async (req: Request, res: Response) => {
  try {
    const account = (req as any).user?.email;
    const { fileId } = req.params;

    if (!account) return res.status(401).json({ ok: false, error: 'Unauthorized: missing user context' });

    const status = await IntegrationService.getStatus('googledrive', account);
    if (!status.connected) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Google Drive not connected. Please connect first.' 
      });
    }

    const api = await callInteractorApi({
      account,
      connector: 'googledrive-v1',
      action: 'drive.permissions.list',
      data: { fileId }
    });

    if (!api.success) {
      return res.status(502).json({ ok: false, error: api.error || 'Failed to get permissions' });
    }

    return res.json({ ok: true, permissions: api.output });
  } catch (e: any) {
    console.error('[Drive Get Permissions] Error:', e);
    return res.status(500).json({ ok: false, error: e?.message || 'Internal server error' });
  }
});

/**
 * POST /api/drive/files/:fileId/permissions
 * Add permission to a file
 * Body: { role: string, type: string, emailAddress?: string, domain?: string }
 */
router.post('/files/:fileId/permissions', async (req: Request, res: Response) => {
  try {
    const account = (req as any).user?.email;
    const { fileId } = req.params;
    const { role, type, emailAddress, domain, sendNotificationEmail = false } = req.body || {};

    if (!account) return res.status(401).json({ ok: false, error: 'Unauthorized: missing user context' });
    
    if (!role || !type) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Role and type are required' 
      });
    }

    const status = await IntegrationService.getStatus('googledrive', account);
    if (!status.connected) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Google Drive not connected. Please connect first.' 
      });
    }

    const permissionData: any = {
      fileId,
      role,
      type,
      sendNotificationEmail
    };

    if (emailAddress) permissionData.emailAddress = emailAddress;
    if (domain) permissionData.domain = domain;

    const api = await callInteractorApi({
      account,
      connector: 'googledrive-v1',
      action: 'drive.permissions.create',
      data: permissionData
    });

    if (!api.success) {
      return res.status(502).json({ ok: false, error: api.error || 'Failed to create permission' });
    }

    return res.json({ ok: true, permission: api.output });
  } catch (e: any) {
    console.error('[Drive Create Permission] Error:', e);
    return res.status(500).json({ ok: false, error: e?.message || 'Internal server error' });
  }
});

/**
 * GET /api/drive/search
 * Search for files in Google Drive
 * Query: { query: string, pageSize?: number, pageToken?: string }
 */
router.get('/search', async (req: Request, res: Response) => {
  try {
    const account = (req as any).user?.email;
    if (!account) return res.status(401).json({ ok: false, error: 'Unauthorized: missing user context' });

    const status = await IntegrationService.getStatus('googledrive', account);
    if (!status.connected) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Google Drive not connected. Please connect first.' 
      });
    }

    const { 
      query, 
      pageSize = 10, 
      pageToken,
      fields = 'files(id,name,mimeType,parents,modifiedTime,size,webViewLink)'
    } = req.query;

    if (!query) {
      return res.status(400).json({ ok: false, error: 'Search query is required' });
    }

    const api = await callInteractorApi({
      account,
      connector: 'googledrive-v1',
      action: 'drive.files.list',
      data: {
        q: `fullText contains "${query}" or name contains "${query}"`,
        pageSize: Math.min(Number(pageSize), 100),
        pageToken: pageToken || undefined,
        fields: fields
      }
    });

    if (!api.success) {
      return res.status(502).json({ ok: false, error: api.error || 'Failed to search files' });
    }

    return res.json({ ok: true, results: api.output });
  } catch (e: any) {
    console.error('[Drive Search] Error:', e);
    return res.status(500).json({ ok: false, error: e?.message || 'Internal server error' });
  }
});

export default router;