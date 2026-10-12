/**
 * hooks/useCombinedTimeline.js
 *
 * Read-only "combined" timeline state (DM combined view + public token view).
 * Builds a synthetic db from flat entry rows and exposes the same interface the
 * canvas/sidebar consume, with no-op mutations. Per-timeline show/hide toggles
 * drive which entries appear.
 */

import { useCallback, useMemo, useState } from 'react';
import { buildCombinedDb } from '@/pages/Timeline/combined';

export function useCombinedTimeline(rows, calType, names, todayMarker) {
  const [ppd, setPpd] = useState(1);
  const [ui, setUi] = useState({ collapsed: { players: true, locs: true }, view: 'graph' });
  const [hiddenTimelines, setHiddenTimelines] = useState(() => new Set());
  const [hiddenPlayerArr, setHiddenPlayerArr] = useState([]);
  const [hiddenLocArr, setHiddenLocArr] = useState([]);

  const built = useMemo(() => buildCombinedDb(rows || [], names || {}, hiddenTimelines), [rows, names, hiddenTimelines]);

  const todayAbs = todayMarker != null && !Number.isNaN(parseInt(todayMarker)) ? parseInt(todayMarker) : null;
  const db = useMemo(() => ({ ...built, todayAbs }), [built, todayAbs]);

  const setView = useCallback((v) => setUi((u) => ({ ...u, view: v })), []);
  const toggleSection = useCallback((k) => setUi((u) => ({ ...u, collapsed: { ...u.collapsed, [k]: !u.collapsed[k] } })), []);
  const toggleTimeline = useCallback((tid) => setHiddenTimelines((s) => { const n = new Set(s); if (n.has(tid)) n.delete(tid); else n.add(tid); return n; }), []);
  const togglePlayerVis = useCallback((id) => setHiddenPlayerArr((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id])), []);
  const toggleLocVis = useCallback((name) => setHiddenLocArr((a) => (a.includes(name) ? a.filter((x) => x !== name) : [...a, name])), []);

  const hiddenPlayers = useMemo(() => new Set(hiddenPlayerArr), [hiddenPlayerArr]);
  const hiddenLocs = useMemo(() => new Set(hiddenLocArr), [hiddenLocArr]);
  const displayedLocs = db.locations;
  const sortedPlayers = useMemo(() => [...db.players].sort((a, b) => a.name.localeCompare(b.name)), [db.players]);
  const sortedEvents = useMemo(() => [...db.events].sort((a, b) => (a.year - b.year) || (a.dayOfYear - b.dayOfYear)), [db.events]);
  const visibleLocs = useMemo(() => displayedLocs.filter((l) => !hiddenLocs.has(l)), [displayedLocs, hiddenLocs]);
  const visiblePlayers = useMemo(() => db.players.filter((p) => !hiddenPlayers.has(p.id)), [db.players, hiddenPlayers]);
  const noop = useCallback(() => {}, []);

  return {
    mode: 'combined', readOnly: true,
    db, calType,
    tree: built.tree, hiddenTimelines, toggleTimeline,
    ppd, setPpd, ui, setView, toggleSection,
    togglePlayerVis, toggleLocVis, hiddenPlayers, hiddenLocs,
    displayedLocs, sortedPlayers, sortedEvents, visibleLocs, visiblePlayers,
    addEvent: noop, updateEvent: noop, deleteEvent: noop, moveEventToAbsDay: noop,
  };
}
