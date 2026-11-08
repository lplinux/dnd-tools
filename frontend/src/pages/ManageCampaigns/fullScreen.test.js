/**
 * pages/ManageCampaigns/fullScreen.test.js
 *
 * Sessions and the Char Tree can take the whole window. What matters is that
 * going full screen does not remount the tab — a remount drops the session
 * on screen and every open card — and that dialogs still open on top.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

import { TABS } from './constants';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(path.resolve(here, p), 'utf8');
const PAGE = read('./index.jsx');
const TREE = read('./tabs/CharTreeTab.jsx');

describe('full screen', () => {
  it('is offered on Sessions and the Char Tree only', () => {
    expect(TABS.filter((t) => t.fullScreen).map((t) => t.id).sort()).toEqual(['chartree', 'sessions']);
  });

  it('changes the classes of the tab body, never which element it is', () => {
    expect(PAGE).toMatch(/<div className=\{isFull\n\s*\? 'fixed inset-0 z-40/);
    // One renderTab() call: a second one in a full-screen branch would remount.
    expect(PAGE.match(/(?<!function )renderTab\(\)/g)).toHaveLength(1);
  });

  it('sits under the dialogs, which open at z-50', () => {
    expect(PAGE).toMatch(/fixed inset-0 z-40/);
  });

  it('leaves Escape to an open dialog', () => {
    expect(PAGE).toMatch(/e\.key === 'Escape' && !document\.querySelector\('\[aria-modal="true"\]'\)/);
  });

  it('ends when the tab or the campaign changes', () => {
    expect(PAGE).toMatch(/useEffect\(\(\) => \{ setFull\(false\); \}, \[activeTab, currentId\]\)/);
  });

  it('lets the tree fill the window and follow its size', () => {
    expect(PAGE).toMatch(/<CharTreeTab campaignId=\{currentId\} fill=\{isFull\} \/>/);
    expect(TREE).toMatch(/new ResizeObserver/);
    expect(TREE).toMatch(/const W = w\.clientWidth, H = w\.clientHeight;/);
  });
});
