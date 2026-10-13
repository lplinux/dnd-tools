/**
 * api/returnTo.test.js
 *
 * `next` comes out of the URL, so it is attacker-controlled. Everything here
 * is a way of writing "somewhere else" that still looks relative at a glance.
 */
import { describe, it, expect } from 'vitest';
import { safeNext, loginHref } from './returnTo';

describe('a path we are willing to return to', () => {
  it('accepts an ordinary in-app path', () => {
    expect(safeNext('/journey-map-public/abc123')).toBe('/journey-map-public/abc123');
    expect(safeNext('/')).toBe('/');
  });

  it('keeps a query string and a hash', () => {
    expect(safeNext('/timeline?player=3#evt-9')).toBe('/timeline?player=3#evt-9');
  });

  it('trims surrounding whitespace', () => {
    expect(safeNext('  /pc-sheet  ')).toBe('/pc-sheet');
  });
});

describe('ways of writing "somewhere else"', () => {
  const hostile = [
    ['protocol-relative', '//evil.example/'],
    ['protocol-relative with a path', '//evil.example/journey-map-public/x'],
    ['absolute http', 'http://evil.example/'],
    ['absolute https', 'https://evil.example/'],
    ['absolute to our own host', 'https://localhost:3080/'],
    ['a scheme with no slashes', 'javascript:alert(1)'],
    ['a data URL', 'data:text/html,<script>alert(1)</script>'],
    ['backslash, normalised to // by some browsers', '/\\evil.example'],
    ['double backslash', '\\\\evil.example'],
    ['a bare path with no leading slash', 'evil.example'],
    ['a relative traversal', '../admin'],
  ];
  for (const [why, value] of hostile) {
    it(`rejects ${why}`, () => {
      expect(safeNext(value)).toBeNull();
    });
  }

  it('rejects a control character, which can truncate a parsed URL', () => {
    expect(safeNext('/ok\nSet-Cookie: x=1')).toBeNull();
    expect(safeNext('/ok\u0000')).toBeNull();
    expect(safeNext('/ok\u007f')).toBeNull();
  });
});

describe('nothing at all', () => {
  it('is null rather than an empty string', () => {
    for (const v of ['', '   ', null, undefined]) expect(safeNext(v)).toBeNull();
  });
});

describe('loginHref', () => {
  it('carries a safe destination', () => {
    expect(loginHref('/journey-map-public/abc'))
      .toBe('/?login=1&next=%2Fjourney-map-public%2Fabc');
  });

  it('drops an unsafe one rather than refusing to offer a login', () => {
    // Someone following a tampered link should still be able to log in; they
    // just land on the home page rather than wherever the link wanted them.
    expect(loginHref('//evil.example')).toBe('/?login=1');
    expect(loginHref(null)).toBe('/?login=1');
  });

  it('encodes, so the next param cannot smuggle another param', () => {
    expect(loginHref('/a?b=1&login=0')).toBe('/?login=1&next=%2Fa%3Fb%3D1%26login%3D0');
  });
});
