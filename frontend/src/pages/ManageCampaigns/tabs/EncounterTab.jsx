/**
 * pages/ManageCampaigns/tabs/EncounterTab.jsx
 *
 * Stat blocks to read during a fight. Not a combat tracker — initiative, hit
 * points and conditions stay in whatever tool runs the fight (Shieldmaiden,
 * today). This is the other half: the sheets, one click or one key apart.
 *
 * A line-up of NPCs with stat blocks and homebrew creatures. One is shown on
 * the left; one more can be pinned on the right, to read ahead or to keep the
 * boss open while the minions take their turns. Keys 1–9 show a creature,
 * Shift + 1–9 pins it, ← / → step through the line-up.
 *
 * The line-up is remembered per campaign in this browser. It is a reading
 * list, not a record — the next fight starts by changing it, and nothing in
 * the campaign depends on it — so browser storage is enough.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { X, PanelRight } from 'lucide-react';

import { Button, Spinner } from '@/components/ui';
import StatBlockCard from '@/components/StatBlockCard';
import { campaignsApi } from '@/api/campaigns';
import { homebrewApi } from '@/api/homebrew';
import { useCampaignHomebrewSpells } from '@/pages/NpcSheet/homebrewSpells';

const keyOf = (m) => `${m.kind}:${m.id}`;
const storeKey = (cid) => `encounter-lineup:${cid}`;

function readLineup(cid) {
  try {
    const v = JSON.parse(localStorage.getItem(storeKey(cid)) ?? '[]');
    return Array.isArray(v) ? v.filter((m) => (m.kind === 'npc' || m.kind === 'creature') && m.id) : [];
  } catch { return []; }
}

export default function EncounterTab({ campaignId, npcs }) {
  const [lineup, setLineup] = useState(() => readLineup(campaignId));
  const [primary, setPrimary] = useState(null);     // key
  const [secondary, setSecondary] = useState(null); // key
  const [creatures, setCreatures] = useState([]);
  const [sheets, setSheets] = useState(() => new Map()); // npc key → stats | null (none) | undefined (loading)
  const homebrewSpells = useCampaignHomebrewSpells(campaignId);

  useEffect(() => {
    try { localStorage.setItem(storeKey(campaignId), JSON.stringify(lineup)); } catch { /* private window */ }
  }, [campaignId, lineup]);

  useEffect(() => {
    let alive = true;
    homebrewApi.list('creature').then((rows) => { if (alive) setCreatures(rows ?? []); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // NPC stat blocks are fetched when they join the line-up, once each.
  useEffect(() => {
    for (const m of lineup) {
      if (m.kind !== 'npc' || sheets.has(keyOf(m))) continue;
      setSheets((prev) => new Map(prev).set(keyOf(m), undefined));
      campaignsApi.npcSheet(campaignId, m.id)
        .then((r) => setSheets((prev) => new Map(prev).set(keyOf(m), r?.exists ? r.stats : null)))
        .catch(() => setSheets((prev) => new Map(prev).set(keyOf(m), null)));
    }
  }, [lineup, campaignId, sheets]);

  const withSheet = useMemo(() => (npcs ?? []).filter((n) => n.has_sheet)
    .sort((a, b) => a.name.localeCompare(b.name)), [npcs]);
  const sortedCreatures = useMemo(() => [...creatures].sort((a, b) => a.name.localeCompare(b.name)), [creatures]);

  const labelOf = useCallback((m) => (m.kind === 'npc'
    ? (npcs ?? []).find((n) => n.id === m.id)?.name
    : creatures.find((c) => c.id === m.id)?.name) ?? '…', [npcs, creatures]);

  const statsOf = (key) => {
    if (!key) return { state: 'none' };
    const [kind, id] = key.split(':');
    if (kind === 'creature') {
      const c = creatures.find((x) => String(x.id) === id);
      return c ? { state: 'ok', stats: c.data, name: c.name } : { state: 'loading' };
    }
    const s = sheets.get(key);
    if (s === undefined) return { state: 'loading' };
    if (s === null) return { state: 'missing' };
    return { state: 'ok', stats: s };
  };

  function add(value) {
    if (!value) return;
    const [kind, id] = value.split(':');
    const m = { kind, id: Number(id) };
    setLineup((prev) => (prev.some((x) => keyOf(x) === value) ? prev : [...prev, m]));
    setPrimary(value);
  }

  function remove(key) {
    setLineup((prev) => prev.filter((x) => keyOf(x) !== key));
    if (primary === key) setPrimary(null);
    if (secondary === key) setSecondary(null);
  }

  // Shown on the left: the chosen one, or the first in the line-up.
  const left = primary && lineup.some((m) => keyOf(m) === primary) ? primary : (lineup[0] ? keyOf(lineup[0]) : null);

  // Keyboard: the reason this exists is speed. Ignored while typing.
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      const digit = e.code?.startsWith('Digit') ? Number(e.code.slice(5)) : NaN;
      if (digit >= 1 && digit <= 9 && lineup[digit - 1]) {
        e.preventDefault();
        if (e.shiftKey) setSecondary(keyOf(lineup[digit - 1]));
        else setPrimary(keyOf(lineup[digit - 1]));
        return;
      }
      if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && lineup.length) {
        const i = Math.max(0, lineup.findIndex((m) => keyOf(m) === left));
        const step = e.key === 'ArrowRight' ? 1 : -1;
        setPrimary(keyOf(lineup[(i + step + lineup.length) % lineup.length]));
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lineup, left]);

  const pane = (key, which) => {
    const s = statsOf(key);
    if (s.state === 'none') {
      return (
        <p className="text-text-muted text-sm italic text-center py-10">
          {which === 'right'
            ? 'Pin a second stat block here with ⇥ on a name, or Shift + its number.'
            : 'Add NPCs and creatures above, then switch between them with a click or keys 1–9.'}
        </p>
      );
    }
    if (s.state === 'loading') return <div className="flex justify-center py-10"><Spinner /></div>;
    if (s.state === 'missing') {
      return <p className="text-text-muted text-sm italic py-6">{labelOf(lineupItem(key))} has no stat block yet.</p>;
    }
    return (
      <StatBlockCard stats={s.stats} fallbackName={s.name ?? labelOf(lineupItem(key))}
        homebrewSpells={homebrewSpells}
        actions={which === 'right' && (
          <button type="button" onClick={() => setSecondary(null)} title="Unpin"
            className="text-text-muted hover:text-gold"><X size={14} /></button>
        )} />
    );
  };
  const lineupItem = (key) => lineup.find((m) => keyOf(m) === key) ?? { kind: 'npc', id: 0 };

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      {/* The line-up */}
      <div className="flex flex-wrap items-center gap-1.5">
        <select value="" onChange={(e) => add(e.target.value)} aria-label="Add to the line-up"
          className="bg-surface2 border border-border2 text-text px-2 py-1 rounded-sm text-sm max-w-[16rem]">
          <option value="">＋ Add to the line-up…</option>
          {withSheet.length > 0 && (
            <optgroup label="NPCs with a stat block">
              {withSheet.map((n) => <option key={n.id} value={`npc:${n.id}`}>{n.name}</option>)}
            </optgroup>
          )}
          {sortedCreatures.length > 0 && (
            <optgroup label="Homebrew creatures">
              {sortedCreatures.map((c) => <option key={c.id} value={`creature:${c.id}`}>{c.name}</option>)}
            </optgroup>
          )}
        </select>
        {lineup.map((m, i) => {
          const k = keyOf(m);
          const on = k === left;
          const pinned = k === secondary;
          return (
            <span key={k}
              className={`inline-flex items-center gap-1 rounded-sm border text-sm pl-1.5 pr-1 py-0.5
                ${on ? 'border-[var(--gold)] bg-[var(--gold-dim)] text-text' : pinned ? 'border-[var(--gold-dim)] text-gold' : 'border-border text-text-dim'}`}>
              <button type="button" onClick={() => setPrimary(k)} title={i < 9 ? `Show (key ${i + 1})` : 'Show'}
                className="inline-flex items-center gap-1 hover:text-gold">
                {i < 9 && <span className="text-[0.65rem] text-text-muted font-display">{i + 1}</span>}
                {m.kind === 'creature' ? '🐉 ' : ''}{labelOf(m)}
              </button>
              <button type="button" onClick={() => setSecondary(pinned ? null : k)}
                title={pinned ? 'Unpin from the right' : `Pin on the right${i < 9 ? ` (Shift + ${i + 1})` : ''}`}
                aria-label={pinned ? `Unpin ${labelOf(m)}` : `Pin ${labelOf(m)} on the right`}
                className={pinned ? 'text-gold' : 'text-text-muted hover:text-gold'}><PanelRight size={12} /></button>
              <button type="button" onClick={() => remove(k)} aria-label={`Remove ${labelOf(m)}`}
                className="text-text-muted hover:text-danger"><X size={12} /></button>
            </span>
          );
        })}
        {lineup.length > 0 && (
          <Button variant="ghost" onClick={() => { setLineup([]); setPrimary(null); setSecondary(null); }}>
            Clear
          </Button>
        )}
      </div>

      {/* Two panes; one column on a narrow screen, the pinned one underneath. */}
      <div className={`grid gap-4 flex-1 min-h-0 ${secondary ? 'lg:grid-cols-2' : 'lg:grid-cols-[minmax(0,48rem)_1fr]'}`}>
        <div className="bg-surface border border-border rounded-sm p-3 overflow-y-auto min-h-0">{pane(left, 'left')}</div>
        <div className={`bg-surface border border-border rounded-sm p-3 overflow-y-auto min-h-0 ${secondary ? '' : 'max-lg:hidden opacity-70'}`}>
          {pane(secondary, 'right')}
        </div>
      </div>

      {lineup.length > 1 && (
        <p className="text-[0.7rem] text-text-muted">
          Keys: <strong>1–9</strong> show · <strong>Shift + 1–9</strong> pin on the right · <strong>← →</strong> step through
        </p>
      )}
    </div>
  );
}
