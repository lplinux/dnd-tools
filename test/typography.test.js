/**
 * test/typography.test.js
 *
 * The type scale and the dialogs that read prose.
 *
 * Both are the kind of thing that drifts back: a `text-[0.6rem]` added by
 * copy-paste, or a reading dialog shipped at the default width because the
 * author did not know there was a convention. Neither shows up in a lint or
 * a build, and both are invisible until somebody squints at the screen.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(root, 'frontend/src');
const css = readFileSync(path.join(SRC, 'styles/globals.css'), 'utf8');

function sources(dir = SRC, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) { sources(full, out); continue; }
    if (/\.jsx$/.test(entry)) out.push(full);
  }
  return out;
}
const FILES = sources().map((f) => [path.relative(SRC, f), readFileSync(f, 'utf8')]);

describe('the type scale', () => {
  it('is rooted at the browser default', () => {
    /*
     * Every size in the app is rem-based, so this one pixel sets all of
     * them. 15px made `text-sm` 13.1px and the labels 9px, which is small
     * for a serif — and it also quietly overrode a reader who had chosen
     * their own default.
     */
    expect(css).toMatch(/font-size: 16px;/);
  });

  it('and print is pinned where it was', () => {
    // The PC and NPC sheet stylesheets mix rem with px/pt, so moving the
    // basis would nudge half of each printed page and leave the other.
    expect(css).toMatch(/@media print \{\s*html,\s*body \{\s*font-size: 15px;/);
  });

  it('has nothing below ~10px', () => {
    /*
     * A FLOOR, computed from what is actually used, rather than a list of
     * bad values — the list version passed a stray 0.62rem and a 0.58rem
     * that were simply not on it. 0.65rem is 10.4px at the new basis;
     * anything under that is uppercase micro-text nobody can read.
     */
    const offenders = [];
    for (const [name, src] of FILES) {
      for (const m of src.matchAll(/text-\[(0\.\d+)rem\]/g)) {
        if (Number(m[1]) < 0.65) offenders.push(`${name}: ${m[0]}`);
      }
    }
    expect(offenders, 'text smaller than 0.65rem / 10.4px').toEqual([]);
  });

  it('and item cards are unaffected, because they size in px', () => {
    // The print sheet and the PNG are tuned per card; a rem change must
    // never reach them.
    const print = readFileSync(path.join(SRC, 'pages/ItemCards/ItemCardPrint.jsx'), 'utf8');
    expect(print).toMatch(/fontSize: `\$\{cell\.fontPx/);
  });
});

describe('reading an entry', () => {
  const entryList = readFileSync(path.join(SRC, 'pages/Diary/EntryList.jsx'), 'utf8');

  it('opens full screen — and that is four surfaces at once', () => {
    // Campaign Diary, every player diary, the PC Sheet diary tab, Journal.
    expect(entryList).toMatch(/!max-w-\[95vw\] !w-\[95vw\] !max-h-\[92vh\]/);
    expect(entryList).not.toMatch(/className="max-w-2xl"/);
  });

  it('but the prose keeps a readable measure', () => {
    /*
     * The dialog is 95vw so a long entry has room; the text is not, because
     * a line set across 1800px cannot be tracked back to its start. Both
     * are needed — width for the dialog, measure for the words.
     */
    expect(css).toMatch(/\.diary-read\s+\{[^}]*max-width: 80ch/);
    expect(css).toMatch(/\.diary-read\s+\{[^}]*margin-inline: auto/);
  });

  it('and a sub-heading is not smaller than the text it introduces', () => {
    // It was .78rem against a 1.02rem body, so it read as a caption.
    const h3 = /\.diary-read h3\s+\{([^}]*)\}/.exec(css)[1];
    const size = Number(/font-size: ([\d.]+)rem/.exec(h3)[1]);
    const body = Number(/\.diary-read\s+\{[^}]*font-size: ([\d.]+)rem/.exec(css)[1]);
    expect(size).toBeGreaterThanOrEqual(body);
  });
});

describe('the dialogs that hold long text', () => {
  const FULL = /!max-w-\[95vw\] !w-\[95vw\] !max-h-\[92vh\]/;
  const read = (f) => readFileSync(path.join(SRC, f), 'utf8');

  it.each([
    ['pages/Diary/EntryModal.jsx', 'writing a diary entry'],
    ['pages/Journal/JournalPanel.jsx', 'writing a journal entry'],
    ['pages/Sessions/SessionsPanel.jsx', 'writing a session card'],
    ['pages/Timeline/Modals.jsx', 'reading and editing a timeline event'],
  ])('%s is full screen', (f) => {
    expect(read(f)).toMatch(FULL);
  });

  it('and their text boxes use the height they were given', () => {
    // A 92vh dialog holding a six-row box is a wide empty window.
    expect(read('pages/Sessions/SessionsPanel.jsx')).toMatch(/rows=\{16\}/);
    expect(read('pages/Journal/JournalPanel.jsx')).toMatch(/rows=\{18\}/);
    expect(read('pages/Diary/EntryModal.jsx')).toMatch(/rows=\{20\}/);
  });

  it('the timeline event form is two columns, not one of eleven fields', () => {
    expect(read('pages/Timeline/Modals.jsx')).toMatch(/grid-cols-1 lg:grid-cols-2 gap-x-6/);
  });

  it('and its year/day grid is reachable by a breakpoint now', () => {
    // It was an inline style, which no Tailwind prefix can touch — one of
    // the non-responsive grids already on the TODO.
    const m = read('pages/Timeline/Modals.jsx');
    expect(m).toMatch(/grid grid-cols-1 sm:grid-cols-2 gap-2/);
    expect(m).not.toMatch(/gridTemplateColumns: '1fr 1fr'/);
  });

  it('while the small dialogs stay small', () => {
    /*
     * Widening a confirm or a login spreads three inputs across a wall.
     * Named explicitly so "make the modals bigger" does not become all of
     * them next time.
     */
    for (const f of ['contexts/ConfirmContext.jsx', 'pages/NpcSheet/index.jsx']) {
      expect(read(f), `${f} should not be full screen`).not.toMatch(FULL);
    }
  });
});
