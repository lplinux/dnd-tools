/**
 * pages/NpcSheet/replaceOnFocus.js
 *
 * The replace-on-focus behaviour as a pure reducer, so the rules can be tested
 * as sequences of events without mounting anything. `StatInput.jsx` is a thin
 * wrapper over this.
 *
 * Each step returns the next state and, optionally, a value to commit upward.
 * `commit === undefined` means "change nothing", which is distinct from
 * `commit === ''` — "the author deliberately emptied this".
 */

export const IDLE = { draft: null, touched: false };

/** Focusing empties the box; the value being replaced becomes the hint. */
export const focus = () => ({ state: { draft: '', touched: false } });

/**
 * Every keystroke commits EXCEPT the empty intermediate.
 *
 * Clearing a box on the way to a new number must not read as a deliberate
 * zero: an ability score would snap to 10 and flash its modifier, and current
 * HP would momentarily be none. The empty is held locally and resolved at blur,
 * where there is enough information to tell "cleared it" from "about to type".
 */
export const input = (v) => ({
  state: { draft: v, touched: true },
  ...(v === '' ? {} : { commit: v }),
});

/**
 * Blur resolves the empty box.
 *
 * Untouched — focused and left again — commits nothing, so the value simply
 * reappears: focusing a field is not a decision. Touched and empty IS a
 * decision, and it is honoured.
 */
export const blur = ({ draft, touched }) => ({
  state: IDLE,
  ...(touched && draft === '' ? { commit: '' } : {}),
});

/** What the box shows: the draft while editing, otherwise the committed value. */
export const shown = ({ draft }, value) => (draft !== null ? draft : String(value ?? ''));

/**
 * The grey hint: the value being replaced while editing, the field's own hint
 * when there is nothing to replace or nothing being edited.
 */
export function hint({ draft }, value, placeholder = '') {
  const committed = String(value ?? '');
  return draft !== null && committed !== '' ? committed : placeholder;
}
