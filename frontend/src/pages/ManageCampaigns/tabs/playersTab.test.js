/**
 * The Reassign column.
 *
 * Two bugs lived here, both invisible in review:
 *
 *   - The select's value was always `''`, which IS the "— None —" option. So
 *     picking "— None —" changed nothing, fired no change event, and left
 *     Save with nothing to send. A seat could be handed from one user to
 *     another but never freed.
 *   - The option list was `role !== 'admin'`, so every DM appeared in it.
 *
 * Tests run in a node environment with no DOM, so the select is checked by
 * reading the source. That is weak against a rewrite and strong against
 * exactly the regression that happened: someone "simplifying" the value back
 * to a constant.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(path.join(here, 'PlayersTab.jsx'), 'utf8');

describe('the reassign select', () => {
  /**
   * The Reassign cell's <select>, found by its aria-label rather than by the
   * value expression under test — anchoring on the thing being asserted made
   * a reverted fix throw during COLLECTION, which reports as "no tests" and
   * reads far too much like a pass.
   */
  const el = () => {
    const marker = SRC.indexOf('aria-label={`User assigned to');
    expect(marker, 'the reassign select is not recognisable any more').toBeGreaterThan(-1);
    const start = SRC.lastIndexOf('<select', marker);
    return SRC.slice(start, SRC.indexOf('</select>', start));
  };

  it('shows who currently holds the seat, not a blank', () => {
    // `value={''}` or `value={reassigns[p.id] ?? ''}` is the bug: the control
    // sits on "— None —" whatever is saved, so that option can never be
    // chosen and the seat can never be freed.
    expect(el()).toMatch(/value=\{chosen\(p\)\}/);
    expect(el()).not.toMatch(/value=\{reassigns\[p\.id\] \?\? ''\}/);
  });

  it('keeps "— None —" available as a real choice', () => {
    expect(el()).toMatch(/<option value="">— None —<\/option>/);
  });

  it('does not filter out the user who holds the seat', () => {
    // It did. A select cannot display a value that is not among its options,
    // so the row showed somebody else's name as though it were saved.
    expect(el()).not.toMatch(/filter\(u => u\.id !== p\.user_id\)/);
    expect(el()).toMatch(/optionsFor\(p\)/);
  });
});

describe('unassigning actually reaches the server', () => {
  const fn = SRC.slice(SRC.indexOf('async function handleReassign'), SRC.indexOf('function openImportFor'));

  it('sends null when "— None —" is chosen', () => {
    // '' || null === null, and the route reads null as "delete the assignment".
    expect(fn).toMatch(/actions\.reassignPlayer\(pid, next \|\| null\)/);
  });

  it('no longer bails out when the row was never touched', () => {
    // `if (newId === undefined) return` was the second half of the bug: with
    // the select resting on '', not touching it was indistinguishable from
    // choosing "— None —".
    expect(fn).not.toMatch(/=== undefined\) return/);
  });

  it('saves only a real change', () => {
    expect(fn).toMatch(/if \(next === currentUser\(p\)\) return/);
  });

  it('clears the local override afterwards', () => {
    // Or the row keeps showing the pending edit instead of what came back.
    expect(fn).toMatch(/delete copy\[pid\]/);
  });
});

describe('who may be assigned', () => {
  it('is players only', () => {
    expect(SRC).toMatch(/\.filter\(u => u\.role === 'player'\)/);
    expect(SRC).not.toMatch(/u\.role !== 'admin'/);
  });

  it('but a non-player already holding a seat is still shown', () => {
    // An assignment that predates this filter must stay visible, or Save
    // would quietly replace it with whoever the select fell back to.
    const fn = SRC.slice(SRC.indexOf('function optionsFor'), SRC.indexOf('async function handleAdd'));
    expect(fn).toMatch(/not a player/);
    expect(fn).toMatch(/!userOpts\.some\(u => String\(u\.id\) === held\)/);
  });
});

describe('the Save button', () => {
  it('is disabled until something changes', () => {
    expect(SRC).toMatch(/disabled=\{chosen\(p\) === currentUser\(p\)\}/);
  });
});
