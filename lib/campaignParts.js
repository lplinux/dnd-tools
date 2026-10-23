/**
 * lib/campaignParts.js
 *
 * Exporting PART of a campaign — the world without the table that played
 * it, or one group's history without the rest.
 *
 * The first module outside app.js, and deliberately so. Everything else in
 * this server is one file, and its tests read that file as text because it
 * has no exports. That is fine for "does this route call the guard", and
 * useless for this: the question here is what a bundle LOOKS like after a
 * selection, which only running it can answer. So the selection is a pure
 * function over an already-built bundle, required by app.js and imported by
 * the tests, with no database anywhere near it.
 *
 * Two rules, and they are the whole design:
 *
 *   1. A HARD dependency is added, not refused. Survey results without
 *      their questions, or a character sheet without the player seat it
 *      hangs off, cannot be imported as anything. Asking for one quietly
 *      brings its parent, and the result says which were added.
 *
 *   2. References to something left behind are treated by KIND:
 *
 *      - PEOPLE are stripped. A file without the players names none of
 *        them: not in a survey's attendance, not as a timeline actor, not
 *        as the character who wrote a journal entry. A world exported for
 *        a new table should not carry the old table's names into it.
 *
 *      - POSITIONS are stripped. An inventory item's `card_ref` is an
 *        index into this file's own `item_cards`; without them it points
 *        at nothing, or at the wrong card.
 *
 *      - WORLD NAMES are KEPT. An NPC standing in "Buldamar" keeps that
 *        name even when locations stay home, because importing into a
 *        campaign that already has Buldamar should link them up — which
 *        is the whole case for exporting part of a campaign into another.
 *        Stripping it at export would destroy exactly that. Every importer
 *        resolves a world name against what exists and degrades one that
 *        does not to nothing; the one that did NOT — timeline actors were
 *        stored raw — is fixed in app.js.
 *
 *      This was first written stripping everything not exported, which
 *      read as tidier and was wrong: it would have broken the merge it was
 *      built for.
 */
'use strict';

/**
 * The catalogue. `group` orders the export dialog; `requires` is rule 1.
 *
 * Grouped by what survives a change of TABLE, because that is the reason
 * anyone exports part of a campaign: the world is reusable by a new group
 * or a new edition, the table is these players, and the history is what
 * happened when they played.
 */
const PARTS = [
  // ── The world ──────────────────────────────────────────────────────────
  { id: 'locations', group: 'world', label: 'Locations',
    hint: 'Places, with their descriptions and pin images.' },
  { id: 'npcs', group: 'world', label: 'NPCs',
    hint: 'Names, notes, who has been met, and their stat blocks.' },
  { id: 'journey_maps', group: 'world', label: 'Journey maps',
    hint: 'Maps, their pins and routes.' },
  { id: 'item_cards', group: 'world', label: 'Item cards',
    hint: 'The cards this campaign’s inventories use.' },
  { id: 'dm_timelines', group: 'world', label: 'DM timelines',
    hint: 'Your own timelines of world events.' },
  { id: 'sessions', group: 'world', label: 'Session prep',
    hint: 'Sessions and their cards.' },
  { id: 'survey_questions', group: 'world', label: 'Surveys — questions',
    hint: 'The surveys themselves, ready to ask a new table.' },
  { id: 'connections', group: 'world', label: 'Char Tree connections',
    hint: 'Only those between things also exported — NPC to NPC on its own.' },

  // ── The table ──────────────────────────────────────────────────────────
  { id: 'players', group: 'table', label: 'Players',
    hint: 'The seats, and which account holds each.' },
  { id: 'characters', group: 'table', label: 'Character sheets',
    hint: 'Each character’s sheet, portrait and stats.', requires: ['players'] },
  { id: 'dm_notes', group: 'table', label: 'DM notes on characters',
    requires: ['players'] },
  { id: 'relationships', group: 'table', label: 'Personal relationships',
    hint: 'Each character’s own family and contacts tree.', requires: ['players'] },
  { id: 'player_timelines', group: 'table', label: 'Player timelines',
    requires: ['players'] },
  { id: 'player_diaries', group: 'table', label: 'Player diaries',
    requires: ['players'] },
  { id: 'inventory', group: 'table', label: 'Inventories',
    hint: 'Without Item cards, items keep their names but lose their card.',
    requires: ['players'] },
  { id: 'party_events', group: 'table', label: 'Party timeline' },

  // ── What happened ──────────────────────────────────────────────────────
  { id: 'campaign_journal', group: 'history', label: 'Journal' },
  { id: 'campaign_diary', group: 'history', label: 'Campaign diary' },
  { id: 'survey_results', group: 'history', label: 'Surveys — results',
    hint: 'Every asking and every answer. Without Players, answers keep no names.',
    requires: ['survey_questions'] },
];

const IDS = new Set(PARTS.map((p) => p.id));
const BY_ID = new Map(PARTS.map((p) => [p.id, p]));

/**
 * Turn a request into the set that will actually be exported.
 *
 * `null`/`undefined` means everything — the old behaviour, so every
 * existing caller and every backup made the old way is unchanged.
 * An unknown name is reported rather than ignored: a typo in a `?parts=`
 * on a curl command should fail loudly, not export less than you meant.
 */
function resolveParts(requested) {
  if (requested == null) return { parts: new Set(IDS), added: [], unknown: [] };
  const list = Array.isArray(requested)
    ? requested
    : String(requested).split(',');
  const wanted = list.map((s) => String(s).trim()).filter(Boolean);
  const unknown = wanted.filter((id) => !IDS.has(id));
  const parts = new Set(wanted.filter((id) => IDS.has(id)));
  const added = [];
  // To a fixed point, though the graph is one level deep today: a future
  // part requiring a part that itself requires one must still resolve.
  let grew = true;
  while (grew) {
    grew = false;
    for (const id of [...parts]) {
      for (const dep of BY_ID.get(id).requires ?? []) {
        if (!parts.has(dep)) { parts.add(dep); added.push(dep); grew = true; }
      }
    }
  }
  return { parts, added, unknown };
}

/**
 * Whether a timeline actor token survives, given what is exported.
 *
 * People go with their part; an NPC is a world name and stays — see rule 2.
 * `rel_` is a character's own family or contact, which belongs to the table
 * that made them up, so it goes with `relationships`.
 */
function keepActor(tok, parts) {
  const prefix = String(tok).split('_')[0];
  if (prefix === 'cp' || prefix === 'self') return parts.has('players');
  if (prefix === 'rel') return parts.has('relationships');
  return true;       // npc_ (world), dm_self, and anything unknown
}

const stripActors = (entries, parts) => (entries ?? []).map((e) => ({
  ...e,
  player_id_refs: (e.player_id_refs ?? []).filter((t) => keepActor(t, parts)),
}));

/**
 * Which part a char-tree endpoint needs. An NPC end needs nothing: it is a
 * world name, and an import that cannot find the NPC skips the edge.
 */
const ENDPOINT_PART = { player: 'players', relationship: 'relationships' };

/**
 * The bundle, cut down to `parts`. Never mutates its input.
 *
 * `campaign` is always kept — it is what an import builds the new campaign
 * from — as are the envelope fields. `parts` is written into the result so
 * the file says what it is, and so an import into an existing campaign can
 * tell "this file has no NPCs" from "this file deliberately carries none".
 */
function selectParts(bundle, parts) {
  const has = (id) => parts.has(id);
  const out = {
    version: bundle.version,
    exported_at: bundle.exported_at,
    type: bundle.type,
    parts: PARTS.map((p) => p.id).filter(has),
    // Said outright, so an importer does not have to know how many parts
    // exist to tell a backup from a slice. A file with no `partial` at all
    // predates partial export, and was whole.
    partial: parts.size < PARTS.length,
    campaign: bundle.campaign,
  };

  if (has('item_cards')) out.item_cards = bundle.item_cards ?? [];

  if (has('locations')) out.locations = bundle.locations ?? [];

  // Their locations are world names, and kept: see rule 2.
  if (has('npcs')) out.npcs = bundle.npcs ?? [];
  if (has('journey_maps')) out.journey_maps = bundle.journey_maps ?? [];

  if (has('dm_timelines')) {
    out.dm_timelines = (bundle.dm_timelines ?? []).map((t) => ({
      ...t, entries: stripActors(t.entries, parts),
    }));
  }

  if (has('sessions')) out.sessions = bundle.sessions ?? [];
  if (has('party_events')) out.party_events = bundle.party_events ?? [];
  if (has('campaign_diary')) out.campaign_diary = bundle.campaign_diary ?? [];

  if (has('players')) {
    out.players = (bundle.players ?? []).map((p) => {
      const q = { player_name: p.player_name, username: p.username ?? null };
      if (has('characters')) { q.character = p.character ?? null; q.stats_json = p.stats_json ?? null; }
      if (has('dm_notes')) q.dm_notes = p.dm_notes ?? [];
      if (has('relationships')) q.relationships = p.relationships ?? [];
      if (has('player_timelines')) {
        q.timelines = (p.timelines ?? []).map((t) => ({ ...t, entries: stripActors(t.entries, parts) }));
      }
      if (has('player_diaries')) q.diary = p.diary ?? [];
      if (has('inventory')) {
        q.inventory = (p.inventory ?? []).map((it) => (has('item_cards') ? it : { ...it, card_ref: null }));
      }
      return q;
    });
  }

  if (has('connections')) {
    // A person at either end must be in the file. An edge to a player who
    // was not exported is an edge to nobody, and names them besides.
    const inFile = (type) => {
      if (type === 'npc') return true;
      const part = ENDPOINT_PART[type];
      return part ? has(part) : false;
    };
    out.cross_connections = (bundle.cross_connections ?? [])
      .filter((c) => inFile(c.from_type) && inFile(c.to_type));
  }

  if (has('campaign_journal')) {
    // Who wrote it — the character AND the account — is a person; where it
    // happened is a place, and stays. Without an author the import credits
    // the importing DM, which is what it does for any it cannot match.
    out.campaign_journal = (bundle.campaign_journal ?? []).map((e) => ({
      ...e,
      player_ref: has('players') ? (e.player_ref ?? null) : null,
      author_username: has('players') ? (e.author_username ?? null) : null,
    }));
  }

  if (has('survey_questions')) {
    out.surveys = (bundle.surveys ?? []).map((s) => ({
      ...s,
      runs: !has('survey_results') ? [] : (s.runs ?? []).map((r) => ({
        ...r,
        // Attendance and attributed names are about PLAYERS. Without them,
        // the numbers and comments still come — the history is the point —
        // but nothing in the file names a person who is not in it.
        submitted: has('players') ? (r.submitted ?? []) : [],
        responses: (r.responses ?? []).map((p) => ({
          ...p, player_ref: has('players') ? (p.player_ref ?? null) : null,
        })),
      })),
    }));
  }

  return out;
}

module.exports = { PARTS, resolveParts, selectParts, keepActor };
