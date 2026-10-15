/**
 * data/highlight.js
 *
 * Finding where the search terms sit in a piece of text, accent-insensitively.
 *
 * The hard part is that folding does not preserve offsets. `é` is one
 * character; `'é'.normalize('NFD')` is two, and stripping the combining mark
 * leaves one again — so for ordinary precomposed text the lengths happen to
 * match. They do NOT match when the input is already decomposed, which is how
 * text pasted out of some editors arrives: there `e` + U+0301 is two
 * characters that fold to one, and every offset after it is wrong by one.
 *
 * So rather than fold and hope, `foldWithMap` folds character by character and
 * records where each folded character came from. Matching on the folded string
 * then gives offsets that are exact in the original.
 */

const MARKS = /[̀-ͯ]/;

/**
 * @returns {{ folded: string, map: number[] }} `map[i]` is the index in the
 *   ORIGINAL string that folded character `i` came from, plus one final entry
 *   for the end, so a folded range [a, b) maps to original [map[a], map[b]).
 */
export function foldWithMap(input) {
  const text = String(input ?? '');
  let folded = '';
  const map = [];
  for (let i = 0; i < text.length; i++) {
    const decomposed = text[i].normalize('NFD');
    for (const ch of decomposed) {
      if (MARKS.test(ch)) continue;          // the accent itself contributes nothing
      folded += ch.toLowerCase();
      map.push(i);
    }
  }
  map.push(text.length);
  return { folded, map };
}

/** Terms from a raw query, folded and deduplicated, longest first. */
export function queryTerms(query) {
  const seen = new Set();
  for (const t of foldWithMap(query).folded.split(/\s+/)) {
    if (t) seen.add(t);
  }
  // Longest first so "water" is marked before "wat" inside it, which stops a
  // shorter term carving a hole out of a longer match.
  return [...seen].sort((a, b) => b.length - a.length);
}

/** Does every term appear in the text, ignoring case and accents? */
export function matchesAll(text, terms) {
  if (!terms?.length) return true;
  const { folded } = foldWithMap(text);
  return terms.every((t) => folded.includes(t));
}

/**
 * Every place a term occurs, as ranges into the ORIGINAL string.
 *
 * Overlapping and adjacent ranges are merged, so two terms that happen to sit
 * next to each other render as one mark rather than two touching ones.
 */
export function findRanges(text, terms) {
  const src = String(text ?? '');
  if (!src || !terms?.length) return [];
  const { folded, map } = foldWithMap(src);

  const raw = [];
  for (const term of terms) {
    if (!term) continue;
    let at = folded.indexOf(term);
    while (at !== -1) {
      raw.push([map[at], map[at + term.length]]);
      at = folded.indexOf(term, at + term.length);
    }
  }
  if (!raw.length) return [];

  raw.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged = [raw[0]];
  for (const [s, e] of raw.slice(1)) {
    const last = merged[merged.length - 1];
    if (s <= last[1]) last[1] = Math.max(last[1], e);
    else merged.push([s, e]);
  }
  return merged.map(([start, end]) => ({ start, end }));
}

/**
 * Split a string into alternating plain and matched pieces.
 *
 * Returns data, not markup, so the caller decides what a match looks like —
 * React nodes in one place, a DOM `<mark>` element in another.
 */
export function splitOnMatches(text, terms) {
  const src = String(text ?? '');
  const ranges = findRanges(src, terms);
  if (!ranges.length) return [{ text: src, match: false }];

  const parts = [];
  let cursor = 0;
  for (const { start, end } of ranges) {
    if (start > cursor) parts.push({ text: src.slice(cursor, start), match: false });
    parts.push({ text: src.slice(start, end), match: true });
    cursor = end;
  }
  if (cursor < src.length) parts.push({ text: src.slice(cursor), match: false });
  return parts;
}

/**
 * Mark every occurrence inside an already-rendered element.
 *
 * Walks TEXT NODES only and builds `<mark>` elements with the DOM API, so
 * nothing here can touch a tag name or an attribute and no string is ever
 * re-parsed as HTML. That is the whole reason this is a DOM walk rather than a
 * regex over the rendered markup — a search for "div" must not rewrite the
 * document.
 *
 * Existing marks are skipped, so running it twice is harmless.
 */
export function highlightElement(el, terms, className = 'search-hit') {
  if (!el || !terms?.length) return 0;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => (node.parentElement?.closest(`mark.${className}`)
      ? NodeFilter.FILTER_REJECT
      : NodeFilter.FILTER_ACCEPT),
  });

  const targets = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeValue && n.nodeValue.trim()) targets.push(n);
  }

  let count = 0;
  for (const node of targets) {
    const parts = splitOnMatches(node.nodeValue, terms);
    if (parts.length === 1 && !parts[0].match) continue;
    const frag = document.createDocumentFragment();
    for (const part of parts) {
      if (part.match) {
        const mark = document.createElement('mark');
        mark.className = className;
        mark.textContent = part.text;      // text, never markup
        frag.appendChild(mark);
        count += 1;
      } else {
        frag.appendChild(document.createTextNode(part.text));
      }
    }
    node.parentNode?.replaceChild(frag, node);
  }
  return count;
}
