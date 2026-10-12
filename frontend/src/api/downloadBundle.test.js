import { describe, it, expect, vi, afterEach } from 'vitest';
import { bundleFilename, slugify } from './downloadBundle';

afterEach(() => vi.useRealTimers());

function atDate(iso, fn) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(iso));
  try { return fn(); } finally { vi.useRealTimers(); }
}

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('The Last Performance')).toBe('the-last-performance');
  });

  it('strips accents rather than dropping the letters', () => {
    expect(slugify('Ailyssë')).toBe('ailysse');
    expect(slugify('Euphrosynth Lurlián')).toBe('euphrosynth-lurlian');
  });

  it('collapses punctuation and trims stray hyphens', () => {
    expect(slugify("Teudis' Journal — vol. 2")).toBe('teudis-journal-vol-2');
    expect(slugify('  ...weird...  ')).toBe('weird');
  });

  it('survives empty, null and undefined', () => {
    for (const v of ['', null, undefined]) expect(slugify(v)).toBe('');
  });

  it('caps the length so a long title cannot blow up the filename', () => {
    expect(slugify('x'.repeat(200)).length).toBeLessThanOrEqual(60);
  });
});

describe('bundleFilename', () => {
  it('matches the documented shape', () => {
    atDate('2026-10-02T12:00:00', () => {
      expect(bundleFilename({ module: 'campaign', name: 'The Last Performance' }))
        .toBe('campaign-the-last-performance-2026-10-02.json');
      expect(bundleFilename({ module: 'character', campaign: 'Leruhy', name: 'Teudis' }))
        .toBe('character-leruhy-teudis-2026-10-02.json');
    });
  });

  it('omits parts that are missing instead of leaving double hyphens', () => {
    atDate('2026-10-02T12:00:00', () => {
      expect(bundleFilename({ module: 'campaign-diary', campaign: 'Leruhy' }))
        .toBe('campaign-diary-leruhy-2026-10-02.json');
      expect(bundleFilename({ module: 'timeline', campaign: null, name: 'Macro' }))
        .toBe('timeline-macro-2026-10-02.json');
    });
  });

  it('uses the LOCAL date, so a file saved late at night is dated today', () => {
    // 23:30 local on the 2nd is already the 3rd in UTC; toISOString would be wrong.
    atDate('2026-10-02T23:30:00', () => {
      expect(bundleFilename({ module: 'campaign', name: 'x' })).toContain('2026-10-02');
    });
  });

  it('zero-pads month and day', () => {
    atDate('2026-01-05T12:00:00', () => {
      expect(bundleFilename({ module: 'campaign', name: 'x' })).toContain('2026-01-05');
    });
  });
});
