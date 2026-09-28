/**
 * components/graph/ordering.js
 *
 * Crossing-reduction primitives shared by the two relationship graphs
 * (ManageCampaigns CharTreeTab and PcSheet RelGraph). Pure functions, no DOM.
 *
 * The graphs keep their readable structure (family tiers, social fans, NPC row);
 * these helpers only reorder items *within* a row/axis so connected nodes sit
 * near each other, which removes most edge crossings without changing the
 * overall shape. Ordering is chosen to minimise a 1-D crossing count and is
 * guarded so it can never come out worse than the input order.
 */

/** Median of a numeric array (0 for empty). */
export function median(xs) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Count edge-crossing pairs when every node is projected onto one axis: two
 * edges cross when their endpoint intervals strictly interleave. Edges with an
 * endpoint missing from `posOf` are ignored.
 *
 * @param {Array<[any, any]>} edges  pairs of node ids
 * @param {Map<any, number>}  posOf  id → axis position
 */
export function countCrossings(edges, posOf) {
  const segs = [];
  for (const [a, b] of edges) {
    const pa = posOf.get(a);
    const pb = posOf.get(b);
    if (pa == null || pb == null || pa === pb) continue;
    segs.push(pa < pb ? [pa, pb] : [pb, pa]);
  }
  let crossings = 0;
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const [a1, a2] = segs[i];
      const [b1, b2] = segs[j];
      if ((a1 < b1 && b1 < a2 && a2 < b2) || (b1 < a1 && a1 < b2 && b2 < a2)) crossings++;
    }
  }
  return crossings;
}

const crossingsOfOrder = (order, edges) =>
  countCrossings(edges, new Map(order.map((id, i) => [id, i])));

/**
 * Barycenter seed: repeatedly repositions each id by the median index of its
 * neighbours. Good starting point for local search (but not optimal alone — it
 * can oscillate — hence the guard in minCrossingOrder).
 */
export function barycenterOrder(ids, neighbors, iters = 12) {
  let order = [...ids];
  for (let k = 0; k < iters; k++) {
    const idx = new Map(order.map((id, i) => [id, i]));
    const key = new Map(
      order.map((id, i) => {
        const ns = (neighbors.get(id) || []).map((n) => idx.get(n)).filter((v) => v != null);
        return [id, ns.length ? median(ns) : i];
      }),
    );
    const next = [...order].sort((a, b) => (key.get(a) - key.get(b)) || (idx.get(a) - idx.get(b)));
    if (next.every((id, i) => id === order[i])) break;
    order = next;
  }
  return order;
}

/**
 * Arrange items so the heaviest sit at the two outer ends and the lightest in
 * the middle. In an ego fan, nodes that have their own children (which orbit
 * outward) get the roomy edge slots instead of the crowded centre, so their
 * orbits stop overlapping neighbours.
 *
 * @param {Array}            items
 * @param {(item)=>number}   weightOf
 */
export function arrangeAtExtremes(items, weightOf) {
  const sorted = [...items].sort((a, b) => weightOf(b) - weightOf(a));
  const res = new Array(sorted.length);
  let lo = 0;
  let hi = sorted.length - 1;
  let k = 0;
  while (lo <= hi) {
    res[lo] = sorted[k];
    lo += 1; k += 1;
    if (lo <= hi) { res[hi] = sorted[k]; hi -= 1; k += 1; }
  }
  return res;
}

function* permutations(arr) {
  if (arr.length <= 1) { yield arr; return; }
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const p of permutations(rest)) yield [arr[i], ...p];
  }
}

/** Adjacent-swap hill climbing from a given start order. */
function localSearch(start, edges) {
  let order = [...start];
  let cur = crossingsOfOrder(order, edges);
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < order.length - 1; i++) {
      const swapped = [...order];
      [swapped[i], swapped[i + 1]] = [swapped[i + 1], swapped[i]];
      const c = crossingsOfOrder(swapped, edges);
      if (c < cur) { order = swapped; cur = c; improved = true; }
    }
  }
  return { order, crossings: cur };
}

const BRUTE_MAX = 8;

/**
 * Reorder `ids` along one axis to minimise edge crossings. Exhaustive for small
 * sets (≤ 8), barycenter-seeded local search above that. The result is never
 * worse than the input order, and ties keep the input order (no needless churn).
 *
 * @param {Array}             ids        items to order (e.g. player ids)
 * @param {Array<[any, any]>} edges      pairs of ids that should sit near each other
 * @param {Map<any, any[]>}   [neighbors] adjacency for the local-search seed
 * @returns {Array} the crossing-reduced order
 */
export function minCrossingOrder(ids, edges, neighbors = null) {
  if (ids.length < 3 || edges.length === 0) return [...ids];

  const inputCrossings = crossingsOfOrder(ids, edges);
  let best = [...ids];
  let bestC = inputCrossings;

  if (ids.length <= BRUTE_MAX) {
    for (const p of permutations(ids)) {
      const c = crossingsOfOrder(p, edges);
      if (c < bestC) { bestC = c; best = p; }
    }
  } else {
    const seeds = [ids];
    if (neighbors) seeds.push(barycenterOrder(ids, neighbors));
    for (const seed of seeds) {
      const { order, crossings } = localSearch(seed, edges);
      if (crossings < bestC) { bestC = crossings; best = order; }
    }
  }
  return best;
}
