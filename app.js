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
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/pdfs', express.static(path.join(__dirname, 'pdfs')));

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
       WHERE cp.campaign_id = $1 ORDER BY cp.created_at DESC`,
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
    await pool.query(
      'DELETE FROM campaign_players WHERE id = $1 AND campaign_id = $2',
      [playerId, campaignId]
    );

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
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
              pte.location, pte.year, pte.day_of_year, pte.duration_days
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
  const { title, description, location, year, day_of_year, duration_days, player_ids } = req.body;
  try {
    const tl = await pool.query('SELECT * FROM player_timelines WHERE id=$1', [timelineId]);
    if (!tl.rows.length) return res.status(404).json({ error: 'Not found' });
    const t = tl.rows[0];
    if (!await canAccessTimeline(req.session.userId, req.session.role, t.campaign_id, t.player_id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const updatePids = player_ids && player_ids.length ? player_ids : null;
    const result = await pool.query(
      `UPDATE player_timeline_entries
       SET title=$1, description=$2, location=$3, year=$4, day_of_year=$5,
           duration_days=$6, player_ids=COALESCE($7, player_ids), updated_at=CURRENT_TIMESTAMP
       WHERE id=$8 AND timeline_id=$9 RETURNING *`,
      [title, description || null, location || null, year, day_of_year,
        duration_days || 1, updatePids, entryId, timelineId]
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


// ============================================
// ROUTES
// ============================================

app.get('/npc-sheet', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'npc-sheet.html'));
});

app.get('/item-cards', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'item-cards.html'));
});

app.get('/split-view', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'split-view.html'));
});

app.get('/timeline', (req, res) => {
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
        `INSERT INTO pc_characters (player_id, name, picture_url, story, traits, flaws, goals, public_info, private_info)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [playerId, name, picture_url, story, traits, flaws, goals, public_info, private_info]
      );
    } else {
      result = await pool.query(
        `UPDATE pc_characters SET name=$1, picture_url=$2, story=$3, traits=$4, flaws=$5, goals=$6,
         public_info=$7, private_info=$8, updated_at=CURRENT_TIMESTAMP
         WHERE player_id=$9 RETURNING *`,
        [name, picture_url, story, traits, flaws, goals, public_info, private_info, playerId]
      );
    }
    res.json(result.rows[0]);
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
    if (charResult.rows.length === 0) return res.json([]);
    const result = await pool.query(
      'SELECT * FROM pc_relationships WHERE character_id = $1 ORDER BY created_at ASC',
      [charResult.rows[0].id]
    );
    res.json(result.rows);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// Add relationship
app.post('/api/pc/:playerId/relationships', requireAuth, async (req, res) => {
  const { playerId } = req.params;
  const { name, relation_type, link, is_family } = req.body;
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
    const result = await pool.query(
      'INSERT INTO pc_relationships (character_id, name, relation_type, link, is_family) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [charId, name, relation_type, link, is_family || false]
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
    await pool.query('DELETE FROM pc_relationships WHERE id = $1', [relId]);
    res.json({ success: true });
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
      'SELECT name, picture_url, public_info FROM pc_characters WHERE player_id = $1',
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
// CAMPAIGN LOCATIONS
// ============================================

app.get('/api/campaigns/:campaignId/locations', requireRole(['dm', 'player']), async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM campaign_locations WHERE campaign_id = $1 ORDER BY created_at ASC',
      [req.params.campaignId]
    );
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/campaigns/:campaignId/locations', requireRole(['dm']), async (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  try {
    const result = await pool.query(
      'INSERT INTO campaign_locations (campaign_id, name, description) VALUES ($1,$2,$3) RETURNING *',
      [req.params.campaignId, name, description || null]
    );
    res.json(result.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/campaigns/:campaignId/locations/:locationId', requireRole(['dm']), async (req, res) => {
  try {
    await pool.query('DELETE FROM campaign_locations WHERE id = $1 AND campaign_id = $2',
      [req.params.locationId, req.params.campaignId]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================
// CAMPAIGN META (today_marker, etc.)
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
      'SELECT id, name, description, created_at FROM journey_maps WHERE campaign_id=$1 ORDER BY created_at DESC',
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
      'INSERT INTO journey_maps (campaign_id, name, description, created_by) VALUES ($1,$2,$3,$4) RETURNING id, name, description, created_at',
      [req.params.campaignId, name, description || null, req.session.userId]
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
      'SELECT * FROM journey_map_locations WHERE map_id=$1 ORDER BY created_at ASC',
      [req.params.id]
    );
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/journey-maps/:id/locations', requireRole(['dm']), async (req, res) => {
  const { campaign_location_id, name, x, y } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  try {
    const r = await pool.query(
      'INSERT INTO journey_map_locations (map_id, campaign_location_id, name, x, y) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [req.params.id, campaign_location_id || null, name, x ?? 50, y ?? 50]
    );
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/journey-maps/:id/locations/:locId', requireRole(['dm']), async (req, res) => {
  const { x, y } = req.body;
  try {
    const r = await pool.query(
      'UPDATE journey_map_locations SET x=$1, y=$2 WHERE id=$3 AND map_id=$4 RETURNING *',
      [x, y, req.params.locId, req.params.id]
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
      `SELECT jp.*, jt.name AS tracker_name, jt.color AS tracker_color, jt.type AS tracker_type
       FROM journey_paths jp
       LEFT JOIN journey_trackers jt ON jp.tracker_id = jt.id
       WHERE jp.map_id=$1 ORDER BY jp.created_at ASC`,
      [req.params.id]
    );
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/journey-maps/:id/paths', requireRole(['dm']), async (req, res) => {
  const { tracker_id, name, waypoints, distance_miles, notes } = req.body;
  try {
    const r = await pool.query(
      'INSERT INTO journey_paths (map_id, tracker_id, name, waypoints, distance_miles, notes, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [req.params.id, tracker_id || null, name || 'Path', JSON.stringify(waypoints || []),
      distance_miles || null, notes || null, req.session.userId]
    );
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/journey-maps/:id/paths/:pid', requireRole(['dm']), async (req, res) => {
  const { name, waypoints, distance_miles, notes } = req.body;
  try {
    const r = await pool.query(
      'UPDATE journey_paths SET name=$1, waypoints=$2, distance_miles=$3, notes=$4 WHERE id=$5 AND map_id=$6 RETURNING *',
      [name, JSON.stringify(waypoints), distance_miles || null, notes || null, req.params.pid, req.params.id]
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
      pool.query('SELECT id, name, x, y FROM journey_map_locations WHERE map_id=$1 ORDER BY created_at ASC', [mapId]),
      pool.query('SELECT from_loc_id, to_loc_id, distance_miles FROM journey_distances WHERE map_id=$1', [mapId]),
      pool.query('SELECT id, name, type, color FROM journey_trackers WHERE map_id=$1', [mapId]),
      pool.query(
        `SELECT jp.id, jp.name, jp.waypoints, jp.distance_miles, jp.notes,
                jt.name AS tracker_name, jt.color AS tracker_color, jt.type AS tracker_type
         FROM journey_paths jp LEFT JOIN journey_trackers jt ON jp.tracker_id=jt.id
         WHERE jp.map_id=$1 ORDER BY jp.created_at ASC`, [mapId])
    ]);
    if (!mapR.rows.length) return res.status(404).json({ error: 'Map not found' });

    res.json({
      map: mapR.rows[0],
      locations: locsR.rows,
      distances: distsR.rows,
      trackers: trkR.rows,
      paths: pathsR.rows
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
    // Migrate: add calendar_type if it doesn't exist yet
    await pool.query(`
      ALTER TABLE campaign_meta ADD COLUMN IF NOT EXISTS calendar_type VARCHAR(20) DEFAULT 'harptos';
    `);
    // Migrate: add timeline_id to player_timeline_entries if missing
    await pool.query(`
      ALTER TABLE player_timeline_entries ADD COLUMN IF NOT EXISTS timeline_id INTEGER REFERENCES player_timelines(id) ON DELETE CASCADE;
    `);
    // Migrate: add player_ids to player_timeline_entries if it doesn't exist
    await pool.query(`
      ALTER TABLE player_timeline_entries ADD COLUMN IF NOT EXISTS player_ids TEXT[] DEFAULT '{}';
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

    console.log('✓ Database initialized');
  } catch (error) {
    console.error('✗ Database error:', error.message);
    process.exit(1);
  }
}

app.listen(PORT, async () => {
  await initializeDatabase();
  console.log(`\n🎲 D&D Tools v3 running at http://localhost:${PORT}`);
  console.log(`\n📋 Routes:`);
  console.log(`  🔓 Public: /npc-sheet, /item-cards, /split-view, /timeline`);
  console.log(`  🔐 Auth: /pc-sheet`);
  console.log(`  👑 DM: /manage-campaigns, /pdf-viewer`);
  console.log(`  🛠️ Admin: /user-panel`);
});
