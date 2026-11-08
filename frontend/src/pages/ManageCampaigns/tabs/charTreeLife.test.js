/**
 * Small fixes from one round of feedback: NPC life on the Char Tree, folded
 * DM notes, and the account menu's layer.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(path.resolve(here, p), 'utf8');
const TREE = read('./CharTreeTab.jsx');
const NOTES = read('../../PcSheet/tabs/index.jsx');
const HEADER = read('../../../components/layout/AppHeader.jsx');
const SESSIONS = read('../../Sessions/SessionsPanel.jsx');

describe('the Char Tree marks dead and unknown NPCs', () => {
  it('carries the life state onto the node, alive unmarked', () => {
    expect(TREE).toMatch(/life: n\.life_state === 'dead' \|\| n\.life_state === 'unknown' \? n\.life_state : null/);
  });
  it('draws a badge on the circle, and says it in the tooltip and legend', () => {
    expect(TREE).toMatch(/ctx\.fillText\(n\.life === 'dead' \? '☠' : '\?', bx, by/);
    expect(TREE).toMatch(/\\nDead/);
    expect(TREE).toMatch(/Dead NPC<\/span>/);
  });
});

describe('long DM notes fold', () => {
  it('measures the rendered note against the fold, and offers Read more only then', () => {
    expect(NOTES).toMatch(/el\.scrollHeight > NOTE_FOLD_PX/);
    expect(NOTES).toMatch(/\{long && \(/);
    expect(NOTES).toMatch(/\{open \? 'Show less' : 'Read more'\}/);
  });
});

describe('the account menu', () => {
  it('sits in a header above the page’s sticky bars', () => {
    const header = Number(HEADER.match(/shadow-header flex-wrap relative z-(\d+)/)[1]);
    const sticky = Number(SESSIONS.match(/sticky top-0 z-(\d+)/)[1]);
    expect(header).toBeGreaterThan(sticky);
    // …and under full screen (z-40) and dialogs (z-50).
    expect(header).toBeLessThan(40);
  });
});
