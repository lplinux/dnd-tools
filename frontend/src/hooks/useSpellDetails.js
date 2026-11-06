/**
 * hooks/useSpellDetails.js
 *
 * The 2024 SRD details for a list of spell names, for the sheet's spell list.
 *
 * One request per spell, but each only once: `lookupRaw` caches per session,
 * misses included, so reopening a sheet costs nothing. At most four in flight,
 * so a twenty-spell caster does not open twenty connections at once to a free
 * public API.
 *
 * Returns a Map of name → { status, spell }:
 *   'loading' — not answered yet
 *   'ok'      — `spell` is the shape from data/spellDetails.js
 *   'missing' — not in SRD 5.2 (a PHB-only spell, homebrew, or a typo), or
 *               the API was unreachable; the sheet shows the name alone
 */
import { useEffect, useMemo, useState } from 'react';

import { lookupRaw } from '@/api/srd';
import { spellFromSrd } from '@/data/spellDetails';

const IN_FLIGHT = 4;

export function useSpellDetails(names) {
  // A stable key, so a re-render with the same spells does not refetch.
  const key = useMemo(() => [...new Set(names.map((n) => n.trim()).filter(Boolean))].sort().join('\n'), [names]);
  const [details, setDetails] = useState(() => new Map());

  useEffect(() => {
    const wanted = key ? key.split('\n') : [];
    let alive = true;
    setDetails(new Map(wanted.map((n) => [n, { status: 'loading', spell: null }])));

    let next = 0;
    async function worker() {
      while (alive && next < wanted.length) {
        const name = wanted[next++];
        const spell = spellFromSrd(await lookupRaw('spells', name));
        if (!alive) return;
        setDetails((prev) => new Map(prev).set(name, spell
          ? { status: 'ok', spell }
          : { status: 'missing', spell: null }));
      }
    }
    Promise.all(Array.from({ length: Math.min(IN_FLIGHT, wanted.length) }, worker));
    return () => { alive = false; };
  }, [key]);

  return details;
}
