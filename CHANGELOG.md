# Changelog

All notable changes to **dnd-tools** are documented here.

`1.0.0` is the full refactor: everything between the `0.1.0` tag and the first release of the
React application, collapsed into one entry. The per-step detail that used to live here as
twenty-six *Unreleased* sections is in the git history of this file; what follows is the summary
worth keeping. The `0.x` entries below it are left exactly as they were.

---

## [1.0.0] – 2026-10-12 — The React rewrite, and everything built on top of it

The app was a set of server-rendered pages with vanilla JavaScript. It is now a React 19 + Vite
single-page application over the same Express + PostgreSQL backend — plus two new modules, an
item library and an inventory that did not exist before, a security pass, and a test suite that
did not exist either.

Nothing in the database was dropped or renamed to get here. Every schema change is additive
(`ALTER TABLE … ADD COLUMN IF NOT EXISTS`), so an existing install upgrades by pulling and
restarting — see **Upgrading** at the end.

---

### The rewrite

Migrated module by module, each one behind a `LegacyIframe` bridge that kept the original page
working until its replacement landed: User Panel, NPC Sheet, Item Cards, Split View, PDF Viewer,
Manage Campaigns, PC Sheet, the public PC sheet, the public Journey Map, the Journey Map editor,
and finally the Timeline. The bridge and every legacy page are now deleted.

- **React 19, React Router 7, Tailwind 3 and Vite 6**, over Express 5 on Node 24. Routes are
  lazy-loaded, so the first paint pulls the shell rather than the whole app.
- **Theme tokens are shared**, not duplicated — the three themes (dark / light / slate) are CSS
  variables that Tailwind utilities read, and `index.html` applies the saved one before React
  mounts so there is no flash.
- **One API layer** (`api/client.js`); every mutating call in the app funnels through a single
  `fetch`. That turned out to matter later — see *Security*.
- **Vite builds straight into `public/app/`**, which is what Express serves. It used to build to
  `frontend/dist` while the server read `public/app`, so a fresh build outside Docker served a
  dead page.

---

### New module — 📔 Diary

Session write-ups, with a public share link.

- **A campaign diary for the DM**, with a **draft → published** state. Only published entries
  reach the share link, filtered in SQL rather than hidden in the UI.
- **A private diary per player**, living on their character sheet rather than in a module of
  their own — it is part of the character. The DM can read them and never edit them.
- **Two tables, not one with a nullable `player_id`.** The public handler's SQL *names* the
  campaign table and nothing else, so leaking a player's private diary would take naming the
  other table, not forgetting a `WHERE` clause.
- **Entries group** under a chapter (campaign) or category (player), free text with a datalist of
  what you have already used. Groups collapse; unfiled entries collect at the end.
- **It prints as a book** — title page, contents, one session per page, Cinzel over Crimson, and
  an annex crediting the table.
- **Standalone export/import**, and the campaign bundle carries both diaries with their draft
  status and never the share token.

### New module — 📖 Campaign Journal

The shared notebook the per-player diary deliberately is not: everyone in a campaign writes, and
everyone reads. On the PC Sheet for players, and as a Manage Campaigns tab for the DM — the same
component mounted twice, not two copies.

Each entry records who wrote it (user *and* character, kept separate because the DM has no
character and a player may change theirs), where, an optional in-game date on the campaign's own
calendar, a free-text category, and the note in Markdown.

**The withholding is in the SQL, not in the component** — a row that was never selected cannot
leak through a later refactor:

- A player's query carries `AND j.dm_only = false` and does not select the column at all.
- A player cannot *post* a DM-only entry; `dm_only` is read as `isDM ? … : false`.
- A location the DM later makes private stops showing to players — **both its name and its id**,
  since the id alone would still reveal that two entries happened at the same secret place.

**Edit and delete are deliberately asymmetric.** Only the author may edit; the author *or* the DM
may delete. A DM tidying the campaign should be able to remove an entry, not rewrite a player's
words without them knowing.

Search and a **group by** selector (category, location, or who wrote it) sit above the list. The
search is substring, case- **and accent**-folded — these are notes full of Buldamar and Théa, and
half the time they get typed without the accents.

### New module — Item Cards, and items that evolve

The card creator never had a database table; it kept a print set in `localStorage` and lost it on
a cache clear.

- **A real library**, `item_cards`, scoped to a **user** rather than a campaign — you take your
  items between tables. Cards can be reopened and edited; export/import follows the existing
  file-naming convention.
- **Evolving items** are a chain of cards linked by `evolves_from`, bumped and un-bumped by a
  button on the inventory row. **The tier is never shown to the player**, by construction: every
  tier shares one name, and a player is served only the card their row points at. Reversing is
  the same operation backwards, because the route takes a target rather than a direction — an
  item can change hands and be reset.
- **Printing**: two-sided cards 9-up on A4, rarity-coloured borders, a print set that belongs to
  one sitting rather than outliving a logout, and batch PNG export as a lazily-loaded ZIP.
- **Search, grouping by rarity, collapsible groups**, multi-select, and a clear-the-library
  button. Deleting a card that is in play names its holders and asks before forcing.

### New — the PC inventory, as an equipment sheet

Two kinds of row, with the difference enforced by `CHECK` constraints rather than convention:

- **Granted items** — a magic item the DM assigned from their library. Unique per campaign.
- **Carried gear** — free-text rope, rations and potions, the only kind a player creates.

Coins, drag between equipped and carried, card previews on hover, **attunement that follows
equipping** with the 3-item limit enforced server-side, and a carrying capacity derived from
Strength rather than hand-set — a second copy of a derived number is only a way for the two to
disagree.

---

### Journey Map

- **Movement is derived from the Timeline.** You no longer draw a party's path or keep it in
  sync; it is read from where the timeline says people were.
- **Paths and routes are different things.** A *path* is a group's movement; a *route* is a road
  in a network, with three types (road, flight, maritime) that render differently. All distances
  are computed through the road network, including through cities hidden from players.
- **Roads are editable** — multi-point bending without adding anchors, points deletable with the
  neighbouring sections merging, names defaulting to their endpoints, draggable name plates.
- **Regions** are polygons rather than pins, locked by default so a click does not reshape them.
- **Pins are type icons you can resize**; labels declutter on overlap, are formatted per location
  type, and fall back to hover for the smaller ones.
- **The public map is player-safe**: routes are never drawn, hidden locations take their routes
  with them, and distances still compute correctly through the cities a player cannot see.

### Timeline

Party events the DM can flag, per-event player visibility, filter by date range, solo a single
player, search in every actor list, a legible date axis, **Go to Today**, and a public share link
that matches what you are actually sharing.

The DM's combined view names the actual actor on every event dot rather than labelling them all
`DM`, and resolves players who have no timeline of their own yet. `cp_<id>` and `npc_<id>`
references are remapped on both export and import — only `self_`, `p_` and `rel_` were, so DM
events pointing at campaign players or NPCs broke on re-import. *(This and the timeline search
boxes were written up as an untagged `0.1.1`; it never became a release, so it is folded in
here.)*

### Character and stat sheets

- **Relationships** condensed from a tall nested list into a compact matrix, with a graph that
  reduces edge crossings, fills the space, prints on its own, and no longer crashes on a
  conditional hook.
- **DM notes** as a compact grid of cards with per-note visibility, and notes marked visible are
  now actually visible to players.
- **HP designed around play**: current HP typed straight into the stats bar and nowhere else,
  temporary HP floating beside the label in blue only while there is some, a maximum and
  temporary maximum behind one dialog, and **⟳** to drop every temporary value and heal to full.
- **Stat boxes overwrite rather than edit.** Current HP, AC, Speed and the six ability scores
  clear when you click into them, with the old value left as a grey hint behind what you type —
  these numbers are replaced, not amended, and on a phone a caret landing inside `18` produced
  `118`. Clicking in and leaving without typing changes nothing; typing and deleting back to
  empty does clear it.
- **Passive Investigation**, caster type that follows the class, collapsible Legendary & Lair,
  and senses and languages that hold sentences and are rendered as such.

### Assisted entry from the SRD and Open5e

A whole stat block from one pick — 341 SRD monsters plus roughly 3,200 from Open5e — and the
same for classes, species and subclasses, where the picker merges three sources because the SRD
licenses only one subclass per class. Item Cards fill from the SRD too, with weapon and armour
stats and the descriptions that used to be missing.

### Printing

Printing was broken nearly everywhere and is now a feature:

- The PC Sheet PDF prints the **whole** sheet as a document, from plain markup rather than the
  editable tabs — it used to print textareas scrolled to the top and dark surfaces as solid
  blocks, and the stat block was clipped to about one screen because nothing consumed the
  iframe's height message.
- The stat block prints on its own, keeping its parchment design, sharp rather than blurry.
- A box that crosses a page break prints as two complete boxes.
- The player's diary prints with their sheet, starting on a fresh page.
- Item cards, the diary book, and the relationship graph each print standalone.

---

### Security

Four findings closed, each verified against a running server rather than by reading the source.

- **Authorization means something.** Six helpers now carry the whole policy and every
  id-bearing route calls one. Five hand-rolled inline checks became helper calls — three of them
  were wrapped in conditions that could not fire. Child ids are scoped to their parent, so a DM
  note or relationship addressed by a bare id can no longer be reached across campaigns.
- **The stats blob is validated.** `pc_char_stats.stats_json` took `JSON.stringify(req.body)`
  with no shape check. It now goes through a whitelist derived key-for-key from the sheet's own
  `collectSheet`, applied at all three write sites — the PUT *and* both import routes, which take
  the same blob out of an uploaded file. A test reads both files and fails, naming the field,
  when they drift: a whitelist in front of a character sheet is itself a data-loss risk, and this
  code has silently wiped saving-throw proficiencies that way before. A 209 KB hostile payload
  now stores as 21 KB.
- **Login is throttled** — 10 failures in 15 minutes, then 429 with `Retry-After`, keyed on IP
  *and* username together: IP alone locks out a household behind one NAT, username alone hands an
  attacker a way to lock an owner out of their own account. A **user-enumeration timing oracle**
  went with it; an unknown username used to return before doing any bcrypt work. Measured after:
  53.3 ms against 54.2 ms.
- **CSRF tokens on every mutating route**, as a synchroniser token in the session rather than the
  usual double-submit cookie — that needs a readable cookie, and the PDF viewer injects an
  unpinned pdf.js from a CDN into page scope. **No route is exempt**: `saveUninitialized` means a
  logged-out visitor already has a session, so login and logout are covered rather than carved
  out. The honest framing is that `SameSite=Lax` already blocked cross-site writes in current
  browsers; this is a second layer, not an open door being closed.

**Deliberately not done, and written down**: `trust proxy` stays unset (there is no reverse
proxy, and setting it makes `X-Forwarded-For` attacker-controlled and the limiter free to
bypass), `cookie.secure` stays false (there is no TLS), and session fixation on login is real and
still open.

### Data you do not lose

- **Campaign trash.** Deleting a campaign is reversible: a soft delete, hidden from every
  selector at once because one endpoint feeds them all, with public share links ceasing to
  resolve and a Trash section that restores or purges.
- **The campaign backup actually contains the gear.** The export pulled 13 tables and neither
  `inventory_items` nor `item_cards` — while the Danger Zone said *"export first if you want a
  copy"* and the cascade really did delete them. Bundle v5 carries the cards in play and each
  player's inventory, matched **by name rather than id** since a library belongs to a user, and
  **chains match whole or not at all** — every tier shares a name by design, so card-by-card
  matching was a one-in-three chance of handing a character the wrong version of their own sword.
- **PC sheet export/import round-trips**, and import is DM-only.
- **25 indexes** on the foreign keys the app actually filters by. The schema had one.

---

### Four bugs worth remembering

- **The import that reported success and discarded everything.** Catching a duplicate-key error
  inside a transaction without a `SAVEPOINT` poisons the whole transaction — Postgres then
  rejects every later statement and turns `COMMIT` into `ROLLBACK`. The route returned
  `success: true` with a campaign id for a campaign that no longer existed. Found by checking
  `psql`, not the response body. `test/transactions.test.js` now fails any `BEGIN…COMMIT` region
  that catches without a savepoint.
- **A player with two characters saw their campaign twice.** The player's campaign list joined
  through `campaign_players` — one row per character. Three characters, three identical entries,
  in every selector in the app, and the `length === 1` auto-select stopped firing for them. Now
  an `EXISTS` subquery, which asks the question actually being asked.
- **`category` and `weight` never reached an existing database.** A column added inside
  `CREATE TABLE IF NOT EXISTS` reaches only new installs. Every schema change since is a separate
  additive `ALTER`.
- **A build that broke while every test passed.** `StatInput.jsx` beside `statInput.js` is one
  path on a case-insensitive filesystem; Rollup died, Vitest did not notice, and on Linux the two
  files are genuinely distinct. `test/filenameCase.test.js` now looks for collisions directly.

---

### The app on a tablet and a phone

Pinch-to-zoom through one shared helper replacing three hand-rolled wheel ratchets,
`touch-action: none` where a drag surface needs it, four focus-preservation handlers converted
off `mousedown` (which fires before focus moves on touch), a `useCoarsePointer()` seam, a Finish
button for drawing paths and regions that could previously only be completed with a key, and
↑/↓ buttons where reordering relied on HTML5 drag-and-drop, which does not exist on touch.
Master/detail layouts below `lg` on the two pages that overflowed sideways.

### Build, bootstrap and tests

- **`run.sh` bootstraps a clean machine.** It used to refuse to start from a fresh clone, block
  on a `read` under CI, copy `.env` verbatim so `SESSION_SECRET` was never generated, publish the
  wrong `DB_PORT`, and skip deploying a rebuilt image. The container daemon is checked for
  liveness rather than presence, ports are preflighted, and the credential file is always
  removed.
- **Node 24 LTS**, a multi-stage Dockerfile, and `DB_PASSWORD` out of the two places it was
  hardcoded.
- **The server no longer accepts requests before the schema exists** — `initializeDatabase()`
  used to race the listener.
- **A test suite.** 718 tests across 35 files, Vitest, no DOM — the rules worth testing are
  lifted out of components as pure functions and the server suites read `app.js` as text. It
  found real bugs on its first run. `run.sh` runs it before it builds.
- **ESLint, actually installed and passing.** The repo declared a `lint` script and had no
  eslint.
- **Docs**: `TODO.md` split into open work and a QA queue (`TOQA.md`), `ARCH.md` corrected
  against the code, and a README per module.

---

### Upgrading from 0.1.x

1. `git pull && ./run.sh` — the schema migrates itself on boot; every change is additive and no
   column or table is dropped or renamed.
2. **Sessions are invalidated** on every restart (they live in memory), so everyone logs in
   again. The CSRF token rotates with the login, and the frontend replays once on a stale token,
   so this is invisible.
3. **Re-export any campaign backups you are relying on.** Bundles taken before this release do
   not contain item cards or inventory. Older bundles (v2–v4) still import.
4. The page you bookmarked still works: every route kept its path.

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
