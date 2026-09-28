/**
 * pages/ManageCampaigns/index.jsx
 *
 * Manage Campaigns — fully migrated from the legacy manage-campaigns.html.
 * DM only (access guard in App.jsx).
 *
 * Layout:
 *   Sidebar (campaign list + create form)  |  Detail panel (tabbed)
 *
 * Tabs:
 *   Players · Locations · NPCs · Timelines · Char Tree · Settings
 */

import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';

import AppHeader               from '@/components/layout/AppHeader';
import { Button, Spinner, Modal, FormField } from '@/components/ui';
import { useManageCampaigns } from '@/hooks/useManageCampaigns';
import { TABS }                from './constants';

import PlayersTab              from './tabs/PlayersTab';
import LocationsTab            from './tabs/LocationsTab';
import { NpcsTab, TimelinesTab, SettingsTab } from './tabs/OtherTabs';
import { CharTreeTab }         from './tabs/CharTreeTab';

// ─────────────────────────────────────────────────────────────────────────────
// Campaign sidebar
// ─────────────────────────────────────────────────────────────────────────────
function CampaignSidebar({ campaigns, currentId, onSelect, onCreate, onImport }) {
  const fileRef   = useRef(null);
  const inputCls  = 'w-full bg-surface3 border border-border2 text-text px-2 py-1.5 rounded-sm text-sm focus:outline-none focus:border-[var(--gold-dim)]';

  function handleSubmit(e) {
    e.preventDefault();
    const fd   = new FormData(e.target);
    const name = fd.get('name')?.toString().trim();
    const desc = fd.get('description')?.toString().trim();
    const cal  = fd.get('calendarType')?.toString() ?? 'harptos';
    if (!name) return;
    onCreate({ name, description: desc || '', calendarType: cal });
    e.target.reset();
  }

  return (
    <aside className="w-56 flex-shrink-0 flex flex-col bg-surface border-r border-border overflow-hidden min-h-0">

      {/* Campaign list */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-3 py-2 font-display text-text-dim text-[0.6rem] uppercase tracking-widest border-b border-border">
          Campaigns
        </div>
        {[...campaigns].sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(c => (
          <div
            key={c.id}
            onClick={() => onSelect(c.id)}
            className={[
              'px-3 py-2.5 cursor-pointer border-b border-border text-sm font-body transition-colors',
              currentId === c.id
                ? 'bg-surface2 border-l-[3px] border-l-gold pl-[9px] text-gold'
                : 'text-text hover:bg-surface2 hover:text-gold',
            ].join(' ')}
          >
            <div className="font-semibold truncate">{c.name}</div>
            {c.calendar_type && (
              <div className="text-text-muted text-[10px] capitalize">{c.calendar_type}</div>
            )}
          </div>
        ))}
      </div>

      {/* Create form */}
      <div className="border-t border-border p-3 flex-shrink-0 bg-surface2">
        <div className="font-display text-text-dim text-[0.6rem] uppercase tracking-widest mb-2">
          New Campaign
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
          <input name="name"        placeholder="e.g., Lost Mines…" required className={inputCls} />
          <textarea name="description" placeholder="Brief description…" rows={2} className={inputCls + ' resize-none'} />
          <div className="flex flex-col gap-0.5">
            <label className="font-display text-text-muted text-[0.55rem] uppercase tracking-wider">
              Calendar Type <span className="text-danger">(cannot change later)</span>
            </label>
            <select name="calendarType" className={inputCls}>
              <option value="harptos">Harptos (D&D / Faerûn)</option>
              <option value="gregorian">Gregorian</option>
            </select>
          </div>
          <Button type="submit" variant="accent" className="w-full justify-center">
            Create Campaign
          </Button>
        </form>

        {/* Import */}
        <div className="mt-2">
          <input ref={fileRef} type="file" accept=".json" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) onImport(f); e.target.value = ''; }} />
          <Button variant="default" className="w-full justify-center" onClick={() => fileRef.current?.click()}>
            <Upload size={12} className="inline mr-1" /> Import
          </Button>
        </div>
      </div>
    </aside>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab bar
// ─────────────────────────────────────────────────────────────────────────────
function TabBar({ tabs, active, counts, onSelect }) {
  return (
    <div className="flex overflow-x-auto border-b border-border flex-shrink-0 bg-surface2">
      {tabs.map(t => {
        const count = counts[t.id];
        return (
          <button
            key={t.id}
            onClick={() => onSelect(t.id)}
            className={[
              'px-4 py-2.5 font-display uppercase tracking-wider text-[0.65rem] whitespace-nowrap',
              'border-r border-border transition-colors flex-shrink-0',
              active === t.id
                ? 'text-gold border-b-2 border-b-gold bg-surface -mb-px'
                : 'text-text-dim hover:text-gold hover:bg-surface',
            ].join(' ')}
          >
            {t.label}
            {t.count && count !== undefined && (
              <span className="ml-1 text-[0.55rem] text-text-muted">({count})</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────
export default function ManageCampaigns() {
  const mc = useManageCampaigns();

  // Import target modal (pc-sheet / timeline need a target player).
  const [importTarget, setImportTarget] = useState(null); // { kind, bundle } | null
  const [targetPlayer, setTargetPlayer] = useState('');
  const [targetName, setTargetName]     = useState('');

  const {
    campaigns, currentCampaign, currentId,
    players, locations, npcs, timelines, meta,
    allUsers, loading,
    activeTab, setActiveTab,
    loadCampaign,
    createCampaign, exportCampaign, importFile, importPcSheetInto, importTimelineInto,
    addPlayer, deletePlayer, reassignPlayer, createTimeline,
    addLocation, editLocation, deleteLocation, toggleLocVisibility,
    addNpcs, deleteNpc,
    saveTodayMarker, deleteCampaign,
  } = mc;

  // Tab content switcher
  const tabCounts = {
    players:   players.length,
    locations: locations.length,
    npcs:      npcs.length,
    timelines: timelines.length,
  };

  async function handleImport(file) {
    const r = await importFile(file);
    if (r?.need) {
      setImportTarget({ kind: r.need, bundle: r.bundle });
      setTargetPlayer(players[0]?.id != null ? String(players[0].id) : '');
      setTargetName(r.bundle?.timeline?.name || 'Imported Timeline');
    }
  }

  function confirmImportTarget() {
    if (!importTarget || !targetPlayer) return;
    if (importTarget.kind === 'pc-sheet') importPcSheetInto(Number(targetPlayer), importTarget.bundle);
    else if (importTarget.kind === 'timeline') importTimelineInto(Number(targetPlayer), targetName.trim() || 'Imported Timeline', importTarget.bundle);
    setImportTarget(null);
  }

  function renderTab() {
    if (!currentCampaign) return null;

    switch (activeTab) {
      case 'players':
        return (
          <PlayersTab
            players={players}
            allUsers={allUsers}
            campaignId={currentId}
            actions={{ addPlayer, deletePlayer, reassignPlayer, createTimeline }}
          />
        );
      case 'locations':
        return (
          <LocationsTab
            locations={locations}
            actions={{ addLocation, editLocation, deleteLocation, toggleLocVisibility }}
          />
        );
      case 'npcs':
        return <NpcsTab npcs={npcs} actions={{ addNpcs, deleteNpc }} />;
      case 'timelines':
        return <TimelinesTab timelines={timelines} campaignId={currentId} />;
      case 'chartree':
        return <CharTreeTab campaignId={currentId} />;
      case 'settings':
        return (
          <SettingsTab
            campaign={currentCampaign}
            meta={meta}
            actions={{ saveTodayMarker, deleteCampaign, exportCampaign }}
          />
        );
      default:
        return null;
    }
  }

  return (
    <>
      <AppHeader icon="🏰" name="Manage Campaigns" />

      <div className="flex flex-1 overflow-hidden min-h-0">

        {/* Sidebar */}
        <CampaignSidebar
          campaigns={campaigns}
          currentId={currentId}
          onSelect={loadCampaign}
          onCreate={createCampaign}
          onImport={handleImport}
        />

        {/* Detail panel */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {!currentCampaign ? (
            <div className="flex-1 flex items-center justify-center text-text-dim italic text-sm">
              Select or create a campaign to get started.
            </div>
          ) : (
            <>
              {/* Campaign title */}
              <div className="flex items-center justify-between px-4 py-2.5 bg-surface2 border-b border-border flex-shrink-0">
                <h2 className="font-display text-gold uppercase tracking-widest text-sm">
                  🏰 {currentCampaign.name}
                </h2>
              </div>

              {/* Tabs */}
              <TabBar
                tabs={TABS}
                active={activeTab}
                counts={tabCounts}
                onSelect={(tab) => {
                  setActiveTab(tab);
                }}
              />

              {/* Tab body */}
              <div className="flex-1 overflow-y-auto p-4">
                {loading ? (
                  <div className="flex justify-center py-12"><Spinner /></div>
                ) : (
                  renderTab()
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Import target picker (pc-sheet / timeline) */}
      <Modal
        open={!!importTarget}
        onClose={() => setImportTarget(null)}
        onSubmit={confirmImportTarget}
        title={importTarget?.kind === 'pc-sheet' ? 'Import PC Sheet' : 'Import Timeline'}
      >
        <div className="flex flex-col gap-3">
          {players.length === 0 ? (
            <p className="text-sm text-text-dim">
              This campaign has no players yet. Add a player first, then import.
            </p>
          ) : (
            <>
              <FormField label={importTarget?.kind === 'pc-sheet' ? 'Assign sheet to player' : 'Add timeline to player'}>
                <select
                  value={targetPlayer}
                  onChange={(e) => setTargetPlayer(e.target.value)}
                  className="w-full bg-surface2 border border-border2 text-text px-2 py-1.5 rounded-sm text-sm focus:outline-none focus:border-[var(--gold-dim)]"
                >
                  {[...players].sort((a, b) => (a.player_name || '').localeCompare(b.player_name || ''))
                    .map((p) => <option key={p.id} value={p.id}>{p.player_name}</option>)}
                </select>
              </FormField>
              {importTarget?.kind === 'timeline' && (
                <FormField label="Timeline name">
                  <input
                    value={targetName}
                    onChange={(e) => setTargetName(e.target.value)}
                    className="w-full bg-surface2 border border-border2 text-text px-2 py-1.5 rounded-sm text-sm focus:outline-none focus:border-[var(--gold-dim)]"
                  />
                </FormField>
              )}
              {importTarget?.kind === 'pc-sheet' && (
                <p className="text-[0.7rem] text-text-muted">Replaces that player's current sheet, stats and relationships.</p>
              )}
            </>
          )}
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => setImportTarget(null)}>Cancel</Button>
            <Button variant="accent" disabled={!players.length || !targetPlayer} onClick={confirmImportTarget}>Import</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
