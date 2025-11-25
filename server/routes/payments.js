const express = require('express');
const crypto = require('crypto');
const { requireUser } = require('../adminAuth');
const { createPayment, verifyIpnSignature } = require('../nowPaymentsClient');
const { createLoginDbPool } = require('../loginDb');

const loginDbPool = createLoginDbPool();

const PLAN_CONFIG = {
  day: { amount: 5, currency: 'gbp', days: 1 },
  week: { amount: 12, currency: 'gbp', days: 7 },
  month: { amount: 25, currency: 'gbp', days: 30 }
};

function createPaymentsRouter() {
  const router = express.Router();

  router.post('/payments/create', requireUser, async (req, res) => {
    if (!loginDbPool) {
      return res.status(500).json({ error: 'Login database not configured.' });
    }

    const { plan } = req.body || {};
    if (!plan || !PLAN_CONFIG[plan]) {
      return res.status(400).json({ error: 'Invalid plan.' });
    }

    const cfg = PLAN_CONFIG[plan];
    const user = req.user;

    try {
      const orderId = `${user.username}:${plan}:${crypto.randomBytes(8).toString('hex')}`;
      const ipnCallbackUrl =
        process.env.NOWPAYMENTS_IPN_URL ||
        `${process.env.PUBLIC_BACKEND_URL || ''}/api/nowpayments/ipn`;
      const successUrl =
        process.env.FRONTEND_BASE_URL || 'https://sapphire-store-frontend.vercel.app/account';
      const cancelUrl =
        process.env.FRONTEND_BASE_URL || 'https://sapphire-store-frontend.vercel.app/';

      const payment = await createPayment({
        amount: cfg.amount,
        currency: cfg.currency,
        orderId,
        ipnCallbackUrl,
        successUrl,
        cancelUrl
      });

      res.json({
        orderId,
        paymentId: payment.payment_id,
        invoiceUrl: payment.invoice_url || payment.payment_url
      });
    } catch (err) {
      console.error('[SapphireStore] /api/payments/create error:', err);
      res.status(500).json({ error: 'Unable to create payment.' });
    }
  });

  router.get('/account/subscriptions', requireUser, async (req, res) => {
    if (!loginDbPool) {
      return res.status(500).json({ error: 'Login database not configured.' });
    }

    try {
      const client = await loginDbPool.connect();
      try {
        const result = await client.query(
          `SELECT plan, sub_key, status, starts_at, ends_at
           FROM user_subscriptions
           WHERE user_id = $1
           ORDER BY ends_at DESC`,
          [req.user.id]
        );
        res.json({ subscriptions: result.rows });
      } finally {
        client.release();
      }
    } catch (err) {
      console.error('[SapphireStore] /api/account/subscriptions error:', err);
      res.status(500).json({ error: 'Server error.' });
    }
  });

  router.post('/nowpayments/ipn', async (req, res) => {
    const rawBody = req.rawBody || JSON.stringify(req.body || {});
    const signature = req.header('x-nowpayments-sig');

    try {
      if (!verifyIpnSignature(rawBody, signature)) {
        return res.status(400).json({ error: 'Invalid signature.' });
      }
    } catch (err) {
      console.error('[SapphireStore] IPN verification error:', err);
      return res.status(500).json({ error: 'IPN verification error.' });
    }

    const payload = req.body || {};

    const status = (payload.payment_status || '').toLowerCase();
    if (!['finished', 'confirmed', 'completed'].includes(status)) {
      return res.json({ ok: true });
    }

    const orderId = payload.order_id || '';
    const [username, plan] = String(orderId).split(':');
    if (!username || !PLAN_CONFIG[plan]) {
      return res.status(400).json({ error: 'Invalid order_id.' });
    }

    if (!loginDbPool) {
      return res.status(500).json({ error: 'Login database not configured.' });
    }

    try {
      const client = await loginDbPool.connect();
      try {
        const userRes = await client.query(
          'SELECT id FROM login_users WHERE username = $1',
          [username]
        );
        if (userRes.rowCount === 0) {
          return res.status(400).json({ error: 'Unknown user in order_id.' });
        }

        const userId = userRes.rows[0].id;
        const cfg = PLAN_CONFIG[plan];

        const now = new Date();
        const ends = new Date(now.getTime() + cfg.days * 24 * 60 * 60 * 1000);

        const subKey = crypto.randomBytes(16).toString('hex');

        await client.query(
          `INSERT INTO user_subscriptions
           (user_id, plan, sub_key, status, payment_id, order_id, starts_at, ends_at)
           VALUES ($1, $2, $3, 'active', $4, $5, to_timestamp($6 / 1000.0), to_timestamp($7 / 1000.0))`,
          [
            userId,
            plan,
            subKey,
            String(payload.payment_id || ''),
            orderId,
            now.getTime(),
            ends.getTime()
          ]
        );

        res.json({ ok: true });
      } finally {
        client.release();
      }
    } catch (err) {
      console.error('[SapphireStore] /api/nowpayments/ipn error:', err);
      res.status(500).json({ error: 'Server error.' });
    }
  });

  return router;
}

module.exports = { createPaymentsRouter };

  