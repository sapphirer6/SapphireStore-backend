const express = require('express');
const { requireAdmin, requireUser } = require('../adminAuth');

function createLoaderRouter({ keysApi }) {
  const router = express.Router();

  router.post('/admin/loader-build/register', requireAdmin, async (req, res) => {
    const { version, expected_hash } = req.body || {};
    if (!version || !expected_hash) {
      return res.status(400).json({ error: 'version and expected_hash required' });
    }

    try {
      await keysApi.registerLoaderBuild({ version, expected_hash });
      res.json({ ok: true });
    } catch (err) {
      console.error('[SapphireStore] /api/admin/loader-build/register error:', err);
      res.status(500).json({ error: 'Server error.' });
    }
  });

  router.post('/loader/prehandshake', requireUser, async (req, res) => {
    const { version, hash } = req.body || {};
    if (!version || !hash) {
      return res.status(400).json({ error: 'version and hash required' });
    }

    try {
      const result = await keysApi.validateLoaderIntegrity({ version, hash });
      res.json(result);
    } catch (err) {
      console.error('[SapphireStore] /api/loader/prehandshake error:', err);
      res.status(500).json({ error: 'Server error.' });
    }
  });

  router.post('/loader/heartbeat', requireUser, async (req, res) => {
    const { version, hash } = req.body || {};
    if (!version || !hash) {
      return res.status(400).json({ error: 'version and hash required' });
    }

    try {
      const result = await keysApi.validateLoaderIntegrity({ version, hash });
      res.json(result);
    } catch (err) {
      console.error('[SapphireStore] /api/loader/heartbeat error:', err);
      res.status(500).json({ error: 'Server error.' });
    }
  });

  return router;
}

module.exports = { createLoaderRouter };

