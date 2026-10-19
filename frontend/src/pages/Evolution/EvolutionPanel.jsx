/**
 * pages/Evolution/EvolutionPanel.jsx
 *
 * Character evolution — how each character can grow, and what it costs.
 *
 * PRIVATE TO THE DM. It lives in Manage Campaigns, which is DM-only as a
 * whole, rather than on the PC sheet: this is what a character could become
 * and most of it is next session's plot, so the safest place is the page a
 * player cannot open at all.
 *
 * One character at a time, because the notes it is modelled on are one file
 * per kind and one block per character — reading across characters is not
 * something the DM does, and a page showing all six at once is a wall.
 *
 * "The party" is a real selection, not a special case bolted on: a card
 * with no character is campaign-wide, for a path or a teacher the whole
 * group shares.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';

import { Button, Modal, FormField, Spinner } from '@/components/ui';
import { useToast } from '@/hooks/useToast';
import { useConfirm } from '@/contexts/ConfirmContext';
import { pathsApi } from '@/api/paths';
import LinkingTextarea from '@/components/LinkingTextarea';
import CrossLinkPopover from '@/components/CrossLinkPopover';
import { useCrossLinks } from '@/hooks/useCrossLinks';
import PathCard from './PathCard';
import { CATEGORIES, treeFor, countTree } from './constants';

const INPUT = 'w-full bg-surface border border-border rounded-sm px-2 py-1.5 text-sm text-text';

/** One category, collapsed by default with its count on the heading. */
function Group({ def, tree, open, onToggle, links, onLinkClick, actions, isOpen, onToggleItem }) {
  const total = countTree(tree);
  return (
    <section className="flex flex-col gap-1.5">
      <div className="sticky top-0 z-20 -mx-4 px-4 pt-2 pb-1 bg-surface
                      flex items-center gap-2 border-b border-[var(--gold-dim)]">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex items-center gap-2 flex-1 text-left font-display uppercase
                     tracking-widest text-[0.65rem] text-gold hover:text-text transition-colors"
        >
          <span>{open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</span>
          <span className="flex-1">{def.label}</span>
          <span className="text-text-muted normal-case tracking-normal">({total})</span>
        </button>
      </div>

      {open && (
        <>
          <p className="text-[0.65rem] text-text-muted italic">{def.hint}</p>
          {!tree.length && <p className="text-text-dim text-sm italic py-2">Nothing here yet.</p>}
          {tree.map((i) => (
            <PathCard
              key={i.id} item={i} links={links} onLinkClick={onLinkClick}
              actions={actions} isOpen={isOpen} onToggle={onToggleItem}
            />
          ))}
          <div>
            <Button variant="ghost" onClick={() => actions.addRoot(def.id)}>
              <Plus size={11} className="inline mr-1" />{def.addLabel}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}

export default function EvolutionPanel({ campaignId, players }) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const { targets, index } = useCrossLinks(campaignId);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  // null is "the party" and a real choice, so `undefined` means "not picked
  // yet" and the first player wins below.
  const [who, setWho] = useState(undefined);
  const [openGroups, setOpenGroups] = useState(new Set(['path']));
  const [openCards, setOpenCards] = useState(new Set());
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [popover, setPopover] = useState(null);

  const fail = useCallback((e) => toast(e?.message || 'Something went wrong'), [toast]);

  const load = useCallback(async () => {
    if (!campaignId) { setItems([]); return; }
    setLoading(true);
    try {
      const d = await pathsApi.list(campaignId);
      setItems(d.items ?? []);
      // Everything with children starts open except what is done — the same
      // rule session prep settled on, for the same reason.
      const parents = new Set((d.items ?? []).map((i) => i.parent_id).filter(Boolean));
      setOpenCards(new Set((d.items ?? [])
        .filter((i) => parents.has(i.id) && i.state !== 'done').map((i) => i.id)));
    } catch (e) { fail(e); } finally { setLoading(false); }
  }, [campaignId, fail]);
  useEffect(() => { load(); }, [load]);

  /*
   * Sorted by name, with the party always last.
   *
   * The party is appended after this list rather than sorted into it, so
   * it keeps its place however the characters are named — it is not one of
   * them, and a 🎲 landing between two players reads as one.
   */
  const roster = useMemo(
    () => [...(players ?? [])].sort((a, b) =>
      String(a.player_name ?? '').localeCompare(String(b.player_name ?? ''))),
    [players],
  );
  const current = who === undefined ? (roster[0]?.id ?? null) : who;

  const openLink = useCallback(({ kind, id }, e) => {
    const rows = kind === 'npc' ? targets.npcs : targets.locations;
    const hit = (rows ?? []).find((r) => String(r.id) === String(id));
    if (!hit) return;
    setPopover({ target: { ...hit, kind }, at: { x: e.clientX, y: e.clientY } });
  }, [targets]);

  const isOpen = useCallback((id) => openCards.has(id), [openCards]);
  const toggleCard = useCallback((id) => setOpenCards((s) => {
    const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n;
  }), []);
  const toggleGroup = (id) => setOpenGroups((s) => {
    const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n;
  });

  const actions = {
    addRoot: (category) => setForm({ category, parent_id: null, player_id: current, title: '', body: '' }),
    addChild: (item) => setForm({
      category: item.category, parent_id: item.id, player_id: item.player_id, title: '', body: '',
    }),
    edit: (item) => setForm({ id: item.id, title: item.title ?? '', body: item.body ?? '' }),
    setState: async (item, state) => {
      try {
        const { updated } = await pathsApi.setState(campaignId, item.id, state);
        // Patched in place: reloading would collapse every open card and
        // send the page back to the top, mid-edit.
        const by = new Map(updated.map((u) => [u.id, u]));
        setItems((prev) => prev.map((i) => by.get(i.id) ?? i));
      } catch (e) { fail(e); }
    },
    remove: async (item) => {
      const kids = items.filter((i) => i.parent_id === item.id).length;
      const ok = await confirm(
        `Delete "${item.title || 'this card'}"?${kids ? ` Its ${kids} sub-card${kids === 1 ? '' : 's'} go too.` : ''}`,
        { title: 'Delete card', confirmLabel: 'Delete' },
      );
      if (!ok) return;
      try {
        await pathsApi.remove(campaignId, item.id);
        setItems((prev) => {
          // Mirror the server's cascade rather than refetching.
          const doomed = new Set([item.id]);
          for (let pass = 0; pass < 50; pass++) {
            const before = doomed.size;
            for (const i of prev) if (i.parent_id != null && doomed.has(i.parent_id)) doomed.add(i.id);
            if (doomed.size === before) break;
          }
          return prev.filter((i) => !doomed.has(i.id));
        });
      } catch (e) { fail(e); }
    },
  };

  async function save() {
    setBusy(true);
    try {
      if (form.id) {
        const saved = await pathsApi.update(campaignId, form.id, form);
        setItems((prev) => prev.map((i) => (i.id === saved.id ? saved : i)));
      } else {
        const saved = await pathsApi.add(campaignId, form);
        setItems((prev) => [...prev, saved]);
        if (saved.parent_id != null) setOpenCards((s) => new Set(s).add(saved.parent_id));
        setOpenGroups((s) => new Set(s).add(saved.category));
      }
      setForm(null);
    } catch (e) { fail(e); } finally { setBusy(false); }
  }

  if (!campaignId) {
    return <p className="text-text-dim text-sm italic text-center py-8">Pick a campaign first.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[0.65rem] text-text-muted italic">
        Yours alone — there is no player-facing view of any of this.
      </p>

      {/* Who. "The party" is a selection, not a special case. */}
      <div className="flex items-center gap-1.5 flex-wrap border border-border rounded-sm
                      bg-surface2/40 p-2">
        {roster.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setWho(p.id)}
            className={`text-[0.7rem] px-2 py-1 rounded-sm border transition-colors ${
              String(current) === String(p.id)
                ? 'border-[var(--gold)] text-gold bg-[var(--gold-glow)]'
                : 'border-border text-text-dim hover:border-border2'}`}
          >
            {p.player_name}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setWho(null)}
          className={`text-[0.7rem] px-2 py-1 rounded-sm border transition-colors ${
            current == null
              ? 'border-[var(--gold)] text-gold bg-[var(--gold-glow)]'
              : 'border-border text-text-dim hover:border-border2'}`}
        >
          🎲 The party
        </button>
      </div>

      {loading && <div className="flex justify-center py-10"><Spinner /></div>}

      {!loading && CATEGORIES.map((def) => (
        <Group
          key={def.id}
          def={def}
          tree={treeFor(items, current, def.id)}
          open={openGroups.has(def.id)}
          onToggle={() => toggleGroup(def.id)}
          links={index}
          onLinkClick={openLink}
          actions={actions}
          isOpen={isOpen}
          onToggleItem={toggleCard}
        />
      ))}

      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        title={form?.id ? 'Edit card' : 'New card'}
        className="max-w-2xl"
      >
        {form && (
          <div className="flex flex-col gap-3">
            <FormField label="Title">
              <input type="text" value={form.title} maxLength={255} className={INPUT} autoFocus
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            </FormField>
            <FormField label="Notes">
              <LinkingTextarea
                value={form.body}
                onChange={(v) => setForm((f) => ({ ...f, body: v }))}
                targets={targets}
                rows={8}
                className={INPUT}
              />
              <p className="text-text-muted text-[0.7rem] mt-1">
                Type <code>[[</code> to link a place or a person.
              </p>
            </FormField>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setForm(null)}>Cancel</Button>
              <Button variant="accent" loading={busy} onClick={save}>Save</Button>
            </div>
          </div>
        )}
      </Modal>

      <CrossLinkPopover
        target={popover?.target ?? null}
        at={popover?.at}
        campaignId={campaignId}
        mapPath={null}
        onClose={() => setPopover(null)}
      />
    </div>
  );
}
