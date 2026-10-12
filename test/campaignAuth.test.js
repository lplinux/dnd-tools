/**
 * test/campaignAuth.test.js
 *
 * `requireRole(['dm'])` answers "is this user a DM somewhere", not "is this user
 * the DM of THIS campaign". Forty-three routes were relying on it as though it
 * answered the second question, so any DM could read or edit another DM's
 * locations, NPCs, journey maps, character tree and player sheets by guessing an
 * id — and `canAccessPC` opened with `if (userRole === 'dm') return true;` and no
 * query at all, which did the same for every /api/pc/* route.
 *
 * The rule now is: every route carrying a campaign, player or map id calls an
 * ownership helper. This suite enforces that by walking the route table rather
 * than checking a fixed list, so it fails when a NEW unguarded route is added —
 * which is the failure mode that actually matters. A hand-written list of
 * today's routes would pass forever while the next one quietly ships open.
 *
 * As with diaryPrivacy.test.js and campaignTrash.test.js there is no HTTP
 * harness: these read app.js as text. Coarse, but each assertion maps to a
 * specific way someone reaches data that is not theirs.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const source = readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'app.js'),
  'utf8',
);

const HELPERS = [
  'dmOwnsCampaign', 'canAccessCampaign', 'playerInCampaign',
  'ownsPlayer', 'canAccessTimeline', 'dmOwnsMap', 'canAccessPC', 'ownsCampaignRow',
  'ownsItemCard',
];

/** Strip comments so prose about a guard cannot satisfy a test looking for one. */
const strip = (t) => t
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/--[^\n]*/g, '')
  .replace(/\/\/[^\n]*/g, '');

/** Every route registration in order, with the handler body that follows it. */
function routes() {
  const lines = source.split('\n');
  const rx = /^app\.(get|post|put|patch|delete)\('([^']+)'/;
  const regs = [];
  lines.forEach((l, i) => {
    const m = rx.exec(l);
    if (m) regs.push({ i, method: m[1].toUpperCase(), path: m[2] });
  });
  return regs.map((r, n) => ({
    ...r,
    body: strip(lines.slice(r.i, n + 1 < regs.length ? regs[n + 1].i : lines.length).join('\n')),
  }));
}

/** Carries a resource id whose owner must be checked. */
const idBearing = (p) =>
  /:(campaignId|playerId|timelineId|locationId|mapId|npcId|id)\b/.test(p)
  && !p.startsWith('/api/users/');          // user admin, gated by requireRole(['admin'])

/**
 * Routes allowed to skip the helpers, each for a stated reason. Anything else
 * reaching this list is a bug in the fix, not an exception to it.
 */
const EXEMPT = new Map([
  // Export must keep working on a TRASHED campaign so a DM can take a copy
  // before purging. Uses its own inline `dm_user_id` query, deliberately
  // without a deleted_at filter.
  ['GET /api/campaigns/:id/export', /dm_user_id=\$2/],
]);

describe('every id-bearing route checks ownership', () => {
  const candidates = routes().filter((r) => idBearing(r.path) && !r.path.includes('-public/'));

  it('found the route table', () => {
    expect(candidates.length).toBeGreaterThan(60);
  });

  it.each(candidates.map((r) => [`${r.method} ${r.path}`, r]))('%s', (label, r) => {
    const exemption = EXEMPT.get(label);
    if (exemption) {
      expect(r.body, `${label} is exempt but no longer has its inline check`).toMatch(exemption);
      return;
    }
    const used = HELPERS.filter((h) => r.body.includes(`${h}(`));
    expect(used, `${label} has no ownership check`).not.toEqual([]);
  });
});

describe('canAccessPC', () => {
  const fn = strip(source.slice(
    source.indexOf('async function canAccessPC'),
    source.indexOf('async function canAccessPC') + 1200,
  ));

  it('no longer waves every DM through without a query', () => {
    expect(fn).not.toMatch(/userRole === 'dm'\)\s*return true/);
  });

  it('actually reads the database', () => {
    expect(fn).toContain('pool.query');
    expect(fn).toContain('campaign_players');
    expect(fn).toContain('dm_user_id');
  });

  it('refuses a trashed campaign', () => {
    expect(fn).toContain('deleted_at IS NULL');
  });
});

describe('the trash guard sits above the admin short-circuit', () => {
  // An admin who short-circuits before the SQL runs walks straight through any
  // deleted_at filter, which would make the sealed trash a fiction.
  for (const name of ['dmOwnsCampaign', 'canAccessPC']) {
    it(`${name} checks the campaign before returning true for an admin`, () => {
      const start = source.indexOf(`async function ${name}`);
      expect(start, `${name} not found`).toBeGreaterThan(-1);
      const fn = strip(source.slice(start, start + 1200));
      // [Rr]ole: dmOwnsCampaign names the parameter `role`, canAccessPC names it
      // `userRole`. A lowercase-only pattern silently matched neither there.
      const adminAt = fn.search(/[Rr]ole === 'admin'\)\s*return true/);
      const queryAt = fn.indexOf('pool.query');
      expect(adminAt, `${name}: no admin branch found`).toBeGreaterThan(-1);
      expect(queryAt, `${name}: admin short-circuits before any query`).toBeLessThan(adminAt);
    });
  }
});

describe('child ids are scoped to their parent', () => {
  // `WHERE id = $1` alone addressed any row in the table, so a DM authorised for
  // one player could edit another player's notes or relationships by id.
  const scoped = [
    ['put', '/api/pc/:playerId/dm-notes/:noteId'],
    ['delete', '/api/pc/:playerId/dm-notes/:noteId'],
    ['delete', '/api/pc/:playerId/relationships/:relId'],
    ['patch', '/api/pc/:playerId/relationships/:relId'],
  ];
  it.each(scoped)('%s %s scopes by character_id', (method, routePath) => {
    const r = routes().find((x) => x.method === method.toUpperCase() && x.path === routePath);
    expect(r, `${method} ${routePath} not found`).toBeDefined();
    expect(r.body).toContain('character_id = (SELECT id FROM pc_characters WHERE player_id =');
  });
});

describe('export carve-outs are explicit', () => {
  it('the campaign diary export opts in to trashed campaigns', () => {
    const r = routes().find((x) => x.path === '/api/campaign-diary/:campaignId/export');
    expect(r).toBeDefined();
    expect(r.body).toContain('includeTrashed: true');
  });

  it('nothing else passes includeTrashed', () => {
    const hits = (source.match(/includeTrashed:\s*true/g) ?? []).length;
    expect(hits, 'a new includeTrashed caller appeared — is it really read-only?').toBe(1);
  });
});
