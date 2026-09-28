/**
 * api/open5e.js
 *
 * Read-only client for Open5e (api.open5e.com) — OGL / CC-BY / ORC licensed 5e
 * content from several publishers.
 *
 * Why a sibling of api/srd.js rather than a generalisation of it: the two share
 * a *shape* (fetch, timeout, negative cache, never throw) but nothing else. Open5e
 * paginates, needs `?fields=` to keep index requests sane, has no server-side
 * search, and carries per-document licences instead of one global attribution.
 * Folding both behind one abstraction would cost more than the duplication saves.
 *
 * Contract, deliberately identical to srd.js: NOTHING here throws or rejects. A
 * miss, a timeout and an outage all look the same, so render code stays trivial.
 *
 * Scope note: Open5e's 2024 content IS the SRD we already have (its own 2024
 * document contributes zero rows). Everything this module adds is 2014-era —
 * mostly Kobold Press Tome of Heroes — so entries carry their edition and
 * publisher and callers are expected to label them.
 */

const V1 = 'https://api.open5e.com/v1';
const V2 = 'https://api.open5e.com/v2';

const TIMEOUT_MS = 4000;

/** Level Up / Advanced 5E is a different ruleset; its content does not fit these sheets. */
const EXCLUDED_GAMESYSTEM = 'a5e';

const memory = new Map();

async function getJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    clearTimeout(timer);
    return res.ok ? await res.json() : null;
  } catch {
    // Abort, DNS failure, offline, CORS. Transient — the caller must be able to
    // retry, so nothing is cached here.
    clearTimeout(timer);
    return null;
  }
}

/**
 * Stand-in source for rows whose index request omits the document (see
 * loadMonsters). Edition is '2014' because that is where all of Open5e's
 * non-SRD content lives — its 2024 documents add nothing we don't already have.
 */
const OPEN5E_GENERIC = {
  key: 'open5e', title: 'Open5e', publisher: '', gamesystem: '5e-2014',
  edition: '2014', licenseUrl: '',
};

/** Publisher/licence for one row, so the ⓘ can attribute the right source. */
function sourceOf(doc) {
  if (!doc) return null;
  const gamesystem = doc.gamesystem?.key ?? doc.gamesystem?.name ?? '';
  return {
    key: doc.key ?? doc.slug ?? '',
    title: doc.display_name ?? doc.name ?? doc.title ?? '',
    publisher: doc.publisher?.name ?? '',
    gamesystem,
    edition: String(gamesystem).includes('2024') ? '2024' : '2014',
    licenseUrl: doc.license_url ?? doc.document__license_url ?? '',
  };
}

// ── Subclasses ──────────────────────────────────────────────────────────────

/**
 * Every subclass Open5e knows, as `{ name, key, className, source }`.
 *
 * ONE request, and it must carry `?fields=`: the unfielded /v2/classes/ response
 * is 1.06 MB because it inlines every feature's full text, versus 15 KB fielded.
 * Detail (features, description) is fetched per pick instead.
 *
 * Returns null — not [] — when unavailable, so callers can tell "none" from
 * "don't know" and fail open, matching srd.js.
 */
export async function loadSubclasses() {
  if (memory.has('subclasses')) return memory.get('subclasses');

  const body = await getJson(
    `${V2}/classes/?limit=300&fields=name,key,subclass_of,document`,
  );
  if (!Array.isArray(body?.results)) return null;

  const out = body.results
    .filter((r) => r.subclass_of)
    .map((r) => ({
      name: r.name,
      key: r.key,
      className: r.subclass_of?.name ?? '',
      source: sourceOf(r.document),
    }))
    .filter((r) => r.source && !String(r.source.gamesystem).includes(EXCLUDED_GAMESYSTEM));

  memory.set('subclasses', out);
  return out;
}

/** Full detail for one subclass: `{ name, desc, features:[{name, desc, level}] }`. */
export async function getSubclass(key) {
  if (!key) return null;
  const cacheKey = `subclass:${key}`;
  if (memory.has(cacheKey)) return memory.get(cacheKey);

  const body = await getJson(`${V2}/classes/${encodeURIComponent(key)}/`);
  // A 404 is a real answer and worth caching; a transient failure is not, and
  // getJson already returns null for both — so only cache a body we actually got.
  if (!body) return null;

  const detail = {
    name: body.name,
    desc: body.desc ?? '',
    source: sourceOf(body.document),
    features: (body.features ?? []).map((f) => ({
      name: f.name,
      desc: f.desc ?? '',
      // `gained_at` is a list of {level, ...}; the first entry is the level it
      // is granted at. Absent on some third-party entries.
      level: f.gained_at?.[0]?.level ?? null,
    })),
  };
  memory.set(cacheKey, detail);
  return detail;
}

// ── Monsters ────────────────────────────────────────────────────────────────

/**
 * Monster names for the picker. v1 rather than v2/creatures: v1's shape is much
 * closer to the dnd5eapi one that data/srdMap.js already flattens.
 */
export async function loadMonsters() {
  if (memory.has('monsters')) return memory.get('monsters');

  // Deliberately NOT requesting document__slug here: adding it takes this
  // request from ~1.1s to ~4.8s, past the timeout. Per-row attribution comes
  // from the detail fetch on pick instead, which is when it is actually shown.
  const body = await getJson(`${V1}/monsters/?limit=4000&fields=name,slug`);
  if (!Array.isArray(body?.results)) return null;

  const out = body.results.map((r) => ({ name: r.name, key: r.slug, source: OPEN5E_GENERIC }));
  memory.set('monsters', out);
  return out;
}

export async function getMonster(slug) {
  if (!slug) return null;
  const cacheKey = `monster:${slug}`;
  if (memory.has(cacheKey)) return memory.get(cacheKey);
  const body = await getJson(`${V1}/monsters/${encodeURIComponent(slug)}/`);
  if (!body) return null;
  memory.set(cacheKey, body);
  return body;
}

// ── Magic items ─────────────────────────────────────────────────────────────

export async function loadMagicItems() {
  if (memory.has('magicitems')) return memory.get('magicitems');

  // See loadMonsters(): document__slug is omitted on purpose, it is far too slow.
  const body = await getJson(`${V1}/magicitems/?limit=3000&fields=name,slug`);
  if (!Array.isArray(body?.results)) return null;

  const out = body.results.map((r) => ({ name: r.name, key: r.slug, source: OPEN5E_GENERIC }));
  memory.set('magicitems', out);
  return out;
}

export async function getMagicItem(slug) {
  if (!slug) return null;
  const cacheKey = `magicitem:${slug}`;
  if (memory.has(cacheKey)) return memory.get(cacheKey);
  const body = await getJson(`${V1}/magicitems/${encodeURIComponent(slug)}/`);
  if (!body) return null;
  memory.set(cacheKey, body);
  return body;
}

/** Attribution for an Open5e entry. Per-document: licences differ across sources. */
export function attributionFor(source) {
  if (!source) return 'Content via Open5e (api.open5e.com).';
  const bits = [source.title, source.publisher].filter(Boolean).join(' — ');
  return `${bits || 'Open5e'}, via api.open5e.com. See the source's own licence (OGL / CC-BY / ORC).`;
}
