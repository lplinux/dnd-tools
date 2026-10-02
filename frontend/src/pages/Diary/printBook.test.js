/**
 * The book document is built as a pure string so it can be tested without a
 * browser. The assertions that matter are the ones that would otherwise only
 * show up as a wasted sheet of paper, or as a draft reaching a reader.
 */
import { describe, it, expect } from 'vitest';
import { buildDiaryBookHtml } from './printBook';

const entry = (over = {}) => ({
  id: 1, title: 'The Sunless Citadel', body: 'We went **down**.',
  session_no: 1, session_date: '2026-03-03', status: 'published', ...over,
});

describe('buildDiaryBookHtml — what reaches the page', () => {
  it('includes published entries', () => {
    const html = buildDiaryBookHtml({ campaignName: 'Lost Mines', entries: [entry()] });
    expect(html).toContain('The Sunless Citadel');
    expect(html).toContain('<strong');
  });

  it('never prints a draft', () => {
    const html = buildDiaryBookHtml({
      campaignName: 'Lost Mines',
      entries: [entry(), entry({ id: 2, title: 'SECRET PREP', status: 'draft' })],
    });
    expect(html).toContain('The Sunless Citadel');
    expect(html).not.toContain('SECRET PREP');
  });

  it('keeps entries whose status is absent — the public feed sends no status field', () => {
    const { status, ...noStatus } = entry({ title: 'From the public link' });
    expect(status).toBe('published');
    const html = buildDiaryBookHtml({ campaignName: 'C', entries: [noStatus] });
    expect(html).toContain('From the public link');
  });
});

describe('buildDiaryBookHtml — pagination', () => {
  it('suppresses the page break before the first entry, so there is no leading blank page', () => {
    const html = buildDiaryBookHtml({ campaignName: 'C', entries: [entry(), entry({ id: 2 })] });
    expect(html).toContain('.entry:first-of-type { break-before: auto');
  });

  it('does not force a whole entry onto one page', () => {
    // A session summary is long prose; break-inside:avoid on it would leave
    // large blank areas. This guards the comment from being "helpfully" undone.
    const html = buildDiaryBookHtml({ campaignName: 'C', entries: [entry()] });
    expect(html).not.toMatch(/\.entry\s*\{[^}]*break-inside:\s*avoid/);
  });

  it('declares its own @page, which is why it lives in a separate document', () => {
    expect(buildDiaryBookHtml({ campaignName: 'C', entries: [] })).toContain('@page { size: A4 portrait;');
  });
});

describe('buildDiaryBookHtml — escaping', () => {
  it('escapes a script tag in an entry title', () => {
    const html = buildDiaryBookHtml({ campaignName: 'C', entries: [entry({ title: '<script>alert(1)</script>' })] });
    expect(html).not.toContain('<script>alert(1)');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes a script tag in an entry body', () => {
    const html = buildDiaryBookHtml({ campaignName: 'C', entries: [entry({ body: '<script>alert(1)</script>' })] });
    expect(html).not.toContain('<script>alert(1)');
  });

  it('escapes the campaign name, which reaches both the title and <title>', () => {
    const html = buildDiaryBookHtml({ campaignName: '<img src=x onerror=alert(1)>', entries: [] });
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });
});

describe('buildDiaryBookHtml — credits and the party annex', () => {
  const roster = {
    dm_name: 'pablo',
    players: [
      { player_name: 'laura', character_name: 'Iris', picture_data: 'data:image/png;base64,AAA', public_info: 'A **druid** of Eldath.' },
      { player_name: 'rafael', character_name: 'Euphrosynth', picture_url: null, public_info: null },
    ],
  };
  const html = buildDiaryBookHtml({ campaignName: 'Leruhy', entries: [entry()], roster });

  it('names the DM and the table on the title page', () => {
    expect(html).toContain('Dungeon Master');
    expect(html).toContain('pablo');
    expect(html).toContain('Iris');
  });

  it('adds an annex with a bio per player', () => {
    expect(html).toContain('class="annex"');
    expect(html).toContain('The Party');
    expect(html).toContain('played by laura');
    expect(html).toContain('<strong');              // public_info rendered as markdown
  });

  it('copes with a player who has no portrait or bio', () => {
    expect(html).toContain('bio-noimg');
    expect(html).toContain('No bio written');
  });

  it('omits the annex entirely when there is no roster', () => {
    const bare = buildDiaryBookHtml({ campaignName: 'Leruhy', entries: [entry()] });
    expect(bare).not.toContain('class="annex"');
    expect(bare).not.toContain('Dungeon Master');
  });

  it('escapes roster text, which is user-authored like everything else', () => {
    const evil = buildDiaryBookHtml({
      campaignName: 'C', entries: [],
      roster: { dm_name: '<script>alert(1)</script>', players: [] },
    });
    expect(evil).not.toContain('<script>alert(1)');
    expect(evil).toContain('&lt;script&gt;');
  });
});

describe('buildDiaryBookHtml — degenerate input', () => {
  it('survives no entries at all', () => {
    const html = buildDiaryBookHtml({ campaignName: 'Empty', entries: [] });
    expect(html).toContain('No published entries yet');
    expect(html).toContain('Empty');
  });

  it('survives a missing entries array and a missing body', () => {
    expect(() => buildDiaryBookHtml({ campaignName: 'C' })).not.toThrow();
    expect(() => buildDiaryBookHtml({ campaignName: 'C', entries: [entry({ body: null })] })).not.toThrow();
  });

  it('survives an unparseable session_date rather than printing "Invalid Date"', () => {
    const html = buildDiaryBookHtml({ campaignName: 'C', entries: [entry({ session_date: 'not-a-date' })] });
    expect(html).not.toContain('Invalid Date');
  });
});
