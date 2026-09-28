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
    if (!pid) return;
    await loadSheet(pid);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load full sheet ────────────────────────────────────────────────────────
  const loadSheet = useCallback(async (pid) => {
    const id = pid ?? currentPlayerId;
    if (!id) return;
    setSheetLoading(true);
    try {
      const [char, rels, notes, stats] = await Promise.all([
        pcApi.get(id),
        pcApi.listRelationships(id),
        isDM ? pcApi.listNotes(id) : Promise.resolve([]),
        pcApi.getStats(id),
      ]);
      // `stats` lives in pc_char_stats, not on the pc_characters row — merge it in
      // under the `stats` key the Stats tab reads and handleSaveStats writes.
      setCharData({ ...(char ?? {}), stats: stats ?? {} });
      const relsArr = Array.isArray(rels) ? rels : (rels?.relationships ?? []);
      setRelationships(relsArr);
      setCrossConnections(rels?.cross_connections ?? []);
      setDmNotes(Array.isArray(notes) ? notes : (notes?.notes ?? []));
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setSheetLoading(false);
    }
  }, [currentPlayerId, isDM, toast]);

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
    setDmNotes(prev => [...prev, note]);
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

  // ── Export ─────────────────────────────────────────────────────────────────
  const exportSheet = useCallback(async () => {
    if (!currentPlayerId) return;
    const data = await pcApi.exportSheet(currentPlayerId);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a    = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(charData?.name || 'character').replace(/\s+/g,'-').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [currentPlayerId, charData]);

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
    relationships, crossConnections, dmNotes,
    currentCampaign,
    sheetLoading, hasSheet,

    // Actions
    saveCharacter, uploadPortrait,
    addRelationship, editRelationship, deleteRelationship, toggleRelVisibility,
    addDmNote, toggleNoteVisibility, deleteDmNote,
    exportSheet, getPublicLink,
    loadSheet,
  };
}
