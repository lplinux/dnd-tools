/**
 * pages/PcSheet/tabs/DiaryTab.jsx
 *
 * The player's own diary, living on their character sheet rather than in a
 * module of its own — it is part of the character, and a player had no reason
 * to visit a separate Diary page that showed them nothing else.
 *
 * The DM reaches the same thing here read-only (and in bulk from the Diary
 * module's Player Diaries tab). Writes are owner-only server-side, so the DM
 * getting an edit button here would just be a 403 waiting to happen.
 */
import { useCallback, useEffect, useState } from 'react';
import { Button, Spinner } from '@/components/ui';
import { useToast } from '@/hooks/useToast';
import { diaryApi } from '@/api/diary';
import GroupedEntries from '@/pages/Diary/GroupedEntries';
import EntryModal from '@/pages/Diary/EntryModal';

export default function DiaryTab({ campaignId, playerId, isDM }) {
  const { toast } = useToast();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modal, setModal] = useState(null);   // { entry } | null

  const fail = useCallback((e) => toast(e?.message || String(e), 'error'), [toast]);

  const load = useCallback(async () => {
    if (!campaignId || !playerId) { setEntries([]); return; }
    setLoading(true);
    try { setEntries((await diaryApi.playerList(campaignId, playerId)) || []); }
    catch (e) { fail(e); } finally { setLoading(false); }
  }, [campaignId, playerId, fail]);

  useEffect(() => { load(); }, [load]);

  async function save(data) {
    const entry = modal?.entry;
    setModal(null);
    setSaving(true);
    try {
      if (entry) await diaryApi.playerUpdate(campaignId, playerId, entry.id, data);
      else await diaryApi.playerCreate(campaignId, playerId, data);
      await load();
      toast(entry ? 'Entry saved.' : 'Entry added.');
    } catch (e) { fail(e); } finally { setSaving(false); }
  }

  async function remove(id) {
    try {
      await diaryApi.playerRemove(campaignId, playerId, id);
      setEntries((prev) => prev.filter((e) => e.id !== id));
      toast('Entry deleted.');
    } catch (e) { fail(e); }
  }

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <p className="text-[0.7rem] text-text-muted italic flex-1">
          {isDM
            ? "This player's private diary, read-only — only they can edit it."
            : 'Private to you. Your DM can read these; no other player can.'}
        </p>
        {!isDM && <Button variant="accent" onClick={() => setModal({ entry: null })}>＋ New entry</Button>}
      </div>

      <GroupedEntries
        entries={entries}
        field="category"
        ungroupedLabel="Uncategorised"
        readOnly={isDM}
        onEdit={(entry) => setModal({ entry })}
        onDelete={remove}
        emptyText={isDM ? 'This player has not written anything yet.'
          : 'Your diary is empty. Write up a session and it stays yours.'}
      />

      <EntryModal
        open={!!modal}
        entry={modal?.entry}
        saving={saving}
        onClose={() => setModal(null)}
        onSave={save}
        groupField="category"
        groupLabel="Category"
        groupOptions={[...new Set(entries.map((e) => e.category).filter(Boolean))]}
      />
    </div>
  );
}
