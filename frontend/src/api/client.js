/**
 * api/client.js
 *
 * Thin wrapper around `fetch` that:
 *   - Always sends/receives JSON
 *   - Throws a normalised Error with `message` from the server body on non-2xx
 *   - Exposes `get`, `post`, `put`, `patch`, `del` helpers
 *
 * All paths are relative to the origin so they work in both dev (proxied) and
 * production (same server).
 */

const BASE = '/api';

/**
 * Core fetch helper.
 * @param {string} path  - e.g. '/auth/user'
 * @param {RequestInit} options
 * @returns {Promise<any>} Parsed JSON response
 */
async function request(path, options = {}) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });

  // Some endpoints return 204 No Content
  if (res.status === 204) return null;

  let body;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok) {
    const msg = body?.error || `HTTP ${res.status}`;
    throw new Error(msg);
  }

  return body;
}

export const client = {
  /** @param {string} path */
  get:   (path, opts)        => request(path, { method: 'GET', ...opts }),
  /** @param {string} path @param {any} data */
  post:  (path, data, opts)  => request(path, { method: 'POST',  body: JSON.stringify(data), ...opts }),
  put:   (path, data, opts)  => request(path, { method: 'PUT',   body: JSON.stringify(data), ...opts }),
  patch: (path, data, opts)  => request(path, { method: 'PATCH', body: JSON.stringify(data), ...opts }),
  del:   (path, opts)        => request(path, { method: 'DELETE', ...opts }),
};
