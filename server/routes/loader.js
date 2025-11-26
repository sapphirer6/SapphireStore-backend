const express = require('express');
const { requireAdmin } = require('../adminAuth');

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

  function decodePayload(body) {
    if (body && typeof body.d === 'string') {
      const hex = body.d;
      if (hex.length % 2 !== 0) return null;
      const key = 0xA7;
      const bytes = [];
      for (let i = 0; i < hex.length; i += 2) {
        const byte = parseInt(hex.substr(i, 2), 16);
        if (Number.isNaN(byte)) return null;
        bytes.push(byte ^ key);
      }
      try {
        const json = Buffer.from(bytes).toString('utf8');
        return JSON.parse(json);
      } catch {
        return null;
      }
    }
    return body || null;
  }

  router.post('/loader/prehandshake', async (req, res) => {
    const inner = decodePayload(req.body);
    const { version, hash } = inner || {};
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

  router.post('/loader/heartbeat', async (req, res) => {
    const inner = decodePayload(req.body);
    const { version, hash } = inner || {};
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
