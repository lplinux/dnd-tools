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
    /*
     * Description and public_info reach a player; the rest does not.
     *
     * `has_sheet` and `life_state` are the new ones to keep out: whether
     * the DM has rolled a stat block, and whether they privately consider
     * someone dead, are answers the table finds out in play.
     */
    const decl = source.slice(source.indexOf('const NPC_PLAYER_COLUMNS'),
      source.indexOf('const NPC_PLAYER_LOCATION'));
    expect(decl).toMatch(/n\.description/);
    expect(decl).toMatch(/n\.public_info/);
    for (const col of ['private_info', 'has_sheet', 'life_state']) {
      expect(decl, `${col} must not reach a player`).not.toMatch(new RegExp(`n\\.${col}`));
    }
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
    // `locId` reaches the parameter list; the raw input never does.
    expect(put).toMatch(/\blocId,/);
    expect(put).not.toMatch(/current_location_id, npcId/);
  });

  it('the update is scoped by campaign as well as by id', () => {
    /*
     * Positional, so it moves whenever a column is added — matched on the
     * LAST two placeholders rather than on fixed numbers, which is the
     * property that actually matters.
     */
    const m = /WHERE id=\$(\d+) AND campaign_id=\$(\d+)/.exec(put);
    expect(m, 'the update is not scoped by campaign').not.toBeNull();
    expect(Number(m[2])).toBe(Number(m[1]) + 1);
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

describe('a stat block, and whether they are still alive', () => {
  const put = route("app.put('/api/campaigns/:campaignId/npcs/:npcId'");

  it('life_state exists, with the default that says what it means', () => {
    /*
     * ALIVE rather than unknown, because "unknown" is the DM saying the
     * party has reason to wonder — not an NPC nobody has thought about.
     */
    expect(source).toMatch(/ADD COLUMN IF NOT EXISTS life_state VARCHAR\(10\)\s*\n\s*NOT NULL DEFAULT 'alive'/);
  });

  it('and has_sheet is DERIVED now, not stored', () => {
    /*
     * It was a checkbox meaning "this one needs a stat block". Now that a
     * sheet is a row that either exists or does not, the row is the
     * answer — and two sources of truth would disagree the first time a
     * sheet was made without ticking the box.
     */
    expect(source).toMatch(/EXISTS \(SELECT 1 FROM npc_sheets s WHERE s\.npc_id = n\.id\) AS has_sheet/);
    expect(source).toMatch(/ALTER TABLE campaign_npcs DROP COLUMN IF EXISTS has_sheet/);
    expect(put).not.toMatch(/has_sheet/);
  });

  it('and the intent the checkbox recorded is folded in, not dropped', () => {
    // A tick meant "there should be a sheet here", so it becomes an empty
    // one. Guarded on the column existing: INSERT has no IF EXISTS form,
    // and naming a dropped column is a parse-time error that takes initDb
    // down on the SECOND boot of every database.
    expect(source).toMatch(/INSERT INTO npc_sheets \(npc_id\)\s*\n\s*SELECT id FROM campaign_npcs WHERE has_sheet = true/);
    const fold = source.slice(source.indexOf('CREATE TABLE IF NOT EXISTS npc_sheets'),
      source.indexOf('DROP COLUMN IF EXISTS has_sheet'));
    expect(fold).toMatch(/SELECT 1 FROM information_schema\.columns/);
    expect(fold.indexOf('THEN')).toBeLessThan(fold.indexOf('INSERT INTO npc_sheets'));
  });

  it('and the life state is constrained in the database', () => {
    // Added separately, because a CHECK inside ADD COLUMN IF NOT EXISTS
    // never lands on a table that already has the column.
    expect(source).toMatch(/ADD CONSTRAINT campaign_npcs_life_state_check\s*\n\s*CHECK \(life_state IN \('alive','dead','unknown'\)\)/);
  });

  it('an unknown life state is clamped, not rejected', () => {
    // Refusing the whole edit over a stale client would lose the DM's text.
    expect(put).toMatch(/life_state = CASE WHEN \$6::text IN \('alive','dead','unknown'\) THEN \$6 ELSE life_state END/);
  });
});

describe('an NPC\'s relationships', () => {
  const rel = route("app.get('/api/campaigns/:campaignId/npcs/:npcId/relationships'");

  it('is its own route, not a column on the list', () => {
    // Forty rows, almost none of them open.
    expect(rel).toMatch(/requireRole\(\['dm', 'player'\]\)/);
    expect(rel).toMatch(/await canAccessCampaign\(/);
  });

  it('a player gets only the public edges', () => {
    expect(rel).toMatch(/AND \(\$3 OR cr\.is_public = true\)/);
  });

  it('and none at all for an NPC they have not met', () => {
    // No card, so no edges — the same gate as the card itself.
    expect(rel).toMatch(/if \(!isDM && !self\.rows\[0\]\.is_public\) return res\.status\(403\)/);
  });

  it('an edge to an unmet NPC is DROPPED, not blanked', () => {
    /*
     * A nameless edge still says "there is somebody here", which is the
     * thing being withheld — the same reasoning as nulling a hidden
     * location's id along with its name.
     */
    expect(rel).toMatch(/if \(!hit \|\| \(!isDM && !hit\.is_public\)\) continue;/);
  });

  it('and notes stay with the DM', () => {
    expect(rel).toMatch(/\.\.\.\(isDM \? \{ notes: e\.notes, is_public: e\.is_public \} : \{\}\)/);
  });

  it('resolves names in two queries, not one per row', () => {
    expect(rel).toMatch(/id = ANY\(\$2::int\[\]\)/);
  });
});

describe('the NPC list', () => {
  const tab = readFileSync(path.join(root, 'frontend/src/pages/ManageCampaigns/tabs/NpcsTab.jsx'), 'utf8');

  it('puts Seen beside the name, not in its own column', () => {
    // Revealing people after a session means reading down the names, and
    // the eye was three columns away from the thing being read.
    expect(tab).not.toMatch(/'Name', 'Description', 'Currently at', 'Seen'/);
    expect(tab).toMatch(/'Name', 'Description', 'Currently at', ''/);
    const nameCell = tab.slice(tab.indexOf('Seen sits WITH the name'), tab.indexOf('</td>', tab.indexOf('Seen sits WITH the name')));
    expect(nameCell).toMatch(/toggleNpcVisibility/);
  });

  it('marks the dead and the unknown, but not the living', () => {
    // Almost everyone is alive; a badge on every row would say nothing.
    expect(tab).toMatch(/alive:\s*\{ label: 'Alive',\s*Icon: null/);
    expect(tab).toMatch(/dead:\s*\{ label: 'Dead',\s*Icon: Skull/);
    expect(tab).toMatch(/unknown:\s*\{ label: 'Unknown',\s*Icon: CircleHelp/);
  });

  it('with an ICON, not a glyph', () => {
    /*
     * These began as `†` and `?`, which read as punctuation at the end of
     * a name — a dagger is a weapon before it is a death notice. A skull
     * is unambiguous scanning down a list, which is the whole job.
     */
    expect(tab).toMatch(/import \{[^}]*Skull[^}]*\} from 'lucide-react'/);
    expect(tab).toMatch(/function LifeMark\(\{ state, size = 13 \}\)/);
    expect(tab).toMatch(/<LifeMark state=\{n\.life_state\} \/>/);
    expect(tab).not.toMatch(/mark: '†'/);
  });

  it('and it is readable without seeing it', () => {
    // A bare icon beside a name says nothing to a screen reader, and
    // nothing on hover either.
    expect(tab).toMatch(/aria-label=\{life\.label\}/);
    expect(tab).toMatch(/title=\{life\.label\}/);
  });

  it('and the stat block is a BUTTON on the row, in both states', () => {
    /*
     * One control, not two: "show me this one's numbers" is the same
     * intent whether a sheet exists yet or not, and an Add button would
     * take a column from forty rows that will never have one. The filled
     * state is gold, the empty one faint.
     */
    expect(tab).toMatch(/onClick=\{\(e\) => \{ e\.stopPropagation\(\); setSheetFor\(n\); \}\}/);
    expect(tab).toMatch(/n\.has_sheet\s*\n?\s*\? 'text-gold/);
    expect(tab).toMatch(/aria-label=\{n\.has_sheet \? 'Open stat block' : 'Create stat block'\}/);
    // stopPropagation, or the row's own click opens the reading card too.
    expect(tab).toMatch(/e\.stopPropagation\(\)/);
    expect(tab).toMatch(/life_state: form\.life_state/);
  });

  it('and the checkbox that used to set it is gone', () => {
    expect(tab).not.toMatch(/Needs a sheet/);
    expect(tab).not.toMatch(/has_sheet: form\.has_sheet/);
  });

  it('says WHERE a player reads public info, not just that they can', () => {
    /*
     * The field was briefly removed from the player's view on the belief
     * that it was not reaching them. It was — through the cross-link card,
     * not through this table, which lists name, description and location.
     * The hint now names the card, so the next person checking does not
     * reach the same wrong conclusion.
     */
    expect(tab).toMatch(/Players see this too, on the card/);
    expect(tab).toMatch(/not in the\s*\n?\s*table above/);
  });
});

describe('the card a click opens', () => {
  const pop = readFileSync(path.join(root, 'frontend/src/components/CrossLinkPopover.jsx'), 'utf8');

  it('is a card, not a tooltip', () => {
    // 288px of 12px text is the wrong shape for a description — and for a
    // player it is the only view of an NPC there is.
    expect(pop).toMatch(/w-\[30rem\]/);
    expect(pop).not.toMatch(/\bw-72\b/);
  });

  it('and its text is readable', () => {
    expect(pop).toMatch(/text-\[0\.9rem\] leading-relaxed/);
  });

  it('shows the same dead/unknown marker beside the name', () => {
    expect(pop).toMatch(/dead:\s*\{ label: 'Dead',\s*Icon: Skull/);
    expect(pop).toMatch(/target\.kind === 'npc' && LIFE\[target\.life_state\]\?\.Icon/);
  });

  it('which cannot leak, because the field never reaches a player', () => {
    /*
     * No role check here on purpose: the server omits `life_state` from a
     * player's NPC row, so the branch simply cannot render for them — the
     * same way `private_info` decides its own branch in this file.
     */
    expect(source).toMatch(/const NPC_PLAYER_COLUMNS = `n\.id, n\.name, n\.description, n\.public_info, n\.is_public`/);
    expect(pop).not.toMatch(/isDM|role ===/);
  });
});
