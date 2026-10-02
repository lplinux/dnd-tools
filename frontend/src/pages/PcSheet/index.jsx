/**
 * pages/PcSheet/index.jsx
 *
 * PC Character Sheet — fully migrated from the legacy pc-sheet.html.
 * DM + Player access (guard in App.jsx).
 *
 * Tabs:
 *   ⚔️ Character  — name, portrait, story, traits, flaws, goals
 *   🎲 Stats      — embedded NpcSheet iframe bridge
 *   🌳 Relationships — relationship list + SVG graph
 *   📢 Public Info
 *   🔒 Private Info  (player + DM)
 *   📜 DM Notes      (DM only)
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Printer } from 'lucide-react';

import AppHeader    from '@/components/layout/AppHeader';
import { Button, Spinner, Markdown } from '@/components/ui';
import { usePcSheet }        from '@/hooks/usePcSheet';
import { useToast }          from '@/hooks/useToast';
import { pcApi }             from '@/api/pc';
import { diaryApi }          from '@/api/diary';

import {
  CharacterTab, StatsTab, RelationsTab,
  PublicInfoTab, PrivateTab, DmNotesTab, DiaryTab,
} from './tabs';
import './pc-print.css';

// ─────────────────────────────────────────────────────────────────────────────
// Tab definitions
// ─────────────────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'character',  label: '⚔️ Character',     role: 'any' },
  { id: 'stats',      label: '🎲 Stats Sheet',    role: 'any' },
  { id: 'relations',  label: '🌳 Relationships',  role: 'any' },
  { id: 'public',     label: '📢 Public Info',    role: 'any' },
  { id: 'private',    label: '🔒 Private Info',   role: 'any' },
  // The player's diary lives on the character sheet, not in its own module —
  // it is part of the character. The DM sees it here read-only, and in bulk
  // from the Diary module.
  { id: 'diary',      label: '📔 Diary',          role: 'any' },
  // 'shared' — the DM always sees this tab; a player sees it only when the DM
  // has actually shared a note with them (the API only ever returns the
  // dm_visible ones to a player, so a non-empty list means exactly that).
  { id: 'dmnotes',    label: '📜 DM Notes',       role: 'shared' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Tab bar
// ─────────────────────────────────────────────────────────────────────────────
function TabBar({ tabs, active, isDM, hasSharedNotes, onSelect }) {
  return (
    <div className="flex overflow-x-auto border-b border-border flex-shrink-0 bg-surface">
      {tabs.map(t => {
        if (t.role === 'dm' && !isDM) return null;
        if (t.role === 'shared' && !isDM && !hasSharedNotes) return null;
        const isDmTab = t.role === 'dm' || t.role === 'shared';
        return (
          <button
            key={t.id}
            onClick={() => onSelect(t.id)}
            className={[
              'px-4 py-2.5 font-display uppercase tracking-wider text-[0.65rem]',
              'border-r border-border transition-colors flex-shrink-0 whitespace-nowrap',
              active === t.id
                ? 'text-gold border-b-2 border-b-gold bg-surface2 -mb-px'
                : isDmTab
                  ? 'text-[#d49f9f] hover:text-[#e8aaaa] hover:bg-surface2'
                  : 'text-text-dim hover:text-gold hover:bg-surface2',
            ].join(' ')}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PcPrintDoc — a print-only document.
//
// This renders PLAIN markup rather than reusing the editable tab components.
// Reusing them meant the PDF contained live form controls, so a long story
// printed as a scrolled-to-the-top textarea, and the app's dark surfaces came
// out as solid blocks on paper. A print document has no business holding
// <textarea>s and buttons.
//
// The Stats section stays an iframe: it is a separate document with its own
// parchment print stylesheet, which already prints well.
// ─────────────────────────────────────────────────────────────────────────────

/** A titled block of text. Title and body stay together across a page break. */
function PrintBlock({ title, children }) {
  if (!children || (typeof children === 'string' && !children.trim())) return null;
  return (
    <div className="pc-print-block">
      <h3>{title}</h3>
      <div className="pc-print-text">{children}</div>
    </div>
  );
}

function PcPrintDoc({
  charData, isDM, relationships, crossConnections, dmNotes, diary,
}) {
  const portrait = charData?.picture_data || charData?.picture_url || null;
  const visibleRels = relationships ?? [];
  // A player prints the notes shared with them, the same ones their DM Notes tab
  // shows. The API never sends them a hidden note, so the filter is belt and
  // braces rather than the thing keeping hidden notes off a player's PDF.
  const notes = isDM ? (dmNotes ?? []) : (dmNotes ?? []).filter((n) => n.dm_visible);

  return (
    <div className="pc-print-doc" aria-hidden="true">
      <h1 className="pc-print-title">{charData?.name || 'Character Sheet'}</h1>

      <section className="pc-print-section">
        {portrait && (
          <img className="pc-print-portrait" src={portrait} alt="" />
        )}
        <PrintBlock title="Story">{charData?.story}</PrintBlock>
        <PrintBlock title="Personality Traits">{charData?.traits}</PrintBlock>
        <PrintBlock title="Flaws">{charData?.flaws}</PrintBlock>
        <PrintBlock title="Goals &amp; Motivations">{charData?.goals}</PrintBlock>
      </section>

      {(visibleRels.length > 0 || (crossConnections ?? []).length > 0) && (
        <section className="pc-print-section">
          <div className="pc-print-block">
            <h3>Relationships</h3>
            <ul className="pc-print-list">
              {visibleRels.map((r) => (
                <li key={r.id}>
                  <strong>{r.name}</strong>
                  {r.relation_type ? ` — ${r.relation_type}` : ''}
                  {r.status_label ? ` (${r.status_label})` : ''}
                  {r.is_dm_only ? ' [DM only]' : ''}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <PrintSection title="Public Information" body={charData?.public_info} />
      <PrintSection title="Private Information" body={charData?.private_info} />

      {notes.length > 0 && (
        <section className="pc-print-section">
          <div className="pc-print-block">
            <h3>DM Notes</h3>
            {notes.map((n) => (
              <div key={n.id} className="pc-print-note">
                <div className="pc-print-text">{n.content}</div>
                {/* The Visible/Hidden status only means anything to the DM —
                    every note on a player's copy is one shared with them. */}
                {isDM && (
                  <span className="pc-print-tag">{n.dm_visible ? 'Visible to player' : 'Hidden'}</span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* The diary starts on a fresh page, so the sheet and the journal can be
          printed, filed or handed over separately. Rendered only when there is
          something in it — an empty section would force a blank page. */}
      {(diary ?? []).length > 0 && (
        <section className="pc-print-diary">
          <h2 className="pc-print-diary-title">Diary</h2>
          {diary.map((e) => (
            <div key={e.id} className="pc-print-block">
              <h3>{e.title}</h3>
              <div className="pc-print-diary-meta">
                {[e.category, e.session_no != null ? `Session ${e.session_no}` : null]
                  .filter(Boolean).join(' · ')}
              </div>
              {/* Diary bodies are markdown, unlike the plain-text sheet fields.
                  pc-print.css neutralises the renderer's colour classes, so the
                  structure survives and the palette does not. */}
              {e.body && <Markdown className="pc-print-text">{e.body}</Markdown>}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

/** A whole page for one long text field, omitted entirely when empty. */
function PrintSection({ title, body }) {
  if (!body || !String(body).trim()) return null;
  return (
    <section className="pc-print-section">
      <PrintBlock title={title}>{body}</PrintBlock>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────
export default function PcSheet() {
  const navigate  = useNavigate();
  const { toast } = useToast();

  const {
    isDM,
    campaigns, currentCampaignId, onCampaignChange,
    players, playersLoading, currentPlayerId, onPlayerChange,
    charData, setCharData, relationships, crossConnections, dmNotes,
    sheetLoading, hasSheet,
    saveCharacter, uploadPortrait,
    addRelationship, editRelationship, deleteRelationship, toggleRelVisibility,
    addDmNote, toggleNoteVisibility, deleteDmNote,
    exportSheet, getPublicLink,
  } = usePcSheet();

  // Track active tab per-player so switching player resets to Character
  const [activeTab, setActiveTab] = useState('character');
  const [printing, setPrinting] = useState(false);
  const [printDiary, setPrintDiary] = useState([]);

  function handlePlayerChange(pid) {
    setActiveTab('character');
    onPlayerChange(pid);
  }

  // Print the whole sheet. The print document is plain markup rendered from the
  // loaded data — no iframe, no editable tabs — so there is nothing to load and
  // nothing to hand-shake with. One frame to let React commit it is enough.
  //
  // This used to wait on the print copy's iframe reporting its height, which in
  // turn replaced a flat 800ms guess. Both are gone with the iframe.
  async function handlePrintAll() {
    if (!hasSheet) { toast('Open a character sheet first.', 'error'); return; }
    // The diary is not loaded by the sheet itself (it lives in its own tab and
    // fetches on open), so pull it now. Failing costs the diary section, not
    // the printout — and it must land in state BEFORE the frames below, or the
    // print document commits without it.
    const entries = currentCampaignId && currentPlayerId
      ? await diaryApi.playerList(currentCampaignId, currentPlayerId).catch(() => [])
      : [];
    setPrintDiary(entries || []);
    setPrinting(true);
    await new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
    window.print();
    setPrinting(false);
  }

  // Stats save (via postMessage bridge)
  async function handleSaveStats(statsPayload) {
    await pcApi.saveStats(currentPlayerId, statsPayload);
    setCharData(prev => ({ ...prev, stats: statsPayload }));
  }

  // Actions bag passed to tab components
  const actions = {
    saveCharacter,
    uploadPortrait,
    addRelationship,
    editRelationship,
    deleteRelationship,
    toggleRelVisibility,
    addDmNote,
    toggleNoteVisibility,
    deleteDmNote,
    getPublicLink,
  };

  const selectorCls = 'hdr-sel';

  return (
    <>
      <AppHeader icon="🧝" name="PC Character Sheet">
        {/* Campaign selector */}
        <select
          className={selectorCls}
          value={currentCampaignId ?? ''}
          onChange={e => onCampaignChange(e.target.value || null)}
        >
          <option value="">— Select Campaign —</option>
          {[...campaigns].sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        {/* Player selector */}
        <select
          className={selectorCls}
          value={currentPlayerId ?? ''}
          onChange={e => handlePlayerChange(e.target.value || null)}
          disabled={!currentCampaignId || playersLoading}
        >
          <option value="">— Select Player —</option>
          {[...players].sort((a, b) => (a.player_name || '').localeCompare(b.player_name || '')).map(p => <option key={p.id} value={p.id}>{p.player_name}</option>)}
        </select>

        {/* Action buttons — only when a sheet is loaded */}
        {hasSheet && (
          <>
            <Button variant="default"
              onClick={() => navigate(`/timeline?campaign=${currentCampaignId}&player=${currentPlayerId}`)}>
              📜 Timeline
            </Button>
            <Button variant="default" onClick={exportSheet}>
              <Download size={12} className="inline mr-1" /> Export
            </Button>
            <Button variant="default" loading={printing}
              onClick={handlePrintAll}>
              <Printer size={12} className="inline mr-1" /> PDF
            </Button>
          </>
        )}
      </AppHeader>

      {/* Main content */}
      <div className={`pc-screen flex-1 flex flex-col overflow-hidden min-h-0${printing ? ' pc-screen-printing' : ''}`}>
        {!hasSheet ? (
          /* Empty state */
          <div className="flex-1 flex flex-col items-center justify-center text-text-dim italic gap-3">
            <span className="text-5xl">🎲</span>
            <p>Select a campaign and player to view the Character Sheet</p>
            {sheetLoading && <Spinner />}
          </div>
        ) : sheetLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Spinner />
          </div>
        ) : (
          <>
            <TabBar
              tabs={TABS}
              active={activeTab}
              isDM={isDM}
              hasSharedNotes={(dmNotes ?? []).length > 0}
              onSelect={setActiveTab}
            />

            <div className={[
              'flex-1 min-h-0',
              activeTab === 'stats' ? 'flex flex-col overflow-hidden' : 'overflow-y-auto p-4',
            ].join(' ')}>
              {activeTab === 'character' && (
                <CharacterTab
                  charData={charData}
                  playerId={currentPlayerId}
                  actions={actions}
                />
              )}
              {activeTab === 'stats' && (
                <StatsTab
                  key={currentPlayerId}
                  playerId={currentPlayerId}
                  charData={charData}
                  onSaveStats={handleSaveStats}
                />
              )}
              {activeTab === 'relations' && (
                <RelationsTab
                  relationships={relationships}
                  crossConnections={crossConnections}
                  playerId={currentPlayerId}
                  charName={charData?.name}
                  isDM={isDM}
                  actions={actions}
                />
              )}
              {activeTab === 'public' && (
                <PublicInfoTab charData={charData} actions={actions} />
              )}
              {activeTab === 'private' && (
                <PrivateTab charData={charData} actions={actions} />
              )}
              {activeTab === 'diary' && (
                <DiaryTab
                  key={currentPlayerId}
                  campaignId={currentCampaignId}
                  playerId={currentPlayerId}
                  isDM={isDM}
                />
              )}
              {activeTab === 'dmnotes' && (
                <DmNotesTab notes={dmNotes} isDM={isDM} actions={actions} />
              )}
            </div>
          </>
        )}
      </div>

      {printing && hasSheet && (
        <PcPrintDoc
          charData={charData}
          isDM={isDM}
          relationships={relationships}
          crossConnections={crossConnections}
          dmNotes={dmNotes}
          diary={printDiary}
        />
      )}
    </>
  );
}
