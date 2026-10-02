/**
 * AuthContext
 *
 * Fetches the current session user on mount and exposes it (with helpers)
 * to the entire component tree.
 *
 * Shape of `user`:
 *   { id: number, username: string, role: 'admin' | 'dm' | 'player' } | null
 *
 * Usage:
 *   const { user, login, logout, loading } = useAuth();
 */

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { authApi } from '@/api/auth';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true); // true while the initial session check runs

  /** Re-fetch session user from the server. */
  const refresh = useCallback(async () => {
    try {
      const data = await authApi.getUser();
      setUser(data.user ?? null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Check session on mount
  useEffect(() => { refresh(); }, [refresh]);

  /**
   * Attempt login. Throws on failure so the caller can show an error.
   * @param {string} username
   * @param {string} password
   * @param {boolean} [rememberMe] keep the session for 30 days instead of 24h
   */
  async function login(username, password, rememberMe = false) {
    const data = await authApi.login(username, password, rememberMe);
    setUser(data.user);
    return data.user;
  }

  /** Log out the current user. */
  async function logout() {
    await authApi.logout();
    setUser(null);
  }

  /**
   * Change the current user's password.
   * @param {string} password
   */
  async function changePassword(password) {
    return authApi.changePassword(password);
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, changePassword, loading, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
