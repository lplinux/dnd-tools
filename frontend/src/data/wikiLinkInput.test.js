/**
 * data/wikiLinkInput.test.js
 *
 * The caret cases. Every one of these is a place the dropdown should or
 * should not appear, and getting it wrong means a popup over someone's prose.
 */
import { describe, it, expect } from 'vitest';
import { activeToken, insertLink, suggest } from './wikiLinkInput';

/** `|` marks the caret, so these read like what you would actually type. */
const at = (s) => [s.replace('|', ''), s.indexOf('|')];
const tok = (s) => activeToken(...at(s));

describe('when the dropdown should open', () => {
  it('right after typing [[', () => {
    expect(tok('We reached [[|')).toEqual({ start: 11, end: 13, query: '' });
  });

  it('part way through a name', () => {
    expect(tok('We reached [[Water|')).toMatchObject({ query: 'Water' });
  });

  it('with a space in the name', () => {
    expect(tok('[[Butterfly Cha|')).toMatchObject({ query: 'Butterfly Cha' });
  });

  it('on the second link of a line, not the first', () => {
    const t = tok('[[Waterdeep]] then [[Buld|');
    expect(t).toMatchObject({ query: 'Buld' });
    expect(t.start).toBe(19);
  });

  it('when the author already typed the closing brackets', () => {
    // Caret is inside; the `]]` sits after it.
    expect(tok('[[Water|]]')).toMatchObject({ query: 'Water' });
  });
});

describe('when it should stay shut', () => {
  it('with no [[ at all', () => {
    expect(tok('We reached Waterdeep|')).toBeNull();
  });

  it('after the token is closed', () => {
    expect(tok('[[Waterdeep]] and then|')).toBeNull();
  });

  it('when the caret is before the [[', () => {
    expect(tok('We |reached [[Waterdeep')).toBeNull();
  });

  it('across a newline', () => {
    expect(tok('[[Water\ndeep|')).toBeNull();
  });

  it('on a single bracket', () => {
    expect(tok('[Water|')).toBeNull();
  });

  it('once the query is longer than any name', () => {
    expect(activeToken(`[[${'x'.repeat(61)}`, 63)).toBeNull();
  });

  it('on an empty field', () => {
    expect(activeToken('', 0)).toBeNull();
    expect(activeToken(null, 0)).toBeNull();
  });
});

describe('a caret out of bounds', () => {
  it('is clamped rather than throwing', () => {
    expect(activeToken('[[Wat', 999)).toMatchObject({ query: 'Wat' });
    expect(activeToken('[[Wat', -5)).toBeNull();
    expect(activeToken('[[Wat', undefined)).toBeNull();
  });
});

describe('insertLink', () => {
  const ins = (s, name) => insertLink(...at(s), name);

  it('completes a part-typed name', () => {
    expect(ins('We reached [[Water|', 'Waterdeep'))
      .toEqual({ value: 'We reached [[Waterdeep]]', caret: 24 });
  });

  it('puts the caret after the closing brackets, not inside', () => {
    const { value, caret } = ins('[[Wat|', 'Waterdeep');
    expect(value.slice(caret)).toBe('');
    expect(value.slice(0, caret)).toBe('[[Waterdeep]]');
  });

  it('keeps the text after the caret', () => {
    expect(ins('We reached [[Water| at dawn.', 'Waterdeep').value)
      .toBe('We reached [[Waterdeep]] at dawn.');
  });

  it('consumes a ]] the author already typed rather than doubling it', () => {
    expect(ins('[[Water|]] at dawn.', 'Waterdeep').value)
      .toBe('[[Waterdeep]] at dawn.');
  });

  it('completes an empty token', () => {
    expect(ins('[[|', 'Waterdeep').value).toBe('[[Waterdeep]]');
  });

  it('trims the picked name', () => {
    expect(ins('[[W|', '  Waterdeep  ').value).toBe('[[Waterdeep]]');
  });

  it('changes nothing when there is no token', () => {
    expect(insertLink('plain text', 5, 'Waterdeep'))
      .toEqual({ value: 'plain text', caret: 5 });
  });

  it('changes nothing when the name is empty', () => {
    expect(ins('[[Wat|', '   ')).toEqual({ value: '[[Wat', caret: 5 });
  });

  it('replaces only the active token, leaving an earlier one alone', () => {
    expect(ins('[[Waterdeep]] then [[Buld|', 'Buldamar').value)
      .toBe('[[Waterdeep]] then [[Buldamar]]');
  });
});

describe('suggest', () => {
  const DATA = {
    locations: [
      { id: 1, name: 'Waterdeep' }, { id: 2, name: 'Buldamar' },
      { id: 3, name: 'Théa' }, { id: 4, name: 'Deepwater Cove' },
    ],
    npcs: [{ id: 10, name: 'Grathul' }, { id: 11, name: 'Water Baron' }],
  };
  const names = (q, n) => suggest(q, DATA, n).map((r) => r.name);

  it('offers everything for an empty query', () => {
    expect(names('').length).toBe(6);
  });

  it('ranks a prefix match above a substring one', () => {
    // "Waterdeep" and "Water Baron" both START with it and therefore tie;
    // "Deepwater Cove" only contains it and must come last. Ties fall to
    // alphabetical, which is why "Water Baron" leads — a space sorts before a
    // letter. The rule is what is asserted here, not a memorised order.
    const got = names('water');
    expect(got).toHaveLength(3);
    expect(got.slice(0, 2).sort()).toEqual(['Water Baron', 'Waterdeep']);
    expect(got[2]).toBe('Deepwater Cove');
  });

  it('breaks a tie alphabetically, so the list does not shuffle', () => {
    expect(names('water').slice(0, 2)).toEqual(['Water Baron', 'Waterdeep']);
  });

  it('ignores case and accents', () => {
    expect(names('thea')).toEqual(['Théa']);
    expect(names('THÉA')).toEqual(['Théa']);
  });

  it('matches NPCs as well as locations', () => {
    expect(names('grath')).toEqual(['Grathul']);
  });

  it('says so when nothing matches', () => {
    expect(names('zzz')).toEqual([]);
  });

  it('caps the list', () => {
    expect(names('', 2).length).toBe(2);
  });

  it('carries the kind, so the row can say which it is', () => {
    expect(suggest('grath', DATA)[0]).toMatchObject({ kind: 'npc', id: 10 });
    expect(suggest('buld', DATA)[0]).toMatchObject({ kind: 'location', id: 2 });
  });

  it('gives a player no NPCs, because the server sent none', () => {
    expect(suggest('', { locations: DATA.locations, npcs: [] }).length).toBe(4);
  });

  it('offers the party too', () => {
    const withParty = { ...DATA, characters: [{ id: 99, name: 'Thalia' }] };
    expect(suggest('thal', withParty)).toEqual([{ kind: 'character', id: 99, name: 'Thalia' }]);
  });

  it('works without a characters list at all', () => {
    expect(suggest('water', { locations: DATA.locations }).length).toBeGreaterThan(0);
  });

  it('survives missing input', () => {
    expect(suggest('x')).toEqual([]);
    expect(suggest(null, DATA).length).toBe(6);
  });
});
