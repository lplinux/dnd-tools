/**
 * api/client.js
 *
 * Thin wrapper around `fetch` that:
 *   - Always sends/receives JSON
 *   - Carries the CSRF token on every mutating request, and replays once if it
 *     has gone stale
 *   - Throws a normalised Error carrying `message`, `status` and `code`
 *   - Exposes `get`, `post`, `put`, `patch`, `del` helpers
 *
 * All paths are relative to the origin so they work in both dev (proxied) and
 * production (same server).
 */

const BASE = '/api';

/** Methods the server does not demand a CSRF token for. Kept in step with CSRF_SAFE_METHODS in app.js. */
const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];

/**
 * The CSRF synchroniser token, mirroring `req.session.csrfToken` on the server.
 *
 * A module variable rather than React state on purpose: it is never rendered,
 * every mutating request needs it, and holding it in a context would make the
 * one file that uses it depend on the provider tree. It seeds itself from any
 * response that carries one — `GET /auth/user` on boot, and `POST /auth/login`,
 * which rotates it — so nothing else in the app has to know it exists.
 */
let csrfToken = null;

/** Shared in-flight token request, so a burst of writes opens only one. */
let tokenInFlight = null;

/**
 * Fetch a token for a session that has not seen one yet.
 *
 * Needed because `AuthProvider` mounts above `App` and its `refresh()` is
 * async: a component can fire a write before the boot `/auth/user` resolves.
 */
function fetchCsrfToken() {
  if (!tokenInFlight) {
    tokenInFlight = (async () => {
      try {
        const res = await fetch(`${BASE}/auth/user`);
        const body = await res.json();
        csrfToken = typeof body?.csrfToken === 'string' ? body.csrfToken : null;
      } catch {
        csrfToken = null;    // let the real request go out and fail honestly
      }
      return csrfToken;
    })().finally(() => { tokenInFlight = null; });
  }
  return tokenInFlight;
}

function send(path, options, token) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['X-CSRF-Token'] = token;
  // `headers` goes last. Spreading `options` after it would let a caller's own
  // headers object replace the merged one wholesale and drop both Content-Type
  // and the token. No caller passes one today; this is what stops the first one
  // that does from silently breaking every write in the app.
  return fetch(`${BASE}${path}`, { ...options, headers });
}

/**
 * Core fetch helper.
 * @param {string} path  - e.g. '/auth/user'
 * @param {RequestInit} options
 * @returns {Promise<any>} Parsed JSON response
 */
async function request(path, options = {}) {
  const method   = (options.method || 'GET').toUpperCase();
  const mutating = !SAFE_METHODS.includes(method);

  if (mutating && !csrfToken) await fetchCsrfToken();

  let res = await send(path, options, mutating ? csrfToken : null);

  // Some endpoints return 204 No Content
  if (res.status === 204) return null;

  let body;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  // A stale token is the expected failure here rather than an exceptional one:
  // sessions live in the server's memory, so every restart invalidates whatever
  // the browser is holding. Refetch once and replay, so a restart mid-session
  // costs a round trip instead of the user's unsaved edit.
  if (mutating && res.status === 403 && body?.code === 'EBADCSRFTOKEN') {
    const fresh = await fetchCsrfToken();
    if (fresh) {
      res = await send(path, options, fresh);
      if (res.status === 204) return null;
      try {
        body = await res.json();
      } catch {
        body = null;
      }
    }
  }

  // Any response carrying a token is the authority on what it now is.
  if (typeof body?.csrfToken === 'string') csrfToken = body.csrfToken;

  // Logout destroys the session, so what we hold is now a token for a session
  // that no longer exists. Drop it rather than spend a guaranteed 403 on the
  // next write discovering that.
  if (res.ok && path === '/auth/logout') csrfToken = null;

  if (!res.ok) {
    const err = new Error(body?.error || `HTTP ${res.status}`);
    // The status used to be discarded, which is why PdfViewer has to string-
    // match '403' out of a message. Callers that need to tell a stale session
    // from a refused permission can read these two instead.
    err.status = res.status;
    err.code   = body?.code;
    throw err;
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

/** Testing seam: drop the cached token so a case can start from a clean slate. */
export const __resetCsrfToken = () => { csrfToken = null; tokenInFlight = null; };
