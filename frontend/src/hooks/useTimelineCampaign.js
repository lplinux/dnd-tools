/**
 * hooks/useTimelineCampaign.js
 *
 * Campaign (DB-backed) mode for the Timeline. Mirrors the `useTimeline`
 * interface (db / calType / event CRUD / derived selectors / ui / zoom) so the
 * same canvas, sidebar and modals are reused — but data comes from the API:
 *   campaign → player/view → named timeline → entries.
 *
 * Actors (db.players) are resolved from the player's PC relationships (and, for
 * DM timelines, other campaign players + their relationships + NPCs), mapped to
 * `self_*` / `rel_*` / `cp_*` / `npc_*` ids. Locations come from the campaign.
 * Players, locations and the today marker are read-only here.
 *
 * Deferred (flagged): the DM "combined" read-only view across all players, and
 * share-by-token — these are additive layers handled in the final slice.
 */

import { useCallback, useMemo, useState } from 'react';
import { client } from '@/api/client';
import { campaignsApi } from '@/api/campaigns';
import { timelineApi } from '@/api/timeline';
import { pcApi } from '@/api/pc';
import { useAuth } from '@/hooks/useAuth';
import { doyFromForm, parseDuration } from '@/data/calendar';
import { buildCombinedDb } from '@/pages/Timeline/combined';
import { downloadBundle } from '@/api/downloadBundle';

const PLAYER_PALETTE = ['#c0392b', '#2980b9', '#27ae60', '#8e44ad', '#e67e22', '#16a085', '#d35400', '#2c3e50', '#7f8c8d', '#f39c12', '#1abc9c', '#e74c3c'];
const WORLD = '🌍 World Timeline';

export function useTimelineCampaign() {
  const { user } = useAuth();
  const isDM = user && (user.role === 'admin' || user.role === 'dm');

  const [campaigns, setCampaigns] = useState([]);
  const [campaignId, setCampaignId] = useState('');
  const [meta, setMeta] = useState({});
  const [status, setStatus] = useState('');

  const [playerOptions, setPlayerOptions] = useState([]); // [{ value, label, group }]
  const [playerSel, setPlayerSel] = useState('');
  const [, setDmPlayerId] = useState(null);

  const [privPlayerId, setPrivPlayerId] = useState(null);
  const [privPlayers, setPrivPlayers] = useState([]); // actors: { id, name, color }
  const [privLocations, setPrivLocations] = useState([]); // [{ id, name }]
  const [timelines, setTimelines] = useState([]);
  const [timelineId, setTimelineId] = useState(null);
  const [entries, setEntries] = useState([]);
  const [partyEntries, setPartyEntries] = useState([]); // campaign-wide "Party" events

  // Combined (all-players, read-only) view state
  const [combined, setCombined] = useState(false);
  const [combinedRows, setCombinedRows] = useState([]);
  const [combinedNames, setCombinedNames] = useState({});
  const [hiddenTimelines, setHiddenTimelines] = useState(() => new Set());

  // UI (runtime; not persisted in campaign mode)
  const [ui, setUi] = useState({ collapsed: { events: true, newev: true, players: true, locs: true, today: true }, view: 'graph' });
  const [hiddenPlayerArr, setHiddenPlayerArr] = useState([]);
  const [hiddenLocArr, setHiddenLocArr] = useState([]);
  const [ppd, setPpd] = useState(1);

  const calType = meta.calendar_type || 'harptos';

  // ── Load campaigns (call once on mount from the page) ──────
  const loadCampaigns = useCallback(async () => {
    const r = await campaignsApi.list().catch(() => []);
    setCampaigns(r || []);
  }, []);

  const resetSelection = useCallback(() => {
    setPrivPlayerId(null); setPrivPlayers([]); setTimelines([]); setTimelineId(null); setEntries([]); setStatus('');
    setCombined(false); setCombinedRows([]); setHiddenTimelines(new Set());
  }, []);

  // ── Combined (all players) read-only view ──────────────────
  const toggleTimeline = useCallback((tid) => setHiddenTimelines((s) => {
    const n = new Set(s); if (n.has(tid)) n.delete(tid); else n.add(tid); return n;
  }), []);

  const loadCombined = useCallback(async (cid) => {
    setStatus('Loading combined view…');
    const rows = (await timelineApi.allForCampaign(cid).catch(() => [])) || [];
    const uniquePids = [...new Set(rows.map((r) => r.player_id).filter(Boolean))];
    const relNames = {};
    const npcNames = {};
    const cpNames = {};
    await Promise.all([
      ...uniquePids.map(async (pid) => {
        const { relationships = [] } = (await pcApi.listRelationships(pid).catch(() => ({}))) || {};
        relationships.forEach((r) => { relNames[`rel_${r.id}`] = r.name; });
      }),
      (async () => { const npcs = (await campaignsApi.listNpcs(cid).catch(() => [])) || []; npcs.forEach((n) => { npcNames[`npc_${n.id}`] = n.name; }); })(),
      (async () => { const ps = (await campaignsApi.listPlayers(cid).catch(() => [])) || []; ps.forEach((p) => { cpNames[`cp_${p.id}`] = p.player_name; }); })(),
    ]);
    setCombinedRows(rows);
    setCombinedNames({ relNames, npcNames, cpNames });
    setCombined(true);
    setStatus('');
  }, []);

  // ── Actor resolution (self + relationships [+ DM: cp/rel/npc]) ──
  const loadActors = useCallback(async (cid, playerId, isDmTimeline, dmName) => {
    const allPlayers = await campaignsApi.listPlayers(cid).catch(() => []);
    const self = (allPlayers || []).find((p) => String(p.id) === String(playerId));
    const { relationships: rels = [], cross_connections: cross = [] } =
      (await pcApi.listRelationships(playerId).catch(() => ({}))) || {};
    const selfName = self ? self.player_name : (isDmTimeline ? (dmName || 'DM') : 'You');

    const actors = [{ id: `self_${playerId}`, name: selfName, color: PLAYER_PALETTE[0] }];
    rels.forEach((r, i) => actors.push({ id: `rel_${r.id}`, name: r.name, color: PLAYER_PALETTE[(i + 1) % PLAYER_PALETTE.length] }));

    if (isDmTimeline) {
      const regular = (allPlayers || []).filter((p) => !p.is_dm_player);
      regular.forEach((p, i) => actors.push({ id: `cp_${p.id}`, name: `👤 ${p.player_name}`, color: PLAYER_PALETTE[(rels.length + i + 1) % PLAYER_PALETTE.length] }));
      const seen = new Set(rels.map((r) => r.id));
      const perPlayerRels = await Promise.all(regular.map((p) => pcApi.listRelationships(p.id).then((r) => (r && r.relationships) || []).catch(() => [])));
      let off = rels.length + regular.length + 1;
      perPlayerRels.forEach((prels, pi) => prels.forEach((r) => {
        if (seen.has(r.id)) return;
        seen.add(r.id);
        actors.push({ id: `rel_${r.id}`, name: `🤝 ${r.name} (${regular[pi].player_name})`, color: PLAYER_PALETTE[off % PLAYER_PALETTE.length] });
        off += 1;
      }));
      const npcs = await campaignsApi.listNpcs(cid).catch(() => []);
      (npcs || []).forEach((n, i) => actors.push({ id: `npc_${n.id}`, name: `🎭 ${n.name}`, color: PLAYER_PALETTE[(off + i) % PLAYER_PALETTE.length] }));
    }

    // The far end of each cross-connection becomes an actor too. Without this a
    // player could see an event tagged with a connected NPC or another party
    // member but had no row for them — nothing to search, filter, solo or hide,
    // and the event's colour dot resolved to nothing. The API already returns
    // only `is_public` cross-connections to a player, so this adds exactly the
    // ones the DM has shared and never leaks a hidden link.
    const seenIds = new Set(actors.map((a) => a.id));
    const endpointActorId = (type, id) => (
      type === 'relationship' ? `rel_${id}`
        : type === 'player' ? `cp_${id}`
          : type === 'npc' ? `npc_${id}`
            : null
    );
    (cross || []).forEach((row) => {
      [
        [row.from_entity_type, row.from_entity_id, row.from_rel_name || row.from_entity_player_name || row.from_npc_name],
        [row.to_entity_type, row.to_entity_id, row.to_rel_name || row.to_entity_player_name || row.to_npc_name],
      ].forEach(([type, id, name]) => {
        const aid = endpointActorId(type, id);
        // Skip the player themselves — they are already `self_<id>`, and adding
        // `cp_<id>` for the same person would list them twice under two names.
        if (!aid || !name || seenIds.has(aid)) return;
        if (type === 'player' && String(id) === String(playerId)) return;
        seenIds.add(aid);
        actors.push({
          id: aid,
          name: `🔗 ${name}`,
          color: PLAYER_PALETTE[actors.length % PLAYER_PALETTE.length],
        });
      });
    });

    setPrivPlayers(actors);
  }, []);

  // ── Timeline selection ─────────────────────────────────────
  const selectTimeline = useCallback(async (tlId) => {
    setTimelineId(tlId);
    if (!tlId) { setEntries([]); return; }
    setEntries((await timelineApi.listEntries(tlId).catch(() => [])) || []);
  }, []);

  const selectPlayerOption = useCallback(async (value, cidArg) => {
    setPlayerSel(value);
    resetSelection();
    // Accept an explicit campaign id: when selectCampaign() calls this within
    // the same tick, `campaignId` state hasn't updated yet, so its closure here
    // is stale ('') and we'd bail out — passing cid keeps the chain working.
    const cid = cidArg ?? campaignId;
    if (!cid) return;

    if (!value) {
      // Combined (all players) — read-only DM view.
      if (isDM) await loadCombined(cid);
      return;
    }

    let realPid;
    let isDmTimeline = false;
    let onlyWorld = false;
    if (value.startsWith('dm_private_')) { realPid = parseInt(value.replace('dm_private_', '')); isDmTimeline = true; }
    else if (value.startsWith('dm_world_')) { realPid = parseInt(value.replace('dm_world_', '')); isDmTimeline = true; onlyWorld = true; }
    else realPid = parseInt(value);

    setPrivPlayerId(realPid);
    setStatus('Loading…');
    await loadActors(cid, realPid, isDmTimeline, `DM (${user?.username || ''})`);

    let tls = (await timelineApi.listForPlayer(cid, realPid).catch(() => [])) || [];
    if (onlyWorld) {
      let world = tls.find((t) => t.name === WORLD);
      if (!world) { await timelineApi.create(cid, realPid, { name: WORLD }).catch(() => {}); tls = (await timelineApi.listForPlayer(cid, realPid)) || []; world = tls.find((t) => t.name === WORLD); }
      tls = world ? [world] : [];
    } else if (value.startsWith('dm_private_')) {
      tls = tls.filter((t) => t.name !== WORLD);
    }
    setTimelines(tls);
    setStatus(tls.length ? '' : 'No timelines yet. Create one to begin.');
    if (tls.length) await selectTimeline(tls[0].id);
  }, [campaignId, isDM, user, loadActors, resetSelection, selectTimeline, loadCombined]);

  const selectCampaign = useCallback(async (cid) => {
    setCampaignId(cid);
    setPlayerSel('');
    resetSelection();
    setPlayerOptions([]);
    if (!cid) return;
    setMeta((await campaignsApi.getMeta(cid).catch(() => ({}))) || {});
    setPrivLocations((await campaignsApi.listLocations(cid).catch(() => [])) || []);
    setPartyEntries((await timelineApi.partyList(cid).catch(() => [])) || []);
    const players = (await campaignsApi.listPlayers(cid).catch(() => [])) || [];

    if (isDM) {
      const dm = await client.post(`/campaigns/${cid}/dm-player`, {}).catch(() => null);
      const dmId = dm?.player_id || null;
      setDmPlayerId(dmId);
      const regular = players.filter((p) => !p.is_dm_player);
      const opts = [{ value: '', label: '— All Players (Combined View) —' }];
      if (dmId) {
        opts.push({ value: `dm_private_${dmId}`, label: '🔒 DM Private Timeline', group: 'DM' });
        opts.push({ value: `dm_world_${dmId}`, label: '🌍 World Timeline', group: 'DM' });
      }
      regular.forEach((p) => opts.push({ value: String(p.id), label: `${p.player_name}${p.username ? ` (${p.username})` : ''}`, group: 'Players' }));
      setPlayerOptions(opts);
      setPlayerSel('');
      await loadCombined(cid); // default to the combined all-players view
    } else {
      const mine = players.find((p) => parseInt(p.user_id) === parseInt(user.id));
      if (!mine) { setStatus('You are not assigned to a player in this campaign. Ask your DM to assign you in Manage Campaigns.'); return; }
      setPlayerOptions([{ value: String(mine.id), label: mine.player_name }]);
      await selectPlayerOption(String(mine.id), cid);
    }
  }, [isDM, user, resetSelection, selectPlayerOption, loadCombined]);

  const createTimeline = useCallback(async (name) => {
    if (!privPlayerId || !name.trim()) return;
    await timelineApi.create(campaignId, privPlayerId, { name: name.trim() }).catch(() => {});
    const tls = (await timelineApi.listForPlayer(campaignId, privPlayerId)) || [];
    setTimelines(tls);
    setStatus('');
    const created = tls.find((t) => t.name === name.trim()) || tls[tls.length - 1];
    if (created) await selectTimeline(created.id);
  }, [campaignId, privPlayerId, selectTimeline]);

  const deleteTimeline = useCallback(async () => {
    if (!timelineId) return;
    await timelineApi.remove(timelineId).catch(() => {});
    await selectPlayerOption(playerSel); // reload list
  }, [timelineId, playerSel, selectPlayerOption]);

  // Download the selected timeline as a portable `type:'timeline'` JSON (import it
  // from Manage Campaigns → Import).
  const exportTimeline = useCallback(async () => {
    if (!timelineId) return;
    try {
      const bundle = await timelineApi.exportTimeline(timelineId);
      downloadBundle(bundle, {
        module: 'timeline',
        campaign: campaigns.find((c) => String(c.id) === String(campaignId))?.name,
        name: timelines.find((t) => String(t.id) === String(timelineId))?.name,
      });
    } catch (e) { setStatus(e.message || 'Export failed'); }
  }, [timelineId, timelines, campaigns, campaignId]);

  // ── Derived db ─────────────────────────────────────────────
  const todayAbs = meta.today_marker != null && !Number.isNaN(parseInt(meta.today_marker)) ? parseInt(meta.today_marker) : null;

  const combinedDb = useMemo(
    () => (combined ? { ...buildCombinedDb(combinedRows, combinedNames, hiddenTimelines), todayAbs } : null),
    [combined, combinedRows, combinedNames, hiddenTimelines, todayAbs],
  );

  // ── Derived per-timeline db (syncPrivToDb) ─────────────────
  const perTimelineDb = useMemo(() => {
    // Campaign locations are read-only here (no drag-reorder), so present them
    // alphabetically everywhere — sidebar list, canvas columns and pickers.
    const locations = privLocations.map((l) => l.name).sort((a, b) => a.localeCompare(b));
    const players = privPlayers.map((p) => ({ id: p.id, name: p.name, color: p.color }));
    const events = entries.map((e) => ({
      id: String(e.id),
      title: e.title,
      description: e.description || '',
      location: e.location || locations[0] || '',
      year: e.year,
      dayOfYear: e.day_of_year,
      durationDays: e.duration_days || 1,
      playerIds: (e.player_ids && e.player_ids.length) ? e.player_ids : [`self_${privPlayerId}`],
      manualLinks: (e.manual_links || []).map(String),
      // The API only ever sends a player events they may see, so for a player
      // this is always true — it drives the DM's reveal/hide control.
      visibleToPlayers: e.visible_to_players !== false,
    }));
    // Party events show alongside the player's own, in a shared "Party" lane.
    if (partyEntries.length) {
      players.push({ id: 'party', name: '🌍 Party', color: '#e8c96a' });
      partyEntries.forEach((e) => events.push({
        id: `party_${e.id}`,
        title: e.title,
        description: e.description || '',
        location: e.location || locations[0] || '',
        year: e.year,
        dayOfYear: e.day_of_year,
        durationDays: e.duration_days || 1,
        playerIds: ['party'],
        manualLinks: [],
        isParty: true,
        visibleToPlayers: e.visible_to_players !== false,
      }));
    }
    return { players, locations, locationOrder: [...locations], events, todayAbs };
  }, [privPlayers, privLocations, entries, privPlayerId, todayAbs, partyEntries]);

  const db = combined ? combinedDb : perTimelineDb;

  // ── Event CRUD (API-backed) ────────────────────────────────
  const addEvent = useCallback(async ({ title, location, year, midx, day, description, durRaw, playerIds, party }) => {
    const dayOfYear = doyFromForm(midx, +day, +year, calType);
    const payload = {
      title, description: description || '', location: location || null,
      year: +year, day_of_year: dayOfYear, duration_days: parseDuration(durRaw),
    };
    if (party) {
      // Campaign-wide party event — not tied to the selected timeline.
      if (!campaignId) return null;
      const entry = await timelineApi.partyAdd(campaignId, { ...payload, player_ids: [] }).catch(() => null);
      if (entry) setPartyEntries((prev) => [...prev, entry]);
      return entry;
    }
    if (!timelineId) return null;
    const pids = playerIds.length ? playerIds : [`self_${privPlayerId}`];
    const entry = await timelineApi.addEntry(timelineId, { ...payload, player_ids: pids }).catch(() => null);
    if (entry) { entry.player_ids = pids; setEntries((prev) => [...prev, entry]); }
    return entry;
  }, [timelineId, privPlayerId, calType, campaignId]);

  const updateEvent = useCallback(async (id, patch) => {
    if (String(id).startsWith('party_')) {
      const rid = String(id).slice(6);
      const pe = partyEntries.find((e) => String(e.id) === rid);
      if (!pe) return;
      const merged = {
        title: patch.title ?? pe.title,
        description: patch.description ?? pe.description ?? '',
        location: patch.location ?? pe.location ?? null,
        year: patch.year ?? pe.year,
        day_of_year: patch.dayOfYear ?? pe.day_of_year,
        duration_days: patch.durationDays ?? pe.duration_days ?? 1,
      };
      const updated = await timelineApi.partyUpdate(campaignId, pe.id, merged).catch(() => null);
      if (updated) setPartyEntries((prev) => prev.map((e) => (e.id === pe.id ? { ...e, ...updated } : e)));
      return;
    }
    const entry = entries.find((e) => String(e.id) === String(id));
    if (!entry) return;
    const merged = {
      title: patch.title ?? entry.title,
      description: patch.description ?? entry.description ?? '',
      location: patch.location ?? entry.location ?? null,
      year: patch.year ?? entry.year,
      day_of_year: patch.dayOfYear ?? entry.day_of_year,
      duration_days: patch.durationDays ?? entry.duration_days ?? 1,
      player_ids: patch.playerIds ?? entry.player_ids ?? [],
      manual_links: patch.manualLinks ? patch.manualLinks.map((x) => parseInt(x)).filter((n) => !Number.isNaN(n)) : (entry.manual_links || []),
    };
    const updated = await timelineApi.updateEntry(timelineId, entry.id, merged).catch(() => null);
    if (updated) {
      updated.player_ids = merged.player_ids;
      updated.manual_links = merged.manual_links;
      setEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, ...updated } : e)));
    }
  }, [entries, timelineId, partyEntries, campaignId]);

  const deleteEvent = useCallback(async (id) => {
    if (String(id).startsWith('party_')) {
      const rid = String(id).slice(6);
      const pe = partyEntries.find((e) => String(e.id) === rid);
      if (!pe) return;
      const ok = await timelineApi.partyRemove(campaignId, pe.id).catch(() => false);
      if (ok !== false) setPartyEntries((prev) => prev.filter((e) => e.id !== pe.id));
      return;
    }
    const entry = entries.find((e) => String(e.id) === String(id));
    if (!entry) return;
    const ok = await timelineApi.removeEntry(timelineId, entry.id).catch(() => false);
    if (ok !== false) setEntries((prev) => prev.filter((e) => e.id !== entry.id));
  }, [entries, timelineId, partyEntries, campaignId]);

  const moveEventToAbsDay = useCallback(() => {}, []); // handled via updateEvent(year/doy/loc) from drag

  // Share link for whatever is actually on screen: the campaign-wide token in the
  // combined view, and a token scoped to just that timeline when one is selected.
  // The link used to be the campaign one either way, so sharing "this player's
  // timeline" silently handed over every timeline in the campaign.
  const getShareUrl = useCallback(async () => {
    if (!campaignId) return null;
    const scoped = !combined && timelineId;
    const r = scoped
      ? await timelineApi.timelinePublicToken(timelineId).catch(() => null)
      : await campaignsApi.getPublicToken(campaignId).catch(() => null);
    if (!r?.token) return null;
    return {
      url: `${window.location.origin}/timeline-public/${r.token}`,
      scope: scoped ? 'timeline' : 'campaign',
    };
  }, [campaignId, combined, timelineId]);

  // DM-only: reveal or hide one event from the players.
  const toggleEventVisibility = useCallback(async (eventId, visible) => {
    const partyId = String(eventId).startsWith('party_') ? String(eventId).slice(6) : null;
    try {
      if (partyId) {
        await timelineApi.setPartyVisibility(campaignId, partyId, visible);
        setPartyEntries((prev) => prev.map((e) => (String(e.id) === partyId ? { ...e, visible_to_players: visible } : e)));
      } else {
        await timelineApi.setEntryVisibility(timelineId, eventId, visible);
        setEntries((prev) => prev.map((e) => (String(e.id) === String(eventId) ? { ...e, visible_to_players: visible } : e)));
      }
    } catch (e) {
      // Nothing optimistic to revert — the row is only patched on success.
      setStatus(e.message);
    }
  }, [campaignId, timelineId]);

  // ── UI / visibility / derived selectors (mirror personal) ──
  const toggleSection = useCallback((k) => setUi((u) => ({ ...u, collapsed: { ...u.collapsed, [k]: !u.collapsed[k] } })), []);
  const setView = useCallback((v) => setUi((u) => ({ ...u, view: v })), []);
  const togglePlayerVis = useCallback((pid) => setHiddenPlayerArr((a) => (a.includes(pid) ? a.filter((x) => x !== pid) : [...a, pid])), []);
  const toggleLocVis = useCallback((name) => setHiddenLocArr((a) => (a.includes(name) ? a.filter((x) => x !== name) : [...a, name])), []);

  // "Solo" a player — show only their events (ephemeral; overrides eye toggles while active).
  const [soloPlayerId, setSoloPlayerId] = useState(null);
  const setSoloPlayer = useCallback((id) => setSoloPlayerId((cur) => (cur === id ? null : id)), []);

  const hiddenPlayers = useMemo(() => new Set(hiddenPlayerArr), [hiddenPlayerArr]);
  const hiddenLocs = useMemo(() => new Set(hiddenLocArr), [hiddenLocArr]);
  const displayedLocs = db.locations;
  // Exclude the synthetic "Party" lane from actor pickers/lists (it's not selectable).
  const sortedPlayers = useMemo(() => db.players.filter((p) => p.id !== 'party').sort((a, b) => a.name.localeCompare(b.name)), [db.players]);
  const sortedEvents = useMemo(() => [...db.events].sort((a, b) => (a.year - b.year) || (a.dayOfYear - b.dayOfYear)), [db.events]);
  const visibleLocs = useMemo(() => displayedLocs.filter((l) => !hiddenLocs.has(l)), [displayedLocs, hiddenLocs]);
  const visiblePlayers = useMemo(() => db.players.filter((p) => !hiddenPlayers.has(p.id)), [db.players, hiddenPlayers]);

  // No-op mutations that don't apply in campaign mode (read-only actors/locs/today)
  const noop = useCallback(() => {}, []);

  return {
    mode: 'campaign',
    // campaign selection (for the priv-sel-bar)
    campaigns, campaignId, loadCampaigns, selectCampaign,
    playerOptions, playerSel, selectPlayerOption,
    timelines, timelineId, selectTimeline, createTimeline, deleteTimeline, exportTimeline,
    status, isDM, privPlayerId, getShareUrl, toggleEventVisibility,
    // combined (read-only all-players) view
    combined, tree: combined ? (combinedDb?.tree || []) : [], hiddenTimelines, toggleTimeline,
    // shared interface
    db, calType,
    addEvent, updateEvent, deleteEvent, moveEventToAbsDay,
    addPlayer: noop, setPlayerColor: noop, removePlayer: noop,
    addLocation: noop, removeLocation: noop, reorderLocations: noop,
    setToday: noop, clearToday: noop,
    ui, toggleSection, setView, togglePlayerVis, toggleLocVis, hiddenPlayers, hiddenLocs,
    soloPlayerId, setSoloPlayer,
    ppd, setPpd,
    displayedLocs, sortedPlayers, sortedEvents, visibleLocs, visiblePlayers,
    readOnlyActors: true, readOnlyToday: true,
  };
}
