/**
 * pages/NpcSheet/TagInput.jsx
 *
 * Autocomplete tag-chip input (.tag-field/.tag-box). Type to filter options,
 * select with keyboard or click, remove chips with × or Backspace.
 * Original parchment design (see npc-sheet.css).
 *
 * Props: options string[], values string[], onAdd(v), onRemove(v), placeholder,
 *        srdResource ('conditions' | 'damage-types') — when set, chips that exist
 *        in the 2024 SRD gain an ⓘ lookup button.
 */

import { useRef, useState } from 'react';
import SrdInfo, { useSrdIndex, srdHasEntry } from '@/components/SrdInfo';

export default function TagInput({
  options = [], values = [], onAdd, onRemove,
  placeholder = 'Type to search…', srdResource = null,
}) {
  // One indexed request per resource per session — not one per chip.
  const srdSlugs = useSrdIndex(srdResource);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [focusIdx, setFocusIdx] = useState(-1);
  const inputRef = useRef(null);

  const filtered = options.filter(
    (o) => !values.includes(o) && o.toLowerCase().includes(query.toLowerCase()),
  );

  function handleAdd(v) {
    onAdd(v);
    setQuery('');
    setOpen(false);
    setFocusIdx(-1);
    inputRef.current?.focus();
  }

  function handleKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (focusIdx >= 0 && filtered[focusIdx]) handleAdd(filtered[focusIdx]);
      else if (query.trim()) handleAdd(query.trim());
    } else if (e.key === 'Escape') {
      setOpen(false);
    } else if (e.key === 'Backspace' && !query && values.length) {
      onRemove(values[values.length - 1]);
    }
  }

  return (
    <div className="tag-field">
      <div className="tag-box" onClick={() => inputRef.current?.focus()}>
        {values.map((v) => (
          <span key={v} className="tag">
            {v}
            {srdResource && srdHasEntry(srdSlugs, v) && (
              <SrdInfo resource={srdResource} name={v} />
            )}
            <button
              type="button"
              className="tag-x"
              onMouseDown={(e) => { e.preventDefault(); onRemove(v); }}
              aria-label={`Remove ${v}`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          className="tag-input"
          value={query}
          placeholder={values.length ? '' : placeholder}
          autoComplete="off"
          onChange={(e) => { setQuery(e.target.value); setOpen(!!e.target.value.trim()); setFocusIdx(-1); }}
          onKeyDown={handleKeyDown}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onFocus={() => { if (query.trim()) setOpen(true); }}
        />
      </div>

      {open && filtered.length > 0 && (
        <div className="tag-dropdown open">
          {filtered.map((o, i) => (
            <div
              key={o}
              className={`tag-opt${i === focusIdx ? ' focused' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); handleAdd(o); }}
            >
              {o}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
