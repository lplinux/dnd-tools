/**
 * hooks/useCrossLinks.js
 *
 * The campaign's `[[Name]]` targets, fetched once and shared by everything
 * that renders or writes prose.
 *
 * Two shapes come out of one fetch because two different things need it: the
 * raw lists drive the autocomplete, and the index drives the renderer. Both
 * fail open to empty — a resolver that cannot load should leave links as plain
 * text, not break the page they are written on.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';

import { campaignsApi } from '@/api/campaigns';
import { buildIndex } from '@/data/crossLinks';

const EMPTY = { locations: [], npcs: [] };

export function useCrossLinks(campaignId) {
  const [targets, setTargets] = useState(EMPTY);

  const load = useCallback(async () => {
    if (!campaignId) { setTargets(EMPTY); return; }
    // Deliberately swallowed: prose must render whatever happens here.
    const d = await campaignsApi.listLinkTargets(campaignId).catch(() => null);
    setTargets({
      locations: Array.isArray(d?.locations) ? d.locations : [],
      npcs: Array.isArray(d?.npcs) ? d.npcs : [],
    });
  }, [campaignId]);

  useEffect(() => { load(); }, [load]);

  const index = useMemo(() => buildIndex(targets), [targets]);

  return { targets, index, reload: load };
}
