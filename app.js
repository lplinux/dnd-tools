require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const session = require('express-session');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { Pool } = require('pg');

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
app.use(express.static(path.join(__dirname, 'public')));
app.use('/pdfs', express.static(path.join(__dirname, 'pdfs')));

// Serve module README docs — only whitelisted slugs, no path traversal
const DOCS_MODULES = new Set(['npc-sheet', 'item-cards', 'split-view', 'timeline', 'pdf-viewer', 'pc-sheet', 'manage-campaigns', 'journey-map', 'user-panel']);
app.get('/api/docs/:module', async (req, res) => {
  const mod = req.params.module;
  if (!DOCS_MODULES.has(mod)) return res.status(404).json({ error: 'Not found' });
  try {
    const md = await fs.readFile(path.join(__dirname, 'docs', mod, 'README.md'), 'utf8');
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

// Page-serving variant: redirects to / instead of returning JSON errors
const requireRolePage = (roles) => async (req, res, next) => {
  if (!req.session.userId) return res.redirect('/');
  try {
    const result = await pool.query('SELECT role FROM users WHERE id = $1', [req.session.userId]);
    if (result.rows.length === 0 || !roles.includes(result.rows[0].role)) return res.redirect('/');
    next();
  } catch (error) { res.redirect('/'); }
};
const requireAuthPage = (req, res, next) => {
  if (!req.session.userId) return res.redirect('/');
  next();
};

// ============================================
// AUTH ENDPOINTS
// ============================================

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;

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

  if (!name) {
    return res.status(400).json({ error: 'Campaign name required' });
  }

  try {
    const result = await pool.query(
      'INSERT INTO campaigns (name, description, dm_user_id) VALUES ($1, $2, $3) RETURNING *',
      [name, description || null, req.session.userId]
    );

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
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
    const result = await pool.query(
      `SELECT cp.*, cua.user_id, u.username FROM campaign_players cp
       LEFT JOIN campaign_user_assignments cua ON cp.id = cua.player_id
       LEFT JOIN users u ON cua.user_id = u.id
       WHERE cp.campaign_id = $1
         AND (cp.is_dm_player IS NULL OR cp.is_dm_player = false)
       ORDER BY cp.created_at DESC`,
      [campaignId]
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
      `SELECT pt.id as timeline_id, pt.name as timeline_name,
              cp.id as player_id, cp.player_name,
              u_assign.username,
              pte.id as entry_id, pte.title, pte.description,
              pte.location, pte.year, pte.day_of_year, pte.duration_days,
              pte.player_ids, pte.manual_links
       FROM player_timelines pt
       JOIN campaign_players cp ON pt.player_id = cp.id
       LEFT JOIN campaign_user_assignments cua ON cp.id = cua.player_id
       LEFT JOIN users u_assign ON cua.user_id = u_assign.id
       LEFT JOIN player_timeline_entries pte ON pte.timeline_id = pt.id
       WHERE pt.campaign_id=$1
       ORDER BY cp.player_name, pt.name, pte.year ASC, pte.day_of_year ASC`,
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
    const result = await pool.query(
      `SELECT pte.*, u.username as created_by_name
       FROM player_timeline_entries pte
       JOIN users u ON pte.created_by = u.id
       WHERE pte.timeline_id=$1
       ORDER BY pte.year ASC, pte.day_of_year ASC, pte.created_at ASC`,
      [timelineId]
    );
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
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
    const result = await pool.query(
      `INSERT INTO player_timeline_entries
         (campaign_id, player_id, timeline_id, created_by, title, description, location, year, day_of_year, duration_days, player_ids)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [t.campaign_id, t.player_id, timelineId, req.session.userId,
        title, description || null, location || null,
      year || 1492, day_of_year || 1, duration_days || 1,
      player_ids && player_ids.length ? player_ids : ['self_' + t.player_id]]
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

// GET all players in a campaign with their timeline entry counts (DM view)
app.get('/api/timeline-private/:campaignId/players-summary', requireRole(['dm']), async (req, res) => {
  const { campaignId } = req.params;
  try {
    const result = await pool.query(
      `SELECT cp.id, cp.player_name, u.username,
              COUNT(pte.id)::int as entry_count
       FROM campaign_players cp
       LEFT JOIN campaign_user_assignments cua ON cp.id = cua.player_id
       LEFT JOIN users u ON cua.user_id = u.id
       LEFT JOIN player_timeline_entries pte ON cp.id = pte.player_id
       WHERE cp.campaign_id=$1
       GROUP BY cp.id, cp.player_name, u.username
       ORDER BY cp.player_name`,
      [campaignId]
    );
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET all entries for a specific player in a campaign
app.get('/api/timeline-private/:campaignId/:playerId', requireAuth, async (req, res) => {
  const { campaignId, playerId } = req.params;
  try {
    if (!await canAccessTimeline(req.session.userId, req.session.role, campaignId, playerId)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const result = await pool.query(
      `SELECT pte.*, u.username as created_by_name
       FROM player_timeline_entries pte
       JOIN users u ON pte.created_by = u.id
       WHERE pte.campaign_id=$1 AND pte.player_id=$2
       ORDER BY pte.year ASC, pte.day_of_year ASC, pte.created_at ASC`,
      [campaignId, playerId]
    );
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET all entries for ALL players in a campaign (DM/admin only)
app.get('/api/timeline-private/:campaignId', requireRole(['admin', 'dm']), async (req, res) => {
  const { campaignId } = req.params;
  try {
    // DM can only see campaigns they own
    if (req.session.role === 'dm') {
      const check = await pool.query('SELECT id FROM campaigns WHERE id=$1 AND dm_user_id=$2', [campaignId, req.session.userId]);
      if (!check.rows.length) return res.status(403).json({ error: 'Access denied' });
    }
    const result = await pool.query(
      `SELECT pte.*, cp.player_name, u.username as created_by_name
       FROM player_timeline_entries pte
       JOIN campaign_players cp ON pte.player_id = cp.id
       JOIN users u ON pte.created_by = u.id
       WHERE pte.campaign_id=$1
       ORDER BY pte.year ASC, pte.day_of_year ASC, pte.created_at ASC`,
      [campaignId]
    );
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST create a new entry
app.post('/api/timeline-private/:campaignId/:playerId', requireRole(['dm', 'player']), async (req, res) => {
  const { campaignId, playerId } = req.params;
  const { title, description, location, year, day_of_year, duration_days, manual_links } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });
  try {
    if (!await canAccessTimeline(req.session.userId, req.session.role, campaignId, playerId)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const result = await pool.query(
      `INSERT INTO player_timeline_entries
         (campaign_id, player_id, created_by, title, description, location, year, day_of_year, duration_days, manual_links)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [campaignId, playerId, req.session.userId, title,
        description || null, location || null,
        year || 1492, day_of_year || 1, duration_days || 1,
        manual_links || []]
    );
    res.json(result.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT update an entry
app.put('/api/timeline-private/:campaignId/:playerId/:entryId', requireRole(['dm', 'player']), async (req, res) => {
  const { campaignId, playerId, entryId } = req.params;
  const { title, description, location, year, day_of_year, duration_days, manual_links } = req.body;
  try {
    if (!await canAccessTimeline(req.session.userId, req.session.role, campaignId, playerId)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const result = await pool.query(
      `UPDATE player_timeline_entries
       SET title=$1, description=$2, location=$3, year=$4, day_of_year=$5,
           duration_days=$6, manual_links=$7, updated_at=CURRENT_TIMESTAMP
       WHERE id=$8 AND campaign_id=$9 AND player_id=$10 RETURNING *`,
      [title, description || null, location || null,
        year, day_of_year, duration_days || 1, manual_links || [],
        entryId, campaignId, playerId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Entry not found' });
    res.json(result.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE an entry
app.delete('/api/timeline-private/:campaignId/:playerId/:entryId', requireRole(['dm', 'player']), async (req, res) => {
  const { campaignId, playerId, entryId } = req.params;
  try {
    if (!await canAccessTimeline(req.session.userId, req.session.role, campaignId, playerId)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    await pool.query(
      'DELETE FROM player_timeline_entries WHERE id=$1 AND campaign_id=$2 AND player_id=$3',
      [entryId, campaignId, playerId]
    );
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

// Public read-only combined data — no auth required
app.get('/api/timeline-public/:token', async (req, res) => {
  try {
    const share = await pool.query('SELECT campaign_id FROM campaign_timeline_shares WHERE token=$1', [req.params.token]);
    if (!share.rows.length) return res.status(404).json({ error: 'Not found' });
    const campaignId = share.rows[0].campaign_id;

    const [metaR, entriesR] = await Promise.all([
      pool.query(
        `SELECT c.name, COALESCE(cm.calendar_type,'harptos') AS calendar_type
         FROM campaigns c
         LEFT JOIN campaign_meta cm ON cm.campaign_id = c.id
         WHERE c.id=$1`,
        [campaignId]
      ),
      pool.query(
        `SELECT pt.id as timeline_id, pt.name as timeline_name,
                cp.id as player_id, cp.player_name,
                pte.id as entry_id, pte.title, pte.description,
                pte.location, pte.year, pte.day_of_year, pte.duration_days,
                pte.player_ids, pte.manual_links
         FROM player_timelines pt
         JOIN campaign_players cp ON pt.player_id = cp.id
         LEFT JOIN player_timeline_entries pte ON pte.timeline_id = pt.id
         WHERE pt.campaign_id=$1
           AND cp.is_dm_player = false
         ORDER BY cp.player_name, pt.name, pte.year ASC, pte.day_of_year ASC`,
        [campaignId]
      )
    ]);

    res.json({
      campaign_name: metaR.rows[0]?.name || 'Campaign',
      calendar_type: metaR.rows[0]?.calendar_type || 'harptos',
      rows: entriesR.rows
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Page route — serves timeline.html which detects the token and enters public mode
app.get('/timeline-public/:token', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'timeline.html'));
});

app.get('/npc-sheet', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'npc-sheet.html'));
});

app.get('/item-cards', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'item-cards.html'));
});

app.get('/split-view', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'split-view.html'));
});

app.get('/timeline', requireRolePage(['dm', 'player']), (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'timeline.html'));
});

app.get('/pdf-viewer', requireRolePage(['dm']), (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pdf-viewer.html'));
});

app.get('/manage-campaigns', requireRolePage(['dm']), (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'manage-campaigns.html'));
});

app.get('/user-panel', requireRolePage(['admin']), (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'user-panel.html'));
});

app.get('/pc-sheet', requireRolePage(['dm', 'player']), (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pc-sheet.html'));
});

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

app.get('/pc-public/:playerToken', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pc-public.html'));
});

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
app.patch('/api/journey-maps/:id/scope', requireRole(['dm']), async (req, res) => {
  try {
    if (!await dmOwnsMap(req.params.id, req.session.userId))
      return res.status(403).json({ error: 'Access denied' });
    const { scope_type, scope_location_id } = req.body;
    const result = await pool.query(
      'UPDATE journey_maps SET scope_type=$1, scope_location_id=$2 WHERE id=$3 RETURNING id, scope_type, scope_location_id',
      [scope_type || 'continent', scope_location_id || null, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

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
      `SELECT jml.*, cl.size_type, lm.name AS linked_map_name
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
  const { campaign_location_id, name, x, y, polygon, linked_map_id } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  try {
    const r = await pool.query(
      'INSERT INTO journey_map_locations (map_id, campaign_location_id, name, x, y, polygon, linked_map_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [req.params.id, campaign_location_id || null, name, x ?? 50, y ?? 50, polygon ? JSON.stringify(polygon) : null, linked_map_id || null]
    );
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/journey-maps/:id/locations/:locId', requireRole(['dm']), async (req, res) => {
  const { x, y, polygon, linked_map_id } = req.body;
  try {
    const r = await pool.query(
      'UPDATE journey_map_locations SET x=$1, y=$2, polygon=$3, linked_map_id=$4 WHERE id=$5 AND map_id=$6 RETURNING *',
      [x, y, polygon !== undefined ? JSON.stringify(polygon) : null, linked_map_id !== undefined ? (linked_map_id || null) : null, req.params.locId, req.params.id]
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
app.get('/api/journey-maps/:id/trackers', requireRole(['dm']), async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM journey_trackers WHERE map_id=$1 ORDER BY created_at ASC', [req.params.id]);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/journey-maps/:id/trackers', requireRole(['dm']), async (req, res) => {
  const { name, type, color } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  try {
    const r = await pool.query(
      'INSERT INTO journey_trackers (map_id, name, type, color) VALUES ($1,$2,$3,$4) RETURNING *',
      [req.params.id, name, type || 'group', color || '#c9a84c']
    );
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/journey-maps/:id/trackers/:tid', requireRole(['dm']), async (req, res) => {
  try {
    await pool.query('DELETE FROM journey_trackers WHERE id=$1 AND map_id=$2', [req.params.tid, req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Paths ──
app.get('/api/journey-maps/:id/paths', requireRole(['dm']), async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT jp.*,
              COALESCE(jt.name,  jp.tracker_name_override)  AS tracker_name,
              COALESCE(jt.color, jp.tracker_color_override) AS tracker_color,
              jt.type AS tracker_type
       FROM journey_paths jp
       LEFT JOIN journey_trackers jt ON jp.tracker_id = jt.id
       WHERE jp.map_id=$1 ORDER BY jp.created_at ASC`,
      [req.params.id]
    );
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/journey-maps/:id/paths', requireRole(['dm']), async (req, res) => {
  const { tracker_id, tracker_color, tracker_name, name, waypoints, notes } = req.body;
  try {
    const r = await pool.query(
      `INSERT INTO journey_paths
         (map_id, tracker_id, tracker_color_override, tracker_name_override, name, waypoints, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.params.id, tracker_id || null,
      tracker_color || null, tracker_name || null,
      name || 'Path', JSON.stringify(waypoints || []),
      notes || null, req.session.userId]
    );
    const row = r.rows[0];
    row.tracker_color = row.tracker_color_override || row.tracker_color || '#c9a84c';
    row.tracker_name = row.tracker_name_override || row.tracker_name || null;
    res.json(row);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/journey-maps/:id/paths/:pid', requireRole(['dm']), async (req, res) => {
  const { name, waypoints, notes } = req.body;
  try {
    const r = await pool.query(
      'UPDATE journey_paths SET name=$1, waypoints=$2, notes=$3 WHERE id=$4 AND map_id=$5 RETURNING *',
      [name, JSON.stringify(waypoints), notes || null, req.params.pid, req.params.id]
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
app.get('/api/journey-map-public/:token', async (req, res) => {
  try {
    const share = await pool.query('SELECT map_id FROM journey_map_shares WHERE token=$1', [req.params.token]);
    if (!share.rows.length) return res.status(404).json({ error: 'Map not found' });
    const mapId = share.rows[0].map_id;

    const [mapR, locsR, distsR, trkR, pathsR] = await Promise.all([
      pool.query('SELECT id, name, description, map_image FROM journey_maps WHERE id=$1', [mapId]),
      pool.query(`SELECT jml.id, jml.name, jml.x, jml.y, jml.polygon, cl.description AS location_description, cl.size_type
                  FROM journey_map_locations jml
                  LEFT JOIN campaign_locations cl ON cl.id = jml.campaign_location_id
                  WHERE jml.map_id=$1 ORDER BY jml.created_at ASC`, [mapId]),
      pool.query('SELECT from_loc_id, to_loc_id, distance_miles FROM journey_distances WHERE map_id=$1', [mapId]),
      pool.query('SELECT id, name, type, color FROM journey_trackers WHERE map_id=$1', [mapId]),
      pool.query(
        `SELECT jp.id, jp.name, jp.waypoints, jp.distance_miles, jp.notes,
                jt.name AS tracker_name, jt.color AS tracker_color, jt.type AS tracker_type
         FROM journey_paths jp LEFT JOIN journey_trackers jt ON jp.tracker_id=jt.id
         WHERE jp.map_id=$1 ORDER BY jp.created_at ASC`, [mapId])
    ]);
    if (!mapR.rows.length) return res.status(404).json({ error: 'Map not found' });

    // Collect all unique event IDs referenced in waypoints across all paths
    const allEventIds = new Set();
    pathsR.rows.forEach(p => {
      const wpts = Array.isArray(p.waypoints) ? p.waypoints : JSON.parse(p.waypoints || '[]');
      wpts.forEach(w => {
        (w.eventIds || (w.eventId ? [w.eventId] : [])).forEach(id => allEventIds.add(id));
      });
    });

    // Fetch full event details for those IDs (with player names via campaign_players)
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

    res.json({
      map: mapR.rows[0],
      locations: locsR.rows,
      distances: distsR.rows,
      trackers: trkR.rows,
      paths: pathsR.rows,
      events: eventsById
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Page routes ──
app.get('/journey-map', requireRole(['dm']), (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'journey-map.html'));
});

app.get('/journey-map-public/:token', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'journey-map-public.html'));
});

// ============================================
// PDF API
// ============================================

app.get('/api/pdfs', requireRole(['dm']), async (req, res) => {
  const pdfsDir = path.join(__dirname, 'pdfs');

  try {
    const files = await fs.readdir(pdfsDir);
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
      pool.query('SELECT id, name, description, is_public, size_type, parent_id FROM campaign_locations WHERE campaign_id=$1 ORDER BY created_at ASC', [id]),
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
      const [charRes, statsRes, notesRes, relsRes] = await Promise.all([
        pool.query('SELECT name, picture_url, picture_data, story, traits, flaws, goals, public_info, private_info FROM pc_characters WHERE player_id=$1', [p.id]),
        pool.query('SELECT stats_json FROM pc_char_stats WHERE player_id=$1', [p.id]),
        pool.query('SELECT content, dm_visible FROM pc_dm_notes WHERE character_id=(SELECT id FROM pc_characters WHERE player_id=$1) ORDER BY created_at ASC', [p.id]),
        pool.query('SELECT id, name, relation_type, link, is_family, is_dm_only, parent_id FROM pc_relationships WHERE character_id=(SELECT id FROM pc_characters WHERE player_id=$1) ORDER BY created_at ASC', [p.id]),
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
      const [jLocsRes, jDistRes, jTrkRes, jPathsRes] = await Promise.all([
        pool.query(
          `SELECT jml.id, jml.name, jml.x, jml.y, jml.polygon, jml.campaign_location_id, jml.linked_map_id,
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
        pool.query('SELECT name, type, color FROM journey_trackers WHERE map_id=$1 ORDER BY created_at ASC', [m.id]),
        pool.query(
          `SELECT jp.name, jp.notes, jp.distance_miles, jp.waypoints, jt.name as tracker_name
           FROM journey_paths jp
           LEFT JOIN journey_trackers jt ON jt.id = jp.tracker_id
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
          campaign_location_ref: l.campaign_location_id ? (locRefById[l.campaign_location_id] || null) : null,
          linked_map_ref: l.linked_map_name || null,
        })),
        distances: jDistRes.rows.map(d => ({ from_ref: d.from_loc_name, to_ref: d.to_loc_name, distance_miles: d.distance_miles })),
        trackers: jTrkRes.rows.map(t => ({ name: t.name, type: t.type, color: t.color })),
        paths: jPathsRes.rows.map(p => {
          const waypoints = Array.isArray(p.waypoints) ? p.waypoints : JSON.parse(p.waypoints || '[]');
          return {
            name: p.name || null, notes: p.notes || null, distance_miles: p.distance_miles || null,
            tracker_ref: p.tracker_name || null,
            waypoints: waypoints.map(w => ({
              x: w.x, y: w.y,
              loc_ref: w.locId ? (jLocRefById[w.locId] || null) : null,
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

    res.json({
      version: 3,
      exported_at: new Date().toISOString(),
      type: 'campaign',
      campaign: {
        name: campaign.name, description: campaign.description || '',
        calendar_type: metaRes.rows[0]?.calendar_type || 'harptos',
        today_marker: metaRes.rows[0]?.today_marker || null,
      },
      npcs: npcsRes.rows.map(n => n.name),
      locations: locsOut,
      players: playersOut,
      cross_connections: crossOut,
      journey_maps: mapsOut,
      dm_timelines: dmTimelinesOut,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Import a full campaign snapshot — creates everything fresh, resolves all refs to new DB IDs
app.post('/api/campaigns/import', requireRole(['dm']), async (req, res) => {
  const bundle = req.body;
  if (bundle.type !== 'campaign') return res.status(400).json({ error: 'Not a campaign export file' });
  const { campaign, players = [], locations = [], npcs = [], cross_connections = [], journey_maps = [], dm_timelines = [] } = bundle;
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

    // 2. NPCs
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
        `INSERT INTO campaign_locations (campaign_id, name, description, is_public, size_type)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (campaign_id, LOWER(name)) DO UPDATE SET name=EXCLUDED.name
         RETURNING id`,
        [newId, l.name, l.description || null, l.is_public !== false, l.size_type || null]
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
          'INSERT INTO journey_map_locations (map_id, campaign_location_id, name, x, y, polygon) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
          [mapId, l.campaign_location_ref ? (locIdByRef[l.campaign_location_ref] || null) : null,
            l.name, l.x ?? 50, l.y ?? 50, l.polygon ? JSON.stringify(l.polygon) : null]
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
      const trackerIdByRef = {};
      for (const t of (m.trackers || [])) {
        const tRes = await client.query(
          'INSERT INTO journey_trackers (map_id, name, type, color) VALUES ($1,$2,$3,$4) RETURNING id',
          [mapId, t.name, t.type || 'group', t.color || '#c9a84c']
        );
        trackerIdByRef[t.name] = tRes.rows[0].id;
      }
      for (const p of (m.paths || [])) {
        const waypoints = (p.waypoints || []).map(w => ({
          x: w.x, y: w.y,
          locId: w.loc_ref ? (jLocIdByRef[w.loc_ref] || null) : null,
          ...(w.eventIds ? { eventIds: w.eventIds } : {}),
          ...(w.eventTitles ? { eventTitles: w.eventTitles } : {}),
        }));
        await client.query(
          'INSERT INTO journey_paths (map_id, tracker_id, name, notes, distance_miles, waypoints, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7)',
          [mapId, p.tracker_ref ? (trackerIdByRef[p.tracker_ref] || null) : null,
            p.name || null, p.notes || null, p.distance_miles || null, JSON.stringify(waypoints), req.session.userId]
        );
      }
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

// Export a full PC sheet (character, relationships, stats, dm-notes)
app.get('/api/pc/:playerId/export', requireRole(['dm', 'player']), async (req, res) => {
  const { playerId } = req.params;
  const isPrivileged = ['dm', 'admin'].includes(req.session.role);
  try {
    if (!await canAccessPC(req.session.userId, req.session.role, playerId))
      return res.status(403).json({ error: 'Access denied' });

    const [charRes, relRes, statsRes, notesRes, playerRes] = await Promise.all([
      pool.query('SELECT * FROM pc_characters WHERE player_id=$1', [playerId]),
      pool.query(
        `SELECT name, relation_type, link, is_family FROM pc_relationships
         WHERE character_id = (SELECT id FROM pc_characters WHERE player_id=$1)
         ORDER BY created_at ASC`, [playerId]
      ),
      pool.query('SELECT stats_json FROM pc_char_stats WHERE player_id=$1', [playerId]),
      pool.query(
        `SELECT content, dm_visible FROM pc_dm_notes
         WHERE character_id = (SELECT id FROM pc_characters WHERE player_id=$1)
         ${isPrivileged ? '' : 'AND dm_visible = true'}
         ORDER BY created_at ASC`, [playerId]
      ),
      pool.query('SELECT player_name FROM campaign_players WHERE id=$1', [playerId]),
    ]);

    const char = charRes.rows[0] || {};
    res.json({
      version: 1,
      exported_at: new Date().toISOString(),
      type: 'pc-sheet',
      player_name: playerRes.rows[0]?.player_name || '',
      character: {
        name: char.name || '',
        picture_url: char.picture_url || '',
        story: char.story || '',
        traits: char.traits || '',
        flaws: char.flaws || '',
        goals: char.goals || '',
        public_info: char.public_info || '',
        private_info: isPrivileged ? (char.private_info || '') : '',
      },
      relationships: relRes.rows,
      stats: statsRes.rows[0]?.stats_json || {},
      dm_notes: notesRes.rows,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Import a PC sheet into an existing player slot — overwrites character + relationships + stats, appends DM notes
app.post('/api/pc/:playerId/import', requireRole(['dm', 'player']), async (req, res) => {
  const { playerId } = req.params;
  const bundle = req.body;
  if (bundle.type !== 'pc-sheet') return res.status(400).json({ error: 'Not a pc-sheet export file' });

  try {
    if (!await canAccessPC(req.session.userId, req.session.role, playerId))
      return res.status(403).json({ error: 'Access denied' });

    const { character = {}, relationships = [], stats = {}, dm_notes = [] } = bundle;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Upsert character
      const existing = await client.query('SELECT id FROM pc_characters WHERE player_id=$1', [playerId]);
      let charId;
      if (existing.rows.length) {
        charId = existing.rows[0].id;
        await client.query(
          `UPDATE pc_characters SET name=$1, picture_url=$2, story=$3, traits=$4,
           flaws=$5, goals=$6, public_info=$7, private_info=$8, updated_at=CURRENT_TIMESTAMP
           WHERE id=$9`,
          [character.name || '', character.picture_url || '', character.story || '',
          character.traits || '', character.flaws || '', character.goals || '',
          character.public_info || '', character.private_info || '', charId]
        );
      } else {
        const ins = await client.query(
          `INSERT INTO pc_characters (player_id, name, picture_url, story, traits, flaws, goals, public_info, private_info)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
          [playerId, character.name || '', character.picture_url || '', character.story || '',
            character.traits || '', character.flaws || '', character.goals || '',
            character.public_info || '', character.private_info || '']
        );
        charId = ins.rows[0].id;
      }

      // Replace relationships
      await client.query('DELETE FROM pc_relationships WHERE character_id=$1', [charId]);
      for (const r of relationships) {
        await client.query(
          'INSERT INTO pc_relationships (character_id, name, relation_type, link, is_family) VALUES ($1,$2,$3,$4,$5)',
          [charId, r.name, r.relation_type, r.link || '', r.is_family || false]
        );
      }

      // Upsert stats
      if (stats && Object.keys(stats).length) {
        await client.query(
          `INSERT INTO pc_char_stats (player_id, stats_json, updated_at) VALUES ($1,$2,CURRENT_TIMESTAMP)
           ON CONFLICT (player_id) DO UPDATE SET stats_json=$2, updated_at=CURRENT_TIMESTAMP`,
          [playerId, JSON.stringify(stats)]
        );
      }

      // Append DM notes (do not wipe existing notes)
      for (const n of dm_notes) {
        await client.query(
          'INSERT INTO pc_dm_notes (character_id, content, dm_visible) VALUES ($1,$2,$3)',
          [charId, n.content || '', n.dm_visible ?? true]
        );
      }

      await client.query('COMMIT');
      res.json({ success: true });
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

    await pool.query(`
      CREATE TABLE IF NOT EXISTS campaign_timeline_shares (
        id          SERIAL PRIMARY KEY,
        campaign_id INTEGER NOT NULL UNIQUE REFERENCES campaigns(id) ON DELETE CASCADE,
        token       VARCHAR(255) NOT NULL UNIQUE,
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
    // Migrate: add timeline_id to player_timeline_entries if missing
    await pool.query(`
      ALTER TABLE player_timeline_entries ADD COLUMN IF NOT EXISTS timeline_id INTEGER REFERENCES player_timelines(id) ON DELETE CASCADE;
    `);
    // Migrate: add player_ids to player_timeline_entries if it doesn't exist
    await pool.query(`
      ALTER TABLE player_timeline_entries ADD COLUMN IF NOT EXISTS player_ids TEXT[] DEFAULT '{}';
      ALTER TABLE pc_characters ADD COLUMN IF NOT EXISTS picture_data TEXT;
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

    console.log('✓ Database initialized');
  } catch (error) {
    console.error('✗ Database error:', error.message);
    process.exit(1);
  }
}

app.listen(PORT, async () => {
  await initializeDatabase();
  console.log(`\n🎲 D&D Tools running at http://localhost:${PORT}`);
  console.log(`\n📋 Page routes:`);
  console.log(`  🔓 Public    : /npc-sheet, /item-cards, /split-view`);
  console.log(`  🔓 Public    : /timeline-public/:token, /journey-map-public/:token, /pc-public/:token`);
  console.log(`  🎭 Player/DM : /timeline, /pc-sheet`);
  console.log(`  👑 DM        : /manage-campaigns, /journey-map, /pdf-viewer`);
  console.log(`  🛠️ Admin     : /user-panel`);
  console.log(`\n🔌 API groups:`);
  console.log(`  /api/auth/*                       Auth (login, logout, change-password)`);
  console.log(`  /api/users/*                      User management (admin)`);
  console.log(`  /api/campaigns/*                  Campaigns, players, locations, meta`);
  console.log(`  /api/player-timelines/*           Timeline CRUD`);
  console.log(`  /api/timeline-private/*           Private player journals`);
  console.log(`  /api/timeline-public/:token       Public read-only timeline`);
  console.log(`  /api/pc/*                         PC sheets, relationships, DM notes`);
  console.log(`  /api/pc-public/:token             Public read-only PC sheet`);
  console.log(`  /api/journey-maps/*               Journey maps, locations, paths, trackers`);
  console.log(`  /api/journey-map-public/:token    Public read-only journey map`);
  console.log(`  /api/pdfs                         PDF file listing`);
  console.log(`  /api/proxy-image                  External image proxy`);
});
