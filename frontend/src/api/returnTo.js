/**
 * api/returnTo.js
 *
 * Where to send someone after they log in.
 *
 * The share pages bounce a logged-out visitor to the login modal and want them
 * back on the page they asked for. That destination arrives in the URL, which
 * makes it attacker-controlled: a link to
 * `…/?login=1&next=https://evil.example/` would turn our own login screen into
 * a redirect to someone else's, with our domain in the address bar on the way.
 *
 * So the value is validated rather than trusted. Only a same-origin relative
 * path survives — the same rule `safeHref` in `renderMarkdown.js` already
 * applies to markdown links, for the same reason.
 */

/** Where to go when there is nowhere better. */
export const HOME = '/';

/**
 * The safe form of a `next` parameter, or `null` if it is not somewhere we are
 * willing to send a browser.
 *
 * Rejected, each for its own reason:
 *   - an absolute URL (`https://evil`), even to our own host — there is no
 *     need for one, and allowing it means parsing hosts correctly forever;
 *   - a protocol-relative URL (`//evil`), which a browser reads as absolute
 *     and which `startsWith('/')` alone would wave through;
 *   - a backslash form (`/\evil`, `\\evil`), which some browsers normalise
 *     into a protocol-relative URL;
 *   - anything with a control character, which can truncate a header or a
 *     parsed URL.
 */
export function safeNext(next) {
  const v = String(next ?? '').trim();
  if (!v) return null;
  if (!v.startsWith('/')) return null;          // must be relative to our root
  if (v.startsWith('//')) return null;          // protocol-relative = absolute
  if (v.startsWith('/\\')) return null;         // normalised to // by some browsers
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(v)) return null;
  return v;
}

/**
 * The query string that sends someone to the login modal and back again.
 * `?login=1` is the convention Home already reads; `next` rides alongside it.
 */
export function loginHref(next) {
  const safe = safeNext(next);
  return safe ? `/?login=1&next=${encodeURIComponent(safe)}` : '/?login=1';
}
