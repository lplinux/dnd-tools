/**
 * components/ui/renderMarkdown.js
 *
 * A deliberately tiny markdown subset: headings, bold, italic, inline code,
 * blockquotes, list items, links, paragraphs, and pipe tables. Started life inline in Home.jsx's
 * DocsModal rendering repo READMEs; now also renders user-authored diary
 * entries, including on the unauthenticated public page.
 *
 * SECURITY — the reason `dangerouslySetInnerHTML` is defensible here:
 *
 *   1. The escape pass runs FIRST, so no raw markup from the input survives.
 *      `&` must be replaced before `<`/`>` or the entities it emits get
 *      double-escaped.
 *   2. Every substitution below puts user text in ELEMENT CONTENT, with one
 *      exception: a link's href. That one place gets its own treatment —
 *      an allowlist of schemes plus quote escaping (see `safeHref`).
 *
 * Do not add syntax that puts user text into any other attribute (images,
 * titles, ids) without revisiting both points. The three-character escape
 * below is not a sanitiser and was never meant to be one.
 *
 * `[[Name]]` cross-links honour that rule rather than widening it: the name
 * stays in element content and the ATTRIBUTE carries a resolved id, which is
 * a number this code produced and never anything the author typed. A name
 * that does not resolve emits no attribute at all.
 */

import { parseToken, resolve } from '@/data/crossLinks';

/** `&` first — see note 1 above. */
function escapeText(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * An href we are willing to emit, or null.
 *
 * Allowlist, not denylist: `http(s)://` and site-relative `/paths` only.
 * `javascript:`, `data:`, `vbscript:` and anything else fall through to null
 * and the link renders as literal text. A denylist of known-bad schemes would
 * be one creative encoding away from failing.
 *
 * The `(?!\/)` matters: `//evil.example.com` is a PROTOCOL-RELATIVE url, not a
 * site-relative path. Without it a link that looks local sends the reader to
 * someone else's domain — caught by a test before this shipped.
 *
 * Quotes are escaped because this is the only attribute context in the file —
 * without it, a URL containing `"` closes the attribute and opens an event
 * handler. escapeText does not cover `"` or `'`.
 */
function safeHref(raw) {
  const url = String(raw ?? '').trim();
  if (!/^(https?:\/\/|\/(?!\/))/i.test(url)) return null;
  return url.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * `[[Name]]`, `[[npc:Name]]`, `[[Name|display text]]`.
 *
 * `links` is the Map from `data/crossLinks.js` — folded name to `{kind, id}` —
 * and is absent almost everywhere, in which case every token renders as plain
 * text. That is the right default: it is also what a reader sees for a name
 * they are not allowed to resolve.
 *
 * Runs before every other rule, on the already-escaped string, so a name
 * cannot contain markup and the label cannot be chewed by the bold or link
 * rules on its way past.
 */
function renderCrossLinks(escaped, links) {
  return escaped.replace(/\[\[([^\]\n]+)\]\]/g, (whole, inner) => {
    const token = parseToken(inner);
    const label = token.label;
    if (!label) return whole;
    const hit = links ? resolve(token, links) : null;
    // The id is ours; the label is theirs and stays in element content.
    return hit
      ? `<a class="xlink" data-xlink="${hit.kind}:${hit.id}" role="button" tabindex="0">${label}</a>`
      : `<span class="xlink-dead">${label}</span>`;
  });
}

/**
 * Bold, italic, code and links — the rules that apply INSIDE a line. One
 * function for running text and for table cells, so a cell can never format
 * differently from the paragraph above it.
 */
function inlineRules(s) {
  return s
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-text">$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/`(.+?)`/g, '<code class="bg-surface3 px-1 rounded text-xs font-mono text-[var(--special-fg)]">$1</code>')
    // Links last among the inline rules, so bold/italic inside the label still
    // works. A rejected URL renders as the original text, brackets and all —
    // visible enough that the author notices, harmless if they do not.
    .replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (whole, label, url) => {
      const href = safeHref(url);
      if (!href) return whole;
      return `<a href="${href}" target="_blank" rel="noopener noreferrer nofollow" class="text-gold underline">${label}</a>`;
    });
}

// ── Pipe tables ──────────────────────────────────────────────────────────────
//
//   | Name | Cost |        header row
//   |------|-----:|        separator: --- left, :--: centre, --: right
//   | Rope | 1 gp |        body rows
//
// Found on the ESCAPED text but BEFORE cross-links are rendered, because a
// `[[Name|label]]` link carries a pipe of its own: the splitter skips pipes
// inside [[ ]], and `\|` is a literal pipe. Each table is swapped for a
// placeholder while the rest of the text renders, then put back as a block
// of its own — a <table> is not allowed inside the <p> every block is
// wrapped in, and a browser "fixes" that by tearing the paragraph apart.
//
// Alignment becomes a CLASS from a fixed set, never anything the author
// typed, so the attribute rule in the header still holds.

// GFM: one dash is enough (`|:-:|`); the colons say the alignment.
const SEP_CELL = /^\s*:?-+:?\s*$/;
const ALIGN = { left: '', center: ' text-center', right: ' text-right' };
// Private-use characters: stripped from the input first, so a placeholder can
// only ever be one this code made.
const PH_OPEN = '\uE000';
const PH_CLOSE = '\uE001';

/** A row's cells: outer pipes dropped, pipes inside [[ ]] and `\|` kept. */
function splitRow(line) {
  let t = line.trim();
  if (t.startsWith('|')) t = t.slice(1);
  if (t.endsWith('|') && !t.endsWith('\\|')) t = t.slice(0, -1);
  const cells = [];
  let cur = '';
  let depth = 0;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (c === '\\' && t[i + 1] === '|') { cur += '|'; i++; continue; }
    if (c === '[' && t[i + 1] === '[') { depth++; cur += '[['; i++; continue; }
    if (c === ']' && t[i + 1] === ']' && depth) { depth--; cur += ']]'; i++; continue; }
    if (c === '|' && !depth) { cells.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  cells.push(cur.trim());
  return cells;
}

const isSeparator = (line) => line.includes('-') && splitRow(line).every((c) => SEP_CELL.test(c));

function alignOf(sepCell) {
  const c = sepCell.trim();
  if (c.startsWith(':') && c.endsWith(':')) return 'center';
  if (c.endsWith(':')) return 'right';
  return 'left';
}

function tableHtml(header, aligns, rows, links) {
  const cell = (tag, text, i, cls) =>
    `<${tag} class="${cls}${ALIGN[aligns[i]] ?? ''}">${inlineRules(renderCrossLinks(text, links))}</${tag}>`;
  const head = header.map((h, i) => cell('th', h, i,
    'border border-border2 bg-surface2 px-2 py-1 text-left font-semibold text-gold')).join('');
  const body = rows.map((r) => `<tr>${header.map((_, i) => cell('td', r[i] ?? '', i,
    'border border-border px-2 py-1 align-top')).join('')}</tr>`).join('');
  return `<div class="md-table overflow-x-auto my-2"><table class="w-full border-collapse text-sm">`
    + `<thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

/** Swap each table for a placeholder; returns the text and the tables. */
function extractTables(escaped, links) {
  const lines = escaped.split('\n');
  const out = [];
  const tables = [];
  for (let i = 0; i < lines.length; i++) {
    const head = lines[i];
    const sep = lines[i + 1];
    if (head.includes('|') && sep !== undefined && isSeparator(sep)) {
      const header = splitRow(head);
      const seps = splitRow(sep);
      // GFM: the separator has exactly as many cells as the header.
      if (seps.length === header.length) {
        const rows = [];
        let j = i + 2;
        while (j < lines.length && lines[j].includes('|') && lines[j].trim()) {
          rows.push(splitRow(lines[j]));
          j++;
        }
        tables.push(tableHtml(header, seps.map(alignOf), rows, links));
        out.push(`${PH_OPEN}${tables.length - 1}${PH_CLOSE}`);
        i = j - 1;
        continue;
      }
    }
    out.push(head);
  }
  // Exactly one blank line either side of each placeholder, however many the
  // author left: extra ones would start the next paragraph with a stray break.
  const text = tables.length
    ? out.join('\n')
      .replace(new RegExp(`\\n*(${PH_OPEN}\\d+${PH_CLOSE})\\n*`, 'g'), '\n\n$1\n\n')
      .replace(/^\n+|\n+$/g, '')
    : out.join('\n');
  return { text, tables };
}

/**
 * @param {string} text
 * @param {Map|null} links  cross-link index; without it `[[…]]` is plain text
 */
export function renderMd(text, links = null) {
  const clean = String(text ?? '').replace(/[\uE000\uE001]/g, '');
  const { text: rest, tables } = extractTables(escapeText(clean), links);
  const escaped = renderCrossLinks(rest, links);

  const html = inlineRules(escaped
    .replace(/^### (.+)$/gm, '<h3 class="font-display text-gold text-sm uppercase tracking-wider mt-4 mb-1">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="font-display text-gold text-base uppercase tracking-wider mt-5 mb-2">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="font-display text-gold text-lg uppercase tracking-wider mb-3">$1</h1>')
    .replace(/^&gt; (.+)$/gm, '<blockquote class="border-l-2 border-[var(--gold-dim)] pl-3 my-2 italic text-text-dim">$1</blockquote>'))
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc text-text-dim">$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal text-text-dim">$1</li>')
    .replace(/\n\n/g, '</p><p class="mb-2">')
    .replace(/^/, '<p class="mb-2">')
    .replace(/$/, '</p>');

  if (!tables.length) return html;
  // Each placeholder sits in a paragraph of its own; replace that paragraph,
  // and any empty ones the blank lines around the table left behind.
  return html.replace(
    new RegExp(`(?:<p class="mb-2">\\s*</p>)*<p class="mb-2">\\s*${PH_OPEN}(\\d+)${PH_CLOSE}\\s*</p>(?:<p class="mb-2">\\s*</p>)*`, 'g'),
    (_, n) => tables[Number(n)] ?? '',
  );
}
