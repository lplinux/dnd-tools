/**
 * The road network: journey-map distances are shortest paths over the drawn
 * routes, not straight lines. This is the one piece of real algorithmic code in
 * the app (Dijkstra over waypoint segments), and its inputs are fiddly —
 * waypoints may be JSON strings, a segment without a distance is not an edge at
 * all, and only `kind: 'route'` paths form the graph.
 */

import { describe, it, expect } from 'vitest';
import {
  fmtTime, fmtTravelTime, travelTimes, sameId, parseWaypoints, segMilesOf,
  networkDistances, effectiveDistances, distanceBetween, locTier,
} from './geometry';

/** A route whose waypoints sit on pinned locations, with per-section miles. */
const route = (id, stops) => ({
  id,
  kind: 'route',
  waypoints: stops.map(([locId, segMiles], i) => ({
    x: i * 10, y: 0, locId, ...(i === 0 ? {} : { segMiles }),
  })),
});

const between = (rows, a, b) =>
  rows.find((r) => r.from_loc_id === a && r.to_loc_id === b)?.distance_miles;

describe('parseWaypoints', () => {
  it('accepts an array or the JSON string the DB returns', () => {
    expect(parseWaypoints({ waypoints: [{ x: 1 }] })).toEqual([{ x: 1 }]);
    expect(parseWaypoints({ waypoints: '[{"x":1}]' })).toEqual([{ x: 1 }]);
  });
  it('is safe on missing or empty input', () => {
    expect(parseWaypoints(null)).toEqual([]);
    expect(parseWaypoints({})).toEqual([]);
  });
});

describe('segMilesOf', () => {
  it('treats unset, empty and non-numeric as "no distance"', () => {
    expect(segMilesOf({ segMiles: 12 })).toBe(12);
    expect(segMilesOf({ segMiles: '12.5' })).toBe(12.5);
    expect(segMilesOf({})).toBeNull();
    expect(segMilesOf({ segMiles: '' })).toBeNull();
    expect(segMilesOf({ segMiles: 'abc' })).toBeNull();
    expect(segMilesOf(null)).toBeNull();
  });
});

describe('networkDistances', () => {
  it('sums the sections along a route', () => {
    // 1 --10-- 2 --5-- 3
    const rows = networkDistances([route('p1', [[1], [2, 10], [3, 5]])]);
    expect(between(rows, 1, 2)).toBe(10);
    expect(between(rows, 2, 3)).toBe(5);
    expect(between(rows, 1, 3)).toBe(15);
  });

  it('is symmetric — roads go both ways', () => {
    const rows = networkDistances([route('p1', [[1], [2, 10], [3, 5]])]);
    expect(between(rows, 3, 1)).toBe(15);
  });

  it('picks the SHORTER of two routes between the same pair', () => {
    const rows = networkDistances([
      route('long', [[1], [2, 50]]),
      route('short', [[1], [2, 8]]),
    ]);
    expect(between(rows, 1, 2)).toBe(8);
  });

  it('routes through an intermediate location when that is shorter', () => {
    // direct 1→3 is 100, but 1→2→3 is 30
    const rows = networkDistances([
      route('direct', [[1], [3, 100]]),
      route('via2', [[1], [2, 10], [3, 20]]),
    ]);
    expect(between(rows, 1, 3)).toBe(30);
  });

  it('ignores paths that are not routes — movement paths are not roads', () => {
    const movement = { ...route('m', [[1], [2, 10]]), kind: 'path' };
    expect(networkDistances([movement])).toEqual([]);
  });

  it('drops a section with no distance set, breaking the chain there', () => {
    const r = route('p1', [[1], [2, 10], [3, 5]]);
    delete r.waypoints[2].segMiles;        // the 2→3 section has no miles
    const rows = networkDistances([r]);
    expect(between(rows, 1, 2)).toBe(10);
    expect(between(rows, 1, 3)).toBeUndefined();
  });

  it('returns nothing for no paths at all', () => {
    expect(networkDistances([])).toEqual([]);
    expect(networkDistances(null)).toEqual([]);
  });
});

describe('effectiveDistances', () => {
  it('prefers a road distance over a stored one for the same pair', () => {
    const rows = effectiveDistances(
      [route('p1', [[1], [2, 10]])],
      [{ from_loc_id: 1, to_loc_id: 2, distance_miles: 999 }],
    );
    expect(between(rows, 1, 2)).toBe(10);
  });

  it('keeps a stored distance for a pair no road connects', () => {
    const rows = effectiveDistances(
      [route('p1', [[1], [2, 10]])],
      [{ from_loc_id: 7, to_loc_id: 8, distance_miles: 42 }],
    );
    expect(between(rows, 7, 8)).toBe(42);
  });
});

describe('distanceBetween', () => {
  it('finds a pair in either direction', () => {
    const d = [{ from_loc_id: 1, to_loc_id: 2, distance_miles: 12 }];
    expect(distanceBetween(1, 2, d)).toBe(12);
    expect(distanceBetween(2, 1, d)).toBe(12);
    expect(distanceBetween(1, 9, d)).toBeNull();
  });
});

describe('fmtTime vs fmtTravelTime', () => {
  it('fmtTime rolls into 24-hour days (public view)', () => {
    expect(fmtTime(0.5)).toBe('30min');
    expect(fmtTime(2)).toBe('2.0h');
    expect(fmtTime(24)).toBe('1d');
    expect(fmtTime(30)).toBe('1d6h');
  });

  it('fmtTravelTime counts only active travel hours and rounds up (editor)', () => {
    expect(fmtTravelTime(0.5)).toBe('30min');
    expect(fmtTravelTime(4)).toBe('4.0h');
    expect(fmtTravelTime(8)).toBe('1d');
    expect(fmtTravelTime(9)).toBe('2d');     // spills into a second day of walking
    expect(fmtTravelTime(24, 12)).toBe('2d');
  });

  it('travelTimes is faster by horse than on foot, and fastest flying', () => {
    const t = travelTimes(24);
    expect(t.walk).toBe('8.0h');
    expect(t.horse).toBe('3.0h');
    expect(t.fly).toBe('58min');
  });
});

describe('sameId', () => {
  it('compares across the number/string mismatch the API and routes produce', () => {
    expect(sameId(3, '3')).toBe(true);
    expect(sameId('3', 3)).toBe(true);
    expect(sameId(3, 4)).toBe(false);
    expect(sameId(null, undefined)).toBe(false);
  });
});

describe('locTier', () => {
  it('buckets a size_type into the three tiers the proximity filter uses', () => {
    expect(locTier('huge')).toBe('big');
    expect(locTier('big')).toBe('big');
    expect(locTier('medium')).toBe('med');
    expect(locTier('small')).toBe('med');
  });

  it('is case-insensitive and falls back to "other" for anything unknown', () => {
    expect(locTier('HUGE')).toBe('big');
    expect(locTier('city')).toBe('other');   // not one of the size_type values
    expect(locTier('')).toBe('other');
    expect(locTier(undefined)).toBe('other');
    expect(locTier(null)).toBe('other');
  });
});
