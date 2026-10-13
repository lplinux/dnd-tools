/**
 * test/linkTargets.test.js
 *
 * The index behind `[[Name]]` links. Two things must hold:
 *
 *  - a player is never offered a name they are not allowed to resolve, which
 *    means the same `is_public` rule the locations route applies and no NPCs
 *    at all, since `campaign_npcs` is DM-only and has no visibility column;
 *  - it never pulls `image_data`, a base64 pin image, into what is fetched for
 *    every campaign to drive an autocomplete.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(path.join(root, 'app.js'), 'utf8');

const start = source.indexOf("app.get('/api/campaigns/:campaignId/link-targets'");
const body = source.slice(start, source.indexOf('\n});', start))
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

describe('what a player may resolve', () => {
  it('filters locations by is_public for anyone who is not the DM', () => {
    expect(body).toMatch(/\$\{isDM \? '' : 'AND is_public = true'\}/);
  });

  it('sends a player no NPCs at all', () => {
    // Not "filtered to the visible ones" — there is no such column.
    expect(body).toMatch(/isDM\s*\?\s*pool\.query\(/);
    expect(body).toMatch(/Promise\.resolve\(\{ rows: \[\] \}\)/);
  });

  it('decides DM-ness from the campaign row, not the session role alone', () => {
    expect(body).toMatch(/await isCampaignDm\(campaignId, req\.session\.userId, req\.session\.role\)/);
  });

  it('requires membership before any of that', () => {
    expect(body).toMatch(/canAccessCampaign/);
    expect(body).toMatch(/403/);
  });
});

describe('what it costs', () => {
  it('never selects image_data', () => {
    // A base64 pin image per location, fetched to offer six suggestions.
    expect(body).not.toMatch(/image_data/);
  });

  it('uses an explicit column list, never SELECT *', () => {
    expect(body).not.toMatch(/SELECT \*/);
    expect(body).toMatch(/SELECT id, name, description/);
  });

  it('scopes both queries to the campaign', () => {
    const scoped = body.match(/WHERE campaign_id = \$1/g) ?? [];
    expect(scoped.length).toBeGreaterThanOrEqual(2);
  });
});
