const express = require('express');
const { requireSupport } = require('../adminAuth');

function createSupportRouter({ loginDbPool, keysApi } = {}) {
  const router = express.Router();

  router.get('/support/me', requireSupport, (req, res) => {
    res.json({ support: req.support });
  });

  router.get('/support/tickets', requireSupport, async (req, res) => {
    if (!loginDbPool) {
      return res
        .status(500)
        .json({ error: 'Login database not configured.' });
    }

    const { status, user, key, reason, severity } = req.query || {};

    const conditions = [];
    const params = [];

    if (status && status !== 'all') {
      params.push(status);
      conditions.push(`t.status = $${params.length}`);
    }

    if (user) {
      params.push(user);
      conditions.push(`u.username = $${params.length}`);
    }

    if (key) {
      params.push(key);
      conditions.push(`t.key_id = $${params.length}`);
    }

    if (reason) {
      params.push(reason);
      conditions.push(`t.reason = $${params.length}`);
    }

    if (severity) {
      params.push(severity);
      conditions.push(`t.priority = $${params.length}`);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `SELECT
                   t.id,
                   t.subject,
                   t.status,
                   t.priority,
                   t.key_id,
                   t.created_at,
                   t.reason,
                   u.username
                 FROM support_tickets t
                 JOIN login_users u ON u.id = t.user_id
                 ${whereClause}
                 ORDER BY t.created_at DESC`;

    try {
      const client = await loginDbPool.connect();
      try {
        const result = await client.query(sql, params);
        res.json({ tickets: result.rows });
      } finally {
        client.release();
      }
    } catch (err) {
      console.error('[SapphireStore] /api/support/tickets error:', err);
      res.status(500).json({ error: 'Server error.' });
    }
  });

  router.get('/support/tickets/:id', requireSupport, async (req, res) => {
    if (!loginDbPool) {
      return res
        .status(500)
        .json({ error: 'Login database not configured.' });
    }

    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'Invalid ticket id.' });
    }

    try {
      const client = await loginDbPool.connect();
      try {
        const ticketRes = await client.query(
          `SELECT
             t.id,
             t.subject,
             t.body,
             t.status,
             t.priority,
             t.key_id,
             t.created_at,
             t.updated_at,
             t.closed_by,
             t.closed_at,
             t.reason,
             u.username
           FROM support_tickets t
           JOIN login_users u ON u.id = t.user_id
           WHERE t.id = $1`,
          [id]
        );

        if (ticketRes.rowCount === 0) {
          return res.status(404).json({ error: 'Ticket not found.' });
        }

        const ticket = ticketRes.rows[0];

        const msgsRes = await client.query(
          `SELECT m.id,
                  m.author_type,
                  m.body,
                  m.created_at,
                  m.author_user_id,
                  u.username AS author_username
           FROM support_ticket_messages m
           JOIN login_users u ON u.id = m.author_user_id
           WHERE m.ticket_id = $1
           ORDER BY m.created_at ASC`,
          [id]
        );

        const messages = msgsRes.rows.map((row) => ({
          id: row.id,
          author_type: row.author_type,
          author_username: row.author_username,
          body: row.body,
          created_at: row.created_at
        }));

        res.json({ ticket, messages });
      } finally {
        client.release();
      }
    } catch (err) {
      console.error('[SapphireStore] /api/support/tickets/:id error:', err);
      res.status(500).json({ error: 'Server error.' });
    }
  });

  router.post(
    '/support/tickets/:id/status',
    requireSupport,
    async (req, res) => {
      if (!loginDbPool) {
        return res
          .status(500)
          .json({ error: 'Login database not configured.' });
      }

      const id = Number(req.params.id);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ error: 'Invalid ticket id.' });
      }

      const { status } = req.body || {};
      const allowed = ['open', 'pending', 'resolved', 'closed'];
      if (!status || !allowed.includes(status)) {
        return res.status(400).json({ error: 'Invalid status.' });
      }

      const nowClosed = status === 'resolved' || status === 'closed';

      try {
        const client = await loginDbPool.connect();
        try {
          const updates = ['status = $1', 'updated_at = CURRENT_TIMESTAMP'];

          if (nowClosed) {
            updates.push('closed_by = $2', 'closed_at = CURRENT_TIMESTAMP');
          } else {
            updates.push('closed_by = NULL', 'closed_at = NULL');
          }

          const sql = `UPDATE support_tickets
                       SET ${updates.join(', ')}
                       WHERE id = $${nowClosed ? 3 : 2}
                       RETURNING id, subject, status, priority, key_id, created_at, reason`;

          const finalParams = nowClosed
            ? [status, req.support.username, id]
            : [status, id];

          const result = await client.query(sql, finalParams);

          if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Ticket not found.' });
          }

          res.json({ ticket: result.rows[0] });
        } finally {
          client.release();
        }
      } catch (err) {
        console.error(
          '[SapphireStore] /api/support/tickets/:id/status error:',
          err
        );
        res.status(500).json({ error: 'Server error.' });
      }
    }
  );

  router.post(
    '/support/tickets/:id/severity',
    requireSupport,
    async (req, res) => {
      if (!loginDbPool) {
        return res
          .status(500)
          .json({ error: 'Login database not configured.' });
      }

      const id = Number(req.params.id);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ error: 'Invalid ticket id.' });
      }

      const { severity } = req.body || {};
      const allowed = ['low', 'normal', 'high', 'critical'];
      if (!severity || !allowed.includes(severity)) {
        return res.status(400).json({ error: 'Invalid severity.' });
      }

      try {
        const client = await loginDbPool.connect();
        try {
          const result = await client.query(
            `UPDATE support_tickets
             SET priority = $1,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $2
             RETURNING id, subject, status, priority, key_id, created_at, reason`,
            [severity, id]
          );

          if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Ticket not found.' });
          }

          res.json({ ticket: result.rows[0] });
        } finally {
          client.release();
        }
      } catch (err) {
        console.error(
          '[SapphireStore] /api/support/tickets/:id/severity error:',
          err
        );
        res.status(500).json({ error: 'Server error.' });
      }
    }
  );

  router.post(
    '/support/tickets/:id/messages',
    requireSupport,
    async (req, res) => {
      if (!loginDbPool) {
        return res
          .status(500)
          .json({ error: 'Login database not configured.' });
      }

      const id = Number(req.params.id);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ error: 'Invalid ticket id.' });
      }

      const { body } = req.body || {};
      if (!body) {
        return res.status(400).json({ error: 'body is required.' });
      }

      try {
        const client = await loginDbPool.connect();
        try {
          const ticketRes = await client.query(
            `SELECT id FROM support_tickets WHERE id = $1`,
            [id]
          );

          if (ticketRes.rowCount === 0) {
            return res.status(404).json({ error: 'Ticket not found.' });
          }

          const insert = await client.query(
            `INSERT INTO support_ticket_messages (ticket_id, author_type, author_user_id, body)
             VALUES ($1, 'support', $2, $3)
             RETURNING id, created_at`,
            [id, req.support.id, body]
          );

          const msg = insert.rows[0];

          res.status(201).json({
            message: {
              id: msg.id,
              author_type: 'support',
              author_username: req.support.username,
              body,
              created_at: msg.created_at
            }
          });
        } finally {
          client.release();
        }
      } catch (err) {
        console.error(
          '[SapphireStore] /api/support/tickets/:id/messages error:',
          err
        );
        res.status(500).json({ error: 'Server error.' });
      }
    }
  );

  router.get('/support/key/:keyId/info', requireSupport, async (req, res) => {
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
      console.error('[SapphireStore] /api/support/key/:keyId/info error:', err);
      res.status(500).json({ error: 'Server error.' });
    }
  });

  return router;
}

module.exports = { createSupportRouter };
