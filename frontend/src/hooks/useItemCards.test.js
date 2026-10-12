/**
 * rowToForm — a saved card row back into the editor's form.
 *
 * This function is where fields go to die. It maps named keys only, so a
 * column it does not list silently resets to its default every time a card is
 * opened and saved — which is how `evolves_from` would have quietly unlinked
 * every tier anyone edited.
 *
 * It is also the function that makes "copy the earlier tier" work, and the
 * composition there has one trap worth pinning: the row carries the PARENT's
 * own parent, so the new card's link has to be applied after the spread.
 */
import { describe, it, expect } from 'vitest';
import { rowToForm } from './useItemCards';
import { defaultForm } from '@/pages/ItemCards/constants';

/** A row as GET /api/item-cards returns it: snake_case, nulls for blanks. */
const ROW = {
  id: 7, user_id: 1,
  name: 'Tidecaller, Woken', type: 'Weapon', rarity: 'legendary',
  flavor: 'It remembers the tide.', abilities: '<p>Reach 10 ft.</p>',
  attunement: true, damage: '1d8+1', damage_type: 'Slashing',
  properties: 'Versatile', ac_bonus: null, armor_type: null,
  uses: null, weight: '3.00', evolves_from: 5,
  created_at: '2026-10-01', updated_at: '2026-10-02',
};

describe('rowToForm', () => {
  it('carries every field the editor can change', () => {
    const f = rowToForm(ROW);
    expect(f).toMatchObject({
      name: 'Tidecaller, Woken', type: 'Weapon', rarity: 'legendary',
      flavor: 'It remembers the tide.', abilities: '<p>Reach 10 ft.</p>',
      attunement: true, damage: '1d8+1', damageType: 'Slashing',
      properties: 'Versatile', weight: '3.00', evolvesFrom: 5,
    });
  });

  it('covers every key of defaultForm', () => {
    // The actual guarantee: a field in the form that this does not map is a
    // field that resets to blank on every edit round-trip.
    const f = rowToForm(ROW);
    for (const k of Object.keys(defaultForm())) {
      expect(f, `rowToForm drops ${k}`).toHaveProperty(k);
    }
  });

  it('turns nulls into empty strings, since the inputs are controlled', () => {
    const f = rowToForm(ROW);
    expect(f.acBonus).toBe('');
    expect(f.uses).toBe('');
  });

  it('keeps a null parent null rather than making it an empty string', () => {
    // '' would be sent back as a parent id and coerced to null anyway, but a
    // <select> compares against the value, so the distinction is real.
    expect(rowToForm({ ...ROW, evolves_from: null }).evolvesFrom).toBeNull();
  });

  it('returns a blank form for no row', () => {
    expect(rowToForm(null)).toEqual(defaultForm());
  });
});

describe('copying an earlier tier into a new card', () => {
  // What the Evolves-from picker does: start from the parent, then point at it.
  const copyOf = (parent) => ({ ...rowToForm(parent), evolvesFrom: parent.id });

  it('points the copy at the card it was copied from', () => {
    expect(copyOf(ROW).evolvesFrom).toBe(7);
  });

  it('does NOT inherit the parent’s own parent', () => {
    // The trap. ROW.evolves_from is 5; spreading in the other order would make
    // the new card a SIBLING of ROW rather than its successor, and the chain
    // would quietly branch instead of growing.
    expect(copyOf(ROW).evolvesFrom).not.toBe(ROW.evolves_from);
  });

  it('brings the content across, which is the point of copying', () => {
    const c = copyOf(ROW);
    expect(c.damage).toBe('1d8+1');
    expect(c.abilities).toBe('<p>Reach 10 ft.</p>');
    expect(c.rarity).toBe('legendary');
    expect(c.attunement).toBe(true);
  });

  it('brings the name across too, as a starting point to edit', () => {
    expect(copyOf(ROW).name).toBe('Tidecaller, Woken');
  });
});
