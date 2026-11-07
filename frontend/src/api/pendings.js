/**
 * api/pendings.js — the campaign backlog.
 *
 * Session-prep cards that belong to no session yet. DM-only server-side,
 * like the sessions they move in and out of.
 */

import { client } from './client';

export const pendingsApi = {
  list:     (cid)            => client.get(`/campaigns/${cid}/pendings`),
  add:      (cid, data)      => client.post(`/campaigns/${cid}/pendings`, data),
  update:   (cid, id, data)  => client.put(`/campaigns/${cid}/pendings/${id}`, data),
  /** Cascades to the sub-cards, as session cards do. */
  setState: (cid, id, state) => client.patch(`/campaigns/${cid}/pendings/${id}/state`, { state }),
  move:     (cid, id, to)    => client.patch(`/campaigns/${cid}/pendings/${id}/move`, to),
  remove:   (cid, id)        => client.del(`/campaigns/${cid}/pendings/${id}`),
  /** Moves the card, sub-cards and all, into a session. */
  toSession: (cid, id, sessionId, section) =>
    client.post(`/campaigns/${cid}/pendings/${id}/to-session`, { session_id: sessionId, section }),
};
