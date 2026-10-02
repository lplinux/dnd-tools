/**
 * api/srd.js
 *
 * Read-only client for the D&D 2024 System Reference Document (SRD 5.2), served
 * by dnd5eapi.co. Deliberately separate from api/client.js: that one is hardwired
 * to same-origin `/api` and normalises our own server's error envelope, neither of
 * which applies to a third-party host.
 *
 * Contract: NOTHING here throws or rejects — a miss, a timeout, an offline table
 * and a 500 all look the same to the caller, so render code can stay trivial.
 *
 * Two lookup shapes:
 *   lookup()/getSpell/getCondition/… -> `{ name, text, url } | null`, for prose
 *                                       resources, rendered by <SrdInfo>.
 *   lookupRaw()/getMonster/getSpecies/… -> the parsed body | null, for structured
 *                                       resources that carry no prose field at
 *                                       all and would otherwise read as a miss.
 *
 * Content is SRD 5.2, © Wizards of the Coast, licensed CC-BY-4.0.
 */

const BASE = 'https://www.dnd5eapi.co/api/2024';

/** Human-readable page for the same entry, used as the "read more" link. */
const WEB_BASE = 'https://5e24srd.com';

/** Abort a lookup after this long — a bad-wifi table must not get a hung UI. */
const TIMEOUT_MS = 4000;

const CACHE_KEY = 'srd2024-cache-v1';

/**
 * SRD text is immutable, so cache aggressively — including misses, or an entry
 * outside the SRD (Toll the Dead, say) is re-requested on every hover forever.
 * `null` is a real cached value here, so membership is tested with `has`.
 */
const memory = new Map();

let restored = false;
function restore() {
  if (restored) return;
  restored = true;
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (raw) for (const [k, v] of Object.entries(JSON.parse(raw))) memory.set(k, v);
  } catch {
    /* private mode, quota, disabled storage — cache is an optimisation, not a requirement */
  }
}

function persist() {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(memory)));
  } catch {
    /* ignore — see restore() */
  }
}

/**
 * Name -> API index. A plain space->dash swap is not enough and silently produces
 * a WRONG URL path for seven SRD spells:
 *   "Blindness/Deafness"    -> blindness-deafness   (a slash would nest the path)
 *   "Arcanist's Magic Aura" -> arcanists-magic-aura (apostrophes are dropped, not
 *                                                    turned into a separator)
 * Also: Antipathy/Sympathy, Dragon's Breath, Enlarge/Reduce, Heroes' Feast,
 * Hunter's Mark.
 */
export function toSlug(name) {
  return String(name)
    .trim()
    .toLowerCase()
    .replace(/['’]/g, '')     // apostrophes disappear entirely
    .replace(/[^a-z0-9]+/g, '-')   // every other run of punctuation/space -> one dash
    .replace(/^-+|-+$/g, '');
}

/**
 * The description field is NOT consistent across resources: conditions use
 * `description` (a string), spells use `desc` (a string or an array of strings).
 * Reading the wrong one yields undefined and looks like an empty entry.
 */
function extractText(body) {
  const raw = body?.description ?? body?.desc ?? '';
  return (Array.isArray(raw) ? raw.join('\n\n') : String(raw)).trim();
}

/**
 * Fetch and cache one entry, returning the parsed body untouched.
 *
 * Structured resources (monsters, species, subclasses, classes) carry no
 * `description`/`desc` field at all, so they cannot go through `lookup()` — it
 * would discard the whole payload and report a miss. Both paths share this one
 * request/cache/timeout implementation so the negative-caching and fail-open
 * rules stay in exactly one place.
 *
 * Cached under a `raw:` prefix so a raw body and a `{name,text,url}` entry for
 * the same resource can coexist without clobbering each other.
 */
export async function lookupRaw(resource, name) {
  if (!name || !String(name).trim()) return null;
  restore();

  const slug = toSlug(name);
  const key = `raw:${resource}/${slug}`;
  if (memory.has(key)) return memory.get(key);

  let body = null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}/${resource}/${slug}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    // A 404 is a legitimate answer: SRD 5.2 is a subset of the 2024 PHB, so an
    // entry can be absent from the SRD while still existing in the book. Cache
    // the null so we stop asking.
    if (res.ok) body = await res.json();
  } catch {
    // Abort, DNS failure, offline, CORS — all indistinguishable to the caller.
    // Do NOT cache these: unlike a 404 they are transient, and caching would
    // poison the session for every lookup made while the wifi was down.
    clearTimeout(timer);
    return null;
  }
  clearTimeout(timer);

  memory.set(key, body);
  persist();
  return body;
}

/**
 * Text lookup: `{ name, text, url } | null`, the contract SrdInfo renders against.
 * Only meaningful for resources whose payload actually carries prose.
 */
async function lookup(resource, name) {
  const body = await lookupRaw(resource, name);
  if (!body) return null;
  const text = extractText(body);
  if (!text) return null;
  return { name: body.name || name, text, url: `${WEB_BASE}/${resource}/index.html` };
}

export const getCondition  = (name) => lookup('conditions', name);
export const getDamageType = (name) => lookup('damage-types', name);
export const getSpell      = (name) => lookup('spells', name);
export const getTrait      = (name) => lookup('traits', name);

export const getMonster    = (name) => lookupRaw('monsters', name);
export const getSpecies    = (name) => lookupRaw('species', name);
export const getSubspecies = (name) => lookupRaw('subspecies', name);
export const getSubclass   = (name) => lookupRaw('subclasses', name);
export const getClass      = (name) => lookupRaw('classes', name);
export const getMagicItem  = (name) => lookupRaw('magic-items', name);

/**
 * What a resource contains, fetched once per resource per session.
 *
 * Deciding per-item would mean N requests on every render; the API rate-limits
 * under burst load (observed during development), and a throttled burst degrades
 * every chip at once. One indexed request instead — and since an index is only
 * ~30KB even for the 341 monsters, filtering it locally beats the API's own
 * `?name=` search, which would be a request per keystroke.
 *
 * Resolves to `null` — not an empty result — when the index can't be loaded, so
 * callers can tell "no entries" from "don't know" and fail open.
 */
const indexCache = new Map();

/**
 * Entries for a resource: `{ slugs: Set<slug>, names: string[] }`, or null when
 * the index can't be loaded.
 *
 * `names` exists so a picker can offer the real display names ("Goblin Warrior")
 * rather than reconstructing them from slugs — same single request serves both
 * the has-entry test and the option list.
 */
export async function loadEntries(resource) {
  if (indexCache.has(resource)) return indexCache.get(resource);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let entries = null;
  try {
    const res = await fetch(`${BASE}/${resource}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const body = await res.json();
      if (Array.isArray(body?.results)) {
        entries = {
          slugs: new Set(body.results.map((r) => r.index ?? toSlug(r.name))),
          names: body.results.map((r) => r.name).filter(Boolean).sort((a, b) => a.localeCompare(b)),
        };
      }
    }
  } catch {
    /* offline / aborted / throttled — leave null so callers fail open */
  }
  clearTimeout(timer);

  // Only memoise a real answer; a transient failure must stay retryable.
  if (entries) indexCache.set(resource, entries);
  return entries;
}

/** Slugs available in a resource. Null when unknown, so callers can fail open. */
export async function loadIndex(resource) {
  const entries = await loadEntries(resource);
  return entries ? entries.slugs : null;
}


/**
 * Text lookup for any prose resource.
 *
 * Generic on purpose: the previous three-way dispatcher fell through to
 * damage-types for anything it didn't recognise, so a lookup for, say, a species
 * silently queried /damage-types/elf, 404'd, and cached that miss forever.
 */
export const lookupByResource = (resource, name) => lookup(resource, name);

export const ATTRIBUTION =
  'SRD 5.2 © Wizards of the Coast, licensed under CC-BY-4.0. Served by dnd5eapi.co.';
