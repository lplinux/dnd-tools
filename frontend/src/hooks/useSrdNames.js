/**
 * hooks/useSrdNames.js
 *
 * The names of an SRD resource, for an autocomplete list.
 *
 * `loadEntries` already caches per resource and fails open to null when the
 * API is slow or unreachable, so this is a thin wrapper that turns that into
 * a plain array — an autocomplete with no options is a field that behaves
 * exactly as it did before, which is the right way for this to fail.
 */
import { useEffect, useState } from 'react';

import { loadEntries, namesAtLevel } from '@/api/srd';

/**
 * `level` narrows the list to one spell level — 0 for cantrips. A scalar, not
 * an options object, so it can be an effect dependency without re-fetching on
 * every render. Ten rows asking for ten levels still make ONE request: the
 * index is cached per resource and the filtering is local.
 */
export function useSrdNames(resource, level = null) {
  const [names, setNames] = useState([]);

  useEffect(() => {
    if (!resource) { setNames([]); return undefined; }
    let alive = true;
    loadEntries(resource)
      .then((e) => { if (alive) setNames(namesAtLevel(e, level)); })
      .catch(() => { /* offline — the field just has no suggestions */ });
    return () => { alive = false; };
  }, [resource, level]);

  return names;
}
