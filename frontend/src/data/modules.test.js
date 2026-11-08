/**
 * data/modules.test.js
 *
 * The module list the home page and the header's Tools menu share: grouped
 * by who it is for, and never offering a tool the route would refuse.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

import { MODULES, GROUPS, canAccess, groupsFor } from './modules';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(path.resolve(here, p), 'utf8');
const APP = read('../App.jsx');
const HOME = read('../pages/Home.jsx');
const HEADER = read('../components/layout/AppHeader.jsx');

const ids = (user) => groupsFor(user).map((g) => g.id);

describe('the groups', () => {
  it('files every module under a group that exists', () => {
    const known = new Set(GROUPS.map((g) => g.id));
    for (const m of MODULES) expect(known.has(m.group), m.key).toBe(true);
  });

  it('puts a DM’s own tools first, then the players’, then the free ones', () => {
    expect(ids({ role: 'dm' })).toEqual(['dm', 'players', 'public']);
  });

  it('shows a player no DM group at all', () => {
    expect(ids({ role: 'player' })).toEqual(['players', 'public']);
  });

  it('shows a guest only the public tools', () => {
    expect(ids(null)).toEqual(['public']);
  });

  it('files DM Tips with the DM tools, for the DM only', () => {
    const tips = MODULES.find((m) => m.key === 'dmtips');
    expect(tips.group).toBe('dm');
    expect(canAccess(tips, { role: 'player' })).toBe(false);
    expect(canAccess(tips, { role: 'dm' })).toBe(true);
  });
});

describe('every module listed', () => {
  it('has a route, and the same roles on it', () => {
    for (const m of MODULES) {
      const p = m.url.slice(1);
      const at = APP.indexOf(`path="${p}"`);
      expect(at, `no route for ${m.url}`).toBeGreaterThan(-1);
      const route = APP.slice(at, APP.indexOf('/>', APP.indexOf('/>', at) + 1));
      if (m.access === 'public') {
        expect(route, m.key).not.toMatch(/ProtectedRoute/);
      } else {
        const roles = route.match(/roles=\{\[([^\]]*)\]\}/)?.[1] ?? '';
        expect(roles.replace(/['\s]/g, '').split(',').sort(), m.key).toEqual([...m.access].sort());
      }
    }
  });
});

describe('the pages that use it', () => {
  it('home groups the cards rather than listing them flat', () => {
    expect(HOME).toMatch(/import \{ groupsFor \} from '@\/data\/modules'/);
    expect(HOME).not.toMatch(/const MODULES = \[/);
  });

  it('home folds a group away only when there is more than one', () => {
    expect(HOME).toMatch(/const foldable = groups\.length > 1/);
  });

  it('remembers folded groups without depending on storage', () => {
    expect(HOME).toMatch(/try \{ localStorage\.setItem\(FOLDED_KEY/);
    expect(HOME).toMatch(/function readFolded\(\) \{\n {2}try \{/);
  });

  it('the header offers the same groups, except where Back is hidden', () => {
    expect(HEADER).toMatch(/groupsFor\(user\)\.map/);
    expect(HEADER).toMatch(/\{!hideBack && \(\n\s*<div className="relative">/);
  });
});
