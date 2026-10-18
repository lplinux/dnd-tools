/**
 * test/locationMaps.test.js
 *
 * The globe beside a location in Manage Campaigns — "this place is on a map,
 * open it".
 *
 * Three ways a location can have one, and they are not equally good answers,
 * so the order matters: a map OF the place beats a map the place merely
 * appears on. Getting that backwards sends a DM to the world map when they
 * asked for the city.
 *
 * Also exercised live against a scratch Postgres, including the case where a
 * location has both.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(path.join(root, 'app.js'), 'utf8');

const locationsRoute = (() => {
  const at = source.indexOf("app.get('/api/campaigns/:campaignId/locations'");
  expect(at).toBeGreaterThan(-1);
  return source.slice(at, source.indexOf('\n});', at));
})();

describe('which map a location belongs to', () => {
  it('prefers a map scoped TO it over one it is pinned on', () => {
    /*
     * Asserts the RANK each arm carries, not the order they are written in.
     * The first version of this test compared `indexOf` positions and
     * happily passed when `1 AS rank` was changed to `9` — the text order
     * was untouched while the behaviour had inverted, which is exactly the
     * regression it exists to catch.
     */
    const lateral = locationsRoute.slice(
      locationsRoute.indexOf('LEFT JOIN LATERAL'),
      locationsRoute.indexOf('ORDER BY rank'),
    );
    const arms = lateral.split(/UNION ALL/);
    expect(arms, 'expected three ways a location can have a map').toHaveLength(3);

    const rankOf = (arm) => Number(arm.match(/,\s*(\d+)(?:\s+AS rank)?\s*\n/)?.[1]);
    const own = arms.find((a) => a.includes('jm.scope_location_id = l.id'));
    const linked = arms.find((a) => a.includes('jm.id = jml.linked_map_id'));
    const pinned = arms.find((a) => a.includes('jm.id = jml.map_id'));
    expect(own && linked && pinned, 'an arm is missing').toBeTruthy();

    // Its own map, then its own map via a region pin, then merely where it
    // appears. Sending a DM to the world map when they asked for the city
    // is the failure this ordering prevents.
    expect(rankOf(own), "a location's own map must rank first").toBe(1);
    expect(rankOf(linked)).toBe(2);
    expect(rankOf(pinned)).toBe(3);
    expect(rankOf(own)).toBeLessThan(rankOf(pinned));
    expect(locationsRoute).toMatch(/ORDER BY rank, id\s*\n?\s*LIMIT 1/);
  });

  it('is one LATERAL, not a query per row', () => {
    // A campaign runs to a hundred locations and this list loads on every
    // visit to the tab.
    expect(locationsRoute).toMatch(/LEFT JOIN LATERAL/);
  });

  it('stays inside the campaign on every arm', () => {
    // journey_map_locations has no campaign_id of its own, so each arm has
    // to reach through to the map to stay scoped.
    const arms = locationsRoute.match(/jm\.campaign_id = l\.campaign_id/g) ?? [];
    expect(arms.length).toBe(3);
  });

  it('is not sent to players', () => {
    // A DM map has no share token, so the link would be an affordance that
    // cannot work. The player branch is the plain SELECT it always was.
    const player = locationsRoute.slice(locationsRoute.indexOf("      : 'SELECT"));
    expect(player).toMatch(/SELECT \* FROM campaign_locations/);
    expect(player).not.toMatch(/map_id/);
  });
});

describe('the UI only offers a link that works', () => {
  const tab = readFileSync(
    path.join(root, 'frontend/src/pages/ManageCampaigns/tabs/LocationsTab.jsx'), 'utf8');

  it('renders the globe only when there is a map', () => {
    expect(tab).toMatch(/\{loc\.map_id && \(/);
  });

  it('names the map in the tooltip', () => {
    expect(tab).toMatch(/Open "\$\{loc\.map_name\}"|Open .\$\{loc\.map_name\}./);
  });

  it('does not open the card as well', () => {
    // The cell around it opens the card, so the globe has to stop the event.
    const btn = tab.slice(tab.indexOf('{loc.map_id && ('), tab.indexOf('</button>', tab.indexOf('{loc.map_id && (')));
    expect(btn).toMatch(/e\.stopPropagation\(\)/);
  });

  it('deep-links with both ids', () => {
    expect(tab).toMatch(/\/journey-map\?campaign=\$\{campaignId\}&map=\$\{loc\.map_id\}/);
  });
});

describe('the journey map page honours the link', () => {
  const page = readFileSync(
    path.join(root, 'frontend/src/pages/JourneyMap/index.jsx'), 'utf8');

  it('reads both params', () => {
    expect(page).toMatch(/searchParams\.get\('campaign'\)/);
    expect(page).toMatch(/searchParams\.get\('map'\)/);
  });

  it('applies them once, not on every map change', () => {
    // Without the guard this re-runs as `maps` settles and drags the DM back
    // to the URL's map every time they pick a different one.
    expect(page).toMatch(/deepLinked\.current/);
  });

  it('selects the map from the list selectCampaign returns', () => {
    // React state is not readable yet at that point, so the list has to be
    // passed through rather than read back.
    expect(page).toMatch(/const list = await jm\.selectCampaign\(/);
    expect(page).toMatch(/jm\.selectMap\(parseInt\(map, 10\), list\)/);
    expect(readFileSync(path.join(root, 'frontend/src/hooks/useJourneyMap.js'), 'utf8'))
      .toMatch(/return mapsData;/);
  });
});

describe('a location card lists who is standing there', () => {
  const popover = readFileSync(
    path.join(root, 'frontend/src/components/CrossLinkPopover.jsx'), 'utf8');

  it('renders the people when the caller supplies them', () => {
    expect(popover).toMatch(/target\.kind === 'location' && !!target\.here\?\.length/);
  });

  it('comes from the list already in memory, not a fetch', () => {
    // Both callers hold every NPC anyway; a request per card would be a
    // round trip to answer a question the page can already answer.
    const tab = readFileSync(
      path.join(root, 'frontend/src/pages/ManageCampaigns/tabs/LocationsTab.jsx'), 'utf8');
    expect(tab).toMatch(/here: npcs\.filter\(/);
  });

  it('and a player\'s copy cannot leak an unmet NPC', () => {
    // Their `npcs` is already the revealed-only list the server sent.
    const links = readFileSync(
      path.join(root, 'frontend/src/pages/PcSheet/tabs/CampaignLinksTab.jsx'), 'utf8');
    expect(links).toMatch(/here: npcs\.filter\(/);
  });
});
