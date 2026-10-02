# Architecture

## Overview

D&D Campaign Tools is a full-stack application backed by PostgreSQL. The server (Node.js/Express) handles authentication, session management, and a REST API. The UI is a React 19 + Vite single-page app in `frontend/`, built to `public/app/` and served by Express (with a catch-all route) alongside the API.

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

> Source of truth: the idempotent `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE … ADD COLUMN
> IF NOT EXISTS` statements in `initializeDatabase()` (`app.js`). Columns added by later
> migrations are folded into the listings below.

### Users & auth

```
users
  id, username, password_hash, email, role (admin|dm|player), created_at

-- NOTE: there is no sessions table. express-session runs on its default
-- in-memory store, so every session is lost on restart and sessions are not
-- shared across processes. (An earlier draft of this doc claimed
-- connect-pg-simple; that package has never been a dependency.)
```

### Campaigns

```
campaigns
  id, name, description, dm_user_id (FK users), created_at

campaign_meta
  id, campaign_id (FK UNIQUE), today_marker, calendar_type (harptos|gregorian), updated_at

campaign_players
  id, campaign_id (FK), player_name, is_dm_player (bool), created_at

campaign_user_assignments        -- which user plays which player in a campaign
  id, player_id (FK campaign_players), user_id (FK users), created_at

campaign_locations
  id, campaign_id (FK), name, description,
  is_public (bool, default true), size_type, parent_id (FK self, nullable), created_at

campaign_npcs
  id, campaign_id (FK), name, created_at, UNIQUE (campaign_id, name)
  path_public (bool)  -- DEPRECATED / DORMANT: no longer read or written

campaign_timeline_shares
  id, campaign_id (FK UNIQUE), token (UNIQUE), created_at
```

### Diary

```
campaign_diary_entries
  id, campaign_id (FK campaigns), created_by (FK users), title, body,
  session_no, session_date, status ('draft'|'published'), published_at,
  created_at, updated_at
player_diary_entries
  id, campaign_id (FK campaigns), player_id (FK campaign_players),
  created_by (FK users), title, body, session_no, session_date,
  created_at, updated_at
campaign_diary_shares
  id, campaign_id (FK campaigns, UNIQUE), token (UNIQUE), created_at
```

### Player Characters

```
pc_characters
  id, player_id (FK campaign_players), name, picture_url, picture_data,
  story, traits, flaws, goals, public_info, private_info, created_at, updated_at

pc_char_stats
  id, player_id (FK campaign_players, UNIQUE), stats_json (JSONB), updated_at

pc_relationships
  id, character_id (FK pc_characters), name, relation_type, link, is_family (bool),
  is_dm_only (bool), created_by_role (player|dm), parent_id (FK self), status_label, created_at

pc_dm_notes
  id, character_id (FK pc_characters), content, dm_visible (bool), created_at

character_relationships          -- DM cross-entity graph (players/NPCs/relationships)
  id, campaign_id (FK),
  from_entity_type (player|npc|relationship), from_entity_id,
  to_entity_type (player|npc|relationship),   to_entity_id,
  label, notes, is_public (bool), created_at
```

### Timelines

```
player_timelines
  id, campaign_id (FK), player_id (FK campaign_players), created_by (FK users), name, created_at

player_timeline_entries
  id, campaign_id (FK), player_id (FK campaign_players, nullable), timeline_id (FK, nullable),
  created_by (FK users), title, description, location,
  year, day_of_year, duration_days,
  manual_links (INTEGER[]), player_ids (TEXT[], e.g. 'self_3','cp_7','rel_2','npc_5'),
  is_party (bool), created_at, updated_at
```

### Journey Maps

```
journey_maps
  id, campaign_id (FK), name, description, map_image (TEXT/base64),
  scope_type (continent|city), scope_location_id (FK campaign_locations, nullable),
  created_by (FK users), created_at

journey_map_locations
  id, map_id (FK), campaign_location_id (FK, nullable), name, x, y,
  polygon (JSONB, region vertices), linked_map_id (FK journey_maps, nullable),
  icon_scale (float, default 1), created_at

journey_distances
  id, map_id (FK), from_loc_id (FK), to_loc_id (FK), distance_miles
  UNIQUE (map_id, from_loc_id, to_loc_id)

journey_paths
  id, map_id (FK), name, waypoints (JSONB), distance_miles, notes,
  kind (path|route), route_type (road|flight|maritime), label_x, label_y,
  created_by (FK users), created_at
  tracker_id (FK journey_trackers, nullable), tracker_color_override, tracker_name_override
    -- tracker_id is vestigial: it is still written, but always as NULL.
    -- The two *_override columns are NOT dormant — they are read on every path
    -- fetch and aliased back to tracker_name / tracker_color for response-shape
    -- compatibility, so they carry a path's display name and colour.

journey_map_shares
  id, map_id (FK UNIQUE), token (UNIQUE), created_at

journey_trackers                 -- DEPRECATED / DORMANT: no longer read or written.
  id, map_id (FK), name, type (group|player|npc), color, player_id (FK, nullable), created_at
  -- Movement paths are now DERIVED from the timeline (Party / per-player / per-NPC);
  -- the table is retained only to avoid a destructive drop.
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
| POST | `/api/hash-ids` | auth | Utility: HMAC id → share token |

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
| GET | `/api/campaigns/:id/public-token` | dm/admin | Get/create public share token (whole campaign) |
| PUT | `/api/campaigns/:id/players/:pid/reassign` | dm | Reassign a player to another user |
| PUT | `/api/campaigns/:id/locations/:lid/image` | dm | Set/clear a location image |
| PATCH | `/api/campaigns/:id/locations/:lid/visibility` | dm | Toggle location visibility (cascades) |
| GET/POST | `/api/campaigns/:id/npcs` | dm/admin | List / add NPCs |
| DELETE | `/api/campaigns/:id/npcs/:npcId` | dm/admin | Delete an NPC |
| GET | `/api/campaigns/:id/char-tree` | dm/admin | Cross-entity relationship graph |
| POST/PATCH/DELETE | `/api/campaigns/:id/char-tree/connections[/:connId]` | dm/admin | Connection CRUD |
| PATCH | `/api/campaigns/:id/char-tree/connections/:connId/visibility` | dm/admin | Toggle connection visibility |
| POST | `/api/campaigns/:id/dm-player` | dm | Ensure the DM's own player row exists |

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
| PATCH | `/api/player-timelines/:timelineId/entries/:entryId/visibility` | dm/admin | Reveal/hide one event to players |
| PATCH | `/api/timeline-party/:campaignId/:entryId/visibility` | dm/admin | Same, for a party event |
| GET | `/api/player-timelines/:timelineId/public-token` | dm/admin | Share token scoped to ONE timeline |

**Event visibility.** `player_timeline_entries.visible_to_players` gates whether a
non-DM ever receives an event. It is filtered in SQL on every read path — the
per-timeline list, the party list and the public share — so a hidden event never
reaches the browser rather than merely going unrendered. A DM's new event starts
**hidden**; an event a player writes on their own timeline starts visible, since
defaulting that to hidden would stop a player seeing what they just typed.

**Two kinds of share token.** `campaign_timeline_shares` grants the whole
campaign (every player's timeline plus party events); `player_timeline_shares`
grants exactly one timeline and deliberately excludes party events, which are
campaign-wide. Both are resolved by `GET /api/timeline-public/:token`.
| GET | `/api/timeline-party/:cid` | auth | Party (campaign-wide) events |
| POST/PUT/DELETE | `/api/timeline-party/:cid[/:entryId]` | dm/admin | Party event CRUD |
| GET | `/api/timeline-public/:token` | — | Public read-only data |

> The former `/api/timeline-private/*` group was removed: the DM's private
> journal is just another `player_timelines` row, reached through the endpoints
> above.

### Diary

| Method | Path | Role | Description |
|---|---|---|---|
| GET/POST | `/api/campaign-diary/:campaignId` | dm/admin | List / create campaign diary entries |
| PUT/DELETE | `/api/campaign-diary/:campaignId/entries/:entryId` | dm/admin | Edit / delete an entry |
| PATCH | `/api/campaign-diary/:campaignId/entries/:entryId/status` | dm/admin | draft ↔ published |
| GET/DELETE | `/api/campaign-diary/:campaignId/share` | dm/admin | Get (stable) / revoke the public token |
| GET | `/api/campaign-diary/:campaignId/export` | dm/admin | Standalone `type: 'campaign-diary'` bundle |
| POST | `/api/campaign-diary/:campaignId/import` | dm/admin | **Replaces** the campaign's diary from a bundle |
| GET | `/api/player-diary/:campaignId/all` | dm/admin | Every player's diary, read-only |
| GET | `/api/player-diary/:campaignId/:playerId` | auth | One player's diary (owner or their DM) |
| POST/PUT/DELETE | `/api/player-diary/:campaignId/:playerId[/entries/:entryId]` | auth | Owner only |
| GET | `/api/diary-public/:token` | — | Published campaign entries, read-only |
| GET | `/api/campaign-diary/:campaignId/roster` | dm/admin | DM name + characters, portraits and public bios (printed book) |
| GET | `/api/diary-public/:token/roster` | — | Same, for a reader printing from the share link |

**Two tables, not one.** `campaign_diary_entries` and `player_diary_entries` are separate so the
public handler's SQL *names* the campaign table and nothing else — leaking a player's private
diary to an anonymous reader would require naming the other table, not forgetting a `WHERE`
clause. `player_timeline_entries` is the counter-example: its merged shape forces an `is_party`
check on every read path.

**Read/write asymmetry.** Reads of a player diary reuse `canAccessTimeline` (owner OR the
campaign's DM OR admin). Writes use `ownsPlayer` instead, because `canAccessTimeline` returns true
for the DM and a diary the UI calls "private" should not be editable by someone else. Entry
mutations are scoped `WHERE id=$n AND player_id=$n AND campaign_id=$n` — the guard only proves the
caller owns the player they *named*, not that they own the entry id.

**Draft state.** New campaign entries are drafts because the column default says so; the create
handler never reads `status` from the body. `published_at` is set on first publish and preserved
across unpublish/republish. The public endpoint filters `status='published'` in SQL and selects an
explicit column list, so a DM-only column added later cannot leak by merely existing. It is also
session-blind, unlike the public journey map, so what it returns is reproducible with a
cookie-less `curl`.

**Export file names.** Every module's download is named by one helper,
`api/downloadBundle.js`: `<module>[-<campaign>][-<name>]-<YYYY-MM-DD>.json`, e.g.
`character-leruhy-teudis-2026-10-02.json`. It also carries the Blob/anchor plumbing that was
previously copy-pasted into five hooks, each with its own idea of a filename. The date is local,
not UTC, so a file saved late in the evening is not dated tomorrow. The module prefix is cosmetic —
the importer routes on the `type` field inside the bundle, so renaming a file changes nothing.

**Roster.** The printed book credits the table on its title page and carries an annex of
character bios. That data is a separate fetch, not part of the diary payload: portraits are
base64 and have no business loading on every page view of a diary nobody is printing. It returns
`public_info` only — the same material the public PC sheet already exposes.

**Grouping.** `campaign_diary_entries.chapter` and `player_diary_entries.category` are free
`VARCHAR(120)` text, not a lookup table: both are the author's own filing system, and a fixed
vocabulary would be wrong for somebody within a week. The UI offers a datalist of values already
in use. Groups render in first-appearance order, so the entry ordering decides the arc.

**Standalone export/import.** The diary has its own bundle (`type: 'campaign-diary'`, v1)
alongside riding in the full campaign export, so it can be backed up or handed over on its own
without a campaign restore losing it either. The import **replaces** rather than merges — one
`DELETE … WHERE campaign_id=$1` then re-insert, inside a transaction — which is what stops a
re-import doubling the entries, and makes it the only destructive branch in the import hub. Entry
status travels with the bundle, since replace means restore. The share token is never exported:
it is bound to the campaign it was minted for. The route validates `bundle.type` server-side
*before* the delete, not just in the hub, because this endpoint is reachable directly.

**`campaign_diary_shares`** is a third share table beside the timeline and journey-map ones, with
its own token namespace. Unlike journey maps it is *stable* on re-request (the DM presses Share to
re-copy a link, not to rotate it); revocation is a separate, deliberate `DELETE`.

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
| GET | `/api/pc/:playerId/stats` | auth | Get `stats_json` (the stat block) |
| PUT | `/api/pc/:playerId/stats` | auth | Save `stats_json` |
| POST | `/api/pc/:playerId/portrait` | auth | Upload portrait (base64, max 500 KB) |
| PATCH | `/api/pc/:playerId/relationships/:rid` | auth | Edit a relationship |
| PATCH | `/api/pc/:playerId/relationships/:rid/visibility` | auth | Toggle DM-only flag |
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
| GET | `/api/docs/:module` | — | Per-module README (whitelisted slugs) |
| GET | `/api/location-type-images` | auth | Default pin image per location type |
| PUT | `/api/location-type-images/:sizeType` | admin | Set a default pin image |

### Import / export

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/api/campaigns/:id/export` | dm | Full campaign bundle (`type: campaign`) |
| POST | `/api/campaigns/import` | dm | Restore a campaign bundle as a new campaign |
| POST | `/api/campaigns/:id/import/timeline` | dm/admin | Import a timeline onto a player |
| GET | `/api/player-timelines/:id/export` | auth | Portable timeline bundle |
| GET | `/api/pc/:playerId/export` | dm/player | PC sheet bundle — `scope: full` for a DM, `scope: player` otherwise |
| POST | `/api/pc/:playerId/import` | **dm** | Apply a PC sheet bundle (see below) |

**PC sheet scope.** A player's export carries their own `private_info` and the
DM notes flagged `dm_visible`, so their file is a complete copy of the sheet as
they see it. It omits **hidden DM notes** and **DM-only relationships** entirely
rather than blanking them. Import writes a field only when the bundle is
authoritative for it — `private_info` and `dm_notes` are applied only from a
`full` bundle, because a player-scope one holds just the visible subset. That is what makes the round-trip safe:
a player-scope bundle cannot clear the DM's private notes, and a DM-scope bundle
replaces notes outright instead of appending them (which used to double them on
every cycle).

The relationship rule mirrors the rest: a `full` bundle replaces every
relationship, a `player` bundle replaces only the non-DM-only ones and leaves
DM-only rows in place. Because `pc_relationships.parent_id` is
`ON DELETE CASCADE`, a surviving DM-only child whose parent is being replaced
has its `parent_id` cleared *before* the delete — otherwise the cascade would
take it along. Such a row re-parents to root, which is the only meaning left
once its parent is gone.

Importing is DM-only: **Manage Campaigns → Players tab → ⬆ Import** on a row, or
the sidebar import hub.

---

## Page routes

All pages are React routes ([frontend/src/App.jsx](frontend/src/App.jsx)) served
by the SPA — Express serves the Vite build via the catch-all and exposes only
`/api/*` otherwise. Access is enforced client-side by `ProtectedRoute` and
re-checked on every API request server-side.

| Path | Access |
|---|---|
| `/` | Public |
| `/timeline` | DM, Player |
| `/timeline-public/:token` | Public |
| `/journey-map` | DM |
| `/journey-map-public/:token` | Public |
| `/manage-campaigns` | DM |
| `/pc-sheet` | DM, Player |
| `/pc-public/:token` | Public |
| `/npc-sheet` | Public |
| `/item-cards` | Public |
| `/pdf-viewer` | DM |
| `/split-view` | Public |
| `/user-panel` | Admin |

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

1. `node:24-alpine` base (~50 MB compressed) — Node 24 "Krypton", Active LTS to Apr 2028
2. `npm ci --omit=dev` installs only production dependencies
3. The process runs as **root** — deliberately. A custom UID/GID conflicts
   with host ownership on the bind-mounted `pdfs/` volume; see the comment in
   the Dockerfile. Acceptable for a self-hosted private deployment.

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

**Adding a new tool (React):**

1. Create `frontend/src/pages/MyTool/` (page + sub-components), reusing the
   shared `components/ui` primitives, `useAsync`, `useToast`, etc.
2. Add a `<Route>` in `frontend/src/App.jsx` (wrap in `<ProtectedRoute roles={[…]}>`
   if it needs auth).
3. Add a card/link in `frontend/src/pages/Home.jsx`.
4. Add any new API calls to `frontend/src/api/*` and the endpoints in `app.js`.
5. `cd frontend && npm run build` (the catch-all serves it); rebuild the Docker
   image if running containerised.

**Adding new API endpoints:**

Follow the pattern used throughout `app.js` — `requireRole([...])` middleware for access control, `pool.query(...)` for DB access, always return `res.status(500).json({ error: e.message })` on failure.
