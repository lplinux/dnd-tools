# Changelog

All notable changes to **dnd-tools** are documented here.
Versions correspond to GitHub releases; changes are derived from inspecting
the actual diffs between tags.

---

## [0.1.0] – 2026-05-12

### Journey Map — Region polygon drawing

- **Draw Region tool** (`🗾 Draw Region`, keyboard `R`): a new toolbar tool lets DMs draw freeform polygon boundaries for `region`-type locations instead of dropping a single point pin.
- **"Place" button auto-routes**: clicking the sidebar *Place on Map* button for a `region`-type location now activates the Region tool automatically; non-region locations still activate the Place tool as before.
- **Polygon storage**: `journey_map_locations` gains a `polygon JSONB` column (migration added). Each polygon is stored as an ordered array of `{x, y}` percentage-coordinate points.
- **Rendering**: regions render as semi-transparent filled polygons in `<g id="regionsG">`, layered below pins. Labels are drawn at the centroid using the Cinzel serif font with a dark paint-order stroke for legibility over map images.
- **Reshape**: selecting a region in the Select tool reveals draggable vertex handles. Each vertex can be dragged to reshape the polygon; the updated geometry is saved via `PUT` on mouse-up.
- **Move**: dragging the interior of a selected region moves all vertices together; centroid `x`/`y` is kept in sync and persisted.
- **Delete**: the Delete tool and the ✕ button in the location list both remove region polygons as before.
- **Right panel**: region locations show a `🗾 Region` card with vertex count and reshape/move hints instead of the plain position row.
- **Location list**: region locations show the `🗾` icon instead of `📍`.
- **Public map**: `journey-map-public.html` renders regions using the same polygon/label approach (read-only, click-to-select, tooltip support).
- **API updates**:
  - `POST /api/journey-maps/:id/locations` now accepts optional `polygon` body field.
  - `PUT  /api/journey-maps/:id/locations/:locId` now accepts and persists `polygon`.
  - `GET  /api/journey-maps/:id/locations` (DM) and the public share endpoint both return `polygon`.

### Journey Map — Region → Map linking

- **Link a map to a region**: selecting a region in the right panel now shows a **🗺 Linked Map** card with a dropdown listing all other maps in the campaign. Choosing one saves the link immediately via `PUT`.
- **Open linked map**: when a link is set, an **🗺 Open "[Map name]"** button appears below the dropdown. Clicking it switches the map selector and loads the target map instantly — no page navigation needed.
- **Visual indicator**: regions with a linked map display a small 🗺 badge above their name label on the SVG canvas.
- **DB**: `journey_map_locations` gains `linked_map_id INTEGER REFERENCES journey_maps(id) ON DELETE SET NULL` (migration added). Deleting the target map automatically clears the link.
- **API**: `GET /locations` now joins `journey_maps` to return `linked_map_name` alongside `linked_map_id`. `POST` and `PUT` both accept `linked_map_id`.
- **Import note**: `linked_map_id` is intentionally not restored on import since target map IDs differ across instances; the link can be re-set manually after import.

### Journey Map — Image size limit & export/import

- **2 MB / 4096 px limit on upload**: `loadMapFile()` now runs the selected file through a canvas-based `compressImage()` helper before saving. Images are scaled down if their longest edge exceeds 4096 px, then JPEG-compressed at decreasing quality steps until the data URL fits within 2 MB. Files already under the limit pass through at high quality. Raw files over 20 MB are rejected immediately with a toast.
- **Image included in export**: `exportMap()` now fetches the stored `map_image` via `GET /api/journey-maps/:id/image` and embeds it as `map_image` in the JSON bundle. Because images are already compressed to ≤ 2 MB at upload time, exported files remain manageable.
- **Image restored on import**: `importMap()` reads `bundle.map_image` and, if present, PUTs it to the new map right after creation. The success toast no longer prompts to re-upload the image when one was found in the bundle.
- **Region polygons preserved on import**: `importMap()` now passes `polygon` when recreating each location, so imported region shapes are fully restored.

---

## [0.0.6] – 2026-05-10

### Manage Campaign — Cross-connection visibility

- **Public toggle**: each DM cross-connection row now has a 🌐 / 🔒 button. Toggling it marks the connection `is_public` so it appears on the relevant player's PC Sheet relationship panel and graph.
- **`🔒 DM only` badge**: shown inline on the connection row only when `is_public = false`; disappears when made public.
- **New endpoint** `PATCH /api/campaigns/:id/char-tree/connections/:connId/visibility` — flips `is_public` and returns the updated record.
- **Migration**: `is_public BOOLEAN NOT NULL DEFAULT false` added to `character_relationships`.

### PC Sheet — Public cross-connections

- **Relationship API shape change**: `GET /api/pc/:playerId/relationships` now returns `{ relationships, cross_connections }` instead of a plain array. Legacy plain-array responses are handled gracefully client-side.
- **List view**: public cross-connections appear in the Relationships tab under a `🔗 Cross-connections` group, showing `from → label → to` with optional notes.
- **Graph view**: public cross-connections render as teal dashed-ring nodes on the SVG relationship graph, positioned near their linked local relationship node. Dashed teal edges connect them with the connection label mid-edge.
- **Overlap prevention**: a 60-iteration repulsion pass pushes cross-nodes away from all family, social, child, and self nodes until no overlaps remain. Edges are redrawn after final positions are settled.
- **Label resolution**: NPC and Player entity types now resolve to their real names server-side (was falling back to `#ID`). Backend query extended with additional JOINs on `campaign_npcs` and `campaign_players`.
- **ViewBox**: recalculated after cross-node placement to keep all nodes in frame on initial render.
- **Legend**: a `🔗 Cross-link` swatch is appended to the legend when cross-connections are present.
- **"Hidden from player" form row**: the `🔒 Hidden from player` checkbox in the relationship edit modal is now hidden when editing a relationship that is not already `is_dm_only` (was always shown for all DM users).

### Manage Campaign — Nested locations

- **Unlimited depth**: locations can now have a parent location (Continent → City → District → Inn → Room, etc.).
- **Migration**: `parent_id INTEGER REFERENCES campaign_locations(id) ON DELETE SET NULL` added to `campaign_locations`.
- **Tree rendering**: the location table now renders as an indented tree with `└` depth markers and a child-count badge per node.
- **Add form**: includes a **Parent Location** dropdown (indented flat list of all existing locations).
- **Edit modal**: includes a **Parent Location** dropdown that excludes the location itself and all its descendants to prevent circular references.
- **API**: `POST` and `PUT /api/campaigns/:id/locations` now accept and persist `parent_id`; `PUT` rejects self-referencing updates.

### Journey Map — Map scope

- **Scope at creation**: the "New Journey Map" modal now includes a **Map Scope** selector (`🌍 Continent` / `🏙️ City · Area`). When City is selected a **Parent Location** dropdown appears in the same form; the Create button is blocked until a location is chosen.
- **Migrations**: `scope_type VARCHAR(20) NOT NULL DEFAULT 'continent'` and `scope_location_id INTEGER REFERENCES campaign_locations(id) ON DELETE SET NULL` added to `journey_maps`.
- **New endpoint** `PATCH /api/journey-maps/:id/scope` for updating scope post-creation.
- **Scoped pin picker**: the "Pick location" dropdown filters by scope — continent maps show all campaign locations, city maps show all descendants of the selected parent (recursive, all depths). Both render as an indented tree matching the Manage Campaign style, seeded from the scope root.
- **Pinned locations list**: the sidebar pinned-locations list also renders as an indented tree seeded from the scope root, so city maps display correct parent-child ordering.
- **Scope hint**: a line below the section header describes the active scope (e.g. *"Showing locations inside 'Neverwinter'. Select one and click the map to pin it."*).

---

## [0.0.5] – 2026-05-07

### PC Sheet & Manage Campaign — Relationship labels, type editing, and connection editing

#### Backend (`app.js`)
- **New DB column** `status_label VARCHAR(100)` on `pc_relationships` (migration via `ADD COLUMN IF NOT EXISTS`). Stores free-form status text; suggested values are *Alive* / *Dead* / *Deceased* but any string is accepted.
- **POST** `/api/pc/:playerId/relationships` now accepts and persists `status_label`.
- **New route** `PATCH /api/pc/:playerId/relationships/:relId` — updates `name`, `relation_type`, `status_label`, `link`, and/or `parent_id` on an existing relationship. True partial update (only fields present in the body are changed). Players cannot edit DM-created relationships (same protection as DELETE).
- **New route** `PATCH /api/campaigns/:campaignId/char-tree/connections/:connId` — updates `label` and/or `notes` on an existing DM cross-connection.

#### Manage Campaign (`manage-campaigns.html`)
- **Relationship pills** (Character Tree tab, per-player group) now show a `status_label` badge when present: 🟢 for *alive*, 💀 for *dead*/*deceased*, 🏷️ for any other label.
- **Canvas tooltips** for all relationship nodes (family tiers, sibling row, social fan) now include a `Status:` line when `status_label` is set.
- **Edit cross-connection**: each connection row now has a ✏️ button that re-opens the Add Connection modal pre-filled with the current label and notes. In edit mode the From/To selectors are hidden (entity endpoints are immutable after creation); only label and notes can be changed. Calls `PATCH` instead of `POST`.

#### PC Sheet (`pc-sheet.html`)
- **Add Relation modal**: new *Status* field — `<datalist>`-backed free-text input with preset options *Alive*, *Dead*, *Deceased*, *Missing*, *Unknown*. Wired to `status_label` in `submitRelation`.
- **Relationship list chips**: show the `status_label` badge inline (🟢 alive / 💀 dead or deceased / 🏷️ other).
- **Edit Relation**: ✏️ button added to every chip (hidden only for DM-created rels when the viewer is a player). Clicking it re-opens the modal pre-filled with all existing values and calls `PATCH` on save. The modal title and submit button label switch between *Add Relation* / *Add* and *✏️ Edit Relation* / *Save* depending on mode.

### Manage Campaign — Character Tree fixes & layout

- **DB fix**: `character_relationships` CHECK constraints only allowed `'player'` and `'npc'` entity types, but the app sends `'relationship'` for pc_relationship nodes. Added `ALTER TABLE … DROP CONSTRAINT … ADD CONSTRAINT` migration to include `'relationship'` in both `from_entity_type` and `to_entity_type` allowed values. Existing rows are unaffected.
- **NPC visibility**: NPC nodes are now only rendered on the canvas if they appear in at least one DM cross-connection. Disconnected NPCs are still available in the "Add Connection" dropdown but don't clutter the graph.
- **Tree-structured layout** (replaces radial layout):
  - Each player gets a horizontal band. Family relationships (Grandparent, Parent, Sibling, Child, Grandchild) are placed on vertical tiers above/below the player node, mirroring the pc-sheet hierarchy: Grandparent at −2 × tier-height, Parent at −1, Sibling at 0 (left/right alternating), Child at +1, Grandchild at +2.
  - Multiple nodes on the same tier are spread horizontally, centred on the player.
  - A horizontal dashed connector bar links siblings/cousins on the same tier; vertical spine lines run from player to tier midpoints.
  - Social/non-family relationships fan out to the right of the player node at a configurable arc angle (±55°).
  - NPC nodes (when connected) appear in a labelled row below all player bands, separated by a dashed "NPCs" divider.
  - Tier labels (Grandparent / Parent / Sibling / Child / Grandchild) render on the left edge at ≥0.5× zoom.
  - Relation-type labels render above each family node at ≥0.55× zoom.
  - Viewport auto-fits the bounding box of all nodes on first load.

### Journey Path Map — Distance Matrix Modal sticky header fix

- **Root cause fixed — `border-collapse: collapse` vs sticky**: `border-collapse: collapse` is fundamentally incompatible with `position: sticky` — collapsed borders are "owned" by adjacent cells and paint over sticky elements, causing scrolled cell content (e.g. `+ set` text) to bleed through the pinned row-header column. Switched to `border-collapse: separate; border-spacing: 0` with one-sided per-cell borders, which is the only correct approach.
- **Corner cell truly frozen on both axes**: `thead th:first-child` now has explicit `position: sticky; top: 0; left: 0; z-index: 3` so it remains anchored at the intersection of the frozen row and column during both vertical and horizontal scroll.
- **Clean separator line**: replaced `box-shadow + clip-path` workaround (which was itself a symptom of the `border-collapse` bug) with a simple `border-right: 2px solid var(--border2)` on sticky row-header cells.

---



### Manage Campaign — Character Tree improvements

- **Canvas size**: increased from 380 px to 600 px tall to show more of the graph without scrolling.
- **Zoom & pan**: scroll wheel zooms in/out centred on the cursor. Drag to pan anywhere on the canvas. Three zoom buttons (＋ / − / ⊡ reset) fixed to the top-right corner of the canvas.
- **Hover tooltips**: hovering any node on the canvas shows a dark tooltip with the full name, relation type, family flag, and owning player (where applicable). Tooltip follows the cursor and disappears when the mouse leaves a node.
- **No self-connections**: the "Add Connection" modal dynamically removes the selected "From" entity from the "To" dropdown, making it impossible to create a connection from an entity to itself.
- **Players as connection targets**: the connection modal now lists player character nodes (⚔️ `[Player]` prefix, `p_N` key) in addition to relationship nodes, so DMs can draw cross-connections directly to/from player characters.
- **NPCs as connection targets** (new): the connection modal now also lists all campaign NPCs (🎭 `[NPC]` prefix, `n_N` key). NPC nodes are rendered on the canvas below the player ring in a horizontal row, with a green (`#7ab050`) outline and a distinct fill. The connection legend shows the NPC colour swatch when NPCs are present.
- **Cross-connection rendering fix**: `drawTree` now correctly resolves `npc` entity type in cross-connections (key `n_<id>`), in addition to `player` (`p_<id>`) and `relationship` (`r_<id>`).
- **Backend**:
  - `GET /api/campaigns/:id/char-tree` now also returns `npcs` (all `campaign_npcs` for the campaign, ordered by name).
  - `POST /api/campaigns/:id/char-tree/connections` parser extended with `n_` prefix → `{ type: 'npc', id }`.


### Manage Campaign — Full Refactor

- **Tab-based layout**: campaign detail panel is now divided into six tabs — Players, Locations, NPCs, Timelines, Character Tree, and Settings — replacing the previous single-scroll layout.
- **Locations tab improvements**:
  - Added a live **search/filter** input to quickly find locations by name.
  - Fixed the Size/Type select: now uses `compact-type` CSS class — auto-width, no longer stretching the full row.
  - Location list is sorted **alphabetically** by name.
- **Settings tab**: contains the Calendar type display, Today Marker picker, and the Delete Campaign (danger zone) button. These controls were previously scattered in the main panel.
- **Character Tree tab** (new):
  - Pulls all `pc_relationships` entries from every player's PC Sheet in the campaign and displays them as collapsible per-player groups with family/non-family visual distinction.
  - Interactive **canvas graph** rendering player character nodes with their relationship satellites, connected by edges. DM cross-connections rendered as dashed red lines.
  - **DM-only cross-connections**: DMs can link any two relationship entries from any players (e.g. "Sister of Player1 is allied with Enemy of Player2"). These connections are stored in the new `character_relationships` table and are invisible to players.
  - Cross-connections list with labels, optional notes, and per-row delete.

### Journey Path Map — Fixes & New Features

- **Distance Matrix Modal**:
  - Locations row/column headers now **sticky** while scrolling (CSS `position: sticky` on `thead th` and `tbody th`).
  - Close button moved to a fixed **✕** in the top-right corner of the modal header; old footer Close button removed.
  - Matrix rows/columns now **sorted alphabetically** by location name.
- **Location list** in the sidebar is now sorted **alphabetically**.
- **Measure tool** (`📐`, keyboard `M`):
  - New in-memory (never saved) tool for measuring paths between pinned locations.
  - Click pinned locations sequentially to build a measurement chain. Shows total distance, per-mode travel times (walk/horse/fly), and per-segment breakdown for 3+ stops.
  - Missing distances flagged with a warning; partial known total shown.
  - Dashed green SVG overlay with numbered circles drawn on the map.
  - Clicking the last waypoint undoes it; switching tools or pressing a tool key clears the measure.
- **Smart distance sidebar** (when a location is selected):
  - Distances shown in the right panel are now filtered by size/type proximity rules:
    - **Huge/Big** cities: show all Huge/Big cities, Medium/Small within 150 mi, others within 50 mi.
    - **Medium/Small** cities: show Huge/Big within 150 mi, Medium/Small within 100 mi, others within 50 mi.
    - **Other** (village, inn, post, unset): show only the closest Huge/Big city, Medium/Small within 80 mi, others within 50 mi.
  - Hidden location count shown with a link to open the full distance matrix.
  - Each row shows the target location's size/type as a small badge.

### PC Sheet
- **DM-only relationships** — DMs can mark any relationship as *Hidden from player* (🔒) when adding it. Hidden relationships are stored with `is_dm_only = true` and are never returned by the API to player-role users. On the DM's view they appear with a dashed border and a 🔒 **DM only** badge. A **👁 Unhide / 🔒 Hide** toggle is available — but only on relationships the DM created.
- **DM-created relationships are protected** — relationships created by the DM (`created_by_role = 'dm'`) cannot be deleted by the player. The delete button is hidden client-side and the `DELETE` endpoint rejects the request server-side. The Hide/Unhide toggle only appears on DM-created entries.
- **Nested relationships** — any relationship can now be marked as a child of another (e.g. "Father's Mentor", "Mentor's Rival"). A *Child of* dropdown in the Add Relation modal lists all existing top-level relationships as candidates. Children render indented with a `↳` prefix beneath their parent in the list.
  - `app.js`: migrations add `created_by_role VARCHAR(20) DEFAULT 'player'` and `parent_id INTEGER REFERENCES pc_relationships(id) ON DELETE CASCADE`; `POST` stores both; `DELETE` blocks players from removing DM-created rels; `PATCH .../visibility` rejects requests on player-created rels
  - `pc-sheet.html`: Add Relation modal gains a *Child of* selector; `openRelModal` populates it with top-level rels; `submitRelation` sends `parent_id`; `renderRelList` rewritten to nest children under parents and show/hide Delete and Hide buttons based on `created_by_role`

### Backend (`app.js`)

- `GET /api/journey-maps/:id/locations` now LEFT JOINs `campaign_locations` to include `size_type` on each placed location object.
- New DB table `character_relationships` for DM cross-player relationship connections (campaign-scoped, `from_entity_id`/`to_entity_id` reference `pc_relationships.id`).
- New API routes:
  - `GET /api/campaigns/:id/char-tree` — returns all players, their pc_relationships, and DM cross-connections for a campaign.
  - `POST /api/campaigns/:id/char-tree/connections` — creates a DM cross-connection.
  - `DELETE /api/campaigns/:id/char-tree/connections/:connId` — removes a DM cross-connection.

### Manage Campaign — Previous session (size/type on locations)

- `campaign_locations` table: added `size_type VARCHAR(50)` column (migration via `ALTER TABLE … ADD COLUMN IF NOT EXISTS`).
- POST and PUT location API endpoints now accept and persist `size_type`.
- Add and Edit location forms both include the Size/Type dropdown.
- Location table displays a Size/Type column (alphabetically sorted).

---

## [0.0.4] – 2026-05-06

> PR #8 · Branch `lplinux/extend-journal-map`

### Journey Path Map
- Extended the Journey Map module with significant new functionality (exact
  features visible in `journey-map.html` and `journey-map-public.html` diffs).
- Added / improved the **public read-only view** (`journey-map-public.html`),
  allowing the map to be shared via token without authentication.

### General improvements across modules
- Small UX and correctness fixes applied to several HTML modules
  (`manage-campaigns.html`, `npc-sheet.html`, `pc-sheet.html`,
  `pc-public.html`, `timeline.html`).
- Minor backend fixes in `app.js` (bug-fixes logged under "A lot of
  improvements done").
- Added helper scripts `scripts/create-admin.js` and `scripts/setup-db.js`
  for easier first-run database and admin-account setup.
- Added a proper `.env.example` template documenting both the full
  `DATABASE_URL` connection string and the individual `DB_*` field options.
- Added a startup shell script `run.sh`.
- Updated `package.json` (dependency or script changes).
- Updated `ARCH.md` and all per-module `docs/*/README.md` files to reflect
  the current state of the application.
- `TODO.md` pruned and reorganised into clearly tracked open items.

---

## [0.0.3] – 2026-04-30

> PR #7 · Branch `lplinux/refactor-timeline-module`

### Timeline
- **Major refactor** of the Timeline module (`timeline.html`).
  - Data persistence migrated from browser `localStorage` to the PostgreSQL
    database; timeline data is now tied to a Campaign and a Player.
  - Added `init.sql` for initialising the timeline-related DB schema changes.
  - Backend routes for timeline CRUD updated in `app.js`.

### Other modules
- `header-component.js` updated (shared nav/auth header improvements).
- `index.html`, `item-cards.html`, `journey-map.html`,
  `journey-map-public.html`, `manage-campaigns.html`, `pc-public.html`,
  `pc-sheet.html`, `pdf-viewer.html`, `user-panel.html` — all received
  minor fixes and consistency improvements as part of the broad refactor
  pass.
- `TODO.md` cleaned up: completed items removed, remaining work reorganised.

---

## [0.0.2] – 2026-04-17

> PR #6 · Branch `lplinux/refactor-look-and-feel`

### Look & Feel
- Visual/UX overhaul across most HTML pages: `index.html`, `item-cards.html`,
  `manage-campaigns.html`, `npc-sheet.html`, `pc-public.html`, `pc-sheet.html`,
  `pdf-viewer.html`, `user-panel.html`.
- `header-component.js` updated to support the new shared nav design.

### Authentication & Permissions
- Permission/role changes introduced (`app.js` + `header-component.js`) as a
  follow-up to the auth system added before 0.0.1; minor access-control
  corrections applied across protected routes.

### Infrastructure
- `docker-compose.yml` updated.
- `package.json` updated (dependency alignment).
- `run.sh` helper script added.
- `package-lock.json` added to `.gitignore`.
- `TODO.md` expanded with detailed roadmap items (journey-map, timeline
  private mode, manage-campaigns integrations).

---

## [0.0.1] – 2026-04-14

> Initial release

### Features shipped
- Self-hosted **Node.js / Express** server (`app.js`) backed by **PostgreSQL**.
- Automatic database schema initialisation on first run.
- Role-based authentication: `admin`, `dm`, `player` roles.
- Shared read-only token links for Timeline, Journey Map, and PC Sheet.
- Modules included at launch:
  - **Campaign Timeline** – calendar of events (Calendar of Harptos or
    Gregorian); public share via token.
  - **Journey Path Map** – draw travel paths on a campaign map; public share
    via token.
  - **Campaign Manager** – manage campaigns, locations, NPCs, and related
    assets (DM only).
  - **PC Sheet** – full player-character sheet with relationship graph; public
    share via token.
  - **NPC Sheet** – quick NPC character sheet.
  - **Magic Item Card Creator** – printable item cards.
  - **PDF Viewer** – in-browser viewer reading from the `pdfs/` folder (DM
    only).
  - **Split-screen Reference View** – side-by-side document viewer.
  - **User Panel** – user and role management (admin only).
- Docker and Podman support (including rootless systemd unit generation).
- `docker-compose.yml` for one-command local stack.
- Per-module documentation under `docs/`.
- `ARCH.md` with full data model and architecture overview.
