const express = require('express');
const { requireAdmin } = require('../adminAuth');

function createAdminRouter({ keysApi } = {}) {
  const router = express.Router();

  router.get('/me', requireAdmin, (req, res) => {
    res.json({ admin: req.admin });
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
