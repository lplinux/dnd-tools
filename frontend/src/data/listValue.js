/**
 * data/listValue.js
 *
 * A comma-separated string treated as a list.
 *
 * Two fields store one — an item's weapon properties and a spell level's
 * names — and both are now edited as chips. The storage format stays a
 * string, because it is what the database column holds and what every
 * import, export and print path already reads; only the editor changed.
 */

/** "Light, Finesse" → ["Light", "Finesse"]. Blanks dropped. */
export function splitList(value) {
  return String(value ?? '').split(',').map((p) => p.trim()).filter(Boolean);
}

/** The inverse, with one canonical separator. */
export function joinList(list) {
  return (list ?? []).map((p) => String(p).trim()).filter(Boolean).join(', ');
}

/**
 * Drop the FIRST entry matching `name`, not every one.
 *
 * Removing by value would otherwise take duplicates with it. A level holding
 * the same spell twice is a mistake rather than a feature, but clicking one
 * chip's × should still remove one chip.
 */
export function removeOne(list, name) {
  const i = (list ?? []).findIndex((p) => p === name);
  if (i === -1) return list ?? [];
  return [...list.slice(0, i), ...list.slice(i + 1)];
}
