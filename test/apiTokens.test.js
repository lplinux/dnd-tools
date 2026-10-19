/**
 * test/apiTokens.test.js
 *
 * API tokens — a second credential for an account, so a script or an
 * assistant can read and update a running instance.
 *
 * Three things carry the weight and none is visible from the route list.
 * The token stands in for a SESSION, which is what lets 163 untouched
 * routes accept it. It is exempt from CSRF, which is only safe because a
 * browser never attaches an Authorization header by itself. And it is
 * refused on three route groups whatever its scope, because a credential
 * that can mint its own replacement cannot be locked out.
 *
 * Also exercised live against a scratch Postgres — 26 checks, including a
 * player's token being refused DM-only data.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(path.join(root, 'app.js'), 'utf8');

/** The bearer-resolving middleware, up to the CSRF guard that follows it. */
const mw = source.slice(
  source.indexOf(' * ── API tokens ─'),
  source.indexOf('// Session management'),
);
const route = (sig) => {
  const at = source.indexOf(sig);
  expect(at, `${sig} not found`).toBeGreaterThan(-1);
  return source.slice(at, source.indexOf('\n});', at));
};

describe('the secret never lands in the database', () => {
  it('is 256 bits of CSPRNG behind a recognisable prefix', () => {
    // The prefix is for the human and for secret scanners, not for security.
    expect(mw).toMatch(/const API_TOKEN_PREFIX = 'dnd_'/);
    expect(mw).toMatch(/crypto\.randomBytes\(32\)\.toString\('base64url'\)/);
  });

  it('is stored as a hash, and looked up by hash', () => {
    expect(mw).toMatch(/crypto\.createHash\('sha256'\)/);
    expect(mw).toMatch(/WHERE t\.token_hash = \$1/);
  });

  it('and the column is UNIQUE so two rows cannot answer one token', () => {
    expect(source).toMatch(/token_hash\s+VARCHAR\(64\) NOT NULL UNIQUE/);
  });

  it('and CREATE writes the hash, never the token itself', () => {
    /*
     * The property that matters, and the one a lookup-side assertion does
     * not cover: swapping `hashApiToken(raw)` for `raw` in the INSERT
     * stores every secret in the clear and leaves the login path working,
     * so nothing else here would notice.
     */
    const c = route("app.post('/api/tokens'");
    expect(c).toMatch(/hashApiToken\(raw\)/);
    const params = c.slice(c.indexOf('INSERT INTO api_tokens'));
    expect(params, 'the raw token is passed to the INSERT').not.toMatch(/,\s*raw[,\]]/);
  });

  it('is returned by create and by nothing else', () => {
    // The whole contract: one response, then it is unrecoverable.
    expect(route("app.post('/api/tokens'")).toMatch(/token: raw/);
    const list = route("app.get('/api/tokens'");
    expect(list).not.toMatch(/token_hash/);
    expect(list).toMatch(/SELECT id, name, scope, expires_at, last_used_at, revoked_at, created_at/);
  });
});

describe('what a token may not do, whatever its scope', () => {
  it('DELETE anything', () => {
    // Asked for explicitly: a token updates a campaign, it does not remove
    // one. Checked before the scope test, so read and write are both bound.
    expect(mw).toMatch(/if \(req\.method === 'DELETE'\) \{/);
    const del = mw.indexOf("req.method === 'DELETE'");
    const scope = mw.indexOf("tok.scope === 'read'");
    expect(del).toBeLessThan(scope);
  });

  it('reach the token routes — or it could mint its own replacement', () => {
    // The escalation that matters: a leaked write token that can issue new
    // tokens and revoke the ones you would use to lock it out.
    expect(mw).toMatch(/\^\\\/api\\\/tokens\(\\\/\|\$\)/);
  });

  it('reach auth or user administration', () => {
    expect(mw).toMatch(/\^\\\/api\\\/auth\(\\\/\|\$\)/);
    expect(mw).toMatch(/\^\\\/api\\\/users\(\\\/\|\$\)/);
  });

  it('and a read token cannot write', () => {
    expect(mw).toMatch(/tok\.scope === 'read' && !CSRF_SAFE_METHODS\.includes\(req\.method\)/);
  });

  it('with the scope constrained in the schema too, not only in the route', () => {
    expect(source).toMatch(/scope\s+VARCHAR\(10\) NOT NULL DEFAULT 'read'\s*\n\s*CHECK \(scope IN \('read','write'\)\)/);
  });
});

describe('it is a credential, not a session', () => {
  it('stands in for the session rather than creating one', () => {
    /*
     * Every route reads `req.session`. A plain object supplies it without
     * express-session writing to MemoryStore or sending a Set-Cookie, which
     * a script has no use for and which would accumulate per request.
     */
    expect(mw).toMatch(/req\.session = \{ userId: tok\.user_id, role: tok\.role, username: tok\.username \}/);
    expect(source).toMatch(/req\.apiToken \? next\(\) : sessionMiddleware\(req, res, next\)/);
    // The stand-in must not be a real session object.
    expect(mw).not.toMatch(/req\.session\.save\(/);
  });

  it('carries the ROLE, not just the id', () => {
    // Routes consult `req.session.role` as well; supplying only the id made
    // every one of those answer 403, which is how this was found.
    expect(mw).toMatch(/SELECT t\.\*, u\.role, u\.username FROM api_tokens t/);
  });

  it('is exempt from CSRF, keyed on the RESOLVED token', () => {
    /*
     * Safe only because a browser never attaches an Authorization header
     * on its own, so there is nothing for an attacker to ride. Keying on
     * the header merely being present would let anyone opt out of CSRF.
     */
    const csrf = source.slice(source.indexOf('app.use((req, res, next) => {\n  if (CSRF_SAFE_METHODS'));
    expect(csrf.slice(0, 900)).toMatch(/if \(req\.apiToken\) return next\(\);/);
    expect(csrf.slice(0, 900)).not.toMatch(/req\.get\('Authorization'\)/);
  });

  it('and expired or revoked is the same answer as unknown', () => {
    // Saying which would confirm a token was once real.
    expect(mw).toMatch(/t\.revoked_at IS NULL/);
    expect(mw).toMatch(/t\.expires_at IS NULL OR t\.expires_at > NOW\(\)/);
    expect(mw).toMatch(/error: 'Invalid API token'/);
  });

  it('costs something to guess at', () => {
    expect(mw).toMatch(/loginRetryAfter\(key, now, INVITE_MAX_FAILURES\)/);
    expect(mw).toMatch(/recordLoginFailure\(key, now\)/);
  });

  it('and records use without a write on every request', () => {
    expect(mw).toMatch(/> 60000/);
    expect(mw).toMatch(/UPDATE api_tokens SET last_used_at = NOW\(\)/);
  });
});

describe('managing them is session-only', () => {
  it.each([
    "app.get('/api/tokens'",
    "app.post('/api/tokens'",
    "app.delete('/api/tokens/:id'",
  ])('%s is behind requireAuth', (sig) => {
    expect(route(sig)).toMatch(/requireAuth/);
  });

  it('and each user sees only their own', () => {
    for (const sig of ["app.get('/api/tokens'", "app.delete('/api/tokens/:id'"]) {
      expect(route(sig)).toMatch(/user_id=\$|user_id=\$2/);
    }
  });

  it('revoking keeps the row, so a token in a log stays nameable', () => {
    const d = route("app.delete('/api/tokens/:id'");
    expect(d).toMatch(/SET revoked_at = NOW\(\)/);
    expect(d).not.toMatch(/DELETE FROM api_tokens/);
  });
});

describe('discovery is derived, not maintained', () => {
  const d = route("app.get('/api/discover'");

  it('reads Express\'s own router rather than a list kept beside it', () => {
    /*
     * The whole point. A hand-written index of 160-odd routes is wrong
     * within a week, and wrong in the worst way — it is what a client
     * trusts instead of reading the code.
     */
    expect(d).toMatch(/app\.router\?\.stack/);
    expect(d).toMatch(/layer\.route\?\.path/);
    expect(d).toMatch(/Object\.keys\(layer\.route\.methods\)/);
  });

  it('and the only hand-written part is the group prose', () => {
    // A dozen lines about prefixes, which change about once a year.
    expect(source).toMatch(/const API_GROUPS = \[/);
    // Shared with the boot banner, so the two cannot disagree.
    expect(source).toMatch(/for \(const \[prefix, what\] of API_GROUPS\)/);
  });

  it('takes each route\'s roles from the gate itself', () => {
    // Not a second table: requireAuth and requireRole tag themselves.
    expect(source).toMatch(/requireAuth\.roles = \['any signed-in user'\]/);
    expect(source).toMatch(/gate\.roles = roles;/);
    expect(d).toMatch(/Array\.isArray\(h\.handle\?\.roles\)/);
  });

  it('lists only API routes', () => {
    expect(d).toMatch(/if \(!path\.startsWith\('\/api\/'\)\) continue/);
  });

  it('is itself behind auth', () => {
    expect(source).toMatch(/app\.get\('\/api\/discover', requireAuth/);
  });

  it('answers for THIS caller, with a reason when it refuses', () => {
    expect(d).toMatch(/allowed: !why/);
    expect(d).toMatch(/\.\.\.\(why \? \{ why \} : \{\}\)/);
    expect(d).toMatch(/auth: tok \? 'api-token' : 'session'/);
  });

  it('reports the ABSOLUTE refusals before the role one', () => {
    /*
     * No role makes DELETE reachable from a token, so leading with
     * "needs role: admin" would send a client to fix the wrong thing.
     * The role reason is the actionable one, so it comes last.
     */
    const delAt   = d.indexOf("'API tokens cannot delete'");
    const routeAt = d.indexOf("'not reachable with an API token'");
    const scopeAt = d.indexOf("'this token is read-only'");
    // The ASSIGNMENT, not the phrase: the comment above these branches
    // quotes "needs role: admin" and sits before all of them.
    const roleAt  = d.indexOf('why = `needs role:');
    for (const [name, at] of [['delete', delAt], ['forbidden route', routeAt], ['scope', scopeAt]]) {
      expect(at, `${name} reason missing`).toBeGreaterThan(-1);
      expect(at, `the role reason preempts ${name}`).toBeLessThan(roleAt);
    }
  });

  it('spells the token rules out rather than leaving them to be inferred', () => {
    expect(d).toMatch(/can_delete: false/);
    expect(d).toMatch(/csrf_required: false/);
    expect(d).toMatch(/unreachable_prefixes/);
    expect(d).toMatch(/auth_header: 'Authorization: Bearer <token>'/);
  });

  it('and versions the document shape, not the app', () => {
    // So a client can tell whether it still understands the answer.
    expect(d).toMatch(/discovery_version: 1/);
  });
});

describe('the panel belongs to the account, not to a campaign', () => {
  const header = readFileSync(path.join(root, 'frontend/src/components/layout/AppHeader.jsx'), 'utf8');
  const panel = readFileSync(path.join(root, 'frontend/src/components/ApiTokensPanel.jsx'), 'utf8');
  const settings = readFileSync(
    path.join(root, 'frontend/src/pages/ManageCampaigns/tabs/OtherTabs.jsx'), 'utf8');

  it('hangs off the header, reachable from every page', () => {
    // A token works across every campaign, so a control inside one implies
    // a limit that does not exist.
    expect(header).toMatch(/import ApiTokensPanel from '@\/components\/ApiTokensPanel'/);
    expect(header).toMatch(/<ApiTokensPanel \/>/);
  });

  it('and no longer sits in a campaign\'s settings', () => {
    expect(settings).not.toMatch(/ApiTokensPanel/);
  });

  it('opens as a dialog, not as more dropdown', () => {
    /*
     * The account menu is 260px; this is a form plus a list.
     *
     * The CLICK is asserted, not merely the prop's existence: dropping the
     * call from the handler leaves `onOpenTokens` mentioned twice more in
     * this file and a button that does nothing.
     */
    expect(header).toMatch(/open=\{tokensOpen\}/);
    expect(header).toMatch(/onClick=\{\(\) => \{ onClose\(\); onOpenTokens\(\); \}\}/);
    expect(header).toMatch(/onOpenTokens=\{\(\) => setTokensOpen\(true\)\}/);
  });

  it('and the panel no longer claims to be campaign-scoped', () => {
    expect(panel).not.toMatch(/not just this one/);
    expect(panel).toMatch(/across every campaign/);
  });

  it('still says the secret is shown once', () => {
    // The only thing standing between the DM and an unrecoverable token.
    expect(panel).toMatch(/only time it is shown/);
    expect(panel).toMatch(/Authorization: Bearer/);
  });
});

describe('TLS is one knob, because the halves are dangerous apart', () => {
  it('cookie.secure is derived from the proxy count, never set on its own', () => {
    /*
     * secure without a proxy → the browser withholds the cookie and nobody
     * can log in, with no error. A proxy without secure → the session
     * cookie crosses the last hop in clear.
     */
    expect(source).toMatch(/const SECURE_COOKIES = TRUST_PROXY_HOPS > 0/);
    expect(source).toMatch(/secure: SECURE_COOKIES,/);
    expect(source).not.toMatch(/secure: true/);
  });

  it('and trust proxy takes a HOP COUNT, not a boolean', () => {
    // `true` trusts the whole chain, which makes X-Forwarded-For — and so
    // req.ip, and so the login limiter — caller-controlled again.
    expect(source).toMatch(/const TRUST_PROXY_HOPS = parseInt\(process\.env\.TRUST_PROXY_HOPS \|\| '0', 10\) \|\| 0/);
    expect(source).toMatch(/if \(TRUST_PROXY_HOPS > 0\) app\.set\('trust proxy', TRUST_PROXY_HOPS\)/);
    expect(source).not.toMatch(/app\.set\('trust proxy', true\)/);
  });

  it('defaults to today: plain HTTP, no proxy', () => {
    expect(source).toMatch(/process\.env\.TRUST_PROXY_HOPS \|\| '0'/);
  });

  it('and says which mode it is in at boot', () => {
    // Every way of getting this wrong presents as "nobody can log in".
    expect(source).toMatch(/Set TRUST_PROXY_HOPS=1 behind a TLS reverse proxy/);
  });
});
