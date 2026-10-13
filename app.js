require('dotenv').config();
const express    = require('express');
const path       = require('path');
const fs         = require('fs');               // sync methods (existsSync, etc.)
const fsPromises = fs.promises;                 // async methods (readFile, readdir)
const session    = require('express-session');
const bcrypt     = require('bcryptjs');
const crypto     = require('crypto');
const sanitizeHtml = require('sanitize-html');
const { Pool }   = require('pg');

const app = express();
const PORT = process.env.PORT || 3080;

// ============================================
// ID HASHING — hides real DB IDs in URLs
// Uses HMAC-SHA256 with a server secret.
// hashId(7)  → "a3f8c2..."   (12-char hex prefix, URL-safe)
// unhashId("a3f8c2...") → 7
// ============================================
const ID_SECRET = process.env.ID_SECRET || 'dnd-id-secret-change-me';

function hashId(id) {
  const num = parseInt(id, 10);
  const hmac = crypto.createHmac('sha256', ID_SECRET).update(String(num)).digest('hex').slice(0, 8);
  // Encode as: base36(id) + '-' + hmac prefix (URL-safe, no padding)
  return num.toString(36) + hmac;
}

function unhashId(token) {
  if (!token) return null;
  // Split: all chars up to the 8-char hmac suffix
  if (token.length < 9) return null;
  const hmacPart = token.slice(-8);
  const idPart = token.slice(0, -8);
  const num = parseInt(idPart, 36);
  if (isNaN(num)) return null;
  const expected = crypto.createHmac('sha256', ID_SECRET).update(String(num)).digest('hex').slice(0, 8);
  if (expected !== hmacPart) return null;
  return num;
}


// PostgreSQL connection pool
const pool = new Pool({
  user: process.env.DB_USER || 'dndtools',
  password: process.env.DB_PASSWORD || 'dndtools123',
  host: process.env.DB_HOST || '127.0.0.1',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'dndtools'
});

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ── Static file serving ───────────────────────────────────────────────────────
//
// public/app/ is the Vite build output (frontend/vite.config.js writes straight
// here). It is served at the ROOT, not at /app/, because Vite emits absolute
// asset paths like /assets/main-xxx.js.
//
// The old second layer — public/ itself, holding the pre-React vanilla pages and
// their theme.css/app.css — is gone; those files were deleted once every module
// became React-owned.
//
// The SPA index is resolved per-request rather than cached at boot: the server
// is routinely started before `npm run build` has run, and a boot-time flag made
// that state permanent for the life of the process.

const SPA_INDEX = path.join(__dirname, 'public', 'app', 'index.html');

app.use(express.static(path.join(__dirname, 'public', 'app')));
app.use('/pdfs', express.static(path.join(__dirname, 'pdfs')));

// Serve module README docs — only whitelisted slugs, no path traversal
const DOCS_MODULES = new Set(['npc-sheet', 'item-cards', 'split-view', 'timeline', 'pdf-viewer', 'pc-sheet', 'manage-campaigns', 'journey-map', 'user-panel', 'diary']);
app.get('/api/docs/:module', async (req, res) => {
  const mod = req.params.module;
  if (!DOCS_MODULES.has(mod)) return res.status(404).json({ error: 'Not found' });
  try {
    const md = await fsPromises.readFile(path.join(__dirname, 'docs', mod, 'README.md'), 'utf8');
    res.type('text/plain').send(md);
  } catch { res.status(404).json({ error: 'No documentation found' }); }
});

// Session management
app.use(session({
  secret: process.env.SESSION_SECRET || 'change-this-in-production',
  resave: false,
  saveUninitialized: true,
  cookie: {
    // `secure` stays false: the app is served over plain HTTP on a published
    // port with no TLS and no reverse proxy (docker-compose.yml), so turning it
    // on would break every session immediately. See ARCH.md for what has to be
    // true first.
    secure: false,
    httpOnly: true,
    // Explicit rather than relying on the browser default. Lax already blocks
    // cross-site POST/PUT/PATCH/DELETE, and it is the layer the CSRF tokens sit
    // on top of — leaving it implicit means a future Express or browser change
    // could remove it without anything here noticing.
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000
  }
}));

// ============================================
// CSRF PROTECTION
// ============================================
/**
 * A synchroniser token, held in the session.
 *
 * Honest framing first: `sameSite: 'lax'` on the cookie above already blocks
 * cross-site POST/PUT/PATCH/DELETE in every current browser, so this is a
 * second layer rather than the only one. What it adds is cover against a
 * same-site subdomain attacker and against clients old enough to ignore
 * SameSite — worth having, not a hole being closed.
 *
 * Kept in the session rather than in a readable cookie on purpose. The usual
 * double-submit pattern needs a non-httpOnly cookie, and PdfViewer injects an
 * unpinned pdf.js from a CDN straight into page scope
 * (frontend/src/hooks/usePdfViewer.js) — anything that script can read is not a
 * secret. The session is httpOnly and lives server-side, so there is nothing on
 * the page to steal.
 *
 * No route needs an exemption, which is the part worth noticing.
 * `saveUninitialized: true` means even a logged-out visitor already has a
 * session, so a token exists before anyone logs in — and that covers login and
 * logout, the only two unauthenticated mutating routes in the file and the two
 * classic CSRF targets, rather than carving them out for convenience.
 */
const CSRF_SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];

/** Mint on first read. One per session, rotated when privilege changes. */
function csrfToken(req) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  return req.session.csrfToken;
}

app.use((req, res, next) => {
  if (CSRF_SAFE_METHODS.includes(req.method)) return next();

  const expected = req.session.csrfToken;
  const given    = req.get('X-CSRF-Token');

  // The length check is not an optimisation — timingSafeEqual throws on a
  // length mismatch, and a session that has never issued a token has nothing
  // anything could match against.
  const ok = typeof expected === 'string'
    && typeof given === 'string'
    && given.length === expected.length
    && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));

  if (!ok) {
    // `code` so the client can tell a stale token from a genuine permission
    // failure and retry once instead of losing the user's edit. Sessions live
    // in MemoryStore, so a server restart makes this the common case rather
    // than the exceptional one. See frontend/src/api/client.js.
    return res.status(403).json({ error: 'Invalid CSRF token', code: 'EBADCSRFTOKEN' });
  }
  next();
});

// ============================================
// AUTH MIDDLEWARE
// ============================================

const requireAuth = (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

const requireRole = (roles) => async (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const result = await pool.query('SELECT role FROM users WHERE id = $1', [req.session.userId]);
    if (result.rows.length === 0 || !roles.includes(result.rows[0].role)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    next();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};


// ============================================
// AUTH ENDPOINTS
// ============================================

/**
 * Login throttling.
 *
 * Passwords are bcrypt-hashed, so this was a throttling gap rather than a
 * storage one — but nothing at all slowed a credential-stuffing run.
 *
 * Keyed on IP *and* username together, deliberately. IP alone locks out a whole
 * household behind one NAT the moment somebody fat-fingers their password;
 * username alone hands an attacker a way to lock you out of your own account
 * just by guessing at it. Neither is a good trade on a tool five people share.
 *
 * Held in memory, like the session store: this is a single-process self-hosted
 * app, and a restart clearing the counters grants exactly the same forgiveness
 * a restart already grants every session.
 *
 * `req.ip` is the socket address because `trust proxy` is deliberately unset —
 * see ARCH.md. Putting a reverse proxy in front without setting it collapses
 * every client into one bucket and locks everybody out at once; setting it
 * *without* a proxy in front is worse still, because X-Forwarded-For then
 * becomes attacker-controlled and the limiter is free to bypass.
 */
const LOGIN_MAX_FAILURES = 10;
const LOGIN_WINDOW_MS    = 15 * 60 * 1000;
const LOGIN_TRACK_CAP    = 5000;

/** key -> { count, firstAt } */
const loginFailures = new Map();

const loginKey = (req, username) => `${req.ip}:${String(username ?? '').toLowerCase()}`;

/** Drop expired windows. Called on every write, so the Map cannot grow unbounded. */
function sweepLoginFailures(now) {
  for (const [k, v] of loginFailures) {
    if (now - v.firstAt >= LOGIN_WINDOW_MS) loginFailures.delete(k);
  }
}

/** Seconds this key must wait, or 0 if it may try now. */
function loginRetryAfter(key, now) {
  const rec = loginFailures.get(key);
  if (!rec) return 0;
  if (now - rec.firstAt >= LOGIN_WINDOW_MS) { loginFailures.delete(key); return 0; }
  if (rec.count < LOGIN_MAX_FAILURES) return 0;
  return Math.ceil((rec.firstAt + LOGIN_WINDOW_MS - now) / 1000);
}

function recordLoginFailure(key, now) {
  sweepLoginFailures(now);
  // A hard cap for the case the sweep cannot keep up with a distributed run.
  // Evicting the oldest entry is a worse limiter than growing the Map is a
  // process, so the cap wins.
  if (loginFailures.size >= LOGIN_TRACK_CAP && !loginFailures.has(key)) {
    loginFailures.delete(loginFailures.keys().next().value);
  }
  const rec = loginFailures.get(key);
  if (rec && now - rec.firstAt < LOGIN_WINDOW_MS) rec.count += 1;
  else loginFailures.set(key, { count: 1, firstAt: now });
}

/**
 * Compared against when the username does not exist, so that the unknown-user
 * and wrong-password paths cost the same. Without it the 401 for an unknown
 * name returns in microseconds while a real name pays a full bcrypt round —
 * the wording is identical either way, but the clock is a usable oracle for
 * which usernames are real, which is exactly what the limiter above is trying
 * to make expensive to find out.
 */
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('timing-equalisation-placeholder', 10);

app.post('/api/auth/login', async (req, res) => {
  const { username, password, rememberMe } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const now  = Date.now();
  const key  = loginKey(req, username);
  const wait = loginRetryAfter(key, now);
  if (wait) {
    res.set('Retry-After', String(wait));
    return res.status(429).json({
      error: `Too many failed attempts. Try again in ${Math.ceil(wait / 60)} minute(s).`,
    });
  }

  try {
    const result = await pool.query(
      'SELECT id, username, role, password_hash FROM users WHERE username = $1',
      [username]
    );

    const user = result.rows[0];

    if (user && !user.password_hash) {
      console.error('User record missing password_hash for user:', user.username);
      return res.status(500).json({ error: 'User record malformed' });
    }

    // Always pay for a bcrypt round, even when the username is unknown, so the
    // two failure paths take the same time. See DUMMY_PASSWORD_HASH.
    const passwordMatch = await bcrypt.compare(
      password, user ? user.password_hash : DUMMY_PASSWORD_HASH
    );

    if (!user || !passwordMatch) {
      recordLoginFailure(key, now);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // A correct password clears the window: a user who finally remembers their
    // password is not made to wait out an attacker's failures from the same IP.
    loginFailures.delete(key);

    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.role = user.role;
    // "Remember me" extends the session cookie to 30 days (default stays 24h).
    req.session.cookie.maxAge = rememberMe
      ? 30 * 24 * 60 * 60 * 1000
      : 24 * 60 * 60 * 1000;

    // Rotate on a privilege change and return the new value. Correct on its
    // own, and it means the session-fixation fix (regenerating the session
    // here instead of assigning onto it) can land later without the SPA
    // holding a token for a session that no longer exists.
    delete req.session.csrfToken;

    res.json({
      success: true,
      csrfToken: csrfToken(req),
      user: {
        id: user.id,
        username: user.username,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.post('/api/auth/change-password', requireAuth, async (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters' });
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    await pool.query('UPDATE users SET password_hash=$1 WHERE id=$2', [hash, req.session.userId]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Utility: hash an array of IDs for the frontend
app.post('/api/hash-ids', requireAuth, (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids must be array' });
  const result = {};
  ids.forEach(id => { result[id] = hashId(id); });
  res.json(result);
});

app.get('/api/auth/user', (req, res) => {
  // Carries the CSRF token in both branches. This is already the first request
  // the SPA makes on boot, so the token arrives without a route of its own —
  // and a logged-out visitor needs one too, because login is itself protected.
  const csrf = csrfToken(req);
  if (!req.session.userId) {
    return res.json({ user: null, csrfToken: csrf });
  }
  res.json({
    csrfToken: csrf,
    user: {
      id: req.session.userId,
      username: req.session.username,
      role: req.session.role
    }
  });
});

// ============================================
// ADMIN USER MANAGEMENT
// ============================================

app.get('/api/users', requireRole(['admin', 'dm']), async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, email, role, created_at FROM users ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/users', requireRole(['admin']), async (req, res) => {
  const { username, email, role, password } = req.body;

  if (!username || !role || !password) {
    return res.status(400).json({ error: 'Username, role, and password required' });
  }

  if (!['admin', 'dm', 'player'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  try {
    const existing = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (username, password_hash, email, role) VALUES ($1, $2, $3, $4) RETURNING id, username, role',
      [username, passwordHash, email || null, role]
    );

    res.json({
      success: true,
      user: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/users/:id/role', requireRole(['admin']), async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;

  if (!['admin', 'dm', 'player'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  try {
    const result = await pool.query(
      'UPDATE users SET role = $1 WHERE id = $2 RETURNING id, username, role',
      [role, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/users/:id/password', requireRole(['admin']), async (req, res) => {
  const { id } = req.params;
  const { password } = req.body;

  if (!password) {
    return res.status(400).json({ error: 'Password required' });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    await pool.query(
      'UPDATE users SET password_hash = $1 WHERE id = $2',
      [passwordHash, id]
    );

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/users/:id', requireRole(['admin']), async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// CAMPAIGN MANAGEMENT
// ============================================

app.get('/api/campaigns', requireAuth, async (req, res) => {
  try {
    let query, params;

    // `deleted_at IS NULL` on BOTH branches: this one endpoint feeds every
    // campaign selector in the app (Manage Campaigns, PC Sheet, Diary, Journey
    // Map, Timeline all call it independently), so filtering here hides a
    // trashed campaign everywhere at once — including from the three modules
    // that auto-select when exactly one campaign comes back.
    if (req.session.role === 'dm') {
      query = 'SELECT * FROM campaigns WHERE dm_user_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC';
      params = [req.session.userId];
    } else {
      // EXISTS rather than a JOIN. Joining through campaign_players yields one
      // row PER CHARACTER, so a player with two characters in one campaign got
      // that campaign back twice — a selector with the same name in it twice,
      // in every module that reads this endpoint, and a `length === 1`
      // auto-select that stopped firing for them. EXISTS asks the question
      // actually being asked ("does this user play here at all"), so there is
      // one row per campaign by construction rather than by deduplication.
      query = `SELECT c.* FROM campaigns c
          WHERE c.deleted_at IS NULL
            AND EXISTS (
              SELECT 1 FROM campaign_players cp
                JOIN campaign_user_assignments cua ON cua.player_id = cp.id
               WHERE cp.campaign_id = c.id AND cua.user_id = $1)
          ORDER BY c.created_at DESC`;
      params = [req.session.userId];
    }

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/campaigns', requireRole(['dm']), async (req, res) => {
  const { name, description } = req.body;
  // The create form sends calendarType; accept the snake_case spelling too. This
  // used to be dropped on the floor, so every campaign created through the UI
  // silently fell back to Harptos regardless of what was picked.
  const calendarType = req.body.calendarType ?? req.body.calendar_type;

  if (!name) {
    return res.status(400).json({ error: 'Campaign name required' });
  }
  if (calendarType && !['harptos', 'gregorian'].includes(calendarType)) {
    return res.status(400).json({ error: 'calendarType must be "harptos" or "gregorian"' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      'INSERT INTO campaigns (name, description, dm_user_id) VALUES ($1, $2, $3) RETURNING *',
      [name, description || null, req.session.userId]
    );
    await client.query(
      'INSERT INTO campaign_meta (campaign_id, calendar_type) VALUES ($1, $2)',
      [result.rows[0].id, calendarType || 'harptos']
    );
    await client.query('COMMIT');

    res.json(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// ── Trash ─────────────────────────────────────────────────────────────────────
// Deleting a campaign is a soft delete: `campaigns.deleted_at` is stamped, the
// row drops out of every selector, and the public share links stop resolving.
// Nothing is destroyed until the DM purges it explicitly — there is no scheduled
// sweep, by design.
//
// Scope, deliberately: a trashed campaign is hidden, not sealed. A logged-in DM
// or player who deep-links by campaign id can still reach its locations, NPCs,
// timeline, map and diary, because those routes authorise against child tables
// and never consult `campaigns` at all. Closing that means threading deleted_at
// through dmOwnsCampaign / ownsPlayer / canAccessTimeline and ~25 routes, which
// is a separate job. This is undo-safety, not an access-control boundary.

/** Shared ownership check for the three trash routes. Admins are not DMs here —
 *  requireRole(['dm']) already excludes them, matching the old delete route. */
async function ownsCampaignRow(id, userId) {
  const r = await pool.query('SELECT id FROM campaigns WHERE id = $1 AND dm_user_id = $2', [id, userId]);
  return r.rows.length > 0;
}

// MUST be registered before any `/api/campaigns/:id` GET: Express matches in
// registration order, so a parameterised route declared first would swallow the
// literal "trash" and try to look up a campaign with that id. See
// test/routeOrder.test.js, which exists because this already happened once.
app.get('/api/campaigns/trash', requireRole(['dm']), async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT * FROM campaigns WHERE dm_user_id = $1 AND deleted_at IS NOT NULL ORDER BY deleted_at DESC',
      [req.session.userId]
    );
    res.json(r.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/campaigns/:id', requireRole(['dm']), async (req, res) => {
  const { id } = req.params;

  try {
    if (!await ownsCampaignRow(id, req.session.userId)) {
      return res.status(403).json({ error: 'Cannot delete campaign' });
    }

    // `AND deleted_at IS NULL` so a repeated delete does not move the timestamp
    // forward and quietly restart the clock on something already in the trash.
    await pool.query('UPDATE campaigns SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL', [id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/campaigns/:id/restore', requireRole(['dm']), async (req, res) => {
  const { id } = req.params;

  try {
    if (!await ownsCampaignRow(id, req.session.userId)) {
      return res.status(403).json({ error: 'Cannot restore campaign' });
    }

    await pool.query('UPDATE campaigns SET deleted_at = NULL WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/campaigns/:id/purge', requireRole(['dm']), async (req, res) => {
  const { id } = req.params;

  try {
    if (!await ownsCampaignRow(id, req.session.userId)) {
      return res.status(403).json({ error: 'Cannot delete campaign' });
    }

    // Only from the trash — purging straight past the soft delete would make the
    // undo step skippable by anyone hitting the API directly.
    const r = await pool.query(
      'DELETE FROM campaigns WHERE id = $1 AND deleted_at IS NOT NULL RETURNING id',
      [id]
    );
    if (!r.rows.length) {
      return res.status(409).json({ error: 'Campaign must be in the trash before it can be permanently deleted' });
    }
    // Everything else goes with it: all twelve tables referencing campaigns are
    // ON DELETE CASCADE, so this single statement is the whole purge.
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// CAMPAIGN PLAYERS
// ============================================

app.get('/api/campaigns/:campaignId/players', requireRole(['dm', 'player']), async (req, res) => {
  const { campaignId } = req.params;

  try {
    if (!await canAccessCampaign(req.params.campaignId, req.session.userId, req.session.role))
      return res.status(403).json({ error: 'Access denied' });
    // The DM sees the whole roster; a player only ever sees the character(s)
    // assigned to them. Enforced here so the API can't leak other players'
    // characters (the PC endpoints are already guarded by canAccessPC).
    const playerOnly = req.session.role !== 'dm';
    const params = [campaignId];
    let mineOnly = '';
    if (playerOnly) {
      params.push(req.session.userId);
      mineOnly = 'AND cp.id IN (SELECT player_id FROM campaign_user_assignments WHERE user_id = $2)';
    }

    const result = await pool.query(
      `SELECT cp.*, cua.user_id, u.username FROM campaign_players cp
       LEFT JOIN campaign_user_assignments cua ON cp.id = cua.player_id
       LEFT JOIN users u ON cua.user_id = u.id
       WHERE cp.campaign_id = $1
         AND (cp.is_dm_player IS NULL OR cp.is_dm_player = false)
         ${mineOnly}
       ORDER BY cp.created_at DESC`,
      params
    );

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/campaigns/:campaignId/players', requireRole(['dm']), async (req, res) => {
  const { campaignId } = req.params;
  const { name, userId } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Player name required' });
  }

  try {
    if (!await dmOwnsCampaign(req.params.campaignId, req.session.userId, req.session.role))
      return res.status(403).json({ error: 'Access denied' });
    // Create player
    const playerResult = await pool.query(
      'INSERT INTO campaign_players (campaign_id, player_name) VALUES ($1, $2) RETURNING id',
      [campaignId, name]
    );

    const playerId = playerResult.rows[0].id;

    // Assign to user if provided
    if (userId) {
      await pool.query(
        'INSERT INTO campaign_user_assignments (player_id, user_id) VALUES ($1, $2)',
        [playerId, userId]
      );
    }

    res.json({ success: true, playerId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/campaigns/:campaignId/players/:playerId', requireRole(['admin', 'dm']), async (req, res) => {
  const { campaignId, playerId } = req.params;
  try {
    if (!await dmOwnsCampaign(req.params.campaignId, req.session.userId, req.session.role))
      return res.status(403).json({ error: 'Access denied' });
    // Block if player has timeline entries
    const tlCheck = await pool.query(
      'SELECT COUNT(*)::int as cnt FROM player_timeline_entries WHERE player_id=$1',
      [playerId]
    );
    if (tlCheck.rows[0].cnt > 0) {
      return res.status(409).json({ error: `Player has ${tlCheck.rows[0].cnt} timeline entr${tlCheck.rows[0].cnt === 1 ? 'y' : 'ies'}. Delete their timeline entries first.` });
    }
    // Block if player has journey path waypoints referencing them
    // (journey_trackers are named groups, not per-player — no direct link exists, so no block needed here)
    await pool.query('DELETE FROM campaign_players WHERE id = $1 AND campaign_id = $2', [playerId, campaignId]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reassign a player to a different (or no) user account
app.put('/api/campaigns/:campaignId/players/:playerId/reassign', requireRole(['dm']), async (req, res) => {
  const { campaignId, playerId } = req.params;
  const { userId } = req.body; // null = unassign

  const client = await pool.connect();
  try {
    if (!await dmOwnsCampaign(req.params.campaignId, req.session.userId, req.session.role))
      return res.status(403).json({ error: 'Access denied' });
    await client.query('BEGIN');

    // Verify the player belongs to this campaign
    const check = await client.query(
      'SELECT id FROM campaign_players WHERE id=$1 AND campaign_id=$2',
      [playerId, campaignId]
    );
    if (!check.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Player not found in this campaign' });
    }

    // Remove any existing assignment for this player
    await client.query('DELETE FROM campaign_user_assignments WHERE player_id=$1', [playerId]);

    // Create new assignment if a user was provided
    if (userId) {
      // Make sure the user exists
      const userCheck = await client.query('SELECT id FROM users WHERE id=$1', [userId]);
      if (!userCheck.rows.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'User not found' });
      }
      await client.query(
        'INSERT INTO campaign_user_assignments (player_id, user_id) VALUES ($1, $2)',
        [playerId, userId]
      );
    }

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
});

// ============================================
// PLAYER TIMELINES (named, per player)
// ============================================

// GET all timelines for ALL players in a campaign (DM combined view)
app.get('/api/player-timelines/:campaignId/all', requireAuth, async (req, res) => {
  const { campaignId } = req.params;
  try {
    if (!await canAccessTimeline(req.session.userId, req.session.role, campaignId, null)) {
      // canAccessTimeline returns true for dm/admin even with null playerId
      return res.status(403).json({ error: 'Access denied' });
    }
    const result = await pool.query(
      `SELECT * FROM (
         SELECT pt.id as timeline_id, pt.name as timeline_name,
                cp.id as player_id, cp.player_name, cp.is_dm_player,
                u_assign.username,
                pte.id as entry_id, pte.title, pte.description,
                pte.location, pte.year, pte.day_of_year, pte.duration_days,
                pte.player_ids, pte.manual_links, pte.is_party
         FROM player_timelines pt
         JOIN campaign_players cp ON pt.player_id = cp.id
         LEFT JOIN campaign_user_assignments cua ON cp.id = cua.player_id
         LEFT JOIN users u_assign ON cua.user_id = u_assign.id
         LEFT JOIN player_timeline_entries pte ON pte.timeline_id = pt.id
         WHERE pt.campaign_id=$1
         UNION ALL
         SELECT NULL::int as timeline_id, '🌍 Party' as timeline_name,
                NULL::int as player_id, 'Party' as player_name, false as is_dm_player,
                NULL as username,
                pte.id as entry_id, pte.title, pte.description,
                pte.location, pte.year, pte.day_of_year, pte.duration_days,
                pte.player_ids, pte.manual_links, pte.is_party
         FROM player_timeline_entries pte
         WHERE pte.campaign_id=$1 AND pte.is_party=true
       ) sub
       ORDER BY player_name, timeline_name, year ASC, day_of_year ASC`,
      [campaignId]
    );
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET entries for a specific named timeline
app.get('/api/player-timelines/:timelineId/entries', requireAuth, async (req, res) => {
  const { timelineId } = req.params;
  try {
    const tl = await pool.query('SELECT * FROM player_timelines WHERE id=$1', [timelineId]);
    if (!tl.rows.length) return res.status(404).json({ error: 'Not found' });
    const t = tl.rows[0];
    if (!await canAccessTimeline(req.session.userId, req.session.role, t.campaign_id, t.player_id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    // A player never receives an event the DM has not revealed. Filtered in SQL,
    // not in the client, so a hidden event is not merely un-rendered — it never
    // reaches the browser.
    const canSeeHidden = ['dm', 'admin'].includes(req.session.role);
    const result = await pool.query(
      `SELECT pte.*, u.username as created_by_name
       FROM player_timeline_entries pte
       JOIN users u ON pte.created_by = u.id
       WHERE pte.timeline_id=$1
         ${canSeeHidden ? '' : 'AND pte.visible_to_players = true'}
       ORDER BY pte.year ASC, pte.day_of_year ASC, pte.created_at ASC`,
      [timelineId]
    );
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Export a single named timeline as a portable `type:'timeline'` bundle. Actors are
// serialised by NAME + kind (player / npc / rel) so the file can be re-imported into
// any campaign; locations are already names.
app.get('/api/player-timelines/:timelineId/export', requireAuth, async (req, res) => {
  const { timelineId } = req.params;
  try {
    const tl = await pool.query('SELECT * FROM player_timelines WHERE id=$1', [timelineId]);
    if (!tl.rows.length) return res.status(404).json({ error: 'Not found' });
    const t = tl.rows[0];
    if (!await canAccessTimeline(req.session.userId, req.session.role, t.campaign_id, t.player_id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const cid = t.campaign_id;
    const [entriesR, playersR, npcsR, relsR, metaR] = await Promise.all([
      pool.query('SELECT * FROM player_timeline_entries WHERE timeline_id=$1 ORDER BY year ASC, day_of_year ASC, created_at ASC', [timelineId]),
      pool.query('SELECT id, player_name FROM campaign_players WHERE campaign_id=$1', [cid]),
      pool.query('SELECT id, name FROM campaign_npcs WHERE campaign_id=$1', [cid]),
      pool.query(`SELECT pr.id, pr.name FROM pc_relationships pr
                  JOIN pc_characters pc ON pc.id = pr.character_id
                  JOIN campaign_players cp ON cp.id = pc.player_id
                  WHERE cp.campaign_id=$1`, [cid]),
      pool.query('SELECT calendar_type FROM campaign_meta WHERE campaign_id=$1', [cid]),
    ]);
    const playerName = new Map(playersR.rows.map(r => [String(r.id), r.player_name]));
    const npcName = new Map(npcsR.rows.map(r => [String(r.id), r.name]));
    const relName = new Map(relsR.rows.map(r => [String(r.id), r.name]));
    const stripPrefix = (s) => String(s || '').replace(/^\p{Emoji}\s*/u, '').replace(/\s*\(.*\)$/, '').trim();

    const actorsFor = (tokens) => (tokens || []).map((tok) => {
      const parts = String(tok).split('_');
      const prefix = parts[0];
      const val = parts.slice(1).join('_');
      if (prefix === 'self' || prefix === 'cp') { const n = playerName.get(val); return n ? { name: stripPrefix(n), kind: 'player' } : null; }
      if (prefix === 'npc') { const n = npcName.get(val); return n ? { name: stripPrefix(n), kind: 'npc' } : null; }
      if (prefix === 'rel') { const n = relName.get(val); return n ? { name: stripPrefix(n), kind: 'rel' } : null; }
      return null;
    }).filter(Boolean);

    const events = entriesR.rows.map((e) => ({
      title: e.title, description: e.description || null, location: e.location || null,
      year: e.year, day_of_year: e.day_of_year, duration_days: e.duration_days || 1,
      is_party: !!e.is_party,
      actors: actorsFor(e.player_ids),
    }));
    res.json({
      version: 1, type: 'timeline',
      timeline: { name: t.name },
      calendar_type: metaR.rows[0]?.calendar_type || 'harptos',
      events,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Import a `type:'timeline'` bundle into an existing campaign, under a chosen player.
// Actors are matched by NAME to the target campaign's players / NPCs / relationships;
// unmatched actors are dropped. Missing locations are created.
app.post('/api/campaigns/:campaignId/import/timeline', requireRole(['dm', 'admin']), async (req, res) => {
  const { campaignId } = req.params;
  const { player_id, timeline_name, events } = req.body;
  if (!player_id) return res.status(400).json({ error: 'A target player is required' });
  if (!Array.isArray(events)) return res.status(400).json({ error: 'events[] required' });
  const client = await pool.connect();
  try {
    if (!await dmOwnsCampaign(req.params.campaignId, req.session.userId, req.session.role))
      return res.status(403).json({ error: 'Access denied' });
    await client.query('BEGIN');
    // Target player must belong to this campaign.
    const pv = await client.query('SELECT id FROM campaign_players WHERE id=$1 AND campaign_id=$2', [player_id, campaignId]);
    if (!pv.rows.length) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Player not found in this campaign' }); }

    const [playersR, npcsR, relsR, locsR] = await Promise.all([
      client.query('SELECT id, player_name FROM campaign_players WHERE campaign_id=$1', [campaignId]),
      client.query('SELECT id, name FROM campaign_npcs WHERE campaign_id=$1', [campaignId]),
      client.query(`SELECT pr.id, pr.name FROM pc_relationships pr
                    JOIN pc_characters pc ON pc.id = pr.character_id
                    JOIN campaign_players cp ON cp.id = pc.player_id
                    WHERE cp.campaign_id=$1`, [campaignId]),
      client.query('SELECT LOWER(name) AS lname FROM campaign_locations WHERE campaign_id=$1', [campaignId]),
    ]);
    const norm = (s) => String(s || '').toLowerCase().trim();
    const playerIdByName = new Map(playersR.rows.map(r => [norm(r.player_name), r.id]));
    const npcIdByName = new Map(npcsR.rows.map(r => [norm(r.name), r.id]));
    const relIdByName = new Map(relsR.rows.map(r => [norm(r.name), r.id]));
    const existingLocs = new Set(locsR.rows.map(r => r.lname));

    const tokenFor = (actor) => {
      const n = norm(actor?.name);
      if (!n) return null;
      if (actor.kind === 'npc') { const id = npcIdByName.get(n); return id ? `npc_${id}` : null; }
      if (actor.kind === 'rel') { const id = relIdByName.get(n); return id ? `rel_${id}` : null; }
      const id = playerIdByName.get(n); // player
      if (!id) return null;
      return String(id) === String(player_id) ? `self_${id}` : `cp_${id}`;
    };

    const tlRes = await client.query(
      'INSERT INTO player_timelines (campaign_id, player_id, created_by, name) VALUES ($1,$2,$3,$4) RETURNING id',
      [campaignId, player_id, req.session.userId, (timeline_name || 'Imported Timeline').trim()]
    );
    const tlId = tlRes.rows[0].id;

    let n = 0;
    for (const e of events) {
      const tokens = (e.actors || []).map(tokenFor).filter(Boolean);
      const ids = tokens.length ? tokens : [`self_${player_id}`];
      const loc = e.location || null;
      if (loc && !existingLocs.has(norm(loc))) {
        await client.query(
          'INSERT INTO campaign_locations (campaign_id, name) VALUES ($1,$2) ON CONFLICT (campaign_id, LOWER(name)) DO NOTHING',
          [campaignId, loc]
        );
        existingLocs.add(norm(loc));
      }
      await client.query(
        `INSERT INTO player_timeline_entries
           (campaign_id, player_id, timeline_id, created_by, title, description, location, year, day_of_year, duration_days, player_ids, is_party)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [campaignId, player_id, tlId, req.session.userId,
          e.title || '(untitled)', e.description || null, loc,
          e.year || 1492, e.day_of_year || 1, e.duration_days || 1, ids, !!e.is_party]
      );
      n++;
    }
    await client.query('COMMIT');
    res.json({ success: true, timeline_id: tlId, imported: n });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
});

// DELETE a named timeline (and all its entries via cascade)
app.delete('/api/player-timelines/:timelineId', requireAuth, async (req, res) => {
  const { timelineId } = req.params;
  try {
    // Only creator or DM/admin can delete
    const tl = await pool.query('SELECT * FROM player_timelines WHERE id=$1', [timelineId]);
    if (!tl.rows.length) return res.status(404).json({ error: 'Not found' });
    const t = tl.rows[0];
    if (!await canAccessTimeline(req.session.userId, req.session.role, t.campaign_id, t.player_id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    await pool.query('DELETE FROM player_timelines WHERE id=$1', [timelineId]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST entry into a specific named timeline
app.post('/api/player-timelines/:timelineId/entries', requireAuth, async (req, res) => {
  const { timelineId } = req.params;
  const { title, description, location, year, day_of_year, duration_days, player_ids } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });
  try {
    const tl = await pool.query('SELECT * FROM player_timelines WHERE id=$1', [timelineId]);
    if (!tl.rows.length) return res.status(404).json({ error: 'Timeline not found' });
    const t = tl.rows[0];
    if (!await canAccessTimeline(req.session.userId, req.session.role, t.campaign_id, t.player_id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    // A DM's new event starts hidden — that is the point of the flag. A player
    // writing on their own timeline is not revealing anything to themselves, so
    // theirs stays visible; defaulting it to hidden would make a player unable to
    // see the event they just typed.
    const authoredByDm = ['dm', 'admin'].includes(req.session.role);
    const result = await pool.query(
      `INSERT INTO player_timeline_entries
         (campaign_id, player_id, timeline_id, created_by, title, description, location, year, day_of_year, duration_days, player_ids, visible_to_players)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [t.campaign_id, t.player_id, timelineId, req.session.userId,
        title, description || null, location || null,
      year || 1492, day_of_year || 1, duration_days || 1,
      player_ids && player_ids.length ? player_ids : ['self_' + t.player_id],
      !authoredByDm]
    );
    res.json(result.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT update entry
app.put('/api/player-timelines/:timelineId/entries/:entryId', requireAuth, async (req, res) => {
  const { timelineId, entryId } = req.params;
  const { title, description, location, year, day_of_year, duration_days, player_ids, manual_links } = req.body;
  try {
    const tl = await pool.query('SELECT * FROM player_timelines WHERE id=$1', [timelineId]);
    if (!tl.rows.length) return res.status(404).json({ error: 'Not found' });
    const t = tl.rows[0];
    if (!await canAccessTimeline(req.session.userId, req.session.role, t.campaign_id, t.player_id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const updatePids = player_ids && player_ids.length ? player_ids : null;
    const updateLinks = manual_links != null ? manual_links : null;
    const result = await pool.query(
      `UPDATE player_timeline_entries
       SET title=$1, description=$2, location=$3, year=$4, day_of_year=$5,
           duration_days=$6, player_ids=COALESCE($7, player_ids),
           manual_links=COALESCE($8, manual_links), updated_at=CURRENT_TIMESTAMP
       WHERE id=$9 AND timeline_id=$10 RETURNING *`,
      [title, description || null, location || null, year, day_of_year,
        duration_days || 1, updatePids, updateLinks, entryId, timelineId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Entry not found' });
    res.json(result.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE entry
app.delete('/api/player-timelines/:timelineId/entries/:entryId', requireAuth, async (req, res) => {
  const { timelineId, entryId } = req.params;
  try {
    const tl = await pool.query('SELECT * FROM player_timelines WHERE id=$1', [timelineId]);
    if (!tl.rows.length) return res.status(404).json({ error: 'Not found' });
    const t = tl.rows[0];
    if (!await canAccessTimeline(req.session.userId, req.session.role, t.campaign_id, t.player_id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    await pool.query('DELETE FROM player_timeline_entries WHERE id=$1 AND timeline_id=$2', [entryId, timelineId]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET all timelines for a player in a campaign
// NOTE ON ORDERING: this must stay ABOVE `/:campaignId/:playerId` below.
// Express matches in registration order, and `public-token` is a perfectly good
// :playerId — registered after it, this route never ran and every call came back
// 403 from the other handler's access check. `/all`, `/entries` and `/export`
// live up here for the same reason.
// DM generates / retrieves a stable token scoped to ONE timeline. Unlike the
// campaign token above, this one reveals that timeline and nothing else.
app.get('/api/player-timelines/:timelineId/public-token', requireRole(['dm', 'admin']), async (req, res) => {
  const { timelineId } = req.params;
  try {
    const tl = await pool.query('SELECT * FROM player_timelines WHERE id=$1', [timelineId]);
    if (!tl.rows.length) return res.status(404).json({ error: 'Timeline not found' });
    const t = tl.rows[0];
    if (!await canAccessTimeline(req.session.userId, req.session.role, t.campaign_id, t.player_id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const existing = await pool.query('SELECT token FROM player_timeline_shares WHERE timeline_id=$1', [timelineId]);
    if (existing.rows.length) return res.json({ token: existing.rows[0].token, scope: 'timeline' });
    const token = hashId(parseInt(timelineId)) + crypto.randomBytes(4).toString('hex');
    await pool.query('INSERT INTO player_timeline_shares (timeline_id, token) VALUES ($1,$2)', [timelineId, token]);
    res.json({ token, scope: 'timeline' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/player-timelines/:campaignId/:playerId', requireAuth, async (req, res) => {
  const { campaignId, playerId } = req.params;
  try {
    if (!await canAccessTimeline(req.session.userId, req.session.role, campaignId, playerId)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const result = await pool.query(
      `SELECT pt.*, COUNT(pte.id)::int as entry_count
       FROM player_timelines pt
       LEFT JOIN player_timeline_entries pte ON pte.timeline_id = pt.id
       WHERE pt.campaign_id=$1 AND pt.player_id=$2
       GROUP BY pt.id ORDER BY pt.created_at ASC`,
      [campaignId, playerId]
    );
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST create a new named timeline for a player
app.post('/api/player-timelines/:campaignId/:playerId', requireAuth, async (req, res) => {
  const { campaignId, playerId } = req.params;
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Timeline name required' });
  try {
    if (!await canAccessTimeline(req.session.userId, req.session.role, campaignId, playerId)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const result = await pool.query(
      'INSERT INTO player_timelines (campaign_id, player_id, created_by, name) VALUES ($1,$2,$3,$4) RETURNING *',
      [campaignId, playerId, req.session.userId, name]
    );
    res.json(result.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================
// PRIVATE TIMELINE API (DB-backed, per player)
// ============================================

// Helper: can this user access a player's timeline?
// Delegates rather than hand-rolling its own queries, so the trash guard and the
// admin ordering live in exactly one place (see dmOwnsCampaign / ownsPlayer).
async function canAccessTimeline(userId, userRole, campaignId, playerId) {
  if (userRole === 'dm' || userRole === 'admin') {
    return dmOwnsCampaign(campaignId, userId, userRole);
  }
  // Player. `playerId` is genuinely absent on the campaign-wide listing route,
  // which used to reach parseInt(null) → NaN → a rejected integer bind → a 500
  // where it meant 403. A player has no campaign-wide timeline view, so this is
  // simply a denial.
  if (playerId === null || playerId === undefined) return false;
  return ownsPlayer(userId, playerId);
}

// ── Diary (session summaries) ───────────────────────────────────────────────
// Two halves with deliberately different privacy:
//   campaign_diary_entries — the DM's write-ups. Players never see these in the
//     app at all; they reach them only through a public share link, and only
//     once published.
//   player_diary_entries   — private to the owning player. The campaign's DM may
//     READ them (so they can weave player notes into prep) but never write them:
//     "private" should not mean somebody else can rewrite it.

// ── Campaign access ──────────────────────────────────────────────────────────
//
// EVERY campaign-scoped route goes through one of the helpers below. That is the
// rule, and `test/campaignAuth.test.js` enforces it by walking the route table.
//
// It had to become a rule because `requireRole(['dm'])` answers "is this user a
// DM somewhere", not "is this user the DM of THIS campaign" — and 43 routes were
// relying on it as though it answered the second question. Any DM could read or
// edit any other DM's locations, NPCs, journey maps, character tree and player
// sheets by incrementing an id.
//
// Each helper decides two things, in this order:
//   1. the campaign is not in the trash — checked BEFORE any admin
//      short-circuit, because a trash an admin walks straight through is not a
//      trash. This is what makes the soft delete an access boundary rather than
//      just a filter on the campaign list;
//   2. the caller owns the campaign, or (for a player) is assigned to it.
//
// `includeTrashed` has exactly two legitimate callers — the campaign export and
// the campaign-diary export — so that "export it before you purge it" still
// works. Both are read-only. Nothing else should pass it.

/**
 * DM owns the campaign; admin passes; a trashed campaign belongs to nobody.
 * One query: the row carries both the existence/trash answer and the owner.
 */
async function dmOwnsCampaign(campaignId, userId, role, opts = {}) {
  const r = await pool.query(
    `SELECT dm_user_id FROM campaigns
      WHERE id=$1${opts.includeTrashed ? '' : ' AND deleted_at IS NULL'}`,
    [campaignId],
  );
  if (!r.rows.length) return false;
  if (role === 'admin') return true;
  return Number(r.rows[0].dm_user_id) === Number(userId);
}

/**
 * The canonical "does this user own this player" check.
 * Joined up to `campaigns` so a trashed campaign's players are unreachable too —
 * campaign_user_assignments has no campaign_id of its own, hence the two hops.
 */
async function ownsPlayer(userId, playerId) {
  const r = await pool.query(
    `SELECT cua.id FROM campaign_user_assignments cua
       JOIN campaign_players cp ON cp.id = cua.player_id
       JOIN campaigns c ON c.id = cp.campaign_id
      WHERE cua.player_id=$1 AND cua.user_id=$2 AND c.deleted_at IS NULL`,
    [parseInt(playerId), parseInt(userId)],
  );
  return r.rows.length > 0;
}

/** Is this user a player in this campaign? The player-side counterpart of dmOwnsCampaign. */
async function playerInCampaign(userId, campaignId) {
  const r = await pool.query(
    `SELECT 1 FROM campaign_players cp
       JOIN campaign_user_assignments cua ON cua.player_id = cp.id
       JOIN campaigns c ON c.id = cp.campaign_id
      WHERE cp.campaign_id=$1 AND cua.user_id=$2 AND c.deleted_at IS NULL
      LIMIT 1`,
    [campaignId, userId],
  );
  return r.rows.length > 0;
}

/**
 * For the handful of routes a player may legitimately reach: the campaign's DM
 * (or an admin) passes, and so does anyone playing in it. Row-level filtering —
 * `is_public`, visibility flags — is still the handler's job; this only answers
 * "are you entitled to ask about this campaign at all".
 */
async function canAccessCampaign(campaignId, userId, role) {
  if (role === 'dm' || role === 'admin') return dmOwnsCampaign(campaignId, userId, role);
  return playerInCampaign(userId, campaignId);
}

/**
 * A shared link is for the table, not for the world.
 *
 * The five token-gated surfaces — journey map, timeline, PC sheet, diary and
 * its roster — used to take a token and nothing else, so anyone holding the
 * URL could read the content. They now additionally require a logged-in member
 * of that campaign. The token still decides WHICH thing you are asking for,
 * and revoking it still works; it just stopped being the only thing standing
 * between a campaign and a stranger.
 *
 * Not middleware: in four of the five the campaign id is only known after a
 * query, and `requireAuth` answers with a bare `Unauthorized` and no `code` —
 * the pages need to tell "log in" from "wrong account" to know which of the
 * two things to offer.
 *
 * Call it AFTER the token has been resolved, never before. A dead link must
 * keep reading as a dead link: answering 401 for a revoked token would send
 * someone to log in for something that no longer exists.
 *
 * Returns null when the viewer may read, or the response body to send.
 */
async function shareGate(req, campaignId) {
  if (!req.session.userId) {
    return {
      status: 401,
      code: 'LOGIN_REQUIRED',
      error: 'Log in to see this \u2014 it is shared with the campaign\u2019s players.',
    };
  }
  if (!await canAccessCampaign(campaignId, req.session.userId, req.session.role)) {
    return {
      status: 403,
      code: 'NOT_YOUR_CAMPAIGN',
      error: 'This belongs to a campaign you are not in.',
    };
  }
  return null;
}

/** Send a refusal from `shareGate`. Keeps the five call sites to two lines. */
const denyShare = (res, gate) =>
  res.status(gate.status).json({ error: gate.error, code: gate.code });

const DIARY_ORDER = 'ORDER BY session_no ASC NULLS LAST, session_date ASC NULLS LAST, created_at ASC';

// ── Campaign diary (DM only) ──
app.get('/api/campaign-diary/:campaignId/share', requireRole(['dm', 'admin']), async (req, res) => {
  const { campaignId } = req.params;
  try {
    if (!await dmOwnsCampaign(campaignId, req.session.userId, req.session.role))
      return res.status(403).json({ error: 'Access denied' });
    // Stable, not rotating: the DM presses Share mainly to re-copy the URL, and
    // rotating here would silently kill every link already pasted somewhere.
    // Revocation is the separate DELETE below, so it stays a deliberate act.
    const existing = await pool.query('SELECT token FROM campaign_diary_shares WHERE campaign_id=$1', [campaignId]);
    if (existing.rows.length) return res.json({ token: existing.rows[0].token });
    const token = hashId(parseInt(campaignId)) + crypto.randomBytes(4).toString('hex');
    await pool.query('INSERT INTO campaign_diary_shares (campaign_id, token) VALUES ($1,$2)', [campaignId, token]);
    res.json({ token });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/campaign-diary/:campaignId/share', requireRole(['dm', 'admin']), async (req, res) => {
  const { campaignId } = req.params;
  try {
    if (!await dmOwnsCampaign(campaignId, req.session.userId, req.session.role))
      return res.status(403).json({ error: 'Access denied' });
    await pool.query('DELETE FROM campaign_diary_shares WHERE campaign_id=$1', [campaignId]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/campaign-diary/:campaignId', requireRole(['dm', 'admin']), async (req, res) => {
  const { campaignId } = req.params;
  try {
    if (!await dmOwnsCampaign(campaignId, req.session.userId, req.session.role))
      return res.status(403).json({ error: 'Access denied' });
    const r = await pool.query(`SELECT * FROM campaign_diary_entries WHERE campaign_id=$1 ${DIARY_ORDER}`, [campaignId]);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/campaign-diary/:campaignId', requireRole(['dm', 'admin']), async (req, res) => {
  const { campaignId } = req.params;
  const { title, body, session_no, session_date, chapter } = req.body;
  if (!title || !String(title).trim()) return res.status(400).json({ error: 'Title required' });
  if (String(title).length > 255) return res.status(400).json({ error: 'Title too long (max 255)' });
  try {
    if (!await dmOwnsCampaign(campaignId, req.session.userId, req.session.role))
      return res.status(403).json({ error: 'Access denied' });
    // `status` is NOT read from the body — a new entry is always a draft, and
    // the column default is what enforces it.
    const r = await pool.query(
      `INSERT INTO campaign_diary_entries (campaign_id, created_by, title, body, session_no, session_date, chapter)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [campaignId, req.session.userId, String(title).trim(), body || null, session_no || null,
        session_date || null, chapter ? String(chapter).slice(0, 120) : null],
    );
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/campaign-diary/:campaignId/entries/:entryId', requireRole(['dm', 'admin']), async (req, res) => {
  const { campaignId, entryId } = req.params;
  const { title, body, session_no, session_date, chapter } = req.body;
  if (!title || !String(title).trim()) return res.status(400).json({ error: 'Title required' });
  if (String(title).length > 255) return res.status(400).json({ error: 'Title too long (max 255)' });
  try {
    if (!await dmOwnsCampaign(campaignId, req.session.userId, req.session.role))
      return res.status(403).json({ error: 'Access denied' });
    const r = await pool.query(
      `UPDATE campaign_diary_entries
          SET title=$1, body=$2, session_no=$3, session_date=$4, chapter=$5, updated_at=CURRENT_TIMESTAMP
        WHERE id=$6 AND campaign_id=$7 RETURNING *`,
      [String(title).trim(), body || null, session_no || null, session_date || null,
        chapter ? String(chapter).slice(0, 120) : null, entryId, campaignId],
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Entry not found' });
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/campaign-diary/:campaignId/entries/:entryId/status', requireRole(['dm', 'admin']), async (req, res) => {
  const { campaignId, entryId } = req.params;
  const { status } = req.body;
  // Validated here so a typo is a 400 rather than a 500 from the CHECK constraint.
  if (!['draft', 'published'].includes(status))
    return res.status(400).json({ error: "status must be 'draft' or 'published'" });
  try {
    if (!await dmOwnsCampaign(campaignId, req.session.userId, req.session.role))
      return res.status(403).json({ error: 'Access denied' });
    const r = await pool.query(
      `UPDATE campaign_diary_entries
          SET status=$1::varchar,
              -- Set once, on first publish, and kept thereafter: un-publishing to
              -- fix a typo should not reset "published three weeks ago".
              --
              -- The ::varchar casts are load-bearing. Without them Postgres infers
              -- $1 as varchar from the SET above and as text from the comparison
              -- below, then rejects the whole statement with "inconsistent types
              -- deduced for parameter $1" — a 500 on every publish AND unpublish.
              published_at = CASE WHEN $1::varchar='published' AND published_at IS NULL
                                  THEN CURRENT_TIMESTAMP ELSE published_at END,
              updated_at=CURRENT_TIMESTAMP
        WHERE id=$2 AND campaign_id=$3 RETURNING id, status, published_at`,
      [status, entryId, campaignId],
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Entry not found' });
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/campaign-diary/:campaignId/entries/:entryId', requireRole(['dm', 'admin']), async (req, res) => {
  const { campaignId, entryId } = req.params;
  try {
    if (!await dmOwnsCampaign(campaignId, req.session.userId, req.session.role))
      return res.status(403).json({ error: 'Access denied' });
    const r = await pool.query(
      'DELETE FROM campaign_diary_entries WHERE id=$1 AND campaign_id=$2 RETURNING id',
      [entryId, campaignId],
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Entry not found' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Campaign diary: standalone export / import ──
// A diary-only bundle, independent of the full campaign export (which still
// carries the diary too, so a campaign restore loses nothing). Lets a diary be
// backed up or handed to another DM on its own.
app.get('/api/campaign-diary/:campaignId/export', requireRole(['dm', 'admin']), async (req, res) => {
  const { campaignId } = req.params;
  try {
    // includeTrashed: the second of the two export carve-outs. Without it this
    // route would start 403ing on a trashed campaign the moment dmOwnsCampaign
    // gained its deleted_at guard — a silent regression, since nothing else
    // about the diary would look broken.
    if (!await dmOwnsCampaign(campaignId, req.session.userId, req.session.role, { includeTrashed: true }))
      return res.status(403).json({ error: 'Access denied' });
    const [campR, entriesR] = await Promise.all([
      pool.query('SELECT name FROM campaigns WHERE id=$1', [campaignId]),
      pool.query(
        `SELECT title, body, session_no, session_date, status, published_at, chapter
           FROM campaign_diary_entries WHERE campaign_id=$1 ${DIARY_ORDER}`,
        [campaignId],
      ),
    ]);
    // No share token: a token is bound to the campaign it was minted for, so
    // carrying one across would either collide on the UNIQUE constraint or point
    // an already-pasted URL at different content. Every other export does the same.
    res.json({
      version: 1,
      exported_at: new Date().toISOString(),
      type: 'campaign-diary',
      campaign_name: campR.rows[0]?.name || 'Campaign',
      entries: entriesR.rows,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// REPLACES the target campaign's diary — this is a restore, not a merge, so
// re-importing the same file twice leaves the same entries rather than doubling
// them. Destructive by design; the client confirms with real counts first.
app.post('/api/campaign-diary/:campaignId/import', requireRole(['dm', 'admin']), async (req, res) => {
  const { campaignId } = req.params;
  const bundle = req.body;
  // Checked here as well as in the import hub: this is a direct endpoint, and
  // the wrong file type arriving at a destructive route should 400, not delete.
  if (bundle?.type !== 'campaign-diary') return res.status(400).json({ error: 'Not a campaign-diary export file' });
  if (!Array.isArray(bundle.entries)) return res.status(400).json({ error: 'Bundle has no entries array' });
  try {
    if (!await dmOwnsCampaign(campaignId, req.session.userId, req.session.role))
      return res.status(403).json({ error: 'Access denied' });
  } catch (e) { return res.status(500).json({ error: e.message }); }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const del = await client.query('DELETE FROM campaign_diary_entries WHERE campaign_id=$1 RETURNING id', [campaignId]);
    let imported = 0;
    for (const e of bundle.entries) {
      if (!e?.title) continue;
      await client.query(
        `INSERT INTO campaign_diary_entries
           (campaign_id, created_by, title, body, session_no, session_date, status, published_at, chapter)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [campaignId, req.session.userId, String(e.title).slice(0, 255), e.body || null,
          e.session_no ?? null, e.session_date || null,
          // Status travels with the entry: "replace" means restore, so the file
          // is authoritative about what was already published.
          e.status === 'published' ? 'published' : 'draft', e.published_at || null,
          e.chapter ? String(e.chapter).slice(0, 120) : null],
      );
      imported += 1;
    }
    await client.query('COMMIT');
    res.json({ success: true, imported, replaced: del.rowCount });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// Roster for the printed book: the title page names the table, and the annex
// at the back carries each character's portrait and public bio. Fetched
// separately rather than folded into the diary payload — portraits are base64
// and would be dead weight on every page view of a diary nobody is printing.
const ROSTER_SQL = `
  SELECT cp.player_name, pc.name AS character_name,
         pc.picture_data, pc.picture_url, pc.public_info
    FROM campaign_players cp
    LEFT JOIN pc_characters pc ON pc.player_id = cp.id
   WHERE cp.campaign_id = $1 AND cp.is_dm_player = false
   ORDER BY cp.player_name ASC`;

const DM_SQL = `
  SELECT u.username AS dm_name FROM campaigns c
    JOIN users u ON u.id = c.dm_user_id WHERE c.id = $1`;

async function diaryRoster(campaignId) {
  const [dm, roster] = await Promise.all([
    pool.query(DM_SQL, [campaignId]),
    pool.query(ROSTER_SQL, [campaignId]),
  ]);
  // public_info only — never private_info, and never the DM notes. This is the
  // same material the public PC sheet already exposes.
  return { dm_name: dm.rows[0]?.dm_name || null, players: roster.rows };
}

app.get('/api/campaign-diary/:campaignId/roster', requireRole(['dm', 'admin']), async (req, res) => {
  const { campaignId } = req.params;
  try {
    if (!await dmOwnsCampaign(campaignId, req.session.userId, req.session.role))
      return res.status(403).json({ error: 'Access denied' });
    res.json(await diaryRoster(campaignId));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Same roster, for a reader printing from the share link. Token-gated, and it
// returns only what the public PC sheet already exposes.
app.get('/api/diary-public/:token/roster', async (req, res) => {
  try {
    // Resolved through campaigns rather than straight off the share row, so a
    // trashed campaign 404s here exactly as it does on the diary itself. Missing
    // this would have left the roster — player names, portraits and bios —
    // readable from a share link after the campaign was deleted.
    const share = await pool.query(
      `SELECT s.campaign_id FROM campaign_diary_shares s
         JOIN campaigns c ON c.id = s.campaign_id
        WHERE s.token=$1 AND c.deleted_at IS NULL`,
      [req.params.token]
    );
    if (!share.rows.length) return res.status(404).json({ error: 'Not found' });
    const gate = await shareGate(req, share.rows[0].campaign_id);
    if (gate) return denyShare(res, gate);
    res.json(await diaryRoster(share.rows[0].campaign_id));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Player diaries ──
// NOTE ON ORDERING: this must stay ABOVE `/:campaignId/:playerId` below.
// `all` is a perfectly good :playerId — registered after it, this route never
// runs and every DM call comes back 403 from the other handler's access check.
// Exactly the trap that broke /api/player-timelines/:timelineId/public-token;
// test/routeOrder.test.js fails if this is ever reordered.
app.get('/api/player-diary/:campaignId/all', requireRole(['dm', 'admin']), async (req, res) => {
  const { campaignId } = req.params;
  try {
    if (!await dmOwnsCampaign(campaignId, req.session.userId, req.session.role))
      return res.status(403).json({ error: 'Access denied' });
    // is_dm_player excluded: the DM's own writing belongs in the campaign diary,
    // and their pseudo-player is hidden from every other player-facing list too.
    const r = await pool.query(
      `SELECT pde.*, cp.player_name
         FROM player_diary_entries pde
         JOIN campaign_players cp ON cp.id = pde.player_id
        WHERE pde.campaign_id=$1 AND cp.is_dm_player = false
        ORDER BY cp.player_name ASC, pde.session_no ASC NULLS LAST,
                 pde.session_date ASC NULLS LAST, pde.created_at ASC`,
      [campaignId],
    );
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/player-diary/:campaignId/:playerId', requireAuth, async (req, res) => {
  const { campaignId, playerId } = req.params;
  try {
    // Reads reuse canAccessTimeline verbatim — it already encodes
    // DM-owns-campaign OR player-owns-row OR admin, which is exactly the rule.
    if (!await canAccessTimeline(req.session.userId, req.session.role, campaignId, playerId))
      return res.status(403).json({ error: 'Access denied' });
    const r = await pool.query(
      `SELECT * FROM player_diary_entries WHERE campaign_id=$1 AND player_id=$2 ${DIARY_ORDER}`,
      [campaignId, playerId],
    );
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Writes are owner-only, NOT canAccessTimeline: that returns true for the
// campaign's DM, which would let them edit a diary labelled private.
app.post('/api/player-diary/:campaignId/:playerId', requireAuth, async (req, res) => {
  const { campaignId, playerId } = req.params;
  const { title, body, session_no, session_date, category } = req.body;
  if (!title || !String(title).trim()) return res.status(400).json({ error: 'Title required' });
  if (String(title).length > 255) return res.status(400).json({ error: 'Title too long (max 255)' });
  try {
    if (!await ownsPlayer(req.session.userId, playerId))
      return res.status(403).json({ error: 'Access denied' });
    // canAccessTimeline's player branch never checks that the player belongs to
    // the campaign in the path, so without this a row could be created with a
    // mismatched campaign_id and then be invisible to every scoped query.
    const cp = await pool.query('SELECT campaign_id FROM campaign_players WHERE id=$1', [playerId]);
    if (!cp.rows.length || String(cp.rows[0].campaign_id) !== String(campaignId))
      return res.status(400).json({ error: 'Player does not belong to that campaign' });
    const r = await pool.query(
      `INSERT INTO player_diary_entries (campaign_id, player_id, created_by, title, body, session_no, session_date, category)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [campaignId, playerId, req.session.userId, String(title).trim(), body || null, session_no || null,
        session_date || null, category ? String(category).slice(0, 120) : null],
    );
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/player-diary/:campaignId/:playerId/entries/:entryId', requireAuth, async (req, res) => {
  const { campaignId, playerId, entryId } = req.params;
  const { title, body, session_no, session_date, category } = req.body;
  if (!title || !String(title).trim()) return res.status(400).json({ error: 'Title required' });
  if (String(title).length > 255) return res.status(400).json({ error: 'Title too long (max 255)' });
  try {
    if (!await ownsPlayer(req.session.userId, playerId))
      return res.status(403).json({ error: 'Access denied' });
    // Scoped by entry AND player AND campaign. The guard above only proves the
    // caller owns the player they NAMED — this is what stops them naming their
    // own player while addressing somebody else's entry id.
    const r = await pool.query(
      `UPDATE player_diary_entries
          SET title=$1, body=$2, session_no=$3, session_date=$4, category=$5, updated_at=CURRENT_TIMESTAMP
        WHERE id=$6 AND player_id=$7 AND campaign_id=$8 RETURNING *`,
      [String(title).trim(), body || null, session_no || null, session_date || null,
        category ? String(category).slice(0, 120) : null, entryId, playerId, campaignId],
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Entry not found' });
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/player-diary/:campaignId/:playerId/entries/:entryId', requireAuth, async (req, res) => {
  const { campaignId, playerId, entryId } = req.params;
  try {
    if (!await ownsPlayer(req.session.userId, playerId))
      return res.status(403).json({ error: 'Access denied' });
    const r = await pool.query(
      'DELETE FROM player_diary_entries WHERE id=$1 AND player_id=$2 AND campaign_id=$3 RETURNING id',
      [entryId, playerId, campaignId],
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Entry not found' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Public diary read — token only, no auth ──
app.get('/api/diary-public/:token', async (req, res) => {
  try {
    const share = await pool.query('SELECT campaign_id FROM campaign_diary_shares WHERE token=$1', [req.params.token]);
    // Unknown and revoked tokens are the same generic 404 — "this link was
    // revoked" would confirm the campaign exists to anyone guessing.
    if (!share.rows.length) return res.status(404).json({ error: 'Not found' });
    const campaignId = share.rows[0].campaign_id;
    const gate = await shareGate(req, campaignId);
    if (gate) return denyShare(res, gate);

    const [campR, entriesR] = await Promise.all([
      pool.query('SELECT name FROM campaigns WHERE id=$1 AND deleted_at IS NULL', [campaignId]),
      // Explicit columns, never SELECT *: a DM-only column added to this table
      // later must not start leaking merely by existing. No created_by (a user
      // id), no status (nothing left to say once filtered), no edit timestamps.
      //
      // The draft filter is in SQL, per the house rule that withheld rows never
      // reach the browser. This query also names only campaign_diary_entries —
      // player diaries are a different table and are unreachable from here.
      pool.query(
        `SELECT id, title, body, session_no, session_date, published_at, chapter
           FROM campaign_diary_entries
          WHERE campaign_id=$1 AND status='published'
          ORDER BY session_no ASC NULLS LAST, session_date ASC NULLS LAST, created_at ASC`,
        [campaignId],
      ),
    ]);

    // A trashed campaign reads as a dead link: the same generic 404 as an
    // unknown token, so a share URL stops working the moment the DM deletes
    // the campaign and works again if they restore it.
    if (!campR.rows.length) return res.status(404).json({ error: 'Not found' });

    // Session-blind on purpose: unlike the public journey map this never tailors
    // its output to a logged-in cookie, so "did we leak?" stays reproducible
    // with a cookie-less curl.
    res.json({
      campaign_name: campR.rows[0].name,
      entries: entriesR.rows,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// NOTE: the /api/timeline-private/* routes were removed here.
// They were an orphaned surface: the DM's private journal is served by the
// regular /api/player-timelines/* endpoints (the UI filters by timeline name),
// and nothing had called timeline-private since the React migration.

// ── Party timeline events (campaign-wide; DM-authored, shown to everyone) ──
// One entry with no owning player/timeline (is_party=true); surfaces as a shared
// "Party" lane in the combined + public views and alongside a player's own events.
app.get('/api/timeline-party/:campaignId', requireAuth, async (req, res) => {
  const { campaignId } = req.params;
  try {
    if (!await canAccessCampaign(req.params.campaignId, req.session.userId, req.session.role))
      return res.status(403).json({ error: 'Access denied' });
    // Any member of the campaign may read party events.
    if (req.session.role !== 'dm' && req.session.role !== 'admin') {
      const m = await pool.query(
        `SELECT 1 FROM campaign_players cp
         JOIN campaign_user_assignments cua ON cua.player_id = cp.id
         WHERE cp.campaign_id=$1 AND cua.user_id=$2 LIMIT 1`,
        [campaignId, req.session.userId]
      );
      if (!m.rows.length) return res.status(403).json({ error: 'Access denied' });
    }
    const canSeeHidden = ['dm', 'admin'].includes(req.session.role);
    const r = await pool.query(
      `SELECT * FROM player_timeline_entries
       WHERE campaign_id=$1 AND is_party=true
         ${canSeeHidden ? '' : 'AND visible_to_players = true'}
       ORDER BY year ASC, day_of_year ASC`,
      [campaignId]
    );
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/timeline-party/:campaignId', requireRole(['dm', 'admin']), async (req, res) => {
  const { campaignId } = req.params;
  const { title, description, location, year, day_of_year, duration_days, player_ids, manual_links } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });
  try {
    if (!await dmOwnsCampaign(req.params.campaignId, req.session.userId, req.session.role))
      return res.status(403).json({ error: 'Access denied' });
    const r = await pool.query(
      `INSERT INTO player_timeline_entries
         (campaign_id, player_id, timeline_id, created_by, title, description, location,
          year, day_of_year, duration_days, player_ids, manual_links, is_party)
       VALUES ($1,NULL,NULL,$2,$3,$4,$5,$6,$7,$8,$9,$10,true) RETURNING *`,
      [campaignId, req.session.userId, title, description || null, location || null,
        year || 1492, day_of_year || 1, duration_days || 1, player_ids || [], manual_links || []]
    );
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/timeline-party/:campaignId/:entryId', requireRole(['dm', 'admin']), async (req, res) => {
  const { campaignId, entryId } = req.params;
  const { title, description, location, year, day_of_year, duration_days, player_ids, manual_links } = req.body;
  try {
    if (!await dmOwnsCampaign(req.params.campaignId, req.session.userId, req.session.role))
      return res.status(403).json({ error: 'Access denied' });
    const r = await pool.query(
      `UPDATE player_timeline_entries
       SET title=$1, description=$2, location=$3, year=$4, day_of_year=$5,
           duration_days=$6, player_ids=COALESCE($7, player_ids), manual_links=$8, updated_at=CURRENT_TIMESTAMP
       WHERE id=$9 AND campaign_id=$10 AND is_party=true RETURNING *`,
      [title, description || null, location || null, year, day_of_year, duration_days || 1,
        player_ids || null, manual_links || [], entryId, campaignId]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Entry not found' });
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/timeline-party/:campaignId/:entryId', requireRole(['dm', 'admin']), async (req, res) => {
  const { campaignId, entryId } = req.params;
  try {
    if (!await dmOwnsCampaign(req.params.campaignId, req.session.userId, req.session.role))
      return res.status(403).json({ error: 'Access denied' });
    await pool.query('DELETE FROM player_timeline_entries WHERE id=$1 AND campaign_id=$2 AND is_party=true', [entryId, campaignId]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


// ============================================
// IMAGE PROXY (CORS bypass for html2canvas print)
// ============================================

app.get('/api/proxy-image', requireAuth, async (req, res) => {
  const url = req.query.url;
  if (!url || !/^https?:\/\//.test(url)) {
    return res.status(400).send('Bad URL');
  }
  try {
    const https = require('https');
    const http = require('http');
    const client = url.startsWith('https') ? https : http;
    const request = client.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (imgRes) => {
      const ct = imgRes.headers['content-type'] || 'image/jpeg';
      if (!ct.startsWith('image/')) return res.status(400).send('Not an image');
      res.setHeader('Content-Type', ct);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      imgRes.pipe(res);
    });
    request.on('error', () => res.status(502).send('Upstream error'));
  } catch (e) {
    res.status(500).send('Proxy error');
  }
});

// PUT update campaign meta (add calendar_type support)


// ── Timeline combined-view public share ──

// DM generates / retrieves a stable hashed token for a campaign's combined timeline
app.get('/api/campaigns/:campaignId/public-token', requireRole(['dm', 'admin']), async (req, res) => {
  const { campaignId } = req.params;
  try {
    // Via the helper, not a hand-rolled query: the old inline version was wrapped
    // in `if (role === 'dm')`, so an admin skipped the ownership check entirely —
    // and it would never have inherited the trash guard.
    if (!await dmOwnsCampaign(campaignId, req.session.userId, req.session.role))
      return res.status(403).json({ error: 'Access denied' });
    // Upsert share token — deterministic hash of campaignId so same token on repeat calls
    const token = hashId(parseInt(campaignId)) + crypto.randomBytes(4).toString('hex');
    const existing = await pool.query('SELECT token FROM campaign_timeline_shares WHERE campaign_id=$1', [campaignId]);
    let finalToken;
    if (existing.rows.length) {
      finalToken = existing.rows[0].token; // reuse stable token
    } else {
      await pool.query('INSERT INTO campaign_timeline_shares (campaign_id, token) VALUES ($1,$2)', [campaignId, token]);
      finalToken = token;
    }
    res.json({ token: finalToken });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DM reveals / hides one event to the players. DM-only by design: the flag is
// the DM's editorial control over what the party has learned.
app.patch('/api/player-timelines/:timelineId/entries/:entryId/visibility',
  requireRole(['dm', 'admin']), async (req, res) => {
    const { timelineId, entryId } = req.params;
    const { visible } = req.body;
    try {
      const tl = await pool.query('SELECT * FROM player_timelines WHERE id=$1', [timelineId]);
      if (!tl.rows.length) return res.status(404).json({ error: 'Timeline not found' });
      const t = tl.rows[0];
      if (!await canAccessTimeline(req.session.userId, req.session.role, t.campaign_id, t.player_id)) {
        return res.status(403).json({ error: 'Access denied' });
      }
      const r = await pool.query(
        'UPDATE player_timeline_entries SET visible_to_players=$1 WHERE id=$2 AND timeline_id=$3 RETURNING id, visible_to_players',
        [!!visible, entryId, timelineId],
      );
      if (!r.rows.length) return res.status(404).json({ error: 'Entry not found' });
      res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

// Same, for a party event (campaign-scoped, no owning timeline).
app.patch('/api/timeline-party/:campaignId/:entryId/visibility',
  requireRole(['dm', 'admin']), async (req, res) => {
    const { campaignId, entryId } = req.params;
    const { visible } = req.body;
    try {
      // Helper, not an inline `if (role === 'dm')` block — that let an admin
      // past without any ownership check at all.
      if (!await dmOwnsCampaign(campaignId, req.session.userId, req.session.role))
        return res.status(403).json({ error: 'Access denied' });
      const r = await pool.query(
        'UPDATE player_timeline_entries SET visible_to_players=$1 WHERE id=$2 AND campaign_id=$3 AND is_party=true RETURNING id, visible_to_players',
        [!!visible, entryId, campaignId],
      );
      if (!r.rows.length) return res.status(404).json({ error: 'Entry not found' });
      res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

// Public read-only combined data — no auth required
app.get('/api/timeline-public/:token', async (req, res) => {
  try {
    // Two kinds of token: campaign-wide (every player's timeline) and
    // timeline-scoped (exactly one). Resolve the campaign one first, then fall
    // back to a per-timeline share.
    let campaignId = null;
    let onlyTimelineId = null;
    const share = await pool.query('SELECT campaign_id FROM campaign_timeline_shares WHERE token=$1', [req.params.token]);
    if (share.rows.length) {
      campaignId = share.rows[0].campaign_id;
    } else {
      const tShare = await pool.query(
        `SELECT pts.timeline_id, pt.campaign_id
         FROM player_timeline_shares pts
         JOIN player_timelines pt ON pt.id = pts.timeline_id
         WHERE pts.token=$1`,
        [req.params.token],
      );
      if (!tShare.rows.length) return res.status(404).json({ error: 'Not found' });
      onlyTimelineId = tShare.rows[0].timeline_id;
      campaignId = tShare.rows[0].campaign_id;
    }

    const gate = await shareGate(req, campaignId);
    if (gate) return denyShare(res, gate);

    const [metaR, entriesR] = await Promise.all([
      pool.query(
        `SELECT c.name, COALESCE(cm.calendar_type,'harptos') AS calendar_type,
                cm.today_marker
         FROM campaigns c
         LEFT JOIN campaign_meta cm ON cm.campaign_id = c.id
         WHERE c.id=$1 AND c.deleted_at IS NULL`,
        [campaignId]
      ),
      pool.query(
        `SELECT * FROM (
           SELECT pt.id as timeline_id, pt.name as timeline_name,
                  cp.id as player_id, cp.player_name,
                  pte.id as entry_id, pte.title, pte.description,
                  pte.location, pte.year, pte.day_of_year, pte.duration_days,
                  pte.player_ids, pte.manual_links, pte.is_party
           FROM player_timelines pt
           JOIN campaign_players cp ON pt.player_id = cp.id
           LEFT JOIN player_timeline_entries pte
             ON pte.timeline_id = pt.id
            AND pte.visible_to_players = true
           WHERE pt.campaign_id=$1
             AND cp.is_dm_player = false
             ${onlyTimelineId ? 'AND pt.id = $2' : ''}
           UNION ALL
           SELECT NULL::int as timeline_id, '🌍 Party' as timeline_name,
                  NULL::int as player_id, 'Party' as player_name,
                  pte.id as entry_id, pte.title, pte.description,
                  pte.location, pte.year, pte.day_of_year, pte.duration_days,
                  pte.player_ids, pte.manual_links, pte.is_party
           FROM player_timeline_entries pte
           WHERE pte.campaign_id=$1 AND pte.is_party=true
             AND pte.visible_to_players = true
             -- Excluded from a timeline-scoped share: party events belong to the
             -- whole campaign, and a link that claims to show one timeline must
             -- not quietly carry campaign-wide content to an unauthenticated
             -- reader. The campaign-wide token still includes them.
             ${onlyTimelineId ? 'AND false' : ''}
         ) sub
         ORDER BY player_name, timeline_name, year ASC, day_of_year ASC`,
        onlyTimelineId ? [campaignId, onlyTimelineId] : [campaignId]
      )
    ]);

    // The campaign query is filtered on deleted_at, so no row here means the
    // campaign is in the trash. It must 404 rather than fall through: the
    // optional chaining below would otherwise have served every entry under the
    // placeholder name "Campaign".
    if (!metaR.rows.length) return res.status(404).json({ error: 'Not found' });

    res.json({
      campaign_name: metaR.rows[0].name,
      calendar_type: metaR.rows[0].calendar_type || 'harptos',
      // Campaign-wide and non-sensitive; without it the public view drew no
      // Today marker at all, so "where are we now?" was unanswerable there.
      today_marker: metaR.rows[0].today_marker ?? null,
      rows: entriesR.rows
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Page routes ───────────────────────────────────────────────────────────────
// All modules are now React-owned (served by the SPA catch-all). Their legacy
// vanilla-JS page routes were removed as each was migrated:
//   ✅ /user-panel /npc-sheet /item-cards /split-view /pdf-viewer
//      /manage-campaigns /pc-sheet (v4.1.0–4.6.0)
//   ✅ /pc-public /journey-map-public /journey-map (v4.7.0–4.9.0)
//   ✅ /timeline + /timeline-public/:token (v4.10.0)
// Role enforcement for /timeline is handled client-side (ProtectedRoute) plus
// the per-request API role checks. The /api/* endpoints are unchanged.

// ============================================
// PC CHARACTER SHEET API
// ============================================

/**
 * Can this user access a player's PC data?
 *
 * This used to open with `if (userRole === 'dm') return true;` and no query at
 * all, which meant any DM could read or write ANY player's character sheet,
 * portrait, relationships, DM notes, stats and export bundle — in any campaign,
 * belonging to any other DM — just by guessing a playerId. Fifteen routes hung
 * off it. It is now a real check: the player's campaign is looked up and the DM
 * must be that campaign's DM.
 *
 * It also had no admin branch, so admins were the one role LOCKED OUT of PC
 * routes — the inverse of every other helper here. Admins now pass, consistently.
 */
async function canAccessPC(userId, userRole, playerId) {
  const pid = parseInt(playerId);
  if (!Number.isFinite(pid)) return false;
  const r = await pool.query(
    `SELECT c.dm_user_id FROM campaign_players cp
       JOIN campaigns c ON c.id = cp.campaign_id
      WHERE cp.id = $1 AND c.deleted_at IS NULL`,
    [pid],
  );
  if (!r.rows.length) return false;
  if (userRole === 'admin') return true;
  if (userRole === 'dm') return Number(r.rows[0].dm_user_id) === Number(userId);
  return ownsPlayer(userId, pid);
}

// Get character data
app.get('/api/pc/:playerId', requireAuth, async (req, res) => {
  const { playerId } = req.params;
  try {
    if (!await canAccessPC(req.session.userId, req.session.role, playerId)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const result = await pool.query('SELECT * FROM pc_characters WHERE player_id = $1', [playerId]);
    res.json(result.rows[0] || null);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// Create or update character data
app.put('/api/pc/:playerId', requireAuth, async (req, res) => {
  const { playerId } = req.params;
  const { picture_url, name, story, traits, flaws, goals, public_info, private_info } = req.body;
  try {
    if (!await canAccessPC(req.session.userId, req.session.role, playerId)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const existing = await pool.query('SELECT id FROM pc_characters WHERE player_id = $1', [playerId]);
    let result;
    if (existing.rows.length === 0) {
      result = await pool.query(
        `INSERT INTO pc_characters (player_id, name, picture_url, picture_data, story, traits, flaws, goals, public_info, private_info)
         VALUES ($1,$2,$3,NULL,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [playerId, name, picture_url, story, traits, flaws, goals, public_info, private_info]
      );
    } else {
      // If a URL is provided, clear the uploaded picture_data; if URL is empty, keep existing picture_data
      const clearData = picture_url && picture_url.trim() ? 'NULL' : 'picture_data';
      result = await pool.query(
        `UPDATE pc_characters SET name=$1, picture_url=$2, picture_data=${clearData}, story=$3, traits=$4, flaws=$5, goals=$6,
         public_info=$7, private_info=$8, updated_at=CURRENT_TIMESTAMP
         WHERE player_id=$9 RETURNING *`,
        [name, picture_url, story, traits, flaws, goals, public_info, private_info, playerId]
      );
    }
    res.json(result.rows[0]);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// Upload portrait image (base64, stored in DB)
app.post('/api/pc/:playerId/portrait', requireAuth, async (req, res) => {
  const { playerId } = req.params;
  try {
    if (!await canAccessPC(req.session.userId, req.session.role, playerId)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const { data, mimeType } = req.body; // data = base64 string, mimeType = e.g. 'image/png'
    if (!data || !mimeType) return res.status(400).json({ error: 'Missing image data or mimeType' });

    const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!ALLOWED_TYPES.includes(mimeType)) {
      return res.status(400).json({ error: 'Invalid image type. Use JPEG, PNG, GIF, or WebP.' });
    }

    // Enforce 500 KB size limit on base64 payload (base64 ~4/3 raw bytes)
    const MAX_B64_CHARS = Math.ceil(500 * 1024 * (4 / 3));
    if (data.length > MAX_B64_CHARS) {
      return res.status(400).json({ error: 'Image exceeds 500 KB limit.' });
    }

    const dataUri = `data:${mimeType};base64,${data}`;

    // Upsert: ensure character row exists, then save picture_data and clear picture_url
    const existing = await pool.query('SELECT id FROM pc_characters WHERE player_id = $1', [playerId]);
    let result;
    if (existing.rows.length === 0) {
      result = await pool.query(
        `INSERT INTO pc_characters (player_id, picture_data, picture_url, updated_at)
         VALUES ($1, $2, NULL, CURRENT_TIMESTAMP) RETURNING *`,
        [playerId, dataUri]
      );
    } else {
      result = await pool.query(
        `UPDATE pc_characters SET picture_data=$1, picture_url=NULL, updated_at=CURRENT_TIMESTAMP
         WHERE player_id=$2 RETURNING *`,
        [dataUri, playerId]
      );
    }
    res.json({ picture_data: result.rows[0].picture_data });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// Get relationships
app.get('/api/pc/:playerId/relationships', requireAuth, async (req, res) => {
  const { playerId } = req.params;
  try {
    if (!await canAccessPC(req.session.userId, req.session.role, playerId)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const charResult = await pool.query('SELECT id FROM pc_characters WHERE player_id = $1', [playerId]);
    if (charResult.rows.length === 0) return res.json({ relationships: [], cross_connections: [] });
    const charId = charResult.rows[0].id;
    const isDM = req.session.role === 'dm' || req.session.role === 'admin';
    const query = isDM
      ? 'SELECT * FROM pc_relationships WHERE character_id = $1 ORDER BY created_at ASC'
      : 'SELECT * FROM pc_relationships WHERE character_id = $1 AND is_dm_only = false ORDER BY created_at ASC';
    const result = await pool.query(query, [charId]);

    // Fetch cross-connections involving this player — any combination of player/relationship/npc
    let publicCross = [];
    const campaignRes = await pool.query(
      'SELECT cp.campaign_id FROM campaign_players cp WHERE cp.id = $1', [playerId]
    );
    if (campaignRes.rows.length > 0) {
      const campaignId = campaignRes.rows[0].campaign_id;
      const relIds = result.rows.map(r => r.id);
      const crossRes = await pool.query(
        `SELECT DISTINCT ON (cr.id) cr.*,
           pr_from.name AS from_rel_name, cp_from.player_name AS from_player_name,
           pr_to.name AS to_rel_name, cp_to.player_name AS to_player_name,
           cp_pl_from.player_name AS from_entity_player_name,
           cp_pl_to.player_name AS to_entity_player_name,
           npc_from.name AS from_npc_name,
           npc_to.name AS to_npc_name
         FROM character_relationships cr
         LEFT JOIN pc_relationships pr_from ON cr.from_entity_type = 'relationship' AND cr.from_entity_id = pr_from.id
         LEFT JOIN pc_characters pcc_from ON pr_from.character_id = pcc_from.id
         LEFT JOIN campaign_players cp_from ON pcc_from.player_id = cp_from.id
         LEFT JOIN pc_relationships pr_to ON cr.to_entity_type = 'relationship' AND cr.to_entity_id = pr_to.id
         LEFT JOIN pc_characters pcc_to ON pr_to.character_id = pcc_to.id
         LEFT JOIN campaign_players cp_to ON pcc_to.player_id = cp_to.id
         LEFT JOIN campaign_players cp_pl_from ON cr.from_entity_type = 'player' AND cr.from_entity_id = cp_pl_from.id
         LEFT JOIN campaign_players cp_pl_to ON cr.to_entity_type = 'player' AND cr.to_entity_id = cp_pl_to.id
         LEFT JOIN campaign_npcs npc_from ON cr.from_entity_type = 'npc' AND cr.from_entity_id = npc_from.id
         LEFT JOIN campaign_npcs npc_to ON cr.to_entity_type = 'npc' AND cr.to_entity_id = npc_to.id
         WHERE cr.campaign_id = $1
           ${isDM ? '' : 'AND cr.is_public = true'}
           AND (
             (cr.from_entity_type = 'relationship' AND cr.from_entity_id = ANY($2::int[]))
             OR (cr.to_entity_type   = 'relationship' AND cr.to_entity_id   = ANY($2::int[]))
             OR (cr.from_entity_type = 'player'       AND cr.from_entity_id = $3)
             OR (cr.to_entity_type   = 'player'       AND cr.to_entity_id   = $3)
           )
         ORDER BY cr.id`,
        [campaignId, relIds.length ? relIds : [0], parseInt(playerId)]
      );
      publicCross = crossRes.rows.map(row => {
        if (!isDM) { const r = { ...row }; delete r.notes; return r; }
        return row;
      });
    }

    res.json({ relationships: result.rows, cross_connections: publicCross });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// Add relationship
app.post('/api/pc/:playerId/relationships', requireAuth, async (req, res) => {
  const { playerId } = req.params;
  const { name, relation_type, link, is_family, is_dm_only, parent_id, status_label } = req.body;
  try {
    if (!await canAccessPC(req.session.userId, req.session.role, playerId)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    let charId;
    const charResult = await pool.query('SELECT id FROM pc_characters WHERE player_id = $1', [playerId]);
    if (charResult.rows.length === 0) {
      const newChar = await pool.query(
        'INSERT INTO pc_characters (player_id) VALUES ($1) RETURNING id', [playerId]
      );
      charId = newChar.rows[0].id;
    } else {
      charId = charResult.rows[0].id;
    }
    const created_by_role = req.session.role === 'dm' || req.session.role === 'admin' ? 'dm' : 'player';
    const result = await pool.query(
      'INSERT INTO pc_relationships (character_id, name, relation_type, link, is_family, is_dm_only, created_by_role, parent_id, status_label) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
      [charId, name, relation_type, link, is_family || false, is_dm_only || false, created_by_role, parent_id || null, status_label || null]
    );
    res.json(result.rows[0]);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// Delete relationship
app.delete('/api/pc/:playerId/relationships/:relId', requireAuth, async (req, res) => {
  const { playerId, relId } = req.params;
  try {
    if (!await canAccessPC(req.session.userId, req.session.role, playerId)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const isDM = req.session.role === 'dm' || req.session.role === 'admin';
    if (!isDM) {
      const rel = await pool.query('SELECT created_by_role FROM pc_relationships WHERE id = $1', [relId]);
      if (rel.rows.length && rel.rows[0].created_by_role === 'dm') {
        return res.status(403).json({ error: 'This relationship was created by the DM and cannot be deleted.' });
      }
    }
    // Scoped to the named player's character: relId alone addressed any row in
    // the table, across every character in every campaign.
    const del = await pool.query(
      `DELETE FROM pc_relationships
        WHERE id = $1 AND character_id = (SELECT id FROM pc_characters WHERE player_id = $2)
        RETURNING id`,
      [relId, playerId]
    );
    if (!del.rows.length) return res.status(404).json({ error: 'Relationship not found' });
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// Toggle DM-only visibility on a relationship (DM only, only for DM-created rels)
app.patch('/api/pc/:playerId/relationships/:relId/visibility', requireRole(['dm', 'admin']), async (req, res) => {
  const { playerId, relId } = req.params;
  try {
    if (!await canAccessPC(req.session.userId, req.session.role, playerId)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const check = await pool.query('SELECT created_by_role FROM pc_relationships WHERE id = $1', [relId]);
    if (!check.rows.length) return res.status(404).json({ error: 'Relationship not found' });
    if (check.rows[0].created_by_role !== 'dm') {
      return res.status(403).json({ error: 'Visibility can only be toggled on DM-created relationships.' });
    }
    const result = await pool.query(
      'UPDATE pc_relationships SET is_dm_only = NOT is_dm_only WHERE id = $1 RETURNING id, is_dm_only',
      [relId]
    );
    res.json(result.rows[0]);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// Edit relationship — update relation_type and/or status_label
app.patch('/api/pc/:playerId/relationships/:relId', requireAuth, async (req, res) => {
  const { playerId, relId } = req.params;
  // Only update fields explicitly included in the request body
  const updates = {};
  if ('name' in req.body) updates.name = req.body.name || null;
  if ('relation_type' in req.body) updates.relation_type = req.body.relation_type || null;
  if ('status_label' in req.body) updates.status_label = req.body.status_label || null;
  if ('link' in req.body) updates.link = req.body.link || null;
  if ('parent_id' in req.body) updates.parent_id = parseInt(req.body.parent_id) || null;
  if ('is_dm_only' in req.body && (req.session.role === 'dm' || req.session.role === 'admin')) updates.is_dm_only = !!req.body.is_dm_only;
  if (!Object.keys(updates).length) return res.status(400).json({ error: 'Nothing to update' });
  try {
    if (!await canAccessPC(req.session.userId, req.session.role, playerId)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const isDM = req.session.role === 'dm' || req.session.role === 'admin';
    if (!isDM) {
      // Players cannot edit DM-created relationships
      const rel = await pool.query('SELECT created_by_role FROM pc_relationships WHERE id = $1', [relId]);
      if (rel.rows.length && rel.rows[0].created_by_role === 'dm') {
        return res.status(403).json({ error: 'This relationship was created by the DM and cannot be edited.' });
      }
    }
    const keys = Object.keys(updates);
    const setClauses = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
    // relId AND the owning character: the id alone addressed any relationship
    // row in the database, regardless of the playerId in the URL.
    const values = [...Object.values(updates), relId, playerId];
    const result = await pool.query(
      `UPDATE pc_relationships SET ${setClauses}
        WHERE id = $${values.length - 1}
          AND character_id = (SELECT id FROM pc_characters WHERE player_id = $${values.length})
        RETURNING *`,
      values
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Relationship not found' });
    res.json(result.rows[0]);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// Get DM notes (DM see all; player sees only visible ones)
app.get('/api/pc/:playerId/dm-notes', requireAuth, async (req, res) => {
  const { playerId } = req.params;
  try {
    if (!await canAccessPC(req.session.userId, req.session.role, playerId)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const charResult = await pool.query('SELECT id FROM pc_characters WHERE player_id = $1', [playerId]);
    if (charResult.rows.length === 0) return res.json([]);
    const isDM = req.session.role === 'dm';
    const query = isDM
      ? 'SELECT * FROM pc_dm_notes WHERE character_id = $1 ORDER BY created_at DESC'
      : 'SELECT * FROM pc_dm_notes WHERE character_id = $1 AND dm_visible = true ORDER BY created_at DESC';
    const result = await pool.query(query, [charResult.rows[0].id]);
    res.json(result.rows);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// Add DM note
app.post('/api/pc/:playerId/dm-notes', requireRole(['dm']), async (req, res) => {
  const { playerId } = req.params;
  const { content, dm_visible } = req.body;
  try {
    if (!await canAccessPC(req.session.userId, req.session.role, req.params.playerId))
      return res.status(403).json({ error: 'Access denied' });
    let charId;
    const charResult = await pool.query('SELECT id FROM pc_characters WHERE player_id = $1', [playerId]);
    if (charResult.rows.length === 0) {
      const newChar = await pool.query('INSERT INTO pc_characters (player_id) VALUES ($1) RETURNING id', [playerId]);
      charId = newChar.rows[0].id;
    } else {
      charId = charResult.rows[0].id;
    }
    const result = await pool.query(
      'INSERT INTO pc_dm_notes (character_id, content, dm_visible) VALUES ($1,$2,$3) RETURNING *',
      [charId, content, dm_visible || false]
    );
    res.json(result.rows[0]);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// Toggle DM note visibility
app.put('/api/pc/:playerId/dm-notes/:noteId', requireRole(['dm']), async (req, res) => {
  const { noteId } = req.params;
  const { dm_visible, content } = req.body;
  try {
    if (!await canAccessPC(req.session.userId, req.session.role, req.params.playerId))
      return res.status(403).json({ error: 'Access denied' });
    // AND character_id = … : the id alone addressed ANY note in the table, so a
    // DM authorised for player A could edit a note belonging to player B simply
    // by passing B's noteId under A's playerId.
    const result = await pool.query(
      `UPDATE pc_dm_notes SET dm_visible=$1, content=COALESCE($2, content)
        WHERE id=$3 AND character_id = (SELECT id FROM pc_characters WHERE player_id = $4)
        RETURNING *`,
      [dm_visible, content, noteId, req.params.playerId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Note not found' });
    res.json(result.rows[0]);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// Delete DM note
app.delete('/api/pc/:playerId/dm-notes/:noteId', requireRole(['dm']), async (req, res) => {
  const { noteId } = req.params;
  try {
    if (!await canAccessPC(req.session.userId, req.session.role, req.params.playerId))
      return res.status(403).json({ error: 'Access denied' });
    // Scoped to the named player's character — see the PUT above.
    const del = await pool.query(
      `DELETE FROM pc_dm_notes
        WHERE id = $1 AND character_id = (SELECT id FROM pc_characters WHERE player_id = $2)
        RETURNING id`,
      [noteId, req.params.playerId]
    );
    if (!del.rows.length) return res.status(404).json({ error: 'Note not found' });
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// NOTE: GET /pc-public/:token is now served by the React SPA (catch-all route).
// The legacy public/pc-public.html page route was removed in v4.7.0; only the
// API endpoint below remains.

// Public PC data — resolve hashed token → real playerId
app.get('/api/pc-public/:playerToken', async (req, res) => {
  const playerId = unhashId(req.params.playerToken);
  if (!playerId) return res.status(404).json({ error: 'Invalid link' });
  try {
    // Joined up to the campaign only for the deleted_at guard: pc_characters
    // reaches it via campaign_players, and without the join a trashed campaign's
    // character sheets stayed publicly readable.
    // cp.campaign_id comes back so the gate below has something to check. This
    // token is `hashId(playerId)` — a pure function of the row id, with no
    // share table behind it — so it has never been revocable and the gate is
    // the only thing that has ever actually restricted this route.
    const result = await pool.query(
      `SELECT pc.name, pc.picture_url, pc.picture_data, pc.public_info, cp.campaign_id
         FROM pc_characters pc
         JOIN campaign_players cp ON cp.id = pc.player_id
         JOIN campaigns c ON c.id = cp.campaign_id
        WHERE pc.player_id = $1 AND c.deleted_at IS NULL`,
      [playerId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Character not found' });
    const gate = await shareGate(req, result.rows[0].campaign_id);
    if (gate) return denyShare(res, gate);
    const { campaign_id: _omit, ...sheet } = result.rows[0];
    res.json(sheet);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Get public token for a player (for sharing the public sheet URL)
app.get('/api/pc/:playerId/public-token', requireRole(['dm', 'player']), async (req, res) => {
  const playerId = parseInt(req.params.playerId);
  if (isNaN(playerId)) return res.status(400).json({ error: 'Invalid player ID' });
  // The token is a pure function of the id, so without this check ANY logged-in
  // player could mint a working public-sheet URL for ANY character in the
  // system — no database read, nothing to stop them counting upwards. The
  // sharpest hole in the file, and the cheapest to close.
  if (!await canAccessPC(req.session.userId, req.session.role, playerId))
    return res.status(403).json({ error: 'Access denied' });
  res.json({ token: hashId(playerId) });
});

// ============================================
// PC STATS SHEET
// ============================================

/**
 * The sheet's serialised shape, mirroring collectSheet() in
 * frontend/src/hooks/useNpcSheet.js. Kept in step with it by
 * test/statsValidation.test.js, which fails when the two drift.
 *
 * Every one of these is free text, including the ones that look numeric, and
 * the tiers below differ only in how much of it is kept. `cr` is "1/2"; the SRD
 * importer writes `hp` as "10 (3d6)" and `speed` as "30 ft., fly 60 ft."; and
 * legacy sheets kept "27/40" in `hp` for splitHp() to pull apart on load.
 * Coercing any of them to a number would quietly destroy real sheets.
 *
 * Listed in collectSheet's emission order, not grouped by cap: keeping the
 * two literally parallel is what lets the drift test read as a diff.
 */
const STATS_TEXT_FIELDS = {
  char_name: 255, char_class: 255, subclass: 255, race: 255, sex: 255,
  alignment: 255, level: 255, cr: 255, hp: 255, max_hp: 255, temp_hp: 255,
  temp_max_hp: 255, ac: 255, speed: 255,
  senses: 1000, langs: 1000,
  caster_type: 255, spell_ability: 255, slot_reset: 255,
  personality: 20000, spec_traits: 20000, features: 20000, equipment: 20000,
  actions: 20000, bonus_actions: 20000, leg_actions: 20000, lair_actions: 20000,
  special_abilities: 20000, dm_notes: 20000,
};

/** Kept in step with ABILITY_IDS in frontend/src/data/dnd.js. */
const STATS_ABILITY_IDS = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

/** Kept in step with SKILLS in frontend/src/data/dnd.js, in that order. */
const STATS_SKILLS = [
  'Acrobatics', 'Animal Handling', 'Arcana', 'Athletics', 'Deception',
  'History', 'Insight', 'Intimidation', 'Investigation', 'Medicine',
  'Nature', 'Perception', 'Performance', 'Persuasion', 'Religion',
  'Sleight of Hand', 'Stealth', 'Survival',
];

/** Kept in step with defaultTags() in frontend/src/hooks/useNpcSheet.js. */
const STATS_TAG_KEYS = ['resist', 'immune', 'vuln', 'condimmune', 'damagetype'];

/**
 * Clean a PC stats blob before it reaches pc_char_stats.stats_json.
 *
 * The column used to take JSON.stringify(req.body) unchecked, so any authorised
 * writer could store an arbitrarily large, arbitrarily shaped document under a
 * character. Three routes write this column and two of them take it from an
 * uploaded file, so validating only the PUT would leave the back door open.
 *
 * Coerces, never throws, in the manner of cardValues(): an import bundle from an
 * older version will legitimately carry keys this version does not know, and
 * rejecting a whole campaign over one of them is worse than dropping it.
 *
 * Two rules the sheet depends on, both easy to break from in here:
 *
 *   - **A key absent from the input stays absent.** populateSheet() falls back
 *     to the current value with `?? prev`, so inventing a key would overwrite
 *     whatever the sheet already held.
 *   - **An empty string stays an empty string, and must not become null.**
 *     `'' ?? prev` is `''`, but `null ?? prev` is `prev` — so turning one into
 *     the other would stop a cleared field from ever clearing. This is the same
 *     class of bug as the camelCase round-trip that once wiped every saving
 *     throw proficiency; see the comment above collectSheet().
 */
function validateStats(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return {};
  const out = {};

  for (const [key, max] of Object.entries(STATS_TEXT_FIELDS)) {
    if (!(key in body)) continue;
    const v = body[key];
    if (v === null || v === undefined) { out[key] = ''; continue; }
    if (typeof v === 'object') continue;         // a blob in a text slot: drop it
    out[key] = String(v).slice(0, max);
  }

  if (body.abilities && typeof body.abilities === 'object') {
    const abilities = {};
    for (const id of STATS_ABILITY_IDS) {
      const a = body.abilities[id];
      if (!a || typeof a !== 'object') continue;
      const score = parseInt(a.score, 10);
      abilities[id] = {
        score: Number.isFinite(score) ? Math.min(99, Math.max(1, score)) : 10,
        st_prof: !!(a.st_prof ?? a.stProf),
      };
    }
    if (Object.keys(abilities).length) out.abilities = abilities;
  }

  if (body.skill_profs && typeof body.skill_profs === 'object') {
    const profs = {};
    for (const name of STATS_SKILLS) {
      if (!(name in body.skill_profs)) continue;
      const tier = parseInt(body.skill_profs[name], 10);
      profs[name] = Number.isFinite(tier) && tier >= 0 && tier <= 2 ? tier : 0;
    }
    out.skill_profs = profs;
  }

  if (body.tags && typeof body.tags === 'object') {
    const tags = {};
    for (const key of STATS_TAG_KEYS) {
      if (!Array.isArray(body.tags[key])) continue;
      // Tag values are deliberately NOT checked against DAMAGE_TYPES/CONDITIONS.
      // srdMap's canonical() falls back to the API's own wording when it cannot
      // match one of our labels, on the stated grounds that a lossy import is
      // worse than an unfamiliar label. Enforcing the enum here would undo that.
      tags[key] = body.tags[key]
        .filter(t => typeof t === 'string')
        .slice(0, 50)
        .map(t => t.slice(0, 120));
    }
    out.tags = tags;
  }

  if (body.spell_names && typeof body.spell_names === 'object') {
    const names = {};
    for (let lv = 0; lv <= 9; lv++) {
      const v = body.spell_names[lv];
      if (v === undefined || v === null || typeof v === 'object') continue;
      // One comma-separated string per level, not a list. Level 0 is cantrips.
      names[lv] = String(v).slice(0, 4000);
    }
    out.spell_names = names;
  }

  if (body.used_slots && typeof body.used_slots === 'object') {
    const slots = {};
    for (let lv = 1; lv <= 9; lv++) {
      const arr = body.used_slots[lv];
      if (!Array.isArray(arr)) continue;
      // Deduplicated and sorted, because the UI holds these as a Set and
      // collectSheet emits them sorted — a reload must not reorder the boxes.
      slots[lv] = [...new Set(arr.map(n => parseInt(n, 10))
        .filter(n => Number.isFinite(n) && n >= 0 && n < 20))]
        .sort((a, b) => a - b);
    }
    out.used_slots = slots;
  }

  if (Array.isArray(body.legendary_res)) {
    out.legendary_res = body.legendary_res.slice(0, 5).map(Boolean);
  }

  return out;
}

app.get('/api/pc/:playerId/stats', requireAuth, async (req, res) => {
  const { playerId } = req.params;
  try {
    if (!await canAccessPC(req.session.userId, req.session.role, playerId))
      return res.status(403).json({ error: 'Access denied' });
    const result = await pool.query(
      'SELECT stats_json FROM pc_char_stats WHERE player_id = $1', [playerId]
    );
    res.json(result.rows[0]?.stats_json || {});
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/pc/:playerId/stats', requireAuth, async (req, res) => {
  const { playerId } = req.params;
  try {
    if (!await canAccessPC(req.session.userId, req.session.role, playerId))
      return res.status(403).json({ error: 'Access denied' });
    const result = await pool.query(
      `INSERT INTO pc_char_stats (player_id, stats_json, updated_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (player_id) DO UPDATE
       SET stats_json = $2, updated_at = CURRENT_TIMESTAMP
       RETURNING stats_json`,
      [playerId, JSON.stringify(validateStats(req.body))]
    );
    res.json(result.rows[0].stats_json);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================
// CHARACTER INVENTORY
// ============================================
//
// An inventory row is one of two kinds — see the inventory_items DDL for why
// the distinction is enforced by CHECK constraints rather than convention:
//
//   card-linked : a magic item the DM granted from their item-card library.
//                 Unique per campaign, always quantity 1, DM-assigned only.
//                 A player may pass one on but never conjure one.
//   free-text   : the player's own gear and consumables. Quantities live here.
//
// Note what these routes do NOT do: widen access to item_cards. The card's
// fields are joined into the inventory response, so a player sees the content
// of a card granted to them without gaining any route into the DM's library.
// item_cards stays strictly owner-scoped.

/**
 * Columns of the joined card, aliased so they cannot collide with the row's own.
 *
 * An explicit list, and `evolves_from` is MISSING FROM IT ON PURPOSE. A player
 * reads their own inventory through this, so anything added here is something
 * they can see. Leaving the chain out is the entire reason an evolving item
 * cannot be anticipated: the row points at one tier, this returns that tier,
 * and nothing in the payload hints that another exists. Do not add it "for
 * symmetry" — test/inventory.test.js fails if you do.
 */
const INV_SELECT = `
  i.*,
  c.name        AS card_name,
  c.type        AS card_type,
  c.rarity      AS card_rarity,
  c.flavor      AS card_flavor,
  c.abilities   AS card_abilities,
  c.attunement  AS card_attunement,
  c.damage      AS card_damage,
  c.damage_type AS card_damage_type,
  c.properties  AS card_properties,
  c.ac_bonus    AS card_ac_bonus,
  c.armor_type  AS card_armor_type,
  c.uses        AS card_uses,
  c.weight      AS card_weight`;

/** The campaign a player belongs to, or null if the id is unknown. */
async function playerCampaignId(playerId) {
  const r = await pool.query('SELECT campaign_id FROM campaign_players WHERE id=$1', [playerId]);
  return r.rows.length ? r.rows[0].campaign_id : null;
}

const isDmRole = (role) => role === 'dm' || role === 'admin';

/** Kept in step with the CHECK on inventory_items.category. */
const INV_CATEGORIES = ['inventory', 'treasure', 'potions', 'misc'];

/**
 * Consumables are used, not worn. "Equipped" on a potion is a flag with no
 * meaning, and it also dragged attunement in behind it.
 *
 * Enforced here as well as hidden in the UI, for the usual reason — and because
 * it normalises rows created before the rule existed, on their next save.
 */
const EQUIPPABLE = (category) => category !== 'potions';

/**
 * 5e lets a character attune to three magic items at once. Enforced here and
 * not only in the UI, because a limit a client merely greys out is not a limit.
 */
const ATTUNEMENT_LIMIT = 3;

/**
 * Does this row need attunement? A card-linked row inherits the answer from its
 * card; a free-text row carries its own flag. Takes the joined row, so callers
 * must have selected `item_card_id`, `requires_attunement` and the card's
 * `attunement`.
 */
const rowNeedsAttunement = (row) =>
  (row.item_card_id !== null && row.item_card_id !== undefined
    ? !!row.card_attunement
    : !!row.requires_attunement);

/** How many of this character's items are attuned, ignoring one row. */
async function countAttuned(playerId, exceptItemId) {
  const r = await pool.query(
    'SELECT count(*)::int AS n FROM inventory_items WHERE player_id=$1 AND attuned = true AND id <> $2',
    [playerId, exceptItemId ?? -1],
  );
  return r.rows[0].n;
}

/** '' means "unweighed", which is not the same as weightless. */
function invWeight(v) {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * The coin purse. Its own route rather than fields on PUT /api/pc/:playerId,
 * for the same reason the carry override was: that route takes a fixed field
 * list and the sheet saves one section at a time, so folding these in would
 * zero them every time another tab saved.
 */
app.put('/api/pc/:playerId/coins', requireAuth, async (req, res) => {
  const { playerId } = req.params;
  const coin = (v) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;   // no negative purses
  };
  try {
    if (!await canAccessPC(req.session.userId, req.session.role, playerId))
      return res.status(403).json({ error: 'Access denied' });
    const b = req.body ?? {};
    const r = await pool.query(
      `UPDATE pc_characters
          SET coins_pp=$1, coins_gp=$2, coins_sp=$3, coins_cp=$4, updated_at=CURRENT_TIMESTAMP
        WHERE player_id=$5
        RETURNING coins_pp, coins_gp, coins_sp, coins_cp`,
      [coin(b.coins_pp), coin(b.coins_gp), coin(b.coins_sp), coin(b.coins_cp), playerId],
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Character not found' });
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/pc/:playerId/inventory', requireAuth, async (req, res) => {
  const { playerId } = req.params;
  try {
    if (!await canAccessPC(req.session.userId, req.session.role, playerId))
      return res.status(403).json({ error: 'Access denied' });
    const r = await pool.query(
      `SELECT ${INV_SELECT}
         FROM inventory_items i
         LEFT JOIN item_cards c ON c.id = i.item_card_id
        WHERE i.player_id = $1
        ORDER BY (i.item_card_id IS NULL), COALESCE(c.name, i.name) ASC`,
      [playerId],
    );
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Add a free-text row. Players manage their own gear; the DM may also add to a
// character in their campaign. Card-linked items do NOT come through here —
// see the assign route below — so a player cannot grant themselves a magic item.
app.post('/api/pc/:playerId/inventory', requireAuth, async (req, res) => {
  const { playerId } = req.params;
  const { name, quantity, notes, equipped, category, weight, attuned, requires_attunement } = req.body ?? {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Item name required' });
  const qty = parseInt(quantity, 10);
  try {
    if (!await canAccessPC(req.session.userId, req.session.role, playerId))
      return res.status(403).json({ error: 'Access denied' });
    const campaignId = await playerCampaignId(playerId);
    if (!campaignId) return res.status(404).json({ error: 'Player not found' });

    const addCategory = INV_CATEGORIES.includes(category) ? category : 'inventory';

    // Same two rules as the edit route. A new row has no previous state, so
    // "equipped" counts as the transition: adding an attunable item already
    // worn attunes it.
    const needs = !!requires_attunement;
    const wantsAttuned = needs && (!!equipped || !!attuned);
    if (wantsAttuned && await countAttuned(playerId) >= ATTUNEMENT_LIMIT) {
      return res.status(409).json({
        error: `Already attuned to ${ATTUNEMENT_LIMIT} items. Un-attune one first.`,
      });
    }

    const r = await pool.query(
      `INSERT INTO inventory_items (campaign_id, player_id, name, quantity, notes, equipped, category, weight,
                                    attuned, requires_attunement, granted_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [campaignId, playerId, String(name).trim().slice(0, 255),
       Number.isFinite(qty) && qty > 0 ? qty : 1,
       notes ? String(notes) : null,
       EQUIPPABLE(addCategory) && !!equipped,
       addCategory,
       invWeight(weight), wantsAttuned, needs, req.session.userId],
    );
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/pc/:playerId/inventory/:itemId', requireAuth, async (req, res) => {
  const { playerId, itemId } = req.params;
  const { name, quantity, notes, equipped, category, weight, attuned, requires_attunement } = req.body ?? {};
  try {
    if (!await canAccessPC(req.session.userId, req.session.role, playerId))
      return res.status(403).json({ error: 'Access denied' });
    // The card's own attunement flag is joined in: a card-linked row's "does
    // this need attuning" lives there, and both rules below depend on it.
    const cur = await pool.query(
      `SELECT i.item_card_id, i.category, i.equipped, i.attuned, i.requires_attunement,
              c.attunement AS card_attunement
         FROM inventory_items i
         LEFT JOIN item_cards c ON c.id = i.item_card_id
        WHERE i.id=$1 AND i.player_id=$2`,
      [itemId, playerId],
    );
    if (!cur.rows.length) return res.status(404).json({ error: 'Item not found' });
    const row = cur.rows[0];
    const isCard = row.item_card_id !== null;
    const qty = parseInt(quantity, 10);

    /**
     * Attunement follows equipping — but only on the TRANSITION.
     *
     * Deriving it from `equipped` on every write would make the manual badge
     * useless: the next save of any field would reset whatever it had set. So
     * the automatic rule fires when `equipped` actually changes, and otherwise
     * the incoming value stands, which is what makes the override an override.
     *
     * Only for items that need attunement. A torch does not become "attuned"
     * by being held.
     */
    const needs = rowNeedsAttunement({
      item_card_id: row.item_card_id,
      card_attunement: row.card_attunement,
      // A free-text row may be changing its own requirement in this same request.
      requires_attunement: isCard ? false : !!requires_attunement,
    });
    const equippedChanged = !!equipped !== !!row.equipped;
    const nextAttuned = needs
      ? (equippedChanged ? !!equipped : !!attuned)
      : false;                       // not attunable ⇒ never attuned

    // The limit. Checked only when this write would NEWLY attune something, so
    // re-saving an already-attuned item at the cap is not a conflict with
    // itself, and unattuning is always allowed.
    if (nextAttuned && !row.attuned) {
      const others = await countAttuned(playerId, itemId);
      if (others >= ATTUNEMENT_LIMIT) {
        return res.status(409).json({
          error: `Already attuned to ${ATTUNEMENT_LIMIT} items. Un-attune one first.`,
        });
      }
    }
    // Note the 409 above rejects the WHOLE request, equip included. That is
    // deliberate: equipping is what triggers attunement, so letting the equip
    // through while refusing the attunement would leave the item worn but
    // unattuned — exactly the inconsistency this change exists to remove.
    const nextCategory = INV_CATEGORIES.includes(category) ? category : row.category;
    const nextEquipped = EQUIPPABLE(nextCategory) && !!equipped;
    // A card-linked row's name and quantity are not the player's to change —
    // the name belongs to the card, and the quantity is fixed at 1 by the
    // schema. Everything editable about it is the equipped flag and notes.
    const r = await pool.query(
      `UPDATE inventory_items
          SET name     = CASE WHEN $1::boolean THEN name ELSE COALESCE($2, name) END,
              quantity = CASE WHEN $1::boolean THEN 1    ELSE COALESCE($3, quantity) END,
              notes    = $4,
              equipped = $5,
              category = $6,
              -- A card-linked row takes its weight from the card, so this stays
              -- NULL there rather than offering two places to set one number.
              --
              -- $7::numeric is load-bearing. The other two CASEs above type
              -- their parameter from the column they COALESCE against; this one
              -- has a bare NULL in the THEN branch, which tells Postgres
              -- nothing, so it inferred TEXT and the assignment failed with
              --   column "weight" is of type numeric but expression is of type text
              -- on every edit — including the equip toggle.
              weight   = CASE WHEN $1::boolean THEN NULL ELSE $7::numeric END,
              attuned  = $8,
              -- Same split as the schema: a card-linked row's "does this need
              -- attunement" lives on the card, so only free-text rows set it.
              requires_attunement = CASE WHEN $1::boolean THEN false ELSE $9::boolean END,
              updated_at = CURRENT_TIMESTAMP
        WHERE id=$10 AND player_id=$11 RETURNING *`,
      [isCard,
       name === undefined ? null : String(name).trim().slice(0, 255) || null,
       Number.isFinite(qty) && qty > 0 ? qty : null,
       notes === undefined || notes === null || notes === '' ? null : String(notes),
       nextEquipped,
       nextCategory,
       invWeight(weight), nextAttuned, !!requires_attunement, itemId, playerId],
    );
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/pc/:playerId/inventory/:itemId', requireAuth, async (req, res) => {
  const { playerId, itemId } = req.params;
  try {
    if (!await canAccessPC(req.session.userId, req.session.role, playerId))
      return res.status(403).json({ error: 'Access denied' });
    const cur = await pool.query(
      'SELECT item_card_id FROM inventory_items WHERE id=$1 AND player_id=$2', [itemId, playerId]);
    if (!cur.rows.length) return res.status(404).json({ error: 'Item not found' });
    // Only the DM can take a granted magic item away again. A player dropping
    // their own rope is their business; a player deleting the Sword of Kas to
    // make the DM re-grant it is not.
    if (cur.rows[0].item_card_id !== null && !isDmRole(req.session.role)) {
      return res.status(403).json({ error: 'Only the DM can remove a granted item' });
    }
    await pool.query('DELETE FROM inventory_items WHERE id=$1 AND player_id=$2', [itemId, playerId]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DM assigns one of their own item cards to a character. This is the only way a
// card-linked row is created.
app.post('/api/pc/:playerId/inventory/assign', requireRole(['dm', 'admin']), async (req, res) => {
  const { playerId } = req.params;
  const cardId = parseInt(req.body?.item_card_id ?? req.body?.itemCardId, 10);
  if (!Number.isFinite(cardId)) return res.status(400).json({ error: 'item_card_id required' });
  try {
    if (!await canAccessPC(req.session.userId, req.session.role, playerId))
      return res.status(403).json({ error: 'Access denied' });
    // The card must be the caller's own: a DM grants from their library, not
    // from someone else's. item_cards access is unchanged by this feature.
    if (!await ownsItemCard(cardId, req.session.userId))
      return res.status(403).json({ error: 'Not your card' });
    const campaignId = await playerCampaignId(playerId);
    if (!campaignId) return res.status(404).json({ error: 'Player not found' });
    const r = await pool.query(
      `INSERT INTO inventory_items (campaign_id, player_id, item_card_id, granted_by)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [campaignId, playerId, cardId, req.session.userId],
    );
    res.json(r.rows[0]);
  } catch (e) {
    // The partial unique index is what enforces "only once per campaign", so
    // the duplicate arrives here as a constraint violation rather than a
    // pre-check — which is the point: no race can slip a second copy past it.
    if (e.code === '23505') {
      return res.status(409).json({ error: 'That item is already in this campaign' });
    }
    res.status(500).json({ error: e.message });
  }
});

// Hand an item to another character in the same campaign. No approval step; the
// trail is kept on the row so the DM can see what moved.
app.post('/api/pc/:playerId/inventory/:itemId/give', requireAuth, async (req, res) => {
  const { playerId, itemId } = req.params;
  const toId = parseInt(req.body?.to_player_id ?? req.body?.toPlayerId, 10);
  if (!Number.isFinite(toId)) return res.status(400).json({ error: 'to_player_id required' });
  if (String(toId) === String(playerId)) return res.status(400).json({ error: 'That is the same character' });
  try {
    if (!await canAccessPC(req.session.userId, req.session.role, playerId))
      return res.status(403).json({ error: 'Access denied' });
    const from = await playerCampaignId(playerId);
    const to   = await playerCampaignId(toId);
    if (!from || !to) return res.status(404).json({ error: 'Player not found' });
    // Same campaign only. Without this an item could be walked from one table's
    // campaign into another, which is both a continuity break and a way around
    // "only once per campaign".
    if (String(from) !== String(to)) {
      return res.status(400).json({ error: 'Both characters must be in the same campaign' });
    }
    const r = await pool.query(
      `UPDATE inventory_items
          SET player_id = $1, prev_player_id = $2, transferred_at = CURRENT_TIMESTAMP,
              equipped = false, updated_at = CURRENT_TIMESTAMP
        WHERE id = $3 AND player_id = $2 RETURNING *`,
      [toId, playerId, itemId],
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Item not found' });
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/**
 * Move a granted item to another tier of its own chain — the "bump".
 *
 * There is no tier column anywhere. Which tier a character holds IS which card
 * their row points at, so advancing an item and reversing it are the same one
 * UPDATE in opposite directions. That is what makes this reversible for free,
 * and it is also why a player can never learn that other tiers exist: they are
 * served the one card the row points at, and the chain is not in that payload.
 *
 * Takes a target rather than a direction. "Next tier" and "put it back to base
 * after it changed hands" are then the same route, and the DM can jump
 * straight to any tier instead of clicking through the ones between.
 *
 * DM-only. A player holding an item does not get to level it up.
 */
app.put('/api/pc/:playerId/inventory/:itemId/card', requireRole(['dm', 'admin']), async (req, res) => {
  const { playerId, itemId } = req.params;
  const target = parseInt(req.body?.item_card_id ?? req.body?.itemCardId, 10);
  if (!Number.isFinite(target)) return res.status(400).json({ error: 'item_card_id required' });
  try {
    if (!await canAccessPC(req.session.userId, req.session.role, playerId))
      return res.status(403).json({ error: 'Access denied' });
    if (!await ownsItemCard(target, req.session.userId))
      return res.status(403).json({ error: 'Not your card' });

    const row = await pool.query(
      'SELECT id, item_card_id FROM inventory_items WHERE id=$1 AND player_id=$2',
      [itemId, playerId],
    );
    if (!row.rows.length) return res.status(404).json({ error: 'Item not found' });
    const current = row.rows[0].item_card_id;
    if (current == null) {
      return res.status(400).json({ error: 'That is a free-text item, not a card' });
    }
    if (Number(current) === target) return res.json(row.rows[0]);

    // The target has to be in the SAME chain. Without this the route is a way
    // to turn any granted item into any other card in the DM's library while
    // keeping the row — which is not a bump, it is a swap, and it would make
    // the transfer trail a lie.
    if (!await sameChain(current, target, req.session.userId)) {
      return res.status(400).json({ error: 'That card is not another tier of this item' });
    }

    const r = await pool.query(
      `UPDATE inventory_items
          SET item_card_id = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2 AND player_id = $3 RETURNING *`,
      [target, itemId, playerId],
    );
    res.json(r.rows[0]);
  } catch (e) {
    // The per-campaign unique index: another character in this campaign is
    // already holding the tier being moved to.
    if (e.code === '23505') {
      return res.status(409).json({
        error: 'Another character in this campaign already holds that tier',
      });
    }
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// ITEM CARDS
// ============================================
//
// A per-user library for the magic-item card creator. The module itself is a
// PUBLIC tool — no login, no route guard (see App.jsx) — and that stays true:
// an anonymous visitor keeps the localStorage-only build-and-print page they
// have always had. These routes are the extra a signed-in user gets, so cards
// outlive a cleared browser or a change of device.
//
// Everything here is scoped by `user_id = req.session.userId`. There is no
// sharing, no campaign link and no DM/player distinction, because the module
// has never had any of those.

/**
 * The abilities field is HTML produced by a contenteditable editor and rendered
 * with dangerouslySetInnerHTML, so it is sanitised here — on write, once —
 * rather than at each of the two render sites.
 *
 * Only what the editor's toolbar can actually produce is allowed: bold, italic,
 * underline, lists, paragraphs, and the highlight button's coloured span. Every
 * attribute other than that one `style` is dropped, which takes `onerror=` and
 * friends with it.
 *
 * This matters now in a way it did not before. While cards lived in your own
 * localStorage, bad HTML in this field was self-inflicted. With an import route
 * it becomes someone else's bundle rendering someone else's markup in your page.
 * The same reasoning already applies to SRD text — see escapeHtml in srdMap.js.
 */
function sanitizeAbilities(html) {
  if (html === null || html === undefined) return null;
  const clean = sanitizeHtml(String(html), {
    allowedTags: ['b', 'i', 'u', 'em', 'strong', 'p', 'br', 'ul', 'ol', 'li', 'span', 'div'],
    allowedAttributes: { span: ['style'], div: ['style'] },
    allowedStyles: {
      '*': {
        'background-color': [/^#(0x)?[0-9a-f]+$/i, /^rgb\(/, /^[a-z]+$/i],
        color: [/^#(0x)?[0-9a-f]+$/i, /^rgb\(/, /^[a-z]+$/i],
      },
    },
    // Drop the contents of anything disallowed as well as the tag itself, so a
    // <script> leaves nothing behind rather than dumping its source as text.
    nonTextTags: ['style', 'script', 'textarea', 'option', 'noscript'],
  });
  return clean.trim() === '' ? null : clean;
}

/** Owns this card? Cards are per-user; there is no other access path. */
async function ownsItemCard(cardId, userId) {
  const r = await pool.query('SELECT id FROM item_cards WHERE id=$1 AND user_id=$2', [cardId, userId]);
  return r.rows.length > 0;
}

/** Kept in step with the CHECK constraint on item_cards.rarity. */
const RARITY_IDS = ['common', 'uncommon', 'rare', 'veryrare', 'legendary', 'artifact'];

/** The card columns, in the order every INSERT/UPDATE below uses. */
const CARD_COLS = ['name', 'type', 'rarity', 'flavor', 'abilities', 'attunement',
  'damage', 'damage_type', 'properties', 'ac_bonus', 'armor_type', 'uses', 'weight',
  'evolves_from'];

/** How far a chain may run. A guard against a cycle, not a design limit. */
const CHAIN_MAX = 20;

/**
 * The base tier of whichever chain this card belongs to — itself, if it is
 * already the base. Bounded by CHAIN_MAX so a cycle that somehow got into the
 * data cannot spin here.
 */
async function chainRoot(cardId, userId) {
  let at = Number(cardId);
  for (let i = 0; i < CHAIN_MAX; i++) {
    const r = await pool.query(
      'SELECT evolves_from FROM item_cards WHERE id=$1 AND user_id=$2', [at, userId],
    );
    const up = r.rows[0]?.evolves_from;
    if (up == null) return at;
    at = Number(up);
  }
  return at;
}

/** Two cards are tiers of the same item when they share a base tier. */
async function sameChain(a, b, userId) {
  if (Number(a) === Number(b)) return true;
  return Number(await chainRoot(a, userId)) === Number(await chainRoot(b, userId));
}

/**
 * Match an imported card against the library, by NAME rather than id.
 *
 * Ids are meaningless across libraries — `item_cards` is keyed to a user and a
 * campaign bundle crosses accounts — so a card has to be recognised by what it
 * is. Name alone is too loose (two different daggers), so the key is
 * **name + type + rarity**, compared case-insensitively.
 *
 * Chains are matched WHOLE, and that is not a refinement — it is the only way
 * this can work. Every tier of a chain deliberately shares one name, so the
 * players holding tier 2 cannot tell that tiers 1 and 3 exist. Matching card
 * by card would see three identical keys and link the inventory row to
 * whichever came back first, which is a one-in-three chance of handing a
 * character the wrong version of their own sword.
 *
 * Chains therefore match only when the BASE tiers agree AND the chains are the
 * same length; anything else is imported as a new chain. Conservative on
 * purpose: a duplicate in the library is a tidying problem, a mis-linked tier
 * is a wrong item on a character sheet.
 */
const cardKey = (c) => [
  String(c?.name ?? '').trim().toLowerCase(),
  String(c?.type ?? '').trim().toLowerCase(),
  String(c?.rarity ?? 'rare').trim().toLowerCase(),
].join('\u0000');

/** A library chain, base first, as ids. Linear — the UI never makes branches. */
async function libraryChain(client, baseId) {
  const r = await client.query(
    `WITH RECURSIVE down AS (
         SELECT id, evolves_from, 0 AS depth FROM item_cards WHERE id = $1
         UNION ALL
         SELECT c.id, c.evolves_from, down.depth + 1
           FROM item_cards c JOIN down ON c.evolves_from = down.id
       )
     SELECT id FROM down ORDER BY depth ASC`, [baseId]);
  return r.rows.map(x => x.id);
}

/**
 * Imported cards -> real ids in this user's library, indexed by bundle position.
 *
 * Adds what is missing, reuses what is there, and never overwrites: a card the
 * library already has keeps its own text, so importing somebody's campaign
 * cannot quietly rewrite your version of an item. Returns `{ ids, added,
 * reused }`.
 */
async function resolveImportedCards(client, cards, userId) {
  const list = Array.isArray(cards) ? cards : [];
  const ids = new Array(list.length).fill(null);
  if (!list.length) return { ids, added: 0, reused: 0 };

  // Rebuild the chains the bundle describes.
  const children = new Map();
  const roots = [];
  list.forEach((c, i) => {
    const ref = c?.evolves_from_ref;
    if (Number.isInteger(ref) && ref >= 0 && ref < list.length && ref !== i) {
      if (!children.has(ref)) children.set(ref, []);
      children.get(ref).push(i);
    } else {
      roots.push(i);
    }
  });
  const walk = (i, acc = [], seen = new Set()) => {
    if (seen.has(i)) return acc;           // a cycle in a hand-edited bundle
    seen.add(i); acc.push(i);
    for (const k of children.get(i) ?? []) walk(k, acc, seen);
    return acc;
  };

  let added = 0, reused = 0;
  for (const root of roots) {
    const chain = walk(root);
    const base = list[root];

    // Candidate base tiers in the library with the same key.
    const cand = await client.query(
      `SELECT id, name, type, rarity FROM item_cards
        WHERE user_id = $1 AND evolves_from IS NULL`, [userId]);
    let matched = null;
    for (const row of cand.rows) {
      if (cardKey(row) !== cardKey(base)) continue;
      const existing = await libraryChain(client, row.id);
      if (existing.length === chain.length) { matched = existing; break; }
    }

    if (matched) {
      chain.forEach((bundleIdx, tier) => { ids[bundleIdx] = matched[tier]; });
      reused += chain.length;
      continue;
    }

    // Nothing comparable — bring the whole chain in, linking as we go.
    let prev = null;
    for (const bundleIdx of chain) {
      const vals = cardValues(list[bundleIdx] ?? {});
      vals[CARD_COLS.indexOf('evolves_from')] = prev;
      const ins = await client.query(
        `INSERT INTO item_cards (user_id, ${CARD_COLS.join(', ')})
         VALUES ($1,${CARD_COLS.map((_, i) => `$${i + 2}`).join(',')}) RETURNING id`,
        [userId, ...vals],
      );
      ids[bundleIdx] = ins.rows[0].id;
      prev = ins.rows[0].id;
      added += 1;
    }
  }
  return { ids, added, reused };
}

/**
 * May `cardId` declare `parentId` as the card it evolved from?
 *
 * Returns null when it may, or a reason string when it may not. Three ways it
 * can be wrong, and the third is the one that matters:
 *
 *   - the parent belongs to someone else — chains stay inside one library;
 *   - the card points at itself;
 *   - the link closes a CYCLE. A→B→A would make every walk of the chain run
 *     for ever, and the walking happens in the browser, so the tab would hang
 *     rather than the request failing.
 *
 * `cardId` is null when creating, where only the first two can apply.
 */
async function chainLinkError(parentId, cardId, userId) {
  if (parentId == null) return null;
  if (cardId != null && Number(parentId) === Number(cardId)) {
    return 'An item cannot evolve from itself';
  }
  if (!await ownsItemCard(parentId, userId)) return 'Not your card';
  if (cardId == null) return null;

  // Walk up from the proposed parent. Reaching `cardId` means the link would
  // close a loop. Bounded, so a cycle already in the data cannot hang this.
  let at = Number(parentId);
  for (let i = 0; i < CHAIN_MAX && at != null; i++) {
    if (Number(at) === Number(cardId)) {
      return 'That would make a loop — the item already evolves into this one';
    }
    const r = await pool.query(
      'SELECT evolves_from FROM item_cards WHERE id=$1 AND user_id=$2', [at, userId],
    );
    at = r.rows[0]?.evolves_from ?? null;
  }
  return null;
}

/**
 * Request body (camelCase, as the form holds it) -> column values.
 * `uses` is the one real type change: a numeric string in the UI, INTEGER here.
 * Empty strings become NULL so a blank field is absent rather than '' — except
 * `rarity`, which the column defaults and constrains.
 */
function cardValues(b) {
  const str = (v, max) => {
    const t = (v === null || v === undefined) ? '' : String(v).trim();
    return t === '' ? null : t.slice(0, max);
  };
  const uses = parseInt(b.uses, 10);
  const parent = parseInt(b.evolvesFrom ?? b.evolves_from, 10);
  const evolvesFrom = Number.isFinite(parent) && parent > 0 ? parent : null;
  // Weights are fractional (a vial is 0.5 lb) and optional — '' means unknown,
  // not zero, so an unweighed item does not silently read as weightless.
  const num = (v) => {
    if (v === null || v === undefined || String(v).trim() === '') return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  return [
    str(b.name, 255) ?? 'Untitled',
    str(b.type, 40),
    RARITY_IDS.includes(b.rarity) ? b.rarity : 'rare',
    str(b.flavor, 20000),
    sanitizeAbilities(b.abilities),
    !!b.attunement,
    str(b.damage, 60),
    str(b.damageType ?? b.damage_type, 60),
    str(b.properties, 255),
    str(b.acBonus ?? b.ac_bonus, 20),
    str(b.armorType ?? b.armor_type, 20),
    Number.isFinite(uses) && uses > 0 ? uses : null,
    num(b.weight),
    // The chain link. Validity is chainLinkError's job — this only coerces, so
    // that a bundle carrying junk here lands as "no parent" rather than
    // failing the whole import.
    evolvesFrom,
  ];
}

app.get('/api/item-cards', requireAuth, async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT * FROM item_cards WHERE user_id=$1 ORDER BY updated_at DESC',
      [req.session.userId],
    );
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Literal paths BEFORE /:id — a parameterised route registered first would
// swallow "export" and "import" as ids. test/routeOrder.test.js guards this.
/**
 * The bundle carries no database ids — it never has — so a chain cannot be
 * exported as `evolves_from: 42`: on the way back in, 42 is whatever card
 * happens to hold that id in the importing library, which could be anything.
 *
 * Each card's parent is therefore written as `evolves_from_ref`, its POSITION
 * in this bundle's own array, and the raw column is dropped. Import rebuilds
 * the links from those positions once every card has a real id.
 *
 * version 2. A v1 bundle has no refs and imports as unchained cards; a v1
 * reader handed a v2 bundle ignores the unknown key and does the same. Both
 * lose the chain rather than breaking, which is the right failure.
 */
app.get('/api/item-cards/export', requireAuth, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, ${CARD_COLS.join(', ')} FROM item_cards WHERE user_id=$1 ORDER BY created_at ASC`,
      [req.session.userId],
    );
    const pos = new Map(r.rows.map((row, i) => [row.id, i]));
    const cards = r.rows.map(({ id, evolves_from: parent, ...card }) => {
      const ref = parent == null ? undefined : pos.get(parent);
      return ref === undefined ? card : { ...card, evolves_from_ref: ref };
    });
    res.json({ type: 'item-cards', version: 2, exported_at: new Date().toISOString(), cards });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/item-cards/import', requireAuth, async (req, res) => {
  const bundle = req.body;
  // Type-check first, before touching anything: importing a campaign bundle here
  // by mistake should say so, not half-succeed.
  if (!bundle || bundle.type !== 'item-cards' || !Array.isArray(bundle.cards)) {
    return res.status(400).json({ error: 'Not an item-cards bundle' });
  }
  if (bundle.cards.length > 500) return res.status(400).json({ error: 'Too many cards in one bundle (max 500)' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Adds to the library rather than replacing it: an import here is "bring
    // these in", not "make my library look like this file". Nothing is deleted.
    let added = 0;
    // Two passes, because a card may name one that appears later in the array
    // and nothing can be linked until every row has an id.
    const newIds = [];
    for (const card of bundle.cards) {
      const vals = cardValues(card ?? {});
      // Pass one links nothing, and that is deliberate rather than merely
      // convenient: a bundle must not be able to set evolves_from directly.
      // A hand-edited file saying `evolves_from: 7` would otherwise attach the
      // imported card to whatever card 7 is in THIS library. Only the
      // positional refs below are trusted, and only after remapping.
      vals[CARD_COLS.indexOf('evolves_from')] = null;
      const ins = await client.query(
        `INSERT INTO item_cards (user_id, ${CARD_COLS.join(', ')})
         VALUES ($1,${CARD_COLS.map((_, i) => `$${i + 2}`).join(',')}) RETURNING id`,
        [req.session.userId, ...vals],
      );
      newIds.push(ins.rows[0].id);
      added += 1;
    }

    // Pass two: positions in the bundle become real ids. An out-of-range or
    // self-referential ref is dropped rather than failing the import — one bad
    // link should not cost the DM the other 499 cards.
    for (let i = 0; i < bundle.cards.length; i++) {
      const ref = bundle.cards[i]?.evolves_from_ref;
      if (!Number.isInteger(ref) || ref < 0 || ref >= newIds.length || ref === i) continue;
      await client.query(
        'UPDATE item_cards SET evolves_from=$1 WHERE id=$2 AND user_id=$3',
        [newIds[ref], newIds[i], req.session.userId],
      );
    }

    await client.query('COMMIT');
    res.json({ success: true, added });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

app.post('/api/item-cards', requireAuth, async (req, res) => {
  try {
    const vals = cardValues(req.body ?? {});
    const bad = await chainLinkError(vals[CARD_COLS.indexOf('evolves_from')], null, req.session.userId);
    if (bad) return res.status(409).json({ error: bad });
    const r = await pool.query(
      `INSERT INTO item_cards (user_id, ${CARD_COLS.join(', ')})
       VALUES ($1,${CARD_COLS.map((_, i) => `$${i + 2}`).join(',')}) RETURNING *`,
      [req.session.userId, ...vals],
    );
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/item-cards/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  try {
    if (!await ownsItemCard(id, req.session.userId))
      return res.status(403).json({ error: 'Access denied' });
    const vals = cardValues(req.body ?? {});
    const bad = await chainLinkError(vals[CARD_COLS.indexOf('evolves_from')], id, req.session.userId);
    if (bad) return res.status(409).json({ error: bad });
    const sets = CARD_COLS.map((c, i) => `${c}=$${i + 1}`).join(', ');
    const r = await pool.query(
      `UPDATE item_cards SET ${sets}, updated_at=CURRENT_TIMESTAMP
        WHERE id=$${CARD_COLS.length + 1} AND user_id=$${CARD_COLS.length + 2} RETURNING *`,
      [...vals, id, req.session.userId],
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Card not found' });
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/**
 * Who is holding this card right now, as "Player (Campaign)" strings.
 *
 * Used both to refuse a delete and to describe one, so the warning a DM
 * confirms against is built from the same query that would have blocked them.
 */
async function cardHolders(cardId) {
  const r = await pool.query(
    `SELECT c.name AS campaign, p.player_name
       FROM inventory_items i
       JOIN campaigns c ON c.id = i.campaign_id
       JOIN campaign_players p ON p.id = i.player_id
      WHERE i.item_card_id = $1
      ORDER BY c.name ASC`,
    [cardId],
  ).catch(() => ({ rows: [] }));
  return r.rows.map((h) => `${h.player_name} (${h.campaign})`);
}

/**
 * Delete a card. `?force=true` takes it out of every inventory first.
 *
 * Without the flag this still refuses, because the column is ON DELETE
 * RESTRICT and the point of that over CASCADE was that a DM finds out rather
 * than a player silently losing a magic item. The flag does not weaken that —
 * the refusal is what tells the DM who is holding it, and forcing is the
 * second step they take knowing the names. The frontend shows exactly that
 * list in the confirmation.
 */
app.delete('/api/item-cards/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const force = String(req.query.force) === 'true';
  try {
    if (!await ownsItemCard(id, req.session.userId))
      return res.status(403).json({ error: 'Access denied' });

    let removedFrom = [];
    if (force) {
      removedFrom = await cardHolders(id);
      // Only rows pointing at THIS card, so forcing a tier out of play leaves
      // the other tiers of the same chain alone.
      await pool.query('DELETE FROM inventory_items WHERE item_card_id = $1', [id]);
    }

    // Close the gap before deleting. ON DELETE SET NULL would leave whatever
    // evolved FROM this card as its own base tier — a three-tier chain quietly
    // becomes two chains, and nothing says so. Re-pointing the children at
    // this card's own parent removes a link from the middle instead of
    // breaking the chain in half.
    const self = await pool.query(
      'SELECT evolves_from FROM item_cards WHERE id=$1 AND user_id=$2',
      [id, req.session.userId],
    );
    await pool.query(
      'UPDATE item_cards SET evolves_from=$1 WHERE evolves_from=$2 AND user_id=$3',
      [self.rows[0]?.evolves_from ?? null, id, req.session.userId],
    );

    const r = await pool.query(
      'DELETE FROM item_cards WHERE id=$1 AND user_id=$2 RETURNING id',
      [id, req.session.userId],
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Card not found' });
    res.json({ success: true, removedFrom });
  } catch (e) {
    // inventory_items references the card with ON DELETE RESTRICT, so a card
    // sitting in somebody's inventory cannot be deleted without `force`. Say
    // where it is rather than returning the raw constraint violation: that
    // list is what the DM confirms against before forcing.
    if (e.code === '23503') {
      const held = await cardHolders(id);
      return res.status(409).json({
        code: 'CARD_IN_PLAY',
        holders: held,
        error: held.length
          ? `This card is in play — it is held by ${held.join(', ')}.`
          : 'This card is in play.',
      });
    }
    res.status(500).json({ error: e.message });
  }
});

/**
 * Empty the whole library. `?force=true` also takes every card out of play.
 *
 * Same two-step shape as the single delete, and for the same reason: the first
 * call names what would be destroyed, the second destroys it. One transaction,
 * because a half-cleared library is worse than either outcome.
 */
app.delete('/api/item-cards', requireAuth, async (req, res) => {
  const force = String(req.query.force) === 'true';
  const client = await pool.connect();
  try {
    const held = await client.query(
      `SELECT p.player_name, c.name AS campaign
         FROM inventory_items i
         JOIN item_cards ic ON ic.id = i.item_card_id
         JOIN campaigns c ON c.id = i.campaign_id
         JOIN campaign_players p ON p.id = i.player_id
        WHERE ic.user_id = $1
        ORDER BY c.name ASC`,
      [req.session.userId],
    );
    const holders = held.rows.map((h) => `${h.player_name} (${h.campaign})`);
    if (holders.length && !force) {
      return res.status(409).json({
        code: 'CARD_IN_PLAY',
        holders,
        error: `${holders.length} of these cards are in play, held by ${[...new Set(holders)].join(', ')}.`,
      });
    }

    await client.query('BEGIN');
    if (force) {
      await client.query(
        `DELETE FROM inventory_items
          WHERE item_card_id IN (SELECT id FROM item_cards WHERE user_id = $1)`,
        [req.session.userId],
      );
    }
    // The chain links are inside the set being deleted, so there is nothing to
    // heal here — unlike the single delete, which has to close a gap.
    const r = await client.query(
      'DELETE FROM item_cards WHERE user_id = $1 RETURNING id', [req.session.userId],
    );
    await client.query('COMMIT');
    res.json({ success: true, deleted: r.rows.length, removedFrom: force ? holders : [] });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// ============================================
// CAMPAIGN LOCATIONS
// ============================================

app.get('/api/campaigns/:campaignId/locations', requireRole(['dm', 'player']), async (req, res) => {
  try {
    if (!await canAccessCampaign(req.params.campaignId, req.session.userId, req.session.role))
      return res.status(403).json({ error: 'Access denied' });
    const isDM = req.session.role === 'dm' || req.session.role === 'admin';
    const query = isDM
      ? 'SELECT * FROM campaign_locations WHERE campaign_id = $1 ORDER BY created_at ASC'
      : 'SELECT * FROM campaign_locations WHERE campaign_id = $1 AND is_public = true ORDER BY created_at ASC';
    const result = await pool.query(query, [req.params.campaignId]);
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/campaigns/:campaignId/locations', requireRole(['dm']), async (req, res) => {
  const { name, description, size_type, parent_id } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  try {
    if (!await dmOwnsCampaign(req.params.campaignId, req.session.userId, req.session.role))
      return res.status(403).json({ error: 'Access denied' });
    const result = await pool.query(
      'INSERT INTO campaign_locations (campaign_id, name, description, size_type, parent_id) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [req.params.campaignId, name, description || null, size_type || null, parent_id || null]
    );
    res.json(result.rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: `A location named "${name}" already exists in this campaign` });
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/campaigns/:campaignId/locations/:locationId', requireRole(['dm']), async (req, res) => {
  const { name, description, size_type, parent_id } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  // Prevent self-reference or obvious cycles (a full cycle check would need a recursive query)
  const selfId = parseInt(req.params.locationId);
  if (parent_id && parseInt(parent_id) === selfId) return res.status(400).json({ error: 'A location cannot be its own parent' });
  try {
    if (!await dmOwnsCampaign(req.params.campaignId, req.session.userId, req.session.role))
      return res.status(403).json({ error: 'Access denied' });
    const result = await pool.query(
      'UPDATE campaign_locations SET name=$1, description=$2, size_type=$3, parent_id=$4 WHERE id=$5 AND campaign_id=$6 RETURNING *',
      [name, description || null, size_type || null, parent_id || null, req.params.locationId, req.params.campaignId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Location not found' });
    // Also sync the name on any journey_map_locations that reference this campaign location
    await pool.query(
      'UPDATE journey_map_locations SET name=$1 WHERE campaign_location_id=$2',
      [name, req.params.locationId]
    );
    res.json(result.rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: `A location named "${name}" already exists in this campaign` });
    res.status(500).json({ error: e.message });
  }
});

// Set (or clear, with null) a location's custom pin image. Kept off the generic PUT
// above so callers that don't send an image (e.g. waypoint rename) can't wipe it.
app.put('/api/campaigns/:campaignId/locations/:locationId/image', requireRole(['dm']), async (req, res) => {
  try {
    if (!await dmOwnsCampaign(req.params.campaignId, req.session.userId, req.session.role))
      return res.status(403).json({ error: 'Access denied' });
    const result = await pool.query(
      'UPDATE campaign_locations SET image_data=$1 WHERE id=$2 AND campaign_id=$3 RETURNING id',
      [req.body.image_data || null, req.params.locationId, req.params.campaignId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Location not found' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Global default pin images by location size_type (admin-managed) ──
// Read is open to any authenticated user (the DM editor needs it to render pins).
app.get('/api/location-type-images', requireAuth, async (req, res) => {
  try {
    const r = await pool.query('SELECT size_type, image_data FROM location_type_images');
    const out = {};
    r.rows.forEach((row) => { if (row.image_data) out[row.size_type] = row.image_data; });
    res.json(out);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Set (base64) or clear (null) the default image for a size_type. Admin only.
app.put('/api/location-type-images/:sizeType', requireRole(['admin']), async (req, res) => {
  const sizeType = String(req.params.sizeType || '').toLowerCase();
  if (!sizeType) return res.status(400).json({ error: 'size_type required' });
  try {
    await pool.query(
      `INSERT INTO location_type_images (size_type, image_data, updated_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (size_type) DO UPDATE SET image_data=EXCLUDED.image_data, updated_at=CURRENT_TIMESTAMP`,
      [sizeType, req.body.image_data || null]
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/campaigns/:campaignId/locations/:locationId/visibility', requireRole(['dm']), async (req, res) => {
  try {
    if (!await dmOwnsCampaign(req.params.campaignId, req.session.userId, req.session.role))
      return res.status(403).json({ error: 'Access denied' });
    // Toggle the target location first to learn the new state
    const result = await pool.query(
      'UPDATE campaign_locations SET is_public = NOT is_public WHERE id=$1 AND campaign_id=$2 RETURNING id, is_public',
      [req.params.locationId, req.params.campaignId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Location not found' });
    const { is_public } = result.rows[0];

    // When hiding (is_public → false), cascade to all descendants recursively
    let affected = [result.rows[0]];
    if (!is_public) {
      const desc = await pool.query(
        `WITH RECURSIVE descendants AS (
           SELECT id FROM campaign_locations WHERE parent_id=$1 AND campaign_id=$2
           UNION ALL
           SELECT cl.id FROM campaign_locations cl JOIN descendants d ON cl.parent_id=d.id
         )
         UPDATE campaign_locations SET is_public=false
         WHERE id IN (SELECT id FROM descendants) AND campaign_id=$2
         RETURNING id, is_public`,
        [req.params.locationId, req.params.campaignId]
      );
      affected = affected.concat(desc.rows);
    }

    res.json({ is_public, affected });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/campaigns/:campaignId/locations/:locationId', requireRole(['dm']), async (req, res) => {
  try {
    if (!await dmOwnsCampaign(req.params.campaignId, req.session.userId, req.session.role))
      return res.status(403).json({ error: 'Access denied' });
    // Block deletion if this location is pinned on any journey map
    const mapUsed = await pool.query(
      'SELECT jm.name as map_name FROM journey_map_locations jml JOIN journey_maps jm ON jml.map_id=jm.id WHERE jml.campaign_location_id=$1 LIMIT 1',
      [req.params.locationId]
    );
    if (mapUsed.rows.length) {
      return res.status(409).json({ error: `Location is in use on Journey Map "${mapUsed.rows[0].map_name}". Remove it from the map first.` });
    }
    // Block deletion if referenced by any timeline event
    const loc = await pool.query('SELECT name FROM campaign_locations WHERE id=$1', [req.params.locationId]);
    if (loc.rows.length) {
      const tlUsed = await pool.query(
        `SELECT COUNT(*)::int as cnt FROM player_timeline_entries
         WHERE campaign_id=$1 AND location=$2`,
        [req.params.campaignId, loc.rows[0].name]
      );
      if (tlUsed.rows[0].cnt > 0) {
        return res.status(409).json({ error: `Location "${loc.rows[0].name}" is used in ${tlUsed.rows[0].cnt} timeline event${tlUsed.rows[0].cnt === 1 ? '' : 's'}. Remove those events first.` });
      }
    }
    await pool.query('DELETE FROM campaign_locations WHERE id = $1 AND campaign_id = $2',
      [req.params.locationId, req.params.campaignId]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


// ============================================
// CAMPAIGN JOURNAL
// ============================================
//
// Shared notes: every player at the table writes, everyone reads. The DM can
// also write, and only the DM can write one nobody else sees.
//
// The withholding is in SQL, per the house rule that a hidden row never
// reaches the browser — `dm_only` entries are filtered out of the query for a
// player rather than hidden by the component. Two things follow from that and
// are easy to get wrong:
//
//   - A player's listing never selects `dm_only` at all, so there is nothing
//     to leak even by accident.
//   - A location the DM has since made private must stop showing to players,
//     even on an entry written while it was public. Both the name AND the id
//     are withheld: the name is the obvious leak, but leaving the id would let
//     a player tell that two entries happened at the same secret place. The
//     entry survives; the place it names does not.

/** Trim, cap, and treat an empty string as absent. */
const journalStr = (v, max) => {
  const t = (v === null || v === undefined) ? '' : String(v).trim();
  return t === '' ? null : t.slice(0, max);
};

/**
 * The in-game date as an absolute day, or null.
 *
 * Same integer campaign_meta.today_marker and the timelines use, so one
 * formatter renders all three. Bounded rather than merely parsed: a date
 * outside roughly year 1 to 10000 is a typo or a probe, not a campaign.
 */
const journalDay = (v) => {
  const n = parseInt(v, 10);
  // `>= 0`, not `> 0`: the absolute-day epoch the timelines use puts year 1,
  // day 1 at zero, so rejecting it would quietly drop a legitimate date.
  return Number.isFinite(n) && n >= 0 && n < 3650000 ? n : null;
};

/**
 * Validate a location the author claims to be writing about.
 *
 * Returns the id, null for "no location", or **false** for "no such location
 * you can see" — which the caller turns into a 400. A player naming a private
 * location would be guessing at an id, and accepting it would confirm the
 * guess; the check is the same `is_public` filter the locations list uses.
 */
async function resolveJournalLocation(locId, campaignId, isDM) {
  if (locId === null || locId === undefined || locId === '') return null;
  const id = parseInt(locId, 10);
  if (!Number.isFinite(id)) return false;
  const r = await pool.query(
    `SELECT id FROM campaign_locations
      WHERE id=$1 AND campaign_id=$2 ${isDM ? '' : 'AND is_public = true'}`,
    [id, campaignId],
  );
  return r.rows.length ? id : false;
}

/** Is this user the DM of this campaign? Cheap, and asked on every journal route. */
async function isCampaignDm(campaignId, userId, role) {
  if (role === 'admin') return true;
  const r = await pool.query(
    'SELECT 1 FROM campaigns WHERE id=$1 AND dm_user_id=$2 AND deleted_at IS NULL',
    [campaignId, userId],
  );
  return r.rows.length > 0;
}

/** The entry, if this user may change it. Author always; DM for deletion only. */
async function journalEntry(entryId, campaignId) {
  const r = await pool.query(
    'SELECT * FROM campaign_journal_entries WHERE id=$1 AND campaign_id=$2',
    [entryId, campaignId],
  );
  return r.rows[0] ?? null;
}

// ── Cross-link targets ──────────────────────────────────────────────────────
//
// The index behind `[[Name]]` links in prose: every location and NPC in this
// campaign that THIS viewer is allowed to resolve.
//
// Role-filtered in SQL, reusing the rule the locations route already applies —
// a player gets public locations only, and no NPCs at all, because
// `campaign_npcs` is DM-only and has no visibility column. A name the viewer
// cannot resolve renders as plain text rather than a link, which leaks
// nothing: the name is sitting in the prose either way, so the only difference
// is whether clicking it does anything.
//
// An explicit column list, never SELECT *: `campaign_locations.image_data`
// holds a base64 pin image, and pulling every one of them into an autocomplete
// index would be a megabyte to offer six suggestions. The popover fetches the
// image separately, only for the location actually opened.
app.get('/api/campaigns/:campaignId/link-targets', requireAuth, async (req, res) => {
  const { campaignId } = req.params;
  try {
    if (!await canAccessCampaign(campaignId, req.session.userId, req.session.role))
      return res.status(403).json({ error: 'Access denied' });
    const isDM = await isCampaignDm(campaignId, req.session.userId, req.session.role);

    const [locs, npcs] = await Promise.all([
      pool.query(
        `SELECT id, name, description, size_type, parent_id
           FROM campaign_locations
          WHERE campaign_id = $1 ${isDM ? '' : 'AND is_public = true'}
          ORDER BY name ASC`,
        [campaignId],
      ),
      isDM
        ? pool.query(
          'SELECT id, name FROM campaign_npcs WHERE campaign_id = $1 ORDER BY name ASC',
          [campaignId],
        )
        : Promise.resolve({ rows: [] }),
    ]);

    res.json({ locations: locs.rows, npcs: npcs.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Campaign links ──────────────────────────────────────────────────────────
//
// Everything in this campaign that has been shared, in one list, for the
// Campaign Links tab on the PC Sheet.
//
// The rule that makes it safe to show a player: **a row appears only because a
// share token exists for it**. Every list below is an INNER JOIN onto its
// shares table, never a left join with the token nulled out — so an unshared
// map cannot leak its name, and a player cannot learn that it exists at all.
// That is also why the DM sees exactly the same list: this tab answers "what
// has the table been given", not "what is there".
//
// Links are the PUBLIC token URLs rather than in-app routes, because the
// in-app journey map and timeline editors are DM-only. A player following one
// of these is a reader, logged in or not — the public handlers are already
// viewer-aware and show them their own paths.
app.get('/api/campaigns/:campaignId/links', requireAuth, async (req, res) => {
  const { campaignId } = req.params;
  try {
    if (!await canAccessCampaign(campaignId, req.session.userId, req.session.role))
      return res.status(403).json({ error: 'Access denied' });

    const [maps, campaignTl, playerTl] = await Promise.all([
      pool.query(
        `SELECT jm.id, jm.name, jms.token, jms.created_at
           FROM journey_maps jm
           JOIN journey_map_shares jms ON jms.map_id = jm.id
          WHERE jm.campaign_id = $1
          ORDER BY jm.name ASC`,
        [campaignId],
      ),
      // The whole-campaign combined timeline. At most one.
      pool.query(
        'SELECT token, created_at FROM campaign_timeline_shares WHERE campaign_id = $1',
        [campaignId],
      ),
      // One shared timeline belongs to one character, so it is worth naming
      // whose it is — several campaigns here run a timeline per player.
      pool.query(
        `SELECT pt.id, pt.name, cp.player_name, pts.token, pts.created_at
           FROM player_timelines pt
           JOIN player_timeline_shares pts ON pts.timeline_id = pt.id
           LEFT JOIN campaign_players cp ON cp.id = pt.player_id
          WHERE pt.campaign_id = $1
          ORDER BY cp.player_name ASC NULLS LAST, pt.name ASC`,
        [campaignId],
      ),
    ]);

    res.json({
      maps: maps.rows.map((m) => ({
        id: m.id, name: m.name, token: m.token,
        path: `/journey-map-public/${m.token}`, shared_at: m.created_at,
      })),
      timelines: [
        ...campaignTl.rows.map((t) => ({
          id: null, name: 'The whole campaign', player_name: null, scope: 'campaign',
          token: t.token, path: `/timeline-public/${t.token}`, shared_at: t.created_at,
        })),
        ...playerTl.rows.map((t) => ({
          id: t.id, name: t.name, player_name: t.player_name, scope: 'timeline',
          token: t.token, path: `/timeline-public/${t.token}`, shared_at: t.created_at,
        })),
      ],
      // Prepared, deliberately empty. NPCs are campaign-scoped and DM-only
      // today (`campaign_npcs` has no visibility flag at all), so shipping the
      // list now would mean either showing players every NPC the DM has ever
      // named, or inventing a visibility model in passing. The tab renders the
      // section only when this is non-empty, so filling it later is a server
      // change and nothing else.
      npcs: [],
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/campaigns/:campaignId/journal', requireAuth, async (req, res) => {
  const { campaignId } = req.params;
  try {
    if (!await canAccessCampaign(campaignId, req.session.userId, req.session.role))
      return res.status(403).json({ error: 'Access denied' });
    const isDM = await isCampaignDm(campaignId, req.session.userId, req.session.role);

    const r = await pool.query(
      `SELECT j.id, j.title, j.body, j.category, j.in_game_day, j.created_at, j.updated_at,
              j.created_by, j.player_id,
              ${isDM ? 'j.location_id,' : 'CASE WHEN cl.is_public THEN j.location_id ELSE NULL END AS location_id,'}
              ${isDM ? 'j.dm_only,' : ''}
              u.username AS author_username,
              cp.player_name AS author_character,
              ${isDM ? 'cl.name' : 'CASE WHEN cl.is_public THEN cl.name ELSE NULL END'} AS location_name
         FROM campaign_journal_entries j
         JOIN users u ON u.id = j.created_by
         LEFT JOIN campaign_players cp ON cp.id = j.player_id
         LEFT JOIN campaign_locations cl ON cl.id = j.location_id
        WHERE j.campaign_id = $1
          ${isDM ? '' : 'AND j.dm_only = false'}
        -- In-game date first, ascending, so the journal reads forward like the
        -- diary rather than like a feed. An entry with no in-game date has not
        -- been placed in the story, so it collects at the end of its group.
        ORDER BY j.in_game_day ASC NULLS LAST, j.created_at ASC`,
      [campaignId],
    );
    res.json(r.rows.map((e) => ({ ...e, mine: e.created_by === req.session.userId })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/**
 * Write an entry. Any member of the campaign may.
 *
 * `dm_only` is accepted only from the DM — a player cannot post something the
 * rest of the table cannot see, because a journal nobody else reads is just a
 * diary, and they already have one of those.
 *
 * A location is accepted only if the author can actually see it: a player
 * naming a hidden location would be guessing at an id, and letting it through
 * would confirm the guess.
 */
app.post('/api/campaigns/:campaignId/journal', requireAuth, async (req, res) => {
  const { campaignId } = req.params;
  const { title, body, category, location_id: locId, in_game_day: day,
    dm_only: dmOnly } = req.body ?? {};
  if (!String(body ?? '').trim() && !String(title ?? '').trim())
    return res.status(400).json({ error: 'An entry needs a title or a body' });
  try {
    if (!await canAccessCampaign(campaignId, req.session.userId, req.session.role))
      return res.status(403).json({ error: 'Access denied' });
    const isDM = await isCampaignDm(campaignId, req.session.userId, req.session.role);

    const location = await resolveJournalLocation(locId, campaignId, isDM);
    if (location === false) return res.status(400).json({ error: 'No such location' });

    // Which character the author was playing. The DM has none.
    const who = await pool.query(
      `SELECT cp.id FROM campaign_players cp
         JOIN campaign_user_assignments cua ON cua.player_id = cp.id
        WHERE cp.campaign_id=$1 AND cua.user_id=$2
        -- A player may have more than one character here. Which one wrote the
        -- note is not recorded anywhere, so ORDER BY makes the guess at least
        -- stable: the same character every time, rather than whichever row the
        -- planner happened to return first.
        ORDER BY cp.id ASC LIMIT 1`,
      [campaignId, req.session.userId],
    );

    const r = await pool.query(
      `INSERT INTO campaign_journal_entries
         (campaign_id, created_by, player_id, location_id, title, body, category,
          in_game_day, dm_only)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [campaignId, req.session.userId, who.rows[0]?.id ?? null, location,
        journalStr(title, 255), journalStr(body, 50000), journalStr(category, 120),
        journalDay(day), isDM ? !!dmOnly : false],
    );
    res.json({ success: true, id: r.rows[0].id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/** Edit. The author only — the DM can remove an entry but not rewrite it. */
app.put('/api/campaigns/:campaignId/journal/:entryId', requireAuth, async (req, res) => {
  const { campaignId, entryId } = req.params;
  const { title, body, category, location_id: locId, in_game_day: day,
    dm_only: dmOnly } = req.body ?? {};
  try {
    if (!await canAccessCampaign(campaignId, req.session.userId, req.session.role))
      return res.status(403).json({ error: 'Access denied' });
    const entry = await journalEntry(entryId, campaignId);
    if (!entry) return res.status(404).json({ error: 'Entry not found' });
    if (Number(entry.created_by) !== Number(req.session.userId)) {
      // Deliberate: a DM tidying the campaign can delete, but a player's words
      // must not change without them knowing.
      return res.status(403).json({ error: 'Only the author can edit an entry' });
    }
    const isDM = await isCampaignDm(campaignId, req.session.userId, req.session.role);
    const location = await resolveJournalLocation(locId, campaignId, isDM);
    if (location === false) return res.status(400).json({ error: 'No such location' });

    await pool.query(
      `UPDATE campaign_journal_entries
          SET title=$1, body=$2, category=$3, location_id=$4, in_game_day=$5,
              dm_only=$6, updated_at=CURRENT_TIMESTAMP
        WHERE id=$7 AND campaign_id=$8`,
      [journalStr(title, 255), journalStr(body, 50000), journalStr(category, 120),
        location, journalDay(day), isDM ? !!dmOnly : false, entryId, campaignId],
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/** Delete. The author, or the DM of the campaign. */
app.delete('/api/campaigns/:campaignId/journal/:entryId', requireAuth, async (req, res) => {
  const { campaignId, entryId } = req.params;
  try {
    if (!await canAccessCampaign(campaignId, req.session.userId, req.session.role))
      return res.status(403).json({ error: 'Access denied' });
    const entry = await journalEntry(entryId, campaignId);
    if (!entry) return res.status(404).json({ error: 'Entry not found' });
    const isDM = await isCampaignDm(campaignId, req.session.userId, req.session.role);
    if (!isDM && Number(entry.created_by) !== Number(req.session.userId))
      return res.status(403).json({ error: 'Access denied' });
    await pool.query('DELETE FROM campaign_journal_entries WHERE id=$1 AND campaign_id=$2',
      [entryId, campaignId]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


// ============================================
// CAMPAIGN META (today_marker, etc.)

// ─── Campaign NPCs (DM-only) ─────────────────────────────────────────────────
app.get('/api/campaigns/:campaignId/npcs', requireRole(['dm', 'admin']), async (req, res) => {
  try {
    if (!await dmOwnsCampaign(req.params.campaignId, req.session.userId, req.session.role))
      return res.status(403).json({ error: 'Access denied' });
    const r = await pool.query(
      'SELECT * FROM campaign_npcs WHERE campaign_id=$1 ORDER BY name ASC',
      [req.params.campaignId]
    );
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/campaigns/:campaignId/npcs', requireRole(['dm', 'admin']), async (req, res) => {
  const { names } = req.body; // comma-separated string or array
  if (!names) return res.status(400).json({ error: 'names required' });
  const list = (Array.isArray(names) ? names : String(names).split(','))
    .map(n => n.trim()).filter(Boolean);
  if (!list.length) return res.status(400).json({ error: 'No valid names provided' });
  try {
    if (!await dmOwnsCampaign(req.params.campaignId, req.session.userId, req.session.role))
      return res.status(403).json({ error: 'Access denied' });
    const inserted = [];
    for (const name of list) {
      const r = await pool.query(
        'INSERT INTO campaign_npcs (campaign_id, name) VALUES ($1,$2) ON CONFLICT (campaign_id, name) DO NOTHING RETURNING *',
        [req.params.campaignId, name]
      );
      if (r.rows.length) inserted.push(r.rows[0]);
    }
    res.json(inserted);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/campaigns/:campaignId/npcs/:npcId', requireRole(['dm', 'admin']), async (req, res) => {
  try {
    if (!await dmOwnsCampaign(req.params.campaignId, req.session.userId, req.session.role))
      return res.status(403).json({ error: 'Access denied' });
    const { npcId, campaignId } = req.params;
    // Block if this NPC is referenced as an actor in any timeline entry
    const npcKey = `npc_${npcId}`;
    const tlCheck = await pool.query(
      `SELECT COUNT(*)::int as cnt FROM player_timeline_entries
       WHERE campaign_id=$1 AND $2 = ANY(player_ids)`,
      [campaignId, npcKey]
    );
    if (tlCheck.rows[0].cnt > 0) {
      return res.status(409).json({
        error: `This NPC is used as an actor in ${tlCheck.rows[0].cnt} timeline event${tlCheck.rows[0].cnt === 1 ? '' : 's'}. Remove those entries first.`
      });
    }
    await pool.query('DELETE FROM campaign_npcs WHERE id=$1 AND campaign_id=$2',
      [npcId, campaignId]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Character Relationship Tree (DM cross-player connections) ────────────────
// GET all pc_relationships for every player in a campaign + DM cross-connections
app.get('/api/campaigns/:campaignId/char-tree', requireRole(['dm', 'admin']), async (req, res) => {
  const { campaignId } = req.params;
  try {
    if (!await dmOwnsCampaign(req.params.campaignId, req.session.userId, req.session.role))
      return res.status(403).json({ error: 'Access denied' });
    // All players with their character name
    const players = await pool.query(
      `SELECT cp.id as player_id, cp.player_name, pcc.id as char_id, pcc.name as char_name
       FROM campaign_players cp
       LEFT JOIN pc_characters pcc ON pcc.player_id = cp.id
       WHERE cp.campaign_id = $1 AND cp.is_dm_player = false
       ORDER BY cp.player_name ASC`,
      [campaignId]
    );
    // All pc_relationships for all players in this campaign
    const rels = await pool.query(
      `SELECT pr.*, cp.id as player_id, cp.player_name
       FROM pc_relationships pr
       JOIN pc_characters pcc ON pcc.id = pr.character_id
       JOIN campaign_players cp ON cp.id = pcc.player_id
       WHERE cp.campaign_id = $1
       ORDER BY cp.player_name ASC, pr.name ASC`,
      [campaignId]
    );
    const npcs = await pool.query(
      `SELECT * FROM campaign_npcs WHERE campaign_id = $1 ORDER BY name ASC`,
      [campaignId]
    );
    // DM cross-connections
    const cross = await pool.query(
      `SELECT * FROM character_relationships WHERE campaign_id = $1 ORDER BY created_at ASC`,
      [campaignId]
    );
    res.json({ players: players.rows, relationships: rels.rows, npcs: npcs.rows, cross_connections: cross.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST a DM cross-connection — from_rel_id and to_rel_id accept "p_N" (player), "r_N" (pc_relationship), "n_N" (npc)
app.post('/api/campaigns/:campaignId/char-tree/connections', requireRole(['dm', 'admin']), async (req, res) => {
  const { campaignId } = req.params;
  const { from_rel_id, to_rel_id, label, notes } = req.body;
  if (!await dmOwnsCampaign(campaignId, req.session.userId, req.session.role))
    return res.status(403).json({ error: 'Access denied' });
  if (!from_rel_id || !to_rel_id || !label) return res.status(400).json({ error: 'from_rel_id, to_rel_id and label required' });
  if (from_rel_id === to_rel_id) return res.status(400).json({ error: 'From and To must differ' });
  function parseEntity(raw) {
    if (typeof raw === 'string' && raw.startsWith('p_')) return { type: 'player', id: parseInt(raw.slice(2)) };
    if (typeof raw === 'string' && raw.startsWith('r_')) return { type: 'relationship', id: parseInt(raw.slice(2)) };
    if (typeof raw === 'string' && raw.startsWith('n_')) return { type: 'npc', id: parseInt(raw.slice(2)) };
    return { type: 'player', id: parseInt(raw) };
  }
  const from = parseEntity(from_rel_id);
  const to = parseEntity(to_rel_id);
  if (isNaN(from.id) || isNaN(to.id)) return res.status(400).json({ error: 'Invalid entity IDs' });
  try {
    const r = await pool.query(
      `INSERT INTO character_relationships (campaign_id, from_entity_type, from_entity_id, to_entity_type, to_entity_id, label, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [campaignId, from.type, from.id, to.type, to.id, label, notes || null]
    );
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH a DM cross-connection (update label and/or notes)
app.patch('/api/campaigns/:campaignId/char-tree/connections/:connId', requireRole(['dm', 'admin']), async (req, res) => {
  const { campaignId, connId } = req.params;
  const updates = {};
  if ('label' in req.body) updates.label = req.body.label || null;
  if ('notes' in req.body) updates.notes = req.body.notes || null;
  if (!Object.keys(updates).length) return res.status(400).json({ error: 'Nothing to update' });
  if (updates.label !== undefined && !updates.label) return res.status(400).json({ error: 'Label cannot be empty' });
  try {
    if (!await dmOwnsCampaign(req.params.campaignId, req.session.userId, req.session.role))
      return res.status(403).json({ error: 'Access denied' });
    const keys = Object.keys(updates);
    const setClauses = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
    const values = [...Object.values(updates), connId, campaignId];
    const result = await pool.query(
      `UPDATE character_relationships SET ${setClauses} WHERE id = $${values.length - 1} AND campaign_id = $${values.length} RETURNING *`,
      values
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Connection not found' });
    res.json(result.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE a DM cross-connection
app.delete('/api/campaigns/:campaignId/char-tree/connections/:connId', requireRole(['dm', 'admin']), async (req, res) => {
  try {
    if (!await dmOwnsCampaign(req.params.campaignId, req.session.userId, req.session.role))
      return res.status(403).json({ error: 'Access denied' });
    await pool.query('DELETE FROM character_relationships WHERE id=$1 AND campaign_id=$2', [req.params.connId, req.params.campaignId]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH toggle is_public on a DM cross-connection
app.patch('/api/campaigns/:campaignId/char-tree/connections/:connId/visibility', requireRole(['dm', 'admin']), async (req, res) => {
  try {
    if (!await dmOwnsCampaign(req.params.campaignId, req.session.userId, req.session.role))
      return res.status(403).json({ error: 'Access denied' });
    const result = await pool.query(
      'UPDATE character_relationships SET is_public = NOT is_public WHERE id=$1 AND campaign_id=$2 RETURNING id, is_public',
      [req.params.connId, req.params.campaignId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Connection not found' });
    res.json(result.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── DM Player entry — auto-provision a campaign_players row for the DM ──────
// Returns the DM's own player_id (creates one if missing)
app.post('/api/campaigns/:campaignId/dm-player', requireRole(['dm', 'admin']), async (req, res) => {
  const { campaignId } = req.params;
  try {
    if (!await dmOwnsCampaign(req.params.campaignId, req.session.userId, req.session.role))
      return res.status(403).json({ error: 'Access denied' });
    // Find or create a special DM player entry
    let r = await pool.query(
      `SELECT cp.id FROM campaign_players cp
       JOIN campaign_user_assignments cua ON cua.player_id = cp.id
       WHERE cp.campaign_id=$1 AND cua.user_id=$2 AND cp.is_dm_player=true`,
      [campaignId, req.session.userId]
    );
    if (r.rows.length) return res.json({ player_id: r.rows[0].id });

    // Create DM player entry
    const user = await pool.query('SELECT username FROM users WHERE id=$1', [req.session.userId]);
    const dmName = `DM (${user.rows[0]?.username || 'DM'})`;
    const player = await pool.query(
      'INSERT INTO campaign_players (campaign_id, player_name, is_dm_player) VALUES ($1,$2,true) RETURNING id',
      [campaignId, dmName]
    );
    await pool.query(
      'INSERT INTO campaign_user_assignments (player_id, user_id) VALUES ($1,$2)',
      [player.rows[0].id, req.session.userId]
    );
    res.json({ player_id: player.rows[0].id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
// ============================================

app.get('/api/campaigns/:campaignId/meta', requireRole(['dm', 'player']), async (req, res) => {
  try {
    if (!await canAccessCampaign(req.params.campaignId, req.session.userId, req.session.role))
      return res.status(403).json({ error: 'Access denied' });
    const result = await pool.query(
      'SELECT * FROM campaign_meta WHERE campaign_id = $1',
      [req.params.campaignId]
    );
    res.json(result.rows[0] || {});
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/campaigns/:campaignId/meta', requireRole(['dm']), async (req, res) => {
  const { today_marker, calendar_type } = req.body;
  try {
    if (!await dmOwnsCampaign(req.params.campaignId, req.session.userId, req.session.role))
      return res.status(403).json({ error: 'Access denied' });
    const existing = await pool.query(
      'SELECT id FROM campaign_meta WHERE campaign_id = $1', [req.params.campaignId]
    );
    let result;
    if (existing.rows.length) {
      result = await pool.query(
        `UPDATE campaign_meta SET today_marker=$1, calendar_type=COALESCE($2, calendar_type),
          updated_at=CURRENT_TIMESTAMP WHERE campaign_id=$3 RETURNING *`,
        [today_marker, calendar_type || null, req.params.campaignId]
      );
    } else {
      result = await pool.query(
        'INSERT INTO campaign_meta (campaign_id, today_marker, calendar_type) VALUES ($1,$2,$3) RETURNING *',
        [req.params.campaignId, today_marker, calendar_type || 'harptos']
      );
    }
    res.json(result.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET list of players with private timeline entries for a campaign (DM view in manage-campaigns)
app.get('/api/campaigns/:campaignId/timelines', requireRole(['dm']), async (req, res) => {
  const { campaignId } = req.params;
  try {
    // DM must own the campaign
    // Helper rather than an inline query, so this inherits the trash guard.
    if (!await dmOwnsCampaign(campaignId, req.session.userId, req.session.role))
      return res.status(403).json({ error: 'Access denied' });

    const result = await pool.query(
      `SELECT cp.id as player_id, cp.player_name, u.username,
              COUNT(pte.id)::int as entry_count,
              MIN(pte.year) as first_year, MAX(pte.year) as last_year
       FROM campaign_players cp
       LEFT JOIN campaign_user_assignments cua ON cp.id = cua.player_id
       LEFT JOIN users u ON cua.user_id = u.id
       LEFT JOIN player_timeline_entries pte ON cp.id = pte.player_id AND pte.campaign_id = $1
       WHERE cp.campaign_id = $1
       GROUP BY cp.id, cp.player_name, u.username
       ORDER BY cp.player_name`,
      [campaignId]
    );
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================
// JOURNEY PATH MAPS
// ============================================

// Helper: check DM owns this map's campaign (and that the campaign is not trashed)
async function dmOwnsMap(mapId, userId) {
  const r = await pool.query(
    `SELECT c.id FROM journey_maps jm
     JOIN campaigns c ON jm.campaign_id = c.id
     WHERE jm.id = $1 AND c.dm_user_id = $2 AND c.deleted_at IS NULL`,
    [mapId, userId]
  );
  return r.rows.length > 0;
}

// List maps for a campaign
app.get('/api/campaigns/:campaignId/journey-maps', requireRole(['dm']), async (req, res) => {
  try {
    if (!await dmOwnsCampaign(req.params.campaignId, req.session.userId, req.session.role))
      return res.status(403).json({ error: 'Access denied' });
    const r = await pool.query(
      'SELECT id, name, description, scope_type, scope_location_id, created_at FROM journey_maps WHERE campaign_id=$1 ORDER BY created_at DESC',
      [req.params.campaignId]
    );
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Create map
app.post('/api/campaigns/:campaignId/journey-maps', requireRole(['dm']), async (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  try {
    if (!await dmOwnsCampaign(req.params.campaignId, req.session.userId, req.session.role))
      return res.status(403).json({ error: 'Access denied' });
    const r = await pool.query(
      'INSERT INTO journey_maps (campaign_id, name, description, scope_type, scope_location_id, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, name, description, scope_type, scope_location_id, created_at',
      [req.params.campaignId, name, description || null, req.body.scope_type || 'continent', req.body.scope_location_id || null, req.session.userId]
    );
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Delete map
app.delete('/api/journey-maps/:id', requireRole(['dm']), async (req, res) => {
  try {
    if (!await dmOwnsMap(req.params.id, req.session.userId))
      return res.status(403).json({ error: 'Access denied' });
    await pool.query('DELETE FROM journey_maps WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Update map scope (continent vs city)
// Get / save map image
app.get('/api/journey-maps/:id/image', requireRole(['dm']), async (req, res) => {
  try {
    if (!await dmOwnsMap(req.params.id, req.session.userId))
      return res.status(403).json({ error: 'Access denied' });
    const r = await pool.query('SELECT map_image FROM journey_maps WHERE id=$1', [req.params.id]);
    res.json({ image: r.rows[0]?.map_image || null });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/journey-maps/:id/image', requireRole(['dm']), async (req, res) => {
  try {
    if (!await dmOwnsMap(req.params.id, req.session.userId))
      return res.status(403).json({ error: 'Access denied' });
    await pool.query('UPDATE journey_maps SET map_image=$1 WHERE id=$2', [req.body.image, req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Placed locations ──
app.get('/api/journey-maps/:id/locations', requireRole(['dm']), async (req, res) => {
  try {
    if (!await dmOwnsMap(req.params.id, req.session.userId))
      return res.status(403).json({ error: 'Access denied' });
    const r = await pool.query(
      `SELECT jml.*, cl.size_type, cl.parent_id, cl.image_data, lm.name AS linked_map_name
       FROM journey_map_locations jml
       LEFT JOIN campaign_locations cl ON cl.id = jml.campaign_location_id
       LEFT JOIN journey_maps lm ON lm.id = jml.linked_map_id
       WHERE jml.map_id=$1 ORDER BY jml.created_at ASC`,
      [req.params.id]
    );
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/journey-maps/:id/locations', requireRole(['dm']), async (req, res) => {
  const { campaign_location_id, name, x, y, polygon, linked_map_id, icon_scale } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  try {
    if (!await dmOwnsMap(req.params.id, req.session.userId))
      return res.status(403).json({ error: 'Access denied' });
    const r = await pool.query(
      'INSERT INTO journey_map_locations (map_id, campaign_location_id, name, x, y, polygon, linked_map_id, icon_scale) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
      [req.params.id, campaign_location_id || null, name, x ?? 50, y ?? 50, polygon ? JSON.stringify(polygon) : null, linked_map_id || null, icon_scale ?? 1]
    );
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/journey-maps/:id/locations/:locId', requireRole(['dm']), async (req, res) => {
  const { x, y, polygon, linked_map_id, icon_scale } = req.body;
  try {
    if (!await dmOwnsMap(req.params.id, req.session.userId))
      return res.status(403).json({ error: 'Access denied' });
    const r = await pool.query(
      // icon_scale is COALESCEd so callers that only save geometry don't reset it.
      'UPDATE journey_map_locations SET x=$1, y=$2, polygon=$3, linked_map_id=$4, icon_scale=COALESCE($5, icon_scale) WHERE id=$6 AND map_id=$7 RETURNING *',
      [x, y, polygon !== undefined ? JSON.stringify(polygon) : null, linked_map_id !== undefined ? (linked_map_id || null) : null, icon_scale ?? null, req.params.locId, req.params.id]
    );
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/journey-maps/:id/locations/:locId', requireRole(['dm']), async (req, res) => {
  try {
    if (!await dmOwnsMap(req.params.id, req.session.userId))
      return res.status(403).json({ error: 'Access denied' });
    await pool.query('DELETE FROM journey_map_locations WHERE id=$1 AND map_id=$2', [req.params.locId, req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Distances ──
app.get('/api/journey-maps/:id/distances', requireRole(['dm']), async (req, res) => {
  try {
    if (!await dmOwnsMap(req.params.id, req.session.userId))
      return res.status(403).json({ error: 'Access denied' });
    const r = await pool.query('SELECT * FROM journey_distances WHERE map_id=$1', [req.params.id]);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/journey-maps/:id/distances', requireRole(['dm']), async (req, res) => {
  const { from_loc_id, to_loc_id, distance_miles } = req.body;
  try {
    if (!await dmOwnsMap(req.params.id, req.session.userId))
      return res.status(403).json({ error: 'Access denied' });
    const upsert = `
      INSERT INTO journey_distances (map_id, from_loc_id, to_loc_id, distance_miles)
      VALUES ($1,$2,$3,$4)
      ON CONFLICT (map_id, from_loc_id, to_loc_id) DO UPDATE SET distance_miles=EXCLUDED.distance_miles`;
    await pool.query(upsert, [req.params.id, from_loc_id, to_loc_id, distance_miles]);
    await pool.query(upsert, [req.params.id, to_loc_id, from_loc_id, distance_miles]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Trackers ──
// ── Paths ──
// NOTE: journey_trackers is retired (dormant table). Movement paths are derived
// from the timeline; stored paths keep their name/colour on the row itself via the
// tracker_*_override columns (aliased below for response-shape stability).
app.get('/api/journey-maps/:id/paths', requireRole(['dm']), async (req, res) => {
  try {
    if (!await dmOwnsMap(req.params.id, req.session.userId))
      return res.status(403).json({ error: 'Access denied' });
    const r = await pool.query(
      `SELECT jp.*,
              jp.tracker_name_override  AS tracker_name,
              jp.tracker_color_override AS tracker_color
       FROM journey_paths jp
       WHERE jp.map_id=$1 ORDER BY jp.created_at ASC`,
      [req.params.id]
    );
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/journey-maps/:id/paths', requireRole(['dm']), async (req, res) => {
  const { tracker_id, tracker_color, tracker_name, name, waypoints, notes, kind, route_type, label_x, label_y } = req.body;
  const ROUTE_TYPES = ['road', 'flight', 'maritime'];
  try {
    if (!await dmOwnsMap(req.params.id, req.session.userId))
      return res.status(403).json({ error: 'Access denied' });
    const r = await pool.query(
      `INSERT INTO journey_paths
         (map_id, tracker_id, tracker_color_override, tracker_name_override, name, waypoints, notes, kind, route_type, label_x, label_y, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [req.params.id, tracker_id || null,
      tracker_color || null, tracker_name || null,
      name || (kind === 'route' ? 'Road' : 'Path'), JSON.stringify(waypoints || []),
      notes || null, kind === 'route' ? 'route' : 'path',
      ROUTE_TYPES.includes(route_type) ? route_type : 'road',
      label_x ?? null, label_y ?? null, req.session.userId]
    );
    const row = r.rows[0];
    row.tracker_color = row.tracker_color_override || row.tracker_color || '#c9a84c';
    row.tracker_name = row.tracker_name_override || row.tracker_name || null;
    res.json(row);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/journey-maps/:id/paths/:pid', requireRole(['dm']), async (req, res) => {
  const { name, waypoints, notes, label_x, label_y } = req.body;
  try {
    if (!await dmOwnsMap(req.params.id, req.session.userId))
      return res.status(403).json({ error: 'Access denied' });
    const r = await pool.query(
      // label_x/label_y are COALESCEd so geometry/name saves don't reset the label position.
      'UPDATE journey_paths SET name=$1, waypoints=$2, notes=$3, label_x=COALESCE($4, label_x), label_y=COALESCE($5, label_y) WHERE id=$6 AND map_id=$7 RETURNING *',
      [name, JSON.stringify(waypoints), notes || null, label_x ?? null, label_y ?? null, req.params.pid, req.params.id]
    );
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/journey-maps/:id/paths/:pid', requireRole(['dm']), async (req, res) => {
  try {
    if (!await dmOwnsMap(req.params.id, req.session.userId))
      return res.status(403).json({ error: 'Access denied' });
    await pool.query('DELETE FROM journey_paths WHERE id=$1 AND map_id=$2', [req.params.pid, req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Share (public token) ──
//
// STABLE, not rotating. This used to mint a fresh token on every call and
// upsert over the old one, so a DM pressing Share a second time — which is
// mostly what Share is FOR, re-copying the URL — silently killed every link
// already pasted into Discord. The players' next click got a 404 reading
// "Map not found", which points at the map rather than at the link.
//
// Every other share token in the app (the diary's, a timeline's, a campaign
// timeline's, a PC sheet's) was already stable; this one was the exception.
// Revocation is the separate DELETE below, so losing a link stays a deliberate
// act rather than a side effect of looking at it.
app.post('/api/journey-maps/:id/share', requireRole(['dm']), async (req, res) => {
  try {
    if (!await dmOwnsMap(req.params.id, req.session.userId))
      return res.status(403).json({ error: 'Access denied' });
    const existing = await pool.query('SELECT token FROM journey_map_shares WHERE map_id=$1', [req.params.id]);
    if (existing.rows.length) return res.json({ token: existing.rows[0].token });
    const token = hashId(parseInt(req.params.id)) + crypto.randomBytes(4).toString('hex');
    await pool.query(
      `INSERT INTO journey_map_shares (map_id, token) VALUES ($1,$2)
       ON CONFLICT (map_id) DO UPDATE SET token=EXCLUDED.token`,
      [req.params.id, token]
    );
    res.json({ token });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/** Revoke — the deliberate act. The next Share mints a new token. */
app.delete('/api/journey-maps/:id/share', requireRole(['dm']), async (req, res) => {
  try {
    if (!await dmOwnsMap(req.params.id, req.session.userId))
      return res.status(403).json({ error: 'Access denied' });
    await pool.query('DELETE FROM journey_map_shares WHERE map_id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Public read-only endpoint ──
// Node mirror of frontend/src/components/map/derivePaths.js — build Party + per-player
// + per-NPC movement paths from timeline events. Ordering is calendar-invariant (both
// calendars are monotonic in year/day), so a plain year*365+doy key is fine for sequencing.
const PARTY_MIN_PLAYERS = 3; // an event with ≥ this many players is a Party event
const PLAYER_PATH_PALETTE = ['#3498db', '#e74c3c', '#2ecc71', '#9b59b6', '#f1c40f', '#1abc9c', '#e67e22', '#34495e', '#fd79a8', '#00cec9', '#6c5ce7', '#fab1a0'];
const NPC_PATH_PALETTE = ['#c0392b', '#2980b9', '#27ae60', '#8e44ad', '#e67e22', '#16a085', '#d35400', '#2c3e50', '#7f8c8d', '#f39c12', '#1abc9c', '#e74c3c'];
function deriveMovementPaths({ events, pins, players, npcs }) {
  const orderKey = (y, d) => (y - 1) * 365 + ((d || 1) - 1);
  const participants = (ev) => {
    const s = new Set();
    if (ev.player_id != null && !ev.is_dm_player) s.add(String(ev.player_id));
    for (const tok of (ev.player_ids || [])) {
      const parts = String(tok).split('_');
      if (parts[0] === 'self' || parts[0] === 'cp') s.add(parts.slice(1).join('_'));
    }
    return s;
  };
  const orderedStops = (evs) => {
    const stops = (evs || [])
      .map((e) => { const pin = pins.get(String(e.location || '').toLowerCase()); return pin ? { ...pin, abs: orderKey(e.year, e.day_of_year) } : null; })
      .filter(Boolean)
      .sort((a, b) => a.abs - b.abs);
    const out = [];
    for (const s of stops) { if (out.length && out[out.length - 1].locId === s.locId) continue; out.push({ x: s.x, y: s.y, locId: s.locId }); }
    return out;
  };
  const isParty = (e) => !!e.is_party || participants(e).size >= PARTY_MIN_PLAYERS;
  const paths = [];

  // Party — explicit party events OR events involving ≥ 3 players.
  const partyW = orderedStops(events.filter(isParty));
  if (partyW.length >= 2) paths.push({ id: 'party', kind: 'path', name: '🌍 Party', tracker_color: '#e8c96a', waypoints: partyW });

  // Per player — the remaining (non-party) events belong to each involved player.
  const soloEvents = events.filter((e) => !isParty(e));
  (players || []).forEach((pl, i) => {
    const pid = String(pl.id);
    const evs = soloEvents.filter((e) => participants(e).has(pid));
    const w = orderedStops(evs);
    if (w.length >= 2) paths.push({ id: `player_${pl.id}`, kind: 'path', name: `👤 ${pl.player_name || 'Player'}`, tracker_color: PLAYER_PATH_PALETTE[i % PLAYER_PATH_PALETTE.length], waypoints: w, playerId: pl.id });
  });

  // Per NPC — any event tagging that NPC. NPCs are DM-controlled, so their movements
  // are authored in DM-owned timelines — do NOT exclude DM timelines here.
  (npcs || []).forEach((npc, i) => {
    const tok = `npc_${npc.id}`;
    const evs = events.filter((e) => (e.player_ids || []).includes(tok));
    const w = orderedStops(evs);
    if (w.length >= 2) paths.push({ id: `npc_${npc.id}`, kind: 'path', name: `🎭 ${npc.name}`, tracker_color: NPC_PATH_PALETTE[i % NPC_PATH_PALETTE.length], waypoints: w, npcId: npc.id });
  });
  return paths;
}

app.get('/api/journey-map-public/:token', async (req, res) => {
  try {
    const share = await pool.query('SELECT map_id FROM journey_map_shares WHERE token=$1', [req.params.token]);
    // Distinguish the two 404s. A link that no longer resolves is almost always
    // a revoked or superseded one, and "Map not found" sent a player looking for
    // a map that is sitting there fine.
    if (!share.rows.length) {
      return res.status(404).json({
        error: 'This share link is no longer valid — ask your DM for a new one',
        code: 'SHARE_REVOKED',
      });
    }
    const mapId = share.rows[0].map_id;

    // The shared map is viewer-aware. Every reader is now a logged-in member
    // of the campaign (see the shareGate call below), so this tailors what is
    // shown rather than deciding whether to show anything: hidden
    // locations/roads are dropped for everyone, and movement paths go by role
    // — DM owner → all; player → their own, plus the party's.
    const userId = req.session.userId || null;
    const role   = req.session.role   || null;
    const isDmOwner = !!userId && role === 'dm' && await dmOwnsMap(mapId, userId);

    const [mapR, locsR, distsR, pathsR] = await Promise.all([
      // Joined to campaigns purely for the deleted_at guard — this handler never
      // otherwise reads the campaign row, so a trashed campaign's map stayed
      // publicly readable without it.
      pool.query(`SELECT jm.id, jm.name, jm.description, jm.map_image, jm.campaign_id
                    FROM journey_maps jm
                    JOIN campaigns c ON c.id = jm.campaign_id
                   WHERE jm.id=$1 AND c.deleted_at IS NULL`, [mapId]),
      // Only locations the DM has NOT hidden in Manage Campaign (hide cascades to
      // children server-side). A pin with no linked campaign_location is treated
      // as visible.
      pool.query(`SELECT jml.id, jml.name, jml.x, jml.y, jml.polygon, jml.icon_scale, cl.description AS location_description, cl.size_type, cl.image_data
                  FROM journey_map_locations jml
                  LEFT JOIN campaign_locations cl ON cl.id = jml.campaign_location_id
                  WHERE jml.map_id=$1 AND (cl.is_public IS NULL OR cl.is_public = true)
                  ORDER BY jml.created_at ASC`, [mapId]),
      pool.query('SELECT from_loc_id, to_loc_id, distance_miles FROM journey_distances WHERE map_id=$1', [mapId]),
      // journey_trackers retired — stored paths carry their own name/colour via overrides.
      pool.query(
        `SELECT jp.id, jp.name, jp.kind, jp.route_type, jp.waypoints, jp.distance_miles, jp.notes,
                jp.tracker_name_override AS tracker_name, jp.tracker_color_override AS tracker_color
         FROM journey_paths jp
         WHERE jp.map_id=$1 ORDER BY jp.created_at ASC`, [mapId])
    ]);
    if (!mapR.rows.length) return res.status(404).json({ error: 'Map not found' });

    const visibleLocIds = new Set(locsR.rows.map(l => String(l.id)));
    const campaignId = mapR.rows[0].campaign_id;

    // After the token and the trash guard, before the second (larger) batch of
    // queries below, so a refused viewer costs one round trip rather than all
    // of them.
    const gate = await shareGate(req, campaignId);
    if (gate) return denyShare(res, gate);

    const wptsOf = (p) => (Array.isArray(p.waypoints) ? p.waypoints : JSON.parse(p.waypoints || '[]'));

    // Movement paths are DERIVED from timeline events (Party + per-player + per-NPC),
    // then filtered per viewer:
    //   • DM owner        → everything
    //   • logged-in player → Party + their OWN player path + public NPC paths
    //   • anonymous        → public NPC paths only
    const [evRows, plRows, npcRows, viewerPlR] = await Promise.all([
      pool.query(
        `SELECT pte.player_id, pte.location, pte.year, pte.day_of_year, pte.is_party, pte.player_ids, cp.is_dm_player
         FROM player_timeline_entries pte
         LEFT JOIN campaign_players cp ON cp.id = pte.player_id
         WHERE pte.campaign_id=$1`, [campaignId]),
      pool.query('SELECT id, player_name FROM campaign_players WHERE campaign_id=$1 AND (is_dm_player IS NULL OR is_dm_player=false) ORDER BY player_name ASC', [campaignId]),
      pool.query('SELECT id, name FROM campaign_npcs WHERE campaign_id=$1 ORDER BY name ASC', [campaignId]),
      userId
        ? pool.query(
            `SELECT cua.player_id FROM campaign_user_assignments cua
             JOIN campaign_players cp ON cp.id = cua.player_id
             WHERE cua.user_id=$1 AND cp.campaign_id=$2`, [userId, campaignId])
        : Promise.resolve({ rows: [] }),
    ]);
    const pins = new Map();
    locsR.rows.forEach(l => { if (l.name != null) pins.set(String(l.name).toLowerCase(), { x: l.x, y: l.y, locId: l.id }); });
    const derived = deriveMovementPaths({
      events: evRows.rows,
      pins,
      players: plRows.rows,
      npcs: npcRows.rows,
    });
    // The player ids this logged-in viewer controls in this campaign (own paths).
    const viewerPlayerIds = new Set(viewerPlR.rows.map(r => String(r.player_id)));
    const movement = derived.filter(p => {
      if (isDmOwner) return true;
      if (p.id === 'party') return !!userId;                                   // any member of the campaign
      if (String(p.id).startsWith('player_')) return viewerPlayerIds.has(String(p.playerId)); // own path only
      return false;                                                            // NPC paths: DM-only, never public
    });

    // Roads (routes) are still sent for distance calculation only — the client keeps them
    // off the map but uses their sections to compute distances (even through hidden cities).
    const routes = pathsR.rows.filter(p => p.kind === 'route');
    const visiblePaths = [...routes, ...movement];

    // Distances only between still-visible locations.
    const visibleDistances = distsR.rows.filter(d =>
      visibleLocIds.has(String(d.from_loc_id)) && visibleLocIds.has(String(d.to_loc_id)));

    // Events referenced by the surviving paths only.
    const allEventIds = new Set();
    visiblePaths.forEach(p => {
      wptsOf(p).forEach(w => {
        (w.eventIds || (w.eventId ? [w.eventId] : [])).forEach(id => allEventIds.add(id));
      });
    });

    let eventsById = {};
    if (allEventIds.size > 0) {
      const evR = await pool.query(
        `SELECT pte.id, pte.title, pte.description, pte.location, pte.year, pte.day_of_year,
                pte.player_ids,
                cp.player_name
         FROM player_timeline_entries pte
         LEFT JOIN campaign_players cp ON cp.id = pte.player_id
         WHERE pte.id = ANY($1::int[])`,
        [Array.from(allEventIds)]
      );
      evR.rows.forEach(e => { eventsById[e.id] = e; });
    }

    // Global per-type default pin images (so public pins fall back like the editor).
    const typeImagesR = await pool.query('SELECT size_type, image_data FROM location_type_images');
    const typeImages = {};
    typeImagesR.rows.forEach(row => { if (row.image_data) typeImages[row.size_type] = row.image_data; });

    res.json({
      map: mapR.rows[0],
      locations: locsR.rows,
      distances: visibleDistances,
      paths: visiblePaths,
      events: eventsById,
      type_images: typeImages
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Page routes ──
// NOTE: /journey-map and /journey-map-public/:token are now served by the React
// SPA (catch-all route). Their legacy page routes were removed in v4.8.0–v4.9.0;
// only the /api/* endpoints remain. Role enforcement for /journey-map is handled
// client-side (ProtectedRoute) plus the per-request API role checks.

// ============================================
// PDF API
// ============================================

app.get('/api/pdfs', requireRole(['dm']), async (req, res) => {
  const pdfsDir = path.join(__dirname, 'pdfs');

  try {
    const files = await fsPromises.readdir(pdfsDir);
    const pdfFiles = files.filter(file => file.toLowerCase().endsWith('.pdf'));
    res.json(pdfFiles);
  } catch (error) {
    res.json([]);
  }
});


// ============================================
// EXPORT / IMPORT — CAMPAIGN
// ============================================

// Export a full campaign snapshot (players, locations, meta, npcs)
app.get('/api/campaigns/:id/export', requireRole(['dm']), async (req, res) => {
  const { id } = req.params;
  try {
    // DELIBERATELY no `deleted_at IS NULL` here, and deliberately not routed
    // through dmOwnsCampaign: export must keep working on a TRASHED campaign so
    // "take a copy before you purge it" is possible. One of only two carve-outs
    // (the other is the diary export); both are read-only. The inline query
    // stays because it also returns the campaign row the export needs.
    const check = await pool.query('SELECT * FROM campaigns WHERE id=$1 AND dm_user_id=$2', [id, req.session.userId]);
    if (!check.rows.length) return res.status(403).json({ error: 'Access denied' });
    const campaign = check.rows[0];

    const [metaRes, playersRes, locsRes, npcsRes, timelineEntriesRes, journeyMapsRes, dmPlayerRes] = await Promise.all([
      pool.query('SELECT today_marker, calendar_type FROM campaign_meta WHERE campaign_id=$1', [id]),
      pool.query(
        `SELECT cp.id, cp.player_name, u.username
         FROM campaign_players cp
         LEFT JOIN campaign_user_assignments cua ON cp.id = cua.player_id
         LEFT JOIN users u ON cua.user_id = u.id
         WHERE cp.campaign_id=$1 AND (cp.is_dm_player IS NULL OR cp.is_dm_player = false)
         ORDER BY cp.created_at ASC`, [id]),
      pool.query('SELECT id, name, description, is_public, size_type, parent_id, image_data FROM campaign_locations WHERE campaign_id=$1 ORDER BY created_at ASC', [id]),
      pool.query('SELECT id, name FROM campaign_npcs WHERE campaign_id=$1 ORDER BY name ASC', [id]),
      pool.query(
        `SELECT pte.*, pt.name as timeline_name, cp.player_name
         FROM player_timeline_entries pte
         JOIN player_timelines pt ON pt.id = pte.timeline_id
         JOIN campaign_players cp ON cp.id = pte.player_id
         WHERE pte.campaign_id=$1
         ORDER BY cp.player_name ASC, pt.name ASC, pte.year ASC, pte.day_of_year ASC`, [id]),
      pool.query('SELECT id, name, description, map_image, scope_type, scope_location_id FROM journey_maps WHERE campaign_id=$1 ORDER BY created_at ASC', [id]),
      pool.query(`SELECT cp.id FROM campaign_players cp WHERE cp.campaign_id=$1 AND cp.is_dm_player=true LIMIT 1`, [id]),
    ]);

    // location ref: id → symbolic name (deduplicated)
    const locRefById = {};
    const locNameCount = {};
    for (const l of locsRes.rows) locNameCount[l.name] = (locNameCount[l.name] || 0) + 1;
    const locNameSeen = {};
    for (const l of locsRes.rows) {
      locNameSeen[l.name] = (locNameSeen[l.name] || 0) + 1;
      locRefById[l.id] = locNameCount[l.name] > 1 ? `${l.name}__${locNameSeen[l.name]}` : l.name;
    }
    // Build lookup maps used across player loop and DM timelines
    const playerRefById = {};
    for (const p of playersRes.rows) playerRefById[p.id] = p.player_name;

    const npcNameById = {};
    for (const n of npcsRes.rows) npcNameById[n.id] = n.name;

    /**
     * Gear: the cards this campaign actually has in play, plus every other
     * tier of their chains.
     *
     * Chain-complete on purpose. A campaign may hold tier 2 of a sword while
     * tiers 1 and 3 sit unused in the DM's library; exporting only the tier in
     * play would land a chainless orphan on the far side, and the tier buttons
     * would simply not appear.
     *
     * Cards are referenced from inventory rows by POSITION in this array, never
     * by id — ids mean nothing in another library, which is the whole reason
     * this never worked before.
     */
    const invRes = await pool.query(
      `SELECT i.*, cp.player_name
         FROM inventory_items i
         JOIN campaign_players cp ON cp.id = i.player_id
        WHERE i.campaign_id = $1
        ORDER BY cp.player_name ASC, i.id ASC`, [id],
    );

    const inUse = [...new Set(invRes.rows.map(r => r.item_card_id).filter(Boolean))];
    let cardsOut = [];
    const cardIndexById = new Map();
    if (inUse.length) {
      // Walk each chain whole. The recursive CTE goes both ways: up to the base
      // and back down through every tier.
      const chainRes = await pool.query(
        `WITH RECURSIVE up AS (
             SELECT id, evolves_from FROM item_cards WHERE id = ANY($1::int[])
             UNION
             SELECT c.id, c.evolves_from FROM item_cards c JOIN up ON c.id = up.evolves_from
           ), roots AS (
             SELECT id FROM up WHERE evolves_from IS NULL
           ), down AS (
             SELECT id, evolves_from FROM item_cards WHERE id IN (SELECT id FROM roots)
             UNION
             SELECT c.id, c.evolves_from FROM item_cards c JOIN down ON c.evolves_from = down.id
           )
         SELECT ic.id, ic.evolves_from, ${CARD_COLS.map(c => 'ic.' + c).join(', ')}
           FROM item_cards ic
          WHERE ic.id IN (SELECT id FROM down)
          ORDER BY ic.evolves_from NULLS FIRST, ic.id ASC`,
        [inUse],
      );
      chainRes.rows.forEach((row, i) => cardIndexById.set(row.id, i));
      cardsOut = chainRes.rows.map(({ id: _id, evolves_from: parent, ...card }) => {
        const ref = parent == null ? undefined : cardIndexById.get(parent);
        return ref === undefined ? card : { ...card, evolves_from_ref: ref };
      });
    }

    /** Inventory rows for one player, with the card named by position. */
    const inventoryFor = (playerId) => invRes.rows
      .filter(r => r.player_id === playerId)
      .map(r => ({
        name: r.name, quantity: r.quantity, category: r.category,
        weight: r.weight, equipped: r.equipped, attuned: r.attuned,
        requires_attunement: r.requires_attunement, notes: r.notes,
        card_ref: r.item_card_id == null ? null : (cardIndexById.get(r.item_card_id) ?? null),
      }));

    // per-player data
    const playersOut = [];
    for (const p of playersRes.rows) {
      const [charRes, statsRes, notesRes, relsRes, diaryRes] = await Promise.all([
        pool.query('SELECT name, picture_url, picture_data, story, traits, flaws, goals, public_info, private_info FROM pc_characters WHERE player_id=$1', [p.id]),
        pool.query('SELECT stats_json FROM pc_char_stats WHERE player_id=$1', [p.id]),
        pool.query('SELECT content, dm_visible FROM pc_dm_notes WHERE character_id=(SELECT id FROM pc_characters WHERE player_id=$1) ORDER BY created_at ASC', [p.id]),
        pool.query('SELECT id, name, relation_type, link, is_family, is_dm_only, parent_id FROM pc_relationships WHERE character_id=(SELECT id FROM pc_characters WHERE player_id=$1) ORDER BY created_at ASC', [p.id]),
        // The player's private diary. Carried because the bundle is already a
        // DM-only artifact holding private_info and DM notes, and losing a
        // player's session write-ups on a restore is the worst data loss here.
        pool.query('SELECT title, body, session_no, session_date, category FROM player_diary_entries WHERE player_id=$1 ORDER BY session_no ASC NULLS LAST, created_at ASC', [p.id]),
      ]);

      const relRefById = {};
      const relNameCount = {};
      for (const r of relsRes.rows) relNameCount[r.name] = (relNameCount[r.name] || 0) + 1;
      const relNameSeen = {};
      for (const r of relsRes.rows) {
        relNameSeen[r.name] = (relNameSeen[r.name] || 0) + 1;
        relRefById[r.id] = relNameCount[r.name] > 1 ? `${r.name}__${relNameSeen[r.name]}` : r.name;
      }

      const tlRes = await pool.query(
        `SELECT pt.id, pt.name FROM player_timelines pt WHERE pt.campaign_id=$1 AND pt.player_id=$2 ORDER BY pt.created_at ASC`,
        [id, p.id]
      );
      const timelinesOut = [];
      for (const tl of tlRes.rows) {
        const entries = timelineEntriesRes.rows.filter(e => e.timeline_id == tl.id);
        timelinesOut.push({
          name: tl.name,
          entries: entries.map(e => {
            const rawPlayerIds = Array.isArray(e.player_ids) ? e.player_ids : [];
            const playerIdRefs = rawPlayerIds.map(tok => {
              const parts = tok.split('_');
              const prefix = parts[0];
              const val = parts.slice(1).join('_');
              if (prefix === 'self') return `self_${playerRefById[parseInt(val)] || val}`;
              if (prefix === 'cp') return `cp_${playerRefById[parseInt(val)] || val}`;
              if (prefix === 'rel') return `rel_${p.player_name}:${relRefById[parseInt(val)] || val}`;
              if (prefix === 'npc') return `npc_${npcNameById[parseInt(val)] || val}`;
              return tok;
            });
            return {
              title: e.title,
              description: e.description || null,
              location: e.location || null,
              year: e.year,
              day_of_year: e.day_of_year,
              duration_days: e.duration_days,
              player_id_refs: playerIdRefs,
            };
          }),
        });
      }

      playersOut.push({
        player_name: p.player_name,
        inventory: inventoryFor(p.id),
        username: p.username || null,
        character: charRes.rows[0] ? {
          name: charRes.rows[0].name,
          picture_url: charRes.rows[0].picture_url || null,
          picture_data: charRes.rows[0].picture_data || null,
          story: charRes.rows[0].story || null,
          traits: charRes.rows[0].traits || null,
          flaws: charRes.rows[0].flaws || null,
          goals: charRes.rows[0].goals || null,
          public_info: charRes.rows[0].public_info || null,
          private_info: charRes.rows[0].private_info || null,
        } : null,
        stats_json: statsRes.rows[0]?.stats_json || null,
        dm_notes: notesRes.rows.map(n => ({ content: n.content, dm_visible: n.dm_visible })),
        relationships: relsRes.rows.map(r => ({
          _ref: relRefById[r.id],
          name: r.name,
          relation_type: r.relation_type || null,
          link: r.link || null,
          is_family: r.is_family,
          is_dm_only: r.is_dm_only,
          parent_ref: r.parent_id ? (relRefById[r.parent_id] || null) : null,
        })),
        timelines: timelinesOut,
        diary: diaryRes.rows.map(e => ({
          title: e.title, body: e.body || null,
          session_no: e.session_no, session_date: e.session_date,
          category: e.category || null,
        })),
      });
      p._relRefById = relRefById;
    }

    // cross-connections
    const crossRes = await pool.query('SELECT * FROM character_relationships WHERE campaign_id=$1 ORDER BY created_at ASC', [id]);
    const globalRelRef = {};
    for (const p of playersRes.rows) {
      for (const [rid, ref] of Object.entries(p._relRefById || {})) {
        globalRelRef[rid] = `${p.player_name}:${ref}`;
      }
    }
    const crossOut = crossRes.rows.map(cr => {
      function encodeRef(type, entId) {
        if (type === 'player') return { type, ref: playerRefById[entId] || String(entId) };
        if (type === 'relationship') return { type, ref: globalRelRef[entId] || String(entId) };
        if (type === 'npc') return { type, ref: npcsRes.rows.find(n => n.id == entId)?.name || String(entId) };
        return { type, ref: String(entId) };
      }
      const from = encodeRef(cr.from_entity_type, cr.from_entity_id);
      const to = encodeRef(cr.to_entity_type, cr.to_entity_id);
      return {
        from_type: from.type, from_ref: from.ref, to_type: to.type, to_ref: to.ref,
        label: cr.label, notes: cr.notes || null, is_public: cr.is_public
      };
    });

    // journey maps
    const mapsOut = [];
    for (const m of journeyMapsRes.rows) {
      const [jLocsRes, jDistRes, jPathsRes] = await Promise.all([
        pool.query(
          `SELECT jml.id, jml.name, jml.x, jml.y, jml.polygon, jml.icon_scale, jml.campaign_location_id, jml.linked_map_id,
                  lm.name as linked_map_name
           FROM journey_map_locations jml
           LEFT JOIN journey_maps lm ON lm.id = jml.linked_map_id
           WHERE jml.map_id=$1 ORDER BY jml.created_at ASC`, [m.id]),
        pool.query(
          `SELECT jd.distance_miles, fl.name as from_loc_name, tl.name as to_loc_name
           FROM journey_distances jd
           JOIN journey_map_locations fl ON fl.id = jd.from_loc_id
           JOIN journey_map_locations tl ON tl.id = jd.to_loc_id
           WHERE jd.map_id=$1`, [m.id]),
        // journey_trackers retired — no longer exported.
        pool.query(
          `SELECT jp.name, jp.notes, jp.distance_miles, jp.waypoints, jp.kind, jp.route_type, jp.label_x, jp.label_y
           FROM journey_paths jp
           WHERE jp.map_id=$1 ORDER BY jp.created_at ASC`, [m.id]),
      ]);

      const jLocRefById = {};
      const jLocNameCount = {};
      for (const l of jLocsRes.rows) jLocNameCount[l.name] = (jLocNameCount[l.name] || 0) + 1;
      const jLocNameSeen = {};
      for (const l of jLocsRes.rows) {
        jLocNameSeen[l.name] = (jLocNameSeen[l.name] || 0) + 1;
        jLocRefById[l.id] = jLocNameCount[l.name] > 1 ? `${l.name}__${jLocNameSeen[l.name]}` : l.name;
      }

      mapsOut.push({
        name: m.name,
        description: m.description || null,
        map_image: m.map_image || null,
        scope_type: m.scope_type || 'continent',
        scope_location_ref: m.scope_location_id ? (locRefById[m.scope_location_id] || null) : null,
        locations: jLocsRes.rows.map(l => ({
          _ref: jLocRefById[l.id],
          name: l.name, x: l.x, y: l.y,
          polygon: l.polygon || null,
          icon_scale: l.icon_scale ?? 1,
          campaign_location_ref: l.campaign_location_id ? (locRefById[l.campaign_location_id] || null) : null,
          linked_map_ref: l.linked_map_name || null,
        })),
        distances: jDistRes.rows.map(d => ({ from_ref: d.from_loc_name, to_ref: d.to_loc_name, distance_miles: d.distance_miles })),
        paths: jPathsRes.rows.map(p => {
          const waypoints = Array.isArray(p.waypoints) ? p.waypoints : JSON.parse(p.waypoints || '[]');
          return {
            name: p.name || null, notes: p.notes || null, distance_miles: p.distance_miles || null,
            kind: p.kind || 'path', route_type: p.route_type || 'road',
            label_x: p.label_x ?? null, label_y: p.label_y ?? null,
            waypoints: waypoints.map(w => ({
              x: w.x, y: w.y,
              loc_ref: w.locId ? (jLocRefById[w.locId] || null) : null,
              ...(w.segMiles != null ? { segMiles: w.segMiles } : {}),
              ...(w.curve ? { curve: w.curve } : {}),
              ...(w.eventIds ? { eventIds: w.eventIds } : {}),
              ...(w.eventTitles ? { eventTitles: w.eventTitles } : {}),
            })),
          };
        }),
      });
    }

    const locsOut = locsRes.rows.map(l => ({
      _ref: locRefById[l.id],
      name: l.name, description: l.description || null,
      is_public: l.is_public, size_type: l.size_type || null,
      image_data: l.image_data || null,
      parent_ref: l.parent_id ? (locRefById[l.parent_id] || null) : null,
    }));

    // DM timelines (world timeline + private DM timeline)
    const dmTimelinesOut = [];
    const dmPlayerId = dmPlayerRes.rows[0]?.id;
    if (dmPlayerId) {
      // Build global rel ref map across all players (populated during the per-player loop above)
      const globalRelRef = {};
      for (const p of playersRes.rows) {
        for (const [rid, ref] of Object.entries(p._relRefById || {})) {
          globalRelRef[rid] = `${p.player_name}:${ref}`;
        }
      }

      const dmTlRes = await pool.query(
        `SELECT id, name FROM player_timelines WHERE campaign_id=$1 AND player_id=$2 ORDER BY created_at ASC`,
        [id, dmPlayerId]
      );
      for (const tl of dmTlRes.rows) {
        const entries = timelineEntriesRes.rows.filter(e => e.timeline_id == tl.id);
        dmTimelinesOut.push({
          name: tl.name,
          entries: entries.map(e => {
            const playerIdRefs = (Array.isArray(e.player_ids) ? e.player_ids : []).map(tok => {
              const parts = tok.split('_');
              const prefix = parts[0];
              const val = parts.slice(1).join('_');
              if (prefix === 'self') return 'dm_self'; // DM's own row — restored to dm player on import
              if (prefix === 'cp') return `cp_${playerRefById[val] || val}`;
              if (prefix === 'rel') return `rel_${globalRelRef[val] || val}`;
              if (prefix === 'npc') return `npc_${npcNameById[val] || val}`;
              return tok;
            });
            return {
              title: e.title,
              description: e.description || null,
              location: e.location || null,
              year: e.year,
              day_of_year: e.day_of_year,
              duration_days: e.duration_days,
              player_id_refs: playerIdRefs,
            };
          }),
        });
      }
    }

    // Party timeline events — campaign-scoped, no owning player/timeline (excluded from
    // the per-player/DM timeline queries above), so export them separately.
    const partyRes = await pool.query(
      `SELECT title, description, location, year, day_of_year, duration_days
       FROM player_timeline_entries WHERE campaign_id=$1 AND is_party=true
       ORDER BY year ASC, day_of_year ASC`, [id]
    );
    const partyEventsOut = partyRes.rows.map(e => ({
      title: e.title, description: e.description || null, location: e.location || null,
      year: e.year, day_of_year: e.day_of_year, duration_days: e.duration_days,
    }));

    // Campaign diary. Statuses travel too, so a restored campaign keeps the
    // draft/published split. The share TOKEN deliberately does not — the import
    // creates a new campaign, so a carried token would either collide on the
    // UNIQUE constraint or resolve an old pasted URL to different content.
    const diaryRes = await pool.query(
      `SELECT title, body, session_no, session_date, status, published_at, chapter
         FROM campaign_diary_entries WHERE campaign_id=$1
        ORDER BY session_no ASC NULLS LAST, created_at ASC`, [id],
    );

    res.json({
      // 5 adds `item_cards` and per-player `inventory`. A version-4 bundle
      // still imports; it simply has no gear in it.
      version: 5,
      exported_at: new Date().toISOString(),
      type: 'campaign',
      item_cards: cardsOut,
      campaign: {
        name: campaign.name, description: campaign.description || '',
        calendar_type: metaRes.rows[0]?.calendar_type || 'harptos',
        today_marker: metaRes.rows[0]?.today_marker || null,
      },
      npcs: npcsRes.rows.map(n => ({ name: n.name })),
      locations: locsOut,
      players: playersOut,
      cross_connections: crossOut,
      journey_maps: mapsOut,
      dm_timelines: dmTimelinesOut,
      party_events: partyEventsOut,
      campaign_diary: diaryRes.rows,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Import a full campaign snapshot — creates everything fresh, resolves all refs to new DB IDs
app.post('/api/campaigns/import', requireRole(['dm']), async (req, res) => {
  const bundle = req.body;
  if (bundle.type !== 'campaign') return res.status(400).json({ error: 'Not a campaign export file' });
  const { campaign, players = [], locations = [], npcs = [], cross_connections = [], journey_maps = [], dm_timelines = [], party_events = [], campaign_diary = [] } = bundle;
  if (!campaign?.name) return res.status(400).json({ error: 'Missing campaign name' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Campaign + meta
    const campRes = await client.query(
      'INSERT INTO campaigns (name, description, dm_user_id) VALUES ($1,$2,$3) RETURNING id',
      [campaign.name, campaign.description || '', req.session.userId]
    );
    const newId = campRes.rows[0].id;
    await client.query(
      'INSERT INTO campaign_meta (campaign_id, calendar_type, today_marker) VALUES ($1,$2,$3)',
      [newId, campaign.calendar_type || 'harptos', campaign.today_marker || null]
    );

    // 2. NPCs — accept both string and object forms; any legacy `path_public` is ignored.
    const npcIdByName = {};
    for (const n of npcs) {
      const name = typeof n === 'string' ? n : n?.name;
      if (!name) continue;
      const r = await client.query(
        'INSERT INTO campaign_npcs (campaign_id, name) VALUES ($1,$2) ON CONFLICT (campaign_id,name) DO UPDATE SET name=EXCLUDED.name RETURNING id',
        [newId, name]
      );
      npcIdByName[name] = r.rows[0].id;
    }

    // 3. Locations — two passes to handle parent_ref
    const locIdByRef = {};
    for (const l of locations) {
      const r = await client.query(
        `INSERT INTO campaign_locations (campaign_id, name, description, is_public, size_type, image_data)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (campaign_id, LOWER(name)) DO UPDATE SET name=EXCLUDED.name, image_data=EXCLUDED.image_data
         RETURNING id`,
        [newId, l.name, l.description || null, l.is_public !== false, l.size_type || null, l.image_data || null]
      );
      locIdByRef[l._ref || l.name] = r.rows[0].id;
    }
    for (const l of locations) {
      if (l.parent_ref && locIdByRef[l.parent_ref] && locIdByRef[l._ref || l.name]) {
        await client.query('UPDATE campaign_locations SET parent_id=$1 WHERE id=$2',
          [locIdByRef[l.parent_ref], locIdByRef[l._ref || l.name]]);
      }
    }

    // 4. Users lookup
    const allUsersRes = await client.query('SELECT id, username FROM users');
    const userByName = {};
    for (const u of allUsersRes.rows) userByName[u.username.toLowerCase()] = u.id;

    // 5. Players — two passes so that timeline entries referencing OTHER players
    //    via cp_<name> always resolve correctly regardless of player order.
    //
    //    Pass A: create all campaign_players rows, pc_characters, stats, dm_notes,
    //            and relationships — building the full lookup maps.
    //    Pass B: insert timeline entries using the now-complete maps.

    const playerIdByRef = {};
    const relIdByRef = {};   // "playerName:relRef" → new rel_id

    // Gear. Cards are matched into THIS DM's library by name+type+rarity, whole
    // chains at a time, before any inventory row can point at one. A v4 bundle
    // has no `item_cards` and simply resolves to nothing.
    const cardResolve = await resolveImportedCards(client, bundle.item_cards, req.session.userId);
    const cardIds = cardResolve.ids;
    let gearAdded = 0;
    const gearSkipped = [];

    // ── Pass A ──────────────────────────────────────────────────────────────
    // Stash each player's new DB id and timelines so Pass B can iterate them.
    const playerPassB = []; // [{ playerId, timelines }]

    for (const p of players) {
      const playerRes = await client.query(
        'INSERT INTO campaign_players (campaign_id, player_name) VALUES ($1,$2) RETURNING id',
        [newId, p.player_name]
      );
      const playerId = playerRes.rows[0].id;
      playerIdByRef[p.player_name] = playerId;

      if (p.username) {
        const uid = userByName[p.username.toLowerCase()];
        if (uid) await client.query('INSERT INTO campaign_user_assignments (player_id, user_id) VALUES ($1,$2)', [playerId, uid]);
      }

      // The player's private diary. `created_by` is the importing DM because the
      // original author's user row may not exist in this instance; the diary is
      // still scoped to the player, which is what governs who can read it.
      for (const e of (p.diary || [])) {
        await client.query(
          `INSERT INTO player_diary_entries (campaign_id, player_id, created_by, title, body, session_no, session_date, category)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [newId, playerId, req.session.userId, e.title, e.body || null, e.session_no ?? null,
            e.session_date || null, e.category ? String(e.category).slice(0, 120) : null],
        );
      }

      let charId = null;
      if (p.character) {
        const c = p.character;
        const cRes = await client.query(
          `INSERT INTO pc_characters (player_id, name, picture_url, picture_data, story, traits, flaws, goals, public_info, private_info)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
          [playerId, c.name || null, c.picture_url || null, c.picture_data || null,
            c.story || null, c.traits || null, c.flaws || null, c.goals || null,
            c.public_info || null, c.private_info || null]
        );
        charId = cRes.rows[0].id;
      }

      if (p.stats_json) {
        await client.query(
          'INSERT INTO pc_char_stats (player_id, stats_json) VALUES ($1,$2) ON CONFLICT (player_id) DO UPDATE SET stats_json=$2',
          [playerId, JSON.stringify(validateStats(p.stats_json))]
        );
      }

      if (charId) {
        for (const n of (p.dm_notes || [])) {
          await client.query('INSERT INTO pc_dm_notes (character_id, content, dm_visible) VALUES ($1,$2,$3)',
            [charId, n.content, n.dm_visible || false]);
        }
      }

      // Gear. A card-linked row needs its card to have resolved; a free-text
      // row carries everything it needs on itself.
      for (const it of (p.inventory || [])) {
        const ref = it?.card_ref;
        const cardId = Number.isInteger(ref) ? (cardIds[ref] ?? null) : null;
        if (Number.isInteger(ref) && cardId == null) continue;   // unresolvable
        if (cardId == null && !String(it?.name ?? '').trim()) continue;
        // SAVEPOINT, and it is load-bearing. Postgres aborts the WHOLE
        // transaction on any failed statement — every later command then errors
        // and COMMIT silently becomes a rollback. Catching the duplicate
        // without one threw the entire import away while still reporting
        // success, which is how this was found: the response said
        // `campaign_id: 4` and no campaign 4 existed.
        await client.query('SAVEPOINT inv_row');
        try {
          await client.query(
            `INSERT INTO inventory_items
               (campaign_id, player_id, item_card_id, name, quantity, category, weight,
                equipped, attuned, requires_attunement, notes)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
            [newId, playerId, cardId,
              cardId ? null : String(it.name).slice(0, 255),
              cardId ? 1 : Math.max(1, parseInt(it.quantity, 10) || 1),
              INV_CATEGORIES.includes(it.category) ? it.category : 'inventory',
              invWeight(it.weight),
              !!it.equipped, !!it.attuned, !!it.requires_attunement,
              it.notes ? String(it.notes) : null],
          );
          await client.query('RELEASE SAVEPOINT inv_row');
          gearAdded += 1;
        } catch (e) {
          await client.query('ROLLBACK TO SAVEPOINT inv_row');
          // The partial unique index: this campaign already holds that card,
          // which happens when two exported rows resolve to the same library
          // card. Skip the duplicate and say so rather than losing the import.
          if (e.code === '23505') {
            gearSkipped.push(`${p.player_name}: ${it.name || 'a granted item'}`);
          } else { throw e; }
        }
      }

      // Relationships — two passes for parent_ref
      const localRelIdByRef = {};
      if (charId) {
        for (const r of (p.relationships || [])) {
          const rRes = await client.query(
            'INSERT INTO pc_relationships (character_id, name, relation_type, link, is_family, is_dm_only) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
            [charId, r.name, r.relation_type || null, r.link || null, r.is_family || false, r.is_dm_only || false]
          );
          localRelIdByRef[r._ref || r.name] = rRes.rows[0].id;
          relIdByRef[`${p.player_name}:${r._ref || r.name}`] = rRes.rows[0].id;
        }
        for (const r of (p.relationships || [])) {
          if (r.parent_ref && localRelIdByRef[r.parent_ref] && localRelIdByRef[r._ref || r.name]) {
            await client.query('UPDATE pc_relationships SET parent_id=$1 WHERE id=$2',
              [localRelIdByRef[r.parent_ref], localRelIdByRef[r._ref || r.name]]);
          }
        }
      }

      playerPassB.push({ playerId, timelines: p.timelines || [] });
    }

    // ── Pass B ──────────────────────────────────────────────────────────────
    // Now playerIdByRef and relIdByRef contain ALL players and relationships,
    // so cp_<name> and rel_<name> tokens resolve correctly for every entry.
    const resolveToken = (tok) => {
      const parts = tok.split('_');
      const prefix = parts[0];
      const val = parts.slice(1).join('_');
      if (prefix === 'self') {
        const pid = playerIdByRef[val];
        return pid ? `self_${pid}` : tok;
      }
      if (prefix === 'cp') {
        const pid = playerIdByRef[val];
        return pid ? `cp_${pid}` : tok;
      }
      if (prefix === 'rel') {
        const rid = relIdByRef[val];
        return rid ? `rel_${rid}` : tok;
      }
      if (prefix === 'npc') {
        const nid = npcIdByName[val];
        return nid ? `npc_${nid}` : tok;
      }
      return tok;
    };

    for (const { playerId, timelines } of playerPassB) {
      for (const tl of timelines) {
        const tlRes = await client.query(
          'INSERT INTO player_timelines (campaign_id, player_id, created_by, name) VALUES ($1,$2,$3,$4) RETURNING id',
          [newId, playerId, req.session.userId, tl.name || 'Timeline']
        );
        const tlId = tlRes.rows[0].id;
        for (const e of (tl.entries || [])) {
          const playerIds = (e.player_id_refs || []).map(resolveToken);
          await client.query(
            `INSERT INTO player_timeline_entries
               (campaign_id, player_id, timeline_id, created_by, title, description, location, year, day_of_year, duration_days, player_ids)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
            [newId, playerId, tlId, req.session.userId,
              e.title, e.description || null, e.location || null,
              e.year || 1492, e.day_of_year || 1, e.duration_days || 1, playerIds]
          );
        }
      }
    }

    // 6. DM timelines (world timeline + private DM timeline)
    if (dm_timelines.length) {
      // Find or create the DM player row for the importing user
      const dmUser = await client.query('SELECT username FROM users WHERE id=$1', [req.session.userId]);
      const dmName = `DM (${dmUser.rows[0]?.username || 'DM'})`;
      const dmPlayerRes = await client.query(
        'INSERT INTO campaign_players (campaign_id, player_name, is_dm_player) VALUES ($1,$2,true) RETURNING id',
        [newId, dmName]
      );
      const dmPlayerId = dmPlayerRes.rows[0].id;
      await client.query('INSERT INTO campaign_user_assignments (player_id, user_id) VALUES ($1,$2)', [dmPlayerId, req.session.userId]);

      for (const tl of dm_timelines) {
        const tlRes = await client.query(
          'INSERT INTO player_timelines (campaign_id, player_id, created_by, name) VALUES ($1,$2,$3,$4) RETURNING id',
          [newId, dmPlayerId, req.session.userId, tl.name || 'DM Timeline']
        );
        const tlId = tlRes.rows[0].id;
        for (const e of (tl.entries || [])) {
          // dm_self is a legacy token for the DM's own player row; all other tokens
          // are resolved via the shared resolveToken helper (full maps now available).
          const playerIds = (e.player_id_refs || []).map(tok => {
            if (tok === 'dm_self') return `self_${dmPlayerId}`;
            return resolveToken(tok);
          });
          await client.query(
            `INSERT INTO player_timeline_entries
               (campaign_id, player_id, timeline_id, created_by, title, description, location, year, day_of_year, duration_days, player_ids)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
            [newId, dmPlayerId, tlId, req.session.userId,
              e.title, e.description || null, e.location || null,
              e.year || 1492, e.day_of_year || 1, e.duration_days || 1, playerIds]
          );
        }
      }
    }

    // 7. Cross-connections
    for (const cc of cross_connections) {
      function resolveRef(type, ref) {
        if (type === 'player') return playerIdByRef[ref] || null;
        if (type === 'relationship') return relIdByRef[ref] || null;
        if (type === 'npc') return npcIdByName[ref] || null;
        return null;
      }
      const fromId = resolveRef(cc.from_type, cc.from_ref);
      const toId = resolveRef(cc.to_type, cc.to_ref);
      if (!fromId || !toId) continue;
      await client.query(
        `INSERT INTO character_relationships
           (campaign_id, from_entity_type, from_entity_id, to_entity_type, to_entity_id, label, notes, is_public)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [newId, cc.from_type, fromId, cc.to_type, toId, cc.label || '', cc.notes || null, cc.is_public || false]
      );
    }

    // 8. Journey maps — two passes (create all first so linked_map_ref resolves)
    const mapIdByName = {};
    for (const m of journey_maps) {
      const mRes = await client.query(
        'INSERT INTO journey_maps (campaign_id, name, description, map_image, scope_type, scope_location_id, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
        [newId, m.name, m.description || null, m.map_image || null,
          m.scope_type || 'continent',
          m.scope_location_ref ? (locIdByRef[m.scope_location_ref] || null) : null,
          req.session.userId]
      );
      mapIdByName[m.name] = mRes.rows[0].id;
    }
    for (const m of journey_maps) {
      const mapId = mapIdByName[m.name];
      const jLocIdByRef = {};
      for (const l of (m.locations || [])) {
        const lRes = await client.query(
          'INSERT INTO journey_map_locations (map_id, campaign_location_id, name, x, y, polygon, icon_scale) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
          [mapId, l.campaign_location_ref ? (locIdByRef[l.campaign_location_ref] || null) : null,
            l.name, l.x ?? 50, l.y ?? 50, l.polygon ? JSON.stringify(l.polygon) : null, l.icon_scale ?? 1]
        );
        jLocIdByRef[l._ref || l.name] = lRes.rows[0].id;
      }
      for (const l of (m.locations || [])) {
        if (l.linked_map_ref && mapIdByName[l.linked_map_ref]) {
          await client.query('UPDATE journey_map_locations SET linked_map_id=$1 WHERE id=$2',
            [mapIdByName[l.linked_map_ref], jLocIdByRef[l._ref || l.name]]);
        }
      }
      for (const d of (m.distances || [])) {
        const fl = jLocIdByRef[d.from_ref], tl = jLocIdByRef[d.to_ref];
        if (fl && tl) await client.query(
          'INSERT INTO journey_distances (map_id, from_loc_id, to_loc_id, distance_miles) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',
          [mapId, fl, tl, d.distance_miles]
        );
      }
      // journey_trackers retired — any `m.trackers`/`p.tracker_ref` in older bundles is ignored.
      const ROUTE_TYPES_IMP = ['road', 'flight', 'maritime'];
      for (const p of (m.paths || [])) {
        const waypoints = (p.waypoints || []).map(w => ({
          x: w.x, y: w.y,
          locId: w.loc_ref ? (jLocIdByRef[w.loc_ref] || null) : null,
          ...(w.segMiles != null ? { segMiles: w.segMiles } : {}),
          ...(w.curve ? { curve: w.curve } : {}),
          ...(w.eventIds ? { eventIds: w.eventIds } : {}),
          ...(w.eventTitles ? { eventTitles: w.eventTitles } : {}),
        }));
        const kind = p.kind === 'route' ? 'route' : 'path';
        const routeType = ROUTE_TYPES_IMP.includes(p.route_type) ? p.route_type : 'road';
        await client.query(
          'INSERT INTO journey_paths (map_id, name, notes, distance_miles, waypoints, kind, route_type, label_x, label_y, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
          [mapId, p.name || null, p.notes || null, p.distance_miles || null, JSON.stringify(waypoints),
            kind, routeType, p.label_x ?? null, p.label_y ?? null, req.session.userId]
        );
      }
    }

    // 9. Party timeline events (campaign-wide; no owning player/timeline)
    for (const e of party_events) {
      await client.query(
        `INSERT INTO player_timeline_entries
           (campaign_id, player_id, timeline_id, created_by, title, description, location, year, day_of_year, duration_days, is_party)
         VALUES ($1,NULL,NULL,$2,$3,$4,$5,$6,$7,$8,true)`,
        [newId, req.session.userId, e.title, e.description || null, e.location || null,
          e.year || 1492, e.day_of_year || 1, e.duration_days || 1]
      );
    }

    // 10. Campaign diary. Statuses are preserved, so a restored campaign keeps
    //     its draft/published split. No share token is created — the new
    //     campaign starts with no live public link, as every other share does.
    for (const e of campaign_diary) {
      await client.query(
        `INSERT INTO campaign_diary_entries
           (campaign_id, created_by, title, body, session_no, session_date, status, published_at, chapter)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [newId, req.session.userId, e.title, e.body || null, e.session_no ?? null,
          e.session_date || null, e.status === 'published' ? 'published' : 'draft',
          e.published_at || null, e.chapter ? String(e.chapter).slice(0, 120) : null],
      );
    }

    await client.query('COMMIT');
    // Say what happened to the gear: how many rows landed, how many cards were
    // brought into the library versus matched to ones already there, and
    // anything skipped. Silence here would hide both the duplicates-in-library
    // case and the per-campaign collision.
    res.json({
      success: true,
      campaign_id: newId,
      gear: {
        items: gearAdded,
        cards_added: cardResolve.added,
        cards_matched: cardResolve.reused,
        skipped: gearSkipped,
      },
    });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
});

// ============================================
// EXPORT / IMPORT — PC SHEET
// ============================================

// Export a PC sheet (character, relationships, stats, and — for a DM — dm-notes).
//
// The bundle declares its own completeness via `scope`:
//
//   scope: 'full'    exported by a DM/admin. Carries private_info and every DM
//                    note, so an import can safely replace both.
//   scope: 'player'  exported by the player. DM-only material is OMITTED
//                    ENTIRELY rather than blanked — the keys are absent, not
//                    empty — so an import can tell "withheld" from "cleared"
//                    and leave the stored values alone.
//
// That distinction is the whole fix for the old round-trip data loss: blanked
// fields were indistinguishable from intentionally-emptied ones.
app.get('/api/pc/:playerId/export', requireRole(['dm', 'player']), async (req, res) => {
  const { playerId } = req.params;
  const isPrivileged = ['dm', 'admin'].includes(req.session.role);
  try {
    if (!await canAccessPC(req.session.userId, req.session.role, playerId))
      return res.status(403).json({ error: 'Access denied' });

    const [charRes, relRes, statsRes, notesRes, playerRes] = await Promise.all([
      pool.query('SELECT * FROM pc_characters WHERE player_id=$1', [playerId]),
      // Every column the importer needs to rebuild the graph. The old export
      // selected only 4, so hierarchy, DM-only flags and status labels were
      // silently dropped on every round-trip.
      //
      // DM-only relationships are withheld from a player's export, matching the
      // normal read path (GET /api/pc/:playerId/relationships), which has always
      // filtered them. Without this, Export handed a player the name, type, link
      // and status of relationships the UI deliberately hides from them.
      // A child whose parent is filtered out resolves to `parent_ref: null`
      // below and re-parents to root — correct for a bundle whose recipient
      // cannot see that parent.
      pool.query(
        `SELECT id, name, relation_type, link, is_family, is_dm_only,
                created_by_role, parent_id, status_label
         FROM pc_relationships
         WHERE character_id = (SELECT id FROM pc_characters WHERE player_id=$1)
           ${isPrivileged ? '' : 'AND is_dm_only = false'}
         ORDER BY created_at ASC`, [playerId]
      ),
      pool.query('SELECT stats_json FROM pc_char_stats WHERE player_id=$1', [playerId]),
      // A player's own export carries the notes the DM shared with them — the
      // same set the sheet already shows them — so their copy is complete.
      // Hidden notes stay out. Import still ignores notes from a player-scope
      // bundle entirely (see `hasDmNotes` there): the bundle holds only the
      // visible subset, so replacing from it would delete the hidden ones.
      pool.query(
        `SELECT content, dm_visible FROM pc_dm_notes
         WHERE character_id = (SELECT id FROM pc_characters WHERE player_id=$1)
           ${isPrivileged ? '' : 'AND dm_visible = true'}
         ORDER BY created_at ASC`, [playerId],
      ),
      pool.query('SELECT player_name FROM campaign_players WHERE id=$1', [playerId]),
    ]);

    const char = charRes.rows[0] || {};

    // Relationships are referenced by name (ids are meaningless in another
    // database), disambiguated when a character has two relations of the same
    // name — the same scheme the campaign export uses.
    const nameCount = {};
    for (const r of relRes.rows) nameCount[r.name] = (nameCount[r.name] || 0) + 1;
    const seen = {};
    const refById = {};
    for (const r of relRes.rows) {
      seen[r.name] = (seen[r.name] || 0) + 1;
      refById[r.id] = nameCount[r.name] > 1 ? `${r.name}__${seen[r.name]}` : r.name;
    }

    const bundle = {
      version: 2,
      exported_at: new Date().toISOString(),
      type: 'pc-sheet',
      scope: isPrivileged ? 'full' : 'player',
      player_name: playerRes.rows[0]?.player_name || '',
      character: {
        name: char.name || '',
        picture_url: char.picture_url || '',
        story: char.story || '',
        traits: char.traits || '',
        flaws: char.flaws || '',
        goals: char.goals || '',
        public_info: char.public_info || '',
      },
      relationships: relRes.rows.map((r) => ({
        _ref: refById[r.id],
        name: r.name,
        relation_type: r.relation_type || null,
        link: r.link || null,
        is_family: r.is_family,
        is_dm_only: r.is_dm_only,
        created_by_role: r.created_by_role || null,
        status_label: r.status_label || null,
        parent_ref: r.parent_id ? (refById[r.parent_id] || null) : null,
      })),
      stats: statsRes.rows[0]?.stats_json || {},
    };

    // Both are present on either export, so a player's own copy is complete:
    // private_info is the player's own section, and dm_notes holds whatever the
    // DM shared (the query above filters the hidden ones out for a player).
    //
    // This does NOT make a player bundle authoritative on import — `scope` still
    // governs that, and the importer gates both fields on `scope === 'full'`.
    // A player-scope bundle carries only what a player may see, so writing from
    // it would silently drop the DM's private_info and hidden notes.
    bundle.character.private_info = char.private_info || '';
    bundle.dm_notes = notesRes.rows;

    res.json(bundle);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Import a PC sheet onto an existing player slot.
//
// DM-only, by design: the single import hub lives in Manage Campaigns, and a
// player must not be able to overwrite a sheet — least of all with a bundle
// their own export deliberately stripped DM material out of.
//
// Merge rules follow the bundle's `scope` (see the export above). A key that is
// ABSENT is "withheld", and the stored value survives; a key that is PRESENT is
// authoritative, even when empty. Bundles from before `scope` existed (version 1)
// are treated as player-scope, which is the non-destructive reading.
app.post('/api/pc/:playerId/import', requireRole(['dm']), async (req, res) => {
  const { playerId } = req.params;
  const bundle = req.body;
  if (bundle.type !== 'pc-sheet') return res.status(400).json({ error: 'Not a pc-sheet export file' });

  try {
    if (!await canAccessPC(req.session.userId, req.session.role, playerId))
      return res.status(403).json({ error: 'Access denied' });

    const { character = {}, relationships = [], stats = {} } = bundle;
    const isFull = bundle.scope === 'full';
    const hasPrivateInfo = isFull && Object.prototype.hasOwnProperty.call(character, 'private_info');
    const hasDmNotes = isFull && Array.isArray(bundle.dm_notes);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const existing = await client.query('SELECT id FROM pc_characters WHERE player_id=$1', [playerId]);
      let charId;
      if (existing.rows.length) {
        charId = existing.rows[0].id;
        // private_info is updated only when the bundle actually carries it.
        // COALESCE would not do: '' is a legitimate value a DM may have chosen.
        await client.query(
          `UPDATE pc_characters SET name=$1, picture_url=$2, story=$3, traits=$4,
           flaws=$5, goals=$6, public_info=$7,
           private_info = CASE WHEN $8::bool THEN $9 ELSE private_info END,
           updated_at=CURRENT_TIMESTAMP
           WHERE id=$10`,
          [character.name || '', character.picture_url || '', character.story || '',
            character.traits || '', character.flaws || '', character.goals || '',
            character.public_info || '',
            hasPrivateInfo, character.private_info ?? '', charId],
        );
      } else {
        const ins = await client.query(
          `INSERT INTO pc_characters (player_id, name, picture_url, story, traits, flaws, goals, public_info, private_info)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
          [playerId, character.name || '', character.picture_url || '', character.story || '',
            character.traits || '', character.flaws || '', character.goals || '',
            character.public_info || '', hasPrivateInfo ? (character.private_info ?? '') : ''],
        );
        charId = ins.rows[0].id;
      }

      // Relationships are replaced with every column the export carries, in two
      // passes so parent_ref can be resolved to a real parent_id. Previously only
      // 4 columns survived, which flattened the family tree and un-hid DM-only
      // relations on every round-trip.
      //
      // How much is replaced depends on scope, the same "absent means withheld"
      // rule already applied to private_info and dm_notes. A player-scope bundle
      // carries no DM-only relationships (the export filters them out), so it
      // must not be authoritative for them either — otherwise a blanket DELETE
      // would destroy every DM-only relation with nothing to restore it.
      if (!isFull) {
        // parent_id is ON DELETE CASCADE, so a surviving DM-only child whose
        // parent is about to be deleted would be cascade-deleted with it. Cut
        // those links first; the orphans re-parent to root, which is the only
        // meaning left once the parent is gone.
        await client.query(
          `UPDATE pc_relationships SET parent_id = NULL
            WHERE character_id = $1 AND is_dm_only = true
              AND parent_id IN (SELECT id FROM pc_relationships
                                 WHERE character_id = $1 AND is_dm_only = false)`,
          [charId],
        );
      }
      await client.query(
        isFull
          ? 'DELETE FROM pc_relationships WHERE character_id=$1'
          : 'DELETE FROM pc_relationships WHERE character_id=$1 AND is_dm_only=false',
        [charId],
      );
      // Not authoritative in either direction: a player-scope bundle must neither
      // delete DM-only relationships nor introduce them. Bundles exported before
      // the export started filtering them still carry them, and would otherwise
      // duplicate the DM's own rows on every import — the same doubling that used
      // to afflict DM notes. Also stops a hand-edited player file smuggling a row
      // into the DM's hidden set.
      const incomingRels = isFull ? relationships : relationships.filter((r) => !r.is_dm_only);

      const relIdByRef = {};
      for (const r of incomingRels) {
        const ref = r._ref || r.name;
        const ins = await client.query(
          `INSERT INTO pc_relationships
             (character_id, name, relation_type, link, is_family, is_dm_only, created_by_role, status_label)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
          [charId, r.name, r.relation_type || null, r.link || null,
            r.is_family || false, r.is_dm_only || false,
            r.created_by_role || 'dm', r.status_label || null],
        );
        relIdByRef[ref] = ins.rows[0].id;
      }
      for (const r of incomingRels) {
        const ref = r._ref || r.name;
        if (r.parent_ref && relIdByRef[r.parent_ref] && relIdByRef[ref]) {
          await client.query('UPDATE pc_relationships SET parent_id=$1 WHERE id=$2',
            [relIdByRef[r.parent_ref], relIdByRef[ref]]);
        }
      }

      if (stats && Object.keys(stats).length) {
        await client.query(
          `INSERT INTO pc_char_stats (player_id, stats_json, updated_at) VALUES ($1,$2,CURRENT_TIMESTAMP)
           ON CONFLICT (player_id) DO UPDATE SET stats_json=$2, updated_at=CURRENT_TIMESTAMP`,
          [playerId, JSON.stringify(validateStats(stats))],
        );
      }

      // DM notes: replace only when the bundle is a full (DM) export, which by
      // construction contains every note. This is what stops the old doubling
      // (2 → 4 → 6 …) without risking the opposite failure — a player-scope
      // bundle carries no notes at all, so it leaves the stored ones untouched
      // rather than deleting them.
      if (hasDmNotes) {
        await client.query('DELETE FROM pc_dm_notes WHERE character_id=$1', [charId]);
        for (const n of bundle.dm_notes) {
          await client.query(
            'INSERT INTO pc_dm_notes (character_id, content, dm_visible) VALUES ($1,$2,$3)',
            [charId, n.content || '', n.dm_visible ?? true],
          );
        }
      }

      await client.query('COMMIT');
      res.json({ success: true, scope: isFull ? 'full' : 'player' });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally { client.release(); }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================
// DATABASE INITIALIZATION
// ============================================

async function initializeDatabase() {
  try {
    console.log('Initializing database...');

    // Users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        role VARCHAR(50) DEFAULT 'player' CHECK (role IN ('admin', 'dm', 'player')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Campaigns table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS campaigns (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        dm_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Migrate: soft-delete timestamp for the campaign trash. NULL = live, which
    // is what every existing row gets, so no backfill is needed and nothing
    // disappears on upgrade. A nullable timestamp as the state follows
    // campaign_diary_entries.published_at rather than inventing a boolean.
    await pool.query(`
      ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
    `);

    // Campaign players
    await pool.query(`
      CREATE TABLE IF NOT EXISTS campaign_players (
        id SERIAL PRIMARY KEY,
        campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        player_name VARCHAR(255) NOT NULL,
        is_dm_player BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Campaign-User assignments (which user plays which player in which campaign)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS campaign_user_assignments (
        id SERIAL PRIMARY KEY,
        player_id INTEGER NOT NULL REFERENCES campaign_players(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Named player timelines — one player can have multiple timelines
    await pool.query(`
      CREATE TABLE IF NOT EXISTS player_timelines (
        id          SERIAL PRIMARY KEY,
        campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        player_id   INTEGER NOT NULL REFERENCES campaign_players(id) ON DELETE CASCADE,
        created_by  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name        VARCHAR(255) NOT NULL DEFAULT 'My Timeline',
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Private timeline entries — per player, per campaign, DB-backed
    await pool.query(`
      CREATE TABLE IF NOT EXISTS player_timeline_entries (
        id SERIAL PRIMARY KEY,
        campaign_id   INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        player_id     INTEGER NOT NULL REFERENCES campaign_players(id) ON DELETE CASCADE,
        timeline_id   INTEGER REFERENCES player_timelines(id) ON DELETE CASCADE,
        created_by    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title         VARCHAR(255) NOT NULL,
        description   TEXT,
        location      VARCHAR(255),
        year          INTEGER NOT NULL DEFAULT 1492,
        day_of_year   INTEGER NOT NULL DEFAULT 1,
        duration_days INTEGER NOT NULL DEFAULT 1,
        manual_links  INTEGER[] DEFAULT '{}',
        player_ids    TEXT[] DEFAULT '{}',  -- front-end player IDs (e.g. 'self_3', 'rel_7')
        created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // PC Characters
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pc_characters (
        id SERIAL PRIMARY KEY,
        player_id INTEGER NOT NULL REFERENCES campaign_players(id) ON DELETE CASCADE,
        name VARCHAR(255),
        picture_url TEXT,
        picture_data TEXT,
        story TEXT,
        traits TEXT,
        flaws TEXT,
        goals TEXT,
        public_info TEXT,
        private_info TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // PC Relationships (family tree / friend matrix)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pc_relationships (
        id SERIAL PRIMARY KEY,
        character_id INTEGER NOT NULL REFERENCES pc_characters(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        relation_type VARCHAR(100),
        link TEXT,
        is_family BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // DM Notes per character
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pc_dm_notes (
        id SERIAL PRIMARY KEY,
        character_id INTEGER NOT NULL REFERENCES pc_characters(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        dm_visible BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // PC Stats Sheet (NPC-style full stats stored as JSON)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pc_char_stats (
        id         SERIAL PRIMARY KEY,
        player_id  INTEGER NOT NULL UNIQUE REFERENCES campaign_players(id) ON DELETE CASCADE,
        stats_json JSONB NOT NULL DEFAULT '{}',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Campaign Locations
    await pool.query(`
      CREATE TABLE IF NOT EXISTS campaign_locations (
        id SERIAL PRIMARY KEY,
        campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Campaign Meta (today marker, calendar type, etc.)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS campaign_meta (
        id SERIAL PRIMARY KEY,
        campaign_id   INTEGER NOT NULL UNIQUE REFERENCES campaigns(id) ON DELETE CASCADE,
        today_marker  VARCHAR(255),
        calendar_type VARCHAR(20) DEFAULT 'harptos',
        updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    // Journey Path Maps
    await pool.query(`
      CREATE TABLE IF NOT EXISTS journey_maps (
        id          SERIAL PRIMARY KEY,
        campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        name        VARCHAR(255) NOT NULL,
        description TEXT,
        map_image   TEXT,
        created_by  INTEGER NOT NULL REFERENCES users(id),
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS journey_map_locations (
        id                   SERIAL PRIMARY KEY,
        map_id               INTEGER NOT NULL REFERENCES journey_maps(id) ON DELETE CASCADE,
        campaign_location_id INTEGER REFERENCES campaign_locations(id) ON DELETE SET NULL,
        name                 VARCHAR(255) NOT NULL,
        x                    FLOAT NOT NULL DEFAULT 50,
        y                    FLOAT NOT NULL DEFAULT 50,
        polygon              JSONB,
        linked_map_id        INTEGER REFERENCES journey_maps(id) ON DELETE SET NULL,
        created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS journey_distances (
        id             SERIAL PRIMARY KEY,
        map_id         INTEGER NOT NULL REFERENCES journey_maps(id) ON DELETE CASCADE,
        from_loc_id    INTEGER NOT NULL REFERENCES journey_map_locations(id) ON DELETE CASCADE,
        to_loc_id      INTEGER NOT NULL REFERENCES journey_map_locations(id) ON DELETE CASCADE,
        distance_miles FLOAT NOT NULL DEFAULT 0,
        UNIQUE (map_id, from_loc_id, to_loc_id)
      );
    `);

    // DEPRECATED / DORMANT: journey_trackers is no longer read or written by the app
    // (movement paths are derived from the timeline). The table + journey_paths.tracker_id
    // and tracker_*_override columns are kept in place only to avoid a destructive drop.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS journey_trackers (
        id         SERIAL PRIMARY KEY,
        map_id     INTEGER NOT NULL REFERENCES journey_maps(id) ON DELETE CASCADE,
        name       VARCHAR(255) NOT NULL,
        type       VARCHAR(50) DEFAULT 'group',
        color      VARCHAR(20) DEFAULT '#c9a84c',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS journey_paths (
        id             SERIAL PRIMARY KEY,
        map_id         INTEGER NOT NULL REFERENCES journey_maps(id) ON DELETE CASCADE,
        tracker_id     INTEGER REFERENCES journey_trackers(id) ON DELETE SET NULL,
        name           VARCHAR(255),
        waypoints      JSONB DEFAULT '[]',
        distance_miles FLOAT,
        notes          TEXT,
        created_by     INTEGER NOT NULL REFERENCES users(id),
        created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS journey_map_shares (
        id         SERIAL PRIMARY KEY,
        map_id     INTEGER NOT NULL UNIQUE REFERENCES journey_maps(id) ON DELETE CASCADE,
        token      VARCHAR(255) NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Item cards — the magic-item card creator's saved library.
    //
    // Scoped to a USER, not a campaign: the module has never had a campaign
    // selector, and it is reachable without logging in at all. Anonymous
    // visitors keep the localStorage-only tool they have always had; this table
    // is what a signed-in user gets on top, so cards survive a cleared browser
    // or a different device.
    //
    // Real columns rather than a JSONB blob, because the field set is fixed and
    // known (six common + five per-type). JSONB is reserved here for genuinely
    // variable shapes like journey_map_locations.polygon.
    //
    // `abilities` is HTML from a contenteditable editor and is rendered with
    // dangerouslySetInnerHTML, so it is sanitised on write — see sanitizeAbilities.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS item_cards (
        id          SERIAL PRIMARY KEY,
        user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name        VARCHAR(255) NOT NULL,
        type        VARCHAR(40),
        rarity      VARCHAR(20) NOT NULL DEFAULT 'rare'
                      CHECK (rarity IN ('common','uncommon','rare','veryrare','legendary','artifact')),
        flavor      TEXT,
        abilities   TEXT,
        attunement  BOOLEAN NOT NULL DEFAULT false,
        damage      VARCHAR(60),
        damage_type VARCHAR(60),
        properties  VARCHAR(255),
        ac_bonus    VARCHAR(20),
        armor_type  VARCHAR(20),
        uses        INTEGER,
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Migrate: weight, so a granted item contributes to carry weight. NUMERIC
    // rather than INTEGER — a dagger is 1 lb but a vial is 0.5, and rounding
    // those to whole pounds makes the carry total visibly wrong.
    await pool.query(`
      ALTER TABLE item_cards ADD COLUMN IF NOT EXISTS weight NUMERIC(8,2);
    `);

    // Migrate: evolving items. A card may declare the card it grew out of,
    // making a chain of tiers; NULL means "base tier". Which tier a character
    // is actually holding is NOT stored here — it is which card their
    // inventory row points at, so a bump is one UPDATE of a column that
    // already exists, and reversing it is the same UPDATE backwards.
    //
    // SET NULL rather than RESTRICT, for a specific reason: the DELETE route
    // below catches 23503 and reports "this card is held by …" after querying
    // inventory_items. A RESTRICT here would raise that same code for a card
    // nobody holds, and the DM would get an error naming no holders.
    await pool.query(`
      ALTER TABLE item_cards ADD COLUMN IF NOT EXISTS
        evolves_from INTEGER REFERENCES item_cards(id) ON DELETE SET NULL;
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_item_cards_evolves_from
        ON item_cards (evolves_from);
    `);

    /**
     * Campaign Journal — notes the whole table shares.
     *
     * Distinct from the three note stores that already exist, and the
     * distinction is the point:
     *   player_diary_entries  — one player's own diary, scoped to a player_id
     *   campaign_diary_entries — the DM's session record, draft/published
     *   pc_dm_notes           — the DM's notes ABOUT one character
     * None of them is a place where every player at the table writes and
     * everyone reads. That is this.
     *
     * Authored by a USER, not a character: the DM has no character, and a
     * player's note stays theirs if they later swap. `player_id` records which
     * character they were playing, for display, and goes NULL rather than
     * taking the entry with it.
     */
    await pool.query(`
      CREATE TABLE IF NOT EXISTS campaign_journal_entries (
        id           SERIAL PRIMARY KEY,
        campaign_id  INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        created_by   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        player_id    INTEGER REFERENCES campaign_players(id) ON DELETE SET NULL,
        -- Where it happened. SET NULL, not CASCADE: deleting a location must
        -- not delete the notes written about it.
        location_id  INTEGER REFERENCES campaign_locations(id) ON DELETE SET NULL,
        title        VARCHAR(255),
        body         TEXT,
        -- Free text, like the diary's. Entries group under it in the UI; a
        -- campaign invents its own ("Documents", "Rumours", "People we met")
        -- rather than picking from a list somebody else wrote.
        category     VARCHAR(120),
        -- The in-game date, as an absolute day — the same integer
        -- campaign_meta.today_marker and the timelines use, so formatAbsDay
        -- renders all three identically. NULL when the author did not say.
        in_game_day  INTEGER,
        -- Only the DM can set this, and only the DM ever reads such a row.
        -- A player's entry is shared by definition; that is what the Journal is.
        dm_only      BOOLEAN NOT NULL DEFAULT false,
        created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await pool.query(`
      ALTER TABLE campaign_journal_entries
        ADD COLUMN IF NOT EXISTS category VARCHAR(120);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_journal_campaign
        ON campaign_journal_entries (campaign_id, created_at DESC);
    `);

    // Character inventory.
    //
    // A row is one of two things, and the CHECKs below make the difference
    // explicit rather than conventional:
    //
    //   CARD-LINKED (item_card_id set) — a magic item the DM granted from their
    //     library. The card is the reusable template; this row is the one
    //     instance of it in this campaign. Strictly unique per campaign (the
    //     partial index below) and always quantity 1: these are artifacts, not
    //     stock. A player can pass one to another player but cannot create one.
    //
    //   FREE-TEXT (name set, no card) — rope, rations, 50gp, potions. Owned and
    //     managed by the player, and the only kind that carries a quantity.
    //     Deliberately NOT item cards: authoring a card for a coil of rope is
    //     busywork, and consumables would break the uniqueness rule above.
    //
    // player_id, not user_id: an inventory belongs to a CHARACTER. Reassigning
    // the character to a different user carries the gear with it, and a user
    // with two characters in one campaign keeps two inventories.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS inventory_items (
        id           SERIAL PRIMARY KEY,
        campaign_id  INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        player_id    INTEGER NOT NULL REFERENCES campaign_players(id) ON DELETE CASCADE,
        -- RESTRICT, not CASCADE or SET NULL: deleting a card that is sitting in
        -- someone's inventory should fail loudly and say where it is, rather
        -- than silently removing a player's magic item or quietly degrading it
        -- into a nameless row.
        item_card_id INTEGER REFERENCES item_cards(id) ON DELETE RESTRICT,
        name         VARCHAR(255),
        quantity     INTEGER NOT NULL DEFAULT 1,
        -- Two different questions, deliberately separate columns:
        --   requires_attunement — a property of the ITEM. For a card-linked row
        --     it comes from the card instead, so this is for free-text gear.
        --   attuned — whether this character has actually attuned to it. 5e
        --     caps a character at three, which is why it needs counting.
        attuned      BOOLEAN NOT NULL DEFAULT false,
        requires_attunement BOOLEAN NOT NULL DEFAULT false,
        -- Which panel of the equipment sheet this lands in. Orthogonal to the
        -- card-linked/free-text split above: a granted potion is still granted,
        -- it just belongs in Potions rather than Inventory.
        category     VARCHAR(20) NOT NULL DEFAULT 'inventory',
        -- Per-item, so Current Carry Weight is a sum rather than a number the
        -- player maintains by hand. For a card-linked row this is NULL and the
        -- card's own weight is used instead — one item, one weight.
        weight       NUMERIC(8,2),
        equipped     BOOLEAN NOT NULL DEFAULT false,
        notes        TEXT,
        granted_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
        -- Transfer trail. No approval flow: a player hands an item over and it
        -- moves. These two columns are so the DM can see that it happened.
        prev_player_id  INTEGER REFERENCES campaign_players(id) ON DELETE SET NULL,
        transferred_at  TIMESTAMP,
        created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Migrate: category and weight.
    //
    // These MUST be ALTERs, not just columns in the CREATE TABLE above. The
    // table shipped before they existed, so on any install that already has it
    // `CREATE TABLE IF NOT EXISTS` is a no-op and the columns never appear —
    // which is exactly what happened: adding an item failed with
    // `column "category" of relation "inventory_items" does not exist`.
    // A scratch database cannot catch this, because there CREATE TABLE always
    // runs. Every column added after a table's first release needs a line here.
    await pool.query(`
      ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS category VARCHAR(20) NOT NULL DEFAULT 'inventory';
    `);
    await pool.query(`
      ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS weight NUMERIC(8,2);
    `);
    await pool.query(`
      ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS attuned BOOLEAN NOT NULL DEFAULT false;
    `);
    await pool.query(`
      ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS requires_attunement BOOLEAN NOT NULL DEFAULT false;
    `);
    // Every CHECK is added here, by name, rather than inline in the CREATE
    // TABLE — so a fresh install and an upgraded one end up with identical
    // constraints. Inline ones are invisible to an existing database for the
    // same reason the columns above were. Postgres has no
    // ADD CONSTRAINT IF NOT EXISTS, hence the swallowed duplicate_object.
    //
    //   kind         — a row is card-linked OR named, never neither
    //   card_qty     — quantities belong to free-text rows only
    //   qty_positive — no zero or negative stacks
    //   category     — one of the four panels on the equipment sheet
    for (const [name, check] of [
      ['inventory_items_kind',         "item_card_id IS NOT NULL OR (name IS NOT NULL AND name <> '')"],
      ['inventory_items_card_qty',     'item_card_id IS NULL OR quantity = 1'],
      ['inventory_items_qty_positive', 'quantity >= 1'],
      ['inventory_items_category',     "category IN ('inventory','treasure','potions','misc')"],
    ]) {
      await pool.query(`
        DO $$ BEGIN
          ALTER TABLE inventory_items ADD CONSTRAINT ${name} CHECK (${check});
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      `);
    }

    // "Reusable on any campaign, but only once per campaign." A partial index,
    // because the rule applies to card-linked rows only — free-text rows may
    // repeat freely (two players can both carry rope).
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_card_once_per_campaign
        ON inventory_items (campaign_id, item_card_id)
        WHERE item_card_id IS NOT NULL;
    `);

    // Migrate: coin purse. Four denominations rather than one "gold" number,
    // because players track them separately and converting on the fly is the
    // kind of arithmetic a sheet should be doing for you.
    //
    // On the CHARACTER, not as inventory rows: coins are a running balance you
    // add to and spend from, not a thing you own one of. Integers — there is no
    // half a copper piece.
    for (const c of ['pp', 'gp', 'sp', 'cp']) {
      await pool.query(`
        ALTER TABLE pc_characters ADD COLUMN IF NOT EXISTS coins_${c} INTEGER NOT NULL DEFAULT 0;
      `);
    }

    // Migrate: carry_capacity.
    //
    // UNUSED. It briefly backed a manual override for Maximum Carry Weight;
    // that was removed because the maximum is derived from STR and a second,
    // editable source of the same number is just a way for the two to disagree.
    // The column is left in place rather than dropped — a destructive migration
    // to remove a nullable column nobody writes is not worth the risk — but
    // nothing reads or writes it, and there is no route for it.
    await pool.query(`
      ALTER TABLE pc_characters ADD COLUMN IF NOT EXISTS carry_capacity NUMERIC(8,2);
    `);

    // Diary — session summaries. Two tables rather than one with a nullable
    // player_id, deliberately: the public share handler's SQL names
    // campaign_diary_entries and nothing else, so leaking a player's private
    // diary to an anonymous reader is unrepresentable rather than one forgotten
    // `AND player_id IS NULL` away. player_timeline_entries is the cautionary
    // tale — its merged shape forces an is_party check on every read path.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS campaign_diary_entries (
        id           SERIAL PRIMARY KEY,
        campaign_id  INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        created_by   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title        VARCHAR(255) NOT NULL,
        body         TEXT,
        session_no   INTEGER,
        session_date DATE,
        status       VARCHAR(20) NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft','published')),
        published_at TIMESTAMP,
        created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Private to the owning player. The campaign's DM may READ these (see the
      -- guards on /api/player-diary/*) but never write them.
      -- campaign_id is denormalised on purpose: it lets every mutation scope its
      -- WHERE by both campaign AND player, which is the cross-player defence.
      CREATE TABLE IF NOT EXISTS player_diary_entries (
        id           SERIAL PRIMARY KEY,
        campaign_id  INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        player_id    INTEGER NOT NULL REFERENCES campaign_players(id) ON DELETE CASCADE,
        created_by   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title        VARCHAR(255) NOT NULL,
        body         TEXT,
        session_no   INTEGER,
        session_date DATE,
        created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Its own token namespace: a timeline token must never resolve a diary.
      CREATE TABLE IF NOT EXISTS campaign_diary_shares (
        id          SERIAL PRIMARY KEY,
        campaign_id INTEGER NOT NULL UNIQUE REFERENCES campaigns(id) ON DELETE CASCADE,
        token       VARCHAR(255) NOT NULL UNIQUE,
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS campaign_timeline_shares (
        id          SERIAL PRIMARY KEY,
        campaign_id INTEGER NOT NULL UNIQUE REFERENCES campaigns(id) ON DELETE CASCADE,
        token       VARCHAR(255) NOT NULL UNIQUE,
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      -- Share links scoped to ONE timeline. Kept in its own table rather than as
      -- a nullable timeline_id on the table above, whose campaign_id is
      -- NOT NULL UNIQUE: relaxing that constraint on a live table to make room
      -- for per-timeline rows would put every existing share link at risk for no
      -- benefit. A token here grants that timeline and nothing else.
      CREATE TABLE IF NOT EXISTS player_timeline_shares (
        id          SERIAL PRIMARY KEY,
        timeline_id INTEGER NOT NULL UNIQUE REFERENCES player_timelines(id) ON DELETE CASCADE,
        token       VARCHAR(255) NOT NULL UNIQUE,
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Global (admin-managed) default location-pin images, keyed by size_type. A map
    // pin falls back to its type's image here when the location has no own image.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS location_type_images (
        size_type  VARCHAR(50) PRIMARY KEY,
        image_data TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    // Migrate: add calendar_type if it doesn't exist yet
    await pool.query(`
      ALTER TABLE campaign_meta ADD COLUMN IF NOT EXISTS calendar_type VARCHAR(20) DEFAULT 'harptos';
    `);
    // Migrate: add tracker override columns to journey_paths
    await pool.query(`
      ALTER TABLE journey_paths ADD COLUMN IF NOT EXISTS tracker_color_override VARCHAR(20);
      ALTER TABLE journey_paths ADD COLUMN IF NOT EXISTS tracker_name_override  VARCHAR(255);
    `);
    // Migrate: distinguish movement Paths (tracker-bound) from distance Routes
    // (tracker-free). Existing rows default to 'path'.
    await pool.query(`
      ALTER TABLE journey_paths ADD COLUMN IF NOT EXISTS kind VARCHAR(20) NOT NULL DEFAULT 'path';
    `);
    // Migrate: road network type for routes (road | flight | maritime).
    await pool.query(`
      ALTER TABLE journey_paths ADD COLUMN IF NOT EXISTS route_type VARCHAR(20) NOT NULL DEFAULT 'road';
    `);
    // Migrate: draggable name-label position (percent coords). Null → default midpoint.
    await pool.query(`
      ALTER TABLE journey_paths ADD COLUMN IF NOT EXISTS label_x FLOAT;
      ALTER TABLE journey_paths ADD COLUMN IF NOT EXISTS label_y FLOAT;
    `);
    // Migrate: link a tracker to the campaign player it represents. Player
    // trackers are auto-created per campaign player; this makes the link
    // persistent (not just name-based) so the public map can show a logged-in
    // player only their own path. Backfill existing player trackers by name.
    await pool.query(`
      ALTER TABLE journey_trackers ADD COLUMN IF NOT EXISTS player_id INTEGER REFERENCES campaign_players(id) ON DELETE SET NULL;
    `);
    await pool.query(`
      UPDATE journey_trackers jt SET player_id = cp.id
      FROM journey_maps jm
      JOIN campaign_players cp ON cp.campaign_id = jm.campaign_id
      WHERE jt.map_id = jm.id
        AND jt.type = 'player'
        AND jt.player_id IS NULL
        AND jt.name = cp.player_name;
    `);
    // Migrate: add timeline_id to player_timeline_entries if missing
    await pool.query(`
      ALTER TABLE player_timeline_entries ADD COLUMN IF NOT EXISTS timeline_id INTEGER REFERENCES player_timelines(id) ON DELETE CASCADE;
    `);
    // Migrate: add player_ids to player_timeline_entries if it doesn't exist
    await pool.query(`
      ALTER TABLE player_timeline_entries ADD COLUMN IF NOT EXISTS player_ids TEXT[] DEFAULT '{}';
      ALTER TABLE pc_characters ADD COLUMN IF NOT EXISTS picture_data TEXT;
    `);
    // Migrate: party timeline events — one entry shown to the whole group (no
    // owning player/timeline). Campaign-scoped, DM-authored, shown as a shared lane.
    await pool.query(`
      ALTER TABLE player_timeline_entries ADD COLUMN IF NOT EXISTS is_party BOOLEAN NOT NULL DEFAULT false;
      ALTER TABLE player_timeline_entries ALTER COLUMN player_id DROP NOT NULL;
    `);
    // Migrate: diary grouping. The campaign diary is organised into chapters
    // (an arc of sessions); a player diary into categories the player chooses
    // (Session notes, Theories, People…). Free text rather than a lookup table:
    // both are the author's own filing system, and a fixed vocabulary would be
    // wrong for somebody within a week.
    await pool.query(`
      ALTER TABLE campaign_diary_entries ADD COLUMN IF NOT EXISTS chapter VARCHAR(120);
      ALTER TABLE player_diary_entries   ADD COLUMN IF NOT EXISTS category VARCHAR(120);
    `);
    // Migrate: per-event visibility to players. The DM authors an event, then
    // reveals it when the party learns of it.
    //
    // Added with DEFAULT true and only THEN switched to false, deliberately:
    // `ADD COLUMN ... DEFAULT true` backfills every existing row as visible, so
    // nothing players can already see disappears the first time this runs, while
    // `SET DEFAULT false` makes every event created afterwards start hidden.
    // Doing it in one statement with DEFAULT false would have silently hidden
    // every event in every live campaign. Both statements are idempotent: the
    // ADD is a no-op once the column exists, so later boots never re-backfill.
    await pool.query(`
      ALTER TABLE player_timeline_entries ADD COLUMN IF NOT EXISTS visible_to_players BOOLEAN NOT NULL DEFAULT true;
      ALTER TABLE player_timeline_entries ALTER COLUMN visible_to_players SET DEFAULT false;
    `);
    // Migrate: DM player flag and NPCs
    await pool.query(`
      ALTER TABLE campaign_players ADD COLUMN IF NOT EXISTS is_dm_player BOOLEAN NOT NULL DEFAULT false;
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS campaign_npcs (
        id          SERIAL PRIMARY KEY,
        campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        name        VARCHAR(255) NOT NULL,
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (campaign_id, name)
      );
    `);
    // DEPRECATED / DORMANT: path_public is no longer read or written (NPC paths are
    // always DM-only on the public map). Column kept in place to avoid a destructive drop.
    await pool.query(`
      ALTER TABLE campaign_npcs ADD COLUMN IF NOT EXISTS path_public BOOLEAN NOT NULL DEFAULT false;
    `);

    // Migrate: location visibility (is_public)
    await pool.query(`
      ALTER TABLE campaign_locations ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT true;
    `);

    // Migrate: location size/type
    await pool.query(`
      ALTER TABLE campaign_locations ADD COLUMN IF NOT EXISTS size_type VARCHAR(50);
    `);

    // Migrate: nested locations (unlimited depth)
    await pool.query(`
      ALTER TABLE campaign_locations ADD COLUMN IF NOT EXISTS parent_id INTEGER REFERENCES campaign_locations(id) ON DELETE SET NULL;
    `);

    // Migrate: optional custom pin image (base64 data URL; ~256px thumbnail). Falls back
    // to the size/type vector icon on the map when null.
    await pool.query(`
      ALTER TABLE campaign_locations ADD COLUMN IF NOT EXISTS image_data TEXT;
    `);

    // Migrate: unique location names per campaign (deduplicate first)
    await pool.query(`
      DELETE FROM campaign_locations
      WHERE id NOT IN (
        SELECT MIN(id)
        FROM campaign_locations
        GROUP BY campaign_id, LOWER(name)
      );
    `);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS campaign_locations_campaign_name_unique
      ON campaign_locations (campaign_id, LOWER(name));
    `);

    // Migrate: journey map scope
    await pool.query(`
      ALTER TABLE journey_maps ADD COLUMN IF NOT EXISTS scope_type VARCHAR(20) NOT NULL DEFAULT 'continent';
    `);
    await pool.query(`
      ALTER TABLE journey_maps ADD COLUMN IF NOT EXISTS scope_location_id INTEGER REFERENCES campaign_locations(id) ON DELETE SET NULL;
    `);

    // Migrate: region polygon support
    await pool.query(`
      ALTER TABLE journey_map_locations ADD COLUMN IF NOT EXISTS polygon JSONB;
    `);

    // Migrate: linked map for regions
    await pool.query(`
      ALTER TABLE journey_map_locations ADD COLUMN IF NOT EXISTS linked_map_id INTEGER REFERENCES journey_maps(id) ON DELETE SET NULL;
    `);

    // Migrate: per-pin icon scale (1 = default) so each pin can be sized to fit the map art.
    await pool.query(`
      ALTER TABLE journey_map_locations ADD COLUMN IF NOT EXISTS icon_scale FLOAT NOT NULL DEFAULT 1;
    `);

    // Character relationship trees (DM-only cross-player connections)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS character_relationships (
        id SERIAL PRIMARY KEY,
        campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        from_entity_type VARCHAR(20) NOT NULL CHECK (from_entity_type IN ('player','npc','relationship')),
        from_entity_id INTEGER NOT NULL,
        to_entity_type VARCHAR(20) NOT NULL CHECK (to_entity_type IN ('player','npc','relationship')),
        to_entity_id INTEGER NOT NULL,
        label VARCHAR(255) NOT NULL DEFAULT '',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Migrate: DM-only relationships (hidden from player)
    await pool.query(`
      ALTER TABLE pc_relationships ADD COLUMN IF NOT EXISTS is_dm_only BOOLEAN NOT NULL DEFAULT false;
    `);

    // Migrate: track who created the relationship (role) + nested relationships
    await pool.query(`
      ALTER TABLE pc_relationships ADD COLUMN IF NOT EXISTS created_by_role VARCHAR(20) NOT NULL DEFAULT 'player';
    `);
    await pool.query(`
      ALTER TABLE pc_relationships ADD COLUMN IF NOT EXISTS parent_id INTEGER REFERENCES pc_relationships(id) ON DELETE CASCADE;
    `);
    // Migrate: relationship status label (Alive, Dead, or any free-form text)
    await pool.query(`
      ALTER TABLE pc_relationships ADD COLUMN IF NOT EXISTS status_label VARCHAR(100);
    `);
    // Migrate: fix character_relationships CHECK constraints to include 'relationship' type
    await pool.query(`
      ALTER TABLE character_relationships
        DROP CONSTRAINT IF EXISTS character_relationships_from_entity_type_check,
        DROP CONSTRAINT IF EXISTS character_relationships_to_entity_type_check;
    `);
    await pool.query(`
      ALTER TABLE character_relationships
        ADD CONSTRAINT character_relationships_from_entity_type_check
          CHECK (from_entity_type IN ('player','npc','relationship')),
        ADD CONSTRAINT character_relationships_to_entity_type_check
          CHECK (to_entity_type IN ('player','npc','relationship'));
    `);

    // Migrate: public cross-connections (visible to players on their PC sheet)
    await pool.query(`
      ALTER TABLE character_relationships ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT false;
    `);

    // ── Indexes on the foreign keys we actually filter by ───────────────────
    //
    // Runs here, last, so every column added by an ALTER above exists. All are
    // IF NOT EXISTS, so this is idempotent like the rest of this function and
    // needs no manual step — existing databases pick them up on the next start.
    //
    // Deliberately NOT indexed: a column that is already the leading column of
    // a UNIQUE constraint or index (campaign_locations.campaign_id via
    // campaign_locations_campaign_name_unique, campaign_npcs.campaign_id,
    // journey_distances.map_id) and every column-level UNIQUE (pc_char_stats,
    // campaign_meta, journey_map_shares, campaign_timeline_shares,
    // campaign_diary_shares) — those are
    // indexed already, and a duplicate only costs write throughput.
    const INDEXES = [
      // Campaign fan-out — every page starts from one of these.
      // Partial: every selector query is "my campaigns, not trashed", and the
      // trash itself is tiny, so the live set is the one worth indexing.
      ['idx_item_cards_user',              'item_cards(user_id)'],
      ['idx_campaigns_dm_user',            'campaigns(dm_user_id)'],
      ['idx_campaigns_dm_user_live',       'campaigns(dm_user_id) WHERE deleted_at IS NULL'],
      ['idx_campaign_players_campaign',    'campaign_players(campaign_id)'],
      ['idx_cua_player',                   'campaign_user_assignments(player_id)'],
      ['idx_cua_user',                     'campaign_user_assignments(user_id)'],
      ['idx_campaign_locations_parent',    'campaign_locations(parent_id)'],
      ['idx_campaign_npcs_campaign_id',    'campaign_npcs(campaign_id)'],

      // Timelines. player_timeline_entries is the largest table here.
      ['idx_player_timelines_campaign_player', 'player_timelines(campaign_id, player_id)'],
      ['idx_pte_timeline',                 'player_timeline_entries(timeline_id)'],
      ['idx_pte_campaign_player',          'player_timeline_entries(campaign_id, player_id)'],

      // Diary.
      ['idx_cde_campaign',                 'campaign_diary_entries(campaign_id)'],
      ['idx_pde_campaign_player',          'player_diary_entries(campaign_id, player_id)'],

      // PC sheets — read on every sheet load.
      ['idx_pc_characters_player',         'pc_characters(player_id)'],
      ['idx_pc_relationships_character',   'pc_relationships(character_id)'],
      ['idx_pc_dm_notes_character',        'pc_dm_notes(character_id)'],

      // Journey maps.
      ['idx_journey_maps_campaign',        'journey_maps(campaign_id)'],
      ['idx_jml_map',                      'journey_map_locations(map_id)'],
      ['idx_jml_campaign_location',        'journey_map_locations(campaign_location_id)'],
      ['idx_journey_paths_map',            'journey_paths(map_id)'],
      ['idx_journey_distances_from',       'journey_distances(from_loc_id)'],
      ['idx_journey_distances_to',         'journey_distances(to_loc_id)'],

      // DM cross-entity graph.
      ['idx_character_relationships_campaign', 'character_relationships(campaign_id)'],
    ];
    for (const [name, target] of INDEXES) {
      await pool.query(`CREATE INDEX IF NOT EXISTS ${name} ON ${target}`);
    }

    console.log('✓ Database initialized');
  } catch (error) {
    console.error('✗ Database error:', error.message);
    process.exit(1);
  }
}

// ── SPA catch-all — must be the very last route ──────────────────────────────
// Every non-API path returns index.html so React Router can resolve it
// client-side (including unknown paths, which render NotFound).
//
// NOTE: Express 5 uses path-to-regexp v8 which requires named wildcards.
//       `/{*path}` matches everything including `/`.
app.get('/{*path}', (req, res) => {
  // Checked per-request, not at boot: `node app.js` before a build used to
  // register no catch-all at all, so every React route 404'd for the whole
  // process lifetime. Say what is wrong instead of failing obscurely.
  if (!fs.existsSync(SPA_INDEX)) {
    return res.status(503).type('text/plain').send(
      'The React frontend has not been built yet.\n\n'
      + 'Run:  cd frontend && npm install && npm run build\n'
      + 'then restart, or reload this page.\n',
    );
  }
  res.sendFile(SPA_INDEX);
});

// Schema first, then accept traffic.
//
// This used to be `app.listen(PORT, async () => { await initializeDatabase() … })`,
// which bound the socket before the tables existed — requests arriving in that
// window hit a half-built schema, and a DDL failure called process.exit(1) on an
// already-listening server.
initializeDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`\n🎲 D&D Tools running at http://localhost:${PORT}`);
    console.log(`\n📋 Page routes:`);
    console.log(`  🔓 Public    : /npc-sheet, /item-cards, /split-view`);
    console.log(`  🔓 Public    : /timeline-public/:token, /journey-map-public/:token, /pc-public/:token`);
    console.log(`  🔓 Public    : /diary-public/:token`);
    console.log(`  🎭 Player/DM : /timeline, /pc-sheet, /diary`);
    console.log(`  👑 DM        : /manage-campaigns, /journey-map, /pdf-viewer`);
    console.log(`  🛠️ Admin     : /user-panel`);
    console.log(`\n🔌 API groups:`);
    console.log(`  /api/auth/*                       Auth (login, logout, change-password)`);
    console.log(`  /api/users/*                      User management (admin)`);
    console.log(`  /api/campaigns/*                  Campaigns, players, locations, meta`);
    console.log(`  /api/player-timelines/*           Timeline CRUD`);
    console.log(`  /api/timeline-public/:token       Public read-only timeline`);
    console.log(`  /api/campaign-diary/*             Campaign diary (DM): draft/published, share, export/import`);
    console.log(`  /api/player-diary/*               Per-player private diaries`);
    console.log(`  /api/diary-public/:token          Public read-only diary (published only)`);
    console.log(`  /api/pc/*                         PC sheets, relationships, DM notes`);
    console.log(`  /api/pc-public/:token             Public read-only PC sheet`);
    console.log(`  /api/journey-maps/*               Journey maps, locations, paths, routes`);
    console.log(`  /api/journey-map-public/:token    Public read-only journey map`);
    console.log(`  /api/pdfs                         PDF file listing`);
    console.log(`  /api/proxy-image                  External image proxy`);
  });
});
