/**
 * The notes document is built as a pure string so it can be tested without a
 * browser — the same arrangement printBook uses.
 *
 * What is worth asserting is what would otherwise only show up as a wasted
 * ream, or as something reaching paper that should not have.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildNotesHtml } from './printNotes';
import { diaryMetaText } from './PrintNotesButton';
import { journalMetaText } from '@/pages/Journal/JournalPanel';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => fs.readFileSync(path.resolve(here, rel), 'utf8');

const note = (over = {}) => ({
  id: 1, title: 'The cellar key', body: 'Found under the **barrel**.', ...over,
});
const group = (label, items) => ({ key: label ?? '\u0000', label, items });

describe('buildNotesHtml — what reaches the page', () => {
  it('prints the entries it is given, with their markdown rendered', () => {
    const html = buildNotesHtml({ title: 'Leruhy', groups: [group('Clues', [note()])] });
    expect(html).toContain('The cellar key');
    expect(html).toContain('<strong');
    expect(html).toContain('Clues');
  });

  it('counts what it printed', () => {
    const html = buildNotesHtml({
      title: 'C',
      groups: [group('A', [note(), note({ id: 2 })]), group('B', [note({ id: 3 })])],
    });
    expect(html).toContain('3 entries');
  });

  it('says so when it is a filtered view', () => {
    // Or the printout reads as the whole journal with entries missing.
    const html = buildNotesHtml({
      title: 'C', groups: [group('A', [note()])], note: 'matching “key”',
    });
    expect(html).toContain('matching “key”');
  });

  it('survives having nothing to print', () => {
    const html = buildNotesHtml({ title: 'C', groups: [] });
    expect(html).toContain('Nothing to print');
    expect(html).toContain('0 entries');
  });
});

describe('buildNotesHtml — grouping', () => {
  it('labels the unfiled pile', () => {
    const html = buildNotesHtml({
      title: 'C',
      groups: [group('Clues', [note()]), group(null, [note({ id: 2, title: 'Loose' })])],
      ungroupedLabel: 'Uncategorised',
    });
    expect(html).toContain('Uncategorised');
    expect(html).toContain('Loose');
  });

  it('drops the heading when NOTHING is grouped', () => {
    // A diary where nobody used categories should print as a list of notes,
    // not as one pile labelled "Uncategorised" — the same call the screen makes.
    const html = buildNotesHtml({
      title: 'C', groups: [group(null, [note()])], ungroupedLabel: 'Uncategorised',
    });
    expect(html).toContain('The cellar key');
    expect(html).not.toContain('Uncategorised');
  });

  it('keeps the heading when there is one real group', () => {
    const html = buildNotesHtml({ title: 'C', groups: [group('Clues', [note()])] });
    expect(html).toContain('Clues');
  });
});

describe('buildNotesHtml — escaping', () => {
  it('escapes titles, group labels and meta, which are not markdown', () => {
    const html = buildNotesHtml({
      title: '<script>x</script>',
      subtitle: '<b>s</b>',
      groups: [group('<i>g</i>', [note({ title: '<img onerror=1>' })])],
      meta: () => '<svg onload=1>',
    });
    for (const bad of ['<script>x', '<b>s</b>', '<i>g</i>', '<img onerror', '<svg onload']) {
      expect(html).not.toContain(bad);
    }
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('buildNotesHtml — the meta line', () => {
  it('is omitted entirely when there is nothing to say', () => {
    // An empty italic line under every title is just a gap.
    const html = buildNotesHtml({ title: 'C', groups: [group('A', [note()])], meta: () => '' });
    expect(html).not.toContain('class="meta"');
  });

  it('is rendered when there is', () => {
    const html = buildNotesHtml({
      title: 'C', groups: [group('A', [note()])], meta: () => 'Session 3',
    });
    expect(html).toContain('Session 3');
  });
});

describe('buildNotesHtml — it is notes, not the book', () => {
  const html = buildNotesHtml({ title: 'C', groups: [group('A', [note()])] });

  it('flows in two columns', () => {
    expect(html).toMatch(/\.notes \{[^}]*columns: 2/);
  });

  it('does NOT force a page per entry', () => {
    // printBook does; forty short notes that way is a ream of blank paper.
    expect(html).not.toMatch(/\.note \{[^}]*break-before: page/);
  });

  it('keeps a note whole where it fits', () => {
    expect(html).toMatch(/\.note \{[^}]*break-inside: avoid/);
  });

  it('never strands a group heading at the foot of a page', () => {
    expect(html).toMatch(/\.group > h2 \{[^}]*break-after: avoid/);
  });
});

describe('the meta lines are plain text', () => {
  // The print document never loads React, so an on-screen node is no use —
  // and these end up inside esc(), which would show the markup verbatim.
  it('a diary entry gives session and date', () => {
    expect(diaryMetaText({ session_no: 3, session_date: '2026-03-03' }))
      .toMatch(/^Session 3 · /);
    expect(typeof diaryMetaText({})).toBe('string');
  });

  it('a journal entry gives who, where and when', () => {
    const line = journalMetaText({
      author_character: 'Thalia', location_name: 'Buldamar', in_game_day: null,
    }, 'harptos');
    expect(line).toBe('Thalia · Buldamar');
  });

  it('falls back to the username when there is no character', () => {
    expect(journalMetaText({ author_username: 'pablo' }, 'harptos')).toBe('pablo');
  });

  it('marks a DM-only entry on the paper', () => {
    // A printout leaves the table; it should say which lines were never meant
    // for the players.
    expect(journalMetaText({ author_username: 'dm', dm_only: true }, 'harptos'))
      .toContain('DM only');
  });

  it('carries no emoji — they print as tofu in fallback fonts', () => {
    const line = journalMetaText({ author_character: 'Thalia', location_name: 'X' }, 'harptos');
    expect(line).not.toMatch(/[✍\u{1F4CD}\u{1F5D3}]/u);
  });
});

describe('printing sends what is on screen', () => {
  const GROUPED = read('./GroupedEntries.jsx');

  it('GroupedEntries hands the toolbar its filtered, grouped list', () => {
    // The search lives inside that component, so a Print button outside it
    // can only see the unfiltered entries and would print the wrong set.
    expect(GROUPED).toMatch(/typeof toolbar === 'function'/);
    expect(GROUPED).toMatch(/toolbar\(\{ shown, groups, query: query\.trim\(\) \}\)/);
  });

  it('a plain node still works, for the callers that do not need it', () => {
    expect(GROUPED).toMatch(/: toolbar/);
  });

  it.each([
    ['the PC Sheet diary tab', '../PcSheet/tabs/DiaryTab.jsx'],
    ['the /diary player panel', './PlayerDiaryPanel.jsx'],
    ['the campaign journal', '../Journal/JournalPanel.jsx'],
  ])('%s prints the grouped list, not `entries`', (_name, rel) => {
    const src = read(rel);
    expect(src).toMatch(/toolbar=\{\(\{ groups, query \}\)/);
    expect(src).toMatch(/groups=\{groups\}|groups,/);
  });

  it('every diary view offers it, players included', () => {
    for (const rel of ['../PcSheet/tabs/DiaryTab.jsx', './PlayerDiaryPanel.jsx']) {
      expect(read(rel)).toContain('PrintNotesButton');
    }
  });
});

describe('the window plumbing is shared, not copied', () => {
  const DOC = read('../../data/printDoc.js');

  it('printBook and printNotes both use it', () => {
    for (const rel of ['./printBook.js', './printNotes.js']) {
      expect(read(rel)).toMatch(/from '@\/data\/printDoc'/);
    }
  });

  it('it still waits for the webfonts before printing', () => {
    // Printing too early renders the whole document in Georgia.
    expect(DOC).toMatch(/fonts\?\.ready/);
  });

  it('and reports a blocked popup rather than failing silently', () => {
    expect(DOC).toMatch(/if \(!win\) return false/);
  });
});
