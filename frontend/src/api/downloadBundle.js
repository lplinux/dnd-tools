/**
 * api/downloadBundle.js
 *
 * One place that turns an export bundle into a downloaded file, and one naming
 * convention for every module.
 *
 *   <module>[-<campaign>][-<name>]-<YYYY-MM-DD>.json
 *
 *   campaign-the-last-performance-2026-10-02.json
 *   character-leruhy-teudis-2026-10-02.json
 *   journey-map-leruhy-road-to-nyth-2026-10-02.json
 *
 * Before this, five hooks each had their own copy of the Blob + anchor dance
 * and their own idea of a filename — `teudis.json`, `journey-map-x.json`,
 * `leruhy-campaign.json` — so a folder of exports gave no clue what any of them
 * were or when they were taken. The date matters most: these are backups, and
 * backups that cannot be ordered are hard to trust.
 */

/** Lowercase, hyphenated, ASCII-ish — safe on every filesystem. */
export function slugify(s) {
  return String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // Ailyssë → Ailysse
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);                                      // keep filenames sane
}

/** Local date, not ISO/UTC: a file saved late at night should carry today. */
function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Build the filename without downloading — exported so it can be tested, and
 * so callers can show the name before saving if they ever want to.
 */
export function bundleFilename({ module: mod, campaign, name }) {
  const parts = [slugify(mod), slugify(campaign), slugify(name), today()].filter(Boolean);
  return `${parts.join('-')}.json`;
}

/** Serialise, name and save. */
export function downloadBundle(bundle, meta) {
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = bundleFilename(meta);
  a.click();
  URL.revokeObjectURL(a.href);
  return a.download;
}
