const fetch = (...args) => import('node-fetch').then(({ default: fetchFn }) => fetchFn(...args));

function createKeysApiClient({ baseUrl, apiKey }) {
  async function request(path, options = {}) {
    const url = `${baseUrl}${path}`;
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
    issueKey: ({ username, plan, starts_at, ends_at, payment_id, order_id }) =>
      request('/internal/keys/issue', {
        body: { username, plan, starts_at, ends_at, payment_id, order_id }
      }),
    getUserSubscriptions: (username) =>
      request('/internal/users/subscriptions', { body: { username } })
  };
}

module.exports = { createKeysApiClient };
