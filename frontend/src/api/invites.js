/**
 * api/invites.js — Campaign invite links.
 *
 * Two audiences in one file: the DM minting and revoking links, and the
 * invitee redeeming one. The invitee's calls are the only writes in the app
 * made with no account at all — the token in the URL is the whole credential —
 * so they are grouped here rather than hidden among the campaign calls.
 */

import { client } from './client';

export const invitesApi = {
  // ── DM ──
  /**
   * Mint a link. `playerId` seats the invitee in a player slot that already
   * exists; omit it to create a new one from the name they type.
   *
   * The raw token comes back ONCE and is never stored — the server keeps only
   * its hash — so a DM who loses the link revokes it and mints another.
   */
  create: (campaignId, playerId = null) =>
    client.post(`/campaigns/${campaignId}/invites`, { playerId }),

  /** Outstanding invites: neither used nor expired. Never includes a token. */
  list: (campaignId) => client.get(`/campaigns/${campaignId}/invites`),

  revoke: (campaignId, id) => client.del(`/campaigns/${campaignId}/invites/${id}`),

  // ── Invitee ──
  /** `{ campaignName, playerName, expiresAt, loggedInAs }`, or throws 404. */
  preview: (token) => client.get(`/invites/${encodeURIComponent(token)}`),

  /** Create an account and join. Logs in on success. */
  accept: (token, { username, password, characterName }) =>
    client.post(`/invites/${encodeURIComponent(token)}/accept`, { username, password, characterName }),

  /**
   * Join with an account that already exists.
   *
   * Pass username/password to join as that account; pass neither to join as
   * whoever the browser is already logged in as. Explicit credentials win,
   * so "use a different account" works while logged in as someone else.
   */
  join: (token, { username, password, characterName } = {}) =>
    client.post(`/invites/${encodeURIComponent(token)}/join`, { username, password, characterName }),
};
