/**
 * api/search.js
 * Campaign-wide search. DM only — the route refuses a player outright, because
 * half of what it reads (DM-only journal entries, diary drafts, private_info,
 * hidden locations, every NPC) is theirs alone.
 */
import { client } from './client';

export const searchApi = {
  campaign: (cid, q) =>
    client.get(`/campaigns/${cid}/search?q=${encodeURIComponent(q)}`),

  // One result in full. The list carries only an excerpt, so reading a hit
  // costs one small request rather than the list costing the whole campaign.
  detail: (cid, kind, id) =>
    client.get(`/campaigns/${cid}/search/${kind}/${id}`),
};
