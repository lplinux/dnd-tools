/**
 * test/shareTokens.test.js
 *
 * A share token must survive being asked for twice.
 *
 * The journey map's did not: every POST minted a fresh one and upserted over
 * the old, so a DM pressing Share a second time — which is mostly what Share is
 * for, re-copying the URL — silently killed every link already pasted
 * somewhere. The players' next click got a 404 reading "Map not found", which
 * points at the map rather than at the link.
 *
 * Every other share route in the app already read the existing row first. This
 * suite holds all five to the same rule, so the next one added cannot quietly
 * be the exception.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(path.join(root, 'app.js'), 'utf8');

function handlerCode(method, routePath) {
  const needle = `app.${method}('${routePath}'`;
  const start = source.indexOf(needle);
  expect(start, `route not found: ${method} ${routePath}`).toBeGreaterThan(-1);
  const end = source.indexOf('\n});', start);
  return source.slice(start, end)
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

/** Every route that hands out a public link, and the table it reads. */
const MINTERS = [
  ['get', '/api/campaign-diary/:campaignId/share', 'campaign_diary_shares'],
  ['get', '/api/player-timelines/:timelineId/public-token', 'player_timeline_shares'],
  ['post', '/api/journey-maps/:id/share', 'journey_map_shares'],
];

describe('a share token survives being asked for twice', () => {
  for (const [method, route, table] of MINTERS) {
    it(`${route} returns the existing token rather than minting a new one`, () => {
      const body = handlerCode(method, route);
      // It must SELECT before it INSERTs, and return early on a hit.
      const select = body.indexOf(`SELECT token FROM ${table}`);
      const insert = body.search(/INSERT INTO \w+_shares/);
      expect(select, 'no SELECT of an existing token').toBeGreaterThan(-1);
      expect(insert, 'no INSERT at all').toBeGreaterThan(-1);
      expect(select).toBeLessThan(insert);
      expect(body.slice(select, insert)).toMatch(/return res\.json\(\{ token/);
    });

    it(`${route} only generates randomness after that check`, () => {
      // The bug was not just the overwrite — randomBytes ran unconditionally,
      // so the token changed even on the path that should have been read-only.
      const body = handlerCode(method, route);
      const rand = body.indexOf('randomBytes');
      const select = body.indexOf(`SELECT token FROM ${table}`);
      expect(rand).toBeGreaterThan(select);
    });
  }
});

describe('revoking is a separate, deliberate act', () => {
  for (const route of [
    '/api/campaign-diary/:campaignId/share',
    '/api/journey-maps/:id/share',
  ]) {
    it(`${route} has a DELETE`, () => {
      const body = handlerCode('delete', route);
      expect(body).toMatch(/DELETE FROM \w+_shares/);
    });
  }
});

describe('the public map handler', () => {
  const body = handlerCode('get', '/api/journey-map-public/:token');

  it('says a dead link is a dead link, not a missing map', () => {
    // Two different 404s came back with one message, and the one a player
    // actually hits is the stale link.
    const share = body.slice(0, body.indexOf('const mapId'));
    expect(share).toMatch(/share link is no longer valid/);
    expect(share).toMatch(/SHARE_REVOKED/);
    expect(share).not.toMatch(/Map not found/);
  });

  it('still 404s a map whose campaign is in the trash', () => {
    expect(body).toMatch(/c\.deleted_at IS NULL/);
  });
});
