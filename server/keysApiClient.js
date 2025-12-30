const fetch = (...args) => import('node-fetch').then(({ default: fetchFn }) => fetchFn(...args));

function normalizeBaseUrl(baseUrl) {
  let url = baseUrl || '';

  // If the operator passed a bare host (no scheme), default to https://
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }

  // Trim any trailing slash so path joining is consistent
  if (url.endsWith('/')) {
    url = url.slice(0, -1);
  }

  return url;
}

function createKeysApiClient({ baseUrl, apiKey }) {
  const normalizedBase = normalizeBaseUrl(baseUrl);

  async function request(path, options = {}) {
    const url = `${normalizedBase}${path}`;
    const headers = {
      'Content-Type': 'application/json',
      'x-internal-api-key': apiKey,
      ...(options.headers || {})
    };

    const res = await fetch(url, {
      method: options.method || 'POST',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Keys API ${res.status} ${res.statusText}: ${text}`);
    }
    return res.json();
  }

  return {
    getKeyInfo: (keyId) =>
      request('/internal/keys/info', { body: { key_id: keyId } }),
    getUserSecurityState: (username) =>
      request('/internal/users/security', { body: { username } }),
    registerLoaderBuild: ({ version, expected_hash }) =>
      request('/internal/loader/integrity/register', {
        body: { version, expected_hash }
      }),
    validateLoaderIntegrity: ({ version, hash }) =>
      request('/internal/loader/integrity/validate', {
        body: { version, hash }
      }),
    validateLoaderPrehandshakeSecure: ({ d }) =>
      request('/internal/loader/prehandshake-secure', {
        body: { d }
      }),
    validateLoaderHeartbeatSecure: ({ d }) =>
      request('/internal/loader/heartbeat-secure', {
        body: { d }
      }),
    authKey: ({ key_id, hwid, nonce, ip }) =>
      request('/internal/keys/auth', {
        body: { key_id, hwid, nonce, ip }
      }),
    authKeySecure: ({ d, ip }) =>
      request('/internal/keys/auth-secure', {
        body: { d, ip }
      }),
    getPayloadSecure: ({ d }) =>
      request('/internal/loader/payload-secure', {
        body: { d }
      }),
    issueKey: ({ username, plan, starts_at, ends_at, payment_id, order_id }) =>
      request('/internal/keys/issue', {
        body: { username, plan, starts_at, ends_at, payment_id, order_id }
      }),
    getUserSubscriptions: (username) =>
      request('/internal/users/subscriptions', { body: { username } })
  };
}

module.exports = { createKeysApiClient };
