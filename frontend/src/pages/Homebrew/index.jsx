/**
 * pages/Homebrew/index.jsx
 *
 * The DM's homebrew library: spells and creatures, plus the Item Cards
 * library as a tab. Kinds still to come are listed as such, so the page does
 * not pretend to be complete.
 *
 * A library, not per campaign (see homebrew_entries in app.js): an entry is
 * written once here, then each campaign chooses whether it USES it and
 * whether its players have SEEN it — the Campaigns panel on the right. A
 * spell used at two tables is one spell, edited once.
 *
 * A spell is stored in the shape the stat sheet already reads SRD spells
 * into, so the card on the right IS the card a player will see. A creature
 * is a stat block, edited in the very sheet an NPC's is.
 */

import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import AppHeader from '@/components/layout/AppHeader';
import { Button, Modal, FormField, Spinner } from '@/components/ui';
import SpellCard from '@/components/SpellCard';
import StatsSheetFrame from '@/components/StatsSheetFrame';
import SrdCombobox from '@/components/SrdCombobox';
import { useToast } from '@/hooks/useToast';
import { useConfirm } from '@/contexts/ConfirmContext';
import { homebrewApi } from '@/api/homebrew';
import { campaignsApi } from '@/api/campaigns';
import { lookupRaw } from '@/api/srd';
import { downloadBundle } from '@/api/downloadBundle';
import { spellFromSrd, levelShort } from '@/data/spellDetails';
import {
  KINDS, STATUSES, SCHOOLS, blankSpell, spellFromHomebrew, spellToHomebrew, creatureLine,
} from '@/data/homebrew';

// The Item Cards page, as the Items tab. Lazy: it is large and most visits
// here are for spells.
const ItemCards = lazy(() => import('@/pages/ItemCards'));

const INPUT = [
  'w-full bg-surface2 border border-border2 text-text px-2 py-1.5 rounded-sm text-sm font-body',
  'focus:outline-none focus:border-[var(--gold-dim)]',
].join(' ');

const statusOf = (id) => STATUSES.find((s) => s.id === id) ?? STATUSES[0];

function StatusChip({ status }) {
  const s = statusOf(status);
  const cls = status === 'final' ? 'border-[var(--gold-dim)] text-gold'
    : status === 'playtest' ? 'border-[var(--gold)] text-text bg-[var(--gold-dim)]'
      : 'border-border text-text-muted';
  return (
    <span title={s.hint}
      className={`text-[0.65rem] font-display uppercase tracking-wider px-1.5 py-0.5 rounded-sm border ${cls}`}>
      {s.label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// The editor
// ─────────────────────────────────────────────────────────────────────────────
function SpellEditor({ form, setForm, busy, onSave, onClose }) {
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setData = (k, v) => setForm((f) => ({ ...f, data: { ...f.data, [k]: v } }));
  const d = form.data;
  const { toast } = useToast();

  /** Start from an official spell: fills every field, and remembers which. */
  async function startFrom(name) {
    const s = spellFromSrd(await lookupRaw('spells', name));
    if (!s) { toast(`No SRD details for “${name}”.`, 'error'); return; }
    setForm((f) => ({
      ...f,
      // Keep a name already typed; an empty one takes the SRD's, marked as yours.
      name: f.name.trim() ? f.name : `${s.name} (homebrew)`,
      based_on: s.name,
      data: spellToHomebrew(s),
    }));
  }

  const toggleComponent = (c) => setData('components',
    d.components.includes(c) ? d.components.filter((x) => x !== c) : [...d.components, c]);

  return (
    <div className="flex flex-col gap-3">
      {!form.id && (
        <FormField label="Start from an official spell (optional)">
          <SrdCombobox value="" onChange={() => {}} onPick={startFrom} srdResource="spells"
            inputClassName={INPUT} placeholder="Search the SRD spells…" />
        </FormField>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr] gap-3">
        <FormField label="Name">
          <input type="text" value={form.name} onChange={set('name')} maxLength={255} className={INPUT} autoFocus />
        </FormField>
        <FormField label="Status">
          <select value={form.status} onChange={set('status')} className={INPUT}>
            {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label} — {s.hint}</option>)}
          </select>
        </FormField>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <FormField label="Level">
          <select value={d.level} onChange={(e) => setData('level', Number(e.target.value))} className={INPUT}>
            {Array.from({ length: 10 }, (_, i) => <option key={i} value={i}>{levelShort(i)}</option>)}
          </select>
        </FormField>
        <FormField label="School">
          <select value={d.school} onChange={(e) => setData('school', e.target.value)} className={INPUT}>
            <option value="">—</option>
            {SCHOOLS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </FormField>
        <FormField label="Casting time">
          <input type="text" value={d.castingTime} onChange={(e) => setData('castingTime', e.target.value)}
            placeholder="Action" className={INPUT} />
        </FormField>
        <FormField label="Range">
          <input type="text" value={d.range} onChange={(e) => setData('range', e.target.value)}
            placeholder="60 feet" className={INPUT} />
        </FormField>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr_1fr] gap-3 items-end">
        <FormField label="Components">
          <span className="flex gap-3 py-1.5">
            {['V', 'S', 'M'].map((c) => (
              <label key={c} className="flex items-center gap-1 text-sm text-text">
                <input type="checkbox" checked={d.components.includes(c)} onChange={() => toggleComponent(c)}
                  className="accent-[var(--gold)]" />
                {c}
              </label>
            ))}
          </span>
        </FormField>
        <FormField label="Material">
          <input type="text" value={d.material} disabled={!d.components.includes('M')}
            onChange={(e) => setData('material', e.target.value)}
            placeholder={d.components.includes('M') ? 'a pinch of ash' : 'Tick M first'} className={INPUT} />
        </FormField>
        <FormField label="Duration">
          <input type="text" value={d.duration} onChange={(e) => setData('duration', e.target.value)}
            placeholder="Instantaneous" className={INPUT} />
        </FormField>
      </div>

      <div className="flex gap-4 flex-wrap text-sm text-text">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={d.concentration} className="accent-[var(--gold)]"
            onChange={(e) => setData('concentration', e.target.checked)} />
          Concentration
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={d.ritual} className="accent-[var(--gold)]"
            onChange={(e) => setData('ritual', e.target.checked)} />
          Ritual
        </label>
      </div>

      <FormField label="Description">
        <textarea rows={8} value={d.description} onChange={(e) => setData('description', e.target.value)}
          className={INPUT} placeholder="What the spell does. A blank line starts a new paragraph." />
      </FormField>
      <FormField label="Using a higher-level spell slot">
        <textarea rows={2} value={d.higherLevel} onChange={(e) => setData('higherLevel', e.target.value)}
          className={INPUT} />
      </FormField>
      <FormField label="Classes (comma-separated)">
        <input type="text" value={d.classes.join(', ')}
          onChange={(e) => setData('classes', e.target.value.split(',').map((c) => c.trimStart()))}
          onBlur={() => setData('classes', d.classes.map((c) => c.trim()).filter(Boolean))}
          placeholder="Sorcerer, Wizard" className={INPUT} />
      </FormField>
      <FormField label="Balance notes — only you see these">
        <textarea rows={3} value={form.balance_note} onChange={set('balance_note')} className={INPUT}
          placeholder="Why it is the way it is; what to watch for at the table." />
      </FormField>
      {form.based_on && (
        <p className="text-[0.7rem] text-text-muted italic">
          Based on the official <strong>{form.based_on}</strong>.{' '}
          <button type="button" className="underline hover:text-gold"
            onClick={() => setForm((f) => ({ ...f, based_on: '' }))}>Forget that</button>
        </p>
      )}

      <div className="flex gap-2 justify-end">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="accent" loading={busy} onClick={onSave} disabled={!form.name.trim()}>Save</Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// A creature's name, status and notes. Its stat block is edited in the sheet
// itself, so this is everything about it that is not on the sheet.
// ─────────────────────────────────────────────────────────────────────────────
function DetailsEditor({ form, setForm, busy, onSave, onClose }) {
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr] gap-3">
        <FormField label="Name">
          <input type="text" value={form.name} onChange={set('name')} maxLength={255} className={INPUT} autoFocus />
        </FormField>
        <FormField label="Status">
          <select value={form.status} onChange={set('status')} className={INPUT}>
            {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label} — {s.hint}</option>)}
          </select>
        </FormField>
      </div>
      <FormField label="Balance notes — only you see these">
        <textarea rows={4} value={form.balance_note} onChange={set('balance_note')} className={INPUT}
          placeholder="Where it comes from, what CR it really plays at, what to watch for." />
      </FormField>
      {!form.id && (
        <p className="text-[0.7rem] text-text-muted italic">
          Once it exists, fill in its stat block on the right — or pull a monster from the SRD inside
          the sheet and change what you like.
        </p>
      )}
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="accent" loading={busy} onClick={onSave} disabled={!form.name.trim()}>Save</Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Which campaigns use the selected entry
// ─────────────────────────────────────────────────────────────────────────────
function CampaignUse({ entry, campaigns, onChange }) {
  const use = new Map(entry.campaigns.map((c) => [c.campaign_id, c]));
  if (!campaigns.length) {
    return <p className="text-text-dim text-xs italic">You have no campaigns yet.</p>;
  }
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-[0.65rem] font-display uppercase tracking-wider text-text-muted text-left">
          <th className="font-normal py-1">Campaign</th>
          <th className="font-normal py-1 text-center" title="This campaign uses it">Uses it</th>
          <th className="font-normal py-1 text-center" title="Its players can see it">Revealed</th>
        </tr>
      </thead>
      <tbody>
        {campaigns.map((c) => {
          const u = use.get(c.id);
          return (
            <tr key={c.id} className="border-t border-border">
              <td className="py-1.5 pr-2 text-text">{c.name}</td>
              <td className="py-1.5 text-center">
                <input type="checkbox" checked={!!u} className="accent-[var(--gold)]"
                  aria-label={`Use in ${c.name}`}
                  onChange={(e) => onChange(c, { used: e.target.checked, is_public: false })} />
              </td>
              <td className="py-1.5 text-center">
                {/* Revealing something the campaign does not use would mean nothing. */}
                <input type="checkbox" checked={!!u?.is_public} disabled={!u} className="accent-[var(--gold)]"
                  aria-label={`Reveal to the players of ${c.name}`}
                  onChange={(e) => onChange(c, { used: true, is_public: e.target.checked })} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────
export default function Homebrew() {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [kind, setKind] = useState('spell');
  const [entries, setEntries] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);

  const fail = useCallback((e) => toast(e?.message || String(e), 'error'), [toast]);
  const importRef = useRef(null);
  // Bumped after an import, so the list below refetches.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (KINDS.find((k) => k.id === kind)?.embedded) return undefined;
    let alive = true;
    setLoading(true);
    Promise.all([homebrewApi.list(kind), campaignsApi.list().catch(() => [])])
      .then(([rows, camps]) => {
        if (!alive) return;
        setEntries(rows ?? []);
        setCampaigns((camps ?? []).slice().sort((a, b) => a.name.localeCompare(b.name)));
      })
      .catch(fail)
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [kind, fail, reloadKey]);

  /** Every kind, not just the tab on screen: the file is the whole library. */
  async function exportLibrary() {
    try {
      const bundle = await homebrewApi.exportAll();
      if (!bundle.entries.length) { toast('Your library is empty — nothing to export.'); return; }
      downloadBundle(bundle, { module: 'homebrew' });
    } catch (e) { fail(e); }
  }

  async function importLibrary(file) {
    let bundle;
    try { bundle = JSON.parse(await file.text()); } catch { toast('That file is not JSON.', 'error'); return; }
    try {
      const r = await homebrewApi.importAll(bundle);
      setReloadKey((k) => k + 1);
      toast([
        `${r.added} added`,
        r.skipped.length ? `${r.skipped.length} already in your library (kept yours): ${r.skipped.slice(0, 5).join(', ')}${r.skipped.length > 5 ? '…' : ''}` : null,
        r.invalid ? `${r.invalid} unreadable` : null,
      ].filter(Boolean).join(' · '));
    } catch (e) { fail(e); }
  }

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries
      .filter((e) => !statusFilter || e.status === statusFilter)
      .filter((e) => !q || [e.name, e.data?.school, e.data?.description, e.based_on,
        e.data?.race, e.data?.cr]
        .some((v) => String(v ?? '').toLowerCase().includes(q)))
      // Spells by level, the way a spell list reads; creatures by name.
      .sort((a, b) => (kind === 'spell' ? (a.data?.level ?? 0) - (b.data?.level ?? 0) : 0)
        || a.name.localeCompare(b.name));
  }, [entries, query, statusFilter, kind]);

  const selected = entries.find((e) => e.id === selectedId) ?? null;

  const openNew = () => setForm({ name: '', status: 'draft', balance_note: '', based_on: '',
    data: kind === 'spell' ? blankSpell() : {} });
  const openEdit = (e) => setForm({
    id: e.id, name: e.name, status: e.status, balance_note: e.balance_note ?? '',
    based_on: e.based_on ?? '', data: kind === 'spell' ? { ...blankSpell(), ...e.data } : e.data,
  });

  /*
   * A creature's stat block, saved from the sheet. Everything else about the
   * entry goes back as it is — an edit replaces the whole row. A new
   * creature's sheet carries its name across, so the two start the same.
   */
  const saveStats = useCallback(async (entry, stats) => {
    const saved = await homebrewApi.update(entry.id, {
      name: entry.name, status: entry.status, data: stats,
      balance_note: entry.balance_note ?? '', based_on: entry.based_on ?? '',
    });
    setEntries((prev) => prev.map((e) => (e.id === saved.id ? { ...e, ...saved } : e)));
    return saved;
  }, []);

  async function save() {
    setBusy(true);
    try {
      const payload = { kind, name: form.name, status: form.status, data: form.data,
        balance_note: form.balance_note, based_on: form.based_on };
      if (form.id) {
        const saved = await homebrewApi.update(form.id, payload);
        setEntries((prev) => prev.map((e) => (e.id === saved.id ? { ...e, ...saved } : e)));
      } else {
        if (kind === 'creature') payload.data = { char_name: form.name.trim() };
        const saved = await homebrewApi.create(payload);
        setEntries((prev) => [saved, ...prev]);
        setSelectedId(saved.id);
      }
      setForm(null);
    } catch (e) { fail(e); } finally { setBusy(false); }
  }

  async function remove(e) {
    const used = e.campaigns.map((c) => c.campaign_name);
    const ok = await confirm(
      `Delete “${e.name}”?${used.length ? ` ${used.join(', ')} will stop using it.` : ''} This cannot be undone.`,
      { title: 'Delete homebrew', confirmLabel: 'Delete' },
    );
    if (!ok) return;
    try {
      await homebrewApi.remove(e.id);
      setEntries((prev) => prev.filter((x) => x.id !== e.id));
      setSelectedId(null);
    } catch (err) { fail(err); }
  }

  async function changeUse(entry, campaign, to) {
    try {
      const r = await homebrewApi.setUse(campaign.id, entry.id, to);
      setEntries((prev) => prev.map((e) => {
        if (e.id !== entry.id) return e;
        const rest = e.campaigns.filter((c) => c.campaign_id !== campaign.id);
        return { ...e, campaigns: r.used
          ? [...rest, { campaign_id: campaign.id, campaign_name: campaign.name, is_public: r.is_public }]
          : rest };
      }));
    } catch (err) { fail(err); }
  }

  const kindDef = KINDS.find((k) => k.id === kind);
  const ready = kindDef?.ready;
  const noun = kindDef?.noun ?? 'entry';

  return (
    <>
      <AppHeader icon="🧪" name="Homebrew">
        <div className="flex gap-1 flex-wrap items-center">
          {KINDS.map((k) => (
            <button key={k.id} type="button" disabled={!k.ready}
              onClick={() => { setKind(k.id); setSelectedId(null); }}
              title={k.ready ? undefined : 'Coming next'}
              className={`text-[0.7rem] font-display uppercase tracking-wider px-2 py-1 rounded-sm border transition-colors
                ${kind === k.id ? 'border-[var(--gold-dim)] text-gold bg-surface2'
                  : k.ready ? 'border-border text-text-dim hover:text-gold' : 'border-border text-text-muted opacity-50 cursor-not-allowed'}`}>
              {k.label}
            </button>
          ))}
          {/* The library on its own — not part of any campaign file. Not on the
              Items tab, which has its own: item cards travel in their own file. */}
          {!kindDef?.embedded && (
            <>
              <span className="hdr-sep" />
              <Button variant="default" onClick={exportLibrary} title="Save your whole homebrew library (spells and creatures) as a file">
                ⬇ Export
              </Button>
              <Button variant="default" onClick={() => importRef.current?.click()}
                title="Add entries from a homebrew file. Names you already have are kept as they are.">
                ⬆ Import
              </Button>
            </>
          )}
          <input ref={importRef} type="file" accept=".json,application/json" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) importLibrary(f); e.target.value = ''; }} />
        </div>
      </AppHeader>

      {kindDef?.embedded ? (
        <Suspense fallback={<div className="flex justify-center py-12"><Spinner /></div>}>
          <ItemCards embedded />
        </Suspense>
      ) : (
      <div className="flex flex-1 min-h-0 overflow-hidden max-lg:flex-col">
        {/* The library */}
        <aside className={`lg:w-80 lg:border-r border-border flex flex-col min-h-0 ${selected ? 'max-lg:hidden' : 'flex-1 lg:flex-none'}`}>
          <div className="p-3 flex flex-col gap-2 border-b border-border">
            <div className="flex gap-2">
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search your ${noun}s…`} aria-label="Search your homebrew" className={INPUT} />
              <Button variant="accent" onClick={openNew} disabled={!ready}>＋ New</Button>
            </div>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by status" className={INPUT}>
              <option value="">Every status</option>
              {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
          <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1">
            {loading && <div className="flex justify-center py-8"><Spinner /></div>}
            {!loading && !shown.length && (
              <p className="text-text-dim text-sm italic p-3">
                {entries.length ? 'Nothing matches.' : kind === 'spell'
                  ? 'No homebrew spells yet. ＋ New starts one — from scratch, or from an official spell.'
                  : 'No homebrew creatures yet. ＋ New starts one; its stat block can be pulled from the SRD and changed.'}
              </p>
            )}
            {!loading && shown.map((e) => (
              <button key={e.id} type="button" onClick={() => setSelectedId(e.id)}
                className={`text-left px-2 py-1.5 rounded-sm border transition-colors flex flex-col gap-0.5
                  ${e.id === selectedId ? 'border-[var(--gold-dim)] bg-surface2' : 'border-transparent hover:bg-surface2'}`}>
                <span className="flex items-center gap-2">
                  <span className="text-sm text-text flex-1 truncate">{e.name}</span>
                  <StatusChip status={e.status} />
                </span>
                <span className="text-[0.7rem] text-text-muted">
                  {kind === 'spell'
                    ? `${levelShort(e.data?.level ?? 0)}${e.data?.school ? ` · ${e.data.school}` : ''}`
                    : creatureLine(e.data) || 'No stat block yet'}
                  {e.campaigns.length ? ` · in ${e.campaigns.length} campaign${e.campaigns.length === 1 ? '' : 's'}` : ''}
                </span>
              </button>
            ))}
          </div>
        </aside>

        {/* The selected entry */}
        <main className={`flex-1 overflow-y-auto p-4 ${selected ? '' : 'max-lg:hidden'}`}>
          {!selected ? (
            <p className="text-text-dim italic text-sm text-center py-12">
              Pick a {noun} on the left, or start a new one.
            </p>
          ) : (
            <div className={`${kind === 'creature' ? 'max-w-5xl' : 'max-w-3xl'} mx-auto flex flex-col gap-4`}>
              <div className="flex items-center gap-2 flex-wrap">
                <button type="button" className="lg:hidden text-text-muted hover:text-gold text-sm"
                  onClick={() => setSelectedId(null)}>‹ All</button>
                <h2 className="font-display text-gold uppercase tracking-widest text-base flex-1">{selected.name}</h2>
                <StatusChip status={selected.status} />
                <Button variant="default" onClick={() => openEdit(selected)}>
                  {kind === 'spell' ? '✎ Edit' : '✎ Details'}
                </Button>
                <Button variant="danger" onClick={() => remove(selected)} title="Delete">✕</Button>
              </div>

              {kind === 'spell' ? (
                <div className="bg-surface2 border border-border rounded-sm p-4">
                  <SpellCard spell={spellFromHomebrew(selected)} />
                </div>
              ) : (
                // Keyed by entry, so picking another creature loads its sheet
                // rather than pushing new stats into one mid-edit.
                <div className="border border-border rounded-sm overflow-hidden">
                  <StatsSheetFrame key={selected.id}
                    stats={selected.data}
                    onSave={(stats) => saveStats(selected, stats)}
                    frameId={`homebrew=${selected.id}`}
                    title={`${selected.name} stat block`} />
                </div>
              )}

              {selected.based_on && (
                <p className="text-[0.75rem] text-text-muted italic">Based on the official {selected.based_on}.</p>
              )}
              {selected.balance_note && (
                <section className="flex flex-col gap-1">
                  <h3 className="font-display uppercase tracking-wider text-gold text-xs">Balance notes · only you</h3>
                  <p className="text-sm text-text-dim whitespace-pre-wrap">{selected.balance_note}</p>
                </section>
              )}

              <section className="flex flex-col gap-2">
                <h3 className="font-display uppercase tracking-wider text-gold text-xs border-b border-[var(--gold-dim)] pb-1">
                  Campaigns
                </h3>
                <p className="text-[0.7rem] text-text-muted italic">
                  A campaign that uses it has it to hand. Its players see it only once it is revealed.
                </p>
                <CampaignUse entry={selected} campaigns={campaigns}
                  onChange={(c, to) => changeUse(selected, c, to)} />
              </section>
            </div>
          )}
        </main>
      </div>
      )}

      <Modal open={!!form} onClose={() => setForm(null)}
        title={form?.id ? `✎ Edit ${noun}` : `＋ New homebrew ${noun}`}
        className={kind === 'spell' ? '!max-w-[95vw] !w-[95vw] !max-h-[92vh]' : undefined}>
        {form && (kind === 'spell'
          ? <SpellEditor form={form} setForm={setForm} busy={busy} onSave={save} onClose={() => setForm(null)} />
          : <DetailsEditor form={form} setForm={setForm} busy={busy} onSave={save} onClose={() => setForm(null)} />)}
      </Modal>
    </>
  );
}
