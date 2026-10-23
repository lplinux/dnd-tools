/**
 * hooks/useManageCampaigns.js
 *
 * All state and actions for the Manage Campaigns page.
 * Returns everything the page and its sub-components need.
 */

import { useCallback, useRef, useState } from 'react';
import { useAsync }       from '@/hooks/useAsync';
import { useToast }       from '@/hooks/useToast';
import { campaignsApi }   from '@/api/campaigns';
import { usersApi }       from '@/api/users';
import { timelineApi }    from '@/api/timeline';
import { pcApi }          from '@/api/pc';
import { compressImage }  from '@/components/map/compressImage';
import { importJourneyMap } from '@/api/importJourneyMap';
import { diaryApi }       from '@/api/diary';
import { sessionsApi }    from '@/api/sessions';
import { useConfirm }     from '@/contexts/ConfirmContext';
import { downloadBundle, IMPORT_LIMIT_MB } from '@/api/downloadBundle';

/** Campaign names compare the way the server compares them. */
const sameCampaignName = (a, b) =>
  String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();

/**
 * "Leruhy" → "Leruhy (2)", the first free one among these campaigns. The
 * server does the same with the last word, and its answer wins when the two
 * disagree — this one is only the name the dialog opens with.
 */
function freeName(campaigns, name) {
  const base = String(name).trim().replace(/\s+\(\d+\)$/, '');
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${base} (${n})`;
    if (!campaigns.some((c) => sameCampaignName(c.name, candidate))) return candidate;
  }
  return `${base} (copy)`;
}

/**
 * What merging this file into a campaign would do, in words, for the
 * dialog. The counts are the whole point: "Replace?" with no numbers is not
 * a decision anyone can make, and this one can delete.
 */
function mergeSummary(data) {
  const n = (arr, one, many = `${one}s`) => `${arr.length} ${arr.length === 1 ? one : many}`;
  const replaces = [];
  if (Array.isArray(data.npcs)) replaces.push(n(data.npcs, 'NPC'));
  if (Array.isArray(data.locations)) replaces.push(n(data.locations, 'location'));
  if (Array.isArray(data.campaign_journal)) replaces.push(n(data.campaign_journal, 'journal entry', 'journal entries'));
  if (Array.isArray(data.campaign_diary)) replaces.push(n(data.campaign_diary, 'diary entry', 'diary entries'));
  // Named, because a matched session is REPLACED whole — its cards deleted
  // and rebuilt — and that is the most destructive thing in this list.
  if (Array.isArray(data.sessions) && data.sessions.length) {
    replaces.push(`${n(data.sessions, 'session')} of prep (matched ones replaced whole)`);
  }
  // ADDED rather than replaced: replacing a survey would delete its history.
  const adds = [];
  if (Array.isArray(data.surveys) && data.surveys.length) {
    adds.push(`${n(data.surveys, 'survey')} (ones already there by title are skipped)`);
  }
  // Everything the server will NOT merge, named before the click.
  const held = [];
  if (Array.isArray(data.players) && data.players.length) held.push('player sheets');
  if (Array.isArray(data.journey_maps) && data.journey_maps.length) held.push('maps');
  if (Array.isArray(data.dm_timelines) && data.dm_timelines.length) held.push('DM timelines');
  if (Array.isArray(data.party_events) && data.party_events.length) held.push('party events');
  if (Array.isArray(data.item_cards) && data.item_cards.length) held.push('item cards');
  if (Array.isArray(data.cross_connections) && data.cross_connections.length) held.push('Char Tree connections');
  return { replaces, adds, held };
}

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
    const r = await campaignsApi.restore(id);
    await Promise.all([reloadCampaigns(), reloadTrash()]);
    // Renamed when the name is in use by now — which it always is after an
    // import replaced this campaign, because that import took its name.
    toast(r?.renamed_to
      ? `"${name}" restored as "${r.renamed_to}" — another campaign has that name now.`
      : `"${name}" restored.`);
  }, [reloadCampaigns, reloadTrash, toast]);

  // The irreversible one. Only the trash list needs reloading — a purged
  // campaign was never in the live list to begin with.
  const purgeCampaign = useCallback(async (id, name) => {
    await campaignsApi.purge(id);
    await reloadTrash();
    toast(`"${name}" permanently deleted.`);
  }, [reloadTrash, toast]);

  /*
   * Said at EXPORT time, not at restore.
   *
   * Exports are unbounded and imports are capped, so a big enough campaign
   * produces a backup it will refuse to take back — and the only moment
   * that used to become apparent was the one where you needed it. The file
   * is still saved: a backup you cannot restore through the UI beats no
   * backup, and raising BODY_LIMIT_MB restores it.
   */
  const warnIfOversize = useCallback((r) => {
    if (!r?.oversize) return;
    toast(`Saved ${r.name} — but at ${(r.bytes / 1024 / 1024).toFixed(0)} MB it is over the `
      + `${IMPORT_LIMIT_MB} MB import limit, so it cannot be restored here without raising `
      + 'BODY_LIMIT_MB on the server. The bulk is map and portrait images.');
  }, [toast]);

  /*
   * With no `parts`, the whole campaign — the backup, unchanged. With them,
   * part of it, saved under its own filename prefix so a folder of exports
   * says which files are whole: `campaign-…` versus `campaign-part-…`.
   */
  const exportCampaign = useCallback(async (parts) => {
    if (!currentId) return null;
    const data = await campaignsApi.exportCampaign(currentId, parts);
    warnIfOversize(downloadBundle(data, {
      module: parts?.length ? 'campaign-part' : 'campaign', name: currentCampaign?.name,
    }));
    return data;
  }, [currentId, currentCampaign, warnIfOversize]);

  // Same export, by explicit id, for a campaign in the trash. `exportCampaign`
  // above can only ever reach `currentId`, which comes from the live list — so
  // without this there was no way to take a copy before purging, even though
  // the server deliberately keeps the export route open on trashed campaigns.
  const exportTrashed = useCallback(async (id, name) => {
    const data = await campaignsApi.exportCampaign(id);
    warnIfOversize(downloadBundle(data, { module: 'campaign', name }));
  }, [warnIfOversize]);

  // Central importer: sniff `bundle.type` and route. `campaign` restores a NEW
  // campaign (unchanged path); the others merge into the SELECTED campaign — and
  // pc-sheet/timeline need a target player, so they return a `need` for the page to
  // resolve with a modal, then call importPcSheetInto / importTimelineInto.
  /*
   * The import dialog, as a promise. `importFile` awaits an answer the way
   * it used to await `confirm()`; the page renders ImportChoiceDialog from
   * `importAsk` and calls `answerImport` with the choice, or null to cancel.
   */
  const [importAsk, setImportAsk] = useState(null);
  const importResolve = useRef(null);
  const askImport = useCallback((question) => new Promise((resolve) => {
    importResolve.current = resolve;
    setImportAsk(question);
  }), []);
  const answerImport = useCallback((choice) => {
    setImportAsk(null);
    const resolve = importResolve.current;
    importResolve.current = null;
    resolve?.(choice);
  }, []);

  const importFile = useCallback(async (file) => {
    let data;
    try { data = JSON.parse(await file.text()); }
    catch { toast('That file is not valid JSON.', 'error'); return { done: true }; }
    const type = data?.type;

    if (type === 'campaign') {
      /*
       * What to do with it is asked in ImportChoiceDialog, because there are
       * up to three answers and one needs a name: replace the campaign this
       * file has the name of, merge it into the one on screen, or make a new
       * one — under a name that is not already taken.
       *
       * Nothing to ask when nothing clashes and no campaign is open: that is
       * a plain import, as it always was.
       */
      const fileName = String(data.campaign?.name ?? '').trim() || 'Imported campaign';
      const isPartial = data.partial === true;
      const summary = mergeSummary(data);
      let suggestion = null;
      for (;;) {
        const sameName = campaigns.find((c) => sameCampaignName(c.name, fileName)) ?? null;
        const selected = currentId ? campaigns.find((c) => String(c.id) === String(currentId)) : null;
        const choice = (!sameName && !selected)
          ? { action: 'new', name: fileName }
          : await askImport({
            fileName, sameName, selected, isPartial,
            partsCount: Array.isArray(data.parts) ? data.parts.length : 0,
            summary,
            suggestion: suggestion ?? (sameName ? freeName(campaigns, fileName) : null),
          });
        if (!choice) return { done: true };

        try {
          if (choice.action === 'merge') {
            const into = campaigns.find((c) => String(c.id) === String(choice.id));
            const r = await campaignsApi.importIntoCampaign(choice.id, data);
            await reload();
            await reloadCampaigns();
            const bits = [
              r.npcs && `NPCs: ${r.npcs.added} added, ${r.npcs.updated} updated${r.npcs.removed ? `, ${r.npcs.removed} removed` : ''}`,
              r.locations && `locations: ${r.locations.added} added, ${r.locations.updated} updated`,
              r.journal && `journal: ${r.journal.added}`,
              r.diary && `diary: ${r.diary.added}`,
              r.sessions && `sessions: ${r.sessions.added} added, ${r.sessions.replaced} replaced`,
              r.surveys && `surveys: ${r.surveys.added} added`,
            ].filter(Boolean).join(' · ');
            toast(`Imported into ${into?.name ?? 'the campaign'} — ${bits || 'nothing to do'}.`);
            if (r.surveys?.skipped_existing?.length) {
              toast(`Skipped ${r.surveys.skipped_existing.length} survey(s) already here: ${r.surveys.skipped_existing.slice(0, 5).join(', ')}.`);
            }
            // The server's own list of what it would not merge.
            if (r.skipped?.length) {
              toast(`Not merged: ${r.skipped.join(', ')}. Import as a new campaign to keep them.`);
            }
            // Said plainly rather than buried: an NPC something still points
            // at is kept on purpose, and the DM has to decide about it.
            if (r.npcs?.kept?.length) {
              toast(`Kept ${r.npcs.kept.length} NPC(s) the file omits — still used by a timeline or the char tree: ${r.npcs.kept.slice(0, 5).join(', ')}.`);
            }
          } else if (choice.action === 'replace') {
            const old = campaigns.find((c) => String(c.id) === String(choice.id));
            await campaignsApi.importCampaign(
              { ...data, campaign: { ...data.campaign, name: fileName } }, { replace: choice.id });
            await Promise.all([reloadCampaigns(), reloadTrash()]);
            toast(`Replaced "${old?.name ?? fileName}". The previous one is in the Trash if you need it back.`);
          } else {
            await campaignsApi.importCampaign({ ...data, campaign: { ...data.campaign, name: choice.name } });
            await reloadCampaigns();
            toast(`Imported as a new campaign, "${choice.name}".`);
          }
          return { done: true };
        } catch (e) {
          /*
           * The server has the last word on names — the list here can be
           * stale, and another tab may have just made one. When it refuses,
           * it sends a free name back, and the question is asked again with
           * that name filled in rather than ending in an error.
           */
          if (e.code === 'NAME_TAKEN') {
            suggestion = e.body?.suggestion ?? null;
            await reloadCampaigns();
            toast(e.message, 'error');
            continue;
          }
          toast(e.message, 'error');
          return { done: true };
        }
      }
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
    /*
     * Session prep. Merges by session number rather than replacing the lot —
     * a DM importing session 25 should not lose the twenty-four they have —
     * so the question is about what will be OVERWRITTEN, and names which.
     */
    if (type === 'campaign-sessions') {
      try {
        const incoming = (data.sessions || []).length;
        const existing = (await sessionsApi.list(currentId).catch(() => [])) || [];
        const nums = new Set(existing.map((e) => e.session_no).filter((n) => n != null));
        const clashes = (data.sessions || [])
          .map((x) => x?.session_no).filter((n) => n != null && nums.has(n));
        const ok = await confirm(
          [
            `Import ${incoming} session${incoming === 1 ? '' : 's'} into this campaign?`,
            clashes.length
              ? `Session${clashes.length === 1 ? '' : 's'} ${clashes.join(', ')} already exist and will be REPLACED — their cards are deleted and rebuilt from the file.`
              : 'None of them clash with what is already there.',
          ].join('\n\n'),
          { title: 'Import session prep', confirmLabel: clashes.length ? 'Replace' : 'Import' },
        );
        if (!ok) return { done: true };
        const r = await sessionsApi.importAll(currentId, data);
        toast(`Sessions imported — ${r.added} added, ${r.replaced} replaced, ${r.cards} cards.`);
      } catch (e) { toast(e.message, 'error'); }
      return { done: true };
    }
    if (type === 'pc-sheet') return { need: 'pc-sheet', bundle: data };
    if (type === 'timeline') return { need: 'timeline', bundle: data };
    toast('Unrecognized file — expected a campaign, journey-map, pc-sheet, timeline, campaign-diary or campaign-sessions export.', 'error');
    return { done: true };
  }, [currentId, campaigns, reloadCampaigns, reloadTrash, reload, toast, confirm, askImport]);

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

  /*
   * Patch one NPC in place. Used when something OTHER than the NPC row
   * changed what the list shows — creating or deleting its stat block
   * flips `has_sheet`, which is derived server-side. A refetch would
   * remount the table under an open modal and lose the scroll position.
   */
  const patchNpc = useCallback((nid, patch) => {
    setNpcs(prev => prev.map(n => (n.id === nid ? { ...n, ...patch } : n)));
  }, []);

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

  /*
   * Re-read the campaign's clock.
   *
   * Marking a session played advances `today_marker` on the SERVER, inside
   * the same transaction as the status change — so the page has to ask for
   * it back rather than being told. Separate from `saveTodayMarker`, which
   * is the DM setting it by hand.
   */
  const refreshMeta = useCallback(async () => {
    if (!currentId) return;
    setMeta((await campaignsApi.getMeta(currentId)) ?? {});
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
    importAsk, answerImport,
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
    addNpcs, editNpc, toggleNpcVisibility, deleteNpc, patchNpc,

    // Settings
    saveTodayMarker, refreshMeta,

    // Char-tree
    addConnection, editConnection, deleteConnection, toggleConnVisibility,
  };
}
