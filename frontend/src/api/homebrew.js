/**
 * api/homebrew.js — the DM's homebrew library, and which campaigns use it.
 */

import { client } from './client';

export const homebrewApi = {
  list:   (kind)     => client.get(`/homebrew${kind ? `?kind=${encodeURIComponent(kind)}` : ''}`),
  create: (data)     => client.post('/homebrew', data),
  update: (id, data) => client.put(`/homebrew/${id}`, data),
  remove: (id)       => client.del(`/homebrew/${id}`),

  /** The whole library as a file — no ids, no campaigns. */
  exportAll: ()       => client.get('/homebrew/export'),
  /** Adds new entries, skips names already in the library. */
  importAll: (bundle) => client.post('/homebrew/import', bundle),

  /** What a campaign uses — all of it for its DM, the revealed part for a player. */
  forCampaign: (cid)              => client.get(`/campaigns/${cid}/homebrew`),
  /** `{ used, is_public }` — use it in the campaign, reveal it, or stop using it. */
  setUse:      (cid, entryId, to) => client.put(`/campaigns/${cid}/homebrew/${entryId}`, to),
};
