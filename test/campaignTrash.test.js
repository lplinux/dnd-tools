/**
 * test/campaignTrash.test.js
 *
 * Deleting a campaign is a soft delete. Two invariants hold it up, and both are
 * enforced entirely in SQL:
 *
 *   - a trashed campaign must not appear in ANY campaign list. `GET /api/campaigns`
 *     is the single endpoint behind every module's campaign selector, so one
 *     missing `deleted_at` filter there un-deletes the campaign everywhere at once;
 *   - a trashed campaign's public share links must stop resolving. Those handlers
 *     are token-gated and unauthenticated, so a missed guard leaks to the open web
 *     rather than merely to a logged-in user.
 *
 * As with diaryPrivacy.test.js there is no HTTP harness, so these read app.js as
 * text: coarse, but each assertion maps to a specific way the trash silently
 * stops working.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const source = readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'app.js'),
  'utf8',
);

function handlerBody(method, routePath) {
  const needle = `app.${method}('${routePath}'`;
  const start = source.indexOf(needle);
  expect(start, `route not found: ${method.toUpperCase()} ${routePath}`).toBeGreaterThan(-1);
  const end = source.indexOf('\n});', start);
  expect(end, `unterminated handler: ${routePath}`).toBeGreaterThan(start);
  return source.slice(start, end);
}

/** Comments stripped — the handlers explain the guard in prose right beside it. */
function handlerCode(method, routePath) {
  return handlerBody(method, routePath)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--[^\n]*/g, '')
    .replace(/\/\/[^\n]*/g, '');
}

describe('schema', () => {
  it('adds deleted_at additively, so an upgrade trashes nothing', () => {
    expect(source).toContain('ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;');
    // No DEFAULT and no NOT NULL: every existing row must come out NULL (= live).
    expect(source).not.toMatch(/deleted_at TIMESTAMP\s+(NOT NULL|DEFAULT)/);
  });
});

describe('campaign list', () => {
  const body = handlerCode('get', '/api/campaigns');

  it('filters trashed campaigns from the DM branch', () => {
    expect(body).toContain('dm_user_id = $1 AND deleted_at IS NULL');
  });

  it('filters trashed campaigns from the player branch', () => {
    expect(body).toMatch(/WHERE c\.deleted_at IS NULL/);
  });

  it('returns one row per campaign, not one per character', () => {
    // Joining through campaign_players gave a player with two characters in
    // one campaign that campaign TWICE — a selector listing the same name
    // twice in every module that reads this endpoint, and a `length === 1`
    // auto-select that stopped firing for them. EXISTS asks the question
    // actually being asked, so uniqueness holds by construction.
    expect(body).toMatch(/AND EXISTS \(/);
    expect(body).toMatch(/SELECT 1 FROM campaign_players cp/);
    // The join that produced the duplicates must be gone from the outer query.
    expect(body).not.toMatch(/FROM campaigns c\s*\n\s*JOIN campaign_players/);
  });
});

describe('delete / restore / purge', () => {
  it('delete is a soft delete, not a DELETE', () => {
    const body = handlerCode('delete', '/api/campaigns/:id');
    expect(body).toContain('UPDATE campaigns SET deleted_at = NOW()');
    expect(body).not.toMatch(/DELETE\s+FROM\s+campaigns/i);
  });

  it('delete is idempotent — a second call cannot move the timestamp forward', () => {
    expect(handlerCode('delete', '/api/campaigns/:id'))
      .toContain('WHERE id = $1 AND deleted_at IS NULL');
  });

  it('purge refuses a campaign that is not already in the trash', () => {
    const body = handlerCode('delete', '/api/campaigns/:id/purge');
    expect(body).toContain('DELETE FROM campaigns WHERE id = $1 AND deleted_at IS NOT NULL');
  });

  it('the trash list is scoped to the calling DM', () => {
    expect(handlerCode('get', '/api/campaigns/trash'))
      .toContain('dm_user_id = $1 AND deleted_at IS NOT NULL');
  });

  it('all three routes check ownership', () => {
    for (const [method, route] of [
      ['delete', '/api/campaigns/:id'],
      ['post',   '/api/campaigns/:id/restore'],
      ['delete', '/api/campaigns/:id/purge'],
    ]) {
      expect(handlerCode(method, route), `${method} ${route}`).toContain('ownsCampaignRow');
    }
  });
});

describe('public share links are suspended while a campaign is trashed', () => {
  // Every unauthenticated, token-gated surface that can reach campaign content.
  const PUBLIC = [
    ['get', '/api/diary-public/:token'],
    ['get', '/api/diary-public/:token/roster'],
    ['get', '/api/timeline-public/:token'],
    ['get', '/api/journey-map-public/:token'],
    ['get', '/api/pc-public/:playerToken'],
  ];

  it.each(PUBLIC)('%s %s guards on deleted_at', (method, route) => {
    expect(handlerCode(method, route)).toContain('deleted_at IS NULL');
  });

  it.each(PUBLIC)('%s %s 404s rather than falling through', (method, route) => {
    // The guard is only worth having if an empty result short-circuits. Two of
    // these used `?.` with a placeholder fallback and would otherwise have served
    // the content under a default campaign name.
    expect(handlerCode(method, route)).toMatch(/status\(404\)/);
  });
});
