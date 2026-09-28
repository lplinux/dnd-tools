/**
 * hooks/useSplitViewProfiles.js
 *
 * Manages named profiles for the SplitView module.
 * Each profile stores a layout string and four URL strings.
 * State is persisted to localStorage under the key "splitview-profiles".
 *
 * Returned shape:
 *   profiles      { [name]: { layout, urls: [u1,u2,u3,u4] } }
 *   profileNames  string[]
 *   current       string  — active profile name
 *   layout        '4' | '3a' | '3b'
 *   urls          [u1, u2, u3, u4]
 *   frames        [u1, u2, u3, u4]  — committed iframe srcs (updated by loadUrl)
 *   setUrl        (index, value) => void   — update input field
 *   loadUrl       (index) => void          — commit url to iframe
 *   setLayout     (layout) => void
 *   selectProfile (name) => void
 *   newProfile    (name) => boolean        — false if name taken
 *   deleteProfile () => void
 */

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'splitview-profiles';

function defaultProfile() {
  return { layout: '4', urls: ['', '', '', ''] };
}

function loadStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (typeof p === 'object' && Object.keys(p).length) return p;
    }
  } catch { /* ignore */ }
  return { default: defaultProfile() };
}

function saveStorage(profiles) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles)); } catch { /* ignore */ }
}

// ─────────────────────────────────────────────────────────────────────────────

export function useSplitViewProfiles() {
  const [profiles, setProfilesState] = useState(loadStorage);
  const [current,  setCurrent]       = useState(() => Object.keys(loadStorage())[0] ?? 'default');

  // Derived: active profile data
  const activeProfile = profiles[current] ?? defaultProfile();
  const [urls,   setUrlsState]   = useState(activeProfile.urls);
  const [layout, setLayoutState] = useState(activeProfile.layout);
  // frames = the committed src values for the iframes (updated only when "Load" is clicked)
  const [frames, setFrames]      = useState(activeProfile.urls);

  // Persist on every change
  useEffect(() => { saveStorage(profiles); }, [profiles]);

  // ── Internal helpers ────────────────────────────────────────────────────

  function updateProfiles(updater) {
    setProfilesState(prev => { const next = updater({ ...prev }); saveStorage(next); return next; });
  }

  function saveCurrentProfile(newUrls, newLayout) {
    updateProfiles(p => ({
      ...p,
      [current]: { layout: newLayout ?? layout, urls: newUrls ?? urls },
    }));
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /** Update a URL input field (does not commit to iframe) */
  const setUrl = useCallback((index, value) => {
    setUrlsState(prev => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }, []);

  /** Commit a URL to the iframe and persist */
  const loadUrl = useCallback((index) => {
    setUrlsState(prev => {
      let url = prev[index].trim();
      if (url && !url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('/')) {
        url = 'https://' + url;
      }
      const next = [...prev];
      next[index] = url;
      setFrames(f => { const nf = [...f]; nf[index] = url; return nf; });
      saveCurrentProfile(next, layout);
      return next;
    });
  }, [layout]); // eslint-disable-line react-hooks/exhaustive-deps

  const setLayout = useCallback((l) => {
    setLayoutState(l);
    saveCurrentProfile(urls, l);
  }, [urls]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectProfile = useCallback((name) => {
    // Save current before switching
    saveCurrentProfile(urls, layout);
    const p = profiles[name] ?? defaultProfile();
    setCurrent(name);
    setUrlsState(p.urls);
    setLayoutState(p.layout);
    setFrames(p.urls);
  }, [profiles, urls, layout]); // eslint-disable-line react-hooks/exhaustive-deps

  const newProfile = useCallback((name) => {
    if (!name || profiles[name]) return false;
    updateProfiles(p => ({ ...p, [name]: defaultProfile() }));
    setCurrent(name);
    setUrlsState(['', '', '', '']);
    setLayoutState('4');
    setFrames(['', '', '', '']);
    return true;
  }, [profiles]);

  const deleteProfile = useCallback(() => {
    updateProfiles(p => {
      const next = { ...p };
      delete next[current];
      if (!Object.keys(next).length) next.default = defaultProfile();
      const first = Object.keys(next)[0];
      setCurrent(first);
      const pdata = next[first];
      setUrlsState(pdata.urls);
      setLayoutState(pdata.layout);
      setFrames(pdata.urls);
      return next;
    });
  }, [current]);

  return {
    profiles,
    profileNames: Object.keys(profiles),
    current,
    layout,
    urls,
    frames,
    setUrl,
    loadUrl,
    setLayout,
    selectProfile,
    newProfile,
    deleteProfile,
  };
}
