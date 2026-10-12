/**
 * hooks/useDiary.js
 *
 * Session summaries, in two halves with different privacy:
 *   - campaign diary: DM-authored, draft→published, shareable by public link.
 *     A player never sees it in the app, so this hook never REQUESTS it for
 *     one — gating only the tab render would still fire a 403 on page load.
 *   - player diaries: private to the owning player, readable by their DM.
 *
 * Returned shape:
 *   isDM, campaigns, campaignId, selectCampaign
 *   myPlayerId            — the caller's own player row in this campaign, or null
 *   campaignEntries       — [] for a player, always
 *   playerEntries         — own entries (player) or every player's (DM)
 *   loading, saving
 *   createCampaignEntry / updateCampaignEntry / deleteCampaignEntry / setEntryStatus
 *   createPlayerEntry / updatePlayerEntry / deletePlayerEntry
 *   shareUrl, loadShareUrl, revokeShare, exportDiary, importDiary
 */

import { useCallback, useEffect, useState } from 'react';
import { diaryApi } from '@/api/diary';
import { campaignsApi } from '@/api/campaigns';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/useToast';
import { downloadBundle } from '@/api/downloadBundle';

export function useDiary() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isDM = user?.role === 'dm' || user?.role === 'admin';

  const [campaigns, setCampaigns] = useState([]);
  const [campaignId, setCampaignId] = useState(null);
  const [myPlayerId, setMyPlayerId] = useState(null);
  const [campaignEntries, setCampaignEntries] = useState([]);
  const [playerEntries, setPlayerEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [shareUrl, setShareUrl] = useState(null);

  const fail = useCallback((e) => toast(e?.message || String(e), 'error'), [toast]);

  useEffect(() => {
    (async () => {
      try {
        const r = await campaignsApi.list();
        setCampaigns(r || []);
        if ((r || []).length === 1) selectCampaign(r[0].id);
      } catch (e) { fail(e); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectCampaign = useCallback(async (cid) => {
    setCampaignId(cid || null);
    setCampaignEntries([]);
    setPlayerEntries([]);
    setMyPlayerId(null);
    setShareUrl(null);
    if (!cid) return;
    setLoading(true);
    try {
      // /campaigns/:id/players already returns only the caller's own characters
      // to a player, so this doubles as "which player am I here".
      const players = (await campaignsApi.listPlayers(cid).catch(() => [])) || [];
      const mine = isDM ? null : players[0]?.id ?? null;
      setMyPlayerId(mine);

      const [camp, pdiary] = await Promise.all([
        // Never requested as a player: the endpoint is DM-only and would 403.
        isDM ? diaryApi.campaignList(cid) : Promise.resolve([]),
        isDM ? diaryApi.playerAll(cid) : (mine ? diaryApi.playerList(cid, mine) : Promise.resolve([])),
      ]);
      setCampaignEntries(camp || []);
      setPlayerEntries(pdiary || []);
    } catch (e) { fail(e); } finally { setLoading(false); }
  }, [isDM, fail]);

  // ── Campaign diary ──
  const reloadCampaign = useCallback(async (cid) => {
    setCampaignEntries((await diaryApi.campaignList(cid)) || []);
  }, []);

  const createCampaignEntry = useCallback(async (data) => {
    setSaving(true);
    try { await diaryApi.campaignCreate(campaignId, data); await reloadCampaign(campaignId); toast('Entry added.'); }
    catch (e) { fail(e); } finally { setSaving(false); }
  }, [campaignId, reloadCampaign, toast, fail]);

  const updateCampaignEntry = useCallback(async (id, data) => {
    setSaving(true);
    try { await diaryApi.campaignUpdate(campaignId, id, data); await reloadCampaign(campaignId); toast('Entry saved.'); }
    catch (e) { fail(e); } finally { setSaving(false); }
  }, [campaignId, reloadCampaign, toast, fail]);

  const deleteCampaignEntry = useCallback(async (id) => {
    try {
      await diaryApi.campaignRemove(campaignId, id);
      setCampaignEntries((prev) => prev.filter((e) => e.id !== id));
      toast('Entry deleted.');
    } catch (e) { fail(e); }
  }, [campaignId, toast, fail]);

  const setEntryStatus = useCallback(async (id, status) => {
    try {
      const r = await diaryApi.setStatus(campaignId, id, status);
      setCampaignEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...r } : e)));
      toast(status === 'published' ? 'Published — it is now on the share link.' : 'Back to draft — removed from the share link.');
    } catch (e) { fail(e); }
  }, [campaignId, toast, fail]);

  // ── Player diary (own entries only; the DM's view is read-only) ──
  const reloadPlayer = useCallback(async (cid, pid) => {
    setPlayerEntries((await diaryApi.playerList(cid, pid)) || []);
  }, []);

  const createPlayerEntry = useCallback(async (data) => {
    if (!myPlayerId) return;
    setSaving(true);
    try { await diaryApi.playerCreate(campaignId, myPlayerId, data); await reloadPlayer(campaignId, myPlayerId); toast('Entry added.'); }
    catch (e) { fail(e); } finally { setSaving(false); }
  }, [campaignId, myPlayerId, reloadPlayer, toast, fail]);

  const updatePlayerEntry = useCallback(async (id, data) => {
    if (!myPlayerId) return;
    setSaving(true);
    try { await diaryApi.playerUpdate(campaignId, myPlayerId, id, data); await reloadPlayer(campaignId, myPlayerId); toast('Entry saved.'); }
    catch (e) { fail(e); } finally { setSaving(false); }
  }, [campaignId, myPlayerId, reloadPlayer, toast, fail]);

  const deletePlayerEntry = useCallback(async (id) => {
    if (!myPlayerId) return;
    try {
      await diaryApi.playerRemove(campaignId, myPlayerId, id);
      setPlayerEntries((prev) => prev.filter((e) => e.id !== id));
      toast('Entry deleted.');
    } catch (e) { fail(e); }
  }, [campaignId, myPlayerId, toast, fail]);

  // ── Share link ──
  const loadShareUrl = useCallback(async () => {
    if (!campaignId) return null;
    try {
      const r = await diaryApi.getShare(campaignId);
      const url = r?.token ? `${window.location.origin}/diary-public/${r.token}` : null;
      setShareUrl(url);
      return url;
    } catch (e) { fail(e); return null; }
  }, [campaignId, fail]);

  // Download the diary as a portable `type:'campaign-diary'` file. Import it
  // from Manage Campaigns → Import, like every other module's export.
  const exportDiary = useCallback(async () => {
    if (!campaignId) return;
    try {
      const bundle = await diaryApi.exportCampaignDiary(campaignId);
      downloadBundle(bundle, { module: 'campaign-diary', campaign: bundle.campaign_name });
    } catch (e) { fail(e); }
  }, [campaignId, fail]);

  // Replaces this campaign's diary from a bundle. The caller confirms first —
  // this deletes what is already there.
  const importDiary = useCallback(async (bundle) => {
    if (!campaignId) return null;
    try {
      const r = await diaryApi.importCampaignDiary(campaignId, bundle);
      await reloadCampaign(campaignId);
      toast(`Diary imported — ${r.imported} ${r.imported === 1 ? 'entry' : 'entries'}${r.replaced ? `, replacing ${r.replaced}` : ''}.`);
      return r;
    } catch (e) { fail(e); return null; }
  }, [campaignId, reloadCampaign, toast, fail]);

  const revokeShare = useCallback(async () => {
    try { await diaryApi.revokeShare(campaignId); setShareUrl(null); toast('Link revoked — it no longer opens.'); }
    catch (e) { fail(e); }
  }, [campaignId, toast, fail]);

  return {
    isDM, campaigns, campaignId, selectCampaign, myPlayerId,
    campaignEntries, playerEntries, loading, saving,
    createCampaignEntry, updateCampaignEntry, deleteCampaignEntry, setEntryStatus,
    createPlayerEntry, updatePlayerEntry, deletePlayerEntry,
    shareUrl, loadShareUrl, revokeShare, exportDiary, importDiary,
  };
}
