/**
 * api/itemCards.js — the signed-in user's saved item-card library.
 *
 * Note what is NOT here: the SRD lookup. That stays in api/srd.js and
 * api/open5e.js, talking directly to third-party hosts — storage persists the
 * *result* of a lookup, it does not change how lookups work.
 *
 * Every route is per-user and requires a session. The Item Cards page itself
 * is still public, so each of these may legitimately 401 for a guest; callers
 * are expected to only reach them when `useAuth()` has a user.
 */

import { client } from './client';

export const itemCardsApi = {
  list:   ()          => client.get('/item-cards'),
  create: (card)      => client.post('/item-cards', card),
  update: (id, card)  => client.put(`/item-cards/${id}`, card),
  // `force` also takes the card out of every inventory holding it. Without it
  // the server refuses with 409 + the holder names, which is what the
  // confirmation is built from.
  remove: (id, force) => client.del(`/item-cards/${id}${force ? '?force=true' : ''}`),
  clearAll: (force)   => client.del(`/item-cards${force ? '?force=true' : ''}`),

  exportAll: ()       => client.get('/item-cards/export'),
  // Adds to the library; never replaces it.
  importAll: (bundle) => client.post('/item-cards/import', bundle),
};
