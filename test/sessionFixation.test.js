/**
 * test/sessionFixation.test.js
 *
 * Logging in must issue a NEW session id, not adopt an identity onto the one
 * the visitor arrived with.
 *
 * `saveUninitialized: true` hands every anonymous visitor a session cookie —
 * that is what lets a CSRF token exist on the login form. The cost is that a
 * planted cookie is a real thing: anyone who can set one on this origin can
 * wait for the victim to log in and then hold a cookie that is authenticated
 * as them. `req.session.regenerate()` is the whole defence, and the ORDER
 * matters as much as its presence.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(path.join(root, 'app.js'), 'utf8');

const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const login = strip(source.slice(
  source.indexOf("app.post('/api/auth/login'"),
  source.indexOf("app.post('/api/auth/logout'"),
));

describe('login regenerates the session', () => {
  it('calls regenerate at all', () => {
    expect(login).toMatch(/req\.session\.regenerate\(/);
  });

  it('awaits it, so the writes below cannot land on the old session', () => {
    // A bare regenerate(cb) with the assignments after it would write to a
    // session that is about to be replaced, and the login would appear to
    // succeed while leaving the user anonymous.
    expect(login).toMatch(/await new Promise\(\(resolve, reject\) => \{\s*req\.session\.regenerate\(/);
  });

  it('regenerates BEFORE adopting the identity', () => {
    const regen = login.indexOf('req.session.regenerate(');
    const adopt = login.indexOf('req.session.userId =');
    expect(regen).toBeGreaterThan(-1);
    expect(adopt).toBeGreaterThan(-1);
    expect(regen, 'identity is written before the session is regenerated')
      .toBeLessThan(adopt);
  });

  it('sets the cookie lifetime AFTER regenerating', () => {
    // Regeneration resets the cookie to the store default, so a maxAge set
    // beforehand would be silently discarded and "remember me" would last a
    // day instead of a month.
    const regen = login.indexOf('req.session.regenerate(');
    const maxAge = login.indexOf('req.session.cookie.maxAge');
    expect(maxAge).toBeGreaterThan(regen);
  });

  it('mints the CSRF token after regenerating, not before', () => {
    const regen = login.indexOf('req.session.regenerate(');
    const token = login.indexOf('csrfToken(req)');
    expect(token).toBeGreaterThan(regen);
  });

  it('only regenerates once the password has been checked', () => {
    // Regenerating on a FAILED login would let anyone churn sessions, and
    // would throw away the rate-limiter's own session-independent state for
    // no benefit.
    const fail = login.indexOf('recordLoginFailure');
    const regen = login.indexOf('req.session.regenerate(');
    expect(fail).toBeGreaterThan(-1);
    expect(regen).toBeGreaterThan(fail);
  });
});

describe('logout still destroys rather than regenerates', () => {
  it('uses destroy', () => {
    const logout = strip(source.slice(source.indexOf("app.post('/api/auth/logout'")));
    expect(logout.slice(0, 400)).toMatch(/req\.session\.destroy\(/);
  });
});
