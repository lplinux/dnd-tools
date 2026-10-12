/**
 * test/loginRateLimit.test.js
 *
 * `POST /api/auth/login` had no throttling: bcrypt made each guess slow, but
 * nothing made the hundredth guess harder than the first.
 *
 * The limiter is a few pure functions plus a Map, so as with the stats
 * validator they are lifted out of app.js and actually run — app.js calls
 * `app.listen` at import time and cannot be required. The three things worth
 * pinning are the ones that make a limiter useless or actively harmful when
 * they go wrong: the threshold, the window expiring, and the Map not growing
 * for ever on a long-running process.
 *
 * `now` is a parameter on every one of these functions precisely so this file
 * can test the window without sleeping through it.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appSource = readFileSync(path.join(root, 'app.js'), 'utf8');

/** Lift the limiter out of app.js. Stops short of DUMMY_PASSWORD_HASH, which needs bcrypt. */
function loadLimiter() {
  const start = appSource.indexOf('const LOGIN_MAX_FAILURES');
  expect(start, 'LOGIN_MAX_FAILURES not found').toBeGreaterThan(-1);
  const fnStart = appSource.indexOf('function recordLoginFailure(key, now) {', start);
  expect(fnStart, 'recordLoginFailure not found').toBeGreaterThan(-1);
  const end = appSource.indexOf('\n}\n', fnStart);
  expect(end, 'unterminated recordLoginFailure').toBeGreaterThan(fnStart);
  const src = appSource.slice(start, end + 2);
  return new Function(`${src}
    return { loginFailures, loginKey, loginRetryAfter, recordLoginFailure,
             sweepLoginFailures, LOGIN_MAX_FAILURES, LOGIN_WINDOW_MS, LOGIN_TRACK_CAP };`)();
}

const L = loadLimiter();
const T0 = 1_700_000_000_000;

beforeEach(() => L.loginFailures.clear());

describe('the key', () => {
  it('combines IP and username, case-insensitively', () => {
    // IP alone locks out a household behind one NAT; username alone lets an
    // attacker lock the owner out. Both, or neither is safe.
    expect(L.loginKey({ ip: '10.0.0.5' }, 'Pablo')).toBe('10.0.0.5:pablo');
    expect(L.loginKey({ ip: '10.0.0.5' }, 'PABLO'))
      .toBe(L.loginKey({ ip: '10.0.0.5' }, 'pablo'));
    expect(L.loginKey({ ip: '10.0.0.6' }, 'pablo'))
      .not.toBe(L.loginKey({ ip: '10.0.0.5' }, 'pablo'));
  });

  it('does not throw on a missing username', () => {
    expect(() => L.loginKey({ ip: '10.0.0.5' }, undefined)).not.toThrow();
  });
});

describe('the threshold', () => {
  it('allows exactly LOGIN_MAX_FAILURES attempts, then blocks', () => {
    const k = 'ip:user';
    for (let i = 0; i < L.LOGIN_MAX_FAILURES; i++) {
      expect(L.loginRetryAfter(k, T0), `blocked early at attempt ${i + 1}`).toBe(0);
      L.recordLoginFailure(k, T0);
    }
    expect(L.loginRetryAfter(k, T0)).toBeGreaterThan(0);
  });

  it('reports a Retry-After inside the window, counting down', () => {
    const k = 'ip:user';
    for (let i = 0; i < L.LOGIN_MAX_FAILURES; i++) L.recordLoginFailure(k, T0);

    const atOnce = L.loginRetryAfter(k, T0);
    const later  = L.loginRetryAfter(k, T0 + 60_000);
    expect(atOnce).toBe(L.LOGIN_WINDOW_MS / 1000);
    expect(later).toBe(atOnce - 60);
  });

  it('blocks one key without blocking another', () => {
    for (let i = 0; i < L.LOGIN_MAX_FAILURES; i++) L.recordLoginFailure('ip:a', T0);
    expect(L.loginRetryAfter('ip:a', T0)).toBeGreaterThan(0);
    expect(L.loginRetryAfter('ip:b', T0)).toBe(0);
  });
});

describe('the window', () => {
  it('lets a blocked key through once the window has passed', () => {
    const k = 'ip:user';
    for (let i = 0; i < L.LOGIN_MAX_FAILURES; i++) L.recordLoginFailure(k, T0);
    expect(L.loginRetryAfter(k, T0)).toBeGreaterThan(0);
    expect(L.loginRetryAfter(k, T0 + L.LOGIN_WINDOW_MS)).toBe(0);
  });

  it('is fixed, not sliding — a late failure starts a fresh window', () => {
    const k = 'ip:user';
    L.recordLoginFailure(k, T0);
    L.recordLoginFailure(k, T0 + L.LOGIN_WINDOW_MS + 1);
    expect(L.loginFailures.get(k).count).toBe(1);
  });
});

describe('the Map cannot grow without bound', () => {
  it('sweeps expired entries on write', () => {
    L.recordLoginFailure('ip:old', T0);
    expect(L.loginFailures.size).toBe(1);
    L.recordLoginFailure('ip:new', T0 + L.LOGIN_WINDOW_MS + 1);
    expect(L.loginFailures.has('ip:old')).toBe(false);
    expect(L.loginFailures.size).toBe(1);
  });

  it('holds a hard cap even when every window is still live', () => {
    // The sweep cannot help against a distributed run inside one window, so the
    // cap is the thing standing between this and an OOM on a long-lived process.
    for (let i = 0; i < L.LOGIN_TRACK_CAP + 500; i++) L.recordLoginFailure(`ip${i}:u`, T0);
    expect(L.loginFailures.size).toBeLessThanOrEqual(L.LOGIN_TRACK_CAP);
  });
});

describe('the login route wires it up', () => {
  const handler = (() => {
    const start = appSource.indexOf("app.post('/api/auth/login'");
    expect(start).toBeGreaterThan(-1);
    const end = appSource.indexOf('\n});', start);
    return appSource.slice(start, end)
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  })();

  it('refuses before touching the database', () => {
    expect(handler.indexOf('loginRetryAfter')).toBeLessThan(handler.indexOf('pool.query'));
  });

  it('answers 429 with a Retry-After header', () => {
    expect(handler).toMatch(/res\.set\('Retry-After'/);
    expect(handler).toMatch(/status\(429\)/);
  });

  it('counts a failure and clears on success', () => {
    expect(handler).toMatch(/recordLoginFailure\(key, now\)/);
    expect(handler).toMatch(/loginFailures\.delete\(key\)/);
  });

  it('runs a bcrypt compare even for an unknown username', () => {
    // Identical wording on both failures is not enough if one of them is
    // measurably faster — that is a usable oracle for which names exist.
    expect(handler).toMatch(/DUMMY_PASSWORD_HASH/);
    expect(handler).not.toMatch(/rows\.length === 0/);
  });

  it('is the only route that is throttled', () => {
    const calls = [...appSource.replace(/\/\*[\s\S]*?\*\//g, '')
      .matchAll(/recordLoginFailure\(/g)];
    expect(calls.length).toBe(2);   // the definition, and the one call site
  });
});

describe('the session cookie', () => {
  it('sets sameSite explicitly rather than leaning on the browser default', () => {
    const at  = appSource.indexOf('app.use(session({');
    const cfg = appSource.slice(at, at + 1200);
    expect(cfg).toMatch(/sameSite:\s*'lax'/);
  });
});
