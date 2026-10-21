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

/**
 * Keys that belong to one sitting and must not outlive a sign-out.
 *
 * Cleared from BOTH stores: the print set used to live in localStorage and
 * a browser that has not been used since the move still has the old copy,
 * which the Item Cards page reads once and offers to rescue.
 */
const PER_SITTING_KEYS = ['ic-print-tray', 'ic-migrated'];

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
  /*
   * Signing out clears what this sitting left in the browser as well as the
   * server session.
   *
   * The print set is the one that matters: it lives in sessionStorage so it
   * survives a reload mid-batch, which also meant it survived a LOGOUT — on
   * a shared machine the next person to sign in on that tab inherited a
   * queue of someone else's cards, including ones their table has not been
   * shown.
   *
   * Listed explicitly rather than clearing the lot. `hc-theme` and the
   * SplitView and Timeline profiles are preferences belonging to the
   * browser, not to the account, and wiping them on sign-out would be a
   * small hostility. The SRD cache is public reference data.
   */
  async function logout() {
    await authApi.logout();
    for (const key of PER_SITTING_KEYS) {
      try { sessionStorage.removeItem(key); } catch { /* private mode */ }
      try { localStorage.removeItem(key); } catch { /* ditto */ }
    }
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
