/**
 * api/sessions.js — Session prep.
 *
 * The DM's plan for one sitting. Every call here is DM-only server-side;
 * there is no player-facing counterpart, which is the point of the feature.
 */

import { client } from './client';

export const sessionsApi = {
  list:    (cid)            => client.get(`/campaigns/${cid}/sessions`),
  get:     (cid, sid)       => client.get(`/campaigns/${cid}/sessions/${sid}`),
  create:  (cid, data)      => client.post(`/campaigns/${cid}/sessions`, data),
  update:  (cid, sid, data) => client.put(`/campaigns/${cid}/sessions/${sid}`, data),
  remove:  (cid, sid)       => client.del(`/campaigns/${cid}/sessions/${sid}`),

  addItem:    (cid, sid, data)      => client.post(`/campaigns/${cid}/sessions/${sid}/items`, data),
  updateItem: (cid, sid, id, data)  => client.put(`/campaigns/${cid}/sessions/${sid}/items/${id}`, data),
  /** Just the state — the most frequent write this feature has. */
  setState:   (cid, sid, id, state) => client.patch(`/campaigns/${cid}/sessions/${sid}/items/${id}/state`, { state }),
  removeItem: (cid, sid, id)        => client.del(`/campaigns/${cid}/sessions/${sid}/items/${id}`),
  /** Reorder or re-parent, within the card's own section. */
  moveItem:   (cid, sid, id, to)    => client.patch(`/campaigns/${cid}/sessions/${sid}/items/${id}/move`, to),
  /** Build the next session's prep from this one's leftovers. */
  generateNext: (cid, sid)          => client.post(`/campaigns/${cid}/sessions/${sid}/generate-next`, {}),
  /** Copy "What happened" into the Campaign Journal. */
  toJournal:  (cid, sid, data)      => client.post(`/campaigns/${cid}/sessions/${sid}/to-journal`, data),

  /** The whole campaign's prep as a `campaign-sessions` file. */
  exportAll: (cid)        => client.get(`/campaigns/${cid}/sessions/export`),
  /** Merges by session number, falling back to title. See the route. */
  importAll: (cid, data)  => client.post(`/campaigns/${cid}/sessions/import`, data),
};
