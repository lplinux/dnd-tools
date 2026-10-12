/**
 * ThemeContext
 *
 * Provides the active theme name and a setter to all child components.
 * Theme is persisted in localStorage under the key `hc-theme`.
 * On change, `data-theme` is applied to `document.documentElement` so all
 * CSS variable tokens update instantly.
 *
 * Usage:
 *   const { theme, setTheme } = useTheme();
 *   setTheme('slate');
 */

import { createContext, useContext, useEffect, useState } from 'react';

/** Available themes. Keys must match the `[data-theme]` blocks in styles/globals.css. */
export const THEMES = [
  { id: 'dark',  label: 'Dark',  swatch: '#272015' },
  { id: 'light', label: 'Light', swatch: '#f0ece0' },
  { id: 'slate', label: 'Slate', swatch: '#1c2128' },
];

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(
    () => localStorage.getItem('hc-theme') || 'dark',
  );

  // Apply theme attribute to <html> whenever it changes
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('hc-theme', theme);
  }, [theme]);

  function setTheme(t) {
    if (THEMES.find((x) => x.id === t)) setThemeState(t);
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, themes: THEMES }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
