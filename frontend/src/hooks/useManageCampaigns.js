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

export function useManageCampaigns() {
  const { toast } = useToast();

  // ── Users list (for player assignment) ───────────────────────────────────
  const { data: allUsers = [] } = useAsync(usersApi.list, { autoRun: true, deps: [] });

  // ── Campaign list ─────────────────────────────────────────────────────────
  const {
    data: campaigns = [],
    run:  reloadCampaigns,
  } = useAsync(campaignsApi.list, { autoRun: true, deps: [] });

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

  const deleteCampaign = useCallback(async () => {
    if (!currentCampaign) return;
    await campaignsApi.remove(currentId);
    setCurrentId(null);
    await reloadCampaigns();
    toast('Campaign deleted.');
  }, [currentId, currentCampaign, reloadCampaigns, toast]);

  const exportCampaign = useCallback(async () => {
    if (!currentId) return;
    const data = await campaignsApi.exportCampaign(currentId);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `${(currentCampaign?.name ?? 'campaign').replace(/\s+/g, '-').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [currentId, currentCampaign]);

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
      try { await campaignsApi.importCampaign(data); await reloadCampaigns(); toast('Campaign imported.'); }
      catch (e) { toast(e.message, 'error'); }
      return { done: true };
    }
    if (!currentId) { toast('Select a campaign first to import this file into.', 'error'); return { done: true }; }
    if (type === 'journey-map') {
      try { const m = await importJourneyMap(currentId, data); await reload(); toast(`Journey map "${m.name}" imported — open it in the Journey Map module.`); }
      catch (e) { toast(e.message, 'error'); }
      return { done: true };
    }
    if (type === 'pc-sheet') return { need: 'pc-sheet', bundle: data };
    if (type === 'timeline') return { need: 'timeline', bundle: data };
    toast('Unrecognized file — expected a campaign, journey-map, pc-sheet or timeline export.', 'error');
    return { done: true };
  }, [currentId, reloadCampaigns, reload, toast]);

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
    allUsers, campaigns, currentCampaign, currentId,
    players, locations, npcs, timelines, meta,
    loading,

    // Navigation
    activeTab, setActiveTab,
    loadCampaign,

    // Campaign actions
    createCampaign, deleteCampaign, exportCampaign,
    importFile, importPcSheetInto, importTimelineInto,

    // Player actions
    addPlayer, deletePlayer, reassignPlayer, createTimeline,

    // Location actions
    addLocation, editLocation, deleteLocation, toggleLocVisibility,
    uploadLocationImage, clearLocationImage,

    // NPC actions
    addNpcs, deleteNpc,

    // Settings
    saveTodayMarker,

    // Char-tree
    addConnection, editConnection, deleteConnection, toggleConnVisibility,
  };
}
