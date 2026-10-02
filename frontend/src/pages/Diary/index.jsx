/**
 * pages/Diary/index.jsx
 *
 * Session summaries. One route for both roles, branched inside — the way
 * /timeline already serves DM and player from one page.
 *
 *   DM     — Campaign Diary (full CRUD, draft→published, share link) and a
 *            read-only view of every player's diary.
 *   Player — their own private diary only. The Campaign Diary tab is not
 *            rendered and, more importantly, never requested.
 */

import { useRef, useState } from 'react';
import AppHeader from '@/components/layout/AppHeader';
import { Button, Select, Spinner } from '@/components/ui';
import { useConfirm } from '@/contexts/ConfirmContext';
import { useDiary } from '@/hooks/useDiary';
import GroupedEntries from './GroupedEntries';
import EntryModal from './EntryModal';
import PlayerDiaryPanel from './PlayerDiaryPanel';
import { openDiaryBook } from './printBook';
import { diaryApi } from '@/api/diary';

export default function Diary() {
  const d = useDiary();
  const confirm = useConfirm();
  const [tab, setTab] = useState('campaign');
  const [modal, setModal] = useState(null); // { scope: 'campaign'|'player', entry } | null
  const fileRef = useRef(null);

  const activeTab = tab;   // DM-only page; the role branch moved to the PC Sheet

  async function share() {
    const url = await d.loadShareUrl();
    if (!url) return;
    const msg = `Public diary link copied — shows PUBLISHED entries only:\n${url}`;
    try { await navigator.clipboard.writeText(url); window.alert(msg); }
    catch { window.prompt('Public diary link — published entries only:', url); }
  }

  // Import lives here as well as in the Manage Campaigns hub — the same
  // shortcut the Players tab has for PC sheets. The hub stays the general
  // entry point; this is the one you reach for when you are already looking at
  // the diary you want to replace.
  async function handleFilePicked(e) {
    const file = e.target.files?.[0];
    e.target.value = '';                 // so re-picking the same file re-fires
    if (!file) return;

    let bundle;
    try { bundle = JSON.parse(await file.text()); }
    catch { window.alert('That file is not valid JSON.'); return; }
    if (bundle?.type !== 'campaign-diary') {
      window.alert('Unrecognized file — expected a campaign-diary export.');
      return;
    }

    const incoming = (bundle.entries || []).length;
    const existing = d.campaignEntries.length;
    const ok = await confirm(
      existing
        ? `Replace this campaign's diary with the ${incoming} ${incoming === 1 ? 'entry' : 'entries'} in this file? Its current ${existing} ${existing === 1 ? 'entry' : 'entries'} will be permanently deleted.`
        : `Import ${incoming} diary ${incoming === 1 ? 'entry' : 'entries'} into this campaign?`,
      { title: 'Import campaign diary', confirmLabel: existing ? 'Replace' : 'Import' },
    );
    if (ok) d.importDiary(bundle);
  }

  async function printBook() {
    // Published only — the book is the finished narrative, and the builder
    // filters again regardless.
    const published = d.campaignEntries.filter((e) => e.status === 'published');
    if (!published.length) {
      window.alert('Nothing to print yet — publish at least one entry first.');
      return;
    }
    const name = d.campaigns.find((c) => String(c.id) === String(d.campaignId))?.name || 'Campaign';
    // Credits and bios are fetched only now: portraits are base64 and have no
    // business loading on a page nobody is printing. A failure here costs the
    // annex, not the book.
    const roster = await diaryApi.roster(d.campaignId).catch(() => null);
    if (!openDiaryBook({ campaignName: name, entries: published, roster })) {
      window.alert('Your browser blocked the print window. Allow pop-ups for this site and try again.');
    }
  }

  async function revoke() {
    const ok = await confirm(
      'Revoke the public link? Anyone you have already sent it to will get a "not found" page, and a new link will be a different URL.',
      { title: 'Revoke diary link', confirmLabel: 'Revoke' },
    );
    if (ok) d.revokeShare();
  }

  function save(data) {
    const { scope, entry } = modal;
    if (scope === 'campaign') {
      if (entry) d.updateCampaignEntry(entry.id, data); else d.createCampaignEntry(data);
    } else if (entry) d.updatePlayerEntry(entry.id, data); else d.createPlayerEntry(data);
    setModal(null);
  }

  const tabCls = (id) => [
    'px-4 py-2 font-display uppercase tracking-wider text-[0.65rem] border-r border-border transition-colors',
    activeTab === id ? 'text-gold border-b-2 border-b-gold bg-surface2 -mb-px' : 'text-text-dim hover:text-gold hover:bg-surface2',
  ].join(' ');

  return (
    <>
      <AppHeader icon="📔" name="Diary">
        <Select value={d.campaignId ?? ''} onChange={(e) => d.selectCampaign(e.target.value || null)}>
          <option value="">— Select Campaign —</option>
          {[...d.campaigns].sort((a, b) => (a.name || '').localeCompare(b.name || ''))
            .map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        {d.isDM && d.campaignId && activeTab === 'campaign' && (
          <>
            <Button variant="default" onClick={printBook} title="Print the published entries as a book (PDF)">
              🖨 Print book
            </Button>
            <Button variant="default" onClick={d.exportDiary} title="Download this diary as a .json">
              ⬇ Export
            </Button>
            <Button variant="default" onClick={() => fileRef.current?.click()}
              title="Replace this diary from a .json export">
              ⬆ Import
            </Button>
            <Button variant="default" onClick={share} title="Copy a read-only public link to the published entries">
              🔗 Share
            </Button>
            {d.shareUrl && (
              <Button variant="danger" onClick={revoke} title="Invalidate the current public link">
                Revoke
              </Button>
            )}
          </>
        )}
      </AppHeader>

      <main className="flex-1 overflow-y-auto min-h-0">
        {!d.campaignId ? (
          <div className="flex flex-col items-center justify-center text-text-dim italic gap-3 py-20">
            <span className="text-5xl">📔</span>
            <p>Select a campaign to open its diary</p>
          </div>
        ) : d.loading ? (
          <div className="flex justify-center py-20"><Spinner /></div>
        ) : (
          <>
            {d.isDM && (
              <div className="flex border-b border-border bg-surface flex-shrink-0">
                <button className={tabCls('campaign')} onClick={() => setTab('campaign')}>📖 Campaign Diary</button>
                <button className={tabCls('player')} onClick={() => setTab('player')}>🔒 Player Diaries</button>
              </div>
            )}

            <div className="p-4">
              {activeTab === 'campaign' ? (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <p className="text-[0.7rem] text-text-muted italic flex-1">
                      Players cannot see this in the app. Published entries appear on the share link; drafts never leave the server.
                    </p>
                    <Button variant="accent" onClick={() => setModal({ scope: 'campaign', entry: null })}>
                      ＋ New entry
                    </Button>
                  </div>
                  <GroupedEntries
                    entries={d.campaignEntries}
                    field="chapter"
                    ungroupedLabel="No chapter"
                    showStatus
                    onEdit={(entry) => setModal({ scope: 'campaign', entry })}
                    onDelete={d.deleteCampaignEntry}
                    onSetStatus={d.setEntryStatus}
                    emptyText="No session summaries yet. Write one up after your next session."
                  />
                </div>
              ) : (
                <PlayerDiaryPanel
                  isDM={d.isDM}
                  entries={d.playerEntries}
                  myPlayerId={d.myPlayerId}
                  onNew={() => setModal({ scope: 'player', entry: null })}
                  onEdit={(entry) => setModal({ scope: 'player', entry })}
                  onDelete={d.deletePlayerEntry}
                />
              )}
            </div>
          </>
        )}
      </main>

      <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleFilePicked} />

      <EntryModal
        open={!!modal}
        entry={modal?.entry}
        saving={d.saving}
        onClose={() => setModal(null)}
        onSave={save}
        groupField={modal?.scope === 'player' ? 'category' : 'chapter'}
        groupLabel={modal?.scope === 'player' ? 'Category' : 'Chapter'}
        groupOptions={modal?.scope === 'player'
          ? [...new Set(d.playerEntries.map((e) => e.category).filter(Boolean))]
          : [...new Set(d.campaignEntries.map((e) => e.chapter).filter(Boolean))]}
      />
    </>
  );
}
