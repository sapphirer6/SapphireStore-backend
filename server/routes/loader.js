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
    if (!body || typeof body.d !== 'string')
      return null;

    const hex = body.d;
    if (hex.length < 4 || hex.length % 2 !== 0)
      return null;

    const sessionKey = parseInt(hex.substr(0, 2), 16);
    if (Number.isNaN(sessionKey))
      return null;

    const bytes = [];
    for (let i = 2; i < hex.length; i += 2) {
      const byte = parseInt(hex.substr(i, 2), 16);
      if (Number.isNaN(byte))
        return null;
      bytes.push(byte ^ sessionKey);
    }

    const buf = Buffer.from(bytes);
    if (buf.length < 1 + 8)
      return null;

    const versionLen = buf[0];
    if (buf.length < 1 + versionLen + 8)
      return null;

    const version = buf.slice(1, 1 + versionLen).toString('utf8');
    const hashBytes = buf.slice(1 + versionLen, 1 + versionLen + 8);

    let hash = 0n;
    for (let i = 0; i < hashBytes.length; ++i) {
      hash = (hash << 8n) | BigInt(hashBytes[i]);
    }
    const hashStr = '0x' + hash.toString(16).padStart(16, '0').toUpperCase();

    return { version, hash: hashStr };
  }

  router.post('/loader/prehandshake', async (req, res) => {
    if (!req.body || typeof req.body.d !== 'string') {
      return res.status(400).json({ error: 'invalid payload' });
    }

    const d = req.body.d;

    try {
      const result = await keysApi.validateLoaderPrehandshakeSecure({ d });
      const ok = !!result && result.integrity_ok === true;
      res.type('text/plain').send(ok ? '1' : '0');
    } catch (err) {
      console.error('[SapphireStore] /api/loader/prehandshake error:', err);
      res.status(500).json({ error: 'Server error.' });
    }
  });

  router.post('/loader/heartbeat', async (req, res) => {
    if (!req.body || typeof req.body.d !== 'string') {
      return res.status(400).json({ error: 'invalid payload' });
    }

    const d = req.body.d;

    try {
      const result = await keysApi.validateLoaderHeartbeatSecure({ d });
      const ok = !!result && result.integrity_ok === true;
      res.type('text/plain').send(ok ? '1' : '0');
    } catch (err) {
      console.error('[SapphireStore] /api/loader/heartbeat error:', err);
      res.status(500).json({ error: 'Server error.' });
    }
  });

  router.post('/loader/auth', async (req, res) => {
    if (!req.body || typeof req.body.d !== 'string') {
      return res.status(400).json({ error: 'invalid payload' });
    }

    const d = req.body.d;

    const ipHeader = req.headers['x-forwarded-for'];
    const clientIp = Array.isArray(ipHeader)
      ? ipHeader[0]
      : (ipHeader || '').split(',')[0].trim() || req.ip;

    try {
      const result = await keysApi.authKeySecure({ d, ip: clientIp });
      const ok = !!result && result.auth_ok === true;

      if (!ok) {
        res.type('text/plain').send('0');
        return;
      }

      let friendly = 'Active subscription';
      if (result.subscription_expires_at) {
        const ends = new Date(result.subscription_expires_at);
        const now = new Date();
        const diffMs = ends.getTime() - now.getTime();
        if (diffMs <= 0) {
          friendly = 'Expired';
        } else {
          const days = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
          friendly = days === 1 ? '1 day left' : `${days} days left`;
        }
      }

      const plan = result.plan || '';
      const payload = `1|${plan}|${friendly}`;
      res.type('text/plain').send(payload);
    } catch (err) {
      console.error('[SapphireStore] /api/loader/auth error:', err);
      res.status(500).json({ error: 'Server error.' });
    }
  });

  return router;
}

module.exports = { createLoaderRouter };
