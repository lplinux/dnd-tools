# TODO

## Planned features (not started)

Captured for later — nothing here has been designed or scoped yet.

### NPC Management — a new module, or a section of Manage Campaigns

- [ ] **Manage NPCs and other characters properly**, the way LoreForge does — somewhere richer
      than the current `campaign_npcs` table, which holds little more than a name.
- [ ] **Public and private information per NPC**, so a DM can write everything down in one place
      and reveal only part of it. The split should work the way it already does elsewhere in the
      app: *withheld server-side*, not merely un-rendered — see the PC sheet's
      `public_info` / `private_info` and the diary's draft/published handling for the pattern.
- [ ] Decide **module vs. tab**: Manage Campaigns already has an NPCs tab, and the Journey Map,
      Timeline and character tree all reference NPCs by id. A separate module means another
      campaign selector; a tab means a very large tab. Worth settling before building.
- [ ] Open question: what do players see, and *where*? A read-only NPC view would need its own
      access rule (every campaign member? only NPCs they have met?) and probably a share link,
      like the other public views.

### PC Sheet — inventory management

- [ ] **Track a character's items**, with quantities and equipped/carried state.
- [ ] **Pull item information from the SRD** (and Open5e), reusing the lookup that already backs
      Item Cards' *Load from SRD* — `api/srd.js` + `api/open5e.js` + `magicItemToCard` in
      `data/srdMap.js` already fetch and flatten magic items; the inventory wants the same data
      against a different shape.
- [ ] **Cards for non-official items**, ideally linked to the Item Cards module rather than a
      second parallel editor. Note the obstacle: Item Cards is currently **localStorage-only and
      entirely client-side** — nothing it makes reaches the database. Linking inventory to it
      means giving item cards server-side storage first, which is the real work in this item.
- [ ] Open question: is an inventory item a free-text row with an optional link to an item card,
      or always a card? The first is far cheaper and probably right to start with.

---

## React Migration (v4.0.0)

**This migration is complete** — every module below is ✅, the legacy
`public/<module>.html` pages are deleted and `LegacyIframe` no longer exists.
Kept as a record of what moved and when; nothing here is outstanding.

### Module migration order (suggested — most self-contained first)

- [x] **UserPanel** (`pages/UserPanel.jsx`) ✅ — fully migrated in v4.1.0
- [x] **NpcSheet** (`pages/NpcSheet/`) ✅ — fully migrated in v4.2.0
- [x] **ItemCards** (`pages/ItemCards/`) ✅ — fully migrated in v4.3.0
- [x] **SplitView** (`pages/SplitView/`) ✅ — fully migrated in v4.4.0
- [x] **PdfViewer** (`pages/PdfViewer/`) ✅ — fully migrated in v4.4.0
- [x] **ManageCampaigns** (`pages/ManageCampaigns/`) ✅ — fully migrated in v4.5.0
- [x] **PcSheet** (`pages/PcSheet/`) ✅ — fully migrated in v4.6.0
- [x] **JourneyMap** (`pages/JourneyMap/`) ✅ — fully migrated in v4.9.0
      (idiomatic SVG rewrite; reuses the `components/map/` renderer)
- [x] **PcPublic** (`pages/PcPublic.jsx`) ✅ — fully migrated in v4.7.0
- [x] **JourneyMapPublic** (`pages/JourneyMapPublic/`) ✅ — fully migrated in v4.8.0
      (built the reusable `components/map/` renderer — MapStage + SVG layers)
- [x] **Timeline** (`pages/Timeline/`) ✅ — fully migrated in v4.10.0
      (idiomatic SVG Gantt; personal + campaign + public modes)
- [x] **TimelinePublic** (`pages/TimelinePublic/`) ✅ — fully migrated in v4.10.0

> 🎉 React migration complete — every module is React-owned; no `LegacyIframe`
> stubs remain. The in-app DM combined read-only view is wired (v4.10.0).

### Production build wiring

- [x] Add SPA catch-all route to `app.js` ✅ — done in v4.1.0
- [x] Serve `public/app/` as static assets ✅ — done in v4.1.0
- [x] Multi-stage `Dockerfile` builds React frontend ✅ — done in v4.1.0
- [x] `run.sh` installs frontend deps and builds before Docker build ✅ — done in v4.1.0
- [x] Build output path reconciled ✅ — Vite now writes straight to `public/app/`,
      so `cd frontend && npm run build && node app.js` works. It previously wrote
      to `frontend/dist` and only the Dockerfile copied it across, so running the
      server outside Docker 404'd every React route and served a dead fallback page.

### Legacy cleanup

- [x] Delete `public/index.html`, `public/app.css`, `public/theme.css` ✅ — the
      fallback page loaded a `header-component.js` that no longer existed, and
      `theme.css` duplicated every token already in `styles/globals.css`.
- [x] Remove the orphaned `/api/timeline-private/*` routes and their client
      methods ✅ — the DM private journal runs on `/api/player-timelines/*`.
- [x] Remove dead exports ✅ — `api/index.js` barrel, `resourceForTagKey`,
      the unused `ModalField` component (its `FIELD_*` constants stay),
      `requireRolePage` / `requireAuthPage`, `usePcSheet.importSheet`,
      `journeyMapsApi.updateScope` and its route, four empty brace-expansion dirs.

---

## Refactor (existing — carry forward)

### General

- [x] Pressing "Enter" key should not trigger a lot of submits but only the ones I'm writing or I have open ✅ v4.20.0
      Two separate causes. (1) Every open `<Modal>` listened on `window`, so with
      more than one open they all reacted to the same keypress — and that happens
      routinely, because `ConfirmContext` renders a `<Modal>` of its own, so any
      confirm raised from inside a dialog stacks on it. Enter settled the confirm
      *and* submitted the form underneath; Escape closed both at once. Modals now
      keep a stack and only the topmost handles keys. (2) `NewMapModal` and
      `NamingModal` each declared `onSubmit` on the Modal *and* an `Enter`
      handler on their inputs, so one keypress ran the action twice — a second
      journey map, a second save. The redundant input handlers are gone.
- [x] "Information" modal should be closed when clicking outside the modal ✅
      (`components/ui/Modal.jsx` — backdrop click + Escape; the legacy pages it
      asked about no longer exist)

### Journey Path Map

- [x] Refactor Distance Matrix: instead of distance between locations, build a `Route System` where routes are drawn and distance is set by `Route Section` ✅ v4.13.0
      (Routes = a tracker-free road network — road/flight/maritime types, map-only
      waypoints that don't create campaign locations, per-section distances. Paths =
      tracker movement, reverted. One Draw tool with a Path|Route toggle.)
- [x] Route network: compute the real distance between any two locations via shortest
      path over the drawn roads (uses the per-section distances) ✅ v4.13.0
      (geometry.networkDistances/effectiveDistances; feeds paths, measure, matrix, proximity)

### Timelines

- [x] Add a filter by date so timeline could show only a specific timeframe ✅ v4.20.0
      (⏳ in the zoom row opens a From/To picker; either bound may be left off for an
      open end. An event is kept when its span **overlaps** the window, not merely when
      it starts inside it, so a long journey already under way still shows. A chip in
      the toolbar names the range and the kept/total count, with one click to clear —
      a filtered timeline is otherwise indistinguishable from an empty one. Fit frames
      the filtered set. View-only: it never touches stored data.)
- [x] Add a button to "Go to Today" ✅
      (📅 beside Fit; `scrollToToday()` on the canvas handle, reusing the same
      centring as `scrollToEvent`. Disabled when no marker is set. Also added to
      the public timeline — which required the public API to return
      `today_marker` at all, so that view now draws the marker too.)

---

## UX — refresh & scroll preservation

Some mutations refetch all data and re-render behind a full-tab loading spinner, which
unmounts the content and resets scroll to the top (and, in the Char Tree, resets the graph
zoom/pan). Fix by updating local state optimistically — or at least NOT toggling `loading`
on a post-mutation refresh — following Timeline/JourneyMap, which already do this.

- [x] Manage Campaigns: stop the full-tab spinner on post-mutation `reload()` ✅ v4.18.0
      (`loadCampaign(id, { silent })`; `reload()` is now silent — spinner only shows on
      initial select / campaign switch. Fixes the scroll jump on player add/delete/reassign,
      location add/edit/delete/toggle-visibility, NPC add/delete, timeline create.)
- [x] `toggleLocVisibility` / `toggleConnVisibility` flip the flag in local state ✅ v4.18.0
      (optimistic flip, no refetch; reverts + toasts on error.)
- [x] Char Tree tab: connection add/edit/delete/toggle no longer remount the tab ✅ v4.18.0
      (silent reload for add/edit/delete, optimistic flip for toggle; the canvas now
      auto-fits only on first mount and keeps the user's zoom/pan on later changes.)
- [x] PC Sheet: `toggleRelVisibility` updates local state instead of re-listing ✅ v4.18.0
      (`addRelationship`/`editRelationship` still re-list on purpose — they need the
      server-assigned ids + recomputed `cross_connections`; neither causes a visible jump.)
- [x] UserPanel: role-change and delete now patch their row locally ✅ v4.20.0
      (`useAsync` already exposed `setData`. Both know the exact resulting value, so a
      refetch bought nothing. **Create still refetches on purpose**: its response
      returns only id/username/role while the table also shows Email and Created, so
      appending locally would render two blank cells or force an invented timestamp.)
- [x] General: scroll preservation audited app-wide ✅ v4.20.0
      (Every remaining `loading`-gated unmount was checked and each is an *initial* load,
      an explicit Refresh, or a deliberate context switch — player change, campaign
      switch — where resetting scroll is the correct behaviour. Manage Campaigns already
      keeps its scroll container outside the spinner swap; PC Sheet's relationship and
      note mutations are all local or optimistic. No post-mutation refetch remains that
      unmounts a pane. The audit did turn up one real defect: `addDmNote` appended while
      the API returns notes newest-first, so the list silently reordered itself on the
      next load — now prepends.)

---

## Fixes (existing — carry forward)

### Item Card

- [x] Item Card form fields should reset when "Item Type" is changed ✅ — fixed in v4.3.0

### PC Sheet

- [x] Caster Type should be blocked depending on the selected Class ✅
      (locked when the class decides it — Full/Half/Warlock lists in `data/dnd.js`;
      left editable for a blank class, Multiclass, and the martial classes, because
      an Eldritch Knight Fighter and an Arcane Trickster Rogue are third casters.
      The old code forced `none` for those, which blocked exactly that.)
- [ ] Prepare for Multi-Class
- [x] Add Button to the HP to add temporary Hit Points and Temporary Max Hitpoints ✅ v4.20.0
      (a `+` on the HP label reveals TEMP HP and TEMP MAX HP; they auto-reveal for a
      sheet that already carries either, so a loaded character never hides the value
      behind a click. Stored in `stats_json` as `temp_hp` / `temp_max_hp`. Behind a
      toggle because most characters never have either, and two permanently empty
      boxes in the core stats bar is clutter on every sheet to serve a few.)
- [x] Add Button to print the Character Sheet when inside a PC Sheet. ✅
      (🖨 Print in the **Stats Sheet toolbar**, beside 💾 Save Stats and 🗑 Clear.
      It prints the stat block ALONE, in its parchment design, by printing the
      embedded sheet's own document. The header PDF button remains the
      whole-character-sheet print, and no longer includes the stat block.)
- [x] Fix the PC Sheet PDF generation for the whole PC information ✅ — four causes:
      1. **The Stats iframe was frozen at 900px.** The embedded sheet posts its real
         height (`IFRAME_RESIZE`) but nothing listened — the message appeared exactly
         once in the repo, at the sender. An iframe prints only its own box, hence
         "only what fits on a screen". `StatsTab` now sizes the frame from it, and
         `pc-print.css`'s `min-height:1500px` override (silently beaten by the inline
         900) is gone.
      2. **Viewport-capped panes.** `max-h-[42vh]` (relationships), `max-h-[45vh]`
         (DM notes) and `height:70vh` (graph) resolve against the *page* in print, so
         each printed at most half a page. Unclipped in `pc-print.css`.
      3. **Textareas printed only their `rows`.** Same fix the NPC sheet already had.
      4. **An 800ms guess** before `window.print()`, inside which the print copy had to
         load a route, boot React and handshake. Now waits for the frame's own ready
         signal, with the timeout as a backstop. The print copy's `StatsTab` also had
         no `key`, so a stale iframe could survive a player switch.
      5. **The print document reused the editable tabs**, which is why the first attempt
         still looked wrong: the PDF contained live form controls, so long text printed
         as a scrolled textarea, and the app's dark surfaces printed as opaque blocks.
         It now renders plain markup — headings and text, no `<textarea>`, no buttons —
         on an explicit light palette, with headings kept on the same page as the text
         they introduce.
      6. **The stat block is no longer part of this PDF at all** — it has its own print
         button in the Stats toolbar, so including it here duplicated it. Sections also
         stopped forcing a page break each, and the page margin is now set explicitly.

### Manage Campaign

- [x] Reorganize the Graph with every new connection so lines doesn't cross too much ✅ v4.12.0
      (player columns ordered by cross-connection affinity, NPC row by median peer X)


### Timeline

- [x] **Editing an event silently rounds its duration.** ✅ v4.20.0
      The edit form pre-filled with `formatDuration(ev.durationDays).replace('~','')` and
      parsed it back on save — but `formatDuration` is approximate above 30 days. A 45-day
      event formatted to `~2m`, stripped to `2m`, and parsed back as **60 days**, so opening
      the modal and saving without touching the duration changed it. The form now pre-fills
      the exact day count (`45d`); typing `3m` or `2y` still converts on save, only the
      pre-fill changed. (Found by the new test suite; `data/calendar.test.js` now asserts
      the corrected round-trip for 1…1000 days.)

## Bug fix

### General
- [x] Double `login` button on the header. Only the Right one should stay ✅ v4.11.0
- [x] Order for index: NPC Sheet -> Item Cards => Split View => Timeline => PDF Viewer => PC Character Sheet => Manage Campaigns => Journey Map ✅ v4.11.0

### Scripts
- [x] `npm run create-admin` password should be hidden when typing ✅ v4.11.0
      (a second readline interface was echoing it; now mutes the single interface)

### npc-sheet module
- [x] Print form only shows what's on the screen. Should print everything ✅ v4.11.0
      (round 2: the app shell capped #root/main to the viewport with overflow;
      global print rules now unclip the shell + hide the header)
- [x] Double `+` on prof and initiative ✅ v4.11.0
- [x] Ability Scores SV are not centered/aligned with the modifier ✅ v4.11.0
- [x] Improve readibility for senses and languages. Letter is to big. ✅
      (the two fields that hold sentences now carry a `cs--text` modifier — body
      face, .78rem, left-aligned — while the seven short numeric fields in that
      bar keep the 1rem display face they were sized for.)
- [x] Type to search block is very big and it looks ugly ✅
      (root cause was a specificity collision: `.npc-sheet .field input[type=text]`
      — 50px min-height, own border and fill, `width:100%` — matched exactly one
      element in the sheet, the TagInput's search box, and beat `.tag-input` on
      every shared property. So each tag box drew a second bordered box inside
      itself and pushed chips onto their own line. The rule is now split from the
      textarea rule and scoped to direct children; the five boxes also got real
      placeholders instead of "Type to search…" five times.)
- [x] Senses and Languages moved into `Traits & Features` ✅
      (as compact one-line fields; Languages keeps its SRD picker and its
      append-don't-replace behaviour. The stats bar's grid was hard-coded to
      `repeat(8, 1fr)` and is now 6, so no empty columns. Pure UI move — both are
      plain `stats_json` strings, no schema change. The `cs--text` rule added in
      the previous round is now dead and removed.)
- [x] Allow for the `Legendary & Lair` to be hidden ✅
      (auto-hidden when all four pieces of its state are empty — `legActions`,
      `lairActions`, `specialAbilities` and the `legRes` checkbox array — with a
      "+ Legendary & Lair" reveal for sheets that have none yet, and a "− Hide"
      on the section title to put it away again — offered only while the section
      is empty, since hiding real content would be wrong. Nothing is persisted:
      the content is the durable signal, which avoids adding a `stats_json` key
      that has to be hand-mapped in two places. Loading a dragon from the SRD
      reveals it; loading a goblin does not.)

### pc-sheet module
- [x] Export → import round-trip is now safe ✅ — bundles are `version: 2` and
      declare a `scope`:
      - **`scope: 'full'`** (DM export) carries `private_info` and every DM note.
      - **`scope: 'player'`** omits both keys *entirely* rather than blanking them.
      Import writes a field only when the bundle actually carries it, which fixes
      all three defects: `private_info` survives a player-produced bundle, DM notes
      are replaced (not appended, so no more 2 → 4 → 6 doubling) and only from a
      full export, and relationships now round-trip `parent_id`, `is_dm_only`,
      `status_label` and `created_by_role` instead of flattening the family tree.
      **Importing is DM-only** (`requireRole(['dm'])`), through Manage Campaigns →
      Import. A player can still export their own sheet; it just contains no DM
      notes at all.
- [x] 🌳 Family Tree & Relationship Matrix is too big. Condensed the table ✅ v4.11.0
      (round 2: relations list capped 30vh, graph 240px/34vh)
- [x] DM Notes are also too big. ✅ v4.11.0 (round 2: capped 35vh)
- [x] Generate PDF doesn't work. Should print all the pages of the pc-sheet ✅ v4.11.0
      (round 2: prints a combined all-tabs print document, not just the active tab)

### Journey Map

- [x] Regions, pinned locations, paths are not shown in the map ✅ v4.11.0
      (round 2: React <img onLoad> race — data-URL map decoded before the handler
      attached, so `loaded` stayed false and the layer gate hid the SVG; MapStage
      now detects an already-complete image)
- [x] By default, all tools in the menu should be collapsed ✅ v4.11.0
- [x] Distance Matrix should fit the whole screen when opened ✅ v4.11.0
- [x] Pick location should be at the beginning of the list so it's easier to select ✅ v4.11.0

### Manage Campaign module

- [x] Reorganize the Graph with every new connection so lines doesn't cross too much ✅ v4.12.0
      (crossing-reduction layout: shared `components/graph/ordering.js` — min-crossing
      player order + median NPC order; PC Sheet ego graph also reduced via fan extremes)

### timeline module
- [x] Today marker should be moved on top of the menu ✅ v4.11.0
- [~] By default, all tools in the menu should be collapsed — already collapsed by
      default in code; if seen expanded it's remembered `ht-ui` localStorage from a
      previous session (clearing it restores collapsed). No code change.
- [x] Search event, type of timeline, selector for table/timeline graph, zoom, etc, should be on a line as a menu ✅ v4.11.0
- [x] I can't select a campaign when moving to the private timeline ✅ v4.11.0
      (round 2: the campaign selector bar was permanently `display:none` — the
      `.priv-sel-bar` needed the `.visible` class the legacy JS used to add)
- [x] Fit button doesn't fit the timeline ✅ v4.11.0
      (round 2: content height is linear in ppd — H = A·ppd + B; the old rescale
      ignored the fixed B term and always overflowed. Now solved exactly.)
