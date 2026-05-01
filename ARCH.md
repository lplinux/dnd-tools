# Architecture

## Overview

D&D Campaign Tools is a full-stack Node.js/Express application backed by PostgreSQL. The server handles authentication, session management, and a REST API. All UI is server-rendered HTML with vanilla JavaScript — no frontend framework, no build step.

```
┌──────────────────────────────────────────────────┐
│                  Browser (client)                 │
│                                                   │
│  ┌────────────┐  ┌──────────────┐  ┌──────────┐  │
│  │  Timeline  │  │ Journey Map  │  │ PC Sheet │  │
│  │  (SPA)     │  │  (SPA)       │  │  (SPA)   │  │
│  └─────┬──────┘  └──────┬───────┘  └────┬─────┘  │
│        │  fetch/REST     │               │        │
└────────┼─────────────────┼───────────────┼────────┘
         │ HTTP             │               │
┌────────┼─────────────────┼───────────────┼────────┐
│        ▼      Node.js / Express           ▼        │
│  ┌─────────────────────────────────────────────┐   │
│  │  app.js  – port 3080                        │   │
│  │  • Session auth (express-session + bcrypt)  │   │
│  │  • REST API  (/api/*)                       │   │
│  │  • Static files  (public/)                  │   │
│  │  • PDF serving   (pdfs/)                    │   │
│  └────────────────────┬────────────────────────┘   │
│                       │ pg (node-postgres)          │
│  ┌────────────────────▼────────────────────────┐   │
│  │              PostgreSQL                     │   │
│  └─────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────┘
```

---

## Server (`app.js`)

| Concern | Implementation |
|---|---|
| Framework | Express 5 |
| Port | `process.env.PORT` (default 3080) |
| Auth | Session-based (`express-session` + `bcryptjs`) |
| Database | PostgreSQL via `pg` |
| Static files | `express.static('public')` |
| PDF serving | `express.static('pdfs')` on `/pdfs` |
| Schema init | `initializeDatabase()` runs on startup |
| Role enforcement | `requireAuth`, `requireRole([...])`, `requireRolePage([...])` middleware |

### Roles

| Role | Capabilities |
|---|---|
| `admin` | User management, all DM capabilities |
| `dm` | Campaign CRUD, journey maps, timelines, PC management |
| `player` | Own PC sheet, own timeline, read-only campaign data |

---

## Database schema

### Users & auth

```
users
  id, username, password_hash, role, created_at

sessions  (managed by connect-pg-simple)
```

### Campaigns

```
campaigns
  id, name, description, calendar_type, created_by, created_at

campaign_meta
  campaign_id (FK), today_marker, public_token

campaign_players
  id, campaign_id (FK), player_name, user_id (FK nullable), created_at

campaign_locations
  id, campaign_id (FK), name, description, created_at
```

### Player Characters

```
player_characters
  id, campaign_player_id (FK), sheet_data (JSONB), updated_at

pc_relationships
  id, player_id (FK), target_name, relationship_type, description

pc_dm_notes
  id, player_id (FK), title, content, created_by, created_at

pc_public_tokens
  player_id (FK), token, created_at
```

### Timelines

```
player_timelines
  id, campaign_id (FK), player_id (FK), name, created_at

player_timeline_entries
  id, timeline_id (FK), title, content, abs_day, created_by, created_at
```

### Journey Maps

```
journey_maps
  id, campaign_id (FK), name, description, map_image (TEXT/base64),
  created_by, created_at

journey_map_locations
  id, map_id (FK), campaign_location_id (FK nullable), name, x, y, created_at

journey_distances
  map_id (FK), from_loc_id (FK), to_loc_id (FK), distance_miles
  UNIQUE (map_id, from_loc_id, to_loc_id)

journey_trackers
  id, map_id (FK), name, type (group|player|npc), color, created_at

journey_paths
  id, map_id (FK), tracker_id (FK nullable), tracker_color_override,
  tracker_name_override, name, waypoints (JSONB), distance_miles, notes,
  created_by, created_at

journey_map_shares
  map_id (FK UNIQUE), token, created_at
```

### Waypoint JSONB shape

Each element in `journey_paths.waypoints`:

```jsonc
{
  "x": 42.5,      // % of image width  (0–100)
  "y": 31.0,      // % of image height (0–100)
  "locId": 17     // journey_map_locations.id — null/absent if not linked
}
```

When a waypoint is drawn on or snapped to an existing map pin, `locId` is set automatically. When drawn on empty space, a new `campaign_location` and `journey_map_location` are created and their IDs stored here.

---

## API routes

### Auth

| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/api/auth/login` | — | Login |
| POST | `/api/auth/logout` | auth | Logout |
| POST | `/api/auth/change-password` | auth | Change own password |
| GET | `/api/auth/user` | — | Current session user |
| POST | `/api/hash-ids` | auth | Utility: bcrypt hash |

### Users

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/api/users` | admin/dm | List all users |
| POST | `/api/users` | admin | Create user |
| PUT | `/api/users/:id/role` | admin | Change role |
| PUT | `/api/users/:id/password` | admin | Reset password |
| DELETE | `/api/users/:id` | admin | Delete user |

### Campaigns

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/api/campaigns` | auth | List campaigns |
| POST | `/api/campaigns` | dm | Create campaign |
| DELETE | `/api/campaigns/:id` | dm | Delete campaign |
| GET | `/api/campaigns/:id/players` | dm/player | List players |
| POST | `/api/campaigns/:id/players` | dm | Add player |
| DELETE | `/api/campaigns/:id/players/:pid` | admin/dm | Remove player |
| GET | `/api/campaigns/:id/locations` | dm/player | List locations |
| POST | `/api/campaigns/:id/locations` | dm | Create location |
| PUT | `/api/campaigns/:id/locations/:lid` | dm | Update location name/desc |
| DELETE | `/api/campaigns/:id/locations/:lid` | dm | Delete location |
| GET | `/api/campaigns/:id/meta` | dm/player | Get campaign meta (today marker, etc.) |
| PUT | `/api/campaigns/:id/meta` | dm | Update campaign meta |
| GET | `/api/campaigns/:id/timelines` | dm | List player timelines |
| GET | `/api/campaigns/:id/public-token` | dm/admin | Get/create public share token |

### Timelines

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/api/player-timelines/:campaignId/all` | auth | All timelines for campaign |
| GET | `/api/player-timelines/:campaignId/:playerId` | auth | Player's timelines |
| POST | `/api/player-timelines/:campaignId/:playerId` | auth | Create timeline |
| GET | `/api/player-timelines/:timelineId/entries` | auth | Timeline entries |
| POST | `/api/player-timelines/:timelineId/entries` | auth | Add entry |
| PUT | `/api/player-timelines/:timelineId/entries/:eid` | auth | Edit entry |
| DELETE | `/api/player-timelines/:timelineId/entries/:eid` | auth | Delete entry |
| DELETE | `/api/player-timelines/:timelineId` | auth | Delete timeline |
| GET | `/api/timeline-private/:campaignId` | admin/dm | Combined DM view |
| GET | `/api/timeline-private/:campaignId/:playerId` | auth | Player's private timeline |
| POST | `/api/timeline-private/:campaignId/:playerId` | dm/player | Add private entry |
| PUT | `/api/timeline-private/:campaignId/:playerId/:eid` | dm/player | Edit private entry |
| DELETE | `/api/timeline-private/:campaignId/:playerId/:eid` | dm/player | Delete private entry |
| GET | `/api/timeline-private/:campaignId/players-summary` | dm | Players summary |
| GET | `/api/timeline-public/:token` | — | Public read-only data |

### Player Characters

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/api/pc/:playerId` | auth | Get PC sheet data |
| PUT | `/api/pc/:playerId` | auth | Save PC sheet data |
| GET | `/api/pc/:playerId/relationships` | auth | PC relationships |
| POST | `/api/pc/:playerId/relationships` | auth | Add relationship |
| DELETE | `/api/pc/:playerId/relationships/:rid` | auth | Remove relationship |
| GET | `/api/pc/:playerId/dm-notes` | auth | DM notes for PC |
| POST | `/api/pc/:playerId/dm-notes` | dm | Add DM note |
| PUT | `/api/pc/:playerId/dm-notes/:nid` | dm | Edit DM note |
| DELETE | `/api/pc/:playerId/dm-notes/:nid` | dm | Delete DM note |
| GET | `/api/pc/:playerId/public-token` | dm/player | Get/create public token |
| GET | `/api/pc-public/:token` | — | Public PC sheet data |

### Journey Maps

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/api/campaigns/:id/journey-maps` | dm | List maps for campaign |
| POST | `/api/campaigns/:id/journey-maps` | dm | Create map |
| DELETE | `/api/journey-maps/:id` | dm | Delete map |
| GET | `/api/journey-maps/:id/image` | dm | Get map background image |
| PUT | `/api/journey-maps/:id/image` | dm | Upload/clear map image |
| GET | `/api/journey-maps/:id/locations` | dm | List pinned locations |
| POST | `/api/journey-maps/:id/locations` | dm | Pin a location |
| PUT | `/api/journey-maps/:id/locations/:lid` | dm | Move pin (x, y) |
| DELETE | `/api/journey-maps/:id/locations/:lid` | dm | Remove pin |
| GET | `/api/journey-maps/:id/distances` | dm | Location distance matrix |
| PUT | `/api/journey-maps/:id/distances` | dm | Set distance between two locations |
| GET | `/api/journey-maps/:id/trackers` | dm | List trackers |
| POST | `/api/journey-maps/:id/trackers` | dm | Create tracker |
| DELETE | `/api/journey-maps/:id/trackers/:tid` | dm | Delete tracker |
| GET | `/api/journey-maps/:id/paths` | dm | List paths |
| POST | `/api/journey-maps/:id/paths` | dm | Save new path |
| PUT | `/api/journey-maps/:id/paths/:pid` | dm | Update path |
| DELETE | `/api/journey-maps/:id/paths/:pid` | dm | Delete path |
| POST | `/api/journey-maps/:id/share` | dm | Create public share token |
| GET | `/api/journey-map-public/:token` | — | Public read-only map data |

### Misc

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/api/pdfs` | dm | List PDF files in `pdfs/` |
| GET | `/api/proxy-image` | auth | Proxy external image URLs |

---

## Page routes

| Path | File | Access |
|---|---|---|
| `/` | `index.html` | Public |
| `/timeline` | `timeline.html` | DM, Player |
| `/timeline-public/:token` | `timeline.html` | Public |
| `/journey-map` | `journey-map.html` | DM |
| `/journey-map-public/:token` | `journey-map-public.html` | Public |
| `/manage-campaigns` | `manage-campaigns.html` | DM |
| `/pc-sheet` | `pc-sheet.html` | DM, Player |
| `/pc-public/:token` | `pc-public.html` | Public |
| `/npc-sheet` | `npc-sheet.html` | Public |
| `/item-cards` | `item-cards.html` | Public |
| `/pdf-viewer` | `pdf-viewer.html` | DM |
| `/split-view` | `split-view.html` | Public |
| `/user-panel` | `user-panel.html` | Admin |

---

## Calendar systems

| System | Year length | Months | Notes |
|---|---|---|---|
| Harptos (Faerûn) | 365 days | 12 × 30-day months + 5 festival days | No leap years |
| Gregorian | 365/366 days | Standard 12 months | Standard leap years |

Absolute day indices (`absDay`) are computed from epoch (year 1, day 1) so events across any era share the same axis.

---

## Container

The Dockerfile uses a multi-step approach:

1. `node:20-alpine` base (~50 MB compressed)
2. `npm ci --omit=dev` installs only production dependencies
3. A non-root `dnd` user runs the process

```
/app
├── app.js
├── node_modules/   (production only)
├── public/
└── pdfs/           ← bind-mount from host
```

The container exposes port `3080`. PostgreSQL is expected as an external service (not bundled in the image). Use `docker-compose.yml` for a complete local stack with a managed Postgres container.

---

## Extending

**Adding a new tool:**

1. Create `public/my-tool.html`
2. Add a route in `app.js`:
   ```js
   app.get('/my-tool', requireRolePage(['dm']), (req, res) =>
     res.sendFile(path.join(__dirname, 'public', 'my-tool.html')));
   ```
3. Add a link in `public/index.html`
4. Rebuild the Docker image if running containerised.

**Adding new API endpoints:**

Follow the pattern used throughout `app.js` — `requireRole([...])` middleware for access control, `pool.query(...)` for DB access, always return `res.status(500).json({ error: e.message })` on failure.
