-- ============================================================
-- D&D Tools — Complete Database Schema
-- Run once: psql -U dndtools -d dndtools -f init.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  email         VARCHAR(255),
  role          VARCHAR(50) DEFAULT 'player' CHECK (role IN ('admin','dm','player')),
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS campaigns (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(255) NOT NULL,
  description TEXT,
  dm_user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS campaign_players (
  id          SERIAL PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  player_name VARCHAR(255) NOT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS campaign_user_assignments (
  id         SERIAL PRIMARY KEY,
  player_id  INTEGER NOT NULL REFERENCES campaign_players(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id)            ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (player_id, user_id)
);

CREATE TABLE IF NOT EXISTS campaign_locations (
  id          SERIAL PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name        VARCHAR(255) NOT NULL,
  description TEXT,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- calendar_type is set at campaign creation and should not be changed.
-- today_marker stores a numeric absolute day: (year-1)*365 + day_of_year
CREATE TABLE IF NOT EXISTS campaign_meta (
  id            SERIAL PRIMARY KEY,
  campaign_id   INTEGER NOT NULL UNIQUE REFERENCES campaigns(id) ON DELETE CASCADE,
  today_marker  VARCHAR(255),
  calendar_type VARCHAR(20) DEFAULT 'harptos',
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Named player timelines — one player can have many timelines
CREATE TABLE IF NOT EXISTS player_timelines (
  id          SERIAL PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id)        ON DELETE CASCADE,
  player_id   INTEGER NOT NULL REFERENCES campaign_players(id) ON DELETE CASCADE,
  created_by  INTEGER NOT NULL REFERENCES users(id)            ON DELETE CASCADE,
  name        VARCHAR(255) NOT NULL DEFAULT 'My Timeline',
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Private timeline entries (always belong to a named player_timeline)
CREATE TABLE IF NOT EXISTS player_timeline_entries (
  id            SERIAL PRIMARY KEY,
  campaign_id   INTEGER NOT NULL REFERENCES campaigns(id)        ON DELETE CASCADE,
  player_id     INTEGER NOT NULL REFERENCES campaign_players(id) ON DELETE CASCADE,
  timeline_id   INTEGER          REFERENCES player_timelines(id) ON DELETE CASCADE,
  created_by    INTEGER NOT NULL REFERENCES users(id)            ON DELETE CASCADE,
  title         VARCHAR(255) NOT NULL,
  description   TEXT,
  location      VARCHAR(255),
  year          INTEGER NOT NULL DEFAULT 1492,
  day_of_year   INTEGER NOT NULL DEFAULT 1,
  duration_days INTEGER NOT NULL DEFAULT 1,
  manual_links  INTEGER[] DEFAULT '{}',
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ple_campaign  ON player_timeline_entries(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ple_player    ON player_timeline_entries(player_id);
CREATE INDEX IF NOT EXISTS idx_ple_timeline  ON player_timeline_entries(timeline_id);
CREATE INDEX IF NOT EXISTS idx_ple_order     ON player_timeline_entries(year, day_of_year);
CREATE INDEX IF NOT EXISTS idx_pt_player     ON player_timelines(campaign_id, player_id);

CREATE TABLE IF NOT EXISTS pc_characters (
  id           SERIAL PRIMARY KEY,
  player_id    INTEGER NOT NULL REFERENCES campaign_players(id) ON DELETE CASCADE,
  name         VARCHAR(255),
  picture_url  TEXT,
  story        TEXT,
  traits       TEXT,
  flaws        TEXT,
  goals        TEXT,
  public_info  TEXT,
  private_info TEXT,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pc_relationships (
  id            SERIAL PRIMARY KEY,
  character_id  INTEGER NOT NULL REFERENCES pc_characters(id) ON DELETE CASCADE,
  name          VARCHAR(255) NOT NULL,
  relation_type VARCHAR(100),
  link          TEXT,
  is_family     BOOLEAN DEFAULT false,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pc_dm_notes (
  id           SERIAL PRIMARY KEY,
  character_id INTEGER NOT NULL REFERENCES pc_characters(id) ON DELETE CASCADE,
  content      TEXT NOT NULL,
  dm_visible   BOOLEAN DEFAULT false,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- Safe migrations for existing installs
-- ============================================================
ALTER TABLE campaign_meta ADD COLUMN IF NOT EXISTS calendar_type VARCHAR(20) DEFAULT 'harptos';
ALTER TABLE player_timeline_entries ADD COLUMN IF NOT EXISTS timeline_id INTEGER REFERENCES player_timelines(id) ON DELETE CASCADE;

-- ============================================================
-- Seed: initial admin user
-- Generate: node -e "require('bcryptjs').hash('yourpass',10).then(console.log)"
-- ============================================================
-- INSERT INTO users (username, password_hash, email, role)
-- VALUES ('admin', '$2a$10$REPLACE_WITH_REAL_HASH', 'admin@example.com', 'admin')
-- ON CONFLICT (username) DO NOTHING;
