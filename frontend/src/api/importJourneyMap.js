/**
 * api/importJourneyMap.js
 *
 * Import a journey-map export bundle into an EXISTING campaign. Extracted from the
 * old per-module importer so the central Manage-Campaigns importer can reuse it.
 * Creates a new map, reuses campaign locations by name (case-insensitive) or creates
 * them, then re-creates placed locations, distances and paths (remapping location ids).
 * Returns the new map row.
 */

import { campaignsApi } from './campaigns';
import { journeyMapsApi } from './journeyMaps';
import { parseWaypoints } from '@/components/map/geometry';

export async function importJourneyMap(campaignId, bundle) {
  if (!campaignId) throw new Error('Select a campaign first');
  if (bundle?.type !== 'journey-map') throw new Error('Not a journey-map export file');
  const { map: meta, locations = [], distances = [], paths = [], map_image } = bundle;

  const newMap = await journeyMapsApi.create(campaignId, {
    name: meta?.name || 'Map', description: meta?.description || '',
  });
  if (map_image) {
    try { await journeyMapsApi.saveImage(newMap.id, { image: map_image }); } catch { /* non-fatal */ }
  }

  // Reuse existing campaign locations by name; create the missing ones.
  const existing = await campaignsApi.listLocations(campaignId).catch(() => []);
  const byName = new Map((existing || []).map((l) => [String(l.name).toLowerCase(), l.id]));
  const locIdMap = {};
  for (const l of locations) {
    const key = String(l.name || '').toLowerCase();
    let campLocId = byName.get(key);
    if (campLocId == null) {
      try {
        const c = await campaignsApi.addLocation(campaignId, { name: l.name, description: l.description || '' });
        campLocId = c.id;
      } catch {
        const refetched = await campaignsApi.listLocations(campaignId).catch(() => []);
        campLocId = (refetched || []).find((x) => String(x.name).toLowerCase() === key)?.id;
        if (campLocId == null) continue;
      }
      byName.set(key, campLocId);
    }
    const mapLoc = await journeyMapsApi.addLocation(newMap.id, {
      campaign_location_id: campLocId, name: l.name, x: l.x, y: l.y,
      polygon: l.polygon || null, icon_scale: l.icon_scale ?? 1,
    });
    locIdMap[l.id] = mapLoc.id;
  }

  for (const d of distances) {
    const fl = locIdMap[d.from_loc_id]; const tl = locIdMap[d.to_loc_id];
    if (!fl || !tl) continue;
    await journeyMapsApi.saveDistance(newMap.id, { from_loc_id: fl, to_loc_id: tl, distance_miles: d.distance_miles });
  }

  for (const p of paths) {
    const wpts = parseWaypoints(p).map((w) => ({ ...w, locId: w.locId ? (locIdMap[w.locId] || null) : null }));
    await journeyMapsApi.addPath(newMap.id, {
      name: p.name, notes: p.notes, waypoints: wpts,
      kind: p.kind || 'route', route_type: p.route_type || 'road',
      label_x: p.label_x ?? null, label_y: p.label_y ?? null,
    });
  }
  return newMap;
}
