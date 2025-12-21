const express = require('express');
const bcrypt = require('bcryptjs');
const { createAdminToken, requireUser, COOKIE_NAME } = require('../adminAuth');

function createAuthRouter({ loginDbPool }) {
  const router = express.Router();

  router.post('/signup', async (req, res) => {
    if (!loginDbPool) {
      return res
        .status(500)
        .json({ error: 'Login database not configured on server.' });
    }

    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'Missing username or password.' });
    }

    if (username.length < 3 || password.length < 8) {
      return res
        .status(400)
        .json({ error: 'Username or password too short.' });
    }

    try {
      const client = await loginDbPool.connect();
      try {
        const existing = await client.query(
          'SELECT id FROM login_users WHERE username = $1',
          [username]
        );
        if (existing.rowCount > 0) {
          return res.status(409).json({ error: 'Username already taken.' });
        }

        const passwordHash = await bcrypt.hash(password, 12);
        const insert = await client.query(
          'INSERT INTO login_users (username, password_hash, role) VALUES ($1, $2, $3) RETURNING id, username, role',
          [username, passwordHash, 'user']
        );
        const user = insert.rows[0];

        res.status(201).json({
          id: user.id,
          username: user.username,
          role: user.role
        });
      } finally {
        client.release();
      }
    } catch (err) {
      console.error('[SapphireStore] /api/auth/signup error:', err);
      res.status(500).json({ error: 'Server error.' });
    }
  });

  router.post('/login', async (req, res) => {
    if (!loginDbPool) {
      return res
        .status(500)
        .json({ error: 'Login database not configured on server.' });
    }

    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'Missing username or password.' });
    }

    try {
      const client = await loginDbPool.connect();
      try {
        const result = await client.query(
          'SELECT id, username, password_hash, role FROM login_users WHERE username = $1',
          [username]
        );

        if (result.rowCount === 0) {
          return res.status(401).json({ error: 'Invalid credentials.' });
        }

        const user = result.rows[0];
        const ok = await bcrypt.compare(password, user.password_hash);
        if (!ok) {
          return res.status(401).json({ error: 'Invalid credentials.' });
        }

        await client.query(
          'UPDATE login_users SET last_login_at = NOW() WHERE id = $1',
          [user.id]
        );

        const token = createAdminToken(user);
        const secure = process.env.NODE_ENV === 'production';

        res.cookie(COOKIE_NAME, token, {
          httpOnly: true,
          secure,
          sameSite: 'lax',
          maxAge: 60 * 60 * 1000
        });

        res.json({
          id: user.id,
          username: user.username,
          role: user.role
        });
      } finally {
        client.release();
      }
    } catch (err) {
      console.error('[SapphireStore] /api/auth/login error:', err);
      res.status(500).json({ error: 'Server error.' });
    }
  });

  router.get('/me', requireUser, (req, res) => {
    res.json({
      id: req.user.id,
      username: req.user.username,
      role: req.user.role
    });
  });

  router.post('/logout', requireUser, (req, res) => {
    const secure = process.env.NODE_ENV === 'production';
    res.clearCookie(COOKIE_NAME, {
      httpOnly: true,
      secure,
      sameSite: 'lax'
    });
    res.json({ ok: true });
  });

  return router;
}

module.exports = { createAuthRouter };
