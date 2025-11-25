const crypto = require('crypto');

const fetch = (...args) => import('node-fetch').then(({ default: fetchFn }) => fetchFn(...args));

const API_BASE = 'https://api.nowpayments.io/v1';

function getApiKey() {
  const key = process.env.NOWPAYMENTS_API_KEY;
  if (!key) {
    throw new Error('NOWPAYMENTS_API_KEY not set');
  }
  return key;
}

async function createPayment({ amount, currency, ipnCallbackUrl, orderId, successUrl, cancelUrl }) {
  const apiKey = getApiKey();

  const res = await fetch(`${API_BASE}/payment`, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({
      price_amount: amount,
      price_currency: currency,
      order_id: orderId,
      ipn_callback_url: ipnCallbackUrl,
      success_url: successUrl,
      cancel_url: cancelUrl
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`NOWPayments payment error ${res.status}: ${text}`);
  }

  return res.json();
}

function verifyIpnSignature(rawBody, signatureHeader) {
  const secret = process.env.NOWPAYMENTS_IPN_SECRET;
  if (!secret) {
    throw new Error('NOWPAYMENTS_IPN_SECRET not set');
  }

  if (!signatureHeader) return false;

  const hmac = crypto.createHmac('sha512', secret);
  hmac.update(rawBody, 'utf8');
  const expected = hmac.digest('hex');

  return expected.toLowerCase() === String(signatureHeader).toLowerCase();
}

module.exports = {
  createPayment,
  verifyIpnSignature
};

