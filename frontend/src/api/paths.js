/**
 * api/paths.js
 *
 * Character evolution — the DM's notes on how each character can grow.
 * DM-only throughout; there is no player-facing counterpart to call.
 */
import { client } from './client';

export const pathsApi = {
  list:     (cid)            => client.get(`/campaigns/${cid}/paths`),
  add:      (cid, data)      => client.post(`/campaigns/${cid}/paths`, data),
  update:   (cid, id, data)  => client.put(`/campaigns/${cid}/paths/${id}`, data),
  setState: (cid, id, state) => client.patch(`/campaigns/${cid}/paths/${id}/state`, { state }),
  remove:   (cid, id)        => client.del(`/campaigns/${cid}/paths/${id}`),
};
