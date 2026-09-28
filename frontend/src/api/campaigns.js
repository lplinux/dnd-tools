/**
 * api/campaigns.js — Campaign, player, location, and meta API calls
 */

import { client } from './client';

export const campaignsApi = {
  // ── Campaigns ─────────────────────────────────────────
  list:   ()             => client.get('/campaigns'),
  create: (data)         => client.post('/campaigns', data),
  remove: (id)           => client.del(`/campaigns/${id}`),
  exportCampaign: (id)   => client.get(`/campaigns/${id}/export`),
  importCampaign: (data) => client.post('/campaigns/import', data),

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
  setLocationImage:   (cid, lid, image_data) => client.put(`/campaigns/${cid}/locations/${lid}/image`, { image_data }),

  // ── NPCs ──────────────────────────────────────────────
  listNpcs:   (cid)       => client.get(`/campaigns/${cid}/npcs`),
  addNpcs:    (cid, data) => client.post(`/campaigns/${cid}/npcs`, data),
  removeNpc:  (cid, nid)  => client.del(`/campaigns/${cid}/npcs/${nid}`),

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
