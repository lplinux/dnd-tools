/** api/pc.js — PC character sheet, relationships, stats, DM notes */

import { client } from './client';

export const pcApi = {
  get:            (pid)        => client.get(`/pc/${pid}`),
  save:           (pid, d)     => client.put(`/pc/${pid}`, d),
  uploadPortrait: (pid, d)     => client.post(`/pc/${pid}/portrait`, d),
  exportSheet:    (pid)        => client.get(`/pc/${pid}/export`),
  importSheet:    (pid, d)     => client.post(`/pc/${pid}/import`, d),
  getPublicToken: (pid)        => client.get(`/pc/${pid}/public-token`),

  // Stats
  getStats:  (pid)   => client.get(`/pc/${pid}/stats`),
  saveStats: (pid, d)=> client.put(`/pc/${pid}/stats`, d),

  // Relationships
  listRelationships: (pid)        => client.get(`/pc/${pid}/relationships`),
  addRelationship:   (pid, d)     => client.post(`/pc/${pid}/relationships`, d),
  editRelationship:  (pid, rid, d)=> client.patch(`/pc/${pid}/relationships/${rid}`, d),
  removeRelationship:(pid, rid)   => client.del(`/pc/${pid}/relationships/${rid}`),
  toggleRelVis:      (pid, rid)   => client.patch(`/pc/${pid}/relationships/${rid}/visibility`),

  // DM Notes
  listNotes:  (pid)        => client.get(`/pc/${pid}/dm-notes`),
  addNote:    (pid, d)     => client.post(`/pc/${pid}/dm-notes`, d),
  updateNote: (pid, nid, d)=> client.put(`/pc/${pid}/dm-notes/${nid}`, d),
  removeNote: (pid, nid)   => client.del(`/pc/${pid}/dm-notes/${nid}`),

  // Public
  publicData: (token) => client.get(`/pc-public/${token}`),
};
