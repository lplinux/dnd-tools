/**
 * api/campaigns.js — Campaign, player, location, and meta API calls
 */

import { client } from './client';

export const campaignsApi = {
  // ── Campaigns ─────────────────────────────────────────
  list:   ()             => client.get('/campaigns'),
  create: (data)         => client.post('/campaigns', data),
  // `remove` is a soft delete — the campaign moves to the trash and can be
  // restored. `purge` is the irreversible one, and the server only accepts it
  // for a campaign already in the trash.
  remove: (id)           => client.del(`/campaigns/${id}`),
  listTrashed: ()        => client.get('/campaigns/trash'),
  restore: (id)          => client.post(`/campaigns/${id}/restore`),
  purge:   (id)          => client.del(`/campaigns/${id}/purge`),
  // `parts` omitted = the whole campaign, as every export always was.
  exportCampaign: (id, parts) => client.get(parts?.length
    ? `/campaigns/${id}/export?parts=${encodeURIComponent(parts.join(','))}`
    : `/campaigns/${id}/export`),
  // The list a campaign export can be cut into. Served, so there is one.
  exportParts:  ()      => client.get('/campaign-export-parts'),
  // `replace` puts this file IN PLACE of that campaign, which goes to the
  // Trash in the same transaction — so a failed import leaves it untouched.
  importCampaign: (data, { replace } = {}) => client.post(
    replace ? `/campaigns/import?replace=${encodeURIComponent(replace)}` : '/campaigns/import', data),
  /**
   * Import a bundle INTO an existing campaign, replacing only the sections
   * the file carries. The sibling of importCampaign, which always makes a
   * new one.
   */
  importIntoCampaign: (cid, data) => client.post(`/campaigns/${cid}/import-into`, data),

  // ── Players ───────────────────────────────────────────
  listPlayers:    (cid)          => client.get(`/campaigns/${cid}/players`),
  addPlayer:      (cid, data)    => client.post(`/campaigns/${cid}/players`, data),
  removePlayer:   (cid, pid)     => client.del(`/campaigns/${cid}/players/${pid}`),
  reassignPlayer: (cid, pid, d)  => client.put(`/campaigns/${cid}/players/${pid}/reassign`, d),

  // ── Locations ─────────────────────────────────────────
  listLocations:      (cid)          => client.get(`/campaigns/${cid}/locations`),
  addLocation:        (cid, data)    => client.post(`/campaigns/${cid}/locations`, data),
  updateLocation:     (cid, lid, d)  => client.put(`/campaigns/${cid}/locations/${lid}`, d),
  removeLocation:     (cid, lid)     => client.del(`/campaigns/${cid}/locations/${lid}`),
  toggleLocationVis:  (cid, lid)     => client.patch(`/campaigns/${cid}/locations/${lid}/visibility`),

  // Campaign Journal — shared notes. The server withholds dm_only entries from
  // players in SQL, so a player's list simply does not contain them.
  listJournal:   (cid)          => client.get(`/campaigns/${cid}/journal`),
  addJournal:    (cid, d)       => client.post(`/campaigns/${cid}/journal`, d),
  editJournal:   (cid, eid, d)  => client.put(`/campaigns/${cid}/journal/${eid}`, d),
  removeJournal: (cid, eid)     => client.del(`/campaigns/${cid}/journal/${eid}`),

  // Everything in the campaign that has been shared — maps, timelines, and
  // (prepared, still empty) NPCs. Only rows with a share token come back, so
  // this is safe to show a player.
  listLinks:     (cid)          => client.get(`/campaigns/${cid}/links`),

  // Locations and NPCs this viewer may resolve in a [[Name]] cross-link.
  // Role-filtered server-side: a player gets public locations and no NPCs.
  listLinkTargets: (cid)        => client.get(`/campaigns/${cid}/link-targets`),
  setLocationImage:   (cid, lid, image_data) => client.put(`/campaigns/${cid}/locations/${lid}/image`, { image_data }),

  // ── NPCs ──────────────────────────────────────────────
  // Role-filtered server-side: a player gets the revealed NPCs only, without
  // private_info and without a hidden current location.
  listNpcs:   (cid)        => client.get(`/campaigns/${cid}/npcs`),
  addNpcs:    (cid, data)  => client.post(`/campaigns/${cid}/npcs`, data),
  updateNpc:  (cid, nid, d) => client.put(`/campaigns/${cid}/npcs/${nid}`, d),
  toggleNpcVis: (cid, nid) => client.patch(`/campaigns/${cid}/npcs/${nid}/visibility`),
  removeNpc:  (cid, nid)   => client.del(`/campaigns/${cid}/npcs/${nid}`),
  // Edges to players and other NPCs. Its own request rather than a column
  // on the list: the list is one query over every NPC in the campaign, and
  // this is wanted for exactly the one whose card is open. A player gets
  // only the public edges, and none pointing at an NPC they have not met.
  npcRelationships: (cid, nid) => client.get(`/campaigns/${cid}/npcs/${nid}/relationships`),
  // The NPC's stat block. DM-only, all three — a player never asks for one.
  npcSheet:       (cid, nid)    => client.get(`/campaigns/${cid}/npcs/${nid}/sheet`),
  saveNpcSheet:   (cid, nid, d) => client.put(`/campaigns/${cid}/npcs/${nid}/sheet`, d),
  deleteNpcSheet: (cid, nid)    => client.del(`/campaigns/${cid}/npcs/${nid}/sheet`),

  /* Surveys — the DM's side. Asking one is opening a `run` of it. */
  listSurveys:  (cid)            => client.get(`/campaigns/${cid}/surveys`),
  getSurvey:    (cid, sid)       => client.get(`/campaigns/${cid}/surveys/${sid}`),
  addSurvey:    (cid, d)         => client.post(`/campaigns/${cid}/surveys`, d),
  saveSurvey:   (cid, sid, d)    => client.put(`/campaigns/${cid}/surveys/${sid}`, d),
  deleteSurvey: (cid, sid)       => client.del(`/campaigns/${cid}/surveys/${sid}`),
  surveyResults:(cid, sid)       => client.get(`/campaigns/${cid}/surveys/${sid}/results`),
  openRun:      (cid, sid, d)    => client.post(`/campaigns/${cid}/surveys/${sid}/runs`, d),
  setRun:       (cid, sid, r, d) => client.patch(`/campaigns/${cid}/surveys/${sid}/runs/${r}`, d),
  deleteRun:    (cid, sid, r)    => client.del(`/campaigns/${cid}/surveys/${sid}/runs/${r}`),
  // Every asking and answer gone, questions kept. Session-only: a token
  // cannot DELETE anything.
  resetSurvey:  (cid, sid)       => client.del(`/campaigns/${cid}/surveys/${sid}/runs`),

  // ── Meta ──────────────────────────────────────────────
  getMeta:    (cid)      => client.get(`/campaigns/${cid}/meta`),
  saveMeta:   (cid, d)   => client.put(`/campaigns/${cid}/meta`, d),

  // ── Timelines summary ─────────────────────────────────
  listTimelines: (cid) => client.get(`/campaigns/${cid}/timelines`),

  // ── Public token ──────────────────────────────────────
  getPublicToken: (cid) => client.get(`/campaigns/${cid}/public-token`),

  // ── Char tree ─────────────────────────────────────────
  getCharTree:         (cid)       => client.get(`/campaigns/${cid}/char-tree`),
  addCharConnection:   (cid, data) => client.post(`/campaigns/${cid}/char-tree/connections`, data),
  editCharConnection:  (cid, id, d)=> client.patch(`/campaigns/${cid}/char-tree/connections/${id}`, d),
  removeCharConnection:(cid, id)   => client.del(`/campaigns/${cid}/char-tree/connections/${id}`),
  toggleCharConnVis:   (cid, id)   => client.patch(`/campaigns/${cid}/char-tree/connections/${id}/visibility`),
};
