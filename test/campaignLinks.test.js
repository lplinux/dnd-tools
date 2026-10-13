/**
 * test/campaignLinks.test.js
 *
 * The Campaign Links tab shows a player what the DM has shared. The rule that
 * makes it safe is that **a row exists only because a share token does**.
 *
 * Every list is an INNER JOIN onto its shares table. A LEFT JOIN with the token
 * nulled out would render the same for a shared map and leak the name — and the
 * existence — of every unshared one. That is the whole guard, so it is the
 * thing worth pinning.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(path.join(root, 'app.js'), 'utf8');

const start = source.indexOf("app.get('/api/campaigns/:campaignId/links'");
const body = source.slice(start, source.indexOf('\n});', start))
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

describe('an unshared thing is not listed', () => {
  it('joins maps onto their shares, never left-joins', () => {
    expect(body).toMatch(/JOIN journey_map_shares jms ON jms\.map_id = jm\.id/);
    expect(body).not.toMatch(/LEFT JOIN journey_map_shares/);
  });

  it('joins timelines onto their shares, never left-joins', () => {
    expect(body).toMatch(/JOIN player_timeline_shares pts ON pts\.timeline_id = pt\.id/);
    expect(body).not.toMatch(/LEFT JOIN player_timeline_shares/);
  });

  it('reads the campaign timeline share directly, with no fallback', () => {
    expect(body).toMatch(/FROM campaign_timeline_shares WHERE campaign_id = \$1/);
  });

  it('never selects from the underlying tables unjoined', () => {
    // A `SELECT … FROM journey_maps WHERE campaign_id` with no share join is
    // exactly the leak this route must not grow.
    expect(body).not.toMatch(/FROM journey_maps jm\s+WHERE/);
    expect(body).not.toMatch(/FROM player_timelines pt\s+WHERE/);
  });
});

describe('who may read it', () => {
  it('requires membership of the campaign', () => {
    expect(body).toMatch(/canAccessCampaign\(campaignId, req\.session\.userId, req\.session\.role\)/);
    expect(body).toMatch(/403/);
  });

  it('does not branch on role', () => {
    // Deliberate: the list is "what has been shared", which is the same answer
    // for everyone. A role branch here would be a second code path to get wrong.
    expect(body).not.toMatch(/isDM|isCampaignDm|role === 'dm'/);
  });
});

describe('every scope is scoped to the campaign', () => {
  it('filters all three queries by campaign_id', () => {
    const wheres = body.match(/campaign_id = \$1/g) ?? [];
    expect(wheres.length).toBeGreaterThanOrEqual(3);
  });
});

describe('what it hands back', () => {
  it('gives each row a ready-made public path', () => {
    // The tab renders real <a href>s so middle-click and copy-link work; it
    // should not be assembling URLs from tokens itself.
    expect(body).toMatch(/\/journey-map-public\/\$\{m\.token\}/);
    expect(body).toMatch(/\/timeline-public\/\$\{t\.token\}/);
  });

  it('marks which timelines are the whole campaign', () => {
    expect(body).toMatch(/scope: 'campaign'/);
    expect(body).toMatch(/scope: 'timeline'/);
  });

  it('returns npcs as a prepared empty list', () => {
    // Shipping the real list would mean either showing players every NPC the
    // DM has named or inventing a visibility model in passing; campaign_npcs
    // has no visibility flag at all.
    expect(body).toMatch(/npcs: \[\]/);
    expect(source).not.toMatch(/campaign_npcs[^\n]*is_public/);
  });
});
