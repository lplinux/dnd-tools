/**
 * test/campaignParts.test.js
 *
 * Exporting part of a campaign, run for real against a bundle rather than
 * read as text — the selection is a pure function, so nothing here needs a
 * database, and every assertion is about what the FILE contains.
 *
 * The fixture is a small campaign with one of everything, wired the way a
 * real export is: an NPC standing in a location, a journal entry naming a
 * player and a place, timeline actors of every kind, char-tree edges of
 * every shape, and an attributed survey with answers.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { PARTS, resolveParts, selectParts } = require('../lib/campaignParts.js');

const bundle = () => ({
  version: 10, exported_at: '2026-10-23T00:00:00Z', type: 'campaign',
  campaign: { name: 'Leruhy', calendar_type: 'harptos', today_marker: 545000 },
  item_cards: [{ name: 'Sunlight Mirror' }],
  locations: [{ _ref: 'Buldamar', name: 'Buldamar' }],
  npcs: [{ name: 'Grathul', current_location_ref: 'Buldamar', sheet: { ac: '17' } }],
  journey_maps: [{
    name: 'Eltahbar', scope_location_ref: 'Buldamar',
    locations: [{ _ref: 'p1', name: 'Gate', campaign_location_ref: 'Buldamar' }],
  }],
  dm_timelines: [{ name: 'World', entries: [{ title: 'Siege',
    player_id_refs: ['dm_self', 'npc_Grathul', 'cp_Ailysse', 'rel_Ailysse:r1'] }] }],
  sessions: [{ session_no: 26, title: 'Hammer' }],
  party_events: [{ title: 'Left Buldamar' }],
  campaign_diary: [{ title: 'Session 25' }],
  players: [{
    player_name: 'Ailysse', username: 'pat',
    character: { name: 'Ailysse', story: 'Exiled' }, stats_json: { ac: '15' },
    dm_notes: [{ content: 'secret' }],
    relationships: [{ _ref: 'r1', name: 'Mother' }],
    timelines: [{ name: 'Mine', entries: [{ title: 'Born',
      player_id_refs: ['self_Ailysse', 'npc_Grathul', 'rel_Ailysse:r1'] }] }],
    diary: [{ title: 'Day one' }],
    inventory: [{ name: 'Sunlight Mirror', card_ref: 0 }],
  }],
  cross_connections: [
    { from_type: 'npc', from_ref: 'Grathul', to_type: 'npc', to_ref: 'Silent One', label: 'answers to' },
    { from_type: 'npc', from_ref: 'Grathul', to_type: 'player', to_ref: 'Ailysse', label: 'owes' },
    { from_type: 'relationship', from_ref: 'Ailysse:r1', to_type: 'npc', to_ref: 'Grathul', label: 'knows' },
  ],
  campaign_journal: [{ title: 'Rumour', player_ref: 'Ailysse', location_ref: 'Buldamar', author_username: 'pat' }],
  surveys: [{
    title: 'How is it going?', anonymous: false,
    questions: [{ prompt: 'Fun?', kind: 'scale' }],
    runs: [{ label: 'After 25', submitted: ['Ailysse'],
      responses: [{ player_ref: 'Ailysse', answers: [{ q: 0, score: 8 }] }] }],
  }],
});

const pick = (...ids) => selectParts(bundle(), resolveParts(ids).parts);

describe('the catalogue', () => {
  it('names every section the full export carries', () => {
    /*
     * If a new section is added to the export and not here, choosing
     * "everything" in the dialog would silently leave it out. This is the
     * test that notices.
     */
    const full = selectParts(bundle(), resolveParts(null).parts);
    for (const key of Object.keys(bundle())) {
      expect(full, `"${key}" is lost by a full export`).toHaveProperty(key);
    }
  });

  it('splits surveys into questions and results', () => {
    expect(PARTS.map((p) => p.id)).toEqual(expect.arrayContaining(['survey_questions', 'survey_results']));
  });

  it('every requirement points at a real part', () => {
    const ids = new Set(PARTS.map((p) => p.id));
    for (const p of PARTS) for (const r of p.requires ?? []) expect(ids.has(r), `${p.id} → ${r}`).toBe(true);
  });
});

describe('resolving a request', () => {
  it('no list means everything, as before', () => {
    expect(resolveParts(undefined).parts.size).toBe(PARTS.length);
  });

  it('accepts a comma list, as a query string sends it', () => {
    expect([...resolveParts('npcs, locations').parts].sort()).toEqual(['locations', 'npcs']);
  });

  it('adds a hard dependency and says it did', () => {
    const r = resolveParts(['survey_results', 'inventory']);
    expect(r.parts.has('survey_questions')).toBe(true);
    expect(r.parts.has('players')).toBe(true);
    expect(r.added.sort()).toEqual(['players', 'survey_questions']);
  });

  it('reports an unknown part instead of ignoring it', () => {
    // A typo on a curl command must not export less than was meant.
    expect(resolveParts(['npcs', 'npc']).unknown).toEqual(['npc']);
  });
});

describe('what a partial file contains', () => {
  it('only the sections asked for, plus the campaign it is built from', () => {
    const out = pick('npcs');
    expect(out.npcs).toHaveLength(1);
    expect(out.campaign.name).toBe('Leruhy');
    for (const k of ['locations', 'players', 'surveys', 'campaign_journal', 'item_cards']) {
      expect(out, k).not.toHaveProperty(k);
    }
  });

  it('and says which sections it is', () => {
    expect(pick('npcs', 'locations').parts).toEqual(['locations', 'npcs']);
  });

  it('never changes the bundle it was given', () => {
    const b = bundle();
    const before = JSON.stringify(b);
    selectParts(b, resolveParts(['npcs']).parts);
    expect(JSON.stringify(b)).toBe(before);
  });
});

describe('a reference to something left behind', () => {
  /*
   * Treated by kind. People and positions are stripped; world names are
   * kept, because importing into a campaign that already has the place
   * should link it up — the merge partial export exists for.
   */
  it('an NPC keeps the NAME of where it stands, even without locations', () => {
    // So importing NPCs into a campaign with the same world puts them back
    // where they were. A first draft stripped this; it would have broken
    // exactly that merge.
    expect(pick('npcs').npcs[0].current_location_ref).toBe('Buldamar');
  });

  it('and keeps its stat block, which is part of the NPC', () => {
    expect(pick('npcs').npcs[0].sheet).toEqual({ ac: '17' });
  });

  it('a map keeps its links to campaign locations, by name', () => {
    const m = pick('journey_maps').journey_maps[0];
    expect(m.scope_location_ref).toBe('Buldamar');
    expect(m.locations[0].campaign_location_ref).toBe('Buldamar');
  });

  it('timeline actors: people go, NPCs stay', () => {
    // The import stored an unresolved token RAW — `npc_Grathul` where an
    // id belongs — which is fixed in app.js; an NPC that does not resolve
    // is now dropped there. A player is never named by a file without them.
    const e = pick('dm_timelines').dm_timelines[0].entries[0];
    expect(e.player_id_refs).toEqual(['dm_self', 'npc_Grathul']);
    const all = pick('dm_timelines', 'players', 'relationships').dm_timelines[0].entries[0];
    expect(all.player_id_refs).toHaveLength(4);
  });

  it('a journal entry forgets who wrote it, but not where', () => {
    const e = pick('campaign_journal').campaign_journal[0];
    expect(e).toMatchObject({ player_ref: null, author_username: null, location_ref: 'Buldamar' });
    const withPlayers = pick('campaign_journal', 'players').campaign_journal[0];
    expect(withPlayers).toMatchObject({ player_ref: 'Ailysse', author_username: 'pat' });
  });

  it('an inventory item loses a card POSITION that is not in the file', () => {
    // `card_ref` is an index into this file's item_cards, not a name.
    expect(pick('inventory').players[0].inventory[0]).toMatchObject({ name: 'Sunlight Mirror', card_ref: null });
    expect(pick('inventory', 'item_cards').players[0].inventory[0].card_ref).toBe(0);
  });

  it('no player name appears anywhere in a file without players', () => {
    /*
     * The blunt check, across every section at once: a world exported for
     * a new table carries none of the old table's names. "Ailysse" is a
     * player AND her character in the fixture; "pat" is her account.
     */
    const world = pick('locations', 'npcs', 'journey_maps', 'item_cards', 'dm_timelines',
      'sessions', 'survey_results', 'connections', 'campaign_journal', 'party_events');
    expect(JSON.stringify(world)).not.toMatch(/Ailysse|"pat"/);
  });
});

describe('the character tree keeps only edges whose both ends travel', () => {
  it('world only: NPC to NPC survives, the rest go', () => {
    const c = pick('npcs', 'connections').cross_connections;
    expect(c.map((x) => x.label)).toEqual(['answers to']);
  });

  it('an NPC end needs nothing — it is a world name', () => {
    // Without NPCs in the file, an import that cannot find one skips the
    // edge; there is no person to protect at that end.
    expect(pick('connections').cross_connections.map((x) => x.label)).toEqual(['answers to']);
  });

  it('with players: the edge to a player comes too', () => {
    const c = pick('npcs', 'players', 'connections').cross_connections;
    expect(c.map((x) => x.label).sort()).toEqual(['answers to', 'owes']);
  });

  it('with relationships: everything', () => {
    expect(pick('npcs', 'relationships', 'connections').cross_connections).toHaveLength(3);
  });
});

describe('a player without some of what they carry', () => {
  it('a seat alone is a name and an account', () => {
    expect(pick('players').players[0]).toEqual({ player_name: 'Ailysse', username: 'pat' });
  });

  it('sheets without diaries, for a new campaign with the same table', () => {
    const p = pick('characters').players[0];
    expect(p.character.story).toBe('Exiled');
    expect(p.stats_json).toEqual({ ac: '15' });
    expect(p).not.toHaveProperty('diary');
    expect(p).not.toHaveProperty('dm_notes');
  });

  it("a player's own timeline drops relationships that stayed home, keeps NPCs", () => {
    const e = pick('player_timelines').players[0].timelines[0].entries[0];
    expect(e.player_id_refs).toEqual(['self_Ailysse', 'npc_Grathul']);
  });
});

describe('surveys, split', () => {
  it('questions only: ready to ask a new table, with no history', () => {
    const s = pick('survey_questions').surveys[0];
    expect(s.questions).toHaveLength(1);
    expect(s.runs).toEqual([]);
  });

  it('results bring their questions, and keep the answers', () => {
    const s = pick('survey_results').surveys[0];
    expect(s.runs[0].responses[0].answers).toEqual([{ q: 0, score: 8 }]);
  });

  it('but name nobody who is not in the file', () => {
    const r = pick('survey_results').surveys[0].runs[0];
    expect(r.submitted).toEqual([]);
    expect(r.responses[0].player_ref).toBeNull();
  });

  it('and do, when the players travel too', () => {
    const r = pick('survey_results', 'players').surveys[0].runs[0];
    expect(r.submitted).toEqual(['Ailysse']);
    expect(r.responses[0].player_ref).toBe('Ailysse');
  });
});

describe('the catalogue against the REAL export', () => {
  /*
   * The fixture above is mine; this reads the bundle app.js actually builds.
   * `selectParts` rebuilds the file from the keys it knows, so a section
   * added to the export and not to lib/campaignParts.js would vanish from
   * every export, including "everything". This is what notices.
   */
  it('every top-level key the export builds survives a full selection', async () => {
    const { readFileSync } = await import('fs');
    const { fileURLToPath } = await import('url');
    const path = await import('path');
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const app = readFileSync(path.join(root, 'app.js'), 'utf8');
    const at = app.indexOf('    const full = {');
    expect(at, 'the export no longer builds `full`').toBeGreaterThan(-1);
    const body = app.slice(at, app.indexOf('\n    };', at));
    const keys = [...body.matchAll(/^ {6}([a-z_]+):/gm)].map((m) => m[1]);
    expect(keys.length, 'found no keys — the parse broke').toBeGreaterThan(10);

    const fake = Object.fromEntries(keys.map((k) => [k, k === 'campaign' ? { name: 'x' } : []]));
    const out = selectParts(fake, resolveParts(null).parts);
    for (const k of keys) {
      // cross_connections is emitted under its own name by the `connections` part.
      expect(out, `"${k}" is built by the export but dropped by selectParts`).toHaveProperty(k);
    }
  });
});

describe('the module ships', () => {
  /*
   * The Dockerfile copies the server by NAME — app.js, scripts/, docs/ —
   * not the whole directory. This module was first added without a line
   * there, which builds an image that dies at startup on the require. A
   * test that passes locally proves nothing about that, so this one reads
   * the Dockerfile.
   */
  it('the Dockerfile copies lib/ into the image', async () => {
    const { readFileSync } = await import('fs');
    const { fileURLToPath } = await import('url');
    const path = await import('path');
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const docker = readFileSync(path.join(root, 'Dockerfile'), 'utf8');
    const app = readFileSync(path.join(root, 'app.js'), 'utf8');
    expect(app).toMatch(/require\('\.\/lib\/campaignParts'\)/);
    expect(docker).toMatch(/^COPY lib\/ \.\/lib\/$/m);
  });
});
