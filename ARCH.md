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
| CSRF | Session-held synchroniser token; `X-CSRF-Token` required on POST/PUT/PATCH/DELETE |
| Login throttling | 10 failures / 15 min, keyed on IP + username, in memory |

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
  -- One user may hold SEVERAL characters in one campaign. `GET /api/campaigns`
  -- therefore tests membership with EXISTS rather than joining through this
  -- table, or the campaign comes back once per character.

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

### Campaign Journal

Shared notes on the PC Sheet. Every member of a campaign writes; the whole table reads. The DM
can additionally mark an entry `dm_only`, which a player's listing never selects at all.

```
campaign_journal_entries
  id, campaign_id (FK campaigns, CASCADE), created_by (FK users, CASCADE),
  player_id (FK campaign_players, SET NULL),      -- the character, if the author plays one
  location_id (FK campaign_locations, SET NULL),  -- where it happened
  title, body, category (free text, nullable),
  in_game_day (absolute day number, nullable),
  dm_only (bool, default false), created_at, updated_at
  INDEX (campaign_id, created_at DESC)
```

`category` is free text with a datalist of what the campaign already uses, exactly like the
diary's — a table invents its own filing ("Documents", "Rumours", "People we met") rather than
picking from a list somebody else wrote. Entries group under it in the UI.

Listed in **in-game date order, ascending**, with undated entries last: the journal reads forward
like the diary rather than like a feed. `in_game_day` is the same absolute-day integer the
timelines and `campaign_meta.today_marker` use, so a date set in the journal formats identically
everywhere else — including day **zero**, which is year 1 day 1 of that epoch and which the
server's bound therefore has to accept.

`created_by` (the user) and `player_id` (the character) are stored separately on purpose: the DM
has no character, and a player's note stays theirs if they later swap characters. Both location
and player are `SET NULL` rather than `CASCADE` — deleting a place must not delete what was
written about it.

Two withholding rules are enforced in SQL rather than in the component, so a refactor of the UI
cannot leak them:

- A player's query carries `AND j.dm_only = false` and does not select the column at all.
- A location the DM has since made private stops showing to players — **both its name and its
  id** — even on an entry written while it was still public. Withholding only the name would
  still let a player tell that two entries happened at the same secret place.

Editing and deleting are deliberately asymmetric: only the author may edit, while the author
**or** the DM may delete. A DM tidying the campaign should be able to remove an entry, but not
to rewrite a player's words without them knowing.

**Two mount points, one component.** `pages/Journal/JournalPanel` fetches its own data and is
rendered both as a PC Sheet tab and as a Manage Campaigns tab, so neither page threads journal
state through its hook and the player's view and the DM's cannot drift. Presentation is the
Diary's — `pages/Diary/GroupedEntries` and `EntryList`, with `meta`, `can` and `accent` supplied
— because a journal and a diary are the same act of writing something down; only who may read it
differs.

**Grouping and search** live in `GroupedEntries`, shared with all four diary lists. Filtering
runs before grouping so the group counts and the collapse state keep meaning something.
`groupEntries` accepts a field name or a function — the journal's "who wrote it" is a character
name falling back to a username and is not a column — and `sortGroups` orders the headings
alphabetically for the groupings where first-appearance order is noise. `searchEntries` is
substring, case- and accent-folded, AND across terms, OR across fields.

### Item Cards

```
item_cards                       -- the card creator's saved library
  id, user_id (FK users), name, type, rarity (CHECK: common|uncommon|rare|
  veryrare|legendary|artifact), flavor, abilities, attunement,
  damage, damage_type, properties, ac_bonus, armor_type, uses, weight,
  evolves_from (FK item_cards, NULLABLE, ON DELETE SET NULL),
  created_at, updated_at
  -- Scoped to a USER, not a campaign: the module has no campaign selector and
  -- is reachable without logging in. Guests keep a localStorage-only print set;
  -- this table is what a signed-in user gets on top.
  -- `abilities` is HTML from a contenteditable editor, rendered with
  -- dangerouslySetInnerHTML, so it is sanitised on write (sanitizeAbilities).
  -- `evolves_from` makes a CHAIN of tiers for an item that grows over a
  --   campaign. NULL is a base tier. Which tier a character currently holds is
  --   NOT stored here — it is which card their inventory row points at, so
  --   advancing an item and reverting it are the same UPDATE in opposite
  --   directions, and a player is never sent anything about the chain.
  --   Cycles are rejected on write (chainLinkError): the chain is walked in the
  --   browser, so a loop would hang the tab rather than erroring.
  --   SET NULL rather than RESTRICT because the DELETE route already reports
  --   23503 as "this card is held by …"; the route re-links the children to the
  --   deleted card's parent first, so removing a middle tier closes the gap.
```

**The chain is deliberately absent from `INV_SELECT`.** A player reads their own inventory
through that query, whose card half is an explicit column list — leaving `evolves_from` out of it
is what makes an evolving item impossible to anticipate. `test/itemChain.test.js` fails if it is
ever added.

### Inventory

```
inventory_items                  -- a character's gear
  id, campaign_id (FK campaigns), player_id (FK campaign_players),
  item_card_id (FK item_cards, NULLABLE, ON DELETE RESTRICT),
  name, quantity, category ('inventory'|'treasure'|'potions'|'misc'),
  weight, equipped, attuned, requires_attunement, notes,
  granted_by (FK users), prev_player_id (FK campaign_players), transferred_at,
  created_at, updated_at
  -- A row is one of two kinds, enforced by CHECK rather than convention:
  --   card-linked (item_card_id set) — a magic item the DM granted. The card is
  --     a reusable template; this row is its ONE instance in the campaign.
  --     Unique per campaign via a PARTIAL index, always quantity 1.
  --   free-text (name set) — the player's own gear and consumables. The only
  --     kind that carries a quantity.
  -- CHECK inventory_items_kind       : card_id IS NOT NULL OR name IS NOT NULL
  -- CHECK inventory_items_card_qty   : card_id IS NULL OR quantity = 1
  -- CHECK inventory_items_qty_positive
  -- UNIQUE INDEX idx_inventory_card_once_per_campaign
  --        ON (campaign_id, item_card_id) WHERE item_card_id IS NOT NULL
  -- ON DELETE RESTRICT on the card: deleting a card that is in someone's
  -- inventory fails with a 409 naming the holder, rather than silently
  -- removing a player's magic item.
  -- player_id, not user_id: an inventory belongs to a CHARACTER, so reassigning
  -- the character to another user carries the gear with it.
  -- `category` is ORTHOGONAL to card-linked/free-text: it only says which panel
  -- of the equipment sheet a row appears in. A granted potion is still granted.
  -- `weight` is NULL on a card-linked row — the card owns the weight, so there
  -- is one place to set it. NUMERIC because a vial is 0.5 lb.
  -- `attuned` vs `requires_attunement` are two different questions: the second
  -- is a property of the ITEM (and for a card-linked row comes from the card,
  -- so the column stays false there), the first is this character's state.
  -- `attuned` is written by the server, which drives it from `equipped` when
  -- that CHANGES and otherwise honours the incoming value — that transition
  -- rule is what lets the automatic behaviour and the manual override coexist.
  -- The 5e cap of three is enforced in both writers (ATTUNEMENT_LIMIT).
  -- `equipped` is forced false for category 'potions' — consumables are used,
  -- not worn — and that is applied against the NEW category, so moving an
  -- equipped item into Potions unequips it.
  -- Related: item_cards.weight. Maximum Carry Weight is derived as STR x 15
  -- and is NOT stored — pc_characters.carry_capacity is a leftover and unused.
```

### Player Characters

```
pc_characters
  id, player_id (FK campaign_players), name, picture_url, picture_data,
  coins_pp, coins_gp, coins_sp, coins_cp,   -- the purse; 50 coins = 1 lb in 5e,
                                            -- counted in the carry total
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
| POST | `/api/auth/login` | — | Login. Throttled; returns a **rotated** CSRF token |
| POST | `/api/auth/logout` | auth | Logout |
| POST | `/api/auth/change-password` | auth | Change own password |
| GET | `/api/auth/user` | — | Current session user, **and the CSRF token** (both logged in and out) |
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

### Share links and cross-links

**Every token-gated surface requires a logged-in member of the campaign.** The journey map,
timeline, PC sheet, diary and diary roster all call `shareGate(req, campaignId)` after resolving
their token: 401 `LOGIN_REQUIRED` for an anonymous viewer, 403 `NOT_YOUR_CAMPAIGN` for a
logged-in non-member. The token still names the thing and revocation still works; it stopped
being the only thing between a campaign and a stranger.

The gate runs **after** the token lookup, never before, so a revoked link still answers 404
rather than sending someone to log in for something that no longer exists. `campaignAuth.test.js`
treats `:token` as an id-bearing path and requires `shareGate` by name — those five routes used
to be *excluded* from that walk, which is how they drifted.

`pc-public` is the odd one: its token is `hashId(playerId)`, a pure function of the row id with
no share table, so it has never been revocable. The gate is the only restriction it has ever had.

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/api/campaigns/:campaignId/link-targets` | member | Locations and NPCs this viewer may resolve in a `[[Name]]` link |

**Cross-links.** Prose in the diary and the Campaign Journal takes `[[Name]]`,
`[[npc:Name]]` and `[[Name|display text]]`. The index is role-filtered in SQL — a player gets
public locations and **no NPCs**, since `campaign_npcs` is DM-only and has no visibility column —
and selects an explicit column list, because `image_data` is a base64 pin image that would
otherwise ride along with every autocomplete fetch.

An unresolved name renders as plain text rather than a broken link. That leaks nothing: the name
is in the prose either way, so the only thing withheld is whether clicking does something.

`renderMd(text, links)` honours the file's own safety contract rather than widening it. The
**name never reaches an attribute** — `data-xlink` carries `kind:id`, a number this code
produced — so the escape pass, which does not cover quotes, remains sufficient.

### Campaign links

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/api/campaigns/:campaignId/links` | member | Everything in the campaign that carries a share token |

Backs the PC Sheet's **🔗 Campaign Links** tab. Every list is an **INNER JOIN onto its shares
table** — a left join with the token nulled out would render identically for a shared map and
leak the name, and the existence, of every unshared one. For the same reason the handler does
not branch on role: the answer is "what has been shared", which is the same for everyone, and a
role branch would be a second path to get wrong.

`npcs` is returned as an empty array. `campaign_npcs` has no visibility column, so the list is
prepared rather than populated.

### Campaign Journal

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/api/campaigns/:campaignId/journal` | member | Entries in in-game date order. A player's query filters `dm_only` in SQL |
| POST | `/api/campaigns/:campaignId/journal` | member | Write one. `dm_only` is accepted only from the DM |
| PUT | `/api/campaigns/:campaignId/journal/:entryId` | author | Edit. The DM cannot edit somebody else's entry |
| DELETE | `/api/campaigns/:campaignId/journal/:entryId` | author or DM | Remove one |

`member` means `canAccessCampaign` — the DM, an assigned player, or an admin. Who the DM *is* is
decided from the campaign row (`isCampaignDm`), never from anything the client sent.

A player naming a location they cannot see is refused with a 400 rather than accepted and
silently blanked: accepting it would confirm that the guessed id exists. The check is the same
`is_public` filter the locations list uses.

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

## Security posture and its deployment dependencies

### Sessions

`saveUninitialized: true`, so an anonymous visitor already has a session — which is what lets a
CSRF token exist on the login form, and is why no route needs a CSRF exemption.

The cost of that is session fixation, and the defence is one line: **login calls
`req.session.regenerate()` before adopting the identity**. Anyone able to set a cookie on this
origin can plant a session id; without regeneration, logging in promotes that planted id to an
authenticated one. Order matters twice over — the identity must be written *after* regeneration
or it lands on the session being discarded, and `cookie.maxAge` must be set after it too, since
regeneration resets the cookie to the store default and "remember me" would silently become 24
hours. `test/sessionFixation.test.js` pins both orderings.

### Passwords

One floor, `PASSWORD_MIN = 8`, applied by `passwordError()` at every route that hashes a
password: `change-password`, `POST /api/users` and `PUT /api/users/:id/password`. The last two
used to accept any non-empty string. It is checked only when a password is **set** — nothing
re-checks a stored hash, so an existing short password keeps working until its owner changes it.
`test/passwordPolicy.test.js` walks the route table for anything that calls `bcrypt.hash` on
request data without the check, rather than naming the three.

### The stat-sheet postMessage bridge

The PC Sheet embeds the NPC Sheet in an iframe whose `src` is a route of this same app, so both
sides name `window.location.origin` on every send and ignore any message whose `e.origin` is not
it. A whole stat block crosses that bridge in both directions; `'*'` would hand it to whatever
document happened to be in the frame.

### Two settings off on purpose

Both must change together with the deployment, not on their own. Turning either on against the current setup breaks the app or weakens it.

| Setting | State | Why, and what has to be true first |
|---|---|---|
| `cookie.secure` | `false` | The app is served over plain HTTP on a published port with no TLS. Setting it alone makes the browser withhold the session cookie, so nobody can log in. Needs TLS terminating in front of the app first. |
| `app.set('trust proxy')` | never called | There is no reverse proxy. Setting it **without** one is worse than leaving it off: `X-Forwarded-For` becomes attacker-controlled, so `req.ip` does too, and the login limiter can be bypassed by varying one header. Needs a proxy that strips and sets that header. |

So, if a reverse proxy with TLS is ever put in front of this: set `trust proxy` to the number of
proxy hops, set `NODE_ENV=production` (never set today), and make `cookie.secure` conditional on
it — all three, in that order. The login limiter's IP keying silently degrades to one shared
bucket for every client if the first is missed, which locks everybody out at once.

What is in place:

- **Sessions** — `express-session`, `httpOnly`, `sameSite: 'lax'` set explicitly, default
  `MemoryStore`. Sessions and CSRF tokens therefore do not survive a restart; the frontend
  re-fetches a token and replays the request rather than surfacing that.
- **CSRF** — a token minted per session and compared with `crypto.timingSafeEqual` on every
  mutating request. No route is exempt: `saveUninitialized: true` means a logged-out visitor
  already has a session, so login and logout are covered like everything else. Rotated on login.
- **Login** — bcrypt, throttled, and both failure paths pay a bcrypt round so the response time
  does not reveal which usernames exist.
- **Stats blobs** — `validateStats` whitelists `pc_char_stats.stats_json` at all three sites that
  write it, including both import routes.
- **Share links** — HMAC of the row id (`hashId`), and the public routes select explicit columns
  so a DM-only column added later cannot start leaking merely by existing.

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
