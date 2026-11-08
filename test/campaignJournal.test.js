/**
 * test/campaignJournal.test.js
 *
 * The Campaign Journal is shared notes: every player writes, the whole table
 * reads, and the DM can write one nobody else sees.
 *
 * The thing worth guarding is the withholding. A `dm_only` entry must never
 * reach a player, and the house rule here is that it is filtered in SQL rather
 * than hidden by a component — a row that was never selected cannot leak
 * through a refactor of the UI. Same discipline as the diary's draft filter
 * and the inventory's omission of `evolves_from`.
 *
 * There is a second, quieter leak: a location the DM has since made private.
 * The entry naming it survives, but its NAME must stop showing to players,
 * including on entries written while it was still public.
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

const list = handlerCode('get', '/api/campaigns/:campaignId/journal');
const create = handlerCode('post', '/api/campaigns/:campaignId/journal');
const edit = handlerCode('put', '/api/campaigns/:campaignId/journal/:entryId');
const del = handlerCode('delete', '/api/campaigns/:campaignId/journal/:entryId');

describe('a player never receives a DM-only entry', () => {
  it('filters them out in SQL, not in the component', () => {
    expect(list).toMatch(/AND \(j\.dm_only = false OR j\.visible_to = ANY\(\$2::int\[\]\)\)/);
  });

  it('does not even select the column for a player', () => {
    // Nothing to leak if it was never fetched.
    expect(list).toMatch(/\$\{isDM \? 'j\.dm_only,' : ''\}/);
  });

  it('decides from the campaign, not from anything the client sent', () => {
    expect(list).toMatch(/isCampaignDm\(campaignId, req\.session\.userId, req\.session\.role\)/);
  });
});

describe('an entry written for one player', () => {
  const helper = source.slice(source.indexOf('async function journalVisibility('),
    source.indexOf('async function mySeats('));
  const seats = source.slice(source.indexOf('async function mySeats('),
    source.indexOf('\n}\n', source.indexOf('async function mySeats(')));

  it('reaches that player only — their own seats, from the session', () => {
    expect(list).toMatch(/const seats = isDM \? \[\] : await mySeats\(campaignId, req\.session\.userId\)/);
    expect(seats).toMatch(/cua\.user_id=\$2/);
    expect(list).toMatch(/isDM \? \[campaignId\] : \[campaignId, seats\]/);
  });

  it('is a refinement of dm_only, so anything that forgets it fails closed', () => {
    // Public is dm_only=false; a one-player entry is dm_only=true plus a seat.
    // Every older `dm_only = false` filter therefore hides it.
    expect(source).toMatch(/CHECK \(visible_to IS NULL OR dm_only\)/);
    expect(source).toMatch(/visible_to INTEGER\s+REFERENCES campaign_players\(id\) ON DELETE SET NULL/);
  });

  it('can only be set by the DM, and only to a player of this campaign', () => {
    expect(helper).toMatch(/if \(!isDM \|\| !dmOnly\) return \{ dmOnly: false, visibleTo: null \}/);
    expect(helper).toMatch(/WHERE id=\$1 AND campaign_id=\$2 AND is_dm_player = false/);
    for (const [name, code] of [['create', create], ['edit', edit]]) {
      expect(code, name).toMatch(/journalVisibility\(campaignId, isDM, dmOnly, visibleTo\)/);
      expect(code, name).toMatch(/if \(vis === false\) return res\.status\(400\)/);
      expect(code, name).toMatch(/vis\.dmOnly, vis\.visibleTo/);
    }
  });

  it('travels in the bundle as a player ref, and stays hidden if it does not resolve', () => {
    expect(source).toMatch(/visible_to_ref: e\.visible_to \? \(playerRefById\[e\.visible_to\] \|\| null\) : null/);
    const n = source.match(/e\.dm_only === true && e\.visible_to_ref \? \(playerIdByRef\[e\.visible_to_ref\] \?\? null\) : null/g);
    expect(n, 'both journal imports').toHaveLength(2);
  });
});

describe('the player an entry is for can make it public', () => {
  const pub = handlerCode('patch', '/api/campaigns/:campaignId/journal/:entryId/make-public');

  it('only for their own seats, only on an entry still for one of them', () => {
    expect(pub).toMatch(/const seats = await mySeats\(campaignId, req\.session\.userId\)/);
    expect(pub).toMatch(/WHERE id=\$1 AND campaign_id=\$2 AND dm_only AND visible_to = ANY\(\$3::int\[\]\)/);
  });

  it('only towards public, and the seat goes with it', () => {
    expect(pub).toMatch(/SET dm_only=false, visible_to=NULL,/);
    // Nothing the caller sends is read: it cannot set anything else.
    expect(pub).not.toMatch(/req\.body/);
  });

  it('does not confirm an entry the caller cannot read exists', () => {
    expect(pub).toMatch(/if \(!r\.rows\.length\) return res\.status\(404\)/);
    expect(pub).toMatch(/canAccessCampaign/);
  });

  it('is offered to the player only, and asked first', () => {
    const panel = readFileSync(path.join(root, 'frontend/src/pages/Journal/JournalPanel.jsx'), 'utf8');
    expect(panel).toMatch(/extra=\{\(e\) => \(!isDM && e\.visible_to \? \(/);
    expect(panel).toMatch(/You cannot make it private again/);
  });
});

describe('a private location stops showing its name', () => {
  it('guards the location name for players', () => {
    // The entry survives a location being hidden; the place it names does not.
    expect(list).toMatch(/CASE WHEN cl\.is_public THEN cl\.name ELSE NULL END/);
  });

  it('withholds the location id as well as the name', () => {
    // Leaving the id behind would still let a player tell that two entries
    // happened at the same secret place.
    expect(list).toMatch(/CASE WHEN cl\.is_public THEN j\.location_id ELSE NULL END AS location_id/);
    expect(list).not.toMatch(/^\s*j\.created_by, j\.player_id, j\.location_id,/m);
  });

  it('refuses a location the author cannot see', () => {
    // Naming a private location would be guessing at an id; accepting it would
    // confirm the guess.
    const fn = source.slice(source.indexOf('async function resolveJournalLocation'));
    expect(fn).toMatch(/AND is_public = true/);
    expect(fn).toMatch(/isDM \? '' :/);
  });
});

describe('who may do what', () => {
  it('requires campaign membership on every route', () => {
    for (const [name, h] of [['list', list], ['create', create], ['edit', edit], ['delete', del]]) {
      expect(h, `${name} does not check canAccessCampaign`).toMatch(/canAccessCampaign/);
    }
  });

  it('only lets the DM mark an entry DM-only', () => {
    // A player posting something the table cannot see would be a diary, and
    // they already have one.
    // journalVisibility returns a public entry for anyone who is not the DM.
    expect(create).toMatch(/journalVisibility\(campaignId, isDM, dmOnly, visibleTo\)/);
    expect(edit).toMatch(/journalVisibility\(campaignId, isDM, dmOnly, visibleTo\)/);
  });

  it('lets only the author edit', () => {
    expect(edit).toMatch(/Number\(entry\.created_by\) !== Number\(req\.session\.userId\)/);
    expect(edit).toMatch(/Only the author can edit/);
  });

  it('lets the author or the DM delete', () => {
    expect(del).toMatch(/!isDM && Number\(entry\.created_by\) !== Number\(req\.session\.userId\)/);
  });

  it('never lets the DM rewrite somebody else’s words', () => {
    // Deliberate asymmetry: the DM can remove an entry but not change it, so
    // the authorship condition itself must carry no escape hatch. Read the one
    // condition, not the whole handler: the handler mentions isDM further down
    // for the location check, and a loose slice would pass either way.
    const cond = edit.split('\n').find(l => l.includes('entry.created_by'));
    expect(cond).toBeTruthy();
    expect(cond).not.toMatch(/isDM/);
    // Delete, by contrast, must have exactly that escape hatch.
    expect(del.split('\n').find(l => l.includes('entry.created_by'))).toMatch(/isDM/);
  });
});

describe('the entry itself', () => {
  it('records the author as a user and the character separately', () => {
    // The DM has no character, and a player's note stays theirs if they swap.
    expect(create).toMatch(/created_by/);
    expect(create).toMatch(/player_id/);
    expect(list).toMatch(/u\.username AS author_username/);
    expect(list).toMatch(/cp\.player_name AS author_character/);
  });

  it('stores the in-game date as an absolute day, bounded', () => {
    const fn = source.slice(source.indexOf('const journalDay'));
    // `>= 0`, not `> 0`: the timelines' epoch puts year 1 day 1 at zero, so a
    // `> 0` bound would silently drop a legitimate date.
    expect(fn.slice(0, 400)).toMatch(/n >= 0 && n < 3650000/);
  });

  it('files under a free-text category, capped like the diary\u2019s', () => {
    expect(create).toMatch(/journalStr\(category, 120\)/);
    expect(edit).toMatch(/journalStr\(category, 120\)/);
    expect(list).toMatch(/j\.category/);
  });

  it('reads forward in in-game date order, not as a feed', () => {
    // The diary reads oldest-first and so should this; an entry with no
    // in-game date has not been placed in the story, so it collects at the end.
    expect(list).toMatch(/ORDER BY j\.in_game_day ASC NULLS LAST, j\.created_at ASC/);
  });

  it('refuses an entry with neither title nor body', () => {
    expect(create).toMatch(/needs a title or a body/);
  });

  it('caps what it stores', () => {
    expect(create).toMatch(/journalStr\(title, 255\)/);
    expect(create).toMatch(/journalStr\(body, 50000\)/);
  });
});

describe('the schema', () => {
  const ddl = source.slice(source.indexOf('CREATE TABLE IF NOT EXISTS campaign_journal_entries'));

  it('keeps notes when their location is deleted', () => {
    // SET NULL, not CASCADE: deleting a place must not delete what was written
    // about it.
    expect(ddl.slice(0, 1400)).toMatch(/location_id\s+INTEGER REFERENCES campaign_locations\(id\) ON DELETE SET NULL/);
  });

  it('keeps notes when the author stops playing that character', () => {
    expect(ddl.slice(0, 1400)).toMatch(/player_id\s+INTEGER REFERENCES campaign_players\(id\) ON DELETE SET NULL/);
  });

  it('goes with the campaign', () => {
    expect(ddl.slice(0, 1400)).toMatch(/campaign_id\s+INTEGER NOT NULL REFERENCES campaigns\(id\) ON DELETE CASCADE/);
  });

  it('adds the category column to a database that already exists', () => {
    // A column added inside CREATE TABLE IF NOT EXISTS never reaches one.
    expect(source).toMatch(
      /ALTER TABLE campaign_journal_entries\s*\n\s*ADD COLUMN IF NOT EXISTS category VARCHAR\(120\)/,
    );
  });

  it('defaults to shared', () => {
    expect(ddl.slice(0, 1400)).toMatch(/dm_only\s+BOOLEAN NOT NULL DEFAULT false/);
  });

  it('indexes the way it is read', () => {
    expect(source).toMatch(/idx_journal_campaign[\s\S]{0,120}campaign_id, created_at DESC/);
  });
});

describe('the journal page', () => {
  const panel = readFileSync(path.join(root, 'frontend/src/pages/Journal/JournalPanel.jsx'), 'utf8');
  it('lists groups by name however they are grouped', () => {
    const groupBy = panel.slice(panel.indexOf('const GROUP_BY = {'), panel.indexOf('/** Everything the search box looks through.'));
    expect(groupBy.match(/sortGroups: true/g)).toHaveLength(3);
    expect(groupBy).not.toMatch(/sortGroups: false/);
  });
});
