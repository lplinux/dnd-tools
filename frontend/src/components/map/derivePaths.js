/**
 * components/map/derivePaths.js
 *
 * Journey-Map movement paths are DERIVED (computed live) from timeline events —
 * they are not drawn by hand and not stored. Three kinds:
 *   • Party path — from events that are `is_party` OR involve **≥ 3 players**.
 *   • Per-player path — from the remaining (< 3 player, non-party) events that
 *     involve that player. A 2-player event feeds *both* players' paths.
 *   • Per-NPC path — from events (excluding DM timelines) that tag that NPC.
 * Each is the chronological sequence of the events' locations, matched to placed
 * pins by name. (A matching Node implementation lives in app.js for the public map.)
 */

import { absDay } from '@/data/calendar';

// An event counts as a "Party" event once this many distinct players are involved.
const PARTY_MIN_PLAYERS = 3;

const PARTY_COLOR = '#e8c96a';
const PLAYER_PALETTE = [
  '#3498db', '#e74c3c', '#2ecc71', '#9b59b6', '#f1c40f', '#1abc9c',
  '#e67e22', '#34495e', '#fd79a8', '#00cec9', '#6c5ce7', '#fab1a0',
];
const NPC_PALETTE = [
  '#c0392b', '#2980b9', '#27ae60', '#8e44ad', '#e67e22', '#16a085',
  '#d35400', '#2c3e50', '#7f8c8d', '#f39c12', '#1abc9c', '#e74c3c',
];

/** name (lowercased) → { x, y, locId } for every placed location. */
function pinIndex(placedLocs) {
  const m = new Map();
  for (const l of placedLocs || []) {
    if (l && l.name != null) m.set(String(l.name).toLowerCase(), { x: l.x, y: l.y, locId: l.id });
  }
  return m;
}

/** Set of campaign-player ids that took part in an event (owner + self_/cp_ tokens). */
function participantPlayerIds(ev) {
  const s = new Set();
  if (ev.player_id != null && !ev.is_dm_player) s.add(String(ev.player_id));
  for (const tok of (ev.player_ids || [])) {
    const parts = String(tok).split('_');
    const prefix = parts[0];
    const val = parts.slice(1).join('_');
    if (prefix === 'self' || prefix === 'cp') s.add(String(val));
  }
  return s;
}

/** Ordered, de-duplicated waypoints (collapse consecutive stops at the same pin). */
function orderedStops(evs, pins, calType) {
  const stops = (evs || [])
    .map((e) => {
      const pin = pins.get(String(e.location || '').toLowerCase());
      return pin ? { ...pin, abs: absDay(e.year, e.day_of_year, calType) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.abs - b.abs);
  const out = [];
  for (const s of stops) {
    if (out.length && out[out.length - 1].locId === s.locId) continue; // collapse "stayed put"
    out.push({ x: s.x, y: s.y, locId: s.locId });
  }
  return out;
}

/**
 * @param events      timeline rows: { player_id, is_dm_player, location, year, day_of_year, is_party, player_ids[] }
 * @param placedLocs  placed map locations: { id, name, x, y }
 * @param players     non-DM campaign players: { id }
 * @param npcs        campaign NPCs: { id, name }
 * @returns synthetic path objects consumed by the map renderer
 */
export function derivePaths({ events = [], placedLocs = [], players = [], npcs = [], calType = 'harptos' }) {
  const pins = pinIndex(placedLocs);
  const paths = [];

  // A "Party" event is an explicit party event OR one involving ≥ 3 players.
  const isParty = (e) => !!e.is_party || participantPlayerIds(e).size >= PARTY_MIN_PLAYERS;

  // ── Party ──────────────────────────────────────────────────────────────
  const partyWpts = orderedStops(events.filter(isParty), pins, calType);
  if (partyWpts.length >= 2) {
    paths.push({ id: 'party', kind: 'path', name: '🌍 Party', tracker_color: PARTY_COLOR, waypoints: partyWpts, isParty: true });
  }

  // ── Per player ─────────────────────────────────────────────────────────
  // Non-party events belong to the independent players who took part in them.
  const soloEvents = events.filter((e) => !isParty(e));
  (players || []).forEach((pl, i) => {
    const pid = String(pl.id);
    const evs = soloEvents.filter((e) => participantPlayerIds(e).has(pid));
    const wpts = orderedStops(evs, pins, calType);
    if (wpts.length >= 2) {
      paths.push({
        id: `player_${pl.id}`,
        kind: 'path',
        name: `👤 ${pl.player_name || pl.name || 'Player'}`,
        tracker_color: PLAYER_PALETTE[i % PLAYER_PALETTE.length],
        waypoints: wpts,
        playerId: pl.id,
      });
    }
  });

  // ── Per NPC ────────────────────────────────────────────────────────────
  // NPCs are DM-controlled, so their movements are authored in DM-owned timelines —
  // do NOT exclude DM timelines here (unlike party/player derivation).
  (npcs || []).forEach((npc, i) => {
    const tok = `npc_${npc.id}`;
    const evs = events.filter((e) => (e.player_ids || []).includes(tok));
    const wpts = orderedStops(evs, pins, calType);
    if (wpts.length >= 2) {
      paths.push({
        id: `npc_${npc.id}`,
        kind: 'path',
        name: `🎭 ${npc.name}`,
        tracker_color: NPC_PALETTE[i % NPC_PALETTE.length],
        waypoints: wpts,
        npcId: npc.id,
      });
    }
  });

  return paths;
}
