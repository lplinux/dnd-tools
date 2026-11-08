/**
 * pages/Sessions/BacklogPanel.jsx
 *
 * The campaign backlog: things to use some day that belong to no session
 * yet — a letter to deliver, an NPC to bring back, a reveal.
 *
 * Shown under every session, because the moment to reach for one is while
 * planning a session, and a backlog in another tab is a backlog nobody
 * reads. A card goes into the session on screen with one click and leaves
 * the backlog as it does; a session card comes back the same way.
 *
 * Done and Skipped cards fold away into one line at the bottom rather than
 * being deleted: the backlog shows what is still live, and "did we ever use
 * that letter?" is still answerable months later. Marking a card Done while
 * a session is open offers to move it INTO that session, where it then sits
 * in the record of the night it was used.
 *
 * Self-contained, like the panel it sits in: it owns its fetching and its
 * own open/closed set. Backlog ids come from another table, so sharing the
 * session's set would let card 12 here open card 12 there.
 */

import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';

import { Button, Modal, FormField } from '@/components/ui';
import { useToast } from '@/hooks/useToast';
import { useConfirm } from '@/contexts/ConfirmContext';
import { pendingsApi } from '@/api/pendings';
import LinkingTextarea from '@/components/LinkingTextarea';
import ItemCard from './ItemCard';
import { nest } from './constants';

const INPUT = [
  'w-full bg-surface2 border border-border2 text-text px-2 py-1.5 rounded-sm text-sm font-body',
  'focus:outline-none focus:border-[var(--gold-dim)]',
].join(' ');

export default function BacklogPanel({
  campaignId, session, locked, links, onLinkClick, targets, reloadKey, onMovedIn,
}) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [items, setItems] = useState([]);
  // Shut by default, like the session's own sections: it is a reference
  // shelf, not the thing being worked on.
  const [open, setOpen] = useState(false);
  const [openItems, setOpenItems] = useState(() => new Set());
  const [form, setForm] = useState(null);   // { id?, parent_id?, title, body }
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(null);
  // The folded "Done & skipped" line. Shut by default: it is the archive.
  const [showSpent, setShowSpent] = useState(false);

  const fail = useCallback((e) => toast(e?.message || String(e), 'error'), [toast]);

  const load = useCallback(async () => {
    if (!campaignId) { setItems([]); return; }
    try {
      const { items: rows = [] } = await pendingsApi.list(campaignId);
      setItems(rows);
    } catch (e) { fail(e); }
  }, [campaignId, fail]);

  // `reloadKey` moves when a session card is sent here from the panel above.
  useEffect(() => { load(); }, [load, reloadKey]);

  const tree = nest(items);
  // Folded by the ROOT's state: a live card keeps its finished sub-cards
  // (they are part of it), and a finished card takes all of its own along.
  const spentState = (i) => i.state === 'done' || i.state === 'skipped';
  const live = tree.filter((i) => !spentState(i));
  const spent = tree.filter(spentState);

  const isOpen = useCallback((id) => openItems.has(id), [openItems]);
  const toggleItem = useCallback((id) => setOpenItems((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  }), []);

  /** Drop a card and its sub-cards from the list, as the server's CASCADE did. */
  const dropSubtree = (id) => setItems((prev) => {
    const gone = new Set([id]);
    for (let pass = 0; pass < 50; pass++) {
      const before = gone.size;
      for (const i of prev) if (i.parent_id != null && gone.has(i.parent_id)) gone.add(i.id);
      if (gone.size === before) break;
    }
    return prev.filter((i) => !gone.has(i.id));
  });

  const actions = {
    addRoot: () => setForm({ title: '', body: '' }),
    addChild: (parent) => setForm({ parent_id: parent.id, title: '', body: '' }),
    edit: (item) => setForm({ id: item.id, title: item.title ?? '', body: item.body ?? '' }),
    setState: async (item, state) => {
      try {
        const { updated = [] } = await pendingsApi.setState(campaignId, item.id, state);
        const byId = new Map(updated.map((u) => [u.id, u]));
        setItems((prev) => prev.map((i) => (byId.has(i.id) ? { ...i, ...byId.get(i.id) } : i)));
      } catch (e) { fail(e); return; }
      /*
       * Done on a top-level card, with a session open that is still being
       * prepared: it was probably used tonight. Asked, never assumed — "No"
       * (or closing the question) leaves it Done in the backlog, folded
       * away. Skipped is not asked: a dropped idea was used nowhere.
       */
      if (state !== 'done' || item.parent_id != null || !session || locked) return;
      const move = await confirm(
        `Was “${item.title || 'this card'}” used in ${sessionName(session)}? Move it there and it becomes part of that session's record.`,
        { title: 'Used this session?', confirmLabel: `Move to ${sessionName(session)}`, cancelLabel: 'No, keep it in the backlog' },
      );
      if (!move) return;
      try {
        const r = await pendingsApi.toSession(campaignId, item.id, session.id, 'beats');
        dropSubtree(item.id);
        await onMovedIn?.();
        toast(`Moved into ${sessionName(session)} as done — ${r.moved} card${r.moved === 1 ? '' : 's'}.`);
      } catch (e) { fail(e); }
    },
    remove: async (item) => {
      const kids = items.filter((i) => i.parent_id === item.id).length;
      const ok = await confirm(
        `Delete "${item.title || 'this card'}"?${kids ? ` Its ${kids} sub-item${kids === 1 ? '' : 's'} go too.` : ''}`,
        { title: 'Delete card', confirmLabel: 'Delete' },
      );
      if (!ok) return;
      try {
        await pendingsApi.remove(campaignId, item.id);
        dropSubtree(item.id);
      } catch (e) { fail(e); }
    },
    /*
     * Into the session on screen. Not offered on a played one — it is a
     * record, and the session's own cards are frozen for the same reason.
     */
    send: {
      label: '→ This session',
      title: session ? `Move into ${sessionName(session)}, under The session` : '',
      allows: () => !!session && !locked,
      run: async (item) => {
        try {
          const r = await pendingsApi.toSession(campaignId, item.id, session.id, 'beats');
          dropSubtree(item.id);
          await onMovedIn?.();
          toast(`Moved into ${sessionName(session)} — ${r.moved} card${r.moved === 1 ? '' : 's'}.`);
        } catch (e) { fail(e); }
      },
    },
  };

  const moveItem = useCallback(async (id, parentId, position) => {
    setDrag(null);
    try {
      const { items: fresh } = await pendingsApi.move(campaignId, id, { parent_id: parentId, position });
      setItems(fresh);
    } catch (e) { fail(e); }
  }, [campaignId, fail]);

  async function save() {
    setBusy(true);
    try {
      const saved = form.id
        ? await pendingsApi.update(campaignId, form.id, form)
        : await pendingsApi.add(campaignId, form);
      setItems((prev) => (form.id ? prev.map((i) => (i.id === saved.id ? saved : i)) : [...prev, saved]));
      if (!form.id && saved?.parent_id != null) {
        setOpenItems((prev) => new Set(prev).add(saved.parent_id));
      }
      setForm(null);
    } catch (e) { fail(e); } finally { setBusy(false); }
  }

  if (!campaignId) return null;

  return (
    <section className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 border-b border-[var(--gold-dim)] pb-1">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex items-center gap-2 flex-1 text-left font-display uppercase
                     tracking-widest text-[0.65rem] text-gold hover:text-text transition-colors"
        >
          <span>{open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</span>
          <span className="flex-1">📌 Campaign backlog</span>
          <span className="text-text-muted normal-case tracking-normal">
            ({live.length}{spent.length ? ` · ${spent.length} done` : ''})
          </span>
        </button>
      </div>

      {open && (
        <>
          <p className="text-[0.65rem] text-text-muted italic">
            Ideas for no session in particular. <strong>→ This session</strong> moves one, sub-cards
            and all, into the session above; <strong>→ Backlog</strong> on a session card sends it back.
          </p>
          {!live.length && (
            <p className="text-text-dim text-sm italic py-2">
              {spent.length ? 'Nothing left to use — everything here is done or skipped.' : 'Nothing here yet.'}
            </p>
          )}
          {live.map((i) => (
            <ItemCard
              // `index` is the card's place among ALL roots, folded ones
              // included: it is what a drop between two cards sends to
              // the server, and the server counts every root.
              key={i.id} item={i} index={tree.indexOf(i)} links={links} onLinkClick={onLinkClick}
              actions={actions} isOpen={isOpen} onToggle={toggleItem}
              drag={drag} onDragStart={(it) => setDrag({ id: it.id })}
              onDragEnd={() => setDrag(null)} onMove={moveItem}
            />
          ))}
          {drag && (
            <div onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); moveItem(drag.id, null, tree.length); }}
              className="h-5 border-2 border-dashed border-[var(--gold-dim)] rounded-sm" />
          )}
          <div>
            <Button variant="ghost" onClick={actions.addRoot}>
              <Plus size={11} className="inline mr-1" />Add to the backlog
            </Button>
          </div>
          {spent.length > 0 && (
            <div className="flex flex-col gap-1.5 border-t border-border pt-1.5">
              <button type="button" onClick={() => setShowSpent((v) => !v)} aria-expanded={showSpent}
                className="flex items-center gap-1.5 text-left text-[0.7rem] font-display uppercase tracking-wider text-text-muted hover:text-gold">
                {showSpent ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                ✓ Done &amp; skipped ({spent.length})
              </button>
              {showSpent && spent.map((i) => (
                <ItemCard
                  key={i.id} item={i} index={tree.indexOf(i)} links={links} onLinkClick={onLinkClick}
                  actions={actions} isOpen={isOpen} onToggle={toggleItem}
                  drag={drag} onDragStart={(it) => setDrag({ id: it.id })}
                  onDragEnd={() => setDrag(null)} onMove={moveItem}
                />
              ))}
            </div>
          )}
        </>
      )}

      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        title={form?.id ? 'Edit backlog card' : 'New backlog card'}
        className="!max-w-[95vw] !w-[95vw] !max-h-[92vh]"
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
                rows={16}
                className={INPUT}
              />
            </FormField>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setForm(null)}>Cancel</Button>
              <Button variant="accent" loading={busy} onClick={save}>Save</Button>
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}

/** "session 25", or the title when it has no number. */
function sessionName(s) {
  if (s.session_no != null) return `session ${s.session_no}`;
  return s.title || 'this session';
}
