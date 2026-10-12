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

  // Inventory
  //
  // `assign` is DM-only and the only way a card-linked row is created — a
  // player can add free-text gear with `addItem` but cannot grant themselves a
  // magic item. The list response carries the linked card's fields inline
  // (card_name, card_rarity, …), so holding an item does not give a player any
  // route into the DM's card library.
  listInventory: (pid)          => client.get(`/pc/${pid}/inventory`),
  addItem:       (pid, d)       => client.post(`/pc/${pid}/inventory`, d),
  editItem:      (pid, iid, d)  => client.put(`/pc/${pid}/inventory/${iid}`, d),
  removeItem:    (pid, iid)     => client.del(`/pc/${pid}/inventory/${iid}`),
  assignCard:    (pid, cardId)  => client.post(`/pc/${pid}/inventory/assign`, { item_card_id: cardId }),
  giveItem:      (pid, iid, to) => client.post(`/pc/${pid}/inventory/${iid}/give`, { to_player_id: to }),
  // Move a granted item to another tier of its own chain. A move, not a step,
  // so advancing and reverting are the same call — see the route in app.js.
  setItemCard:   (pid, iid, cardId) => client.put(`/pc/${pid}/inventory/${iid}/card`, { item_card_id: cardId }),
  setCoins:      (pid, coins)   => client.put(`/pc/${pid}/coins`, coins),

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
