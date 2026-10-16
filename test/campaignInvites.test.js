/**
 * test/campaignInvites.test.js
 *
 * Invite links: a one-hour, single-use URL that creates an account and seats
 * it in a campaign.
 *
 * This is the highest-stakes route in the app — the only one where somebody
 * with no account at all writes to `users` — so the things pinned here are
 * the ones whose absence would not show up in ordinary use. The feature works
 * perfectly well with every one of them broken; it is only wrong when two
 * people click at once, or when the database leaks, or when someone puts
 * `"role": "admin"` in the body.
 *
 * All of this was also exercised against a live Postgres (52 checks,
 * including a 20-way redemption race). These are the regressions that would
 * otherwise need a database to notice.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(path.join(root, 'app.js'), 'utf8');

/** One named function's body. */
function fn(name) {
  const at = source.indexOf(`function ${name}(`);
  expect(at, `${name} not found`).toBeGreaterThan(-1);
  const end = source.indexOf('\n}\n', at);
  return source.slice(at, end);
}

/** One route handler's body, cut at its own closing `});`. */
function route(signature) {
  const at = source.indexOf(signature);
  expect(at, `${signature} not found`).toBeGreaterThan(-1);
  const end = source.indexOf('\n});', at);
  return source.slice(at, end);
}

describe('the token', () => {
  it('is 32 bytes of CSPRNG, not a hashed id like the share links', () => {
    // The share tokens are hashId(id) + 4 random bytes — fine for a read-only
    // link, 32 bits of entropy for one that creates an account.
    expect(source).toMatch(/mintInviteToken = \(\) => crypto\.randomBytes\(32\)/);
  });

  it('is never stored', () => {
    const insert = route("app.post('/api/campaigns/:campaignId/invites'");
    expect(insert).toMatch(/hashInviteToken\(token\)/);
    // The column takes the hash, so a raw `token` anywhere in the parameter
    // list would mean the plaintext reached the database.
    expect(insert).not.toMatch(/\[campaignId, playerId \|\| null, token,/);
  });

  it('is looked up by hash', () => {
    expect(fn('liveInvite')).toMatch(/token_hash = \$1/);
    expect(fn('liveInvite')).toMatch(/hashInviteToken\(token\)/);
  });

  it('is returned to the DM exactly once, at creation', () => {
    // The listing cannot leak it — there is nothing to leak — but selecting a
    // column called token would mean somebody had added one. Comments are
    // stripped first: the route's own prose says the word "token", and the
    // first version of this test failed on that rather than on any code.
    const list = route("app.get('/api/campaigns/:campaignId/invites'")
      .replace(/\/\/[^\n]*/g, '');
    expect(list).not.toMatch(/token/);
  });
});

describe('a link that should not work, does not', () => {
  const live = fn('liveInvite');

  it('expired is refused, in SQL rather than in JS', () => {
    // Comparing to a JS clock would compare the app's time against a value
    // the database wrote with its own.
    expect(live).toMatch(/expires_at > NOW\(\)/);
  });

  it('already used is refused', () => {
    expect(live).toMatch(/used_at IS NULL/);
  });

  it('belonging to a trashed campaign is refused', () => {
    expect(live).toMatch(/deleted_at IS NULL/);
  });

  it('gives the same answer for all three, and for a forgery', () => {
    // Distinguishing them would confirm that a token was once real.
    const preview = route("app.get('/api/invites/:token'");
    const codes = [...preview.matchAll(/code: '([A-Z_]+)'/g)].map((m) => m[1]);
    expect(new Set(codes)).toEqual(new Set(['INVITE_INVALID']));
  });
});

describe('single use survives two people clicking at once', () => {
  const redeem = fn('redeemInvite');

  it('the consuming UPDATE is conditional', () => {
    // THE load-bearing line. Without `AND used_at IS NULL` the row lock still
    // serialises the two writers, but the second one overwrites the first and
    // succeeds — live, 19 of 20 concurrent redemptions got through, each with
    // its own account. A SELECT-then-UPDATE has the same hole.
    expect(redeem).toMatch(/UPDATE campaign_invites SET used_at = NOW\(\), used_by = \$2\s*\n\s*WHERE id = \$1 AND used_at IS NULL AND expires_at > NOW\(\)/);
    expect(redeem).toMatch(/RETURNING id/);
    expect(redeem).toMatch(/if \(!spent\.rows\.length\) return \{ error: 'INVITE_SPENT' \}/);
  });

  it('and runs last, after everything that can legitimately fail', () => {
    // So a taken username or a filled seat rolls back without burning the
    // link. Ordering is the guarantee; there is nothing else holding it.
    const consume = redeem.indexOf('UPDATE campaign_invites');
    for (const earlier of ['SEAT_TAKEN', 'INSERT INTO campaign_user_assignments', 'INSERT INTO pc_characters']) {
      expect(redeem.indexOf(earlier), `${earlier} must come before the token is spent`)
        .toBeLessThan(consume);
    }
  });

  it('the seat is re-checked under the transaction, and locked', () => {
    // An hour is long enough for the DM to fill it by hand.
    expect(redeem).toMatch(/FOR UPDATE/);
    expect(redeem).toMatch(/NOT EXISTS \(SELECT 1 FROM campaign_user_assignments/);
  });

  it('both redemption paths go through it', () => {
    for (const sig of ["app.post('/api/invites/:token/accept'", "app.post('/api/invites/:token/join'"]) {
      expect(route(sig)).toMatch(/await redeemInvite\(client, invite,/);
    }
  });

  it('and both roll back rather than committing a half-join', () => {
    for (const sig of ["app.post('/api/invites/:token/accept'", "app.post('/api/invites/:token/join'"]) {
      const body = route(sig);
      expect(body).toMatch(/await client\.query\('BEGIN'\)/);
      expect(body.match(/ROLLBACK/g)?.length ?? 0).toBeGreaterThan(1);
    }
  });
});

describe('an invite cannot be used to become an admin', () => {
  const accept = route("app.post('/api/invites/:token/accept'");

  it('the role is a literal in the INSERT', () => {
    expect(accept).toMatch(/INSERT INTO users \(username, password_hash, role\) VALUES \(\$1, \$2, 'player'\)/);
  });

  it('and is not read from the body anywhere in the route', () => {
    expect(accept).not.toMatch(/req\.body\.role|role\s*\}\s*=\s*req\.body/);
    // The destructure takes exactly three fields.
    expect(accept).toMatch(/const \{ username, password, characterName \} = req\.body \?\? \{\}/);
  });
});

describe('who may mint one', () => {
  const dmRoutes = [
    "app.post('/api/campaigns/:campaignId/invites'",
    "app.get('/api/campaigns/:campaignId/invites'",
    "app.delete('/api/campaigns/:campaignId/invites/:id'",
  ];

  it.each(dmRoutes)('%s is DM-or-admin only and ownership-checked', (sig) => {
    const body = route(sig);
    expect(body).toMatch(/requireRole\(\['admin', 'dm'\]\)/);
    expect(body).toMatch(/await dmOwnsCampaign\(/);
  });

  it('revoking is scoped by campaign as well as by id', () => {
    // Or one DM could revoke another's invite by guessing a number.
    expect(route("app.delete('/api/campaigns/:campaignId/invites/:id'"))
      .toMatch(/WHERE id=\$1 AND campaign_id=\$2/);
  });
});

describe('joining with an account that already exists', () => {
  const join = route("app.post('/api/invites/:token/join'");

  it('prefers typed credentials over the current session', () => {
    // Someone logged in as A can follow an invite meant for B. Preferring the
    // session would collect B's password, ignore it and seat A — which is
    // exactly what it did until a live test caught it.
    expect(join).toMatch(/if \(!name && !password && req\.session\.userId\)/);
  });

  it('pays a bcrypt round for an unknown username', () => {
    // Or this route becomes the timing oracle /auth/login refuses to be.
    expect(join).toMatch(/DUMMY_PASSWORD_HASH/);
  });

  it('refuses a second seat in the same campaign', () => {
    expect(join).toMatch(/alreadyInCampaign\(client, invite\.campaign_id, user\.id\)/);
    expect(join).toMatch(/ALREADY_JOINED/);
  });

  it('regenerates the session even for someone already logged in', () => {
    // They arrived by following a link, which is the shape of a fixation
    // attempt whether or not this one is.
    expect(join).toMatch(/await startSession\(req, user\)/);
    expect(fn('startSession')).toMatch(/req\.session\.regenerate/);
  });

  it('writes the identity after regenerating, not before', () => {
    const s = fn('startSession');
    expect(s.indexOf('regenerate')).toBeLessThan(s.indexOf('req.session.userId ='));
    // maxAge after, because regeneration resets the cookie to the default.
    expect(s.indexOf('req.session.userId =')).toBeLessThan(s.indexOf('cookie.maxAge'));
  });
});

describe('the preview tells the invitee only what they need', () => {
  const preview = route("app.get('/api/invites/:token'");

  it('names the campaign, so the link is recognisable', () => {
    expect(preview).toMatch(/campaignName: invite\.campaign_name/);
  });

  it('and nothing else about it', () => {
    const keys = [...preview.matchAll(/^\s{6}(\w+):/gm)].map((m) => m[1]).sort();
    expect(keys).toEqual(['campaignName', 'expiresAt', 'loggedInAs', 'playerName']);
  });
});

describe('the schema', () => {
  const table = source.slice(
    source.indexOf('CREATE TABLE IF NOT EXISTS campaign_invites'),
    source.indexOf('idx_campaign_invites_campaign'),
  );

  it('holds a hash, sized for sha256 hex', () => {
    expect(table).toMatch(/token_hash\s+VARCHAR\(64\) NOT NULL UNIQUE/);
  });

  it('cascades from the campaign and the seat', () => {
    expect(table).toMatch(/campaign_id INTEGER NOT NULL REFERENCES campaigns\(id\) ON DELETE CASCADE/);
    expect(table).toMatch(/player_id {3}INTEGER REFERENCES campaign_players\(id\) ON DELETE CASCADE/);
  });

  it('keeps a used invite rather than deleting it', () => {
    // used_at/used_by are how a DM answers "did that link get used, and by
    // whom". A row that vanishes on use cannot tell a spent link from a forgery.
    expect(table).toMatch(/used_at {5}TIMESTAMP/);
    expect(table).toMatch(/used_by {5}INTEGER REFERENCES users\(id\) ON DELETE SET NULL/);
  });

  it('lets a seat be optional, which is what "new player" means', () => {
    expect(table).not.toMatch(/player_id {3}INTEGER NOT NULL/);
  });
});

describe('an hour', () => {
  it('is the stated lifetime', () => {
    expect(source).toMatch(/const INVITE_TTL_MS = 60 \* 60 \* 1000/);
  });

  it('and is applied by the database, not by the app clock', () => {
    expect(route("app.post('/api/campaigns/:campaignId/invites'"))
      .toMatch(/NOW\(\) \+ \(\$5 \|\| ' milliseconds'\)::interval/);
  });
});
