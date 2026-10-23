/**
 * test/campaignBundle.test.js
 *
 * What the campaign bundle carries, beyond the gear that campaignGear.test.js
 * already covers.
 *
 * Two things were silently missing. The NPC detail fields — description,
 * public/private notes, visibility and current location — were added to the
 * table but never to the bundle, so a backup/restore destroyed them. And the
 * Campaign Journal had never been in the bundle at all, which meant every
 * backup ever taken was missing a whole feature.
 *
 * Neither was caught because nothing asserted WHICH tables the export covers.
 * This file is that assertion. It is static source analysis, like the rest of
 * the backend suite; the live round-trip lives in campaignRoundTrip.live.test.js.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(path.join(root, 'app.js'), 'utf8');

/** A handler's body with comments stripped — assertions about CODE. */
function handlerCode(method, routePath) {
  const needle = `app.${method}('${routePath}'`;
  const start = source.indexOf(needle);
  expect(start, `route not found: ${method} ${routePath}`).toBeGreaterThan(-1);
  return source.slice(start, source.indexOf('\n});', start))
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

/** The same slice WITH its comments — for the one assertion about prose. */
function rawHandler(method, routePath) {
  const needle = `app.${method}('${routePath}'`;
  const start = source.indexOf(needle);
  expect(start, `route not found: ${method} ${routePath}`).toBeGreaterThan(-1);
  return source.slice(start, source.indexOf('\n});', start));
}

const exp = handlerCode('get', '/api/campaigns/:id/export');
const imp = handlerCode('post', '/api/campaigns/import');

describe('the export carries the NPC fields', () => {
  it('selects all of them, not just the name', () => {
    expect(exp).toMatch(/SELECT n\.id, n\.name, n\.description, n\.public_info, n\.private_info, n\.is_public,\s*\n\s*n\.current_location_id, s\.stats_json/);
    expect(exp, 'the old name-only query is still there')
      .not.toMatch(/SELECT id, name FROM campaign_npcs/);
  });

  it('emits the location as a symbolic ref, never an id', () => {
    // A raw id is meaningless in the new campaign and would point at whatever
    // row happens to hold that number — the whole reason the bundle is
    // ref-based. `locRefById` also carries the `__2` suffix that tells two
    // same-named locations apart.
    expect(exp).toMatch(/current_location_ref: n\.current_location_id/);
    expect(exp).toMatch(/locRefById\[n\.current_location_id\]/);
    expect(exp).not.toMatch(/current_location_id: n\.current_location_id/);
  });

  it('emits is_public raw, so absent and false stay distinguishable', () => {
    // `is_public: n.is_public || false` would erase the difference, and the
    // import needs it to keep an old bundle's NPCs hidden.
    expect(exp).toMatch(/is_public: n\.is_public,/);
  });
});

describe('the export carries the Journal', () => {
  it('queries it at all', () => {
    expect(exp).toMatch(/FROM campaign_journal_entries j/);
  });

  it('includes DM-only entries — this is the DM\'s own backup', () => {
    const q = exp.slice(exp.indexOf('FROM campaign_journal_entries'));
    expect(q.slice(0, 400)).not.toMatch(/dm_only\s*=\s*false/);
  });

  it('reads the author\'s username, not their user id', () => {
    expect(exp).toMatch(/u\.username AS author_username/);
    expect(exp).toMatch(/JOIN users u ON u\.id = j\.created_by/);
  });

  it('emits refs and no raw foreign keys', () => {
    const block = exp.slice(exp.indexOf('campaign_journal:'), exp.indexOf('campaign_diary:'));
    expect(block).toMatch(/player_ref:/);
    expect(block).toMatch(/location_ref:/);
    expect(block).not.toMatch(/location_id:/);
    expect(block).not.toMatch(/player_id:/);
    expect(block).not.toMatch(/created_by/);
  });
});

describe('the import seats NPCs after locations', () => {
  it('locations are inserted first', () => {
    // THE assertion that pins the design. An NPC's current_location_ref can
    // only resolve once locIdByRef exists, and the fix was to reorder rather
    // than add a pass — so a careless re-shuffle has to fail here.
    const locs = imp.indexOf('INSERT INTO campaign_locations');
    const npcs = imp.indexOf('INSERT INTO campaign_npcs');
    expect(locs).toBeGreaterThan(-1);
    expect(npcs).toBeGreaterThan(-1);
    expect(locs, 'NPCs are inserted before locations again').toBeLessThan(npcs);
  });

  it('and no second pass crept back in', () => {
    // Every create-then-UPDATE in this handler marks a CYCLE. An NPC's
    // location is not one, so an UPDATE here would be noise that makes the
    // marker meaningless — and two statements per NPC instead of one.
    expect(imp).not.toMatch(/UPDATE campaign_npcs/);
  });

  it('resolves the location through the ref map', () => {
    expect(imp).toMatch(/locIdByRef\[ref\] \?\? null/);
  });
});

describe('an old bundle\'s NPCs stay hidden', () => {
  /** Just the NPC insert — locations legitimately use `!== false` nearby. */
  const npcBlock = imp.slice(imp.indexOf('INSERT INTO campaign_npcs'),
    imp.indexOf('4. Users lookup'));

  it('is_public is tested with === true, not !== false', () => {
    // The asymmetry with locations is the whole point: a location defaults to
    // visible because it always was, an NPC has never been visible at all. An
    // absent key must mean hidden, or restoring a pre-NPC backup publishes
    // every NPC in the campaign at once.
    expect(npcBlock).toMatch(/is_public === true/);
    expect(npcBlock).not.toMatch(/is_public !== false/);
  });

  it('while locations keep their own rule', () => {
    expect(imp).toMatch(/l\.is_public !== false/);
  });

  it('a conflicting name updates every field, not just the name', () => {
    // `SET name=EXCLUDED.name` alone would keep the FIRST row's fields.
    for (const col of ['description', 'public_info', 'private_info', 'is_public', 'current_location_id']) {
      expect(npcBlock, `${col} is not in the ON CONFLICT set`)
        .toMatch(new RegExp(`${col}=EXCLUDED\\.${col}`));
    }
  });
});

describe('the journal import', () => {
  const block = imp.slice(imp.indexOf('INSERT INTO campaign_journal_entries') - 1200);

  it('is defaulted in the destructure, so a v5 bundle still imports', () => {
    expect(imp).toMatch(/campaign_journal = \[\]/);
  });

  it('uses journalDay, so in-game day ZERO survives', () => {
    // `e.in_game_day || null` is the easy bug: the absolute-day epoch puts
    // year 1 day 1 at zero, so a falsy test deletes a real date.
    expect(block).toMatch(/journalDay\(e\.in_game_day\)/);
    expect(imp).not.toMatch(/in_game_day \|\|/);
  });

  it('COALESCEs created_at rather than passing a bare null', () => {
    // A null parameter STORES null; a column DEFAULT only fires when the
    // column is omitted. A null created_at scrambles the read-back order.
    expect(block).toMatch(/COALESCE\(\$10::timestamp, CURRENT_TIMESTAMP\)/);
  });

  it('fences the resolved author to members of this campaign', () => {
    // created_by governs edit rights, so a bare username match would hand
    // them to a stranger who happens to share a name on this server.
    expect(block).toMatch(/memberUserIds\.has\(uid\)/);
    expect(block).toMatch(/: req\.session\.userId/);
    expect(imp).toMatch(/memberUserIds\.add\(uid\)/);
  });

  it('preserves dm_only', () => {
    expect(block).toMatch(/e\.dm_only === true/);
  });

  it('reports how many entries landed', () => {
    expect(imp).toMatch(/journal: journalAdded/);
  });
});

describe("an NPC's stat block travels with it", () => {
  it('the export joins the sheet rather than making a second pass', () => {
    // Most NPCs have none; the ones that do are the reason a restore must
    // not lose them.
    expect(exp).toMatch(/LEFT JOIN npc_sheets s ON s\.npc_id = n\.id/);
  });

  it('and emits `sheet` only when there IS one', () => {
    // Absent, not null: the import has to tell "no stat block" from "an
    // empty one", the same distinction the GET route makes with `exists`.
    expect(exp).toMatch(/\.\.\.\(n\.stats_json \? \{ sheet: n\.stats_json \} : \{\}\)/);
  });

  it('the import validates it, like any other write to that column', () => {
    // A bundle is a file a person can edit, so it is no more trusted here
    // than a request body is on the PUT.
    expect(imp).toMatch(/INSERT INTO npc_sheets \(npc_id, stats_json\)/);
    expect(imp).toMatch(/JSON\.stringify\(validateStats\(sheet\)\)/);
  });

  it('and leaves an existing sheet alone when the key is absent', () => {
    /*
     * An import can target a campaign that already exists. A bundle
     * written before sheets existed carries no `sheet` key, and must not
     * be read as "delete the stat block that is there".
     */
    expect(imp).toMatch(/if \(sheet && typeof sheet === 'object' && !Array\.isArray\(sheet\)\)/);
  });
});

describe('surveys travel with their history', () => {
  it('the export carries the runs and the answers, not just the questions', () => {
    // A restored campaign whose surveys had no past would be a survey tool
    // with the point taken out.
    expect(exp).toMatch(/surveys: surveysOut/);
    expect(source).toMatch(/async function surveysForExport\(campaignId, playerRefById\)/);
    expect(source).toMatch(/FROM campaign_survey_answers a/);
  });

  it('answers point at a question by INDEX, never by id', () => {
    /*
     * Ids are regenerated on import, and `position` is a column the DM can
     * reorder. The index into the emitted array is true by construction.
     */
    expect(source).toMatch(/const indexOfQ = new Map\(questions\.map\(\(q, i\) => \[q\.id, i\]\)\)/);
    expect(source).toMatch(/\{ q: indexOfQ\.get\(a\.question_id\), score: a\.score/);
  });

  it('and anonymity survives the round trip rather than being re-applied', () => {
    // The response carries a name only where one was stored.
    expect(source).toMatch(/player_ref: p\.player_id \? \(playerRefById\[p\.player_id\] \|\| null\) : null/);
  });

  it('the import cleans every prompt and label, like the live route', () => {
    expect(source).toMatch(/const q = surveyQuestion\(incoming\[i\], i\)/);
    expect(source).toMatch(/surveyStr\(s\?\.title, 255\)/);
  });

  it('a score outside its own scale is dropped, not fatal', () => {
    // One bad cell in a year of history is not worth failing a restore.
    expect(source).toMatch(/if \(Number\.isFinite\(n\) && n >= q\.scale_min && n <= q\.scale_max\) score = n;/);
  });

  it('and surveys are imported AFTER the players they name', () => {
    expect(imp.indexOf('importSessionList')).toBeLessThan(imp.indexOf('importSurveyList'));
    expect(imp).toMatch(/importSurveyList\(\s*\n?\s*client, newId, req\.session\.userId, surveys, playerIdByRef\)/);
  });

  it('an older bundle lands zero of them rather than erroring', () => {
    expect(imp).toMatch(/surveys = \[\]/);
  });
});

describe('the bundle version', () => {
  it('is 10', () => {
    // 6 added the NPC detail fields and the journal; 7 the session prep;
    // 8 each NPC's stat block; 9 the surveys, with their whole history;
    // 10 a file that may be PARTIAL, naming its `parts`. Documentary only
    // — see the next test.
    expect(exp).toMatch(/version: 10/);
  });

  it('is never read by the import', () => {
    // Compatibility here is field-driven, not version-driven — every new key
    // is additive and defaulted. A version branch would need a fixture per
    // version that nobody keeps, so it would rot untested and eventually
    // reject a bundle the defaults would have loaded fine.
    expect(imp).not.toMatch(/bundle\.version/);
  });
});

describe('importing into a campaign that already exists', () => {
  const into = handlerCode('post', '/api/campaigns/:campaignId/import-into');

  it('is the DM\'s, and only for a campaign they own', () => {
    expect(into).toMatch(/requireRole\(\['dm', 'admin'\]\)/);
    expect(into).toMatch(/await dmOwnsCampaign\(/);
  });

  it('touches only the sections the file carries', () => {
    // A file with just NPCs must leave locations, the diary and the journal
    // exactly as they were — hence Array.isArray per section rather than a
    // default of [], which would read as "replace with nothing".
    for (const key of ['locations', 'npcs', 'campaign_journal', 'campaign_diary']) {
      expect(into, `${key} is not guarded`).toMatch(new RegExp(`Array\\.isArray\\(bundle\\.${key}\\)`));
    }
    expect(into).not.toMatch(/bundle\.npcs \|\| \[\]/);
  });

  it('matches by NAME so a row keeps its id', () => {
    // Keeping the id is what keeps journey-map pins, `npc_<id>` timeline
    // actors and cross-connections pointing at the right thing. An
    // insert-after-delete would renumber everything.
    expect(into).toMatch(/ON CONFLICT \(campaign_id, LOWER\(name\)\) DO UPDATE SET/);
  });

  it('never deletes an NPC something still points at', () => {
    // Neither referrer is a foreign key the database would protect:
    // character_relationships holds a bare id beside a type, and a
    // timeline's actors are `npc_<id>` strings inside a text[].
    expect(into).toMatch(/from_entity_type='npc'/);
    expect(into).toMatch(/\$3 = ANY\(player_ids\)/);
    expect(into).toMatch(/if \(used\.rows\.length\) \{ kept\.push\(row\.name\); continue; \}/);
  });

  it('refuses to touch players, maps or gear', () => {
    // Replacing a player means deleting their sheet, stats, relationships
    // and timelines — far past what an import should do unasked.
    expect(into).toMatch(/report\.skipped\.push\(why\)/);
    expect(into).not.toMatch(/DELETE FROM campaign_players/);
    expect(into).not.toMatch(/INSERT INTO pc_characters/);
    expect(into).not.toMatch(/DELETE FROM journey_maps/);
  });

  it('is one transaction', () => {
    expect(into).toMatch(/await client\.query\('BEGIN'\)/);
    expect(into).toMatch(/ROLLBACK/);
  });

  it('reports what each section did', () => {
    // The caller showed a confirmation naming counts; it has to be able to
    // check that against what actually happened.
    expect(into).toMatch(/report\.npcs = \{ added, updated, removed, kept \}/);
  });
});

describe('credentials never travel', () => {
  it('invites are in neither handler', () => {
    expect(handlerCode('get', '/api/campaigns/:id/export')).not.toMatch(/campaign_invites/);
    expect(imp).not.toMatch(/campaign_invites/);
  });

  it('and the export says WHY, so nobody adds them later', () => {
    // The diary share token and journey_trackers both have such a note; this
    // one was the only silent exclusion.
    expect(rawHandler('get', '/api/campaigns/:id/export')).toMatch(/campaign_invites/);
  });
});

describe('exporting part of a campaign — the route', () => {
  it('validates ?parts= before running a single query', () => {
    // A typo on a curl command must not export less than was meant.
    expect(exp.indexOf('const sel = resolveParts(req.query.parts)'))
      .toBeLessThan(exp.indexOf('try {'));
    expect(exp).toMatch(/if \(sel\.unknown\.length\) \{\s*\n\s*return res\.status\(400\)/);
  });

  it('builds the whole bundle once and selects from it', () => {
    // One shape, so the pure selection in lib/campaignParts.js is the only
    // thing that decides what a partial file contains.
    expect(exp).toMatch(/const full = \{/);
    expect(exp).toMatch(/const out = selectParts\(full, sel\.parts\)/);
  });

  it('and says which parts it added because something needed them', () => {
    expect(exp).toMatch(/if \(sel\.added\.length\) out\.parts_added = sel\.added;/);
  });

  it('the catalogue is served, so there is one list', () => {
    expect(source).toMatch(/app\.get\('\/api\/campaign-export-parts', requireRole\(\['dm', 'admin'\]\)/);
  });
});

describe('an unresolved timeline actor is dropped, not stored raw', () => {
  it('resolveToken answers null when a name does not resolve', () => {
    /*
     * It returned the token unchanged, so `npc_Grathul` landed where an
     * `npc_<id>` belongs. Full exports never triggered it; a partial one —
     * timelines without their NPCs — would have every time. Verified live:
     * with the old fallback put back, `npc_Grathul` is stored.
     */
    const fn = imp.slice(imp.indexOf('const resolveToken = (tok) => {'), imp.indexOf('for (const { playerId, timelines } of playerPassB)'));
    for (const p of ['self', 'cp', 'rel', 'npc']) {
      expect(fn, p).toMatch(new RegExp(`return [a-z]+ \\? \`${p}_\\$\\{[a-z]+\\}\` : null;`));
    }
  });

  it('and BOTH call sites drop the nulls', () => {
    // The second one is wrapped in its own lambda for dm_self; missing it
    // would have put NULLs into a text[] instead.
    expect(imp).toMatch(/\.map\(resolveToken\)\.filter\(Boolean\)/);
    expect(imp).toMatch(/return resolveToken\(tok\);\s*\n\s*\}\)\.filter\(Boolean\)/);
  });
});

describe('import-into stops dropping things without a word', () => {
  const into = (() => {
    const at = source.indexOf("app.post('/api/campaigns/:campaignId/import-into'");
    return source.slice(at, source.indexOf('\n});', at));
  })();

  it("names Char Tree connections among what it will not merge", () => {
    expect(into).toMatch(/\['cross_connections', 'Char Tree connections'\]/);
  });

  it('brings NPC stat blocks, through the validator, only when the key is present', () => {
    expect(into).toMatch(/RETURNING id`,\s*\n\s*\[cid, name,/);
    expect(into).toMatch(/const sheet = typeof n === 'string' \? null : n\?\.sheet;/);
    expect(into).toMatch(/\[up\.rows\[0\]\.id, JSON\.stringify\(validateStats\(sheet\)\)\]/);
  });

  it("resolves a location name against what the campaign ALREADY has", () => {
    /*
     * The case partial export exists for: NPCs from one group, merged into
     * a campaign with the same world. Without this, every one of them had
     * its location wiped, because the file carried no locations to match.
     */
    expect(into).toMatch(/const locIdByRef = Object\.fromEntries\(\(await client\.query\(\s*\n\s*'SELECT id, name FROM campaign_locations WHERE campaign_id=\$1'/);
  });

  it('ADDS surveys, never replaces them, and skips one already here', () => {
    // Replacing would delete runs and answers — the history.
    expect(into).toMatch(/const fresh = bundle\.surveys\.filter\(\(sv\) => sv\?\.title && !have\.has/);
    expect(into).toMatch(/report\.surveys = \{ added, skipped_existing: dup \}/);
    expect(into).not.toMatch(/DELETE FROM campaign_surveys/);
  });
});

describe('importing under a name already in use', () => {
  it('is refused, with a free name to suggest', () => {
    expect(imp).toMatch(/if \(await campaignNameTaken\(client, req\.session\.userId, name\)\)/);
    expect(imp).toMatch(/code: 'NAME_TAKEN', suggestion/);
  });

  it('compares the way a person would — case and spaces ignored', () => {
    expect(source).toMatch(/AND LOWER\(TRIM\(name\)\) = LOWER\(TRIM\(\$2\)\)/);
  });

  it('only among campaigns you can see, and only your own', () => {
    // The Trash is not selectable, and another DM's "Leruhy" is not yours.
    const fn = source.slice(source.indexOf('async function campaignNameTaken'), source.indexOf('async function freeCampaignName'));
    expect(fn).toMatch(/WHERE dm_user_id = \$1 AND deleted_at IS NULL/);
  });

  it('checked INSIDE the transaction, under a lock, so two at once cannot both pass', () => {
    /*
     * There is no unique index — existing installs may hold duplicates an
     * index would refuse to build on — so the lock is what makes this hold.
     * Verified live: two simultaneous imports, one 200 and one 409.
     */
    expect(imp.indexOf('await lockCampaignNames(client, req.session.userId)'))
      .toBeLessThan(imp.indexOf('campaignNameTaken(client'));
    expect(imp.indexOf("query('BEGIN')")).toBeLessThan(imp.indexOf('lockCampaignNames'));
    expect(source).toMatch(/pg_advisory_xact_lock\(hashtext\('campaign-names'\), \$1\)/);
  });
});

describe('replacing a campaign with a file', () => {
  it('trashes the old one in the SAME transaction as the import', () => {
    // So an import that fails halfway leaves it exactly where it was.
    // Verified live with a file whose location name overflows its column.
    const trash = imp.indexOf('UPDATE campaigns SET deleted_at = NOW()');
    expect(trash).toBeGreaterThan(imp.indexOf("query('BEGIN')"));
    expect(trash).toBeLessThan(imp.indexOf("query('COMMIT')"));
  });

  it('only one of your own, and only a live one', () => {
    expect(imp).toMatch(/WHERE id = \$1 AND dm_user_id = \$2 AND deleted_at IS NULL/);
  });

  it('Trash, not purge — the replace can be undone', () => {
    expect(imp).not.toMatch(/DELETE FROM campaigns/);
  });

  it('and the name check comes AFTER the trash', () => {
    // Otherwise replacing "Leruhy" with a file called "Leruhy" clashes
    // with the very campaign it is replacing.
    expect(imp.indexOf('UPDATE campaigns SET deleted_at = NOW()'))
      .toBeLessThan(imp.indexOf('campaignNameTaken(client'));
  });
});

describe('restoring from the Trash', () => {
  const restore = (() => {
    const at = source.indexOf("app.post('/api/campaigns/:id/restore'");
    return source.slice(at, source.indexOf('\n});', at));
  })();

  it('renames rather than refuses when the name is taken', () => {
    /*
     * Restore is the undo for a replace, and the replace took the name —
     * so this collides every time it matters. Refusing would make the undo
     * unusable exactly then.
     */
    expect(restore).toMatch(/renamed = await freeCampaignName\(client, req\.session\.userId, row\.name, id\)/);
    expect(restore).toMatch(/renamed_to: renamed/);
  });
});

describe('the import dialog', () => {
  const hook = readFileSync(path.join(root, 'frontend/src/hooks/useManageCampaigns.js'), 'utf8');
  const dialog = readFileSync(path.join(root, 'frontend/src/pages/ManageCampaigns/ImportChoiceDialog.jsx'), 'utf8');

  it('replaces a WHOLE file, but only merges a partial one', () => {
    // Replacing a campaign with a slice of one would destroy everything the
    // slice does not carry.
    expect(dialog).toMatch(/\{sameName && !isPartial && \(/);
    expect(dialog).toMatch(/\{sameName && isPartial && \(/);
  });

  it('will not create one under a name already taken', () => {
    expect(dialog).toMatch(/disabled=\{!name\.trim\(\) \|\| taken\}/);
  });

  it('asks again with the server\'s suggestion when the server refuses', () => {
    // The list on the page can be stale; the server has the last word.
    expect(hook).toMatch(/if \(e\.code === 'NAME_TAKEN'\) \{\s*\n\s*suggestion = e\.body\?\.suggestion \?\? null;/);
    expect(hook).toMatch(/continue;/);
  });

  it('asks nothing when nothing clashes and no campaign is open', () => {
    expect(hook).toMatch(/const choice = \(!sameName && !selected\)\s*\n\s*\? \{ action: 'new', name: fileName \}/);
  });

  it('and the API client keeps the body a refusal came with', () => {
    expect(readFileSync(path.join(root, 'frontend/src/api/client.js'), 'utf8')).toMatch(/err\.body {3}= body;/);
  });
});
