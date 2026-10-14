/**
 * pages/Diary/searchEntries.js
 *
 * Filtering for the entry lists — the diary's and the journal's, which share
 * their rendering and now share this.
 *
 * Deliberately dumb: substring, case- and accent-insensitive, every term has
 * to appear somewhere in the entry. No ranking, no fuzzy matching, no stemming.
 * A campaign's notes number in the dozens, not the thousands, and someone
 * typing "letter vault" wants the entry containing both words, in any order and
 * in any field. Anything cleverer would mostly be a way of hiding a note that
 * actually does match.
 *
 * Accent folding matters more than it looks here: these are fantasy notes full
 * of names like Buldamar, Théa, Grathul — and a Spanish-speaking table types
 * them without the accents about half the time.
 */

/** Lowercased and stripped of diacritics, so "thea" finds "Théa". */
export function fold(v) {
  return String(v ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * `fields` are keys on the entry, or functions of it — the journal's author is
 * a character name falling back to a username, which is not a column.
 */
export function entryText(entry, fields) {
  return fields
    .map((f) => (typeof f === 'function' ? f(entry) : entry?.[f]))
    .filter((v) => v != null && v !== '')
    .map(fold)
    .join(' \u0000 ');          // a separator no search term can span
}

/**
 * Every whitespace-separated term must appear. An empty or whitespace-only
 * query matches everything, so the caller can hand the box's raw value over
 * without guarding it.
 */
export function searchEntries(entries, query, fields) {
  const terms = fold(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return entries;
  return (entries ?? []).filter((e) => {
    const hay = entryText(e, fields);
    return terms.every((t) => hay.includes(t));
  });
}
