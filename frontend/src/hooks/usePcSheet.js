/**
 * hooks/usePcSheet.js
 *
 * All state and actions for the PC Character Sheet page.
 *
 * Manages:
 *   - Campaign / player selectors
 *   - Character data (name, story, traits, flaws, goals, portrait, public/private info)
 *   - Relationships + cross-connections
 *   - DM notes
 *   - Stats sheet (iframe bridge to NpcSheet)
 *   - Export / Import
 *   - Print / PDF
 */

import { useCallback, useEffect, useState } from 'react';
import { useAsync }  from '@/hooks/useAsync';
import { useToast }  from '@/hooks/useToast';
import { useAuth }   from '@/hooks/useAuth';
import { campaignsApi } from '@/api/campaigns';
import { pcApi }        from '@/api/pc';
import { downloadBundle } from '@/api/downloadBundle';
import { itemCardsApi } from '@/api/itemCards';

export function usePcSheet() {
  const { user }  = useAuth();
  const { toast } = useToast();

  const isDM = user && (user.role === 'dm' || user.role === 'admin');

  // ── Selectors ─────────────────────────────────────────────────────────────
  const { data: campaigns = [] } = useAsync(campaignsApi.list, { autoRun: true, deps: [] });

  const [currentCampaignId, setCurrentCampaignId] = useState(null);
  const [currentPlayerId,   setCurrentPlayerId]   = useState(null);
  const [players,           setPlayers]           = useState([]);
  const [playersLoading,    setPlayersLoading]     = useState(false);

  // ── Character data ────────────────────────────────────────────────────────
  const [charData,      setCharData]      = useState(null);
  const [relationships, setRelationships] = useState([]);
  const [crossConnections, setCrossConnections] = useState([]);
  const [dmNotes,       setDmNotes]       = useState([]);
  const [inventory,     setInventory]     = useState([]);
  // The DM's own item-card library, for the "grant from library" picker. DM
  // only: a player has nothing to grant, and fetching it for them would just
  // return their own (probably empty) library to no purpose.
  const [myCards,       setMyCards]       = useState([]);
  const [sheetLoading,  setSheetLoading]  = useState(false);

  const currentPlayer   = players.find(p => Number(p.id) === Number(currentPlayerId)) ?? null;
  const currentCampaign = campaigns.find(c => c.id === currentCampaignId) ?? null;
  const hasSheet        = !!charData;

  // ── Campaign change ────────────────────────────────────────────────────────
  const onCampaignChange = useCallback(async (cid) => {
    setCurrentCampaignId(cid || null);
    setCurrentPlayerId(null);
    setCharData(null);
    setRelationships([]);
    setDmNotes([]);
    setInventory([]);
    setPlayers([]);
    if (!cid) return;
    setPlayersLoading(true);
    try {
      const list = await campaignsApi.listPlayers(cid);
      setPlayers(Array.isArray(list) ? list : []);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setPlayersLoading(false);
    }
  }, [toast]);

  // ── Player change ──────────────────────────────────────────────────────────
  const onPlayerChange = useCallback(async (pid) => {
    setCurrentPlayerId(pid || null);
    setCharData(null);
    setRelationships([]);
    setDmNotes([]);
    setInventory([]);
    if (!pid) return;
    await loadSheet(pid);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load full sheet ────────────────────────────────────────────────────────
  const loadSheet = useCallback(async (pid) => {
    const id = pid ?? currentPlayerId;
    if (!id) return;
    setSheetLoading(true);
    try {
      const [char, rels, notes, stats, inv] = await Promise.all([
        pcApi.get(id),
        pcApi.listRelationships(id),
        // Fetched for players too. The endpoint is requireAuth and already
        // filters to `dm_visible = true` for non-DMs, so a player sees exactly
        // the notes the DM chose to share — which is the point of that flag.
        // Skipping the call here meant the flag did nothing in the UI.
        pcApi.listNotes(id),
        pcApi.getStats(id),
        pcApi.listInventory(id),
      ]);
      // `stats` lives in pc_char_stats, not on the pc_characters row — merge it in
      // under the `stats` key the Stats tab reads and handleSaveStats writes.
      setCharData({ ...(char ?? {}), stats: stats ?? {} });
      const relsArr = Array.isArray(rels) ? rels : (rels?.relationships ?? []);
      setRelationships(relsArr);
      setCrossConnections(rels?.cross_connections ?? []);
      setDmNotes(Array.isArray(notes) ? notes : (notes?.notes ?? []));
      setInventory(Array.isArray(inv) ? inv : []);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setSheetLoading(false);
    }
  }, [currentPlayerId, toast]);

  useEffect(() => {
    if (!isDM) { setMyCards([]); return; }
    let alive = true;
    itemCardsApi.list()
      .then(rows => { if (alive) setMyCards(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (alive) setMyCards([]); });   // an empty picker, not a toast
    return () => { alive = false; };
  }, [isDM]);

  // Likewise for the campaign: the API only returns campaigns the player is in,
  // so a single one needs no choosing. This also has to happen because the
  // header HIDES a one-option selector — without it a player with exactly one
  // campaign would see an empty page and no control to fix it.
  useEffect(() => {
    if (!isDM && campaigns.length === 1 && currentCampaignId == null) {
      onCampaignChange(campaigns[0].id);
    }
  }, [isDM, campaigns, currentCampaignId, onCampaignChange]);

  // A player only gets their own character(s) from the API; if there's exactly
  // one, open it automatically so they don't have to pick from a 1-item list.
  useEffect(() => {
    if (!isDM && players.length === 1 && currentPlayerId == null) {
      onPlayerChange(players[0].id);
    }
  }, [isDM, players, currentPlayerId, onPlayerChange]);

  // ── Save character section ─────────────────────────────────────────────────
  const saveCharacter = useCallback(async (section = 'character', formData) => {
    if (!currentPlayerId) return;
    await pcApi.save(currentPlayerId, formData);
    setCharData(prev => ({ ...prev, ...formData }));
    toast('Saved!');
  }, [currentPlayerId, toast]);

  // ── Portrait upload ────────────────────────────────────────────────────────
  const uploadPortrait = useCallback(async (file) => {
    if (!currentPlayerId) throw new Error('No player selected');
    const dataUrl = await new Promise((res, rej) => {
      const reader = new FileReader();
      reader.onload = e => res(e.target.result);
      reader.onerror = rej;
      reader.readAsDataURL(file);
    });
    // Dimension check
    await new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => {
        if (img.width > 412 || img.height > 544)
          rej(new Error(`Image is ${img.width}×${img.height}px. Max is 412×544px`));
        else res();
      };
      img.onerror = rej;
      img.src = dataUrl;
    });
    const base64   = dataUrl.split(',')[1];
    const mimeType = file.type;
    const result   = await pcApi.uploadPortrait(currentPlayerId, { data: base64, mimeType });
    setCharData(prev => ({ ...prev, picture_data: result.picture_data, picture_url: null }));
    return result.picture_data;
  }, [currentPlayerId]);

  // ── Relationships ──────────────────────────────────────────────────────────
  const addRelationship = useCallback(async (data) => {
    await pcApi.addRelationship(currentPlayerId, data);
    const relsRaw = await pcApi.listRelationships(currentPlayerId);
    setRelationships(Array.isArray(relsRaw) ? relsRaw : (relsRaw?.relationships ?? []));
    setCrossConnections(relsRaw?.cross_connections ?? []);
    toast('Relation added.');
  }, [currentPlayerId, toast]);

  const editRelationship = useCallback(async (rid, data) => {
    await pcApi.editRelationship(currentPlayerId, rid, data);
    const relsRaw = await pcApi.listRelationships(currentPlayerId);
    setRelationships(Array.isArray(relsRaw) ? relsRaw : (relsRaw?.relationships ?? []));
    setCrossConnections(relsRaw?.cross_connections ?? []);
    toast('Relation updated.');
  }, [currentPlayerId, toast]);

  const deleteRelationship = useCallback(async (rid) => {
    await pcApi.removeRelationship(currentPlayerId, rid);
    setRelationships(prev => prev.filter(r => r.id !== rid));
    toast('Relation deleted.');
  }, [currentPlayerId, toast]);

  // Optimistic: flip the one boolean locally instead of re-listing everything.
  const toggleRelVisibility = useCallback(async (rid) => {
    const flip = () => setRelationships(prev =>
      prev.map(r => (r.id === rid ? { ...r, is_public: !r.is_public } : r)));
    flip();
    try {
      await pcApi.toggleRelVis(currentPlayerId, rid);
    } catch (e) {
      flip(); // revert
      toast(e.message, 'error');
    }
  }, [currentPlayerId, toast]);

  // ── DM Notes ───────────────────────────────────────────────────────────────
  const addDmNote = useCallback(async (content, dmVisible) => {
    const note = await pcApi.addNote(currentPlayerId, { content, dm_visible: dmVisible });
    // Prepend: the API returns notes newest-first (ORDER BY created_at DESC), so
    // appending put a new note at the bottom until the next load moved it to the
    // top — the list silently reordered itself behind the user's back.
    setDmNotes(prev => [note, ...prev]);
    toast('Note added.');
  }, [currentPlayerId, toast]);

  const toggleNoteVisibility = useCallback(async (nid, dmVisible) => {
    await pcApi.updateNote(currentPlayerId, nid, { dm_visible: dmVisible });
    setDmNotes(prev => prev.map(n => n.id === nid ? { ...n, dm_visible: dmVisible } : n));
  }, [currentPlayerId]);

  const deleteDmNote = useCallback(async (nid) => {
    await pcApi.removeNote(currentPlayerId, nid);
    setDmNotes(prev => prev.filter(n => n.id !== nid));
    toast('Note deleted.');
  }, [currentPlayerId, toast]);

  // ── Inventory ──────────────────────────────────────────────────────────────
  // Every mutation returns the changed row, but the list response carries the
  // joined card columns that a bare row does not — so anything touching a
  // card-linked item re-lists rather than patching locally, and only the
  // free-text paths update in place.
  const reloadInventory = useCallback(async (pid) => {
    const id = pid ?? currentPlayerId;
    if (!id) return;
    setInventory(await pcApi.listInventory(id));
  }, [currentPlayerId]);

  /**
   * These are called straight from onChange/onClick handlers that do not await
   * them, so a rejection had nowhere to go and surfaced as an unhandled promise
   * in the console — which is how the earlier `weight` type error reached the
   * user as "Uncaught (in promise)". The server now also refuses an equip that
   * would exceed the attunement limit, and that 409 is something the player
   * needs to SEE, not something to swallow.
   */
  const invFail = useCallback((e) => toast(e?.message || String(e), 'error'), [toast]);

  const addItem = useCallback(async (data) => {
    try {
      const row = await pcApi.addItem(currentPlayerId, data);
      setInventory(prev => [...prev, row]);
      toast('Item added.');
    } catch (e) { invFail(e); }
  }, [currentPlayerId, toast, invFail]);

  const editItem = useCallback(async (itemId, data) => {
    try {
      const row = await pcApi.editItem(currentPlayerId, itemId, data);
      setInventory(prev => prev.map(i => (i.id === itemId ? { ...i, ...row } : i)));
    } catch (e) { invFail(e); }
  }, [currentPlayerId, invFail]);

  const removeItem = useCallback(async (itemId) => {
    try {
      await pcApi.removeItem(currentPlayerId, itemId);
      setInventory(prev => prev.filter(i => i.id !== itemId));
      toast('Item removed.');
    } catch (e) { invFail(e); }
  }, [currentPlayerId, toast, invFail]);

  const assignCard = useCallback(async (cardId) => {
    try {
      await pcApi.assignCard(currentPlayerId, cardId);
      await reloadInventory();
      toast('Item granted.');
    } catch (e) { invFail(e); }
  }, [currentPlayerId, reloadInventory, toast, invFail]);


  /**
   * Move a granted item to another tier of its own chain.
   *
   * Reloads rather than splicing the response in: the row's `card_*` columns
   * all change at once, and a partial merge would leave the old name beside
   * the new damage until something else refreshed.
   */
  const setItemCard = useCallback(async (itemId, cardId, label) => {
    try {
      await pcApi.setItemCard(currentPlayerId, itemId, cardId);
      await reloadInventory();
      toast(label ? `Now ${label}.` : 'Item changed.');
    } catch (e) { invFail(e); }
  }, [currentPlayerId, reloadInventory, toast, invFail]);

  // The item leaves this character entirely, so it drops out of the list here.
  const giveItem = useCallback(async (itemId, toPlayerId, toName) => {
    try {
      await pcApi.giveItem(currentPlayerId, itemId, toPlayerId);
      setInventory(prev => prev.filter(i => i.id !== itemId));
      toast(`Given to ${toName}.`);
    } catch (e) { invFail(e); }
  }, [currentPlayerId, toast, invFail]);

  const setCoins = useCallback(async (coins) => {
    try {
      const r = await pcApi.setCoins(currentPlayerId, coins);
      setCharData(prev => ({ ...prev, ...r }));
    } catch (e) { invFail(e); }
  }, [currentPlayerId, invFail]);

  // ── Export ─────────────────────────────────────────────────────────────────
  const exportSheet = useCallback(async () => {
    if (!currentPlayerId) return;
    const data = await pcApi.exportSheet(currentPlayerId);
    downloadBundle(data, {
      module: 'character',
      campaign: campaigns.find((c) => String(c.id) === String(currentCampaignId))?.name,
      name: charData?.name,
    });
  }, [currentPlayerId, charData, campaigns, currentCampaignId]);

  // No import here on purpose: importing a PC sheet is DM-only and goes through
  // the single hub in Manage Campaigns (useManageCampaigns → importPcSheetInto).

  // ── Public token ───────────────────────────────────────────────────────────
  const getPublicLink = useCallback(async () => {
    if (!currentPlayerId) return null;
    const r = await pcApi.getPublicToken(currentPlayerId);
    return `${window.location.origin}/pc-public/${r.token}`;
  }, [currentPlayerId]);

  return {
    // Auth
    user, isDM,

    // Selectors
    campaigns, currentCampaignId, onCampaignChange,
    players, playersLoading, currentPlayerId, currentPlayer, onPlayerChange,

    // Sheet data
    charData, setCharData,
    relationships, crossConnections, dmNotes, inventory, myCards,
    currentCampaign,
    sheetLoading, hasSheet,

    // Actions
    saveCharacter, uploadPortrait,
    addRelationship, editRelationship, deleteRelationship, toggleRelVisibility,
    addDmNote, toggleNoteVisibility, deleteDmNote,
    addItem, editItem, removeItem, assignCard, giveItem, setItemCard, reloadInventory, setCoins,
    exportSheet, getPublicLink,
    loadSheet,
  };
}
