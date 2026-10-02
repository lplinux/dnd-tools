/**
 * api/auth.js — Authentication API calls
 */

import { client } from './client';

export const authApi = {
  /** Returns `{ user: { id, username, role } | null }` */
  getUser: () => client.get('/auth/user'),

  /** Returns `{ success: true, user: { id, username, role } }` or throws */
  login: (username, password, rememberMe = false) =>
    client.post('/auth/login', { username, password, rememberMe }),

  /** Destroys the session */
  logout: () => client.post('/auth/logout'),

  /** Changes the current user's password */
  changePassword: (password) => client.post('/auth/change-password', { password }),
};
