/**
 * pages/NpcSheet/StatInput.jsx
 *
 * A stat box you overwrite rather than edit.
 *
 * The sheet's small numbers — AC, speed, current HP, the six ability scores —
 * are almost never *amended*. A hit, a buff, a rolled score: the new value
 * replaces the old one outright. With an ordinary input that means
 * select-all-then-type every time, and on a phone it means a caret landing
 * somewhere in the middle of "18" and producing "118".
 *
 * So focusing empties the box and demotes the old value to the grey
 * placeholder — still readable while you type the replacement over it. The
 * rules live in ./replaceOnFocus as a pure reducer; this is the wiring.
 *
 * (That file is deliberately NOT named statInput.js: on a case-insensitive
 * filesystem it would be the same path as this one, and `./StatInput` would
 * resolve to it. Vitest tolerated that; the Rollup build did not.)
 */
import { useState } from 'react';
import { IDLE, focus, input, blur, shown, hint } from './replaceOnFocus';

export default function StatInput({
  value, onChange, onBlur, placeholder = '', ...rest
}) {
  const [edit, setEdit] = useState(IDLE);

  /** Apply one reducer step, propagating anything it decided to commit. */
  const step = (r) => {
    setEdit(r.state);
    if ('commit' in r) onChange(r.commit);
  };

  return (
    <input
      {...rest}
      value={shown(edit, value)}
      placeholder={hint(edit, value, placeholder)}
      onFocus={() => step(focus())}
      onChange={(e) => step(input(e.target.value))}
      onBlur={(e) => { step(blur(edit)); onBlur?.(e); }}
    />
  );
}
