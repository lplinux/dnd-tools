/**
 * pages/Journal/JournalPanel.jsx
 *
 * The Campaign Journal: shared notes that every player at the table writes and
 * everyone reads.
 *
 * Deliberately not any of the three note stores that already exist — a
 * player's own Diary is theirs, the campaign Diary is the DM's session record,
 * and DM Notes are about one character. This is the only place the table
 * writes to each other.
 *
 * Self-contained, because it has two mount points: a tab on the PC Sheet for
 * everyone, and a tab in Manage Campaigns so the DM can run the whole journal
 * from the module they already manage the campaign in. Owning its own fetching
 * means neither page has to thread journal state through its hook, and the two
 * can never drift apart.
 *
 * Presentation is the Diary's, on purpose: the same compact cards, the same
 * grouping and collapse, the same read-in-a-modal. A journal and a diary are
 * the same act of writing something down; only who may read it differs.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Button, Modal, FormField, Spinner, CalendarDate,
  absDayFromParts, partsFromAbsDay } from '@/components/ui';
import { campaignsApi } from '@/api/campaigns';
import { useToast } from '@/hooks/useToast';
import { useConfirm } from '@/contexts/ConfirmContext';
import { inGameDate } from '@/data/calendar';
import GroupedEntries from '@/pages/Diary/GroupedEntries';
import { openNotesPrint } from '@/pages/Diary/printNotes';
import LinkingTextarea from '@/components/LinkingTextarea';
import CrossLinkPopover from '@/components/CrossLinkPopover';
import { useCrossLinks } from '@/hooks/useCrossLinks';

/**
 * What a journal can usefully be grouped by.
 *
 * `field` is a key or a function of the entry; owner is a function because
 * "who wrote it" is a character name falling back to a username, which is not
 * a column. Category keeps first-appearance order — that order is the story,
 * since the list is in date order. The other two sort alphabetically, because
 * the same five names jumping around as entries are added is just noise.
 */
const GROUP_BY = {
  // Every grouping lists its groups by name, Category included: a reader
  // scanning for "Rumours" should find it where the alphabet puts it, not
  // wherever its earliest entry happens to fall. Inside a group, entries
  // keep their in-game date order; the unfiled pile is always last.
  category: {
    label: 'Category', field: 'category',
    ungrouped: 'Uncategorised', sortGroups: true,
  },
  location: {
    label: 'Location', field: 'location_name',
    ungrouped: 'Nowhere in particular', sortGroups: true,
  },
  owner: {
    label: 'Who wrote it', field: (e) => e.author_character || e.author_username,
    ungrouped: 'Unknown', sortGroups: true,
  },
};

/** Everything the search box looks through. */
const SEARCH_FIELDS = [
  'title', 'body', 'category', 'location_name',
  (e) => e.author_character, (e) => e.author_username,
];

const INPUT_CLS = [
  'w-full bg-surface2 border border-border2 text-text',
  'px-2 py-1.5 rounded-sm text-sm font-body',
  'focus:outline-none focus:border-[var(--gold-dim)] transition-colors',
].join(' ');

const blank = () => ({
  id: null, title: '', body: '', category: '', location_id: '', date: null, visibility: 'public',
});

/**
 * Who may read an entry, as one value for the form's select: 'public',
 * 'hidden' (the DM only), or a player seat's id. The server stores it as
 * `dm_only` plus an optional `visible_to`, which these two translate.
 */
const visibilityOf = (e) => (!e.dm_only ? 'public' : e.visible_to ? String(e.visible_to) : 'hidden');
const visibilityPayload = (v) => ({
  dm_only: v !== 'public',
  visible_to: v !== 'public' && v !== 'hidden' ? Number(v) : null,
});

/**
 * The tag on a restricted entry. A player only ever receives the entries
 * written for their own seat, so for them it is always "you".
 */
export function visibilityLabel(e, isDM) {
  if (e.visible_to) return isDM ? `Only ${e.visible_to_name || 'one player'}` : 'Only you';
  return e.dm_only ? 'DM only' : null;
}

/** The real-world stamp. Short — the in-game date is the interesting one. */
function writtenOn(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * The same three facts as the on-screen meta line, as a plain string.
 *
 * Separate from `meta` below rather than shared, because that one returns JSX
 * and the print document never loads React — there is nothing to render it
 * with. The emoji go too: they print as tofu in half the fonts a browser will
 * fall back to.
 */
export function journalMetaText(e, calType, isDM = true) {
  const when = inGameDate(e.in_game_day, calType);
  return [
    e.author_character || e.author_username,
    e.location_name,
    when,
    // Worth carrying onto paper: a printout that leaves the table should say
    // which lines were never meant for the players.
    visibilityLabel(e, isDM),
  ].filter(Boolean).join(' · ');
}

export default function JournalPanel({
  campaignId, isDM, calendarType = 'harptos', campaignName = '',
}) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [entries, setEntries] = useState([]);
  const [locations, setLocations] = useState([]);
  // The seats a DM can write an entry for. Never fetched for a player.
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(null);       // null = not editing
  const [groupBy, setGroupBy] = useState('category');
  // [[Name]] targets: the index resolves what is written, the raw lists feed
  // the autocomplete in the editor below.
  const { targets, index } = useCrossLinks(campaignId);
  const [popover, setPopover] = useState(null);   // { target, at } | null

  /** Turn a clicked link back into the thing it names. */
  const openLink = useCallback(({ kind, id }, e) => {
    const rows = kind === 'npc' ? targets.npcs : targets.locations;
    const hit = (rows ?? []).find((r) => String(r.id) === String(id));
    if (!hit) return;
    setPopover({ target: { ...hit, kind }, at: { x: e.clientX, y: e.clientY } });
  }, [targets]);

  const fail = useCallback((e) => toast(e?.message || String(e), 'error'), [toast]);

  /**
   * Both lists fail open to empty: a journal that cannot load should leave the
   * tab blank, not take the page down with it.
   */
  const load = useCallback(async () => {
    if (!campaignId) { setEntries([]); setLocations([]); return; }
    setLoading(true);
    try {
      const [list, locs, seats] = await Promise.all([
        campaignsApi.listJournal(campaignId).catch(() => []),
        campaignsApi.listLocations(campaignId).catch(() => []),
        isDM ? campaignsApi.listPlayers(campaignId).catch(() => []) : [],
      ]);
      setEntries(Array.isArray(list) ? list : []);
      setLocations(Array.isArray(locs) ? locs : []);
      setPlayers((Array.isArray(seats) ? seats : [])
        .filter((p) => !p.is_dm_player)
        .sort((a, b) => (a.player_name || '').localeCompare(b.player_name || '')));
    } finally { setLoading(false); }
  }, [campaignId, isDM]);

  useEffect(() => { load(); }, [load]);

  // Alphabetical, like the Locations tab. The server returns them in creation
  // order, which is the order the DM happened to invent them in — no use at
  // all to someone looking for a name in a dropdown.
  const locOptions = useMemo(
    () => [...locations].sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [locations],
  );

  // Existing categories feed the datalist, so filing under one that already
  // exists is a keystroke while inventing a new one stays possible.
  const categories = useMemo(
    () => [...new Set(entries.map((e) => e.category).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [entries],
  );

  function openNew() { setForm(blank()); }

  function openEdit(e) {
    setForm({
      id: e.id,
      title: e.title ?? '',
      body: e.body ?? '',
      category: e.category ?? '',
      location_id: e.location_id ?? '',
      date: partsFromAbsDay(e.in_game_day, calendarType),
      visibility: visibilityOf(e),
    });
  }

  async function save() {
    if (!form.title.trim() && !form.body.trim()) return;
    setBusy(true);
    try {
      const payload = {
        title: form.title,
        body: form.body,
        category: form.category,
        location_id: form.location_id === '' ? null : Number(form.location_id),
        in_game_day: absDayFromParts(form.date, calendarType),
        ...(isDM ? visibilityPayload(form.visibility) : { dm_only: false, visible_to: null }),
      };
      if (form.id) await campaignsApi.editJournal(campaignId, form.id, payload);
      else await campaignsApi.addJournal(campaignId, payload);
      setForm(null);
      await load();
      toast(form.id ? 'Entry saved.' : 'Entry added.');
    } catch (e) { fail(e); } finally { setBusy(false); }
  }

  /*
   * An entry the DM wrote for this player alone, shared with the table by
   * that player. Asked first: it cannot be taken back from this side.
   */
  async function makePublic(e) {
    const ok = await confirm(
      `Share "${e.title || 'this entry'}" with everyone at the table? You cannot make it private again.`,
      { title: 'Make public', confirmLabel: 'Make public' },
    );
    if (!ok) return;
    try {
      await campaignsApi.makeJournalPublic(campaignId, e.id);
      setEntries((prev) => prev.map((x) => (x.id === e.id
        ? { ...x, dm_only: false, visible_to: null, visible_to_name: null } : x)));
      toast('Shared with the table.');
    } catch (err) { fail(err); }
  }

  async function remove(id) {
    try {
      await campaignsApi.removeJournal(campaignId, id);
      setEntries((prev) => prev.filter((e) => e.id !== id));
      toast('Entry deleted.');
    } catch (e) { fail(e); }
  }

  /**
   * Who, where, when — the three things that make a note findable a month
   * later. The written date comes last and dimmest: it answers "which of these
   * two did I write first", not "when did this happen".
   */
  const meta = useCallback((e) => {
    const when = inGameDate(e.in_game_day, calendarType);
    return (
      <span className="flex flex-wrap gap-x-2 gap-y-0.5">
        <span className="text-text-dim">✍ {e.author_character || e.author_username}</span>
        {e.location_name && <span>📍 {e.location_name}</span>}
        {when && <span className="text-gold/70">🗓 {when}</span>}
        <span className="text-text-muted">written {writtenOn(e.created_at)}</span>
        {visibilityLabel(e, isDM) && (
          <span className="font-display uppercase tracking-wider text-[var(--gold)]">
            · {visibilityLabel(e, isDM)}
          </span>
        )}
      </span>
    );
  }, [calendarType, isDM]);

  /**
   * Print what is on screen.
   *
   * `groups` comes from GroupedEntries, so the current grouping and the
   * current search both carry over. Players get this as well as the DM: the
   * journal is theirs to read, and the server has already decided what is in
   * the list — a DM-only entry is not in a player's `entries` to begin with,
   * so there is nothing to filter here.
   */
  function print(groups, query) {
    const ok = openNotesPrint({
      title: campaignName || 'Campaign',
      subtitle: 'Campaign Journal',
      groups,
      ungroupedLabel: GROUP_BY[groupBy].ungrouped,
      meta: (e) => journalMetaText(e, calendarType, isDM),
      // Say so on the paper, or a filtered printout looks like the whole
      // journal with entries mysteriously missing.
      note: [
        `by ${GROUP_BY[groupBy].label.toLowerCase()}`,
        query ? `matching “${query}”` : null,
      ].filter(Boolean).join(', '),
    });
    if (!ok) toast('Allow pop-ups for this site to print.', 'error');
  }

  // Shared, so rights are per entry rather than per list: your own entry is
  // yours to edit, and the DM may remove anyone's without being able to
  // rewrite it. Both halves are enforced server-side; this only avoids
  // offering a button that would 403.
  const can = useCallback(
    (e) => ({ edit: !!e.mine, remove: !!e.mine || isDM }),
    [isDM],
  );

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-[0.7rem] text-text-muted italic flex-1 min-w-[12rem]">
          Shared with everyone in the campaign. {isDM
            ? 'An entry of yours can also be kept to yourself, or shown to one player only.'
            : 'Your entries are visible to the whole table.'}
        </p>
        <Button variant="accent" onClick={openNew} disabled={!campaignId}>＋ New entry</Button>
      </div>

      <GroupedEntries
        entries={entries}
        field={GROUP_BY[groupBy].field}
        ungroupedLabel={GROUP_BY[groupBy].ungrouped}
        sortGroups={GROUP_BY[groupBy].sortGroups}
        searchable
        searchFields={SEARCH_FIELDS}
        searchPlaceholder="Search the journal…"
        links={index}
        onLinkClick={openLink}
        toolbar={({ groups, query }) => (
          <>
            <label className="flex items-center gap-1.5 text-[0.7rem] font-display uppercase
                              tracking-wider text-text-muted">
              Group by
              <select
                value={groupBy}
                onChange={(ev) => setGroupBy(ev.target.value)}
                className="bg-surface2 border border-border2 text-text px-1.5 py-1 rounded-sm
                           text-[0.7rem] font-body normal-case tracking-normal
                           focus:outline-none focus:border-[var(--gold-dim)]"
              >
                {Object.entries(GROUP_BY).map(([k, g]) => (
                  <option key={k} value={k}>{g.label}</option>
                ))}
              </select>
            </label>
            {/* Takes the grouped list from GroupedEntries rather than
                `entries`, so what prints is what is on screen — current
                grouping, current search. */}
            <Button
              variant="default"
              onClick={() => print(groups, query)}
              title="Print the journal as shown"
            >
              🖨 Print
            </Button>
          </>
        )}
        meta={meta}
        can={can}
        accent={(e) => !!e.dm_only || !!e.visible_to}
        onEdit={openEdit}
        onDelete={remove}
        // Only on the player's side: the DM changes visibility by editing.
        extra={(e) => (!isDM && e.visible_to ? (
          <Button variant="default" onClick={() => makePublic(e)}
            title="Share this entry with everyone at the table">📢 Make public</Button>
        ) : null)}
        emptyText={'Nothing written yet. Use this for what the party found — a letter, a name '
          + 'overheard, the thing nobody wants to have to remember.'}
      />

      <Modal open={!!form} onClose={() => setForm(null)} onSubmit={save}
        title={form?.id ? '✎ Edit journal entry' : '＋ New journal entry'}
        className="!max-w-[95vw] !w-[95vw] !max-h-[92vh]">
        {form && (
          <div className="flex flex-col gap-3">
            <FormField label="Title">
              <input type="text" value={form.title} className={INPUT_CLS} autoFocus maxLength={255}
                placeholder="A letter found in the vault…"
                onChange={(ev) => setForm({ ...form, title: ev.target.value })} />
            </FormField>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField label="Category (optional)">
                <input type="text" value={form.category} className={INPUT_CLS} maxLength={120}
                  list="journal-category-options" placeholder="e.g. Documents"
                  onChange={(ev) => setForm({ ...form, category: ev.target.value })} />
                <datalist id="journal-category-options">
                  {categories.map((c) => <option key={c} value={c} />)}
                </datalist>
              </FormField>

              <FormField label="Location (optional)">
                <select value={form.location_id} className={INPUT_CLS}
                  onChange={(ev) => setForm({ ...form, location_id: ev.target.value })}>
                  <option value="">— nowhere in particular —</option>
                  {locOptions.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </FormField>
            </div>

            <CalendarDate
              value={form.date}
              onChange={(date) => setForm({ ...form, date })}
              calType={calendarType}
              label="date"
              hint="When it happened in the world. Leave it blank if it does not matter — the
                    date you wrote it is recorded either way."
            />

            <FormField label="Entry">
              <LinkingTextarea rows={18} value={form.body} className={`${INPUT_CLS} resize-y`}
                targets={targets}
                placeholder={'Markdown works here — **bold**, *italic*, - list.\n'
                  + 'Type [[ to link a location or NPC.'}
                onChange={(v) => setForm({ ...form, body: v })} />
            </FormField>

            {isDM && (
              <FormField label="Who can read it">
                <select value={form.visibility} className={INPUT_CLS}
                  onChange={(ev) => setForm({ ...form, visibility: ev.target.value })}>
                  <option value="public">Everyone at the table</option>
                  <option value="hidden">Only me (hidden from the players)</option>
                  {players.map((p) => (
                    <option key={p.id} value={String(p.id)}>Only {p.player_name} (and me)</option>
                  ))}
                </select>
              </FormField>
            )}

            <div className="flex gap-2 justify-end pt-1">
              <Button variant="ghost" onClick={() => setForm(null)}>Cancel</Button>
              <Button variant="accent" loading={busy}
                disabled={!form.title.trim() && !form.body.trim()} onClick={save}>
                {form.id ? 'Save' : 'Add entry'}
              </Button>
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
