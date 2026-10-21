/**
 * pages/Sessions/SessionsPanel.jsx
 *
 * Session prep: the DM's plan for one sitting, and what came of it.
 *
 * DM-only, all of it — there is no player-facing counterpart, which is the
 * point. This is where the twist lives.
 *
 * Self-contained, like JournalPanel: it owns its own fetching, so the
 * Manage Campaigns page does not have to thread session state through its
 * hook for a tab most visits never open.
 *
 * Five sections are shown and four are stored. "Still running" is a view the
 * server derives from earlier sessions' items that are still on-going, so it
 * is read-only here: the way to clear a thread is to mark it done where it
 * actually lives, and it then leaves every session at once.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';

import { Button, Modal, FormField, Spinner,
  CalendarDate, absDayFromParts, partsFromAbsDay } from '@/components/ui';
import { inGameDate } from '@/data/calendar';
import { useToast } from '@/hooks/useToast';
import { useConfirm } from '@/contexts/ConfirmContext';
import { sessionsApi } from '@/api/sessions';
import { downloadBundle } from '@/api/downloadBundle';
import LinkingTextarea from '@/components/LinkingTextarea';
import CrossLinkPopover from '@/components/CrossLinkPopover';
import { useCrossLinks } from '@/hooks/useCrossLinks';
import ItemCard from './ItemCard';
import { SECTIONS, STATES, nest, sectionTree } from './constants';
import { filterTree, countTree } from './filter';

const INPUT = [
  'w-full bg-surface2 border border-border2 text-text px-2 py-1.5 rounded-sm text-sm font-body',
  'focus:outline-none focus:border-[var(--gold-dim)]',
].join(' ');

/** "Session 4 · The Vault", or whatever of that exists. */
function sessionLabel(s) {
  const bits = [];
  if (s.session_no != null) bits.push(`Session ${s.session_no}`);
  if (s.title) bits.push(s.title);
  return bits.join(' · ') || 'Untitled session';
}

/**
 * One section of a session.
 *
 * CLOSED by default. A played session runs to a hundred-odd cards and four
 * sections open at once is a page nobody can find anything in; the heading
 * row carries the count so a shut section still tells you whether it is
 * worth opening.
 */
function Section({
  def, items, total, open, onToggle, links, onLinkClick, actions, isOpen, onToggleItem, onExpandAll,
  locked, drag, onDragStart, onDragEnd, onMove, filtering, action = null,
}) {
  const nested = items.some((i) => (i.children ?? []).length);
  return (
    <section className="flex flex-col gap-1.5">
      {/* Spring-loaded, like a folder: a shut section has no drop target
          inside it, and "What happened" — the section this whole thing
          exists to reach — is usually shut. Hovering a drag over the
          heading opens it, and then the strip below can take the drop. */}
      {/* STICKY, so you can always see which section you are reading. The
          scroll container is the tab body in ManageCampaigns, which carries
          `p-4` — hence `-mx-4 px-4`, or cards show through at the sides as
          they pass under. The background has to be opaque for the same
          reason. z-20 keeps it over the cards but under the state menu,
          which opens at z-50. */}
      <div className="sticky top-0 z-20 -mx-4 px-4 pt-2 pb-1 bg-surface
                      flex items-center gap-2 border-b border-[var(--gold-dim)]"
        onDragOver={drag && !open ? (e) => { e.preventDefault(); onToggle(); } : undefined}>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex items-center gap-2 flex-1 text-left font-display uppercase
                     tracking-widest text-[0.65rem] text-gold hover:text-text transition-colors"
        >
          <span className="inline-block">{open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</span>
          <span className="flex-1">{def.label}</span>
          <span className="text-text-muted normal-case tracking-normal">({total})</span>
        </button>
        {/* Shown whether or not the section is open, and on a played
            session too — copying to the journal reads the prep, it does
            not edit it, so `locked` has no say here. */}
        {action}
        {open && nested && (
          <>
            {/* Deliberately skips cards that are done — re-opening fifty
                finished beats is not what anyone means by "expand all". */}
            <button type="button" onClick={() => onExpandAll(def.id, true)}
              className="text-[0.65rem] font-display uppercase tracking-wider text-text-muted hover:text-gold">
              Expand
            </button>
            <button type="button" onClick={() => onExpandAll(def.id, false)}
              className="text-[0.65rem] font-display uppercase tracking-wider text-text-muted hover:text-gold">
              Collapse
            </button>
          </>
        )}
      </div>

      {open && (
        <>
          <p className="text-[0.65rem] text-text-muted italic">{def.hint}</p>
          {!items.length && (
            <p className="text-text-dim text-sm italic py-2">
              {filtering ? 'Nothing here matches.' : 'Nothing here yet.'}
            </p>
          )}
          {items.map((i, idx) => (
            <ItemCard
              key={i.id} item={i} index={idx} links={links} onLinkClick={onLinkClick}
              actions={actions} locked={locked} readOnly={locked}
              isOpen={isOpen} onToggle={onToggleItem}
              drag={drag} onDragStart={onDragStart} onDragEnd={onDragEnd} onMove={onMove}
            />
          ))}
          {/* The tail of the root list, so a card can be dropped last — and,
              when the drag started elsewhere, the way into this section at
              all. It is the only target an EMPTY section has, so it shows
              for any drag rather than only a same-section one. */}
          {drag && (
            <div onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); onMove(drag.id, null, items.length, def.id); }}
              className="h-5 border-2 border-dashed border-[var(--gold-dim)] rounded-sm
                         flex items-center justify-center text-[0.65rem] font-display
                         uppercase tracking-wider text-text-muted">
              {drag.section !== def.id && `Move to ${def.label}`}
            </div>
          )}
          {!locked && (
            <div>
              <Button variant="ghost" onClick={() => actions.addRoot(def.id)}>
                <Plus size={11} className="inline mr-1" />{def.addLabel}
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

export default function SessionsPanel({
  campaignId, calendarType = 'harptos', todayMarker = null, onTodayMarkerChanged,
}) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [sessions, setSessions] = useState([]);
  const [currentId, setCurrentId] = useState(null);
  const [detail, setDetail] = useState(null);     // { session, items, ongoing }
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [itemForm, setItemForm] = useState(null); // { id?, section, parent_id?, title, body }
  const [metaForm, setMetaForm] = useState(null); // the session's own fields
  const { targets, index } = useCrossLinks(campaignId);
  const [popover, setPopover] = useState(null);
  // Sections are shut until asked for; a played session runs to a hundred
  // cards and four open sections is a page you cannot navigate.
  const [openSections, setOpenSections] = useState(() => new Set());
  /*
   * Which CARDS are expanded, owned here rather than in ItemCard so
   * "expand all" can skip the ones that are done. Seeded on load: a card
   * with children is open unless it is finished.
   */
  const [openItems, setOpenItems] = useState(() => new Set());
  const [query, setQuery] = useState('');
  const [stateFilter, setStateFilter] = useState(() => new Set());
  const [drag, setDrag] = useState(null);   // { id, section } while dragging
  // { category, day, dmOnly, picked:Set } while the convert dialog is open
  const [journalForm, setJournalForm] = useState(null);
  // { in_game_day, days, events } for the session on screen, or null.
  const [upcoming, setUpcoming] = useState(null);
  // { date } while the "mark it played" dialog is open.
  const [playedForm, setPlayedForm] = useState(null);

  const openLink = useCallback(({ kind, id }, e) => {
    const rows = kind === 'npc' ? targets.npcs : targets.locations;
    const hit = (rows ?? []).find((r) => String(r.id) === String(id));
    if (!hit) return;
    setPopover({ target: { ...hit, kind }, at: { x: e.clientX, y: e.clientY } });
  }, [targets]);

  const fail = useCallback((e) => toast(e?.message || String(e), 'error'), [toast]);

  const loadList = useCallback(async () => {
    if (!campaignId) { setSessions([]); setCurrentId(null); return; }
    try {
      const rows = (await sessionsApi.list(campaignId)) || [];
      setSessions(rows);
      // Land on the one being worked on: the last that is still prepared,
      // else the most recent. Opening on session 1 of forty is never right.
      setCurrentId((prev) => {
        if (prev && rows.some((r) => String(r.id) === String(prev))) return prev;
        const next = [...rows].reverse().find((r) => r.status === 'prepared');
        return (next ?? rows[rows.length - 1])?.id ?? null;
      });
    } catch (e) { fail(e); }
  }, [campaignId, fail]);

  useEffect(() => { loadList(); }, [loadList]);

  const loadDetail = useCallback(async () => {
    if (!campaignId || !currentId) { setDetail(null); return; }
    setLoading(true);
    try {
      const d = await sessionsApi.get(campaignId, currentId);
      setDetail(d);
      // Done cards start closed. Everything else with children starts open,
      // so a session you are still planning reads as a plan.
      const parents = new Set((d.items ?? []).map((i) => i.parent_id).filter(Boolean));
      setOpenItems(new Set(
        (d.items ?? [])
          .filter((i) => parents.has(i.id) && i.state !== 'done')
          .map((i) => i.id),
      ));
    } catch (e) { fail(e); } finally { setLoading(false); }
  }, [campaignId, currentId, fail]);

  useEffect(() => { loadDetail(); }, [loadDetail]);

  /*
   * What the timeline says is near this session's in-game date.
   *
   * Keyed on the DATE as well as the session, so moving a session redraws
   * the list rather than leaving the old one under a new date. Its own
   * fetch because it reads the timelines, which the session route has no
   * business joining.
   */
  const when = detail?.session?.in_game_day ?? null;
  useEffect(() => {
    if (!campaignId || !currentId || when == null) { setUpcoming(null); return undefined; }
    let alive = true;
    sessionsApi.upcoming(campaignId, currentId)
      .then((u) => { if (alive) setUpcoming(u); })
      .catch(() => { /* the session is still readable without it */ });
    return () => { alive = false; };
  }, [campaignId, currentId, when]);

  // Memoised because `expandAll` depends on it; a fresh [] every render
  // would rebuild that callback every render for nothing.
  const items = useMemo(() => detail?.items ?? [], [detail]);
  // The convert dialog renders outside the section map, so it needs its own
  // handle on the roots of What happened.
  const outcomeRoots = useMemo(
    () => sectionTree(items, 'outcome'),
    [items],
  );
  const ongoing = useMemo(() => nest(detail?.ongoing ?? []), [detail]);

  /*
   * A played session is a record, not a plan. Everything in it is frozen
   * until the DM marks it prepared again — which is a deliberate, visible
   * act rather than an accidental keystroke in last month's notes.
   */
  const locked = detail?.session?.status === 'played';
  const filtering = !!query.trim() || stateFilter.size > 0;

  const isOpen = useCallback((id) => openItems.has(id), [openItems]);
  const toggleItem = useCallback((id) => setOpenItems((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  }), []);
  const toggleSection = useCallback((id) => setOpenSections((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  }), []);
  /** Expand or collapse a whole section's cards, leaving finished ones shut. */
  const expandAll = useCallback((section, want) => setOpenItems((prev) => {
    const next = new Set(prev);
    const parents = new Set(items.map((i) => i.parent_id).filter(Boolean));
    for (const i of items) {
      if (i.section !== section || !parents.has(i.id)) continue;
      if (want) { if (i.state !== 'done') next.add(i.id); } else next.delete(i.id);
    }
    return next;
  }), [items]);

  async function newSession() {
    setBusy(true);
    try {
      // Numbered from the highest so far, so the common case needs no typing.
      const top = sessions.reduce((m, s) => Math.max(m, s.session_no ?? 0), 0);
      const made = await sessionsApi.create(campaignId, { session_no: top + 1 });
      await loadList();
      setCurrentId(made.id);
    } catch (e) { fail(e); } finally { setBusy(false); }
  }

  async function exportAll() {
    try {
      const bundle = await sessionsApi.exportAll(campaignId);
      downloadBundle(bundle, { module: 'sessions', name: bundle.campaign_name });
    } catch (e) { fail(e); }
  }

  async function saveMeta() {
    setBusy(true);
    try {
      const saved = await sessionsApi.update(campaignId, metaForm.id, {
        ...metaForm,
        // The pickers edit { year, midx, day }; the server stores the one
        // absolute integer the timelines and the journal already use.
        in_game_day: absDayFromParts(metaForm.date, calendarType),
      });
      setMetaForm(null);
      await loadList();
      await loadDetail();
      // Editing the finish date of a played session moves the clock, the
      // same as marking it played does — the server says when it did.
      if (saved?.today_marker !== undefined) onTodayMarkerChanged?.();
    } catch (e) { fail(e); } finally { setBusy(false); }
  }

  /*
   * Marking a session played asks when it FINISHED in the world, and the
   * campaign's clock follows that answer.
   *
   * A dialog rather than a confirm, because there is something to fill in
   * — and the "nothing written under What happened" warning lives inside
   * it rather than as a second box in front of it. Both are still shown
   * before anything is written: played makes the session read-only, and a
   * DM who marks it before writing their notes has to work out that they
   * must set it back to Prepared to type anything.
   *
   * Going the other way — played back to prepared — asks nothing. Nothing
   * finished, so there is no date to record and no clock to move.
   */
  function toggleStatus() {
    // No date argument: un-marking must not erase the one already there.
    if (detail.session.status === 'played') { void setStatus('prepared'); return; }
    setPlayedForm({
      // Defaults to where the campaign already is. The session's own start
      // date is the fallback, so an undated campaign still opens on
      // something sensible rather than blank.
      date: partsFromAbsDay(todayMarker ?? detail.session.in_game_day ?? null, calendarType),
    });
  }

  async function setStatus(next, day) {
    try {
      const saved = await sessionsApi.update(campaignId, detail.session.id, {
        ...detail.session,
        status: next,
        // `undefined` means "leave it" — only the played dialog supplies a
        // date, and passing null here would clear the session's own.
        ...(day !== undefined ? { in_game_day: day } : {}),
      });
      setPlayedForm(null);
      await loadList();
      await loadDetail();
      /*
       * The server moves `today_marker` in the same transaction as the
       * status, so the page asks for it back rather than setting it. Only
       * when it actually changed — the response says so.
       */
      if (saved?.today_marker !== undefined) onTodayMarkerChanged?.();

      /*
       * Marking a session played is the moment the DM knows what survived
       * it, so it is the moment to offer the next one — asked, never done
       * silently, because it creates a session and copies cards into it.
       *
       * Counted first: "generate the next session?" with no numbers is not
       * a decision anyone can make.
       */
      if (next !== 'played') return;
      const carry = items.filter((i) => (i.section === 'prep' || i.section === 'beats')
        && ['ready', 'on-going', 'in-preparation'].includes(i.state));
      const outcome = items.filter((i) => i.section === 'outcome').length;
      if (!carry.length && !outcome) return;

      const beats = carry.filter((i) => i.state !== 'in-preparation').length;
      const prep = carry.length - beats;
      const nested = carry.some((i) => i.parent_id != null);
      const ok = await confirm(
        [
          'Generate the prep for the next session from this one?',
          [
            beats ? `${beats} ready or on-going card${beats === 1 ? '' : 's'} → The session` : null,
            prep ? `${prep} in-preparation card${prep === 1 ? '' : 's'} → Before it begins` : null,
            outcome ? `What happened (${outcome}) → one recap card to read aloud` : null,
          ].filter(Boolean).join('\n'),
          // Said, because the count above is of LIVE cards and more than
          // that will appear: a live sub-card brings the finished beats
          // above it so the tree still makes sense.
          nested
            ? 'Sub-cards come with their parents, so a finished beat may travel to keep a live one in context.'
            : null,
          'Nothing is moved — this session keeps everything as its record.',
        ].filter(Boolean).join('\n\n'),
        { title: 'Generate next session', confirmLabel: 'Generate' },
      );
      if (!ok) return;
      const r = await sessionsApi.generateNext(campaignId, detail.session.id);
      await loadList();
      setCurrentId(r.session.id);
      toast(`Session ${r.session.session_no} created — ${r.carried} card${r.carried === 1 ? '' : 's'} carried over.`);
    } catch (e) { fail(e); }
  }

  async function removeSession() {
    const s = detail.session;
    const n = items.length;
    const ok = await confirm(
      `Delete "${sessionLabel(s)}"?${n ? ` Its ${n} card${n === 1 ? '' : 's'} go with it.` : ''}`,
      { title: 'Delete session', confirmLabel: 'Delete' },
    );
    if (!ok) return;
    try {
      await sessionsApi.remove(campaignId, s.id);
      setCurrentId(null);
      await loadList();
    } catch (e) { fail(e); }
  }

  const actions = {
    addRoot: (section) => setItemForm({ section, title: '', body: '' }),
    addChild: (parent) => setItemForm({ section: parent.section, parent_id: parent.id, title: '', body: '' }),
    edit: (item) => setItemForm({ id: item.id, section: item.section, title: item.title ?? '', body: item.body ?? '' }),
    /*
     * Patches the rows the server says changed, rather than refetching the
     * session. Reloading replaced every card, which remounted the list and
     * threw the DM back to the top of the page — mid-session, while they
     * were ticking something off, which is the worst possible moment.
     *
     * The server returns every affected row because `done` cascades to the
     * sub-cards, so this is not just the one that was clicked.
     */
    setState: async (item, state) => {
      try {
        const { updated = [] } = await sessionsApi.setState(campaignId, currentId, item.id, state);
        if (!updated.length) return;
        const byId = new Map(updated.map((u) => [u.id, u]));
        setDetail((d) => (d ? {
          ...d,
          items: d.items.map((i) => (byId.has(i.id) ? { ...i, ...byId.get(i.id) } : i)),
          /*
           * `ongoing` is a separate list of rows from OTHER sessions, so
           * patching only `items` left a thread you had just closed still
           * sitting in Still Running until a reload. A row that stops being
           * on-going leaves the list outright, because that is what the
           * server would send next time.
           */
          ongoing: (d.ongoing ?? [])
            .map((i) => (byId.has(i.id) ? { ...i, ...byId.get(i.id) } : i))
            .filter((i) => i.state === 'on-going'),
        } : d));
        // A card that has just been finished folds itself away, along with
        // the sub-cards that went down with it.
        setOpenItems((prev) => {
          const next = new Set(prev);
          for (const u of updated) if (u.state === 'done') next.delete(u.id);
          return next;
        });
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
        await sessionsApi.removeItem(campaignId, currentId, item.id);
        setDetail((d) => {
          if (!d) return d;
          // The server cascades to sub-cards, so mirror that here rather
          // than refetching — a reload costs the scroll position and every
          // open card, exactly as it did on save.
          const doomed = new Set([item.id]);
          for (let pass = 0; pass < 50; pass++) {
            const before = doomed.size;
            for (const i of d.items) {
              if (i.parent_id != null && doomed.has(i.parent_id)) doomed.add(i.id);
            }
            if (doomed.size === before) break;
          }
          return { ...d, items: d.items.filter((i) => !doomed.has(i.id)) };
        });
      } catch (e) { fail(e); }
    },
  };

  /**
   * Reorder, re-parent, or move to another section. The server returns the
   * whole renumbered list. `section` is only read when there is no parent —
   * otherwise the parent's section wins, and the subtree follows.
   */
  const moveItem = useCallback(async (id, parentId, position, section) => {
    setDrag(null);
    try {
      const { items: fresh } = await sessionsApi.moveItem(campaignId, currentId, id, {
        parent_id: parentId, position, section,
      });
      setDetail((d) => (d ? { ...d, items: fresh } : d));
    } catch (e) { fail(e); }
  }, [campaignId, currentId, fail]);

  /**
   * Save a card WITHOUT reloading the session.
   *
   * It used to call loadDetail(), and that swapped the whole panel for a
   * spinner: the list unmounted, the scroll position went back to the top
   * and every expanded card shut — mid-session, while the DM was writing in
   * it. Same reason the state chip stopped refetching.
   *
   * Patching is safe because this modal edits only the title and the body.
   * Neither can move a card between sections or change what Still Running
   * shows, so `items` is the only thing that can have changed.
   */
  /**
   * Copy "What happened" into the Campaign Journal.
   *
   * The same night otherwise gets written twice: here as the DM's private
   * record, and again in the Journal so the table can read it.
   *
   * Nothing is moved and nothing in the session changes, so there is no
   * `detail` to patch afterwards — only a count to report.
   */
  async function sendToJournal() {
    setBusy(true);
    try {
      const r = await sessionsApi.toJournal(campaignId, currentId, {
        item_ids: [...journalForm.picked],
        category: journalForm.category,
        in_game_day: journalForm.day === '' ? null : journalForm.day,
        dm_only: journalForm.dmOnly,
      });
      setJournalForm(null);
      toast(
        r.created
          ? `${r.created} journal entr${r.created === 1 ? 'y' : 'ies'} written`
            + (r.skipped ? `, ${r.skipped} already there` : '')
          : 'Nothing new — those entries are already in the journal.',
      );
    } catch (e) { fail(e); } finally { setBusy(false); }
  }

  async function saveItem() {
    const isEdit = !!itemForm.id;
    setBusy(true);
    try {
      const saved = isEdit
        ? await sessionsApi.updateItem(campaignId, currentId, itemForm.id, itemForm)
        : await sessionsApi.addItem(campaignId, currentId, itemForm);
      setItemForm(null);
      setDetail((d) => (d ? {
        ...d,
        // A new card is appended: the server gives it the last position in
        // its sibling list, and `nest` keeps the array's own order.
        items: isEdit
          ? d.items.map((i) => (i.id === saved.id ? saved : i))
          : [...d.items, saved],
      } : d));
      // A new sub-card under a collapsed parent would otherwise be saved
      // into thin air, with nothing on screen to show it worked.
      if (!isEdit && saved?.parent_id != null) {
        setOpenItems((prev) => new Set(prev).add(saved.parent_id));
      }
    } catch (e) { fail(e); } finally { setBusy(false); }
  }

  if (!campaignId) {
    return <p className="text-text-dim text-sm italic text-center py-8">Pick a campaign first.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={currentId ?? ''}
          onChange={(e) => setCurrentId(e.target.value || null)}
          className={`${INPUT} flex-1 min-w-[12rem]`}
          aria-label="Which session"
        >
          {!sessions.length && <option value="">No sessions yet</option>}
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {sessionLabel(s)}{s.status === 'played' ? ' ✓' : ''}
              {s.ongoing_count ? ` · ${s.ongoing_count} running` : ''}
            </option>
          ))}
        </select>
        <Button variant="accent" loading={busy} onClick={newSession}>＋ New session</Button>
        {/* Import is the hub's job, in Settings, because it is campaign-wide
            and the hub already sniffs the file type. Export belongs here,
            next to the thing being exported. */}
        <Button
          variant="default"
          disabled={!sessions.length}
          onClick={exportAll}
          title={sessions.length ? 'Download every session as a file' : 'Nothing to export yet'}
        >
          💾 Export
        </Button>
      </div>

      {loading && <div className="flex justify-center py-10"><Spinner /></div>}

      {!loading && !detail && (
        <p className="text-text-dim text-sm italic text-center py-8">
          No session yet. Create one to start planning.
        </p>
      )}

      {!loading && detail && (
        <>
          <div className="flex items-center gap-2 flex-wrap border border-border rounded-sm
                          bg-surface2/40 p-2.5">
            <strong className="text-text flex-1 min-w-[10rem]">{sessionLabel(detail.session)}</strong>
            {detail.session.session_date && (
              <span className="text-[0.7rem] text-text-muted">
                {String(detail.session.session_date).slice(0, 10)}
              </span>
            )}
            {detail.session.in_game_day != null && (
              <span className="text-[0.7rem] text-gold" title="In-game date">
                🗓 {inGameDate(detail.session.in_game_day, calendarType)}
              </span>
            )}
            <button
              type="button"
              onClick={toggleStatus}
              title={detail.session.status === 'played' ? 'Mark as still being prepared' : 'Mark as played'}
              className={`text-[0.7rem] font-display uppercase tracking-wider px-2 py-0.5 rounded-sm border ${
                detail.session.status === 'played'
                  ? 'bg-[var(--gold-dim)] border-[var(--gold)] text-text'
                  : 'bg-surface2 border-border text-text-dim'
              }`}
            >
              {detail.session.status === 'played' ? '✓ Played' : '✎ Prepared'}
            </button>
            <Button variant="default" onClick={() => setMetaForm({
              id: detail.session.id,
              session_no: detail.session.session_no ?? '',
              title: detail.session.title ?? '',
              session_date: detail.session.session_date
                ? String(detail.session.session_date).slice(0, 10) : '',
              date: partsFromAbsDay(detail.session.in_game_day, calendarType),
            })}>Edit</Button>
            <Button variant="danger" onClick={removeSession} title="Delete this session">
              <Trash2 size={12} />
            </Button>
          </div>

          {/* Said plainly, or a DM clicks at a frozen card and concludes the
              page is broken rather than that the session is finished. */}
          {locked && (
            <p className="text-[0.7rem] text-text-muted italic -mt-1">
              This session is played, so its cards are read-only. Mark it
              <strong className="text-text-dim"> Prepared</strong> to edit them again.
            </p>
          )}

          {/* Search and state filter, inside the session: a hundred cards
              is more than anyone reads top to bottom. Filtering opens the
              sections it finds something in, or the hits stay hidden behind
              a shut heading and the box looks broken. */}
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search this session…"
              aria-label="Search this session"
              className={`${INPUT} flex-1 min-w-[10rem]`}
            />
            {STATES.map((st) => {
              const on = stateFilter.has(st.id);
              return (
                <button
                  key={st.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setStateFilter((prev) => {
                    const next = new Set(prev);
                    if (next.has(st.id)) next.delete(st.id); else next.add(st.id);
                    return next;
                  })}
                  title={`Show only ${st.label}`}
                  className={`text-[0.7rem] px-1.5 py-0.5 rounded-sm border transition-colors
                              ${on ? st.cls : 'bg-surface2 border-border text-text-muted hover:text-gold'}`}
                >
                  {st.icon} {st.label}
                </button>
              );
            })}
            {filtering && (
              <button type="button"
                onClick={() => { setQuery(''); setStateFilter(new Set()); }}
                className="text-[0.7rem] font-display uppercase tracking-wider text-text-muted hover:text-gold">
                Clear
              </button>
            )}
          </div>

          {/*
            * What the timeline says is going on around this date.
            *
            * Only when there is a date AND something near it — an empty
            * "nothing coming up" box on every session would be noise, and
            * the absence of news is not news.
            */}
          {upcoming?.events?.length > 0 && (
            <section className="border border-[var(--gold-dim)] rounded-sm bg-[var(--gold-glow)] p-2.5">
              <h3 className="font-display uppercase tracking-widest text-[0.65rem] text-gold mb-1.5">
                ⏳ Around this date
                <span className="text-text-muted normal-case tracking-normal ml-1.5">
                  (next {upcoming.days} days)
                </span>
              </h3>
              <ul className="flex flex-col gap-1">
                {upcoming.events.map((e) => (
                  <li key={e.id} className="text-[0.8rem] text-text-dim flex items-baseline gap-2 flex-wrap">
                    {/* Something already under way leads with that, because
                        it is not a thing to remember later — it is the
                        situation the party is walking into. */}
                    <span className={`flex-shrink-0 font-display uppercase tracking-wider text-[0.65rem]
                                      ${e.running ? 'text-gold' : 'text-text-muted'}`}>
                      {e.running
                        ? 'under way'
                        : e.days_away === 0 ? 'today' : `in ${e.days_away}d`}
                    </span>
                    <strong className="text-text">{e.title}</strong>
                    {e.location && <span className="text-text-muted">· {e.location}</span>}
                    <span className="text-text-muted text-[0.7rem]">
                      {inGameDate(Number(e.abs_day), calendarType)}
                      {/* Whose timeline it came from — the party's, a
                          character's, or one of the DM's own. */}
                      {e.is_party ? ' · the party' : e.player_name ? ` · ${e.player_name}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {SECTIONS.map((def) => {
            const tree = filterTree(items, def.id, query, stateFilter);
            // A filtered section opens itself — a hit behind a shut heading
            // reads as "no results".
            const open = filtering ? tree.length > 0 : openSections.has(def.id);
            return (
              <Section
                key={def.id}
                def={def}
                items={tree}
                total={filtering ? countTree(tree) : items.filter((i) => i.section === def.id).length}
                open={open}
                onToggle={() => toggleSection(def.id)}
                links={index}
                onLinkClick={openLink}
                actions={actions}
                isOpen={filtering ? () => true : isOpen}
                onToggleItem={toggleItem}
                onExpandAll={expandAll}
                locked={locked}
                filtering={filtering}
                action={def.id === 'outcome' && tree.length ? (
                  <button
                    type="button"
                    title="Copy these into the Campaign Journal so the table can read them"
                    onClick={() => setJournalForm({
                      // Filed under the session it came from, which is how
                      // the journal already groups things.
                      category: detail.session.session_no
                        ? `Session ${detail.session.session_no}` : '',
                      day: '',
                      // Off by default: these are the DM's own notes, and
                      // publishing them is the deliberate act, not the
                      // accident.
                      dmOnly: true,
                      picked: new Set(tree.map((i) => i.id)),
                    })}
                    className="text-[0.65rem] font-display uppercase tracking-wider
                               text-text-muted hover:text-gold"
                  >
                    📖 To journal
                  </button>
                ) : null}
                drag={filtering ? null : drag}
                onDragStart={(it) => setDrag({ id: it.id, section: it.section })}
                onDragEnd={() => setDrag(null)}
                onMove={moveItem}
              />
            );
          })}

          {/* Derived, so there is no "add" here. Clearing a thread means
              marking it done where it lives, which removes it from every
              session at once. */}
          {/* Hidden on a played session: it is a working view of what is
              still live, and a record of a finished night should not carry
              one. The rows are untouched — only this view is gone. */}
          {!locked && !filtering && ongoing.length > 0 && (
            <section className="flex flex-col gap-1.5">
              <h3 className="font-display uppercase tracking-widest text-[0.65rem] text-gold
                             border-b border-[var(--gold-dim)] pb-1">
                Still running ({ongoing.length})
              </h3>
              <p className="text-[0.65rem] text-text-muted italic">
                Carried over from earlier sessions. Mark one done where it lives and it leaves
                every session at once.
              </p>
              {ongoing.map((i) => (
                <ItemCard
                  key={i.id}
                  item={i}
                  readOnly
                  links={index}
                  onLinkClick={openLink}
                  actions={actions}
                  isOpen={isOpen}
                  onToggle={toggleItem}
                  onDragStart={() => {}}
                  onDragEnd={() => {}}
                  onMove={() => {}}
                  origin={[i.session_no != null ? `session ${i.session_no}` : null, i.session_title]
                    .filter(Boolean).join(' · ') || 'an earlier session'}
                />
              ))}
            </section>
          )}
        </>
      )}

      <Modal
        open={!!itemForm}
        onClose={() => setItemForm(null)}
        title={itemForm?.id ? 'Edit card' : 'New card'}
        className="!max-w-[95vw] !w-[95vw] !max-h-[92vh]"
      >
        {itemForm && (
          <div className="flex flex-col gap-3">
            <FormField label="Title">
              <input type="text" value={itemForm.title} maxLength={255} className={INPUT}
                onChange={(e) => setItemForm((f) => ({ ...f, title: e.target.value }))} />
            </FormField>
            <FormField label="Notes">
              <LinkingTextarea
                value={itemForm.body}
                onChange={(v) => setItemForm((f) => ({ ...f, body: v }))}
                targets={targets}
                rows={16}
                className={INPUT}
              />
              <p className="text-text-muted text-[0.7rem] mt-1">
                Type <code>[[</code> to link a place or a person.
              </p>
            </FormField>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setItemForm(null)}>Cancel</Button>
              <Button variant="accent" loading={busy} onClick={saveItem}>Save</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={!!journalForm}
        onClose={() => setJournalForm(null)}
        title="📖 What happened → Campaign Journal"
        className="max-w-2xl"
      >
        {journalForm && (
          <div className="flex flex-col gap-3">
            <p className="text-[0.7rem] text-text-muted">
              One journal entry per card, with its sub-cards folded into the body.
              The session keeps its own copy — nothing here is moved. Cards already
              in the journal, matched on title, are skipped.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <FormField label="Filed under">
                <input type="text" value={journalForm.category} maxLength={120} className={INPUT}
                  onChange={(e) => setJournalForm((f) => ({ ...f, category: e.target.value }))} />
              </FormField>
              <FormField label="In-game day (optional)">
                <input type="number" value={journalForm.day} className={INPUT}
                  onChange={(e) => setJournalForm((f) => ({ ...f, day: e.target.value }))} />
              </FormField>
            </div>

            {/* The consequential one, so it says what it does rather than
                naming the column. These are the DM's notes; publishing them
                is a decision. */}
            <label className="flex items-start gap-2 text-[0.75rem] text-text-dim">
              <input type="checkbox" checked={!journalForm.dmOnly} className="mt-0.5"
                onChange={(e) => setJournalForm((f) => ({ ...f, dmOnly: !e.target.checked }))} />
              <span>
                <strong className="text-text">Let the players read these.</strong>{' '}
                Unticked, they go in DM-only and you can publish them one at a time
                from the Journal.
              </span>
            </label>

            <FormField label={`Cards (${journalForm.picked.size} of ${outcomeRoots.length})`}>
              <div className="flex flex-col gap-1 max-h-56 overflow-y-auto border border-border
                              rounded-sm p-2 bg-surface2/40">
                {outcomeRoots.map((i) => (
                  <label key={i.id} className="flex items-start gap-2 text-[0.75rem] text-text-dim">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={journalForm.picked.has(i.id)}
                      onChange={() => setJournalForm((f) => {
                        const picked = new Set(f.picked);
                        if (picked.has(i.id)) picked.delete(i.id); else picked.add(i.id);
                        return { ...f, picked };
                      })}
                    />
                    <span className="flex-1 min-w-0">
                      {i.title || <em className="text-text-muted">(untitled)</em>}
                      {(i.children ?? []).length > 0 && (
                        <span className="text-text-muted"> +{i.children.length}</span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            </FormField>

            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setJournalForm(null)}>Cancel</Button>
              <Button
                variant="accent"
                loading={busy}
                disabled={!journalForm.picked.size}
                onClick={sendToJournal}
              >
                Write {journalForm.picked.size} entr{journalForm.picked.size === 1 ? 'y' : 'ies'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={!!playedForm}
        onClose={() => setPlayedForm(null)}
        title="✓ Mark this session as played"
        className="max-w-lg"
      >
        {playedForm && (
          <div className="flex flex-col gap-3">
            {/* The warning that used to be its own confirm in front of this
                one. Same thing said at the same moment, one box instead of
                two — and it is a note, not a question, because the date
                below is the question. */}
            {!items.some((i) => i.section === 'outcome') && (
              <p className="text-[0.8rem] text-text border border-[var(--gold-dim)]
                            bg-[var(--gold-glow)] rounded-sm p-2.5">
                Nothing is written under <strong>What happened</strong> yet. A played session is
                read-only, so you would have to mark it Prepared again before you could add the
                notes.
              </p>
            )}

            <CalendarDate
              value={playedForm.date}
              onChange={(date) => setPlayedForm((f) => ({ ...f, date }))}
              calType={calendarType}
              label="finished on"
              hint="When the session ended in the world. Saving moves the campaign's Today
                    marker to this date, so the timelines and everything else move with it."
            />

            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setPlayedForm(null)}>Cancel</Button>
              <Button
                variant="accent"
                loading={busy}
                onClick={() => setStatus('played', absDayFromParts(playedForm.date, calendarType))}
              >
                Mark it played
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!metaForm} onClose={() => setMetaForm(null)} onSubmit={saveMeta} title="Edit session">
        {metaForm && (
          <div className="flex flex-col gap-3">
            <FormField label="Number">
              <input type="number" value={metaForm.session_no} className={INPUT}
                onChange={(e) => setMetaForm((f) => ({ ...f, session_no: e.target.value }))} />
            </FormField>
            <FormField label="Title">
              <input type="text" value={metaForm.title} maxLength={255} className={INPUT}
                onChange={(e) => setMetaForm((f) => ({ ...f, title: e.target.value }))} />
            </FormField>
            <FormField label="Date played">
              <input type="date" value={metaForm.session_date} className={INPUT}
                onChange={(e) => setMetaForm((f) => ({ ...f, session_date: e.target.value }))} />
              <p className="text-text-muted text-[0.7rem] mt-1">
                The real evening you sat down. Separate from the in-game date below — a
                session played in October can fall on 30 Hammer, and three sittings can be
                one day in the world.
              </p>
            </FormField>
            {/* ONE in-game date. Marking the session played sets it, the
                timeline panel reads it, and on a played session changing
                it moves the campaign's Today marker. */}
            <CalendarDate
              value={metaForm.date}
              onChange={(date) => setMetaForm((f) => ({ ...f, date }))}
              calType={calendarType}
              label="in-game date"
              hint="When it happens in the world. The timeline will say what else is going on
                    around then — and once the session is played, this is where the campaign's
                    Today marker sits."
            />
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setMetaForm(null)}>Cancel</Button>
              <Button variant="accent" loading={busy} onClick={saveMeta}>Save</Button>
            </div>
          </div>
        )}
      </Modal>

      <CrossLinkPopover
        target={popover?.target ?? null}
        at={popover?.at}
        campaignId={campaignId}
        onClose={() => setPopover(null)}
      />
    </div>
  );
}
