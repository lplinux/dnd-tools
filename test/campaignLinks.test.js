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

  it('branches on role for NPCs, and ONLY for NPCs', () => {
    // The shared maps and timelines are "what has been shared", the same
    // answer for everyone — a role branch there would be a second code path
    // to get wrong, and this once asserted there was no branch at all.
    // NPCs forced one: a player gets the revealed ones, the DM gets all of
    // them so the tab shows what the table sees plus what is still hidden.
    expect(body).toMatch(/const isDM = await isCampaignDm\(/);
    const branches = body.match(/\$\{isDM \? [^}]*\}/g) ?? [];
    expect(branches.length, 'a role branch outside the NPC query').toBe(1);
    expect(body).toMatch(/n\.is_public = true/);
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

  it('returns the NPCs the viewer may see', () => {
    // The empty placeholder is filled now that campaign_npcs has a
    // visibility flag.
    expect(body).toMatch(/npcs: npcRows\.rows/);
    expect(body).not.toMatch(/npcs: \[\]/);
  });

  it('never sends private_info', () => {
    // The one column on campaign_npcs that must not reach a player. An
    // explicit column list is what keeps it out; SELECT * would not.
    const q = body.slice(body.indexOf('FROM campaign_npcs') - 400,
      body.indexOf('FROM campaign_npcs') + 400);
    expect(q).not.toMatch(/private_info/);
    expect(q).not.toMatch(/SELECT \*/);
  });

  it('hides the location of an NPC standing somewhere secret', () => {
    // From a PLAYER. Revealing Grathul must not reveal the undiscovered
    // place he is standing in.
    expect(body).toMatch(/CASE WHEN l\.is_public OR \$2 THEN l\.name END/);
  });
});
