/**
 * components/ui/renderMarkdown.js
 *
 * A deliberately tiny markdown subset: headings, bold, italic, inline code,
 * blockquotes, list items, links, paragraphs. Started life inline in Home.jsx's
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
 * @param {string} text
 * @param {Map|null} links  cross-link index; without it `[[…]]` is plain text
 */
export function renderMd(text, links = null) {
  const escaped = renderCrossLinks(escapeText(text), links);

  return escaped
    .replace(/^### (.+)$/gm, '<h3 class="font-display text-gold text-sm uppercase tracking-wider mt-4 mb-1">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="font-display text-gold text-base uppercase tracking-wider mt-5 mb-2">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="font-display text-gold text-lg uppercase tracking-wider mb-3">$1</h1>')
    .replace(/^&gt; (.+)$/gm, '<blockquote class="border-l-2 border-[var(--gold-dim)] pl-3 my-2 italic text-text-dim">$1</blockquote>')
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
    })
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc text-text-dim">$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal text-text-dim">$1</li>')
    .replace(/\n\n/g, '</p><p class="mb-2">')
    .replace(/^/, '<p class="mb-2">')
    .replace(/$/, '</p>');
}
