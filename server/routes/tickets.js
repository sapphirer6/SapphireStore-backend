const express = require('express');
const { requireUser } = require('../adminAuth');

function createTicketsRouter({ loginDbPool } = {}) {
  const router = express.Router();

  function computeSupportAlias(ticketId, authorUserId) {
    const a = Number(ticketId) || 0;
    const b = Number(authorUserId) || 0;
    const code = ((a * 131) ^ (b * 91)) >>> 0;
    const short = String(code % 10000).padStart(4, '0');
    return `Support-${short}`;
  }

  router.post('/tickets', requireUser, async (req, res) => {
    if (!loginDbPool) {
      return res
        .status(500)
        .json({ error: 'Login database not configured.' });
    }

    const { subject, body, key_id, reason } = req.body || {};
    if (!subject || !body) {
      return res
        .status(400)
        .json({ error: 'subject and body are required.' });
    }

    try {
      const client = await loginDbPool.connect();
      try {
        const insert = await client.query(
          `INSERT INTO support_tickets (user_id, subject, body, status, priority, key_id, reason)
           VALUES ($1, $2, $3, 'open', 'normal', $4, $5)
           RETURNING id, status`,
          [req.user.id, subject, body, key_id || null, reason || null]
        );

        const ticket = insert.rows[0];

        try {
          await client.query(
            `INSERT INTO support_ticket_messages (ticket_id, author_type, author_user_id, body)
             VALUES ($1, 'user', $2, $3)`,
            [ticket.id, req.user.id, body]
          );
        } catch (msgErr) {
          console.error(
            '[SapphireStore] /api/tickets initial message insert error:',
            msgErr
          );
        }

        res.status(201).json({ id: ticket.id, status: ticket.status });
      } finally {
        client.release();
      }
    } catch (err) {
      console.error('[SapphireStore] /api/tickets create error:', err);
      res.status(500).json({ error: 'Server error.' });
    }
  });

  router.get('/tickets/my', requireUser, async (req, res) => {
    if (!loginDbPool) {
      return res
        .status(500)
        .json({ error: 'Login database not configured.' });
    }

    try {
      const client = await loginDbPool.connect();
      try {
        const result = await client.query(
          `SELECT id, subject, status, priority, key_id, created_at, reason
           FROM support_tickets
           WHERE user_id = $1
           ORDER BY created_at DESC`,
          [req.user.id]
        );

        res.json({ tickets: result.rows });
      } finally {
        client.release();
      }
    } catch (err) {
      console.error('[SapphireStore] /api/tickets/my error:', err);
      res.status(500).json({ error: 'Server error.' });
    }
  });

  router.get('/tickets/:id', requireUser, async (req, res) => {
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
          `SELECT id, subject, body, status, priority, key_id,
                  created_at, updated_at, closed_by, closed_at, reason
           FROM support_tickets
           WHERE id = $1 AND user_id = $2`,
          [id, req.user.id]
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

        const messages = msgsRes.rows.map((row) => {
          let author = row.author_username;
          if (row.author_type === 'support') {
            author = computeSupportAlias(ticket.id, row.author_user_id);
          }
          return {
            id: row.id,
            author_type: row.author_type,
            author,
            body: row.body,
            created_at: row.created_at
          };
        });

        res.json({ ticket, messages });
      } finally {
        client.release();
      }
    } catch (err) {
      console.error('[SapphireStore] /api/tickets/:id error:', err);
      res.status(500).json({ error: 'Server error.' });
    }
  });

  router.post('/tickets/:id/messages', requireUser, async (req, res) => {
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
          `SELECT id FROM support_tickets
           WHERE id = $1 AND user_id = $2`,
          [id, req.user.id]
        );

        if (ticketRes.rowCount === 0) {
          return res.status(404).json({ error: 'Ticket not found.' });
        }

        const insert = await client.query(
          `INSERT INTO support_ticket_messages (ticket_id, author_type, author_user_id, body)
           VALUES ($1, 'user', $2, $3)
           RETURNING id, created_at`,
          [id, req.user.id, body]
        );

        const msg = insert.rows[0];

        res.status(201).json({
          message: {
            id: msg.id,
            author_type: 'user',
            author: req.user.username,
            body,
            created_at: msg.created_at
          }
        });
      } finally {
        client.release();
      }
    } catch (err) {
      console.error('[SapphireStore] /api/tickets/:id/messages error:', err);
      res.status(500).json({ error: 'Server error.' });
    }
  });

  return router;
}

module.exports = { createTicketsRouter };
