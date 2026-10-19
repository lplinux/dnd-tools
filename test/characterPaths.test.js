/**
 * test/characterPaths.test.js
 *
 * Character evolution — the DM's notes on how each character can grow.
 *
 * The load-bearing property is that there is NO player-facing route. This
 * table holds what a character could become and what it would cost, which
 * is most of next session's plot; a read route for a player would be a way
 * to read the campaign early. Everything else here is the tree discipline
 * that keeps a card from ending up somewhere nothing renders it.
 *
 * Also exercised live against a scratch Postgres — 29 checks, including a
 * player and a player's API token both being refused.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(path.join(root, 'app.js'), 'utf8');

const route = (sig) => {
  const at = source.indexOf(sig);
  expect(at, `${sig} not found`).toBeGreaterThan(-1);
  return source.slice(at, source.indexOf('\n});', at));
};

/** Every character-paths route in the file. */
const ROUTES = [...source.matchAll(/app\.(get|post|put|patch|delete)\('(\/api\/campaigns\/:campaignId\/paths[^']*)'/g)]
  .map((m) => [`app.${m[1]}('${m[2]}'`, `${m[1].toUpperCase()} ${m[2]}`]);

describe('it is the DM\'s alone', () => {
  it('found the routes', () => {
    expect(ROUTES.length).toBeGreaterThanOrEqual(5);
  });

  it.each(ROUTES)('%s is DM-only and ownership-checked', (sig) => {
    const body = route(sig);
    expect(body).toMatch(/requireRole\(\['dm', 'admin'\]\)/);
    expect(body).toMatch(/await dmOwnsCampaign\(/);
  });

  it('and nothing anywhere exposes the table to a player', () => {
    /*
     * The whole point of the feature living in Manage Campaigns. A member
     * gate on any of these would make next session readable in advance.
     */
    for (const [sig, label] of ROUTES) {
      expect(route(sig), `${label} uses the member gate`).not.toMatch(/canAccessCampaign/);
    }

    /*
     * And no OTHER route touches the table.
     *
     * Asserted by walking every route in the file rather than by counting
     * occurrences: an earlier version capped the count outside these
     * routes, which made the schema and a migration indistinguishable from
     * a leak and broke the moment either grew.
     */
    const offenders = [];
    for (const m of source.matchAll(/app\.(get|post|put|patch|delete)\('(\/api\/[^']*)'/g)) {
      const body = source.slice(m.index, source.indexOf('\n});', m.index));
      if (!body.includes('character_paths')) continue;
      if (m[2].startsWith('/api/campaigns/:campaignId/paths')) continue;
      offenders.push(`${m[1].toUpperCase()} ${m[2]}`);
    }
    expect(offenders, 'a route outside the paths group reads character_paths').toEqual([]);
  });
});

describe('a card cannot end up where nothing renders it', () => {
  const add = route("app.post('/api/campaigns/:campaignId/paths'");

  it('a child takes its parent\'s category AND character', () => {
    // Either disagreeing puts the row in a group its parent is not in.
    expect(add).toMatch(/const cat = parent \? parent\.category/);
    expect(add).toMatch(/const who = parent \? parent\.player_id/);
  });

  it('an unknown category is refused rather than defaulted', () => {
    // A default would silently file a card under something the DM did not
    // choose, which is worse than an error.
    expect(add).toMatch(/Unknown category/);
    expect(source).toMatch(/const PATH_CATEGORIES = \['path', 'teacher', 'homebrew'\]/);
  });

  it('and the schema constrains both lists too', () => {
    /*
     * Scoped to the CREATE TABLE. Matching anywhere in the file let the
     * table itself widen unnoticed, because the migration below carries a
     * correct copy of the same CHECK.
     */
    const create = source.slice(
      source.indexOf('CREATE TABLE IF NOT EXISTS character_paths'),
      source.indexOf('idx_character_paths_campaign'),
    );
    expect(create).toMatch(/CHECK \(category IN \('path','teacher','homebrew'\)\)/);
    expect(create).not.toMatch(/revealed/);
    expect(create).toMatch(/CHECK \(state IN \('idea','open','in-progress','done'\)\)/);
  });

  it('a character from another campaign is refused', () => {
    expect(add).toMatch(/SELECT 1 FROM campaign_players WHERE id=\$1 AND campaign_id=\$2/);
    expect(add).toMatch(/That character is not in this campaign/);
  });

  it('and so is a parent from another campaign', () => {
    expect(add).toMatch(/That parent is not in this campaign/);
  });

  it('NULL player_id is a real value, not a missing one', () => {
    // "The party" — what `revealed` needs. IS NOT DISTINCT FROM, because
    // `= NULL` is never true and the position query would restart at 0.
    expect(add).toMatch(/player_id IS NOT DISTINCT FROM \$3/);
    expect(source).toMatch(/player_id\s+INTEGER REFERENCES campaign_players\(id\) ON DELETE CASCADE/);
  });
});

describe('state', () => {
  const patch = route("app.patch('/api/campaigns/:campaignId/paths/:itemId/state'");

  it('has its own route, so flipping one cannot blank a title', () => {
    expect(patch).toMatch(/SET state=\$1/);
    expect(patch).not.toMatch(/title=/);
  });

  it('and the edit route cannot move the state, which is the other half', () => {
    /*
     * The pair only works in both directions. Editing a title must not
     * reset a card the DM has already marked done, and an earlier version
     * of this file only checked the PATCH side.
     */
    const put = route("app.put('/api/campaigns/:campaignId/paths/:itemId'");
    expect(put).toMatch(/SET title=\$1, body=\$2/);
    expect(put).not.toMatch(/state=/);
  });

  it('cascades on done, and only on done', () => {
    // A gift that has been given does not leave three conditions open. The
    // others are per-card: a parent is in-progress because one child is.
    expect(patch).toMatch(/const cascade = state === 'done';/);
    expect(patch).toMatch(/AND \(\$4 OR id = \$2\)/);
  });

  it('is bounded, because parent_id is a tree by construction only', () => {
    expect(patch).toMatch(/WITH RECURSIVE sub AS/);
    expect(patch).toMatch(/sub\.depth < 50/);
  });

  it('returns every row it changed, so the page can patch in place', () => {
    expect(patch).toMatch(/res\.json\(\{ updated: r\.rows \}\)/);
  });

  it('and rejects an unknown one', () => {
    expect(patch).toMatch(/Unknown state/);
  });
});

describe('the page', () => {
  const panel = readFileSync(path.join(root, 'frontend/src/pages/Evolution/EvolutionPanel.jsx'), 'utf8');
  const consts = readFileSync(path.join(root, 'frontend/src/pages/Evolution/constants.js'), 'utf8');
  const tabs = readFileSync(path.join(root, 'frontend/src/pages/ManageCampaigns/constants.js'), 'utf8');

  it('is a tab of Manage Campaigns, which is DM-only as a whole', () => {
    expect(tabs).toMatch(/\{ id: 'evolution',/);
  });

  it('destructures useToast and does not destructure useConfirm', () => {
    // The pair that looks alike; see hookContracts.test.js.
    expect(panel).toMatch(/const \{ toast \} = useToast\(\)/);
    expect(panel).toMatch(/const confirm = useConfirm\(\)/);
  });

  it('says out loud that no player can see it', () => {
    expect(panel).toMatch(/no player-facing view/);
  });

  it('treats "the party" as a selection, not a special case', () => {
    /*
     * `undefined` means "not chosen yet" precisely because `null` is a
     * real, selectable value — using null for both would make the party
     * unselectable.
     */
    expect(panel).toMatch(/const \[who, setWho\] = useState\(undefined\)/);
    expect(panel).toMatch(/who === undefined \? \(roster\[0\]\?\.id \?\? null\) : who/);
    expect(consts).toMatch(/playerId == null \? i\.player_id == null/);
  });

  it('patches in place rather than reloading, on state and on delete', () => {
    // Reloading collapses every open card and jumps to the top.
    const setState = panel.slice(panel.indexOf('setState: async'), panel.indexOf('remove: async'));
    expect(setState).not.toMatch(/load\(\)/);
    expect(setState).toMatch(/setItems\(\(prev\)/);
    const remove = panel.slice(panel.indexOf('remove: async'), panel.indexOf('async function save'));
    expect(remove).not.toMatch(/load\(\)/);
    expect(remove).toMatch(/doomed/);
  });

  it('and offers the three categories', () => {
    for (const id of ['path', 'teacher', 'homebrew']) {
      expect(consts).toMatch(new RegExp(`id: '${id}'`));
    }
  });

  it('calls the third one Homebrew, not Homebrew spells', () => {
    // It holds features and gifts too, and the narrower name was steering
    // what went into it.
    expect(consts).toMatch(/label: '✨ Homebrew'/);
    expect(consts).not.toMatch(/id: 'spell'/);
  });

  it('sorts characters by name and keeps the party last', () => {
    /*
     * The party is appended after the sorted list rather than sorted into
     * it: it is not one of the characters, and a 🎲 landing between two
     * players reads as though it were.
     */
    expect(panel).toMatch(/\.sort\(\(a, b\) =>\s*String\(a\.player_name \?\? ''\)\.localeCompare/);
    const list = panel.indexOf('roster.map((p)');
    const party = panel.indexOf('🎲 The party');
    expect(list).toBeGreaterThan(-1);
    expect(party, 'the party is rendered before the characters').toBeGreaterThan(list);
  });

  it('but NOT "what they have revealed"', () => {
    /*
     * A record of what happened, not a way a character grows — so it is a
     * Campaign Journal entry, DM-only, under its own category. The journal
     * already does that with no code, and this module should not offer a
     * second place to put it.
     */
    expect(consts).not.toMatch(/id: 'revealed'/);
    expect(source).not.toMatch(/'revealed'\]/);
  });

  it('and the narrowing reaches a database that already has the table', () => {
    // A CHECK inside CREATE TABLE IF NOT EXISTS never does.
    expect(source).toMatch(/DROP CONSTRAINT IF EXISTS character_paths_category_check/);
    expect(source).toMatch(/ADD CONSTRAINT character_paths_category_check/);
    // Notes that predate either change are moved, not dropped.
    expect(source).toMatch(/UPDATE character_paths SET category='path' WHERE category='revealed'/);
    expect(source).toMatch(/UPDATE character_paths SET category='homebrew' WHERE category='spell'/);
    expect(source).not.toMatch(/DELETE FROM character_paths WHERE category=/);
  });

  it('and drops the old constraint BEFORE moving the rows', () => {
    /*
     * Adding the new CHECK before the rows move would fail on exactly the
     * rows the migration exists to rescue.
     */
    const drop = source.indexOf('DROP CONSTRAINT IF EXISTS character_paths_category_check');
    const move = source.indexOf("UPDATE character_paths SET category='homebrew'");
    const add = source.indexOf('ADD CONSTRAINT character_paths_category_check');
    expect(drop).toBeLessThan(move);
    expect(move).toBeLessThan(add);
  });
});
