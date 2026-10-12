/**
 * pages/Diary/printBook.js
 *
 * Renders the campaign diary as a book and sends it to the printer.
 *
 * WHY A SEPARATE WINDOW rather than the off-canvas print document the PC Sheet
 * uses: Vite leaves a lazily loaded route's stylesheet in the document after you
 * navigate away, so an `@page` rule in a diary stylesheet would become GLOBAL
 * after one visit to /diary and silently change the PC and NPC sheets' margins.
 * Naming the page to confine it re-introduces the blank-page bug this project
 * has already fixed twice (see pc-print.css and npc-sheet.css). A document of
 * its own has its own page context and cannot leak.
 *
 * It also sidesteps three other traps for free: no theme tokens are in scope, so
 * nothing prints as a dark block; no dependence on the positional
 * `#root > div` un-clip chain in globals.css; and no component mounts twice with
 * live side effects. Precedent: printGraph() in PcSheet/components/RelGraph.jsx.
 *
 * `renderMd` emits Tailwind utility classes, which are INERT here because this
 * document never loads the app's CSS — so the stylesheet below targets semantic
 * elements instead of fighting `text-gold` and friends. Escaping is unchanged,
 * so the renderer's safety contract carries over as-is.
 */

import { renderMd } from '@/components/ui';

const FONTS = 'https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Crimson+Text:ital,wght@0,400;0,600;1,400&display=swap';

/** Escape for element content. Entry titles are user text and are NOT markdown. */
function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function metaLine(e) {
  const bits = [];
  if (e.session_no != null) bits.push(`Session ${e.session_no}`);
  if (e.session_date) {
    const d = new Date(e.session_date);
    if (!Number.isNaN(d.getTime())) {
      bits.push(d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }));
    }
  }
  return bits.join(' · ');
}

const STYLES = `
  /* Confined to this document, so it can be as opinionated as it likes. */
  @page { size: A4 portrait; margin: 20mm 18mm; }

  html, body { margin: 0; padding: 0; background: #fff; color: #1b1b1b; }
  body {
    font-family: 'Crimson Text', Georgia, serif;
    font-size: 11.5pt;
    line-height: 1.55;
  }
  /* A full-width A4 line is far too long to read. A narrow measure is most of
     what makes a page look like a book. */
  .book { max-width: 130mm; margin: 0 auto; }

  /* ── Title page ── */
  .title-page {
    height: 232mm;              /* A4 height less the @page margins */
    display: flex; flex-direction: column;
    align-items: center; justify-content: center; text-align: center;
    break-after: page; page-break-after: always;
  }
  .title-page h1 {
    font-family: 'Cinzel', Georgia, serif;
    font-size: 30pt; font-weight: 700; letter-spacing: .04em;
    margin: 0 0 6mm; text-transform: uppercase;
  }
  .title-rule { width: 40mm; border-top: 1px solid #8a6010; margin: 0 0 6mm; }
  .title-page .sub {
    font-family: 'Cinzel', Georgia, serif;
    font-size: 12pt; letter-spacing: .18em; text-transform: uppercase; color: #6a5a40;
  }
  .title-page .credit { margin-top: 8mm; font-size: 10.5pt; max-width: 110mm; }
  .title-page .credit .role {
    display: block; font-family: 'Cinzel', Georgia, serif; font-size: 7.5pt;
    letter-spacing: .18em; text-transform: uppercase; color: #8a6010; margin-bottom: 1mm;
  }
  .title-page .foot { margin-top: 14mm; font-size: 10pt; color: #6a5a40; font-style: italic; }

  /* ── Annex: the party ── */
  .annex { break-before: page; page-break-before: always; }
  .annex h2 {
    font-family: 'Cinzel', Georgia, serif; font-size: 15pt;
    letter-spacing: .08em; text-transform: uppercase; margin: 0 0 6mm;
  }
  /* A bio is short enough to keep whole; a torn portrait reads as a misprint. */
  .bio {
    display: flex; gap: 5mm; margin: 0 0 7mm;
    break-inside: avoid; page-break-inside: avoid;
  }
  .bio img, .bio-noimg {
    width: 28mm; height: 28mm; object-fit: cover; flex: 0 0 28mm;
    border: 1px solid #a07840; border-radius: 1mm;
  }
  .bio-noimg { background: #f0ece0; }
  .bio-text { flex: 1; min-width: 0; }
  .bio-text h3 {
    font-family: 'Cinzel', Georgia, serif; font-size: 11.5pt;
    letter-spacing: .06em; margin: 0 0 1mm; color: #1b1b1b; text-transform: none;
  }
  .bio-who { font-size: 9pt; font-style: italic; color: #6a5a40; margin: 0 0 2mm; }
  .bio-text p { margin: 0 0 2mm; font-size: 10pt; }

  /* ── Contents ── */
  .contents { break-after: page; page-break-after: always; }
  .contents h2, .entry h2 {
    font-family: 'Cinzel', Georgia, serif;
    font-size: 15pt; letter-spacing: .08em; text-transform: uppercase;
    margin: 0 0 6mm; color: #1b1b1b;
  }
  .contents ol { list-style: none; margin: 0; padding: 0; }
  .contents li { margin: 0 0 2.5mm; display: flex; gap: 3mm; align-items: baseline; }
  .contents .n { font-family: 'Cinzel', Georgia, serif; font-size: 9pt; color: #8a6010; min-width: 12mm; }

  /* ── Entries ── */
  /* One session per page. :first-of-type guard, or the first entry emits a
     leading blank page — the same mechanism as a named-page break. */
  .entry { break-before: page; page-break-before: always; }
  .entry:first-of-type { break-before: auto; page-break-before: auto; }
  /* Deliberately NO break-inside: avoid here. A session summary is long prose,
     and forcing a tall block whole leaves a third of a page empty. */
  .entry .meta {
    font-family: 'Cinzel', Georgia, serif;
    font-size: 8.5pt; letter-spacing: .1em; text-transform: uppercase;
    color: #8a6010; margin: -4mm 0 2mm;
  }
  .entry .subtitle {
    font-style: italic; font-size: 10pt; color: #4a4036; margin: 0 0 5mm;
  }

  /* ── Body, rendered from markdown ── */
  .body { orphans: 3; widows: 3; }
  .body p { margin: 0 0 3mm; }
  /* A drop cap on the opening paragraph only — the single most book-like touch
     available, and free. */
  .entry .body > p:first-of-type::first-letter {
    font-family: 'Cinzel', Georgia, serif;
    float: left; font-size: 34pt; line-height: .85;
    padding: 1mm 2mm 0 0; color: #8a6010;
  }
  .body h1, .body h2, .body h3 {
    font-family: 'Cinzel', Georgia, serif;
    letter-spacing: .06em; text-transform: uppercase; color: #1b1b1b;
    margin: 6mm 0 2mm; break-after: avoid; page-break-after: avoid;
  }
  .body h1 { font-size: 13pt; } .body h2 { font-size: 12pt; }
  /* ### is the in-entry sub-heading, so it is styled to be clearly subordinate
     to the session title above it rather than competing with it. */
  .body h3 {
    font-size: 10pt; letter-spacing: .12em; color: #8a6010;
    margin: 6mm 0 1.5mm;
  }
  .body strong { font-weight: 600; color: #000; }
  .body em { font-style: italic; }
  .body code {
    font-family: 'Courier New', monospace; font-size: .9em;
    background: #f0ece0; padding: 0 1mm; border-radius: 1px;
  }
  .body blockquote {
    margin: 3mm 0; padding: 0 0 0 4mm;
    border-left: 1.5pt solid #c8a060; font-style: italic; color: #4a4036;
    /* A quote crossing a page gets a complete rule on both halves instead of
       one sliced through. */
    box-decoration-break: clone; -webkit-box-decoration-break: clone;
  }
  /* renderMd emits bare <li> with no <ul> parent, so give them their own
     indent and marker rather than relying on list semantics. */
  .body li { margin: 0 0 1.5mm 6mm; }
  .body a { color: #1b1b1b; text-decoration: underline; }

  /* No texture overlay, no opacity layer, no box-shadow anywhere: a partially
     transparent layer over content makes the print engine rasterise the text
     beneath it, which is what once made the stat block blurry everywhere. */
`;

/**
 * Build the complete HTML document. Pure and exported so it can be tested
 * without a browser — the window plumbing lives in openDiaryBook below.
 */
export function buildDiaryBookHtml({ campaignName, entries, roster }) {
  // Published only, everywhere. Belt and braces: the public endpoint already
  // sends nothing else, and the DM page filters before calling.
  const list = (entries || []).filter((e) => e.status === undefined || e.status === 'published');

  const nums = list.map((e) => e.session_no).filter((n) => n != null);
  const range = nums.length
    ? (Math.min(...nums) === Math.max(...nums)
      ? `Session ${Math.min(...nums)}`
      : `Sessions ${Math.min(...nums)}–${Math.max(...nums)}`)
    : `${list.length} ${list.length === 1 ? 'entry' : 'entries'}`;

  const contents = list.map((e, i) => `
      <li><span class="n">${e.session_no != null ? esc(e.session_no) : i + 1}</span><span>${esc(e.title)}</span></li>`).join('');

  const body = list.map((e) => {
    const meta = [e.chapter, metaLine(e)].filter(Boolean).join(' · ');
    // An entry whose body opens with a single *italic line* is carrying a
    // subtitle — the in-world date and who was at the table. Lift it into the
    // header: left in the prose it became the first paragraph, and the drop cap
    // landed on it, so a page opened with a giant "1" from "16 - Eleint".
    const raw = (e.body || '').trimStart();
    const nl = raw.indexOf('\n');
    const head = nl === -1 ? raw : raw.slice(0, nl).trim();
    const hasSub = /^\*[^*\n]+\*$/.test(head);
    const subtitle = hasSub ? head.slice(1, -1) : null;
    const prose = hasSub ? raw.slice(nl + 1).trimStart() : raw;
    return `
    <article class="entry">
      <h2>${esc(e.title)}</h2>
      ${meta ? `<div class="meta">${esc(meta)}</div>` : ''}
      ${subtitle ? `<div class="subtitle">${esc(subtitle)}</div>` : ''}
      <div class="body">${renderMd(prose)}</div>
    </article>`;
  }).join('');

  // Credits on the title page, bios in an annex at the back — the two places a
  // printed campaign journal conventionally names its table.
  const players = (roster?.players ?? []);
  const credits = [
    roster?.dm_name ? `<div class="credit"><span class="role">Dungeon Master</span>${esc(roster.dm_name)}</div>` : '',
    players.length
      ? `<div class="credit"><span class="role">Players</span>${
        players.map((p) => esc(p.character_name || p.player_name)).join(' · ')}</div>`
      : '',
  ].join('');

  const annex = players.length ? `
  <section class="annex">
    <h2>The Party</h2>
    ${players.map((p) => {
    const img = p.picture_data || p.picture_url;
    return `
    <div class="bio">
      ${img ? `<img src="${esc(img)}" alt="">` : '<div class="bio-noimg"></div>'}
      <div class="bio-text">
        <h3>${esc(p.character_name || p.player_name)}</h3>
        ${p.character_name && p.player_name && p.character_name !== p.player_name
    ? `<div class="bio-who">played by ${esc(p.player_name)}</div>` : ''}
        ${p.public_info ? renderMd(p.public_info) : '<p><em>No bio written.</em></p>'}
      </div>
    </div>`;
  }).join('')}
  </section>` : '';

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<title>${esc(campaignName)} — Campaign Diary</title>
<link rel="stylesheet" href="${FONTS}">
<style>${STYLES}</style>
</head><body><div class="book">
  <section class="title-page">
    <h1>${esc(campaignName)}</h1>
    <div class="title-rule"></div>
    <div class="sub">A Campaign Diary</div>
    ${credits}
    <div class="foot">${esc(range)} · printed ${esc(new Date().toLocaleDateString())}</div>
  </section>
  ${list.length ? `<section class="contents"><h2>Contents</h2><ol>${contents}</ol></section>` : ''}
  ${body || '<p><em>No published entries yet.</em></p>'}
  ${annex}
</div></body></html>`;
}

/** Open the book in its own window and print it. */
export function openDiaryBook({ campaignName, entries, roster }) {
  const win = window.open('', '_blank');
  if (!win) return false;           // popup blocked — the caller tells the user
  win.document.write(buildDiaryBookHtml({ campaignName, entries, roster }));
  win.document.close();

  // Wait for the webfonts rather than guessing with a timeout: they are loaded
  // from Google with `display=swap`, so printing too early renders the whole
  // book in Georgia. document.fonts.ready resolves once swapping is done.
  const go = () => { win.focus(); win.print(); };
  if (win.document.fonts?.ready) win.document.fonts.ready.then(go).catch(go);
  else win.addEventListener('load', go);
  return true;
}
