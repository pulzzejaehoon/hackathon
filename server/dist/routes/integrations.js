import { Router } from 'express';
import { IntegrationService } from '../services/IntegrationService.js';
const router = Router();
/**
 * GET /api/integrations
 * Returns list of all available integrations
 */
router.get('/', (req, res) => {
    const integrations = IntegrationService.getAvailableIntegrations();
    return res.json({ ok: true, integrations });
});
/**
 * GET /api/integrations/:id/auth-url
 * Get OAuth URL for specific integration
 */
router.get('/:id/auth-url', async (req, res) => {
    try {
        const { id } = req.params;
        const account = req.user?.email;
        if (!account) {
            return res.status(401).json({ ok: false, error: 'Unauthorized: missing user context' });
        }
        const result = await IntegrationService.getAuthUrl(id, account);
        if (!result.ok) {
            return res.status(400).json(result);
        }
        return res.json(result);
    }
    catch (error) {
        console.error('[Integrations] Auth URL error:', error);
        return res.status(500).json({
            ok: false,
            error: 'Internal server error'
        });
    }
});
/**
 * GET /api/integrations/:id/status
 * Check connection status for specific integration
 */
router.get('/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const account = req.user?.email;
        if (!account) {
            return res.status(401).json({ ok: false, error: 'Unauthorized: missing user context' });
        }
        const result = await IntegrationService.getStatus(id, account);
        return res.json(result);
    }
    catch (error) {
        console.error('[Integrations] Status check error:', error);
        return res.json({ ok: true, connected: false });
    }
});
/**
 * POST /api/integrations/:id/disconnect
 * Disconnect specific integration
 */
router.post('/:id/disconnect', async (req, res) => {
    try {
        const { id } = req.params;
        const account = req.user?.email;
        if (!account) {
            return res.status(401).json({ ok: false, error: 'Unauthorized: missing user context' });
        }
        const result = await IntegrationService.disconnect(id, account);
        if (!result.ok) {
            return res.status(400).json(result);
        }
        return res.json(result);
    }
    catch (error) {
        console.error('[Integrations] Disconnect error:', error);
        return res.status(500).json({
            ok: false,
            error: 'Internal server error'
        });
    }
});
/**
 * GET /api/integrations/status/all
 * Get connection status for all integrations
 */
router.get('/status/all', async (req, res) => {
    try {
        const account = req.user?.email;
        if (!account) {
            return res.status(401).json({ ok: false, error: 'Unauthorized: missing user context' });
        }
        const integrations = IntegrationService.getAvailableIntegrations();
        const statuses = await Promise.all(integrations.map(async (integration) => {
            const status = await IntegrationService.getStatus(integration.id, account);
            return {
                id: integration.id,
                name: integration.name,
                connected: status.connected,
                category: integration.category,
                icon: integration.icon
            };
        }));
        return res.json({ ok: true, statuses });
    }
    catch (error) {
        console.error('[Integrations] Status all error:', error);
        return res.status(500).json({
            ok: false,
            error: 'Internal server error'
        });
    }
});
export default router;
