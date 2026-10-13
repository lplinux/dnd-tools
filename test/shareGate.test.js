/**
 * test/shareGate.test.js
 *
 * A share link is for the table, not for the world.
 *
 * `campaignAuth.test.js` enforces that every token route calls `shareGate`.
 * This covers the parts that calling it does not settle: what the gate itself
 * decides, and — the one that bit — WHERE in each handler it is called.
 *
 * Ordering is the subtle requirement. The gate must run after the token has
 * been resolved, so a revoked link still reads as a revoked link. Gate first
 * and a dead link would tell a logged-out visitor to log in, for something
 * that no longer exists.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(path.join(root, 'app.js'), 'utf8');

const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

function handler(routePath) {
  const start = source.indexOf(`app.get('${routePath}'`);
  expect(start, `route not found: ${routePath}`).toBeGreaterThan(-1);
  const end = source.indexOf('\n});', start);
  return strip(source.slice(start, end));
}

const ROUTES = [
  '/api/journey-map-public/:token',
  '/api/timeline-public/:token',
  '/api/pc-public/:playerToken',
  '/api/diary-public/:token',
  '/api/diary-public/:token/roster',
];

describe('the gate itself', () => {
  const fn = strip(source.slice(
    source.indexOf('async function shareGate'),
    source.indexOf('const denyShare'),
  ));

  it('refuses an anonymous viewer with a code the page can branch on', () => {
    // requireAuth's bare 'Unauthorized' has no code, and the share pages have
    // to tell "log in" from "wrong account" to offer the right next step.
    expect(fn).toMatch(/if \(!req\.session\.userId\)/);
    expect(fn).toMatch(/status: 401/);
    expect(fn).toMatch(/code: 'LOGIN_REQUIRED'/);
  });

  it('refuses a logged-in non-member separately', () => {
    expect(fn).toMatch(/status: 403/);
    expect(fn).toMatch(/code: 'NOT_YOUR_CAMPAIGN'/);
  });

  it('decides membership with the existing helper, not a new query', () => {
    // canAccessCampaign carries the DM/admin arm and the trash guard on both
    // sides; a hand-rolled query here would be a second policy to keep in step.
    expect(fn).toMatch(/await canAccessCampaign\(campaignId, req\.session\.userId, req\.session\.role\)/);
    expect(fn).not.toMatch(/pool\.query/);
  });

  it('returns null to mean "may read", so a missing check is falsy', () => {
    expect(fn).toMatch(/return null;/);
  });
});

describe('every share route gates after resolving its token', () => {
  for (const route of ROUTES) {
    it(`${route} looks the token up before it gates`, () => {
      const body = handler(route);
      const gate = body.indexOf('await shareGate(req,');
      const lookup = body.search(/WHERE (s\.)?token=\$1|WHERE pts\.token=\$1|unhashId\(/);
      expect(lookup, 'no token lookup at all').toBeGreaterThan(-1);
      expect(gate, 'no gate').toBeGreaterThan(-1);
      expect(gate, 'gate runs before the token is resolved').toBeGreaterThan(lookup);
    });

    it(`${route} answers a bad token with a 404 before gating`, () => {
      const body = handler(route);
      const gate = body.indexOf('await shareGate(req,');
      const notFound = body.search(/res\.status\(404\)/);
      expect(notFound).toBeGreaterThan(-1);
      expect(notFound).toBeLessThan(gate);
    });

    it(`${route} sends the refusal rather than falling through`, () => {
      expect(handler(route)).toMatch(/if \(gate\) return denyShare\(res, gate\);/);
    });
  }
});

describe('the journey map keeps its revoked-link message', () => {
  const body = handler('/api/journey-map-public/:token');

  it('still distinguishes a dead link from a permission problem', () => {
    const revoked = body.indexOf('SHARE_REVOKED');
    const gate = body.indexOf('await shareGate(req,');
    expect(revoked).toBeGreaterThan(-1);
    expect(revoked).toBeLessThan(gate);
  });

  it('gates before the second batch of queries', () => {
    // A refused viewer should cost one round trip, not seven.
    const gate = body.indexOf('await shareGate(req,');
    const heavy = body.indexOf('deriveMovementPaths');
    expect(gate).toBeLessThan(heavy);
  });
});

describe('the PC sheet, which never had a share table', () => {
  const body = handler('/api/pc-public/:playerToken');

  it('fetches the campaign id so it has something to gate on', () => {
    expect(body).toMatch(/cp\.campaign_id/);
  });

  it('does not hand the campaign id back to the viewer', () => {
    // It was fetched for the gate, not for the page.
    expect(body).toMatch(/campaign_id: _omit/);
    expect(body).not.toMatch(/res\.json\(result\.rows\[0\]\)/);
  });
});
