/**
 * pages/Sessions/filter.js
 *
 * Narrowing a session's cards by text and by state.
 *
 * Pure, so it is tested without a DOM — and the rule it encodes is easy to
 * get wrong in a tree: a card that matches must keep the cards ABOVE it, or
 * a deep hit appears at the root with no idea what it belonged to. A match
 * therefore pulls its ancestors in with it, and they are marked so the UI
 * can show them as context rather than as hits.
 */

import { sectionTree } from './constants';

/** Case- and accent-folded, the way the rest of the app searches. */
export function fold(v) {
  return String(v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** Every term must appear somewhere in the card's own text. */
export function hits(item, terms, states) {
  if (states.size && !states.has(item.state)) return false;
  if (!terms.length) return true;
  const hay = `${fold(item.title)} ${fold(item.body)}`;
  return terms.every((t) => hay.includes(t));
}

/**
 * Filter one section's tree.
 *
 * Returns the same shape `sectionTree` does, with `_context: true` on any
 * card kept only because something beneath it matched.
 */
export function filterTree(items, section, query, states) {
  const terms = fold(query).split(/\s+/).filter(Boolean);
  const tree = sectionTree(items, section);
  if (!terms.length && !states.size) return tree;

  const walk = (node) => {
    const self = hits(node, terms, states);
    // A card that matches keeps its WHOLE subtree. You searched for the
    // card; its detail is the thing you wanted to read, and filtering it
    // away would leave a beat with its "if they refuse" branch missing.
    if (self) return { ...node };
    const kids = (node.children ?? []).map(walk).filter(Boolean);
    if (!kids.length) return null;
    // Kept only because something beneath it matched. Marked, so the UI can
    // show it as the path to a hit rather than as a hit.
    return { ...node, children: kids, _context: true };
  };
  return tree.map(walk).filter(Boolean);
}

/** How many cards survive, for the section heading's count. */
export function countTree(tree) {
  return (tree ?? []).reduce((n, i) => n + 1 + countTree(i.children), 0);
}
