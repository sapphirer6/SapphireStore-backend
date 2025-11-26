const express = require('express');
const { requireAdmin } = require('../adminAuth');

function createAdminRouter({ keysApi } = {}) {
  const router = express.Router();

  router.get('/me', requireAdmin, (req, res) => {
    res.json({ admin: req.admin });
  });

  router.post('/keys/create', requireAdmin, async (req, res) => {
    if (!keysApi) {
      return res.status(500).json({ error: 'Keys API not configured.' });
    }

    const { username, plan, duration_days } = req.body || {};
    if (!username || !plan) {
      return res.status(400).json({ error: 'username and plan required' });
    }

    const now = new Date();
    const days = Number(duration_days) > 0 ? Number(duration_days) : 1;
    const ends = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    try {
      const result = await keysApi.issueKey({
        username,
        plan,
        starts_at: now.toISOString(),
        ends_at: ends.toISOString(),
        payment_id: null,
        order_id: `admin:${username}:${Date.now()}`
      });

      res.json({
        ok: true,
        key: result.key,
        plan: result.plan,
        expires_at: result.expires_at
      });
    } catch (err) {
      console.error('[SapphireStore] /api/admin/keys/create error:', err);
      res.status(500).json({ error: 'Server error.' });
    }
  });

  router.get('/keys/:keyId/info', requireAdmin, async (req, res) => {
    if (!keysApi) {
      return res.status(500).json({ error: 'Keys API not configured.' });
    }

    const { keyId } = req.params;
    if (!keyId) {
      return res.status(400).json({ error: 'keyId required' });
    }

    try {
      const data = await keysApi.getKeyInfo(keyId);
      res.json({ key: data });
    } catch (err) {
      console.error('[SapphireStore] /api/admin/keys/:keyId/info error:', err);
      res.status(500).json({ error: 'Server error.' });
    }
  });

  router.get('/users/:username/security', requireAdmin, async (req, res) => {
    if (!keysApi) {
      return res.status(500).json({ error: 'Keys API not configured.' });
    }

    const { username } = req.params;
    if (!username) {
      return res.status(400).json({ error: 'username required' });
    }

    try {
      const data = await keysApi.getUserSecurityState(username);
      res.json({ user: data });
    } catch (err) {
      console.error('[SapphireStore] /api/admin/users/:username/security error:', err);
      res.status(500).json({ error: 'Server error.' });
    }
  });

  router.get('/users/:username/subscriptions', requireAdmin, async (req, res) => {
    if (!keysApi) {
      return res.status(500).json({ error: 'Keys API not configured.' });
    }

    const { username } = req.params;
    if (!username) {
      return res.status(400).json({ error: 'username required' });
    }

    try {
      const data = await keysApi.getUserSubscriptions(username);
      res.json({ subscriptions: data.subscriptions || [] });
    } catch (err) {
      console.error('[SapphireStore] /api/admin/users/:username/subscriptions error:', err);
      res.status(500).json({ error: 'Server error.' });
    }
  });

  return router;
}

module.exports = { createAdminRouter };
