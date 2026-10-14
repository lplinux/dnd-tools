/**
 * data/crossLinks.js
 *
 * `[[Name]]` cross-links — the resolution rules, with no DOM and no React, so
 * every one of them can be tested directly.
 *
 * The syntax is Obsidian's, because that is where this campaign's notes are
 * written and pasting between the two should just work:
 *
 *   [[Waterdeep]]              a location or NPC of that name
 *   [[location:Waterdeep]]     forced to a kind, for when a place and a person
 *   [[npc:Waterdeep]]          share a name
 *   [[Waterdeep|the city]]     different display text
 *
 * A name that does not resolve is not an error. It renders as plain text, and
 * that is also what a player sees for a location their DM has hidden or for
 * any NPC at all — the name is in the prose either way, so the only thing
 * withheld is the link.
 */

/** Case- and accent-folded, so `[[thea]]` finds Théa. */
export function fold(v) {
  return String(v ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

const KINDS = { location: 'location', loc: 'location', place: 'location', npc: 'npc' };

/**
 * Split the inside of a `[[…]]` into its three parts.
 *
 * Order matters: the display text is split off FIRST, so `[[a|b:c]]` has a
 * label of `b:c` rather than a kind of `b`. A pipe is rarer than a colon in a
 * name, and a colon inside display text is ordinary prose.
 */
export function parseToken(inner) {
  const raw = String(inner ?? '');
  const pipe = raw.indexOf('|');
  const target = (pipe === -1 ? raw : raw.slice(0, pipe)).trim();
  const label = pipe === -1 ? null : raw.slice(pipe + 1).trim();

  const colon = target.indexOf(':');
  if (colon > 0) {
    const kind = KINDS[target.slice(0, colon).trim().toLowerCase()];
    // An unknown prefix is part of the name, not a typo to be guessed at:
    // "Act II: The Road" is a plausible thing to link to.
    if (kind) {
      const name = target.slice(colon + 1).trim();
      return { kind, name, label: label || name };
    }
  }
  return { kind: null, name: target, label: label || target };
}

/**
 * Build the lookup a renderer needs: folded name → { kind, id, name }.
 *
 * Locations win a bare `[[Name]]` when an NPC shares the name, because a place
 * is the commoner thing to link and the typed form `[[npc:…]]` is there for
 * the other case. Within a kind the FIRST entry wins: locations are unique per
 * campaign case-insensitively (a DB index enforces it), but NPC names are only
 * unique case-SENSITIVELY, so two can fold together.
 */
export function buildIndex({ locations = [], npcs = [] } = {}) {
  const index = new Map();
  const put = (kind, row) => {
    const key = fold(row?.name);
    if (!key) return;
    const typed = `${kind}:${key}`;
    if (!index.has(typed)) index.set(typed, { kind, id: row.id, name: row.name });
    if (!index.has(key)) index.set(key, { kind, id: row.id, name: row.name });
  };
  // Locations are inserted first, and a bare key is claimed first-come, so a
  // location wins `[[Name]]` when an NPC shares the name. Both still get their
  // own typed key, so `[[npc:Name]]` reaches the other one.
  for (const l of locations) put('location', l);
  for (const n of npcs) put('npc', n);
  return index;
}

/** Resolve one parsed token against an index, or null. */
export function resolve(token, index) {
  if (!index || !token?.name) return null;
  const key = fold(token.name);
  if (!key) return null;
  return index.get(token.kind ? `${token.kind}:${key}` : key) ?? null;
}
