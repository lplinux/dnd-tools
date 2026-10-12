/**
 * hooks/useTimeline.js
 *
 * Personal-mode (localStorage) state for the Timeline tool — the standalone
 * "profiles" experience. Each profile has its own `db` (players, locations,
 * events, today marker) persisted under `ht-db-<id>`; profile metadata lives in
 * `ht-profiles`; view/visibility/collapse UI state in `ht-ui`.
 *
 * Theme is intentionally NOT managed here — the app's ThemeContext (AppHeader
 * switcher) owns it, unlike the legacy page which had its own toggle.
 *
 * Campaign (DB) and public (token) modes are separate layers (later phases).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  absDay, fromAbsDay, doyFromForm, parseDuration, PALETTE,
} from '@/data/calendar';

const META_KEY = 'ht-profiles';
const UI_KEY = 'ht-ui';
const dbKey = (id) => `ht-db-${id}`;

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const DEFAULT_UI = {
  collapsed: { events: true, newev: true, players: true, locs: true, today: true },
  view: 'graph',
  hiddenPlayers: [],
  hiddenLocs: [],
};

function readJSON(key, fallback) {
  try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : fallback; } catch { return fallback; }
}

function migrateEv(ev) {
  const e = { ...ev };
  if (!e.playerIds) { e.playerIds = e.playerId ? [e.playerId] : []; delete e.playerId; }
  if (!e.durationDays || e.durationDays < 1) e.durationDays = 1;
  if (!e.manualLinks) e.manualLinks = [];
  return e;
}

function loadDB(id) {
  const d = readJSON(dbKey(id), null) || {};
  return {
    players: d.players || [],
    locations: d.locations || [],
    locationOrder: d.locationOrder && d.locationOrder.length ? d.locationOrder : [...(d.locations || [])],
    events: (d.events || []).map(migrateEv),
    todayAbs: d.todayAbs === undefined ? null : d.todayAbs,
  };
}

const EMPTY_DB = { players: [], locations: [], locationOrder: [], events: [], todayAbs: null };

export function useTimeline() {
  // ── Profiles ───────────────────────────────────────────────
  const initialMeta = readJSON(META_KEY, { profiles: [], activeId: '' });
  const [profiles, setProfiles] = useState(initialMeta.profiles || []);
  const [activeId, setActiveId] = useState(initialMeta.activeId || '');
  const [db, setDb] = useState(() => (initialMeta.activeId ? loadDB(initialMeta.activeId) : EMPTY_DB));

  // ── UI state ───────────────────────────────────────────────
  const [ui, setUi] = useState(() => {
    const s = readJSON(UI_KEY, {});
    return {
      collapsed: { ...DEFAULT_UI.collapsed, ...(s.collapsed || {}) },
      view: s.view || 'graph',
      hiddenPlayers: s.hiddenPlayers || [],
      hiddenLocs: s.hiddenLocs || [],
    };
  });

  // ── Zoom (runtime only) ────────────────────────────────────
  const [ppd, setPpd] = useState(1);

  // ── Persistence ────────────────────────────────────────────
  useEffect(() => { localStorage.setItem(META_KEY, JSON.stringify({ profiles, activeId })); }, [profiles, activeId]);
  useEffect(() => { if (activeId) localStorage.setItem(dbKey(activeId), JSON.stringify(db)); }, [db, activeId]);
  useEffect(() => { localStorage.setItem(UI_KEY, JSON.stringify(ui)); }, [ui]);

  const activeProfile = useMemo(() => profiles.find((p) => p.id === activeId) || null, [profiles, activeId]);
  const calType = activeProfile?.calendarType || 'harptos';

  // ── Profile actions ────────────────────────────────────────
  const switchProfile = useCallback((id) => {
    setActiveId(id);
    setDb(loadDB(id));
  }, []);

  const createProfile = useCallback((name, calendarType, playersRaw, locsRaw, todayAbs = null) => {
    const id = `p${Date.now().toString(36)}`;
    const players = (playersRaw || '').split(',').map((s) => s.trim()).filter(Boolean)
      .map((nm, i) => ({ id: `pl${i}${Date.now()}`, name: nm, color: PALETTE[i % PALETTE.length] }));
    const locations = (locsRaw || '').split(',').map((s) => s.trim()).filter(Boolean);
    setProfiles((prev) => [...prev, { id, name, calendarType }]);
    setActiveId(id);
    setDb({ players, locations, locationOrder: [...locations], events: [], todayAbs });
    return id;
  }, []);

  const deleteProfile = useCallback(() => {
    if (profiles.length <= 1) return false;
    localStorage.removeItem(dbKey(activeId));
    const remaining = profiles.filter((p) => p.id !== activeId);
    setProfiles(remaining);
    const nextId = remaining[0].id;
    setActiveId(nextId);
    setDb(loadDB(nextId));
    return true;
  }, [profiles, activeId]);

  // ── DB mutation helper ─────────────────────────────────────
  const mutate = useCallback((fn) => setDb((prev) => fn(prev) ?? prev), []);

  // ── Events ─────────────────────────────────────────────────
  const addEvent = useCallback(({ title, location, year, midx, day, description, durRaw, playerIds }) => {
    const dayOfYear = doyFromForm(midx, day, year, calType);
    const ev = {
      id: uid(), title, playerIds: [...playerIds], location, year, dayOfYear,
      description: description || '', durationDays: parseDuration(durRaw), manualLinks: [],
    };
    mutate((d) => ({ ...d, events: [...d.events, ev] }));
    return ev;
  }, [calType, mutate]);

  const updateEvent = useCallback((id, patch) => {
    mutate((d) => ({ ...d, events: d.events.map((e) => (e.id === id ? { ...e, ...patch } : e)) }));
  }, [mutate]);

  const deleteEvent = useCallback((id) => {
    mutate((d) => {
      const events = d.events.filter((e) => e.id !== id);
      const valid = new Set(events.map((e) => e.id));
      return { ...d, events: events.map((e) => ({ ...e, manualLinks: (e.manualLinks || []).filter((mid) => valid.has(mid)) })) };
    });
  }, [mutate]);

  /** Move an event to a new absolute day (drag-reschedule), preserving duration. */
  const moveEventToAbsDay = useCallback((id, abs) => {
    const { year, dayOfYear } = fromAbsDay(Math.max(0, abs), calType);
    updateEvent(id, { year, dayOfYear });
  }, [calType, updateEvent]);

  // ── Players ────────────────────────────────────────────────
  const addPlayer = useCallback((name, color) => {
    mutate((d) => ({ ...d, players: [...d.players, { id: uid(), name, color }] }));
  }, [mutate]);

  const setPlayerColor = useCallback((id, color) => {
    mutate((d) => ({ ...d, players: d.players.map((p) => (p.id === id ? { ...p, color } : p)) }));
  }, [mutate]);

  const removePlayer = useCallback((id) => {
    mutate((d) => {
      const players = d.players.filter((p) => p.id !== id);
      let events = d.events
        .map((e) => ({ ...e, playerIds: (e.playerIds || []).filter((pid) => pid !== id) }))
        .filter((e) => e.playerIds.length > 0);
      const valid = new Set(events.map((e) => e.id));
      events = events.map((e) => ({ ...e, manualLinks: (e.manualLinks || []).filter((mid) => valid.has(mid)) }));
      return { ...d, players, events };
    });
  }, [mutate]);

  // ── Locations ──────────────────────────────────────────────
  const addLocation = useCallback((name) => {
    mutate((d) => (d.locations.includes(name) ? d : { ...d, locations: [...d.locations, name], locationOrder: [...d.locationOrder, name] }));
  }, [mutate]);

  const removeLocation = useCallback((name) => {
    mutate((d) => {
      const events = d.events.filter((e) => e.location !== name);
      const valid = new Set(events.map((e) => e.id));
      return {
        ...d,
        locations: d.locations.filter((l) => l !== name),
        locationOrder: d.locationOrder.filter((l) => l !== name),
        events: events.map((e) => ({ ...e, manualLinks: (e.manualLinks || []).filter((mid) => valid.has(mid)) })),
      };
    });
  }, [mutate]);

  const reorderLocations = useCallback((newOrder) => {
    mutate((d) => ({ ...d, locationOrder: newOrder }));
  }, [mutate]);

  // ── Today marker ───────────────────────────────────────────
  const setToday = useCallback((year, midx, day) => {
    const doy = doyFromForm(midx, day, year, calType);
    mutate((d) => ({ ...d, todayAbs: absDay(year, doy, calType) }));
  }, [calType, mutate]);

  const clearToday = useCallback(() => mutate((d) => ({ ...d, todayAbs: null })), [mutate]);

  // ── UI state ───────────────────────────────────────────────
  const toggleSection = useCallback((k) => setUi((u) => ({ ...u, collapsed: { ...u.collapsed, [k]: !u.collapsed[k] } })), []);
  const setView = useCallback((v) => setUi((u) => ({ ...u, view: v })), []);
  const togglePlayerVis = useCallback((id) => setUi((u) => ({
    ...u, hiddenPlayers: u.hiddenPlayers.includes(id) ? u.hiddenPlayers.filter((x) => x !== id) : [...u.hiddenPlayers, id],
  })), []);
  const toggleLocVis = useCallback((name) => setUi((u) => ({
    ...u, hiddenLocs: u.hiddenLocs.includes(name) ? u.hiddenLocs.filter((x) => x !== name) : [...u.hiddenLocs, name],
  })), []);

  // "Solo" a player — show only their events. Ephemeral (not persisted); overrides
  // the per-player eye toggles while active. Click the same player again to clear.
  const [soloPlayerId, setSoloPlayerId] = useState(null);
  const setSoloPlayer = useCallback((id) => setSoloPlayerId((cur) => (cur === id ? null : id)), []);

  // ── Derived selectors ──────────────────────────────────────
  const displayedLocs = useMemo(() => {
    const ordered = db.locationOrder.filter((l) => db.locations.includes(l));
    const rest = db.locations.filter((l) => !ordered.includes(l));
    return [...ordered, ...rest];
  }, [db.locationOrder, db.locations]);

  const hiddenPlayers = useMemo(() => new Set(ui.hiddenPlayers), [ui.hiddenPlayers]);
  const hiddenLocs = useMemo(() => new Set(ui.hiddenLocs), [ui.hiddenLocs]);

  const sortedPlayers = useMemo(() => [...db.players].sort((a, b) => a.name.localeCompare(b.name)), [db.players]);
  const sortedEvents = useMemo(
    () => [...db.events].sort((a, b) => absDay(a.year, a.dayOfYear, calType) - absDay(b.year, b.dayOfYear, calType)),
    [db.events, calType],
  );
  const visibleLocs = useMemo(() => displayedLocs.filter((l) => !hiddenLocs.has(l)), [displayedLocs, hiddenLocs]);
  const visiblePlayers = useMemo(() => db.players.filter((p) => !hiddenPlayers.has(p.id)), [db.players, hiddenPlayers]);

  return {
    // profiles / calendar
    profiles, activeId, activeProfile, calType,
    switchProfile, createProfile, deleteProfile,
    // data
    db,
    // events
    addEvent, updateEvent, deleteEvent, moveEventToAbsDay,
    // players
    addPlayer, setPlayerColor, removePlayer,
    // locations
    addLocation, removeLocation, reorderLocations,
    // today
    setToday, clearToday,
    // ui
    ui, toggleSection, setView, togglePlayerVis, toggleLocVis,
    hiddenPlayers, hiddenLocs, soloPlayerId, setSoloPlayer,
    // zoom
    ppd, setPpd,
    // derived
    displayedLocs, sortedPlayers, sortedEvents, visibleLocs, visiblePlayers,
  };
}
