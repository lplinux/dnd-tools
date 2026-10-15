/**
 * pages/Diary/printNotes.js
 *
 * Prints the Campaign Journal, or a player's own Diary, as a set of notes.
 *
 * NOT the book in printBook.js, deliberately. That one gives each entry a page
 * of its own with a drop cap, which is right for a dozen long session write-ups
 * and absurd for forty short notes — "Found a key, Buldamar cellars" would get
 * an A4 sheet to itself. These flow continuously under their group headings,
 * two columns wide, which is what a pile of short notes wants.
 *
 * WHAT IT PRINTS is what is on screen: the current grouping, the current
 * search filter, in the order shown. A print button that quietly produced a
 * different set from the one you are looking at would be worse than none.
 * Collapsed groups still print — collapsing is a way to see past a group, not
 * a way to exclude it, and nothing on screen says otherwise.
 *
 * It takes already-grouped entries and a plain-text `meta` function, so it
 * knows nothing about journals, diaries, calendars or who may read what. In
 * particular it does no filtering of its own: a player's list never contains
 * DM-only entries because the server does not send them, and that is the only
 * place that rule belongs.
 */

import { renderMd } from '@/components/ui';
import { PRINT_FONTS, esc, openPrintWindow } from '@/data/printDoc';

const STYLES = `
  /* Confined to this document, so it can be as opinionated as it likes. */
  @page { size: A4 portrait; margin: 16mm 14mm 14mm; }

  html, body { margin: 0; padding: 0; background: #fff; color: #1b1b1b; }
  body {
    font-family: 'Crimson Text', Georgia, serif;
    font-size: 10.5pt;
    line-height: 1.5;
  }

  /* ── Masthead ──
     A compact header on page one, not a full title page: a set of notes is
     often two pages, and giving it a cover sheet would be most of the print. */
  .head {
    border-bottom: 1.5pt solid #8a6010;
    padding-bottom: 3mm; margin-bottom: 6mm;
  }
  .head h1 {
    font-family: 'Cinzel', Georgia, serif;
    font-size: 17pt; font-weight: 700; letter-spacing: .04em;
    text-transform: uppercase; margin: 0;
  }
  .head .sub {
    font-family: 'Cinzel', Georgia, serif;
    font-size: 8.5pt; letter-spacing: .16em; text-transform: uppercase;
    color: #6a5a40; margin-top: 1.5mm;
  }
  .head .foot { font-size: 8.5pt; color: #6a5a40; font-style: italic; margin-top: 1.5mm; }

  /* ── Groups ──
     No forced page break per group: with eight categories of one note each
     that would be eight sheets. */
  .group { margin: 0 0 5mm; }
  .group > h2 {
    font-family: 'Cinzel', Georgia, serif;
    font-size: 11pt; letter-spacing: .1em; text-transform: uppercase;
    color: #8a6010; margin: 0 0 3mm;
    border-bottom: .5pt solid #c8a060; padding-bottom: 1mm;
    /* A heading alone at the foot of a page is the classic print defect. */
    break-after: avoid; page-break-after: avoid;
  }
  .group.unfiled > h2 { color: #6a5a40; border-bottom-color: #bbb; }

  /* Two columns: these are notes, and a full-width A4 line of them reads
     badly and wastes most of the page. */
  .notes { columns: 2; column-gap: 8mm; }

  /* ── One note ──
     Kept whole where it fits. A note is short by nature, and one torn across
     a column boundary loses the thing that makes the pile scannable. A long
     one will overflow this and break anyway, which is the right trade. */
  .note {
    break-inside: avoid; page-break-inside: avoid; -webkit-column-break-inside: avoid;
    margin: 0 0 4mm; padding: 0 0 3mm;
    border-bottom: .5pt dotted #ccc;
  }
  .note h3 {
    font-family: 'Cinzel', Georgia, serif;
    font-size: 10pt; letter-spacing: .03em; margin: 0 0 1mm; color: #1b1b1b;
  }
  .note .meta {
    font-size: 7.5pt; letter-spacing: .04em; color: #6a5a40;
    margin: 0 0 1.5mm; font-style: italic;
  }

  /* ── Body, rendered from markdown ── */
  .body { orphans: 2; widows: 2; }
  .body p { margin: 0 0 2mm; }
  .body h1, .body h2, .body h3 {
    font-family: 'Cinzel', Georgia, serif;
    font-size: 9pt; letter-spacing: .06em; text-transform: uppercase;
    color: #8a6010; margin: 3mm 0 1mm;
    break-after: avoid; page-break-after: avoid;
  }
  .body strong { font-weight: 600; color: #000; }
  .body em { font-style: italic; }
  .body code {
    font-family: 'Courier New', monospace; font-size: .9em;
    background: #f0ece0; padding: 0 1mm; border-radius: 1px;
  }
  .body blockquote {
    margin: 2mm 0; padding: 0 0 0 3mm;
    border-left: 1pt solid #c8a060; font-style: italic; color: #4a4036;
    box-decoration-break: clone; -webkit-box-decoration-break: clone;
  }
  /* renderMd emits bare <li> with no <ul> parent, and its Tailwind list-disc
     class is inert here, so the marker has to be asked for explicitly. An <li>
     is display: list-item whatever its parent, so this works unwrapped.
     (No backticks in this comment — the whole stylesheet is a template literal
     and one would end it.) */
  .body li { margin: 0 0 1mm 5mm; list-style: disc outside; }
  .body a { color: #1b1b1b; text-decoration: underline; }

  .empty { font-style: italic; color: #6a5a40; }

  /* No texture overlay, no opacity layer, no box-shadow anywhere: a partially
     transparent layer over content makes the print engine rasterise the text
     beneath it, which is what once made the stat block blurry everywhere. */
`;

/**
 * Build the complete HTML document. Pure and exported so it can be tested
 * without a browser — the window plumbing lives in openNotesPrint below.
 *
 * `groups` is `[{ label, items }]` exactly as GroupedEntries renders them,
 * `label: null` meaning the unfiled pile. `meta(entry)` returns a PLAIN
 * STRING: the on-screen version returns JSX, which cannot be serialised into
 * a document that never loads React.
 */
export function buildNotesHtml({
  title, subtitle, groups, meta, ungroupedLabel = 'Unfiled', note = '',
}) {
  const list = groups || [];
  const count = list.reduce((n, g) => n + (g.items?.length ?? 0), 0);

  // An all-unfiled list is not really grouped, so it gets no heading — the
  // same call GroupedEntries makes on screen. A diary where nobody has used
  // categories should print as a list of notes, not as one pile labelled
  // "Unfiled".
  const flat = list.length === 1 && !list[0].label;

  const sections = list.map((g) => {
    const items = (g.items || []).map((e) => {
      const line = meta ? String(meta(e) ?? '').trim() : '';
      return `
      <article class="note">
        <h3>${esc(e.title)}</h3>
        ${line ? `<div class="meta">${esc(line)}</div>` : ''}
        <div class="body">${renderMd(e.body || '')}</div>
      </article>`;
    }).join('');

    return `
    <section class="group${g.label ? '' : ' unfiled'}">
      ${flat ? '' : `<h2>${esc(g.label || ungroupedLabel)}</h2>`}
      <div class="notes">${items}</div>
    </section>`;
  }).join('');

  const foot = [
    `${count} ${count === 1 ? 'entry' : 'entries'}`,
    note,
    `printed ${new Date().toLocaleDateString()}`,
  ].filter(Boolean).join(' · ');

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<title>${esc(title)}${subtitle ? ` — ${esc(subtitle)}` : ''}</title>
<link rel="stylesheet" href="${PRINT_FONTS}">
<style>${STYLES}</style>
</head><body>
  <header class="head">
    <h1>${esc(title)}</h1>
    ${subtitle ? `<div class="sub">${esc(subtitle)}</div>` : ''}
    <div class="foot">${esc(foot)}</div>
  </header>
  ${count ? sections : '<p class="empty">Nothing to print.</p>'}
</body></html>`;
}

/** Open the notes in their own window and print. False if the popup was blocked. */
export function openNotesPrint(opts) {
  return openPrintWindow(buildNotesHtml(opts));
}
