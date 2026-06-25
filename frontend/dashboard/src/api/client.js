/**
 * Thin fetch wrapper. Every call attaches the JWT (if present) and unwraps
 * the backend's consistent { ...data } / { error } JSON envelope into
 * either a resolved value or a thrown Error with `.status` set, so pages
 * can just `try { await api.x() } catch (err) { setError(err.message) }`.
 */
const BASE_URL = import.meta.env.VITE_API_URL || '';

function getToken() {
  return localStorage.getItem('token');
}

export function setToken(token) {
  if (token) localStorage.setItem('token', token);
  else localStorage.removeItem('token');
}

async function request(path, { method = 'GET', body, params } = {}) {
  let url = BASE_URL + path;
  if (params) {
    const usp = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') usp.set(k, v);
    });
    const qs = usp.toString();
    if (qs) url += `?${qs}`;
  }

  const token = getToken();
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    const message = err?.message === 'Failed to fetch'
      ? 'Could not reach the automation backend. Check that the backend is running and the dashboard proxy/API URL is configured.'
      : `Network request failed: ${err.message}`;
    const wrapped = new Error(message);
    wrapped.status = 0;
    throw wrapped;
  }

  let data = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const message = (data && data.error) || `Request failed with status ${res.status}`;
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  auth: {
    login: (email, password) => request('/api/auth/login', { method: 'POST', body: { email, password } }),
    logout: () => request('/api/auth/logout', { method: 'POST' }),
    me: () => request('/api/auth/me'),
  },
  integrations: {
    list: () => request('/api/integrations'),
    create: (payload) => request('/api/integrations', { method: 'POST', body: payload }),
    get: (id) => request(`/api/integrations/${id}`),
    update: (id, payload) => request(`/api/integrations/${id}`, { method: 'PATCH', body: payload }),
    definition: (id) => request(`/api/integrations/${id}/definition`),
    credentials: {
      list: (id) => request(`/api/integrations/${id}/credentials`),
      save: (id, values) => request(`/api/integrations/${id}/credentials`, { method: 'POST', body: { values } }),
    },
    webhookSettings: (id, payload) => request(`/api/integrations/${id}/webhook-settings`, { method: 'POST', body: payload }),
    scheduleSettings: (id, payload) => request(`/api/integrations/${id}/schedule-settings`, { method: 'POST', body: payload }),
  },
  executions: {
    listForIntegration: (id) => request(`/api/integrations/${id}/executions`),
    get: (executionId) => request(`/api/executions/${executionId}`),
    run: (id, payload) => request(`/api/integrations/${id}/run`, { method: 'POST', body: payload }),
    replay: (executionId, payload) => request(`/api/executions/${executionId}/replay`, { method: 'POST', body: payload }),
  },
  test: {
    test: (id, payload) => request(`/api/integrations/${id}/test`, { method: 'POST', body: payload }),
    dryRun: (id, payload) => request(`/api/integrations/${id}/dry-run`, { method: 'POST', body: payload }),
    testConnector: (id, connector, credentials) =>
      request(`/api/integrations/${id}/test-connector`, { method: 'POST', body: { connector, credentials } }),
  },
  logs: {
    forIntegration: (id, params) => request(`/api/integrations/${id}/logs`, { params }),
    forExecution: (executionId) => request(`/api/executions/${executionId}/logs`),
  },
  admin: {
    users: {
      list: () => request('/api/admin/users'),
      create: (payload) => request('/api/admin/users', { method: 'POST', body: payload }),
      get: (id) => request(`/api/admin/users/${id}`),
      update: (id, payload) => request(`/api/admin/users/${id}`, { method: 'PATCH', body: payload }),
    },
  },
};
