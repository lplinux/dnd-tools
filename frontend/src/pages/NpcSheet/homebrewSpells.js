/**
 * pages/NpcSheet/homebrewSpells.js
 *
 * The homebrew spells a stat sheet may offer, by name.
 *
 * Only when the sheet is a campaign's — a character's or an NPC's — does it
 * know of any: the frame passes `?campaign=`, and the server answers with
 * what that campaign uses, revealed entries only for a player. The public
 * /npc-sheet has no campaign and so no homebrew, which is right: a stranger's
 * stat block has no business offering this DM's spells.
 *
 * Names are the link. A sheet stores spell NAMES, so a sheet copied to a
 * table without this homebrew keeps the name and simply has no card for it.
 */
import { createContext, useContext, useEffect, useState } from 'react';

import { homebrewApi } from '@/api/homebrew';
import { spellFromHomebrew } from '@/data/homebrew';

const EMPTY = new Map();

export const HomebrewSpells = createContext(EMPTY);

/** name → spell (SpellCard's shape), for this campaign; empty without one. */
export function useCampaignHomebrewSpells(campaignId) {
  const [spells, setSpells] = useState(EMPTY);
  useEffect(() => {
    if (!campaignId) { setSpells(EMPTY); return undefined; }
    let alive = true;
    homebrewApi.forCampaign(campaignId)
      .then((rows) => {
        if (!alive) return;
        setSpells(new Map((rows ?? []).filter((e) => e.kind === 'spell')
          .map((e) => [e.name, spellFromHomebrew(e)])));
      })
      // No homebrew is a working sheet; a failed fetch must not break it.
      .catch(() => { if (alive) setSpells(EMPTY); });
    return () => { alive = false; };
  }, [campaignId]);
  return spells;
}

export const useHomebrewSpells = () => useContext(HomebrewSpells);
