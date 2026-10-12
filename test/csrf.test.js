/**
 * test/csrf.test.js
 *
 * A synchroniser token guards all 82 mutating routes. Two failure modes matter
 * and they point in opposite directions: too loose and it protects nothing;
 * too tight and nobody can save anything. Both are easy to introduce without
 * noticing, because the middleware is twelve lines that run on every request.
 *
 * The middleware is lifted out of app.js and run against hand-made req/res
 * objects — app.js calls `app.listen` at import time, so a fake `app` captures
 * the handler `app.use` would have registered.
 *
 * What this file cannot prove is ordering inside the real Express stack, so
 * that part is asserted against the source text, and the live curl run in the
 * verification notes is what actually confirms a forged request is refused.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import crypto from 'crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appSource = readFileSync(path.join(root, 'app.js'), 'utf8');

function loadCsrf() {
  const start = appSource.indexOf('const CSRF_SAFE_METHODS');
  expect(start, 'CSRF_SAFE_METHODS not found').toBeGreaterThan(-1);
  const useAt = appSource.indexOf('app.use((req, res, next) => {', start);
  expect(useAt, 'csrf middleware not found').toBeGreaterThan(-1);
  const end = appSource.indexOf('\n});', useAt);
  expect(end, 'unterminated csrf middleware').toBeGreaterThan(useAt);
  const src = appSource.slice(start, end + 4);

  let middleware;
  const app = { use: (fn) => { middleware = fn; } };
  const out = new Function('crypto', 'app', `${src}\nreturn { csrfToken, CSRF_SAFE_METHODS };`)(crypto, app);
  return { ...out, middleware };
}

const { csrfToken, middleware } = loadCsrf();

/** A request/response pair recording what the middleware did to it. */
function exchange(method, { token, header } = {}) {
  const req = {
    method,
    session: token === undefined ? {} : { csrfToken: token },
    get: (name) => (name === 'X-CSRF-Token' ? header : undefined),
  };
  const result = { passed: false, status: null, body: null };
  const res = {
    status(code) { result.status = code; return this; },
    json(payload) { result.body = payload; return this; },
  };
  middleware(req, res, () => { result.passed = true; });
  return result;
}

const GOOD = 'f'.repeat(64);

describe('minting', () => {
  it('issues a long random hex token and keeps it on the session', () => {
    const req = { session: {} };
    const first = csrfToken(req);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(req.session.csrfToken).toBe(first);
    expect(csrfToken(req)).toBe(first);           // stable within a session
  });

  it('issues a different token to a different session', () => {
    expect(csrfToken({ session: {} })).not.toBe(csrfToken({ session: {} }));
  });
});

describe('safe methods pass untouched', () => {
  for (const method of ['GET', 'HEAD', 'OPTIONS']) {
    it(`${method} needs no token`, () => {
      expect(exchange(method).passed).toBe(true);
    });
  }
});

describe('mutating methods are guarded', () => {
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    it(`${method} passes with the right token`, () => {
      expect(exchange(method, { token: GOOD, header: GOOD }).passed).toBe(true);
    });

    it(`${method} is refused without a header`, () => {
      const r = exchange(method, { token: GOOD });
      expect(r.passed).toBe(false);
      expect(r.status).toBe(403);
      expect(r.body.code).toBe('EBADCSRFTOKEN');
    });
  }

  it('refuses a token of the right length but the wrong value', () => {
    const r = exchange('POST', { token: GOOD, header: 'e'.repeat(64) });
    expect(r.passed).toBe(false);
    expect(r.status).toBe(403);
  });

  it('refuses a token of the wrong length without throwing', () => {
    // timingSafeEqual throws on a length mismatch, which would surface as a
    // 500 and, worse, bypass the handler's own error shape.
    expect(() => exchange('POST', { token: GOOD, header: 'short' })).not.toThrow();
    expect(exchange('POST', { token: GOOD, header: 'short' }).status).toBe(403);
  });

  it('refuses when the session has no token at all', () => {
    expect(exchange('POST', { header: GOOD }).status).toBe(403);
    expect(exchange('POST', { header: GOOD }).passed).toBe(false);
  });

  it('refuses a non-string header', () => {
    const req = { method: 'POST', session: { csrfToken: GOOD }, get: () => ({ length: 64 }) };
    let passed = false, status = null;
    const res = { status(c) { status = c; return this; }, json() { return this; } };
    expect(() => middleware(req, res, () => { passed = true; })).not.toThrow();
    expect(passed).toBe(false);
    expect(status).toBe(403);
  });
});

describe('where it sits in the stack', () => {
  const sessionAt = appSource.indexOf('app.use(session({');
  const csrfAt    = appSource.indexOf('const CSRF_SAFE_METHODS');
  const firstRoute = Math.min(
    ...['app.get(', 'app.post(', 'app.put(', 'app.patch(', 'app.delete(']
      .map(s => appSource.indexOf(s, sessionAt))
      .filter(i => i > -1),
  );

  it('runs after the session middleware, since it reads req.session', () => {
    expect(csrfAt).toBeGreaterThan(sessionAt);
  });

  it('runs before the first route, so nothing can slip in front of it', () => {
    expect(csrfAt).toBeLessThan(firstRoute);
  });
});

describe('no route is exempt', () => {
  const code = appSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

  it('has exactly one csrf guard and no second, looser one', () => {
    expect([...code.matchAll(/EBADCSRFTOKEN/g)].length).toBe(1);
  });

  it('carves out nothing by path — login and logout are covered too', () => {
    // Bounded by the middleware's own closing `});` — the section banner is a
    // comment, and comments are stripped above.
    const from  = code.indexOf('const CSRF_SAFE_METHODS');
    const block = code.slice(from, code.indexOf('\n});', code.indexOf('app.use((req, res, next)', from)));
    expect(block).not.toMatch(/req\.path|req\.url|originalUrl|startsWith|auth\/login/);
  });

  it('guards by method only, and only exempts the three read verbs', () => {
    expect(code).toMatch(/CSRF_SAFE_METHODS = \['GET', 'HEAD', 'OPTIONS'\]/);
  });
});

describe('the token reaches the client', () => {
  it('rides on GET /api/auth/user, logged in or out', () => {
    const start = appSource.indexOf("app.get('/api/auth/user'");
    const handler = appSource.slice(start, appSource.indexOf('\n});', start));
    expect([...handler.matchAll(/csrfToken/g)].length).toBeGreaterThanOrEqual(3);
    expect(handler).toMatch(/user: null, csrfToken/);
  });

  it('is rotated and returned on login', () => {
    const start = appSource.indexOf("app.post('/api/auth/login'");
    const handler = appSource.slice(start, appSource.indexOf('\n});', start));
    expect(handler).toMatch(/delete req\.session\.csrfToken/);
    expect(handler).toMatch(/csrfToken: csrfToken\(req\)/);
    // The rotation must come after the password check, or an attacker could
    // mint a fresh token with a wrong password.
    expect(handler.indexOf('delete req.session.csrfToken'))
      .toBeGreaterThan(handler.indexOf('bcrypt.compare'));
  });
});

describe('the frontend agrees with the server', () => {
  const clientSource = readFileSync(path.join(root, 'frontend/src/api/client.js'), 'utf8');

  it('exempts the same three methods', () => {
    expect(clientSource).toMatch(/SAFE_METHODS = \['GET', 'HEAD', 'OPTIONS'\]/);
  });

  it('sends the header name the server reads', () => {
    const name = appSource.match(/req\.get\('([^']+)'\)/)[1];
    expect(clientSource).toContain(`headers['${name}']`);
  });

  it('keys its retry on the code the server sends', () => {
    expect(clientSource).toContain('EBADCSRFTOKEN');
  });
});
