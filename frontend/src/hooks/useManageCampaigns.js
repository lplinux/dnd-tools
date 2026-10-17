/**
 * hooks/useManageCampaigns.js
 *
 * All state and actions for the Manage Campaigns page.
 * Returns everything the page and its sub-components need.
 */

import { useCallback, useState } from 'react';
import { useAsync }       from '@/hooks/useAsync';
import { useToast }       from '@/hooks/useToast';
import { campaignsApi }   from '@/api/campaigns';
import { usersApi }       from '@/api/users';
import { timelineApi }    from '@/api/timeline';
import { pcApi }          from '@/api/pc';
import { compressImage }  from '@/components/map/compressImage';
import { importJourneyMap } from '@/api/importJourneyMap';
import { diaryApi }       from '@/api/diary';
import { useConfirm }     from '@/contexts/ConfirmContext';
import { downloadBundle } from '@/api/downloadBundle';

export function useManageCampaigns() {
  const { toast } = useToast();
  const confirm = useConfirm();

  // ── Users list (for player assignment) ───────────────────────────────────
  const { data: allUsers = [] } = useAsync(usersApi.list, { autoRun: true, deps: [] });

  // ── Campaign list ─────────────────────────────────────────────────────────
  const {
    data: campaigns = [],
    run:  reloadCampaigns,
  } = useAsync(campaignsApi.list, { autoRun: true, deps: [] });

  // ── Trash ─────────────────────────────────────────────────────────────────
  // Loaded up front alongside the live list so the sidebar can show its count
  // without a second round-trip when the section is opened. It is a short list
  // by nature, and it only changes when one of the three actions below runs.
  const {
    data: trashedCampaigns = [],
    run:  reloadTrash,
  } = useAsync(campaignsApi.listTrashed, { autoRun: true, deps: [] });

  // ── Active campaign ───────────────────────────────────────────────────────
  const [currentId,  setCurrentId]  = useState(null);
  const [activeTab,  setActiveTab]  = useState('players');

  // Per-tab data — loaded when a campaign is selected
  const [players,    setPlayers]    = useState([]);
  const [locations,  setLocations]  = useState([]);
  const [npcs,       setNpcs]       = useState([]);
  const [timelines,  setTimelines]  = useState([]);
  const [meta,       setMeta]       = useState(null);
  const [loading,    setLoading]    = useState(false);

  const currentCampaign = campaigns.find(c => c.id === currentId) ?? null;

  // ── Load all data for a campaign ─────────────────────────────────────────
  // `silent` refreshes the data in place without flipping the loading flag, so
  // the page doesn't unmount its content (and reset scroll) after a mutation.
  // The spinner is only shown when first selecting / switching campaigns.
  const loadCampaign = useCallback(async (id, { silent = false } = {}) => {
    setCurrentId(id);
    // Deselecting. The mobile layout uses this as its "back to the list"
    // action; without the guard it would fire five requests with a null id.
    if (id == null) {
      setPlayers([]); setLocations([]); setNpcs([]); setTimelines([]); setMeta(null);
      return;
    }
    if (!silent) setLoading(true);
    try {
      const [p, l, n, t, m] = await Promise.all([
        campaignsApi.listPlayers(id),
        campaignsApi.listLocations(id),
        campaignsApi.listNpcs(id),
        campaignsApi.listTimelines(id),
        campaignsApi.getMeta(id),
      ]);
      setPlayers(p   ?? []);
      setLocations(l ?? []);
      setNpcs(n      ?? []);
      setTimelines(t ?? []);
      setMeta(m      ?? {});
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [toast]);

  const reload = useCallback(() => {
    if (currentId) loadCampaign(currentId, { silent: true });
  }, [currentId, loadCampaign]);

  // ── Campaign CRUD ─────────────────────────────────────────────────────────
  const createCampaign = useCallback(async ({ name, description, calendarType }) => {
    await campaignsApi.create({ name, description, calendarType });
    await reloadCampaigns();
    toast(`Campaign "${name}" created.`);
  }, [reloadCampaigns, toast]);

  // Soft delete. Both lists have to be refreshed: the campaign leaves one and
  // joins the other.
  const deleteCampaign = useCallback(async () => {
    if (!currentCampaign) return;
    const name = currentCampaign.name;
    await campaignsApi.remove(currentId);
    setCurrentId(null);
    await Promise.all([reloadCampaigns(), reloadTrash()]);
    toast(`"${name}" moved to Trash.`);
  }, [currentId, currentCampaign, reloadCampaigns, reloadTrash, toast]);

  const restoreCampaign = useCallback(async (id, name) => {
    await campaignsApi.restore(id);
    await Promise.all([reloadCampaigns(), reloadTrash()]);
    toast(`"${name}" restored.`);
  }, [reloadCampaigns, reloadTrash, toast]);

  // The irreversible one. Only the trash list needs reloading — a purged
  // campaign was never in the live list to begin with.
  const purgeCampaign = useCallback(async (id, name) => {
    await campaignsApi.purge(id);
    await reloadTrash();
    toast(`"${name}" permanently deleted.`);
  }, [reloadTrash, toast]);

  const exportCampaign = useCallback(async () => {
    if (!currentId) return;
    const data = await campaignsApi.exportCampaign(currentId);
    downloadBundle(data, { module: 'campaign', name: currentCampaign?.name });
  }, [currentId, currentCampaign]);

  // Same export, by explicit id, for a campaign in the trash. `exportCampaign`
  // above can only ever reach `currentId`, which comes from the live list — so
  // without this there was no way to take a copy before purging, even though
  // the server deliberately keeps the export route open on trashed campaigns.
  const exportTrashed = useCallback(async (id, name) => {
    const data = await campaignsApi.exportCampaign(id);
    downloadBundle(data, { module: 'campaign', name });
  }, []);

  // Central importer: sniff `bundle.type` and route. `campaign` restores a NEW
  // campaign (unchanged path); the others merge into the SELECTED campaign — and
  // pc-sheet/timeline need a target player, so they return a `need` for the page to
  // resolve with a modal, then call importPcSheetInto / importTimelineInto.
  const importFile = useCallback(async (file) => {
    let data;
    try { data = JSON.parse(await file.text()); }
    catch { toast('That file is not valid JSON.', 'error'); return { done: true }; }
    const type = data?.type;

    if (type === 'campaign') {
      /*
       * Two things a campaign file can mean, so it asks rather than guessing:
       * restore it as a NEW campaign, or merge it into the one on screen.
       *
       * The counts are the whole point of the question. "Replace?" with no
       * numbers is not a decision anyone can make, and this one can delete —
       * the same reasoning the diary import below was built on.
       */
      const target = currentId ? campaigns.find((c) => String(c.id) === String(currentId)) : null;
      let into = false;
      if (target) {
        const parts = [];
        if (Array.isArray(data.npcs)) parts.push(`${data.npcs.length} NPC${data.npcs.length === 1 ? '' : 's'}`);
        if (Array.isArray(data.locations)) parts.push(`${data.locations.length} location${data.locations.length === 1 ? '' : 's'}`);
        if (Array.isArray(data.campaign_journal)) parts.push(`${data.campaign_journal.length} journal entries`);
        if (Array.isArray(data.campaign_diary)) parts.push(`${data.campaign_diary.length} diary entries`);
        const held = [];
        if (Array.isArray(data.players) && data.players.length) held.push('player sheets');
        if (Array.isArray(data.journey_maps) && data.journey_maps.length) held.push('maps');
        into = await confirm(
          [
            `Replace ${parts.join(', ') || 'nothing'} in "${target.name}" with what is in this file?`,
            'Anything the file does not carry is left alone.',
            held.length ? `Its ${held.join(' and ')} will NOT be imported.` : null,
            'Choose Cancel to import it as a separate new campaign instead.',
          ].filter(Boolean).join('\n\n'),
          { title: `Import into ${target.name}`, confirmLabel: 'Replace' },
        );
      }
      try {
        if (into) {
          const r = await campaignsApi.importIntoCampaign(currentId, data);
          await reload();
          await reloadCampaigns();
          const bits = [
            r.npcs && `NPCs: ${r.npcs.added} added, ${r.npcs.updated} updated${r.npcs.removed ? `, ${r.npcs.removed} removed` : ''}`,
            r.locations && `locations: ${r.locations.added} added, ${r.locations.updated} updated`,
            r.journal && `journal: ${r.journal.added}`,
            r.diary && `diary: ${r.diary.added}`,
          ].filter(Boolean).join(' · ');
          toast(`Imported into ${target.name} — ${bits || 'nothing to do'}.`);
          // Said plainly rather than buried: an NPC something still points at
          // is kept on purpose, and the DM has to decide what to do with it.
          if (r.npcs?.kept?.length) {
            toast(`Kept ${r.npcs.kept.length} NPC(s) the file omits — still used by a timeline or the char tree: ${r.npcs.kept.slice(0, 5).join(', ')}.`);
          }
        } else {
          await campaignsApi.importCampaign(data);
          await reloadCampaigns();
          toast('Campaign imported as a new campaign.');
        }
      } catch (e) { toast(e.message, 'error'); }
      return { done: true };
    }
    if (!currentId) { toast('Select a campaign first to import this file into.', 'error'); return { done: true }; }
    if (type === 'journey-map') {
      try { const m = await importJourneyMap(currentId, data); await reload(); toast(`Journey map "${m.name}" imported — open it in the Journey Map module.`); }
      catch (e) { toast(e.message, 'error'); }
      return { done: true };
    }
    // The only DESTRUCTIVE type in the hub: a diary import replaces the target
    // campaign's diary rather than merging into it, so unlike the others it asks
    // first — and names real counts, because "are you sure?" with no numbers is
    // not a decision anyone can actually make.
    if (type === 'campaign-diary') {
      try {
        const existing = (await diaryApi.campaignList(currentId).catch(() => [])) || [];
        const incoming = (data.entries || []).length;
        const ok = await confirm(
          existing.length
            ? `Replace this campaign's diary with the ${incoming} ${incoming === 1 ? 'entry' : 'entries'} in this file? Its current ${existing.length} ${existing.length === 1 ? 'entry' : 'entries'} will be permanently deleted.`
            : `Import ${incoming} diary ${incoming === 1 ? 'entry' : 'entries'} into this campaign?`,
          { title: 'Import campaign diary', confirmLabel: existing.length ? 'Replace' : 'Import' },
        );
        if (!ok) return { done: true };
        const r = await diaryApi.importCampaignDiary(currentId, data);
        toast(`Diary imported — ${r.imported} ${r.imported === 1 ? 'entry' : 'entries'}${r.replaced ? `, replacing ${r.replaced}` : ''}.`);
      } catch (e) { toast(e.message, 'error'); }
      return { done: true };
    }
    if (type === 'pc-sheet') return { need: 'pc-sheet', bundle: data };
    if (type === 'timeline') return { need: 'timeline', bundle: data };
    toast('Unrecognized file — expected a campaign, journey-map, pc-sheet, timeline or campaign-diary export.', 'error');
    return { done: true };
  }, [currentId, campaigns, reloadCampaigns, reload, toast, confirm]);

  const importPcSheetInto = useCallback(async (playerId, bundle) => {
    try { await pcApi.importSheet(playerId, bundle); await reload(); toast('PC sheet imported.'); }
    catch (e) { toast(e.message, 'error'); }
  }, [reload, toast]);

  const importTimelineInto = useCallback(async (playerId, name, bundle) => {
    try {
      const r = await timelineApi.importInto(currentId, { player_id: playerId, timeline_name: name, events: bundle.events || [] });
      await reload();
      toast(`Timeline imported — ${r.imported} event${r.imported === 1 ? '' : 's'}.`);
    } catch (e) { toast(e.message, 'error'); }
  }, [currentId, reload, toast]);

  // ── Players ───────────────────────────────────────────────────────────────
  const addPlayer = useCallback(async (name, userId) => {
    await campaignsApi.addPlayer(currentId, { name, userId: userId || null });
    await reload();
    toast('Player added.');
  }, [currentId, reload, toast]);

  const deletePlayer = useCallback(async (pid) => {
    await campaignsApi.removePlayer(currentId, pid);
    await reload();
    toast('Player deleted.');
  }, [currentId, reload, toast]);

  const reassignPlayer = useCallback(async (pid, newUserId) => {
    await campaignsApi.reassignPlayer(currentId, pid, { userId: newUserId || null });
    await reload();
    toast('Player reassigned.');
  }, [currentId, reload, toast]);

  const createTimeline = useCallback(async (pid, name) => {
    await timelineApi.create(currentId, pid, { name });
    await reload();
    toast('Timeline created.');
  }, [currentId, reload, toast]);

  // ── Locations ─────────────────────────────────────────────────────────────
  const addLocation = useCallback(async (locData) => {
    await campaignsApi.addLocation(currentId, locData);
    await reload();
    toast('Location added.');
  }, [currentId, reload, toast]);

  const editLocation = useCallback(async (lid, data) => {
    await campaignsApi.updateLocation(currentId, lid, data);
    await reload();
    toast('Location updated.');
  }, [currentId, reload, toast]);

  const deleteLocation = useCallback(async (lid) => {
    await campaignsApi.removeLocation(currentId, lid);
    await reload();
    toast('Location deleted.');
  }, [currentId, reload, toast]);

  // Custom pin image — compressed to a small (~256px) thumbnail since it renders as a
  // ~26px pin. Returns the stored data URL so the caller can update its preview.
  const uploadLocationImage = useCallback(async (lid, file) => {
    if (file.size > 20 * 1024 * 1024) { toast('File exceeds 20 MB — use a smaller image', 'error'); return null; }
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Could not read file'));
      reader.onload = (e) => resolve(e.target.result);
      reader.readAsDataURL(file);
    });
    const compressed = await compressImage(dataUrl, { maxDim: 256, maxBytes: 256 * 1024 });
    await campaignsApi.setLocationImage(currentId, lid, compressed);
    setLocations(prev => prev.map(l => (l.id === lid ? { ...l, image_data: compressed } : l)));
    toast('Location image saved.');
    return compressed;
  }, [currentId, toast]);

  const clearLocationImage = useCallback(async (lid) => {
    await campaignsApi.setLocationImage(currentId, lid, null);
    setLocations(prev => prev.map(l => (l.id === lid ? { ...l, image_data: null } : l)));
    toast('Location image removed.');
  }, [currentId, toast]);

  // Optimistic: flip the one boolean locally (no full refetch → no scroll jump).
  const toggleLocVisibility = useCallback(async (lid) => {
    const flip = () => setLocations(prev =>
      prev.map(l => (l.id === lid ? { ...l, is_public: !l.is_public } : l)));
    flip();
    try {
      await campaignsApi.toggleLocationVis(currentId, lid);
    } catch (e) {
      flip(); // revert
      toast(e.message, 'error');
    }
  }, [currentId, toast]);

  // ── NPCs ──────────────────────────────────────────────────────────────────
  const addNpcs = useCallback(async (names) => {
    await campaignsApi.addNpcs(currentId, { names });
    await reload();
    toast(`${names.length} NPC(s) added.`);
  }, [currentId, reload, toast]);

  const editNpc = useCallback(async (nid, data) => {
    await campaignsApi.updateNpc(currentId, nid, data);
    await reload();
    toast('NPC updated.');
  }, [currentId, reload, toast]);

  const toggleNpcVisibility = useCallback(async (nid) => {
    const row = await campaignsApi.toggleNpcVis(currentId, nid);
    // Patched in place rather than reloaded: the eye is clicked repeatedly
    // while revealing a scene, and a full campaign reload per click makes the
    // whole tab flicker. The server returns the new row, so this is its
    // answer and not an optimistic guess.
    setNpcs(prev => prev.map(n => (n.id === nid ? { ...n, ...row } : n)));
  }, [currentId]);

  const deleteNpc = useCallback(async (nid) => {
    await campaignsApi.removeNpc(currentId, nid);
    await reload();
    toast('NPC removed.');
  }, [currentId, reload, toast]);

  // ── Meta / today marker ───────────────────────────────────────────────────
  const saveTodayMarker = useCallback(async (absDay) => {
    await campaignsApi.saveMeta(currentId, { today_marker: absDay ? String(absDay) : null });
    const m = await campaignsApi.getMeta(currentId);
    setMeta(m ?? {});
  }, [currentId]);

  // ── Char-tree connections ─────────────────────────────────────────────────
  const addConnection = useCallback(async (data) => {
    await campaignsApi.addCharConnection(currentId, data);
    toast('Connection added.');
  }, [currentId, toast]);

  const editConnection = useCallback(async (id, data) => {
    await campaignsApi.editCharConnection(currentId, id, data);
    toast('Connection updated.');
  }, [currentId, toast]);

  const deleteConnection = useCallback(async (id) => {
    await campaignsApi.removeCharConnection(currentId, id);
    toast('Connection removed.');
  }, [currentId, toast]);

  const toggleConnVisibility = useCallback(async (id) => {
    await campaignsApi.toggleCharConnVis(currentId, id);
  }, [currentId]);

  return {
    // Data
    allUsers, campaigns, trashedCampaigns, currentCampaign, currentId,
    players, locations, npcs, timelines, meta,
    loading,

    // Navigation
    activeTab, setActiveTab,
    loadCampaign,

    // Campaign actions
    createCampaign, deleteCampaign, exportCampaign,
    restoreCampaign, purgeCampaign, exportTrashed,
    importFile, importPcSheetInto, importTimelineInto,

    // Player actions
    addPlayer, deletePlayer, reassignPlayer, createTimeline,

    // Location actions
    addLocation, editLocation, deleteLocation, toggleLocVisibility,
    uploadLocationImage, clearLocationImage,

    // NPC actions
    addNpcs, editNpc, toggleNpcVisibility, deleteNpc,

    // Settings
    saveTodayMarker,

    // Char-tree
    addConnection, editConnection, deleteConnection, toggleConnVisibility,
  };
}
