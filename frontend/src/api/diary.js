/** api/diary.js — Campaign diary (DM, shareable) + per-player private diaries */

import { client } from './client';

export const diaryApi = {
  // ── Campaign diary (DM only) ──────────────────────────
  campaignList:   (cid)        => client.get(`/campaign-diary/${cid}`),
  campaignCreate: (cid, d)     => client.post(`/campaign-diary/${cid}`, d),
  campaignUpdate: (cid, id, d) => client.put(`/campaign-diary/${cid}/entries/${id}`, d),
  campaignRemove: (cid, id)    => client.del(`/campaign-diary/${cid}/entries/${id}`),
  setStatus:      (cid, id, status) =>
    client.patch(`/campaign-diary/${cid}/entries/${id}/status`, { status }),

  // Stable token — re-requesting returns the same link. revokeShare is the only
  // thing that invalidates it.
  getShare:    (cid) => client.get(`/campaign-diary/${cid}/share`),
  revokeShare: (cid) => client.del(`/campaign-diary/${cid}/share`),

  // ── Standalone export / import ────────────────────────
  // A diary-only bundle. Import REPLACES the target campaign's diary — it is a
  // restore, not a merge.
  exportCampaignDiary: (cid)         => client.get(`/campaign-diary/${cid}/export`),
  importCampaignDiary: (cid, bundle) => client.post(`/campaign-diary/${cid}/import`, bundle),

  // ── Player diaries ────────────────────────────────────
  // playerAll is DM-only (every player's diary, read-only); playerList is one
  // player's, readable by them or their DM.
  playerAll:    (cid)             => client.get(`/player-diary/${cid}/all`),
  playerList:   (cid, pid)        => client.get(`/player-diary/${cid}/${pid}`),
  playerCreate: (cid, pid, d)     => client.post(`/player-diary/${cid}/${pid}`, d),
  playerUpdate: (cid, pid, id, d) => client.put(`/player-diary/${cid}/${pid}/entries/${id}`, d),
  playerRemove: (cid, pid, id)    => client.del(`/player-diary/${cid}/${pid}/entries/${id}`),

  // Title-page credits + the annex of character bios for the printed book.
  // Separate from the entries so portraits are only fetched when printing.
  roster:       (cid)   => client.get(`/campaign-diary/${cid}/roster`),
  publicRoster: (token) => client.get(`/diary-public/${token}/roster`),

  // ── Public share ──────────────────────────────────────
  publicData: (token) => client.get(`/diary-public/${token}`),
};
