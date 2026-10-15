/**
 * src/api/srdLevels.test.js
 *
 * `namesAtLevel` — narrowing an SRD index to one spell level.
 *
 * Pure, so no DOM and no network. The two cases worth guarding are both
 * off-by-nothing mistakes that would look fine in review: treating level 0 as
 * "no filter" (losing every cantrip), and failing CLOSED when there is no
 * level data (an empty dropdown on a field meant to help).
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { namesAtLevel } from './srd';

const here = path.dirname(fileURLToPath(import.meta.url));

/** A stand-in for what `loadEntries('spells')` builds. */
const spells = {
  slugs: new Set(['fire-bolt', 'fireball', 'fire-shield', 'mage-hand', 'wish']),
  names: ['Fire Bolt', 'Fire Shield', 'Fireball', 'Mage Hand', 'Wish'],
  levels: new Map([
    ['Fire Bolt', 0],
    ['Mage Hand', 0],
    ['Fireball', 3],
    ['Fire Shield', 4],
    ['Wish', 9],
  ]),
};

describe('namesAtLevel', () => {
  it('returns only that level', () => {
    expect(namesAtLevel(spells, 3)).toEqual(['Fireball']);
    expect(namesAtLevel(spells, 9)).toEqual(['Wish']);
  });

  it('treats level 0 as cantrips, not as "no filter"', () => {
    // The whole bug in one line: `if (!level)` would return all five.
    expect(namesAtLevel(spells, 0)).toEqual(['Fire Bolt', 'Mage Hand']);
  });

  it('returns everything when no level is asked for', () => {
    expect(namesAtLevel(spells, null)).toEqual(spells.names);
    expect(namesAtLevel(spells)).toEqual(spells.names);
  });

  it('is what makes a per-level picker useful', () => {
    // Typing "fire" at 3rd level should not offer the cantrip or the 4th.
    const at3 = namesAtLevel(spells, 3).filter((n) => n.toLowerCase().includes('fire'));
    expect(at3).toEqual(['Fireball']);
    const all = namesAtLevel(spells, null).filter((n) => n.toLowerCase().includes('fire'));
    expect(all).toHaveLength(3);
  });

  it('fails open when the resource carries no levels', () => {
    // weapon-properties, damage-types, conditions — every other caller.
    const flat = { names: ['Light', 'Finesse'], levels: null };
    expect(namesAtLevel(flat, 3)).toEqual(['Light', 'Finesse']);
  });

  it('fails open when a level matches nothing', () => {
    // Better the long list than a dead dropdown.
    expect(namesAtLevel(spells, 7)).toEqual(spells.names);
  });

  it('returns nothing when the index itself is unknown', () => {
    // Distinct from the above: null means the fetch failed, and there are no
    // names to offer at all.
    expect(namesAtLevel(null, 3)).toEqual([]);
    expect(namesAtLevel(undefined)).toEqual([]);
  });
});

describe('loadEntries keeps the level data', () => {
  const src = fs.readFileSync(path.join(here, 'srd.js'), 'utf8');

  it('reads level by type, not by truthiness', () => {
    // `r.level &&` here would silently drop the 27 cantrips at the source,
    // and namesAtLevel's own guard could not save it.
    expect(src).toMatch(/typeof r\.level === 'number'/);
  });

  it('stores null rather than an empty map', () => {
    // So `!entries.levels` distinguishes "not a levelled resource" from
    // "level 0", which is the distinction the whole filter rests on.
    expect(src).toMatch(/levels:\s*levels\.size \? levels : null/);
  });
});

describe('the spell rows ask per level', () => {
  const src = fs.readFileSync(
    path.resolve(here, '../pages/NpcSheet/SpellSection.jsx'), 'utf8',
  );

  it('passes the row level to useSrdNames', () => {
    expect(src).toMatch(/useSrdNames\('spells',\s*level\)/);
  });

  it('does so from a component, not from inside the row loop', () => {
    // A hook in `rows.map` is a runtime error, and the build would not catch
    // it — only mounting the sheet would.
    const hookLine = src.indexOf("useSrdNames('spells'");
    const loopLine = src.indexOf('rows.map(');
    expect(hookLine).toBeGreaterThan(-1);
    expect(loopLine).toBeGreaterThan(hookLine);
  });
});
