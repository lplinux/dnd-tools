/**
 * data/crossLinks.test.js
 *
 * Most of these are a way of writing a name that should NOT become something
 * other than that name.
 */
import { describe, it, expect } from 'vitest';
import { fold, parseToken, buildIndex, resolve } from './crossLinks';

const INDEX = buildIndex({
  locations: [
    { id: 1, name: 'Waterdeep' },
    { id: 2, name: 'Buldamar' },
    { id: 3, name: 'Théa' },
    { id: 4, name: 'Grathul' },          // a place that shares a name with an NPC
  ],
  npcs: [
    { id: 10, name: 'Grathul' },
    { id: 11, name: 'Seraphine Vale' },
  ],
});

describe('fold', () => {
  it('ignores case and accents in both directions', () => {
    expect(fold('Théa')).toBe(fold('thea'));
    expect(fold('BULDAMAR')).toBe('buldamar');
  });

  it('trims, so [[ Waterdeep ]] still resolves', () => {
    expect(fold('  Waterdeep  ')).toBe('waterdeep');
  });

  it('survives a non-string', () => {
    expect(fold(null)).toBe('');
    expect(fold(42)).toBe('42');
  });
});

describe('parseToken', () => {
  it('reads a bare name', () => {
    expect(parseToken('Waterdeep')).toEqual({ kind: null, name: 'Waterdeep', label: 'Waterdeep' });
  });

  it('reads a kind prefix, in each of its spellings', () => {
    for (const p of ['location', 'loc', 'place']) {
      expect(parseToken(`${p}:Waterdeep`).kind).toBe('location');
    }
    expect(parseToken('npc:Grathul').kind).toBe('npc');
    expect(parseToken('NPC:Grathul').kind).toBe('npc');
  });

  it('reads display text', () => {
    expect(parseToken('Waterdeep|the city'))
      .toEqual({ kind: null, name: 'Waterdeep', label: 'the city' });
  });

  it('reads a kind and display text together', () => {
    expect(parseToken('npc:Grathul|him'))
      .toEqual({ kind: 'npc', name: 'Grathul', label: 'him' });
  });

  it('treats an UNKNOWN prefix as part of the name', () => {
    // "Act II: The Road" is a plausible thing to link to; guessing that "Act
    // II" was a mistyped kind would make it unlinkable.
    expect(parseToken('Act II: The Road'))
      .toEqual({ kind: null, name: 'Act II: The Road', label: 'Act II: The Road' });
  });

  it('splits the label before the kind, so a colon in display text is safe', () => {
    expect(parseToken('Waterdeep|npc: a joke'))
      .toEqual({ kind: null, name: 'Waterdeep', label: 'npc: a joke' });
  });

  it('falls back to the name when the label is empty', () => {
    expect(parseToken('Waterdeep|').label).toBe('Waterdeep');
    expect(parseToken('Waterdeep|   ').label).toBe('Waterdeep');
  });

  it('does not treat a leading colon as a kind', () => {
    expect(parseToken(':Waterdeep').kind).toBeNull();
  });
});

describe('resolve', () => {
  const r = (inner) => resolve(parseToken(inner), INDEX);

  it('finds a location by name', () => {
    expect(r('Waterdeep')).toMatchObject({ kind: 'location', id: 1 });
  });

  it('finds it without the accent', () => {
    expect(r('thea')).toMatchObject({ kind: 'location', id: 3 });
  });

  it('prefers the location when a name is shared', () => {
    // A place is the commoner thing to link; the typed form reaches the other.
    expect(r('Grathul')).toMatchObject({ kind: 'location', id: 4 });
    expect(r('npc:Grathul')).toMatchObject({ kind: 'npc', id: 10 });
    expect(r('location:Grathul')).toMatchObject({ kind: 'location', id: 4 });
  });

  it('returns null for a name nobody has', () => {
    expect(r('Neverwinter')).toBeNull();
  });

  it('returns null when the kind is wrong', () => {
    expect(r('npc:Waterdeep')).toBeNull();
    expect(r('location:Seraphine Vale')).toBeNull();
  });

  it('returns null rather than throwing on nothing', () => {
    expect(r('')).toBeNull();
    expect(r('   ')).toBeNull();
    expect(resolve(parseToken('Waterdeep'), null)).toBeNull();
  });
});

describe('buildIndex', () => {
  it('copes with an empty campaign', () => {
    expect(buildIndex({}).size).toBe(0);
    expect(buildIndex().size).toBe(0);
  });

  it('skips a row with no usable name', () => {
    const i = buildIndex({ locations: [{ id: 1, name: '' }, { id: 2, name: null }] });
    expect(i.size).toBe(0);
  });

  it('keeps the first of two NPCs whose names only differ by case', () => {
    // campaign_npcs is unique case-SENSITIVELY, so this really can happen.
    const i = buildIndex({ npcs: [{ id: 1, name: 'Howl' }, { id: 2, name: 'HOWL' }] });
    expect(resolve(parseToken('howl'), i)).toMatchObject({ id: 1 });
  });

  it('gives a player an index with no NPCs, because the server sent none', () => {
    const i = buildIndex({ locations: [{ id: 1, name: 'Waterdeep' }], npcs: [] });
    expect(resolve(parseToken('npc:Grathul'), i)).toBeNull();
    expect(resolve(parseToken('Waterdeep'), i)).toMatchObject({ id: 1 });
  });
});
