/**
 * pages/NpcSheet/hp.js
 *
 * The HP arithmetic, lifted out of the sheet so it can be tested without
 * mounting a thousand-line component.
 *
 * Four fields back one readout — `hp`, `maxHp`, `tempHp`, `tempMaxHp` — and
 * they are all free text, because a sheet in play gets "+12" and "-4" typed
 * into it as often as a number. Every rule below exists because one of those
 * strings can be blank, signed, or not a number at all.
 */

/**
 * Lenient parse: "12", " 12 ", "+12" and "-4" all read sensibly, and anything
 * unparseable is 0 rather than NaN leaking into a comparison and colouring the
 * readout on nonsense.
 */
export const num = (v) => {
  const n = parseInt(String(v ?? '').trim(), 10);
  return Number.isFinite(n) ? n : 0;
};

const blank = (v) => String(v ?? '').trim() === '';

/** What the sheet shows on the right: the maximum including any temporary one. */
export const effectiveMax = (f) => num(f?.maxHp) + num(f?.tempMaxHp);

/**
 * Current HP pulled down to the effective maximum, or `null` when there is
 * nothing to do.
 *
 * Only ever downward, and only when BOTH values are actually set: `num('')` is
 * 0, so a blank maximum would otherwise clamp current to 0 the moment you
 * tabbed past it. Blank-means-unset is the common case, not an edge — the SRD
 * monster importer fills `hp` and leaves `max_hp` empty on every import.
 */
export function clampedHp(f) {
  if (blank(f?.maxHp) || blank(f?.hp)) return null;
  const max = effectiveMax(f);
  return num(f.hp) > max ? String(max) : null;
}

/** Is any temporary value in play? Negative temp max counts. */
export const hasTemp = (f) => num(f?.tempHp) !== 0 || num(f?.tempMaxHp) !== 0;

/**
 * Would "clear HP" change anything? Hidden when it would not, so the control
 * never reads as armed on a character who is already untouched.
 *
 * Compared as trimmed text rather than as numbers so that "20" against a
 * maximum of "20" counts as full while a blank current does not — blank is
 * unset, not full, and the button is how you would set it.
 */
export function canClearHp(f) {
  if (blank(f?.maxHp)) return false;             // nothing to heal TO
  if (hasTemp(f)) return true;
  return String(f?.hp ?? '').trim() !== String(f.maxHp).trim();
}

/**
 * Back to full: every temporary value dropped, current set to the maximum.
 *
 * `maxHp`, not `effectiveMax` — the temporary maximum is one of the things
 * being cleared, so honouring it would be setting HP from a value that does
 * not exist a line later.
 */
export function clearedHp(f) {
  return { hp: String(f?.maxHp ?? '').trim(), tempHp: '', tempMaxHp: '' };
}
