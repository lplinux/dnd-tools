/**
 * pages/Timeline/combined.js
 *
 * Build a read-only "combined" timeline db from the flat entry rows returned by
 * `/api/player-timelines/:cid/all` (DM combined view) or `/api/timeline-public/
 * :token` (public view). Each (timeline × actor) becomes a synthetic db.player
 * so events from different timelines/actors get their own column + colour.
 * Faithful port of the legacy renderDMCombinedView mapping.
 *
 * Actor display names resolve from optional lookups (relationships / NPCs /
 * campaign players); the public view passes empty lookups (names fall back to
 * the owning character).
 */

import { PALETTE } from '@/data/calendar';

/** players → [{ id, name, username, timelines: [{ id, name, color }] }] for the legend. */
export function buildPlayersTree(rows) {
  const players = {};
  let ci = 0;
  const tlColors = {};
  rows.forEach((row) => {
    if (!row.player_id) return;
    if (!players[row.player_id]) players[row.player_id] = { id: row.player_id, name: row.player_name, username: row.username, timelines: {} };
    if (row.timeline_id && !players[row.player_id].timelines[row.timeline_id]) {
      if (!tlColors[row.timeline_id]) tlColors[row.timeline_id] = PALETTE[ci++ % PALETTE.length];
      players[row.player_id].timelines[row.timeline_id] = { id: row.timeline_id, name: row.timeline_name, color: tlColors[row.timeline_id] };
    }
  });
  return {
    tlColors,
    tree: Object.values(players).map((p) => ({ ...p, timelines: Object.values(p.timelines) })),
  };
}

export function buildCombinedDb(rows, { relNames = {}, npcNames = {}, cpNames = {} } = {}, hidden = new Set()) {
  const { tlColors, tree } = buildPlayersTree(rows);

  // Visible entries (timelines not hidden)
  const allVis = [];
  const locSet = new Set();
  rows.forEach((e) => {
    if (!e.timeline_id || !e.entry_id || hidden.has(e.timeline_id)) return;
    if (e.location) locSet.add(e.location);
    allVis.push(e);
  });

  // Party events (no owning timeline) collapse into one shared "Party" lane.
  const partyVis = [];
  rows.forEach((e) => {
    if (!e.is_party || !e.entry_id) return;
    if (e.location) locSet.add(e.location);
    partyVis.push(e);
  });

  // Character name per timeline
  const charByTid = {};
  rows.forEach((r) => { if (r.timeline_id) charByTid[r.timeline_id] = r.player_name; });

  // One synthetic player per (timeline, actor)
  const synthMap = {};
  let ci = Object.keys(tlColors).length;
  allVis.forEach((e) => {
    const pids = (e.player_ids && e.player_ids.length) ? e.player_ids : [`tl_${e.timeline_id}`];
    pids.forEach((pid) => {
      const key = `tl_${e.timeline_id}_${pid}`;
      if (synthMap[key]) return;
      const tlColor = tlColors[e.timeline_id] || '#c9a84c';
      const offset = Object.keys(synthMap).filter((k) => k.startsWith(`tl_${e.timeline_id}_`)).length;
      const color = offset === 0 ? tlColor : PALETTE[(ci + offset) % PALETTE.length];
      // Resolve display name
      const charName = charByTid[e.timeline_id] || `Player ${e.timeline_id}`;
      let name;
      if (pid.startsWith('rel_')) name = relNames[pid] ? `${relNames[pid]} (${charName})` : charName;
      else if (pid.startsWith('npc_')) name = npcNames[pid] ? `🎭 ${npcNames[pid]}` : charName;
      else if (pid.startsWith('cp_')) name = cpNames[pid] || charName;
      else name = charName;
      synthMap[key] = { id: key, name, color };
    });
  });
  if (partyVis.length) synthMap.party = { id: 'party', name: '🌍 Party', color: '#e8c96a' };

  const locations = locSet.size ? [...locSet] : ['Unknown'];
  const visEntryIds = new Set(allVis.map((e) => e.entry_id));

  const events = allVis.map((e) => {
    const pids = (e.player_ids && e.player_ids.length) ? e.player_ids : [`tl_${e.timeline_id}`];
    return {
      id: `dm_${e.entry_id}`,
      title: e.title,
      description: e.description || '',
      location: e.location || locations[0],
      year: e.year,
      dayOfYear: e.day_of_year,
      durationDays: e.duration_days || 1,
      playerIds: pids.map((pid) => `tl_${e.timeline_id}_${pid}`),
      manualLinks: (e.manual_links || []).filter((lid) => visEntryIds.has(lid)).map((lid) => `dm_${lid}`),
    };
  });

  const partyEvents = partyVis.map((e) => ({
    id: `dm_${e.entry_id}`,
    title: e.title,
    description: e.description || '',
    location: e.location || locations[0],
    year: e.year,
    dayOfYear: e.day_of_year,
    durationDays: e.duration_days || 1,
    playerIds: ['party'],
    manualLinks: [],
    isParty: true,
  }));

  return {
    players: Object.values(synthMap),
    locations,
    locationOrder: locations,
    events: [...events, ...partyEvents],
    todayAbs: null,
    tree,
  };
}
