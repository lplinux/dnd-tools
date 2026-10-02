/** api/users.js — User management (admin only) */

import { client } from './client';

export const usersApi = {
  list:           ()          => client.get('/users'),
  create:         (d)         => client.post('/users', d),
  updateRole:     (id, role)  => client.put(`/users/${id}/role`, { role }),
  updatePassword: (id, pw)    => client.put(`/users/${id}/password`, { password: pw }),
  remove:         (id)        => client.del(`/users/${id}`),
};
