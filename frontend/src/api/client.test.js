/**
 * api/client.test.js
 *
 * Every mutating request in the app — 81 call sites across 10 modules — goes
 * through the single `fetch` in client.js, so this one file is the whole of the
 * frontend's CSRF story. If it attaches the header wrongly, nothing in the app
 * can save; if it retries wrongly, a server restart silently eats whatever the
 * user was editing.
 *
 * Unlike the backend suites, this runs the real thing: `fetch` is stubbed and
 * the actual exported client is exercised against it.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { client, __resetCsrfToken } from './client';

/** A minimal stand-in for Response — client.js only reads status, ok and json(). */
const reply = (status, body) => ({
  status,
  ok: status >= 200 && status < 300,
  json: async () => body,
});

const TOKEN  = 'a'.repeat(64);
const TOKEN2 = 'b'.repeat(64);

/** The arguments of the nth fetch call, as [url, init]. */
const callN = (n) => globalThis.fetch.mock.calls[n];
const headerN = (n) => callN(n)[1].headers['X-CSRF-Token'];

beforeEach(() => {
  __resetCsrfToken();
  globalThis.fetch = vi.fn();
});

describe('safe methods', () => {
  it('sends no token and fetches none', async () => {
    globalThis.fetch.mockResolvedValueOnce(reply(200, { user: null }));
    await client.get('/campaigns');

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(callN(0)[0]).toBe('/api/campaigns');
    expect(headerN(0)).toBeUndefined();
  });
});

describe('mutating methods', () => {
  it('fetches a token before the first write, then attaches it', async () => {
    globalThis.fetch
      .mockResolvedValueOnce(reply(200, { user: null, csrfToken: TOKEN }))   // the lazy /auth/user
      .mockResolvedValueOnce(reply(200, { id: 1 }));                          // the write

    await client.post('/campaigns', { name: 'Leruhy' });

    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(callN(0)[0]).toBe('/api/auth/user');
    expect(callN(1)[1].method).toBe('POST');
    expect(headerN(1)).toBe(TOKEN);
  });

  it('reuses the token on later writes instead of refetching', async () => {
    globalThis.fetch
      .mockResolvedValueOnce(reply(200, { user: null, csrfToken: TOKEN }))
      .mockResolvedValue(reply(200, {}));

    await client.post('/a', {});
    await client.put('/b', {});
    await client.patch('/c', {});
    await client.del('/d');

    expect(globalThis.fetch).toHaveBeenCalledTimes(5);        // one token + four writes
    for (const n of [1, 2, 3, 4]) expect(headerN(n)).toBe(TOKEN);
  });

  it('opens only one token request for a burst of concurrent writes', async () => {
    let release;
    globalThis.fetch.mockImplementationOnce(() => new Promise(r => { release = r; }));
    globalThis.fetch.mockResolvedValue(reply(200, {}));

    const writes = Promise.all([client.post('/a', {}), client.post('/b', {}), client.post('/c', {})]);
    release(reply(200, { user: null, csrfToken: TOKEN }));
    await writes;

    const tokenCalls = globalThis.fetch.mock.calls.filter(([url]) => url === '/api/auth/user');
    expect(tokenCalls.length).toBe(1);
  });

  it('adopts a rotated token from a response body', async () => {
    // The server rotates on login, so the response is the authority.
    globalThis.fetch
      .mockResolvedValueOnce(reply(200, { user: null, csrfToken: TOKEN }))
      .mockResolvedValueOnce(reply(200, { success: true, csrfToken: TOKEN2 }))
      .mockResolvedValueOnce(reply(200, {}));

    await client.post('/auth/login', { username: 'p', password: 'x' });
    await client.post('/campaigns', {});

    expect(headerN(1)).toBe(TOKEN);      // login used the pre-login token
    expect(headerN(2)).toBe(TOKEN2);     // the next write uses the rotated one
  });
});

describe('a stale token', () => {
  it('is refetched and the request replayed once', async () => {
    globalThis.fetch
      .mockResolvedValueOnce(reply(200, { user: null, csrfToken: TOKEN }))
      .mockResolvedValueOnce(reply(403, { error: 'Invalid CSRF token', code: 'EBADCSRFTOKEN' }))
      .mockResolvedValueOnce(reply(200, { user: null, csrfToken: TOKEN2 }))
      .mockResolvedValueOnce(reply(200, { saved: true }));

    const out = await client.put('/pc/1/stats', { char_name: 'Nerida' });

    expect(out).toEqual({ saved: true });
    expect(headerN(1)).toBe(TOKEN);      // the attempt that failed
    expect(headerN(3)).toBe(TOKEN2);     // the replay
  });

  it('gives up after one replay rather than looping', async () => {
    const bad = () => reply(403, { error: 'Invalid CSRF token', code: 'EBADCSRFTOKEN' });
    globalThis.fetch
      .mockResolvedValueOnce(reply(200, { csrfToken: TOKEN }))
      .mockResolvedValueOnce(bad())
      .mockResolvedValueOnce(reply(200, { csrfToken: TOKEN2 }))
      .mockResolvedValueOnce(bad());

    await expect(client.post('/campaigns', {})).rejects.toThrow('Invalid CSRF token');
    expect(globalThis.fetch).toHaveBeenCalledTimes(4);
  });

  it('does not replay an ordinary permission failure', async () => {
    // A 403 from canAccessPC is a real answer; replaying it would just ask twice.
    globalThis.fetch
      .mockResolvedValueOnce(reply(200, { csrfToken: TOKEN }))
      .mockResolvedValueOnce(reply(403, { error: 'Access denied' }));

    await expect(client.del('/campaigns/9')).rejects.toThrow('Access denied');
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });
});

describe('errors carry the status', () => {
  it('attaches status and code alongside the message', async () => {
    globalThis.fetch.mockResolvedValueOnce(reply(404, { error: 'Not found' }));

    const err = await client.get('/campaigns/9').catch(e => e);
    expect(err.message).toBe('Not found');
    expect(err.status).toBe(404);
  });

  it('falls back to HTTP n when the body has no error string', async () => {
    globalThis.fetch.mockResolvedValueOnce(reply(500, null));

    const err = await client.get('/x').catch(e => e);
    expect(err.message).toBe('HTTP 500');
    expect(err.status).toBe(500);
  });
});

describe('header merging', () => {
  it('keeps Content-Type and the token when a caller passes its own headers', async () => {
    // Spreading options after headers used to clobber the merged object. No
    // caller does this today; adding the token is what makes it dangerous.
    globalThis.fetch
      .mockResolvedValueOnce(reply(200, { csrfToken: TOKEN }))
      .mockResolvedValueOnce(reply(200, {}));

    await client.post('/x', {}, { headers: { 'X-Custom': '1' } });

    const sent = callN(1)[1].headers;
    expect(sent['Content-Type']).toBe('application/json');
    expect(sent['X-CSRF-Token']).toBe(TOKEN);
    expect(sent['X-Custom']).toBe('1');
  });
});

describe('logout', () => {
  it('drops the token, since the session it belonged to is gone', async () => {
    globalThis.fetch
      .mockResolvedValueOnce(reply(200, { csrfToken: TOKEN }))
      .mockResolvedValueOnce(reply(200, { success: true }))                 // logout
      .mockResolvedValueOnce(reply(200, { user: null, csrfToken: TOKEN2 })) // refetch
      .mockResolvedValueOnce(reply(200, {}));

    await client.post('/auth/logout');
    await client.post('/auth/login', { username: 'p', password: 'x' });

    expect(callN(2)[0]).toBe('/api/auth/user');
    expect(headerN(3)).toBe(TOKEN2);
  });
});

describe('204 No Content', () => {
  it('still returns null', async () => {
    globalThis.fetch
      .mockResolvedValueOnce(reply(200, { csrfToken: TOKEN }))
      .mockResolvedValueOnce({ status: 204, ok: true, json: async () => { throw new Error('no body'); } });

    await expect(client.del('/campaigns/1')).resolves.toBeNull();
  });
});
