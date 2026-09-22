/**
 * Thin fetch wrapper around the IncidentIQ backend.
 *
 * Every response from the backend uses the envelope
 *   success: { success: true, data, count?, message? }
 *   failure: { success: false, error: { code, message, field? } }
 *
 * This module unwraps `data` on success and throws an ApiError carrying the
 * HTTP status plus the backend's code/message/field on failure, so callers
 * never have to inspect the envelope themselves.
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'UNKNOWN', field = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.field = field;
  }
}

/** Read the demo session written by AuthContext. */
export function getSession() {
  try {
    return JSON.parse(localStorage.getItem('session') || 'null');
  } catch {
    return null;
  }
}

export function setSession(session) {
  if (session) localStorage.setItem('session', JSON.stringify(session));
  else localStorage.removeItem('session');
}

async function request(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  const session = getSession();
  if (session?.username) headers['x-demo-user'] = session.username;

  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    // fetch only rejects on a genuine network/transport failure
    throw new ApiError(
      'Could not reach the server. Check that the backend is running on port 3001.',
      { status: 0, code: 'NETWORK_ERROR' }
    );
  }

  const payload = await res.json().catch(() => null);

  if (!res.ok) {
    const err = payload?.error || {};
    throw new ApiError(err.message || `Request failed with status ${res.status}.`, {
      status: res.status,
      code: err.code || 'UNKNOWN',
      field: err.field || null,
    });
  }

  return payload?.data;
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  put: (path, body) => request('PUT', path, body),
  del: (path) => request('DELETE', path),
};

/** Build a query string from a filter object, skipping empty values. */
export function toQuery(params) {
  const qs = new URLSearchParams();
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') qs.append(k, v);
  });
  const s = qs.toString();
  return s ? `?${s}` : '';
}
