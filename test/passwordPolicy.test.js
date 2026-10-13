/**
 * test/passwordPolicy.test.js
 *
 * One floor, every route that sets a password.
 *
 * The three disagreed: change-password asked for 4 characters, while BOTH
 * admin routes — create a user, reset someone else's password — accepted any
 * non-empty string. So the weakest passwords in the system were reachable by
 * the person most likely to be setting them for other people, and a
 * one-character password was a valid thing to create.
 *
 * The walk below is deliberately a search rather than a fixed list: a fourth
 * route that hashes a password and skips the check is the failure that matters,
 * and a hand-written list would pass forever while it shipped.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(path.join(root, 'app.js'), 'utf8');
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

/** Every route handler, with its body. */
function routes() {
  const lines = source.split('\n');
  const rx = /^app\.(get|post|put|patch|delete)\('([^']+)'/;
  const regs = [];
  lines.forEach((l, i) => { const m = rx.exec(l); if (m) regs.push({ i, method: m[1].toUpperCase(), path: m[2] }); });
  return regs.map((r, n) => {
    const hard = n + 1 < regs.length ? regs[n + 1].i : lines.length;
    let end = hard;
    for (let j = r.i + 1; j < hard; j++) if (lines[j] === '});') { end = j + 1; break; }
    return { ...r, body: strip(lines.slice(r.i, end).join('\n')) };
  });
}

describe('the floor itself', () => {
  it('is a single named constant, not a number repeated three times', () => {
    expect(source).toMatch(/const PASSWORD_MIN = 8;/);
  });

  it('matches what scripts/create-admin.js has always demanded', () => {
    // That script asked for 8 while the HTTP routes asked for 4 or nothing.
    // The project was contradicting itself; these two must not drift apart again.
    const script = readFileSync(path.join(root, 'scripts', 'create-admin.js'), 'utf8');
    const m = script.match(/password\.length\s*<\s*(\d+)/);
    expect(m, 'create-admin.js no longer checks a length').toBeTruthy();
    expect(Number(m[1])).toBe(8);
  });

  it('rejects an empty or non-string password too', () => {
    const fn = strip(source.slice(
      source.indexOf('function passwordError'),
      source.indexOf("app.post('/api/auth/change-password'"),
    ));
    expect(fn).toMatch(/typeof password !== 'string'/);
    expect(fn).toMatch(/password\.length < PASSWORD_MIN/);
  });

  it('reports the number rather than hard-coding it in the message', () => {
    const fn = source.slice(source.indexOf('function passwordError'));
    expect(fn.slice(0, 400)).toMatch(/\$\{PASSWORD_MIN\} characters/);
  });
});

describe('every route that sets a password checks it', () => {
  // Any handler that bcrypt-hashes something out of the request body.
  const setters = routes().filter((r) =>
    /bcrypt\.hash\(/.test(r.body) && /req\.body/.test(r.body));

  it('found the routes that hash a password', () => {
    const paths = setters.map((r) => `${r.method} ${r.path}`).sort();
    expect(paths).toEqual([
      'POST /api/auth/change-password',
      'POST /api/users',
      'PUT /api/users/:id/password',
    ]);
  });

  it.each(setters.map((r) => [`${r.method} ${r.path}`, r]))('%s', (label, r) => {
    expect(r.body, `${label} hashes a password without checking its length`)
      .toMatch(/passwordError\(/);
  });

  it('none of them still carries its own private minimum', () => {
    for (const r of setters) {
      expect(r.body, `${r.method} ${r.path} has a hand-rolled length check`)
        .not.toMatch(/password\.length < \d/);
    }
  });
});

describe('what the floor does NOT do', () => {
  it('never re-checks a stored hash, so nobody is locked out', () => {
    // The check lives only where a password is being set. A login path that
    // called it would reject every existing short password at the door.
    const login = routes().find((r) => r.path === '/api/auth/login');
    expect(login.body).not.toMatch(/passwordError\(/);
    expect(login.body).not.toMatch(/PASSWORD_MIN/);
  });
});
