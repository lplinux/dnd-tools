/**
 * test/routeOrder.test.js
 *
 * Express matches routes in registration order, so a literal path segment must
 * be registered BEFORE a same-shape route whose segment is a parameter.
 * Otherwise the parameterised route swallows it and the specific handler never
 * runs — silently, with whatever status the wrong handler happens to return.
 *
 * This shipped once: `GET /api/player-timelines/:timelineId/public-token` was
 * registered after `GET /api/player-timelines/:campaignId/:playerId`, so every
 * call matched the latter with playerId="public-token" and came back 403.
 *
 * The suite has no HTTP harness, so this reads the route table straight out of
 * app.js rather than booting the server.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const appPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'app.js');
const source = readFileSync(appPath, 'utf8');

/** Every route in registration order: { method, path, index }. */
function routes() {
  const out = [];
  const re = /app\.(get|post|put|patch|delete)\(\s*'([^']+)'/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    out.push({ method: m[1].toUpperCase(), path: m[2], index: m.index });
  }
  return out;
}

const segs = (p) => p.split('/').filter(Boolean);
const isParam = (s) => s.startsWith(':');

/**
 * Does `earlier` shadow `later`? True when they have the same method and segment
 * count, and every segment of `earlier` either matches `later`'s exactly or is a
 * parameter standing where `later` has a literal.
 */
function shadows(earlier, later) {
  if (earlier.method !== later.method) return false;
  const a = segs(earlier.path);
  const b = segs(later.path);
  if (a.length !== b.length) return false;
  let absorbsALiteral = false;
  for (let i = 0; i < a.length; i++) {
    if (isParam(a[i])) {
      if (!isParam(b[i])) absorbsALiteral = true;
      continue;
    }
    if (a[i] !== b[i]) return false;
  }
  return absorbsALiteral;
}

describe('express route registration order', () => {
  const all = routes();

  it('finds the route table', () => {
    expect(all.length).toBeGreaterThan(80);
  });

  it('never registers a parameterised route before a literal it would swallow', () => {
    const shadowed = [];
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        if (shadows(all[i], all[j])) {
          shadowed.push(`${all[j].method} ${all[j].path}  is unreachable — shadowed by  ${all[i].method} ${all[i].path}`);
        }
      }
    }
    expect(shadowed).toEqual([]);
  });

  it('detects the real bug it was written for', () => {
    // The exact pair that shipped broken, in the order it shipped in.
    const generic  = { method: 'GET', path: '/api/player-timelines/:campaignId/:playerId' };
    const specific = { method: 'GET', path: '/api/player-timelines/:timelineId/public-token' };
    expect(shadows(generic, specific)).toBe(true);
    // ...and does not cry wolf on the reverse order, or on unrelated shapes.
    expect(shadows(specific, generic)).toBe(false);
    expect(shadows(generic, { method: 'POST', path: '/api/player-timelines/:id/entries' })).toBe(false);
    expect(shadows(generic, { method: 'GET', path: '/api/pc/:playerId/export' })).toBe(false);
  });
});
