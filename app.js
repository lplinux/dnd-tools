require('dotenv').config();
const express    = require('express');
const path       = require('path');
const fs         = require('fs');               // sync methods (existsSync, etc.)
const fsPromises = fs.promises;                 // async methods (readFile, readdir)
const session    = require('express-session');
const bcrypt     = require('bcryptjs');
const crypto     = require('crypto');
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
    secure: false,
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000
  }
}));

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

app.post('/api/auth/login', async (req, res) => {
  const { username, password, rememberMe } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  try {
    const result = await pool.query(
      'SELECT id, username, role, password_hash FROM users WHERE username = $1',
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];

    if (!user.password_hash) {
      console.error('User record missing password_hash for user:', user.username);
      return res.status(500).json({ error: 'User record malformed' });
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.role = user.role;
    // "Remember me" extends the session cookie to 30 days (default stays 24h).
    req.session.cookie.maxAge = rememberMe
      ? 30 * 24 * 60 * 60 * 1000
      : 24 * 60 * 60 * 1000;

    res.json({
      success: true,
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
  if (!req.session.userId) {
    return res.json({ user: null });
  }
  res.json({
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

    if (req.session.role === 'dm') {
      query = 'SELECT * FROM campaigns WHERE dm_user_id = $1 ORDER BY created_at DESC';
      params = [req.session.userId];
    } else {
      query = `SELECT c.* FROM campaigns c
           JOIN campaign_players cp ON c.id = cp.campaign_id
           JOIN campaign_user_assignments cua ON cp.id = cua.player_id
           WHERE cua.user_id = $1 ORDER BY c.created_at DESC`;
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

app.delete('/api/campaigns/:id', requireRole(['dm']), async (req, res) => {
  const { id } = req.params;

  try {
    // Check ownership (DM can only delete own campaigns)
    if (req.session.role === 'dm') {
      const check = await pool.query('SELECT dm_user_id FROM campaigns WHERE id = $1', [id]);
      if (check.rows.length === 0 || check.rows[0].dm_user_id !== req.session.userId) {
        return res.status(403).json({ error: 'Cannot delete campaign' });
      }
    }

    await pool.query('DELETE FROM campaigns WHERE id = $1', [id]);
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
async function canAccessTimeline(userId, userRole, campaignId, playerId) {
  if (userRole === 'admin') return true;
  if (userRole === 'dm') {
    // DM can access timelines in their own campaigns
    const r = await pool.query('SELECT id FROM campaigns WHERE id=$1 AND dm_user_id=$2', [campaignId, userId]);
    return r.rows.length > 0;
  }
  // Player: must be assigned to this player (parseInt to avoid type mismatch)
  const r = await pool.query(
    'SELECT id FROM campaign_user_assignments WHERE player_id=$1 AND user_id=$2',
    [parseInt(playerId), parseInt(userId)]
  );
  return r.rows.length > 0;
}

// ── Diary (session summaries) ───────────────────────────────────────────────
// Two halves with deliberately different privacy:
//   campaign_diary_entries — the DM's write-ups. Players never see these in the
//     app at all; they reach them only through a public share link, and only
//     once published.
//   player_diary_entries   — private to the owning player. The campaign's DM may
//     READ them (so they can weave player notes into prep) but never write them:
//     "private" should not mean somebody else can rewrite it.

/** DM owns the campaign; admin passes. Mirrors dmOwnsMap. */
async function dmOwnsCampaign(campaignId, userId, role) {
  if (role === 'admin') return true;
  const r = await pool.query('SELECT id FROM campaigns WHERE id=$1 AND dm_user_id=$2', [campaignId, userId]);
  return r.rows.length > 0;
}

/** The canonical "does this user own this player" check. */
async function ownsPlayer(userId, playerId) {
  const r = await pool.query(
    'SELECT id FROM campaign_user_assignments WHERE player_id=$1 AND user_id=$2',
    [parseInt(playerId), parseInt(userId)],
  );
  return r.rows.length > 0;
}

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
    if (!await dmOwnsCampaign(campaignId, req.session.userId, req.session.role))
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
    const share = await pool.query('SELECT campaign_id FROM campaign_diary_shares WHERE token=$1', [req.params.token]);
    if (!share.rows.length) return res.status(404).json({ error: 'Not found' });
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

    const [campR, entriesR] = await Promise.all([
      pool.query('SELECT name FROM campaigns WHERE id=$1', [campaignId]),
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

    // Session-blind on purpose: unlike the public journey map this never tailors
    // its output to a logged-in cookie, so "did we leak?" stays reproducible
    // with a cookie-less curl.
    res.json({
      campaign_name: campR.rows[0]?.name || 'Campaign',
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
    // DM must own this campaign
    if (req.session.role === 'dm') {
      const check = await pool.query('SELECT id FROM campaigns WHERE id=$1 AND dm_user_id=$2', [campaignId, req.session.userId]);
      if (!check.rows.length) return res.status(403).json({ error: 'Access denied' });
    }
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
      if (req.session.role === 'dm') {
        const check = await pool.query('SELECT id FROM campaigns WHERE id=$1 AND dm_user_id=$2', [campaignId, req.session.userId]);
        if (!check.rows.length) return res.status(403).json({ error: 'Access denied' });
      }
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

    const [metaR, entriesR] = await Promise.all([
      pool.query(
        `SELECT c.name, COALESCE(cm.calendar_type,'harptos') AS calendar_type,
                cm.today_marker
         FROM campaigns c
         LEFT JOIN campaign_meta cm ON cm.campaign_id = c.id
         WHERE c.id=$1`,
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

    res.json({
      campaign_name: metaR.rows[0]?.name || 'Campaign',
      calendar_type: metaR.rows[0]?.calendar_type || 'harptos',
      // Campaign-wide and non-sensitive; without it the public view drew no
      // Today marker at all, so "where are we now?" was unanswerable there.
      today_marker: metaR.rows[0]?.today_marker ?? null,
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

// Helper: check if user can access a player's PC data
async function canAccessPC(userId, userRole, playerId) {
  if (userRole === 'dm') return true;
  const result = await pool.query(
    'SELECT id FROM campaign_user_assignments WHERE player_id = $1 AND user_id = $2',
    [playerId, userId]
  );
  return result.rows.length > 0;
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
    await pool.query('DELETE FROM pc_relationships WHERE id = $1', [relId]);
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
    const values = [...Object.values(updates), relId];
    const result = await pool.query(
      `UPDATE pc_relationships SET ${setClauses} WHERE id = $${values.length} RETURNING *`,
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
    const result = await pool.query(
      'UPDATE pc_dm_notes SET dm_visible=$1, content=COALESCE($2, content) WHERE id=$3 RETURNING *',
      [dm_visible, content, noteId]
    );
    res.json(result.rows[0]);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// Delete DM note
app.delete('/api/pc/:playerId/dm-notes/:noteId', requireRole(['dm']), async (req, res) => {
  const { noteId } = req.params;
  try {
    await pool.query('DELETE FROM pc_dm_notes WHERE id = $1', [noteId]);
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
    const result = await pool.query(
      'SELECT name, picture_url, picture_data, public_info FROM pc_characters WHERE player_id = $1',
      [playerId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Character not found' });
    res.json(result.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Get public token for a player (for sharing the public sheet URL)
app.get('/api/pc/:playerId/public-token', requireRole(['dm', 'player']), async (req, res) => {
  const playerId = parseInt(req.params.playerId);
  if (isNaN(playerId)) return res.status(400).json({ error: 'Invalid player ID' });
  res.json({ token: hashId(playerId) });
});

// ============================================
// PC STATS SHEET
// ============================================

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
      [playerId, JSON.stringify(req.body)]
    );
    res.json(result.rows[0].stats_json);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================
// CAMPAIGN LOCATIONS
// ============================================

app.get('/api/campaigns/:campaignId/locations', requireRole(['dm', 'player']), async (req, res) => {
  try {
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
// CAMPAIGN META (today_marker, etc.)

// ─── Campaign NPCs (DM-only) ─────────────────────────────────────────────────
app.get('/api/campaigns/:campaignId/npcs', requireRole(['dm', 'admin']), async (req, res) => {
  try {
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
    await pool.query('DELETE FROM character_relationships WHERE id=$1 AND campaign_id=$2', [req.params.connId, req.params.campaignId]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH toggle is_public on a DM cross-connection
app.patch('/api/campaigns/:campaignId/char-tree/connections/:connId/visibility', requireRole(['dm', 'admin']), async (req, res) => {
  try {
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
    const check = await pool.query('SELECT id FROM campaigns WHERE id=$1 AND dm_user_id=$2', [campaignId, req.session.userId]);
    if (!check.rows.length) return res.status(403).json({ error: 'Access denied' });

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

// Helper: check DM owns this map's campaign
async function dmOwnsMap(mapId, userId) {
  const r = await pool.query(
    `SELECT c.id FROM journey_maps jm
     JOIN campaigns c ON jm.campaign_id = c.id
     WHERE jm.id = $1 AND c.dm_user_id = $2`,
    [mapId, userId]
  );
  return r.rows.length > 0;
}

// List maps for a campaign
app.get('/api/campaigns/:campaignId/journey-maps', requireRole(['dm']), async (req, res) => {
  try {
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
    await pool.query('DELETE FROM journey_map_locations WHERE id=$1 AND map_id=$2', [req.params.locId, req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Distances ──
app.get('/api/journey-maps/:id/distances', requireRole(['dm']), async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM journey_distances WHERE map_id=$1', [req.params.id]);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/journey-maps/:id/distances', requireRole(['dm']), async (req, res) => {
  const { from_loc_id, to_loc_id, distance_miles } = req.body;
  try {
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
    await pool.query('DELETE FROM journey_paths WHERE id=$1 AND map_id=$2', [req.params.pid, req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Share (public token) ──
app.post('/api/journey-maps/:id/share', requireRole(['dm']), async (req, res) => {
  try {
    if (!await dmOwnsMap(req.params.id, req.session.userId))
      return res.status(403).json({ error: 'Access denied' });
    // Upsert share token
    const token = hashId(parseInt(req.params.id)) + crypto.randomBytes(4).toString('hex');
    await pool.query(
      `INSERT INTO journey_map_shares (map_id, token) VALUES ($1,$2)
       ON CONFLICT (map_id) DO UPDATE SET token=EXCLUDED.token`,
      [req.params.id, token]
    );
    res.json({ token });
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
    if (!share.rows.length) return res.status(404).json({ error: 'Map not found' });
    const mapId = share.rows[0].map_id;

    // The public map is viewer-aware. It's token-gated (no requireAuth), but a
    // logged-in user still sends their session cookie, so we can tailor what's
    // shown: hidden locations/roads are dropped for everyone; tracker paths are
    // shown per role (DM owner → all; player → own + party; anonymous → none).
    const userId = req.session.userId || null;
    const role   = req.session.role   || null;
    const isDmOwner = !!userId && role === 'dm' && await dmOwnsMap(mapId, userId);

    const [mapR, locsR, distsR, pathsR] = await Promise.all([
      pool.query('SELECT id, name, description, map_image, campaign_id FROM journey_maps WHERE id=$1', [mapId]),
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
      if (p.id === 'party') return !!userId;                                   // any logged-in player
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
      version: 4,
      exported_at: new Date().toISOString(),
      type: 'campaign',
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
          [playerId, JSON.stringify(p.stats_json)]
        );
      }

      if (charId) {
        for (const n of (p.dm_notes || [])) {
          await client.query('INSERT INTO pc_dm_notes (character_id, content, dm_visible) VALUES ($1,$2,$3)',
            [charId, n.content, n.dm_visible || false]);
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
    res.json({ success: true, campaign_id: newId });
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
          [playerId, JSON.stringify(stats)],
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
      ['idx_campaigns_dm_user',            'campaigns(dm_user_id)'],
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
