/**
 * test/campaignNpcs.test.js
 *
 * NPCs became a managed thing — description, public/private notes, a current
 * location, and a hide/show flag — rather than a bare name.
 *
 * Everything here is about ONE risk. `campaign_npcs` is the first table in
 * this app that a player may read and that also holds a column they must
 * never see. Locations can use `SELECT *` safely because nothing on that
 * table is secret; the moment `private_info` exists, a star is a leak. So
 * these tests chase the star, the role branch, and the location id that
 * would otherwise be withheld by name only.
 *
 * Also verified live against a scratch Postgres — see the CHANGELOG.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(path.join(root, 'app.js'), 'utf8');

/** One route handler, cut at its own closing `});`. */
function route(signature) {
  const at = source.indexOf(signature);
  expect(at, `${signature} not found`).toBeGreaterThan(-1);
  return source.slice(at, source.indexOf('\n});', at));
}

/** Every route body that reads campaign_npcs and can be reached by a player. */
const PLAYER_REACHABLE = [
  "app.get('/api/campaigns/:campaignId/npcs'",
  "app.get('/api/campaigns/:campaignId/link-targets'",
  "app.get('/api/campaigns/:campaignId/links'",
];

describe('private_info never reaches a player', () => {
  it.each(PLAYER_REACHABLE)('%s does not SELECT * from campaign_npcs', (sig) => {
    const body = route(sig).replace(/\/\/[^\n]*/g, '');
    // The danger is narrow and specific: `SELECT *` over this table. Other
    // tables in the same handler may use one.
    expect(body).not.toMatch(/SELECT\s+\*\s+FROM campaign_npcs/i);
    expect(body).not.toMatch(/SELECT\s+n\.\*[\s\S]{0,200}is_public = true/i);
  });

  it('the NPC list hands the DM a star and the player a column list', () => {
    const body = route("app.get('/api/campaigns/:campaignId/npcs'");
    // n.* is fine on the DM arm and is how new columns keep working.
    expect(body).toMatch(/SELECT n\.\*, l\.name AS location_name/);
    expect(body).toMatch(/NPC_PLAYER_COLUMNS/);
  });

  it('and the player column list leaves it out', () => {
    const decl = source.slice(source.indexOf('const NPC_PLAYER_COLUMNS'),
      source.indexOf('const NPC_PLAYER_LOCATION'));
    expect(decl).not.toMatch(/private_info/);
    expect(decl).toMatch(/n\.description/);
    expect(decl).toMatch(/n\.public_info/);
  });

  it('the cross-link index omits it for everyone, DM included', () => {
    const body = route("app.get('/api/campaigns/:campaignId/link-targets'");
    expect(body).not.toMatch(/private_info/);
  });

  it('the DM-only search popover DOES include it', () => {
    // The one place it is meant to appear: dmOwnsCampaign guards that route,
    // and reading your own notes without leaving the search is the point.
    const popover = source.slice(source.indexOf("case 'npc':"));
    expect(popover.slice(0, 900)).toMatch(/n\.private_info/);
  });
});

describe('a hidden NPC is hidden in SQL', () => {
  it('the list filters by is_public for a player', () => {
    expect(route("app.get('/api/campaigns/:campaignId/npcs'"))
      .toMatch(/n\.campaign_id = \$1 AND n\.is_public = true/);
  });

  it('so does the cross-link index', () => {
    expect(route("app.get('/api/campaigns/:campaignId/link-targets'"))
      .toMatch(/FROM campaign_npcs[\s\S]{0,120}\$\{isDM \? '' : 'AND is_public = true'\}/);
  });

  it('so does the campaign links tab', () => {
    expect(route("app.get('/api/campaigns/:campaignId/links'"))
      .toMatch(/\$\{isDM \? '' : 'AND n\.is_public = true'\}/);
  });

  it('new NPCs default to hidden, unlike locations', () => {
    // Locations default true because they always were visible. NPCs have
    // never been visible at all, so defaulting true would publish every NPC
    // a DM has ever named the moment they upgrade.
    expect(source).toMatch(/ALTER TABLE campaign_npcs ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT false/);
    expect(source).toMatch(/ALTER TABLE campaign_locations ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT true/);
  });
});

describe('a hidden LOCATION stays hidden even when the NPC is not', () => {
  // Revealing Grathul must not reveal the undiscovered place he is in.
  it('withholds the location NAME from a player', () => {
    expect(source).toMatch(/CASE WHEN l\.is_public THEN l\.name END AS location_name/);
  });

  it('and the location ID with it', () => {
    // THE bug worth a test of its own. Nulling the name but keeping the id
    // lets a player see that two NPCs are in the same unknown place, and the
    // id maps onto a location they may know by another route. The journal
    // shipped exactly this mistake once.
    const decl = source.slice(source.indexOf('const NPC_PLAYER_LOCATION'),
      source.indexOf('const NPC_PLAYER_LOCATION') + 700);
    expect(decl).toMatch(/CASE WHEN l\.is_public THEN n\.current_location_id END AS current_location_id/);
  });

  it('while the DM sees it either way', () => {
    expect(route("app.get('/api/campaigns/:campaignId/links'"))
      .toMatch(/CASE WHEN l\.is_public OR \$2 THEN l\.name END/);
  });
});

describe('writes are the DM\'s alone', () => {
  const writes = [
    "app.post('/api/campaigns/:campaignId/npcs'",
    "app.put('/api/campaigns/:campaignId/npcs/:npcId'",
    "app.patch('/api/campaigns/:campaignId/npcs/:npcId/visibility'",
    "app.delete('/api/campaigns/:campaignId/npcs/:npcId'",
  ];

  it.each(writes)('%s is DM-or-admin and ownership-checked', (sig) => {
    const body = route(sig);
    expect(body).toMatch(/requireRole\(\['dm', 'admin'\]\)/);
    expect(body).toMatch(/await dmOwnsCampaign\(/);
  });

  it('reading is open to players, which is the whole feature', () => {
    expect(route("app.get('/api/campaigns/:campaignId/npcs'"))
      .toMatch(/requireRole\(\['dm', 'player'\]\)/);
  });
});

describe('the current location cannot point out of the campaign', () => {
  const put = route("app.put('/api/campaigns/:campaignId/npcs/:npcId'");

  it('is verified against this campaign before being written', () => {
    // Otherwise a location id from another campaign would be accepted and
    // its NAME would then surface in this campaign's NPC list — a
    // cross-campaign leak through a column nobody would think to audit.
    expect(put).toMatch(/SELECT id FROM campaign_locations WHERE id=\$1 AND campaign_id=\$2/);
    expect(put).toMatch(/That location is not in this campaign/);
  });

  it('and the verified id is what gets stored, not the input', () => {
    expect(put).toMatch(/locId = loc\.rows\[0\]\.id/);
    expect(put).toMatch(/locId, npcId, campaignId/);
  });

  it('the update is scoped by campaign as well as by id', () => {
    expect(put).toMatch(/WHERE id=\$6 AND campaign_id=\$7/);
  });

  it('a duplicate name answers 409 rather than a 500', () => {
    // There is a (campaign_id, name) unique constraint, and renaming onto an
    // existing name is a thing a DM will do by accident.
    expect(put).toMatch(/e\.code === '23505'/);
  });
});

describe('the schema', () => {
  it('is additive — a column inside CREATE TABLE would never reach an existing DB', () => {
    for (const col of ['description', 'public_info', 'private_info', 'is_public', 'current_location_id']) {
      expect(source, `${col} is not an ALTER`)
        .toMatch(new RegExp(`ALTER TABLE campaign_npcs ADD COLUMN IF NOT EXISTS\\s+${col}`));
    }
  });

  it('does not delete people when a location goes', () => {
    expect(source).toMatch(/current_location_id\s*\n?\s*INTEGER REFERENCES campaign_locations\(id\) ON DELETE SET NULL/);
  });
});

describe('a campaign cannot hold two NPCs with the same name', () => {
  it('uniqueness is case-insensitive, like locations', () => {
    // The table had UNIQUE (campaign_id, name), which is exact — "Grathul"
    // and "grathul" could both exist and then resolve unpredictably, because
    // every lookup that matters keys on the NAME: the bundle's refs, the
    // cross-connection refs, the [[Name]] index.
    expect(source).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS campaign_npcs_campaign_name_unique\s*\n?\s*ON campaign_npcs \(campaign_id, LOWER\(name\)\)/);
  });

  it('existing clashes are RENAMED, never deleted', () => {
    // The locations migration deletes the loser. An NPC carries prose the DM
    // wrote, and its id is referenced by character_relationships and by
    // `npc_<id>` actor tokens in timeline entries — deleting one would
    // silently orphan those.
    const mig = source.slice(source.indexOf('UPDATE campaign_npcs n'),
      source.indexOf('campaign_npcs_campaign_name_unique'));
    expect(mig).toMatch(/SET name = n\.name \|\| ' #' \|\| n\.id/);
    expect(mig).toMatch(/ROW_NUMBER\(\) OVER \(\s*\n?\s*PARTITION BY campaign_id, LOWER\(name\) ORDER BY id/);
    expect(mig).toMatch(/d\.rn > 1/);
    expect(mig, 'the NPC migration deletes rows').not.toMatch(/DELETE FROM campaign_npcs/);
  });

  it('the id suffix is what stops the rename colliding again', () => {
    // Any fixed suffix could clash with the next renamed row in the same
    // partition; an id cannot.
    expect(source).toMatch(/' #' \|\| n\.id/);
  });

  it('every upsert names LOWER(name) as its conflict target', () => {
    // Naming the plain column would miss a differing-case clash and surface
    // it as a 500 instead of being handled. (`[^)]*` cannot be used to grab
    // the target — it stops inside LOWER(name) — so match the whole thing.)
    const targets = [...source.matchAll(/INSERT INTO campaign_npcs[\s\S]{0,400}?ON CONFLICT \(([^\n]*?)\) DO/g)]
      .map((m) => m[1].trim());
    expect(targets.length, 'no NPC upserts found').toBeGreaterThan(0);
    for (const t of targets) {
      expect(t, `conflict target is "${t}"`).toBe('campaign_id, LOWER(name)');
    }
  });

  it('a rename onto an existing name answers 409', () => {
    expect(route("app.put('/api/campaigns/:campaignId/npcs/:npcId'"))
      .toMatch(/e\.code === '23505'/);
  });
});

describe('the DM search reaches the new fields', () => {
  it('indexes the prose, not just the name', () => {
    const grp = source.slice(source.indexOf("group('npc', 'NPCs'"));
    expect(grp.slice(0, 400)).toMatch(/\['description', r\.description\]/);
    expect(grp.slice(0, 400)).toMatch(/\['private_info', r\.private_info\]/);
  });
});
