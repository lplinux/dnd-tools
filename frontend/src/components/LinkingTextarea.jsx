/**
 * components/LinkingTextarea.jsx
 *
 * A textarea that offers the campaign's locations and NPCs when you type `[[`.
 *
 * A drop-in for the two markdown textareas in the app — the Diary's entry body
 * and the Campaign Journal's — so the behaviour cannot drift between them.
 *
 * The dropdown is anchored to the BOTTOM OF THE FIELD, not to the caret.
 * Caret-anchoring inside a textarea means cloning its computed styles into a
 * hidden mirror div and measuring where the text ends, which is a hundred
 * fiddly lines that must survive three themes and a scrolled field. The field
 * is never tall enough for the difference to matter much, and this can be
 * upgraded later without touching anything else.
 *
 * Keyboard handling follows `SrdCombobox`, including its use of
 * `onPointerDown` with `preventDefault` rather than `onMouseDown` — that file
 * records it as a real touch bug, and this list has the same problem: the
 * field must not lose focus before the pick is applied.
 */
import { useRef, useState } from 'react';

import { activeToken, insertLink, suggest } from '@/data/wikiLinkInput';

export default function LinkingTextarea({
  value, onChange, targets, className = '', ...rest
}) {
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(0);
  const [options, setOptions] = useState([]);

  /** Re-read the caret and decide whether a list is wanted. */
  function refresh(text, caret) {
    const token = activeToken(text, caret);
    if (!token) { setOpen(false); return; }
    const found = suggest(token.query, targets ?? {});
    setOptions(found);
    setFocused(0);
    setOpen(found.length > 0);
  }

  function handleChange(e) {
    onChange(e.target.value);
    refresh(e.target.value, e.target.selectionStart);
  }

  /** The caret can move without the text changing — arrows, a click. */
  function handleSelect(e) {
    if (!open) return;
    refresh(e.target.value, e.target.selectionStart);
  }

  function pick(opt) {
    const el = ref.current;
    const { value: next, caret } = insertLink(value, el?.selectionStart ?? 0, opt.name);
    onChange(next);
    setOpen(false);
    // Put the caret back where the insertion left it, after React commits.
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  }

  function handleKeyDown(e) {
    if (!open || !options.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault(); setFocused((i) => (i + 1) % options.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault(); setFocused((i) => (i - 1 + options.length) % options.length);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      // Enter would otherwise insert a newline mid-link.
      e.preventDefault(); pick(options[focused]);
    } else if (e.key === 'Escape') {
      // Shut the list without shutting the modal the field sits in.
      e.preventDefault(); e.stopPropagation(); setOpen(false);
    }
  }

  return (
    <div className="relative">
      <textarea
        {...rest}
        ref={ref}
        className={className}
        value={value}
        onChange={handleChange}
        onSelect={handleSelect}
        onKeyDown={handleKeyDown}
        onFocus={() => setFocused(0)}
        // A click on an option fires after blur, so the list has to outlive it
        // briefly. The pointer handler below cancels the blur instead.
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />

      {open && (
        <ul
          role="listbox"
          aria-label="Link to a location or NPC"
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-56 overflow-y-auto
                     bg-surface2 border border-[var(--gold-dim)] rounded-sm shadow-lg"
        >
          {options.map((o, i) => (
            <li key={`${o.kind}:${o.id}`}>
              <button
                type="button"
                role="option"
                aria-selected={i === focused}
                // Not onMouseDown: on touch it fires before focus moves and the
                // pick lands on a stale caret. preventDefault keeps the
                // textarea focused so selectionStart is still valid.
                onPointerDown={(e) => { e.preventDefault(); pick(o); }}
                onMouseEnter={() => setFocused(i)}
                className={[
                  'w-full text-left px-2 py-1.5 text-sm flex items-center gap-2',
                  i === focused ? 'bg-surface3 text-gold' : 'text-text hover:bg-surface3',
                ].join(' ')}
              >
                <span aria-hidden="true">{o.kind === 'npc' ? '🧟' : '📍'}</span>
                <span className="truncate">{o.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
