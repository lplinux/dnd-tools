/**
 * api/tokens.js
 *
 * API tokens — a second credential for your account, for scripts and for an
 * assistant talking to a running instance.
 *
 * The raw token comes back from `create` and from nowhere else, ever: the
 * server stores only a sha256 of it. If it is not copied out of that one
 * response it cannot be recovered, only revoked and replaced.
 */
import { client } from './client';

export const tokensApi = {
  list:   ()     => client.get('/tokens'),
  create: (data) => client.post('/tokens', data),
  revoke: (id)   => client.del(`/tokens/${id}`),
};
