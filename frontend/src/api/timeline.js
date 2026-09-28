/** api/timeline.js — Player timelines, party events, import/export */

import { client } from './client';

export const timelineApi = {
  // ── Named player timelines ────────────────────────────
  allForCampaign:  (cid)           => client.get(`/player-timelines/${cid}/all`),
  listForPlayer:   (cid, pid)      => client.get(`/player-timelines/${cid}/${pid}`),
  create:          (cid, pid, d)   => client.post(`/player-timelines/${cid}/${pid}`, d),
  remove:          (tlId)          => client.del(`/player-timelines/${tlId}`),
  exportTimeline:  (tlId)          => client.get(`/player-timelines/${tlId}/export`),
  importInto:      (cid, d)        => client.post(`/campaigns/${cid}/import/timeline`, d),

  // ── Entries ───────────────────────────────────────────
  listEntries:   (tlId)          => client.get(`/player-timelines/${tlId}/entries`),
  addEntry:      (tlId, d)       => client.post(`/player-timelines/${tlId}/entries`, d),
  updateEntry:   (tlId, eid, d)  => client.put(`/player-timelines/${tlId}/entries/${eid}`, d),
  removeEntry:   (tlId, eid)     => client.del(`/player-timelines/${tlId}/entries/${eid}`),

  // ── Private (DM/admin) ────────────────────────────────

  // ── Party events (campaign-wide; DM-authored, shared lane) ──
  partyList:   (cid)          => client.get(`/timeline-party/${cid}`),
  partyAdd:    (cid, d)       => client.post(`/timeline-party/${cid}`, d),
  partyUpdate: (cid, eid, d)  => client.put(`/timeline-party/${cid}/${eid}`, d),
  partyRemove: (cid, eid)     => client.del(`/timeline-party/${cid}/${eid}`),

  // ── Public share ──────────────────────────────────────
  publicData: (token) => client.get(`/timeline-public/${token}`),
};
