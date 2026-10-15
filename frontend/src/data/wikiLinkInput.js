/**
 * data/wikiLinkInput.js
 *
 * Typing a `[[` cross-link: where the token is, and what replacing it does.
 *
 * Both are pure string arithmetic over a textarea's `value` and
 * `selectionStart`, so the fiddly parts — a caret mid-word, a second `[[`
 * after a closed one, a `]]` the author typed themselves — are testable
 * without a DOM.
 */

/** The longest a part-typed name can get before we stop offering help. */
const MAX_QUERY = 60;

/**
 * The unclosed `[[` the caret is sitting inside, or null.
 *
 * Returns the query typed so far and the span it occupies, so an insertion
 * knows exactly what to replace.
 *
 * Deliberately conservative — it gives up when:
 *   - there is no `[[` before the caret at all;
 *   - a `]]` closes it before the caret, so the token is finished;
 *   - the text between holds a newline or another `[`, which means the author
 *     is not in a link any more and a dropdown would be noise;
 *   - the query has run past `MAX_QUERY`, which is prose, not a name.
 */
export function activeToken(value, caret) {
  const text = String(value ?? '');
  const pos = Math.max(0, Math.min(Number(caret) || 0, text.length));
  const before = text.slice(0, pos);

  const open = before.lastIndexOf('[[');
  if (open === -1) return null;

  const query = before.slice(open + 2);
  if (query.length > MAX_QUERY) return null;
  if (/[\n[\]]/.test(query)) return null;      // closed, or no longer a token

  return { start: open, end: pos, query };
}

/**
 * Replace the active token with a finished `[[Name]]`.
 *
 * Returns the new value and where the caret belongs — just past the `]]`, so
 * typing continues after the link rather than inside it.
 *
 * If the author already typed the closing `]]` immediately after the caret, it
 * is consumed rather than doubled.
 */
export function insertLink(value, caret, name) {
  const token = activeToken(value, caret);
  const text = String(value ?? '');
  const clean = String(name ?? '').trim();
  if (!token || !clean) return { value: text, caret: Number(caret) || 0 };

  const after = text.slice(token.end);
  const trailing = after.startsWith(']]') ? 2 : 0;
  const link = `[[${clean}]]`;
  const next = text.slice(0, token.start) + link + after.slice(trailing);

  return { value: next, caret: token.start + link.length };
}

/**
 * The suggestions for a query: locations, NPCs, then the party — prefix
 * matches before substring ones, capped so the list stays a glance rather
 * than a scroll.
 */
export function suggest(query, { locations = [], npcs = [], characters = [] } = {}, limit = 8) {
  const q = String(query ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

  const rows = [
    ...locations.map((l) => ({ kind: 'location', id: l.id, name: l.name })),
    ...npcs.map((n) => ({ kind: 'npc', id: n.id, name: n.name })),
    // Offered, but never indexed as a link target — see buildIndex. Picking
    // one spells the character's name correctly; it does not become a link,
    // because a character has no page to open.
    ...characters.map((c) => ({ kind: 'character', id: c.id, name: c.name })),
  ].filter((r) => r.name);

  if (!q) return rows.slice(0, limit);

  const scored = [];
  for (const r of rows) {
    const folded = String(r.name)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const at = folded.indexOf(q);
    if (at === -1) continue;
    // A prefix match is what you meant; a substring match is a long shot.
    scored.push({ ...r, rank: at === 0 ? 0 : 1, at });
  }
  scored.sort((a, b) => a.rank - b.rank || a.at - b.at || a.name.localeCompare(b.name));
  return scored.slice(0, limit).map(({ rank: _r, at: _a, ...row }) => row);
}
