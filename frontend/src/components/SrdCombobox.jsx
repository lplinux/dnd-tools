/**
 * components/SrdCombobox.jsx
 *
 * Single-value counterpart to NpcSheet/TagInput: type-to-filter suggestions that
 * NEVER restrict what you can enter. The SRD is a subset of the 2024 PHB — an
 * Assassin rogue or a homebrew species has no SRD entry — so a hard <select>
 * would block real data. Anything you type is kept verbatim.
 *
 * Options come from either:
 *   - `options` — a caller-supplied string[] (a static list), or
 *   - `srdResource` — an SRD resource whose index is fetched once and cached.
 * Both may be set; they are merged and de-duplicated.
 *
 * `onPick(name)` fires ONLY when a suggestion is chosen, never on free typing, so
 * typing "Elf" by hand never triggers a surprise overwrite of the rest of the
 * sheet. When `onPick` is supplied it also OWNS the write — `onChange` is not
 * called for that pick — which lets a caller append to a list, expand into
 * several fields, or ignore the value entirely (a search box that fills a sheet
 * and keeps itself empty).
 *
 * Keyboard/blur behaviour mirrors TagInput so the two feel identical.
 */

import { useEffect, useRef, useState } from 'react';
import SrdInfo, { srdHasEntry } from '@/components/SrdInfo';
import { loadEntries } from '@/api/srd';

/**
 * Normalise the two accepted option forms into one:
 *   'Champion'                                   (plain string, no badge)
 *   { name, edition?, source?, key? }            (labelled)
 *
 * Ordering is the product rule, applied here so no call site has to remember it:
 * 2024 entries first, then unlabelled, then 2014 — so the current edition leads
 * and older/third-party content is available without ever being the default.
 *
 * De-duplicated by name, keeping the FIRST occurrence. Callers are expected to
 * pass their richest source first (a static official entry before a bare API
 * name), so "Champion" appears once rather than three times.
 */
function mergeOptions(options, apiNames) {
  const out = [];
  const seen = new Set();
  for (const o of [...options, ...apiNames]) {
    const opt = typeof o === 'string' ? { name: o } : o;
    if (!opt?.name) continue;
    const k = opt.name.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(opt);
  }
  const rank = (o) => (o.edition === '2024' ? 0 : o.edition === '2014' ? 2 : 1);
  return out.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

/**
 * Short provenance badge — "2014", "2014 · XGE", "2014 · Tome of Heroes".
 * Current-edition entries get none: they are the default case, and badging
 * everything would make the distinction useless.
 */
function badgeFor(opt) {
  if (!opt.edition || opt.edition === '2024') return '';
  // `book` comes from the static official list, `source.title` from an API.
  const from = opt.book && opt.book !== 'PHB 2014'
    ? opt.book
    : (opt.source?.title && opt.source.title !== '5e 2014 Rules' ? opt.source.title : '');
  return [opt.edition, from].filter(Boolean).join(' · ');
}

/** Names + slugs for a resource. `null` while loading or unavailable. */
function useSrdEntries(resource) {
  const [entries, setEntries] = useState(null);
  useEffect(() => {
    if (!resource) return undefined;
    let alive = true;
    loadEntries(resource).then((e) => { if (alive) setEntries(e); });
    return () => { alive = false; };
  }, [resource]);
  return entries;
}

export default function SrdCombobox({
  value = '',
  onChange,
  onPick,
  options = [],
  srdResource = null,
  /** Resource used for the ⓘ lookup, when it differs from the option source. */
  infoResource = null,
  placeholder = 'Type to search…',
  className = '',
  /**
   * Classes for the &lt;input&gt; itself. The component styles layout only and never
   * typography: it is dropped into slots that already style their own inputs
   * (the NPC sheet's parchment `.cs input` / `.mf input`), and imposing a font
   * here silently overrode them. Callers outside such a slot — Item Cards, on
   * the dark app theme — pass their own, e.g. FIELD_INPUT.
   */
  inputClassName = '',
  disabled = false,
}) {
  const entries = useSrdEntries(srdResource);
  const [query, setQuery] = useState(null);   // null = not editing; show `value`
  const [open, setOpen] = useState(false);
  const [focusIdx, setFocusIdx] = useState(-1);
  const inputRef = useRef(null);

  const all = mergeOptions(options, entries?.names ?? []);
  const text = query ?? value ?? '';
  const filtered = query?.trim()
    ? all.filter((o) => o.name.toLowerCase().includes(query.trim().toLowerCase()))
    : all;

  const lookupRes = infoResource ?? srdResource;
  const showInfo = !!lookupRes && !!value && srdHasEntry(entries?.slugs ?? null, value);

  // `opt` carries the full option (key, source, edition) when one was chosen, so
  // a caller can fetch detail by key rather than re-resolving the display name.
  function commit(v, picked, opt) {
    setQuery(null);
    setOpen(false);
    setFocusIdx(-1);
    if (picked && onPick) onPick(v, opt);
    else onChange?.(v);
  }

  function handleKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setFocusIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (open && focusIdx >= 0 && filtered[focusIdx]) {
        commit(filtered[focusIdx].name, true, filtered[focusIdx]);
      } else commit(text.trim(), false);
    } else if (e.key === 'Escape') {
      setQuery(null);
      setOpen(false);
    }
  }

  return (
    <div className={`srd-combo ${className}`.trim()}>
      <div className="srd-combo-row">
        <input
          ref={inputRef}
          type="text"
          className={inputClassName}
          value={text}
          placeholder={placeholder}
          autoComplete="off"
          disabled={disabled}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); setFocusIdx(-1); }}
          onKeyDown={handleKeyDown}
          onFocus={() => setOpen(true)}
          // Commit whatever was typed — losing focus must not silently discard it.
          onBlur={() => setTimeout(() => {
            if (query !== null) commit(query.trim(), false);
            setOpen(false);
          }, 150)}
        />
        {showInfo && <SrdInfo resource={lookupRes} name={value} />}
      </div>

      {open && filtered.length > 0 && (
        <div className="srd-combo-dropdown open">
          {filtered.slice(0, 50).map((o, i) => {
            const badge = badgeFor(o);
            return (
              <div
                key={o.key ?? o.name}
                className={`srd-combo-opt${i === focusIdx ? ' focused' : ''}`}
                onMouseDown={(e) => { e.preventDefault(); commit(o.name, true, o); }}
              >
                <span>{o.name}</span>
                {badge && <span className="srd-combo-badge">{badge}</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
