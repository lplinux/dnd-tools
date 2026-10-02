# Changelog

All notable changes to **dnd-tools** are documented here.
Changes are derived from inspecting the actual diffs. NOTE: everything from
4.0.0 up is marked *Unreleased* and is not tagged — the newest tag is `0.1.0`.
Only the 0.x entries correspond to GitHub releases.

---

## [4.20.0] – Unreleased — Linting, tests, and indexes on every foreign key we query

### Fresh clone was broken in two places

Neither showed up locally, because both are masked by files that exist on a developer machine and
not in the repository. Both were found by actually checking out the tree into an empty directory
and running it, rather than by reading the scripts.

- **`run.sh` refused to start from a clean clone.** Its repo-root guard required `public/` to
  exist — but `public/` is gitignored Vite build output, so on a clone it does not, and the script
  aborted with *"Please run this script from the dnd-tools repository root"*, which was false: it
  *was* the root. The guard now tests only `app.js` and `frontend/`, both of which are tracked.
  This is also why deleting `public/` locally appeared to break the script; the build step would
  have recreated it perfectly well, but the guard never let execution get that far.
- **`docker compose build` could not work from a clean clone either.** `.gitignore` ignored
  `package-lock.json` (no leading slash, so it caught `frontend/package-lock.json` too) while the
  Dockerfile ran `npm ci`, which fails hard without a lockfile. It only ever worked because the
  untracked local lockfile sat in the build context. The lockfiles are now tracked, and the
  frontend stage was tightened from `npm install --legacy-peer-deps` to `npm ci --legacy-peer-deps`
  — it had been resolving fresh transitive versions on every image build, so the container was
  never built from the dependency tree the tests passed against. Verified end to end: a full image
  build from an empty checkout, both `npm ci` steps passing.

Also corrected, all of them comments that contradicted the code a few lines away:

- `frontend/vite.config.js` claimed the build "outputs to `dist/`"; it has written to
  `../public/app/` since the output path was moved.
- `README.md` described `public/` as holding shared assets and a fallback `index.html`, both
  deleted during the React migration — while a later section in the same file described it
  correctly.
- `.dockerignore` carried a dead `ARCH` line, and now says explicitly that its `*.md` rule must
  not be "tidied" into `**/*.md`: Docker matches `*.md` at the root only, so `docs/*/README.md`
  survives into the image, and broadening it would silently break every in-app docs page.
- `TODO.md` still instructed the reader to "delete the `LegacyIframe` call from its page file",
  twenty lines above the entries recording that the migration finished.
- `run.sh`'s header listed 15 steps while the script printed `N/11` banners.

An audit of the working copy alongside this found **no stale files at all** — no orphaned frontend
modules, no surviving legacy HTML, no duplicate configs, no stray caches or lockfiles. The only
disposable thing on disk is `node_modules/`.

### New module — 📔 Diary

- **Every export is named the same way**, and by one helper rather than five copies:

  ```
  <module>[-<campaign>][-<name>]-<YYYY-MM-DD>.json
  campaign-the-last-performance-2026-10-02.json
  character-leruhy-teudis-2026-10-02.json
  ```

  Each of the five hooks previously had its own copy of the Blob/anchor dance and its own idea of
  a filename — `teudis.json`, `journey-map-x.json`, `leruhy-campaign.json` — so a folder of
  exports gave no clue what any of them were or when they were taken. The date matters most:
  these are backups, and backups that cannot be ordered are hard to trust. It is the **local**
  date, not UTC, so a file saved late in the evening is not dated tomorrow.
  - Accents are folded rather than dropped (`Ailyssë` → `ailysse`), names are capped so a long
    title cannot blow up the filename, and absent parts are omitted instead of leaving double
    hyphens.
  - The module prefix is cosmetic: the importer routes on the `type` field inside the bundle, so
    renaming a download changes nothing.
  - 9 tests cover the naming, including the local-vs-UTC date boundary and the accent folding.

- **The PC Sheet's PDF now includes the player's diary, starting on a fresh page** — so the sheet
  and the journal can be separated once printed. It is the only section that forces a break, and
  it renders only when there are entries: an empty one would cost a blank page, which is the exact
  failure the old per-section breaks were removed for. Diary bodies are markdown rather than the
  plain text the rest of the sheet holds, and an entry is allowed to break across pages (long
  prose, orphan/widow protected) unlike the short blocks above it. The diary is fetched at print
  time, since the sheet does not otherwise load it; a failure there costs the diary section, not
  the printout.
- The home tile is **Campaign Diary**, and sits beside Manage Campaigns.

- **A player's diary moved onto their character sheet** (PC Sheet → 📔 Diary). It is part of the
  character, and a player had no reason to visit a separate module that showed them nothing else —
  the campaign diary there was never theirs to see. `/diary` is consequently **DM-only** now. The
  DM reaches one player's diary from their sheet, read-only, or all of them from the module.
- **Each player gets their own sub-tab** in the DM's Player Diaries view. Stacking every diary in
  one scroll made it impossible to read any single one.
- **Entries are compact cards in a grid** rather than full-width rows — a campaign runs to dozens,
  and the list had become a scroll. A card carries enough to recognise an entry and opens the full
  text on click, rather than expanding in place and reflowing the grid under the pointer.
- **Draft/Published is one control, not a badge beside a button.** The state and the way to change
  it were always the same thing; now the badge *is* the toggle. It stays a plain badge where the
  view is read-only.
- **Groups collapse**, individually or all at once. The component tracks which groups are *shut*
  rather than which are open, so a group created later appears instead of hiding silently.
- **The printed book credits the table and ends with an annex of the party** — the DM's name and
  characters on the title page, then a portrait and public bio for each character at the back.
  The roster is a separate fetch made only when printing: portraits are base64 and have no
  business loading on every page view of a diary nobody is printing. It returns `public_info`
  only, the same material the public PC sheet already exposes, and a failed fetch costs the annex
  rather than the book.

- **Fixed: publishing or unpublishing an entry returned a 500.** The status update used `$1` both
  as the value for `status` and in a comparison, so Postgres inferred `varchar` from one and `text`
  from the other and rejected the whole statement with *"inconsistent types deduced for parameter
  $1"*. Reported as an unpublish bug; it was failing in **both** directions, and had simply never
  been exercised because the imported entries arrived already published. Fixed with explicit
  `::varchar` casts, verified against a real PostgreSQL including that `published_at` is still set
  once on first publish and preserved across unpublish/republish.
- **Diary entries are grouped.** The campaign diary by **chapter**, a player diary by **category** —
  free text with a datalist of values already in use, so a new group is one keystroke away. Groups
  render in first-appearance order (your session ordering decides the arc, not an alphabetical
  sort), and ungrouped entries collect at the end rather than being hidden. A list that is entirely
  ungrouped renders flat, without a pointless heading.
- **The public diary reads a page at a time.** One entry per view, numbered jump buttons,
  Previous/Next, and the page in the URL so a reader can bookmark or link the exact session being
  discussed. Chapters show above the title.
- **Better typography.** `###` is now the in-entry sub-heading, styled to sit clearly below the
  session title instead of competing with it, and the reading view gets a larger size and looser
  rhythm than the app's dense panels. In the printed book, an entry whose body opens with a single
  italic line has it lifted into the header as a subtitle — left in the prose it became the first
  paragraph and **the drop cap landed on it**, so a page opened with a giant "1" taken from
  "16 - Eleint".

- **The diary now has its own export file, and prints as a book.**
  - **Standalone export/import.** `⬇ Export` on the Diary page downloads a
    `type: 'campaign-diary'` bundle; importing goes through the usual Manage Campaigns hub. The
    diary still rides in the full campaign bundle as well, so a campaign restore does not lose it
    — the standalone file is for moving a diary on its own.
  - **The diary import REPLACES rather than merges**, which makes it the only destructive branch
    in the import hub. That is deliberate: a merge would double every entry on a second import of
    the same file. It therefore asks first, and names real numbers — *"Replace this campaign's
    diary with the 12 entries in this file? Its current 5 entries will be permanently deleted."* —
    because "are you sure?" with no counts is not a decision anyone can actually make. The route
    validates `bundle.type` **before** the delete and runs the whole thing in a transaction, and
    it checks that server-side rather than trusting the hub, since the endpoint is reachable
    directly.
  - **⬆ Import on the Diary page too**, beside Export — the same shortcut the Players tab has for
    PC sheets. The Manage Campaigns hub stays the general entry point; this is the one you reach
    for when you are already looking at the diary you are about to replace. It carries the same
    type check and the same counted confirmation.
  - **🖨 Print book** — title page, contents, one session per page, Cinzel headings over Crimson
    Text with a drop cap opening each entry. Published entries only, on the DM's page and on the
    public link, so a reader can keep their own copy.

- **The book prints from its own window, and that is the whole design.** Vite leaves a lazily
  loaded route's stylesheet in the document after you navigate away, so an `@page` rule in a diary
  stylesheet would silently become global and change the PC and NPC sheets' margins — and *naming*
  the page to confine it is exactly the bug that produced blank first pages twice already. A
  separate document has its own page context and cannot leak. It also drops three other traps for
  free: no theme tokens in scope (nothing prints as a dark block), no dependence on the positional
  `#root > div` un-clip chain, and no component mounting twice with live side effects.
  - A happy side effect: `renderMd`'s Tailwind classes are inert in a document that never loads
    the app's CSS, so the book stylesheet styles semantic elements instead of fighting `text-gold`.
  - It waits on `document.fonts.ready` rather than guessing with a timeout — the fonts are
    Google-hosted with `display=swap`, so printing too early renders the whole book in Georgia.
    Nothing else in the repo does this yet.
  - Deliberately **no** `break-inside: avoid` on an entry (long prose; forcing it whole leaves a
    third of a page blank), **no** texture or opacity overlay (it makes the print engine rasterise
    the text beneath it), and a `:first-of-type` guard so the first entry emits no leading blank page.
  - **No page numbers or running headers.** Chrome implements neither `counter(page)` in `@page`
    nor margin boxes, so they are not achievable from CSS here; the docs say so rather than
    shipping something that silently prints nothing.
  - 16 new tests cover the builder as a pure string: drafts never appear, a `<script>` in a title
    or body comes out escaped, the first entry carries no page break, and a bad date does not
    print "Invalid Date".

- Fixed pre-existing doc drift: the campaign bundle was documented as v3 in four places while
  `app.js` has been emitting v4.

Session summaries, in two halves with deliberately different privacy.

- **Campaign diary (DM).** Write-ups per session, with a **draft → published** state. Players
  cannot see it in the app at all — not in a hidden tab, not in a request they could read. It
  leaves the server only through a **public share link**, and only published entries do.
- **Player diaries.** One per player, private to them. The campaign's DM can **read** them; no
  other player can, and **nobody but the owner can write** them. That asymmetry is deliberate:
  reads reuse `canAccessTimeline` (owner OR their DM OR admin), writes use a narrower
  `ownsPlayer`, because a diary the UI calls private should not be editable by someone else.
- **One public link per campaign**, stable on re-request so a link already pasted into Discord
  keeps working — unlike journey-map shares, which rotate. Revoking is a separate, labelled action
  that warns the old URL will stop opening.

Three decisions worth recording, because each closes a leak by construction rather than by
remembering to check:

- **Two tables, not one with a nullable `player_id`.** The public handler's SQL *names*
  `campaign_diary_entries`; leaking a player's private diary to an anonymous reader would require
  naming the other table, not forgetting a `WHERE` clause. `player_timeline_entries` is the
  counter-example — its merged shape forces an `is_party` check on every read path and an
  `AND false` in the public handler.
- **Drafts are filtered in SQL**, and the public endpoint selects an **explicit column list**
  rather than `*`, so a DM-only column added to the table later cannot start leaking merely by
  existing. It is also session-blind, so what the link returns is reproducible with a cookie-less
  `curl`.
- **Entry mutations are scoped `WHERE id=$n AND player_id=$n AND campaign_id=$n`.** The ownership
  guard only proves the caller owns the player they *named* — this is what stops them naming their
  own player while addressing another player's entry id.

Supporting changes:

- **The markdown renderer is now shared.** It was inlined in Home's docs modal; it is now
  `components/ui/renderMarkdown.js` plus a `<Markdown>` wrapper, used by the docs modal, the diary
  editor preview, the DM's lists and the public page. One renderer, one safety argument.
- **Links are new, and are the only place user text reaches an HTML attribute**, so they get an
  allowlist (`http://`, `https://`, site-relative `/`) plus quote escaping, which the existing
  three-character escape does not do. A rejected URL renders as literal text. A test caught that
  the first allowlist accepted `//evil.example.com` — a *protocol-relative* URL that looks local
  and is not — before it shipped.
- **Campaign export carries both diaries**, draft status included, and never the share token: the
  import creates a new campaign, so a carried token would collide on `UNIQUE` or resolve an old
  URL to new content. Bundle `version` 3 → 4; v3 bundles still import.
- New `test/diaryPrivacy.test.js` asserts the privacy boundary against app.js as text — the public
  handler never names the player table, filters drafts, selects no `*`, and every player-diary
  mutation is doubly scoped. Verified it fails by injecting both leaks and watching it catch them.

### Small fixes

- **Fixed: sharing a single timeline returned 403.** The new
  `GET /api/player-timelines/:timelineId/public-token` was registered *after*
  `GET /api/player-timelines/:campaignId/:playerId`, and Express matches in registration order —
  so every call hit the older handler with `playerId="public-token"` and failed its access check.
  Moved above it, where `/all`, `/entries` and `/export` already sit for the same reason.
  - Added a test that reads the route table out of `app.js` and fails if any route is shadowed by
    an earlier parameterised one. It confirms nothing else in the app is currently unreachable, and
    it checks itself against the exact pair that broke. The suite now covers the backend too
    (`test/`, no server needed) — 72 tests.
- **Stat sheet: HP redesigned around the effective totals.** The bar now reads
  **current / max** with **Temp HP** and **Temp Max HP** beside it, and the figures shown are the
  effective ones — current **+** temp over max **+** temp max. Each half turns green only while a
  temporary value is affecting *it*, so a character with temp HP and an untouched maximum does not
  read as though both changed. All four values are edited in a **✎ Manage HP** dialog instead of
  the previous inline expansion: with one editing surface, no box has to be both a derived readout
  and an input, which is what made the earlier version ambiguous.
  - Current and maximum HP are now separate fields (`hp`, `max_hp`). Sheets that kept both in one
    box as `"27/40"` are split on load, so existing characters land in the new pair instead of
    showing `27/40` as their current HP.

- **Timeline: the DM decides which events the players can see.** Every event now carries
  `visible_to_players`, and a DM-authored event **starts hidden** — 👁 in the Events list reveals it
  when the party learns of it. It is filtered in SQL on every read path (per-timeline list, party
  list, public share), so a hidden event never reaches a player's browser rather than merely going
  unrendered. An event a *player* writes on their own timeline starts visible: defaulting that to
  hidden would stop them seeing what they had just typed.
  - The migration adds the column with `DEFAULT true` and only *then* switches the default to
    `false`. That order is the whole point: it backfills every existing event as visible, so
    nothing players can already see vanishes on upgrade, while everything created afterwards starts
    hidden. Verified against a real PostgreSQL — existing rows came out visible, new inserts hidden,
    and a second boot neither re-backfilled nor re-revealed anything.
- **Timeline: the public share link now matches what you are sharing.** It was always the
  campaign-wide token, so "share this player's timeline" silently handed over *every* timeline in
  the campaign. Selecting a single timeline now produces a token scoped to that timeline alone
  (`player_timeline_shares`), which also excludes campaign-wide party events; the combined view
  still shares the campaign. The copy confirmation names the scope, since the two links are
  indistinguishable by sight. The new table sits alongside the old one rather than relaxing its
  `NOT NULL UNIQUE campaign_id`, which would have put existing share links at risk.
- **Timeline: a player can filter and search by their cross-connections.** `loadActors` pulled only
  a player's own relationships, so an event tagged with a connected NPC or another party member had
  no row to search, solo or hide, and its colour dot resolved to nothing. The far end of each
  cross-connection is now an actor. The API already returns only `is_public` cross-connections to a
  player, so this surfaces exactly what the DM shared.
- **Timeline: the Locations list shows only locations that still have events**, after *all* filters
  — the date range plus the per-player eye toggles and solo. A "Show N without events" button keeps
  empty locations reachable for reorder and delete, and drag-reorder is disabled whenever the list
  is a subset, since its indices address the full ordered list.
- **Timeline: the toolbar buttons say what they do** — `⊡ Fit`, `⏳ Dates…`, `📅 Today` instead of
  bare glyphs. A tooltip only helps someone who already suspects the button does what they want.
- **Stat sheet: temp HP and temp max HP colour the HP box.** Temporary HP reads as a bonus (green)
  and a temporary maximum as a penalty (red), and the HP field itself is tinted and underlined in
  the matching colour whenever either is in play, with the delta shown beside the HP label — so the
  printed number is never quietly wrong without saying so.

- **Timeline: filter by date.** ⏳ in the zoom row opens a From/To picker; either bound can be
  left off for an open end. An event survives when its span **overlaps** the window rather than
  starting inside it — a 45-day journey that began earlier is still under way during the
  timeframe you are looking at, and dropping it would misrepresent the period. A chip in the
  toolbar names the active range and the kept/total count with one click to clear, because a
  filtered timeline is otherwise indistinguishable from an empty one; Fit frames the filtered
  set rather than a span whose events are no longer drawn. View-only — it never touches stored
  data, so it applies to personal and campaign timelines alike.
- **Stat sheet: temporary HP and temporary max HP.** A `+` on the HP label reveals both, and they
  reveal themselves for any sheet that already carries a value, so loading a character mid-effect
  never hides it behind a click nobody knows to make. Stored in `stats_json` as `temp_hp` /
  `temp_max_hp`, and `populateSheet` accepts either spelling like every other field. Behind a
  toggle because most characters have neither, and two permanently empty boxes in the core stats
  bar would be clutter on every sheet to serve a few.
- **User Panel: role change and delete update their row instead of refetching the table.** Both
  already know the exact resulting value, so the round trip only bought a table-wide spinner.
  Create still refetches deliberately — its response carries only id/username/role while the table
  also shows Email and Created, so appending locally would mean two blank cells or an invented
  client-side timestamp.
- **Scroll preservation audited app-wide.** Every remaining `loading`-gated unmount turned out to
  be an initial load, an explicit Refresh, or a deliberate context switch (player change, campaign
  switch) — all cases where resetting scroll is correct. No post-mutation refetch unmounts a pane
  any more. The audit did surface one real defect: **`addDmNote` appended a new note while the API
  returns notes newest-first**, so a note sat at the bottom of the list until the next load quietly
  moved it to the top. It prepends now.

- **Enter no longer fires several things at once.** Two independent causes, both fixed.
  - Every open `<Modal>` registered its own `window` keydown listener, so whenever two were
    open they *all* reacted to the same keypress. That is not an edge case: `ConfirmContext`
    renders a `<Modal>` too, so every confirmation raised from inside a dialog stacks on one —
    and Enter then settled the confirm **and** submitted the form behind it, while Escape closed
    both at once. Modals now share a stack and only the topmost one handles keys. The listener is
    also registered per open/close rather than per render, since call sites pass inline arrows
    for `onClose`/`onSubmit` — re-running on those would have floated a background dialog back to
    the top of the stack on any re-render.
  - `NewMapModal` and `NamingModal` each declared `onSubmit` on the Modal *and* an `Enter`
    handler on their own inputs, so a single keypress ran the action twice — two journey maps
    from one Create, a double save from the naming dialog. The redundant input handlers are gone;
    Enter-to-submit comes from the Modal alone. Swept the rest of the codebase for the same
    pairing and found no others.

- **The NPC/stat sheet no longer pre-fills Senses and Languages.** They defaulted to `Darkvision`
  and `Common`, which put traits on every new sheet that most characters do not have — and a wrong
  default is worse than a blank field, because it reads as deliberate and survives until somebody
  notices. Both now start empty; the greyed placeholders (`Darkvision 60 ft., Blindsight 30 ft.`,
  `Common, Elvish…`) still show the expected shape.
- **A player's printed PDF now includes the DM notes shared with them.** The print document gated
  the whole DM Notes section on `isDM`, so a player's PDF omitted notes their own DM Notes tab was
  showing them. The Visible/Hidden status line stays DM-only — on a player's copy every note is one
  shared with them, so the label carries no information.

- **PC Sheet — Clear did nothing.** It posted `LOAD_STATS` with an empty payload, but
  `populateSheet` ignores `{}` by design (it has to, or loading a blank sheet would wipe one), so
  the button was a silent no-op. Added a `CLEAR_STATS` message that calls the sheet's own
  `clearSheet()`.
- **PC Sheet — a black band under the stat block.** The embedded sheet was sized only to its own
  reported height, so a short sheet left the rest of the scroll container showing the app's dark
  background. The frame now fills at least the visible area, and the wrapper carries the parchment
  colour so nothing shows through during reflow.
- **PC Sheet — the printed PDF began with a blank page.** `pc-print.css` declared a *named* page
  (`@page pcsheet`), and a page-name change forces a break — everything ahead of the print document
  sits on the unnamed default page, so every print started with an empty sheet. The name existed to
  fence off the NPC sheet's own margin, which no longer declares one, so a plain `@page` does the
  job. (Same trap that caused the NPC sheet's blank pages earlier.)
- **DM notes marked visible were invisible to players.** The API has always been `requireAuth` and
  filtered to `dm_visible = true` for non-DMs, but the client only fetched notes when the viewer was
  a DM, and the tab itself was DM-gated — so the visibility toggle did nothing a player could see.
  Players now get the tab once at least one note is shared, read-only: no compose box, no toggle, no
  delete.
- **A player's export now includes their `private_info` and the DM notes shared with them**, so the
  file they keep matches the sheet they see. Hidden notes and DM-only relationships are still
  omitted. Import is unchanged and still ignores both unless the bundle is `scope: 'full'` — a
  player-scope bundle holds only the visible subset, so writing from it would delete the DM's hidden
  material.
- **Relationships tab** — the chip list was a stack of per-type rows up to 42vh tall, pushing the
  graph below the fold. It is now a single sideways-scrolling line, with **➕ Add Relation** moved
  above the graph.
- **Journey Map — a pin could not be placed inside a region.** The region polygon covers a large
  area and its `mousedown` handler called `stopPropagation()` for every tool except pan, so the
  click selected the region instead of reaching the stage. The creation tools (place, draw, region,
  measure) now fall through, as pan already did.
- **Manage Campaigns — the player Reassign control looked like a refresh button.** It was a bare
  ♻-style icon for what is a save action; it is now a labelled **Save** button.

- **The player PC-sheet export was leaking DM-only relationships — and fixing that exposed a
  data-loss bug underneath it.** The read path has always withheld `is_dm_only` relationships
  from players (`app.js:1177`), but the export selected every row regardless of role, so a
  player clicking Export received the name, type, link and status of relations the UI
  deliberately hides from them. The export now applies the same predicate.
  - That fix could not ship alone. Import replaced relationships with an unconditional
    `DELETE ... WHERE character_id=$1`, and a player bundle happened to carry the DM-only rows
    back, so they survived *by accident*. Filtering the export would have turned an information
    leak into silent, permanent deletion of every DM-only relationship on the next import.
    The delete is now scoped by the bundle's `scope` — the same "absent means withheld" rule
    already applied to `private_info` and `dm_notes`.
  - A third trap sat below that: `parent_id` is `ON DELETE CASCADE`, so a surviving DM-only
    child whose parent was being replaced would have been cascade-deleted anyway. Those links
    are cleared before the delete and the row re-parents to root.
  - And symmetrically: a player-scope import now ignores any `is_dm_only` row the bundle
    *does* carry. Files exported before this change still contain them, and would otherwise
    have duplicated the DM's own rows on every import — the same doubling that used to afflict
    DM notes. It also stops a hand-edited player file smuggling a row into the DM's hidden set.
  Version-1 bundles read as player-scope, so they become non-destructive here too.

- **PC sheet import has a discoverable entry point.** It was always possible — the sidebar
  hub sniffs the file type and asks for a target player — but the button sits inside the
  "New Campaign" panel labelled only "Import", so it reads as *import a campaign*, and the
  Players tab had no import at all. Each player row now carries its own **⬆ Import**: pick the
  file, confirm, done — the target is the row, so there is no target prompt. It rejects
  anything that is not a `pc-sheet` export and names both the incoming character and the
  destination player in the confirmation, along with what the bundle's scope will overwrite.
  The sidebar hub is unchanged and still handles all four types.

- **A test suite — `npm test` finally does something.** Vitest, 69 tests over the pure
  domain modules: the Harptos calendar (including the five festival days that sit between
  months, and absolute-day round-trips across leap boundaries), 5e rules arithmetic
  (negative ability modifiers, proficiency step points, the warlock pact-magic table),
  the journey-map road network (Dijkstra over route sections, shortest-of-two-routes,
  sections with no distance set), and the SRD/Open5e payload flattening — which the two
  APIs shape completely differently and which had only ever been checked by hand.
  Runs in ~250ms with no DOM. Verified it *can* fail by introducing an off-by-one in
  `abilityMod` and dropping the reverse edge in the road graph; both were caught.
  - **It found a real bug on the first run, now fixed**: editing a timeline event silently
    rounded its duration — 45 days became 60 — because the edit form pre-filled from
    `formatDuration()`, which is approximate above 30 days, and parsed that back on save.
    Merely opening the modal and pressing Save changed the event. The form now pre-fills
    the exact day count (`45d`); typing `3m` or `2y` still converts as before, only the
    pre-fill changed. The tests assert the corrected behaviour across 1…1000 days.

- **`run.sh` runs the tests before it builds.** Step 5 of 15, ahead of the frontend build
  and any container start: a failing suite stops the bootstrap with a non-zero exit instead
  of deploying a broken build over live campaign data. It costs about a second against the
  build's two and a half, so it is not worth making optional by default — `SKIP_TESTS=1`
  bypasses it when you need to. Verified both paths by planting a failing test and watching
  the script stop, and by confirming the bypass skips it.
  - Also fixed a stale check in the same script: the build step still tested for
    `frontend/dist`, which stopped existing when Vite's `outDir` moved to `public/app/`, so
    the "already built" short-circuit never hit and every run rebuilt from scratch while
    logging a path that was not there.

- **ESLint, actually installed and passing.** The repo declared a `lint` script but eslint
  was never a dependency, there was no config, and `--ext` had been removed in ESLint 9 — so
  it had never run once. One flat config at the root now covers both halves (CommonJS/Node
  for `app.js` and `scripts/`, ESM/JSX with the React plugins for `frontend/src`).
  `react-hooks/rules-of-hooks` is an error: it catches the conditional-hooks bug that
  crashed the relationship graph, verified by reintroducing it and watching the linter flag
  it. It found 39 problems on the first run — all fixed — including the dead `px` variable in
  `CharTreeTab` whose expression was nonsense anyway, the unreferenced SVG strings in
  `RelGraph`, and one `exhaustive-deps` suppression that was suppressing nothing.
  Pinned to ESLint 9 because `eslint-plugin-react` does not yet support 10.
- **19 indexes on the foreign keys the app filters by.** The schema had exactly *one*
  explicit index, while `campaign_id`, `player_id`, `map_id`, `character_id` and
  `timeline_id` — the columns in nearly every WHERE clause — had none. Added at the end of
  `initializeDatabase()`, so they are created automatically on the next start and need no
  manual step. Columns already covered by a UNIQUE constraint's leading column are
  deliberately skipped; a duplicate index only costs write throughput.
  Verified against a real PostgreSQL: all 19 created, idempotent across a second boot, and
  the planner switches from a sequential scan to an index scan on the per-sheet character
  lookup.

## [4.19.0] – Unreleased — SRD/Open5e assisted entry, legacy cleanup, safe PC round-trip

- **Fixed: the PC Sheet PDF printed only about one screen of the stat block.** The embedded
  NPC sheet has always posted its real height, but nothing consumed the message — it
  appeared exactly once in the repo, at the sender — so the iframe stayed at a fixed 900px,
  and an iframe prints only its own box. `StatsTab` now sizes the frame from that message
  (and filters by `e.source`, since two instances are mounted while printing and each was
  reacting to the other's frame, re-pushing stats over unsaved edits). Also unclipped the
  panes capped in `vh` — relationships, DM notes and the relationship graph each printed at
  most half a page — let textareas grow past their `rows`, and replaced the 800ms guess
  before `window.print()` with the frame's own ready signal.
- **A 🖨 Print control in the PC Sheet's Stats toolbar**, beside Save Stats and Clear, which
  prints the stat block on its own — it prints the iframe's own document, so the embedded
  sheet's print stylesheet applies and the other five sections are not dragged along. The
  header PDF button stays as the whole-sheet print. (Until now there was no way to print
  just the stat block from in here: the embedded sheet suppresses its own 🖨 button.)
- **NPC sheet: Senses and Languages now look identical.** After the move into Traits &
  Features, Senses matched `.field > input[type=text]` but Languages' input sits nested
  inside its combobox, so the `>` combinator skipped it and it rendered as an unstyled
  browser box. Both arms are now listed, and the generic combobox rule is scoped to the
  header so it no longer flattens them.
- **NPC sheet: the Defenses tag boxes are no longer twice their intended height.** A
  specificity collision — `.npc-sheet .field input[type=text]` (50px min-height, its own
  border and fill, `width:100%`) matched exactly one element in the sheet, the TagInput's
  search box, and beat `.tag-input` on every shared property. Each box therefore drew a
  second bordered box inside itself and forced chips onto their own line. Rule split and
  scoped; the five boxes also got real placeholders.
- **Senses and Languages moved into Traits & Features** as compact fields — they hold
  sentences, not the two or three characters the stats bar is sized for. Languages keeps its
  SRD picker. Pure UI move; both remain plain `stats_json` strings.
- **A box that crosses a page now prints as two complete boxes**, via
  `box-decoration-break: clone`, instead of one sliced through with no bottom edge on the
  first page and no top edge on the second.
- **Defenses & Damage Traits keeps its boxes on paper** — the print rules used to strip them
  to bare text, which left labels with nothing under them now that the section always prints.
  They have a min-height so they can be filled in by hand.
- **The PC Sheet PDF's page margin is scoped to a named page** (`@page pcsheet`). Vite leaves
  a lazily loaded route stylesheet in the document after you navigate away, so a bare `@page`
  here would also apply to the NPC sheet's own print once both pages had been visited in one
  session. Naming it confines it.
  The parchment sheet deliberately declares **no** `@page` and keeps the browser default: a
  zero margin looked wrong, and giving it a named page of its own was worse — naming a page
  forces a break wherever the name changes, so the sheet generated a blank page before and
  after itself inside the app shell.
- **Passive Investigation** sits beside Passive Perception and Initiative in the core stats
  bar, derived the same way (10 + the Investigation skill total) rather than typed into
  Senses by hand.
- **Legendary & Lair can always be collapsed**, not only while empty. Visibility is
  tri-state: it follows the content by default — hidden on an ordinary PC, shown once it
  holds anything — and an explicit show/hide overrides that. Nothing is deleted when it is
  put away, and the reveal control says when there is content behind it.
- **Defenses & Damage Traits always prints**, blank or not: empty boxes there are useful to
  write into on a printed sheet. The Traits & Features textareas still drop out when empty,
  since those are prose rather than checklists.
- **The printed stat block is sharp instead of blurry.** `.npc-sheet::before` is a paper-grain
  overlay covering the whole sheet at `opacity: .6`, and a partially transparent layer over
  content makes the print engine rasterise everything beneath it — vector text became a
  bitmap, which is why the PDF looked soft everywhere at once rather than in one place. The
  overlay is now dropped in print; real paper has its own texture. Also in this pass: the
  print mirror matches the control's 13px instead of shrinking to 12px, a tall box may break
  across a page (with orphan/widow protection) rather than jumping wholesale to the next one
  and leaving a third of a page blank, a section whose fields are all empty no longer prints
  a bare heading, and focus styling is neutralised so whichever field happened to be focused
  stops printing differently from its neighbour.
- **The NPC sheet / stat block prints properly.** Three defects, all visible on one page:
  a `<textarea>` cannot grow to its content on paper — `autoGrow` writes an inline pixel
  height measured at *screen* width, which survives into print and clips once the text
  reflows narrower (and `height: auto` is no help, since a textarea then sizes from its
  `rows`) — so print now swaps each control for a plain text mirror of the same value.
  Blank fields no longer print as empty labelled boxes, and labels are kept with their
  boxes across page breaks. Languages also printed with three sides where Senses had four,
  because a print rule stripped the bottom border from every combobox rather than just the
  header ones.
- **The Stats tab's 🖨 Print keeps the parchment design**, printing the embedded sheet's own
  document. The problems that made it look wrong were in that sheet's print rules, not in
  the parchment itself, and are fixed above: textareas print as flowing text rather than
  clipped controls, blank fields are dropped, and labels stay with their boxes.
- **The PC Sheet PDF prints as a document, not a stack of tabs.** Sections now flow into one
  another instead of forcing a page break each — a short character used to produce six
  mostly-empty pages — and margins are set in two layers: `@page`, plus padding on the
  document itself, because the browser's print dialog has its own Margins setting that
  overrides `@page` and was letting text run to the paper's edge. The **Stats Sheet is no longer included**: it has its own
  print button in its toolbar, so printing it here only duplicated it and made the document
  far longer than it needed to be.

- **The PC Sheet print document no longer reuses the editable tabs.** It renders plain
  markup on an explicit light palette, so long text flows and paginates instead of printing
  inside a scrolled textarea, the dark app surfaces stop printing as opaque blocks, and a
  section heading is never orphaned from the text below it.
- **Legendary & Lair auto-hides when empty**, with a reveal — and a matching hide, so the
  reveal is not one-way — for sheets that need it;
  roughly 340px of dead space on an ordinary PC. Derived from content rather than a stored
  flag, so no new `stats_json` key.

- **Fixed: the PC Sheet's relationship graph could crash.** `RelGraph` called 7 hooks, then
  early-returned on an empty relationship list, then called 3 more — so deleting a
  character's last relationship while a DM cross-connection kept the component mounted threw
  *"Rendered fewer hooks than expected"* and blanked the Relations tab. All ten hooks now run
  before the early return.
- **Fixed: the server accepted requests before the schema existed.** `initializeDatabase()`
  ran inside the `app.listen` callback, so the socket was open during setup and a DDL failure
  called `process.exit(1)` on an already-listening server. Schema now completes first.
- **Caster Type follows the Class** — locked when the class determines it, and deliberately
  left editable for the martial classes so Eldritch Knight and Arcane Trickster can be third
  casters. The previous code forced `none` there, which blocked them.
- **"Go to Today"** on the timeline toolbar, in both the campaign and public views. The
  public timeline API now returns `today_marker`, so that view renders the marker at all.
- **Senses and Languages are readable** — both hold sentences and were being rendered in the
  1rem display face sized for the two-character numeric fields beside them.

- **Assisted entry from the SRD and Open5e.** The NPC sheet can fill an entire stat block
  from one pick — 341 SRD monsters plus ~3,200 from Open5e — and offers pickers for species,
  subclass and languages, each of which suggests without restricting (free text always wins).
  Item Cards gains the same against ~1,900 magic items. New `api/srd.js` companions
  `api/open5e.js`, `components/SrdCombobox.jsx` and `data/srdMap.js`.
  - **Subclasses**: the SRD licenses only one per class, so the picker merges three sources —
    a local list of official PHB 2024 / PHB 2014 / Xanathar's / Tasha's names (115 entries,
    names only; the rules text is not licensed anywhere), the SRD, and ~110 third-party
    Open5e ones. De-duplicated, 2024 first, everything older badged with its book.
  - Fixed a latent trap in `api/srd.js`: `lookupByResource` fell through to `damage-types`
    for any unrecognised resource, so a new lookup would silently 404 and cache the miss.

- **PC sheet export/import is round-trip safe, and import is DM-only.** Bundles are now
  `version: 2` with a `scope`: a DM export carries `private_info` and every DM note; a player
  export omits both keys entirely rather than blanking them. Import writes a field only when
  the bundle carries it. This fixes three defects — `private_info` being destroyed by a
  player-produced bundle, DM notes doubling on every cycle (2 → 4 → 6 …), and relationships
  losing `parent_id`, `is_dm_only`, `status_label` and `created_by_role`, which flattened the
  family tree. `POST /api/pc/:playerId/import` is now `requireRole(['dm'])`.

- **Fixed: the server served a dead page outside Docker.** Vite wrote to `frontend/dist` while
  `app.js` looked in `public/app/`, and only the Dockerfile copied between them — so
  `node app.js` on the host registered no SPA catch-all, 404'd every React route and served a
  fallback page that loaded a script deleted months ago. Vite now builds straight to
  `public/app/`, the catch-all is unconditional, and a missing build reports itself instead of
  failing obscurely.

- **Legacy cleanup.** Deleted `public/index.html`, `public/app.css` and `public/theme.css`
  (the last duplicated every token already in `styles/globals.css`); the orphaned
  `/api/timeline-private/*` routes and their six client methods (the DM's private journal has
  run on `/api/player-timelines/*` since the migration); the `api/index.js` barrel, the unused
  `ModalField` component, `resourceForTagKey`, `requireRolePage`, `requireAuthPage`,
  `usePcSheet.importSheet`, `journeyMapsApi.updateScope` and its route; and four empty
  directories left by a brace-expansion mishap. Stale Vite dev proxies for a `LegacyIframe`
  that no longer exists were removed — they were breaking dev deep-links to the public pages.

- **Docs corrected against the code** — `ARCH.md` claimed a `connect-pg-simple` session store
  that was never a dependency (it is the in-memory default) and was missing ~24 routes
  including the whole import/export and stats surface; `.env.example` and `README.md`
  documented `DATABASE_URL`, which `app.js` does not read; React/Router/Vite versions were
  three majors behind; `docs/pc-sheet` described a `pc_public_tokens` table that does not
  exist (tokens are stateless HMACs).

## [4.18.0] – Unreleased — Route section polish + no-jump refresh

- **Journey Map movement is derived from the Timeline** — you no longer draw movement paths or manage
  trackers on the map. The Draw tool is now **routes (roads) only**, and paths are computed live:
  - a **🌍 Party** path from events that are party events **or** involve **3+ players**,
  - one **👤 path per player** from their remaining (fewer-than-3-player, non-party) events — a
    2-player event feeds both players' paths, and
  - one **🎭 path per NPC** from **any** event that tags that NPC — **including the DM's own
    timelines** (NPC movements are usually logged there; a prior bug excluded DM timelines, so NPC
    paths never appeared),
  each connecting the events' locations in date order (stops at unpinned locations are skipped).
  Movement paths are read-only on the map — edit the Timeline to change them.
  - **Public map**: the DM (map owner) sees the Party path + all player paths + all NPC paths; a
    logged-in player sees the Party path + **their own** player path; anonymous visitors see no
    movement paths. **NPC paths are DM-only** — never shown on the public map (the earlier per-NPC
    public toggle was removed; `campaign_npcs.path_public` is now dormant).
  - **Per-path Show/Hide** — each path in the **Movement (from Timeline)** sidebar list has a 👁/🙈
    button to hide its line on your own map (local view declutter; resets on reload).
  - Backend: derivation is computed server-side for the public map (Node mirror of the client util);
    the `/player-timelines/:cid/all` feed now includes `is_dm_player`. Trackers table is left in place
    but unused by the map.
- **Fixed: Journey Map import no longer 409s on existing locations** — importing a map into a campaign
  that already has some of those locations now **reuses** the existing campaign locations by name
  (case-insensitive) instead of failing; new locations are still created.
- **Timeline: solo a player** — clicking a player's **name** in the Players sidebar shows only that
  player's events (everyone else hidden); click again to clear. The 👁 eye toggle still hides/shows
  individual players; solo overrides while active. Ephemeral (not persisted).

- **Import/export consolidation — one import hub, per-module export.** Manage Campaigns → **Import** now
  **sniffs the file type** and routes it: `campaign` restores a new campaign (unchanged), `journey-map`
  merges into the selected campaign, and `pc-sheet` / `timeline` prompt for a target player then import
  onto them. The per-module **Import** buttons (Journey Map, PC Sheet) were removed — **Export** stays in
  each module. New: a **Timeline export** (⬇ in the campaign selector bar) producing a portable
  `type:'timeline'` file (actors by name/kind, locations by name), plus backend
  `GET /api/player-timelines/:id/export` and `POST /api/campaigns/:id/import/timeline` (matches
  actors/locations by name, creates missing locations). Journey-map import logic moved to a shared
  `api/importJourneyMap.js` util. The campaign-bundle import path is unchanged.
- **Item Cards: richer Special Abilities editor** — the abilities toolbar gains **Underline**,
  **Numbered list**, and **Highlight** (gold background + dark text, so it reads on the dark editor and
  the white printed card) alongside the existing bold / italic / bullets / clear. List markers now
  render reliably in the editor, preview, and print.
- **Item Cards: two-sided cards, 9-up on A4** — printing now uses a clean **Front** (name / type /
  rarity / stats / flavour) + **Back** (abilities) model, each face auto-fitting its font (the old
  single-stream "continuation" pages are gone — a physical card has two sides). Collect cards with
  **➕ Add to print set** (remembered in the browser) and **🖨 Print set — double-sided** to print
  **up to 9 cards per A4** (3 × 3): each sheet emits a page of Fronts then a page of Backs, with the
  backs **mirrored per row** so they line up when you flip on the **long edge**. A single card prints
  one-per-page (front then back). The live preview is capped to the real card width (63 mm).
- **Admin onboarding docs** — the User Panel README now has a **First steps** section (account/role
  setup before handing off to DMs) and a **capability matrix** (player vs dm vs admin).
- **Default location-pin images by type (admin)** — an admin can upload a **default pin image per
  location type** (city / town / village / port / …) in **User Management → Location Pin Defaults**, so
  every location of that type shows it automatically without editing each location. Global (shared by
  all campaigns), stored in a new `location_type_images` table. A pin now resolves: its own image →
  the type default → the built-in vector icon — applied on both the editor and public maps (the public
  endpoint returns a `type_images` map). New `GET /api/location-type-images` (auth) and
  `PUT /api/location-type-images/:sizeType` (admin) endpoints.
- **Custom location-pin images** — a campaign location can now carry a **custom image** (Manage
  Campaigns → Locations → edit → **Pin image**: Upload / Clear). Its Journey-Map pin renders as that
  image (circular) on every map — editor and public — instead of the size/type vector icon; locations
  without an image are unchanged. Images are auto-compressed to a small (~256 px) thumbnail so map
  payloads stay light, stored base64 in `campaign_locations.image_data`, and round-trip through the
  campaign export/import. New `PUT /api/campaigns/:cid/locations/:lid/image` endpoint; `compressImage`
  gained `{ maxDim, maxBytes }` options.
- **Item Cards: rarity-coloured print cards** — the printable cards' border and a top accent bar are
  now coloured by the item's rarity (matching the live preview / rulebook convention).
- **Journey Map: click a location to focus it** — selecting a location in the sidebar list now centres
  the map on its pin (zooming in to at least 1×). Clicking a pin directly on the map still just selects
  it, so pin-dragging is unaffected. New `centerOn()` on the map viewport hook.
- **Fixed: players couldn't create a private timeline** — the **＋ New timeline** button was only shown
  when at least one timeline already existed, so a player (or DM) with zero timelines had no way to make
  one. The button now appears whenever a specific timeline-owner is selected, and the empty state gets a
  **＋ Create your first timeline** button. The selector-bar status message now wraps to its own line so
  it no longer crowds the dropdowns.
- **Item Cards: print-ready front / back / continuation cards** — a new **🖨 Print** button lays the
  card content out as a single stream across fixed-size **63 × 88 mm** cards (Front → Back →
  Continuation). The font **auto-fits** (14→8 px) to keep everything on one card before spilling to the
  next; `@media print` reveals only the cards, one per page. The existing PNG download is unchanged.
  (Also corrected the docs, which previously claimed a front/back layout that didn't exist and linked a
  removed `full-item-cards` page.)
- **Cleanup: retired journey trackers + NPC `path_public` (code-only)** — the dead `journey_trackers`
  feature (auto-created player trackers, tracker CRUD endpoints/UI, export/import hydration) and the
  dormant `campaign_npcs.path_public` flag (PATCH endpoint, API, derivation property) were removed from
  the codebase. Movement is fully derived from the timeline; NPC paths are always DM-only. New exports
  no longer emit `trackers[]` or `path_public`; **old bundles that still contain them import fine** (the
  fields are ignored). The physical `journey_trackers` table and `path_public` column are left dormant
  (no destructive migration). Also synced **ARCH.md** to the real schema and refreshed the journey-map /
  manage-campaigns export field references.
- **Public map details: hide routes touching hidden locations** — the **Paths** list (and its count)
  in the public map's details panel now omits any route whose anchored locations aren't visible, so
  it never lists a road to a location the viewer can't see. Routes remain undrawn on the public map
  and still power distance calc through hidden cities.
- **Fixed: Edit-Event modal player & manual-connection lists** — those checkbox lists rendered as
  unstyled overflowing text because their CSS (`.pchks`/`.pcl`) was scoped to `.tl-app`, while the
  modal portals to `document.body` (outside `.tl-app`). Unscoped those timeline-unique rules so they
  apply inside modals too; the lists are scrollable boxes again.
- **Fixed: timeline event hover tooltip** — event hover no longer shows nothing; the React-rendered
  tooltip now overrides the stylesheet's `#tip { display: none }` resting state (inline `display:block`),
  so hovering an event again shows its title, location, date, players, and description.
- **Party timeline events** — the DM can flag a new campaign event as a **🌍 Party event
  (whole group)**; it's stored once (no owning player/timeline, `player_timeline_entries.is_party`)
  and shows as a single shared **"Party" lane** in the combined DM view and the public timeline,
  and alongside each player's own events. New `/api/timeline-party/:campaignId` CRUD (DM-authored,
  readable by campaign members); the combined + public queries UNION the party lane in.
- **Timeline search boxes** — the "New Event" form and the Edit-event modal now have a
  **Filter players…** box above the player checkboxes, and the sidebar **Players** and
  **Locations** sections each got a search box (location drag-reorder is disabled while filtering,
  since indices only make sense unfiltered).
- **Search-events dropdown fixed** — the "Search events…" results list was being clipped by the
  toolbar's overflow and hidden behind the timeline; it now renders in a portal positioned under
  the search box, above everything, and is fully visible/clickable.
- **Timeline date axis is more legible** — year markers are larger/bolder in bright gold, month
  labels use higher-contrast text, and all date labels get a background halo so they read clearly
  over the striped rows instead of overlapping/blending.

- **Map names sit on parchment plates** — location, region and road/path names on the Journey
  Map now render on a small rounded parchment plate (aged-paper fill + brown border, dark ink)
  instead of stroke-outlined text, so they stay readable over busy map art. Shared editor +
  public map (`components/map/MapLabel.jsx`); pin-label auto-declutter accounts for the plates.
  - **Road names are tinted** per route type (road/flight/maritime) so they read differently
    from location names on the plate.
  - **Road/path name plates are draggable** — with the Select/Move tool, select a road or path
    and drag its name plate (and its distance readout, which follows) to any spot, so it no
    longer sits on top of towns or other labels. The position persists (`journey_paths.label_x/label_y`);
    default is the path midpoint.
  - Public-map location labels now use the same **per-size/type text formatting** as the editor
    (big cities large/caps, minor places small/italic), instead of a single uniform style.
- **Location pins are type icons you can resize** — Journey Map pins are no longer a plain
  black circle. Each pin draws a vector icon chosen by its size/type (castle for big cities,
  house/tent for small towns & villages, bed for inns, landmark, anchor for ports, … with a
  map-pin fallback), on a subtle disc for legibility. Each pin has its own **size slider** in
  the location details panel (`icon_scale`, persisted on `journey_map_locations`), so you can
  fit it to the map art; icons scale crisply with zoom. The same icons render on the public map.
- **Public Journey Map: routes are always hidden** — the road/route network is never drawn on
  the public map (players just see locations + the tracker paths they're allowed to). Tracker
  path visibility is unchanged (DM all; player own + party; anonymous none).
- **Public Journey Map is now player-safe** — the shared map (`/journey-map-public/:token`)
  no longer leaks DM-hidden content, and tracker paths are shown per viewer:
  - Locations hidden in Manage Campaign (`is_public = false`, cascades to children) are
    omitted; distances/events for hidden locations are filtered out too.
  - Tracker paths: the **DM** (map owner) sees all; a **logged-in player** sees only their
    **own** path plus **party** paths (a `type='group'` tracker); an **anonymous** visitor
    sees none. The endpoint reads the session cookie to decide (still token-gated).
  - To attribute a path to a user, `journey_trackers` gained a persistent `player_id`
    (FK `campaign_players`); the auto-created per-player trackers now set it, and existing
    ones are backfilled by name. Public paths also now carry `kind`/`route_type`, so roads
    render correctly on the public map.
- **Faster first load / smaller bundle** — pages are now route-lazy-loaded (`React.lazy`
  + a `Suspense` spinner in the app shell), so each page ships as its own chunk that
  downloads on first navigation. The initial JS bundle dropped from ~587 kB to ~261 kB
  (~179 kB → ~83 kB gzip), and Vite's "chunk larger than 500 kB" build warning is gone.
- **Players only see their own character(s)** — `GET /api/campaigns/:id/players` now returns
  just the requesting user's assigned character(s) when the role is `player` (the DM still
  gets the full roster). Previously the PC-sheet player picker listed — and leaked — every
  character in the campaign, even though opening someone else's was already blocked server-side
  by `canAccessPC`. A player with a single character now has it auto-selected.

- **Journey Map route sections show full names** — the "Sections" panel no longer truncates
  the segment label ("Lost City …"); it now wraps and shows the whole
  "Start → End" city pair. The walk/horse/fly travel times moved fully into a **hover
  bubble** (which also repeats the segment name), so the row stays clean.
- **Roads are named after their endpoints by default** — drawing a route between two pinned
  locations now names it `"Start City ⇄ End City"` instead of the generic "Road" / "Flight
  route" / "Maritime route" (which still applies when an end isn't a placed location). The
  name is editable in the Road Info panel as before.
- **No more scroll-to-top / lost zoom on refresh** — mutations that used to refetch behind a
  full-tab spinner now refresh in place:
  - *Manage Campaigns*: `reload()` is silent (spinner only on initial select / campaign
    switch), so adding/editing/deleting a player, location, NPC or timeline — and toggling a
    location's visibility — no longer jumps the page to the top. Location visibility flips
    optimistically with no refetch.
  - *Char Tree*: connection add/edit/delete refresh silently and the canvas auto-fits only on
    first mount, so it keeps your zoom/pan; toggling a connection's visibility flips
    optimistically.
  - *PC Sheet*: toggling a relationship's visibility updates local state instead of
    re-listing all relationships.
- **Manage Campaigns: Export moved to Settings** — the campaign Export/backup button now lives in the
  **Settings** tab (under "Export / Backup") instead of the page header, keeping it with the other
  campaign-level settings. Docs also gained a **Compatibility & migrations** section explaining
  cross-version export/import behavior.
- **Export/import now round-trips the new fields** — the campaign bundle (v3) and standalone
  Journey-Map import previously dropped several recently-added fields. Fixed so export→import
  preserves: per-pin **`icon_scale`**, road **name-label positions** (`label_x`/`label_y`),
  each tracker's **player link** (via a `player_ref`), and — most importantly — **party timeline
  events** (a new top-level `party_events[]` array; they were silently lost before, as the export's
  timeline query excluded entries with no owning player/timeline). Additions are back-compatible;
  older bundles just fall back to defaults. Module docs updated to match.
- **Consistent alphabetical sorting** — normalized the user-facing lists that previously showed in
  insertion/creation order: campaign lists & selectors, the assign-user dropdown, timelines list,
  PC-sheet campaign/player selectors, the UserPanel users table, Journey Map campaign/map selectors +
  tracker/route/path lists, Timeline campaign/timeline/profile selectors, and the PDF list. Fixed-order
  UI/game lists (tools, months, abilities, etc.) and date-sorted lists are unchanged.
- **Public map: distances compute through hidden cities** — road lines and hidden city pins
  stay off the public map, but the road network is now sent for calculation only, so distances
  between visible locations are computed even when the shortest path runs through hidden cities.
  Pairs that can't be computed simply don't appear (and hidden cities never show as rows).
- **Journey Map: tool shortcuts auto-open the relevant sidebar section** — picking a tool
  (by key or click) other than Select/Move expands the section you'll need: Draw → Tools
  (path/route + type) and, for path mode, Trackers; Place/Region/Measure → Locations.
- **Journey Map: names declutter to hover** — only big/huge location names stay drawn on the
  map; every other pin's name is hidden and appears on hover (editor + public).
- **Map labels are formatted per type** — on the editor map each name style now signals
  what it is: pinned locations vary by **size/type** (big cities large/bold/gold caps,
  towns plain, minor places like inns small, dim, italic); **roads** read like route
  signage (upper-case, letter-spaced, bold in the route colour); and **tracker paths**
  render italic in the tracker colour.
- **Location labels auto-declutter** — overlapping pin labels are nudged vertically so
  they no longer sit on top of each other; a faint leader line connects a label to its
  pin when it's pulled away.
- **Regions excluded from the Distance Matrix** — the matrix is point-to-point, so
  polygon regions (which are areas) no longer appear as rows/columns.
- **Proximity filter is explained** — hovering the "N locations hidden by proximity
  filter" note in the location details panel now shows the exact size-tier + road-distance
  rules that decide what's listed.

## [4.14.0] – Unreleased — Login: save password + Remember me

- The login inputs now have `name="username"` / `name="password"`, so browsers and
  password managers offer to **save and autofill** credentials (previously they
  couldn't, the fields were nameless). On successful login the app also calls the
  **Credential Management API** (`navigator.credentials.store`) to prompt the save
  directly — Chrome's automatic heuristic often skips SPA (fetch) logins.
- New **"Remember me"** checkbox → the server extends the session cookie to 30 days
  (`POST /api/auth/login` accepts `rememberMe`); default stays 24h.

## [4.17.0] – Unreleased — PC Sheet relationship fixes & campaign polish

- **Timeline deep-links from Manage Campaigns work** — the Timeline page now reads the
  `?campaign=&player=&mode=private` query params it's opened with: it switches to Campaign
  mode, selects that campaign, and (when a player is given) loads that player's timeline —
  instead of ignoring them and showing the default personal view.
- **Cross-connections now show in the PC-sheet graph** — visible (and, for the DM, all)
  DM cross-connections render as external nodes (🧟 NPC / 👤 player / relationship) below
  the ego graph, joined to the character (or the linked relationship) by a dashed, labelled
  edge. Previously the graph drew only the character's own relationships, so a
  cross-connection to an NPC never appeared there.
- **Hide players from the char tree** — the Char Tree tab now lists each player (with their
  relationship pills) and a 👁/🙈 toggle; hiding a player drops that player, their
  relationships, and any cross-connection touching them from the graph so it can be
  decluttered. (Client-side per session.)
- **DM Cross-Connections in three columns** — the char-tree cross-connection list is split
  into **👥 Relationship links** (relationship↔relationship), **👤 Player links** (any
  connection with a player), and **🧟 NPC links** (NPC↔NPC or relationship↔NPC), each sorted
  A–Z by the left-hand entity.


- **DM can hide relationships again** — fixed a frontend/backend field-name mismatch: the
  UI used `dm_only`/`status` while the DB/API use `is_dm_only`/`status_label`, so hiding a
  relationship (and the status label) silently had no effect. Aligned the chips, graph,
  and add/edit modal; the edit endpoint now also accepts `is_dm_only` (DM/admin only).
- **Relationship graph fills the space** — the PC-sheet graph is now tall (70vh) and
  auto-fits all nodes to the box on load/resize (⤢ re-fits), instead of a short clipped box.
- **Print just the graph** — a 🖨 control on the graph opens a print window with only the
  relationship graph (framed to its content bounds).

## [4.16.0] – Unreleased — PC Sheet: condensed relationships & DM notes

- **Condensed Family Tree & Relationship Matrix** — the tall nested list is now a compact
  set of chips grouped by relation type (with children shown inline as ↳), plus a
  **Cross-connections** section (DM links to other players/NPCs, grouped by the external
  entity). The PC relationships endpoint already returned `cross_connections`; the hook now
  surfaces them.
- **DM notes are small cards** — replaced the large single-column notes with a compact grid
  of minimal cards (content + a Hidden/Visible badge, Show/Hide, and delete).
- **Relationship graphs — less overlap/clutter**: the PC-sheet ego graph now spreads a
  parent's children over a wider arc at a growing orbit radius (no more stacked child
  nodes) and widens the social fan as it fills; the campaign char-tree uses a larger
  node gap so labels stop colliding and fans overlapping cross-connections apart.

## [4.15.0] – Unreleased — Journey Map polish

- **Esc / Enter on all dialogs** — every modal now cancels on **Esc** and triggers its
  primary action on **Enter** (shared `Modal` gained an `onSubmit`, skipping textareas;
  the confirm dialog confirms on Enter). Wired across journey, PC, campaign and timeline
  modals.
- **Multi-point route bending** — a road section can hold **several** bend control points
  (a smooth Catmull-Rom spline). Double-click a selected road to add a bend point where
  you click; drag each diamond to shape it; double-click a diamond to remove it. Handles
  sit on the control points, away from the centre distance label. Still shape-only —
  bending never adds a waypoint or changes distance.
- **Regions are locked by default** — a placed region no longer moves/reshapes on a
  stray drag; select it and click **✏️ Edit shape & position** in the details panel to
  unlock (vertex + body handles appear); any change of selection re-locks it.
- **Section travel-time hover is a floating bubble** — the 🚶/🐎/🦅 estimate now pops
  above the section row instead of squeezing in on the right and truncating the names.
- **Continent-scope Distance Matrix hides minor sub-locations** — on a continent-scoped
  map the matrix no longer lists locations that sit inside another location and are of
  type Inn / Neighborhood / Other (the locations query now returns `parent_id`).
- **Routes follow their locations** — a route/path anchor tied to a pinned location now
  tracks that location live: move the pin and the connected routes move with it
  (`resolveWaypoints` resolves `locId` anchors to the location's current position at
  render). Drag handles show only on bare junction points; location anchors move via
  their pin. Region polygons also now sit *below* routes/paths/pins so they don't grab
  clicks meant for those.
- **Pin-location list** — already-pinned locations are hidden from the "Pick location"
  dropdown, except a region that still has unpinned children (kept as a header so the
  children can be pinned).
- **Smart distance sidebar filters by road distance again** — the size/proximity rules
  now require an actual road-network connection within range; unconnected locations are
  hidden instead of all showing as "set distance" (Big cities still always list other
  Big cities, per spec).
- **Editable road name** — name a road in the Route panel.
- **Errors now surface to the user** — a global `unhandledrejection` handler shows a
  toast for otherwise-uncaught API errors (e.g. deleting a location that's in use:
  "Location is in use on Journey Map …"), instead of only logging to the console.
- **Export/Import preserve roads** — the campaign export/import and the journey-map
  JSON now round-trip `kind`, `route_type`, and the per-section `segMiles`/`curve` on
  waypoints (routes previously came back as plain paths with no distances/curves).

## [4.13.0] – Unreleased — Journey Map: Paths (movement) vs Routes (road network)

Two distinct, separately-drawn concepts:

- **Path** = a player/NPC group's movement — belongs to a tracker, auto-creates &
  names campaign locations along the way, distance derived from location distances,
  travel times shown. (Reverted to its original behavior.)
- **Route** = a **road in a network** (no start/end). Three **types** — `road`,
  `flight`, `maritime`. Roads are tracker-free; their waypoints are **map-only**
  (bare `{x,y}` in the road's own data, or a snapped existing location) and **never
  create campaign locations**. Each **section** (segment between two points) carries
  its own distance (`segMiles`); the road's total = Σ sections.

Details:
- **Data**: `journey_paths.kind` (`'path'`|`'route'`) + `route_type`
  (`road`|`flight`|`maritime`) — idempotent migrations; existing rows → `path`/`road`.
- **Drawing**: one Draw tool with a **Path | Route** toggle; Route mode adds a
  road-type selector and needs no tracker. Route draws skip `ensureWaypointLocations`.
- **Distance**: `geometry.roadDistance` sums per-section `segMiles`;
  `setRouteSectionDistance` writes `segMiles` on the road (the matrix is untouched by
  roads). Paths keep deriving from the matrix via `computePathDistance`.
- **Render**: roads draw by type (road = solid neutral, flight = dotted sky-blue,
  maritime = dashed teal), translucent so map markers stay visible, no arrowhead,
  per-section editable distances; sidebar lists **Routes** (typed icons) and **Paths**
  separately, with a **Hide/Show roads** toggle. Public view mirrors the styling.
- **All distances derive from the road network**: `geometry.networkDistances` builds a
  weighted graph from every road's sections (locations are shared nodes, bare junctions
  are road-local) and runs Dijkstra; `effectiveDistances` exposes the shortest path
  between any two locations (falling back to the stored matrix for unconnected pairs).
  Paths, the measure tool, the Distance Matrix and the proximity list all read these.
- **Edit roads**: delete any road point from the Route panel (the two sections merge and
  the merged distance is cleared); a road left with <2 points is removed.
- **Bend roads without adding points**: each section can carry an optional `curve` control
  point (render-only) so sea/mountain legs can bow into a quadratic Bézier. Drag a section's
  diamond bend-handle to shape it, double-click to straighten. The curve never affects the
  distance graph, the section distance, or the Points list (`buildRoadPath` builds the
  `Q`/`L` path; `setSectionCurve` stores/clears it).

(Supersedes the earlier "routes write the distance matrix" approach.)

## [4.12.0] – Unreleased — Relationship-graph crossing reduction

Reworked both relationship graphs so edges cross far less, while keeping the
readable structure (family tiers, social fans, NPC row) intact.

**New:** `components/graph/ordering.js` — shared, pure crossing-reduction helpers
(`minCrossingOrder`, `countCrossings`, `median`, `arrangeAtExtremes`).
`minCrossingOrder` is exact for ≤ 8 items (brute force) and barycenter-seeded
local search above that, and is guarded to never return a worse order than the
input (ties keep the input → no needless re-shuffling).

**Manage Campaigns graph** ([CharTreeTab.jsx](frontend/src/pages/ManageCampaigns/tabs/CharTreeTab.jsx)):
- Player columns are now ordered so players linked by DM cross-connections sit
  adjacent — the main source of long crossing edges. (Synthetic checks: 6
  players 7→0 crossings, 9 players 14→0.)
- The NPC row is ordered by the **median** x of each NPC's connected nodes
  (was the mean) — fewer crossings against the fixed layer above.

**PC Sheet graph** ([RelGraph.jsx](frontend/src/pages/PcSheet/components/RelGraph.jsx)):
- Social-fan and family-tier nodes that have their own child-of relationships
  are placed at the fan extremes, where their orbits have room, instead of the
  crowded centre — stops orbiting children overlapping neighbours.

## [4.11.0] – Unreleased — Post-migration bug-fix pass

Targeted fixes across the migrated React modules (from `TODO.md` "Bug fix").

**Round 2 (follow-up reports):**
- **Journey Map layers now render.** Root cause: a React `<img onLoad>` race — the
  map is a data-URL already decoded before React attached the handler, so `onLoad`
  never fired, `loaded` stayed false and the `drawLayers` gate hid all SVG layers
  (regions/pins/paths) while the image still showed. `MapStage` now detects an
  already-complete image and triggers the load handler itself.
- **NPC print shows the whole sheet.** The app shell caps `#root`/`main` to the
  viewport with `overflow:auto`, so print only captured the on-screen slice. Global
  `@media print` rules now unclip the shell and hide the app header.
- Further condensed the PC Sheet Family Tree (graph 240px/34vh, relations list
  capped at 30vh) and DM Notes (35vh).
- **Timeline campaign selector now appears.** The `.priv-sel-bar` was permanently
  `display:none` — it only shows with a `.visible` class the legacy JS added but
  the React port never did, so DMs couldn't see (let alone use) the campaign
  dropdown. (Also threaded the campaign id through `selectPlayerOption` to fix a
  stale-closure that blocked the player path.)
- **Timeline "Fit" now actually fits.** Content height is linear in zoom
  (H = A·ppd + B); the old proportional rescale ignored the fixed B term (gap
  breaks + bottom padding) and always overflowed. Now solved exactly by sampling.
- **PC Sheet "Generate PDF" prints the whole sheet.** Replaced the new-tab public
  page (which only held public info, and in dev proxied to a server with no SPA
  build) with a print-only document that stacks every tab — Character, Stats,
  Relationships, Public, Private, DM Notes — one section per page.

**General**
- Removed the duplicate Login button on Home — the shared `AppHeader` already
  renders one when unauthenticated.
- Reordered the Home module grid: NPC → Item Cards → Split View → Timeline →
  PDF Viewer → PC Sheet → Manage Campaigns → Journey Map.

**NPC Sheet**
- Fixed the doubled `+` on Prof Bonus / Initiative (values were re-formatted).
- Textareas now auto-grow on load (not only while typing), so loaded sheets show
  full content on screen and in print; added a print rule so nothing is clipped.
- Restored the original parchment alignment of the saving-throw row under the
  ability modifier.

**PC Sheet**
- Condensed the Family Tree / relationship graph (height 420 → 280, capped at
  40vh) and constrained the DM Notes list to a scrollable 45vh.
- Rewrote **Generate PDF**: opens the public print page in a new tab (gesture-safe,
  no popup block) which self-prints once loaded — replaces the racey hidden-iframe
  print that produced blank output. `PcPublic` now honours `?print=1`.

**Journey Map**
- All sidebar sections start collapsed; the "Pick location" selector moved above
  the placed-locations tree.
- Distance Matrix modal now opens near full-screen (95vw / 92vh).

**Timeline**
- "Today Marker" section moved to the top of the sidebar.
- Toolbar (search / mode / view / zoom) now stays on a single scrollable row
  instead of wrapping.
- **Fixed campaign selection for players:** `selectCampaign` passed a stale
  (empty) campaign id to `selectPlayerOption`, so picking a campaign loaded
  nothing; the id is now threaded explicitly.

**Scripts**
- `npm run create-admin` no longer leaks the typed password — it reused a second
  readline interface while the original kept echoing; now mutes the single
  interface during entry.

---

## [4.10.0] – Unreleased — Timeline migration (final module)

### Migrated: `pages/Timeline/` + `pages/TimelinePublic/`

Fully converted from `public/timeline.html` (~4.3k lines) to React — the last
`LegacyIframe` stub is gone, so **every module is now React-owned**. The SVG
Gantt was rewritten idiomatically (SVG-as-JSX, React state) and all three modes
are supported.

**Files created:**

| File | Role |
|---|---|
| `data/calendar.js` | Harptos/Gregorian systems, `absDay`/`fromAbsDay`, formatting, duration parsing — parameterized by `calType`. |
| `pages/Timeline/layout.js` | Segment clustering, abs↔pixel mapping, log zoom, granularity, adaptive date marks. |
| `hooks/useTimeline.js` | Personal (localStorage) mode: profiles + per-profile db + event/player/location/today CRUD. |
| `hooks/useTimelineCampaign.js` | Campaign (DB) mode: campaign→player→named-timeline, actor resolution (`self_/rel_/cp_/npc_`), entry CRUD via `timelineApi`, share-by-token. |
| `hooks/useCombinedTimeline.js` + `pages/Timeline/combined.js` | Read-only combined db (synthetic player per timeline×actor) for the public view. |
| `pages/Timeline/TimelineCanvas.jsx` | The SVG Gantt: location columns, adaptive date axis, duration bars, player + manual connection lines, pie-sliced event circles; drag-to-reschedule, hover-dim tooltip, double-click zoom, `scrollToEvent` + flash. |
| `pages/Timeline/{Sidebar,TableView,PrivSelBar,svgUtils,Modals}.jsx` | Sidebar (lists + inline new-event form), table view, campaign selector bar, SVG helpers, and all modals (profile/player/location/today/event view+edit with manual links). |
| `pages/TimelinePublic/index.jsx` | Read-only public combined view at `/timeline-public/:token` with a per-timeline show/hide legend. |
| `pages/Timeline/timeline.css` | The legacy stylesheet ported and scoped under `.tl-app`. |

**Modes:** personal (localStorage profiles), campaign (DB-backed per player/named
timeline, incl. DM private + world timelines), and public read-only (token).

**Server:** removed the legacy `/timeline` and `/timeline-public/:token` page
routes; deleted the dead `public/timeline.html`. All `/api/*` endpoints
unchanged. The SPA catch-all now serves the React pages.

**DM combined view:** the `— All Players —` option renders a read-only combined
timeline (one synthetic column per timeline×actor) reusing the same renderer as
the public view, with a per-timeline show/hide legend (`CombinedLegend`, shared
with TimelinePublic). It's the default view when a DM opens a campaign.

---

## [4.9.0] – Unreleased — JourneyMap editor migration

### Migrated: `pages/JourneyMap/`

Fully converted from `public/journey-map.html` (~3.5k lines) to React. No
`LegacyIframe`. The SVG/canvas rendering and pan/zoom were **rewritten
idiomatically** (React-controlled state, SVG-as-JSX, no `innerHTML`/`document`
listeners), reusing the `components/map/` renderer built for JourneyMapPublic.

**Files created:**

| File | Role |
|---|---|
| `hooks/useJourneyMap.js` | Data + API backbone: campaign/map selection, all map entities, and every mutation (map CRUD, image upload, location/region/tracker/path CRUD, distances, waypoint-event linking, share/export/import). |
| `components/map/useMapViewport.js` | Shared pan/zoom state + `screenToPct` (used by both MapStage and the interaction hook). |
| `components/map/compressImage.js` | Canvas resize/JPEG-compress for map backgrounds (≤4096px / ≤2 MB). |
| `pages/JourneyMap/useMapInteraction.js` | Tool-driven mouse + keyboard: pan, place, select, drag-pin, draw/extend paths, waypoint drag, region draw + body/vertex drag, measure, delete; shortcuts (V/H/P/R/D/M/X, Esc, Alt/⌘ pan, Enter, Delete). |
| `pages/JourneyMap/index.jsx` | Page shell: header controls, 3-column layout, modal host. |
| `pages/JourneyMap/Sidebar.jsx` | Tools, background image, scoped location tree, trackers, paths, matrix launcher. |
| `pages/JourneyMap/DetailsPanel.jsx` | Location (geometry, linked map, proximity-filtered distances) + path (travel times, waypoints, notes) views. |
| `pages/JourneyMap/EditorLayers.jsx` | Editable SVG layers + draw/region previews + measure overlay. |
| `pages/JourneyMap/MeasurePanel.jsx` | Floating measure-route readout. |
| `pages/JourneyMap/constants.js` | Tools, tracker palettes/icons, scopes. |
| `pages/JourneyMap/modals/` | `NewMapModal`, `ShareModal`, `NamingModal`, `DistanceModal`, `DistanceMatrixModal`, `WaypointEventModal`. |

**Geometry helpers** added to `components/map/geometry.js`: `fmtTravelTime`
(8 active hours/day), `snapToPin`, `distanceBetween`, `computePathDistance`,
`locTier`, `proximityVisibleLocations`.

**Behavioural notes / improvements over the vanilla page:**
- Pan/zoom, drawing and drag are React state — no closure mutation or
  `innerHTML` string building; selection drives re-render.
- Coordinate conversion + viewport live in one `useMapViewport` instance shared
  by the renderer and the interaction hook.
- Single distance-matrix proximity filter ported verbatim as a pure helper.

**Server:** removed the explicit `GET /journey-map` page route from `app.js`;
the SPA catch-all now serves the React editor (role enforced client-side via
`ProtectedRoute` plus the per-request API checks). Deleted the now-dead
`public/journey-map.html` and `public/journey-map-public.html`.

---

## [4.8.0] – Unreleased — JourneyMapPublic migration

### Migrated: `pages/JourneyMapPublic/`

Fully converted from `public/journey-map-public.html` to React. No `LegacyIframe`.
The SVG/canvas rendering was **rewritten idiomatically** (React-controlled
state + SVG-as-JSX) rather than wrapped, and the pan/zoom + rendering layer was
extracted into a **reusable `components/map/`** module the DM JourneyMap editor
will reuse when it is migrated.

**Files created:**

| File | Role |
|---|---|
| `components/map/geometry.js` | Pure helpers: `pctToSvg`, `fmtTime`, `travelTimes`, `parseWaypoints`, `isRegion`, `waypointEvents`, `linkedEventsForLoc`, `sameId`, `SPEEDS`. |
| `components/map/MapStage.jsx` | Reusable pan/zoom stage. Scale/offset are component state (no closure mutation); zoom-to-cursor via a native non-passive `wheel` listener; fit-on-load; renders the background image + an overlaid `<svg>` whose contents come from a render-prop receiving the natural image size. |
| `pages/JourneyMapPublic/MapLayers.jsx` | `Regions` (polygons), `Pins` (circles), `Paths` (directed polylines + distance labels) as presentational SVG components. |
| `pages/JourneyMapPublic/Tooltips.jsx` | `FloatingTooltip` (cursor-following, viewport-flipping, self-measuring), `PinTooltip`, `EventTooltip`, and the hoverable `EventChip`. |
| `pages/JourneyMapPublic/DetailsPanel.jsx` | Right panel with three views — map overview / selected location / selected path — including travel-time badges and bidirectional distances. |
| `pages/JourneyMapPublic/index.jsx` | Page: fetches `journeyMapsApi.publicData(token)`, owns selection + tooltip state, composes header + `MapStage` + layers + panel. |

**Behavioural notes / improvements over the vanilla page:**
- Selection is a single `{ kind, id }` state (last click wins); pin/region/path
  highlights and the panel view derive from it — no manual re-render calls.
- Tooltips are fixed-position React nodes positioned from `clientX/Y` and
  measured via a ref, instead of mutating a shared DOM node's `innerHTML`.
- Path arrowheads inherit the path colour via `currentColor` on the group.
- Map labels use theme tokens (`--text`/`--bg`) so they track the active theme.

**Server:** removed the explicit `GET /journey-map-public/:token` page route
from `app.js` so the SPA catch-all renders the React page in production. The
`GET /api/journey-map-public/:token` data endpoint is unchanged.

---

## [4.7.0] – Unreleased — PcPublic migration

### Migrated: `pages/PcPublic.jsx`

Fully converted from `public/pc-public.html` to React. No `LegacyIframe`.

- Read-only public PC sheet served at `/pc-public/:token`, fetching
  `pcApi.publicData(token)` via `useAsync` (auto-run on `token`).
- Faithful port of the legacy layout: minimal header (`AppHeader` with
  `hideBack` + a "📢 Public View" `Badge`), portrait banner with emoji
  fallback on missing/broken image, and the single "Public Information"
  block (`whitespace-pre-wrap`), with empty/not-found states.
- Inline `<style>` replaced with Tailwind + `globals.css` theme tokens.

**Server:** removed the explicit `GET /pc-public/:token` page route from
`app.js` so the SPA catch-all renders the React page in production. The
`GET /api/pc-public/:token` data endpoint is unchanged.

---

## [4.6.0] – Unreleased — PcSheet migration

### Migrated: `pages/PcSheet/`

Fully converted from `public/pc-sheet.html` to React. No `LegacyIframe`.

**Files created:**

| File | Role |
|---|---|
| `hooks/usePcSheet.js` | All state + all API calls. Campaign/player selectors, character data, relationships, DM notes, portrait upload, export/import, public token. |
| `components/PortraitBox.jsx` | Portrait display with upload (size + dimension validation), URL input, clear button. |
| `components/RelationModal.jsx` | Add/edit relationship — name, type, status, link, parent (child-of), DM-only toggle. |
| `components/RelGraph.jsx` | SVG relationship graph — faithful port of `renderRelGraph()`. Family tiers, social fan, child-of-relationship nodes, tier bands, divider, section labels. Pan/zoom/fit controls. Hover tooltip with relation name and status. Clicking a node opens edit modal. |
| `tabs/index.jsx` | All six tab components in one file: `CharacterTab`, `StatsTab`, `RelationsTab`, `PublicInfoTab`, `PrivateTab`, `DmNotesTab`. |
| `PcSheet/index.jsx` | Main page: campaign/player selectors in header, tab bar, tab switcher. |

**Tabs:**
- **⚔️ Character** — name, portrait, story, traits/flaws/goals, public link copy
- **🎲 Stats Sheet** — NpcSheet embedded via `<iframe src="/npc-sheet?embedded=1">` with postMessage bridge (`NPC_READY` → `LOAD_STATS` / `COLLECT_STATS` → `STATS_DATA`). Save and Clear toolbar above the iframe.
- **🌳 Relationships** — flat list (indented for child-of relations) + SVG graph + add/edit modal
- **📢 Public Info** — textarea visible to all players
- **🔒 Private Info** — textarea for player + DM
- **📜 DM Notes** — DM-only notes with per-note visibility toggle and delete (DM role only)

**RelGraph improvements over vanilla:**
- Pan/zoom is React-controlled state (`useState`) rather than mutating a closure variable
- Hover tooltip is a React-rendered `<div>` positioned via `clientX/Y` — no canvas used
- SVG `<g transform>` handles viewport transform cleanly; fitting fires on data change via `useEffect`
- `onEditRelation` prop wires node-click directly to the edit modal in `RelationsTab`

**StatsTab postMessage bridge:**
- On iframe load, `NPC_READY` fires → parent sends `LOAD_STATS` with the character's saved stats
- On "Save Stats" click, parent sends `COLLECT_STATS` → iframe responds with `STATS_DATA` → saved via `pcApi.saveStats`
- Works with the migrated React NpcSheet (same bridge used by the legacy pc-sheet.html)

`/pc-sheet` Express route removed — React SPA catch-all handles it now.

---


## [4.5.0] – Unreleased — ManageCampaigns migration

### Migrated: `pages/ManageCampaigns/`

Fully converted from `public/manage-campaigns.html` to React. No `LegacyIframe`.

**Files created:**

| File | Role |
|---|---|
| `constants.js` | Harptos calendar months, location size types, tab definitions, calendar helpers (`absDay`, `doyFromForm`, `formatAbsDay`) |
| `hooks/useManageCampaigns.js` | All state: campaigns list, active campaign, per-tab data (players/locations/npcs/timelines/meta). All actions wired to `campaignsApi`, `timelineApi`, `usersApi`. |
| `tabs/PlayersTab.jsx` | Add player (name + user assign), delete, reassign user, create/open timelines |
| `tabs/LocationsTab.jsx` | Hierarchical location tree (recursive `LocationRow`), add/edit/delete/toggle visibility, search filter, edit modal |
| `tabs/OtherTabs.jsx` | Three tabs in one file: `NpcsTab` (bulk add by comma, chip delete), `TimelinesTab` (summary cards + navigate to timeline), `SettingsTab` (read-only calendar type, today-marker date picker, danger-zone delete) |
| `tabs/CharTreeTab.jsx` | Canvas relationship tree (pan/zoom), DM cross-connection list with add/edit/delete/visibility, `ConnModal` for linking relationships |
| `index.jsx` | Main page: `CampaignSidebar` (campaign list + create form + import), `TabBar`, tab content switcher, Export button in header |

**Design decisions:**
- Tab data is loaded all at once with `Promise.all` when a campaign is selected — avoids per-tab loading spinners and makes switching instant
- `buildLayout()` in `CharTreeTab` places player nodes in a horizontal row and NPC nodes below; the canvas drawing logic is a direct port of `drawTree()` from the vanilla version, wrapped in a `useRef`+`useEffect` canvas island
- `SettingsTab` calendar type is read-only with a note (cannot change after creation) — matches the original constraint
- `TimelinesTab` navigates to `/timeline` with query params rather than managing timeline data directly, consistent with the original

`/manage-campaigns` Express route removed — React SPA catch-all handles it now.

---


## [4.4.0] – Unreleased — SplitView + PdfViewer migration

### Migrated: `pages/SplitView/`

Fully converted from `public/split-view.html` to React. No `LegacyIframe`.

**Architecture:**
- `hooks/useSplitViewProfiles.js` — all profile/URL/layout state; persists to
  `localStorage` under `splitview-profiles`; separate `urls` (input fields) and
  `frames` (committed iframe srcs) so typing in an input doesn't reload iframes
  mid-edit
- `SplitView/index.jsx` — fullscreen fixed-grid layout; controls float as an
  overlay (no AppHeader, same as original); `ControlsOverlay` component for
  profile/layout/URL management

**Improvements over vanilla version:**
- Typing in a URL input no longer changes the iframe src — only "Load" (or Enter)
  commits the URL, preventing unintended page reloads while editing
- `prompt()` / `confirm()` replaced with inline handlers that still use browser
  dialogs for now (acceptable for this simple use-case; Modal upgrade is a TODO)
- Keyboard shortcut `H` toggles controls (added alongside the original Ctrl+1/2/3)
- Internal relative paths (e.g. `/timeline`) work without a protocol prefix

`/split-view` Express route removed.

---

### Migrated: `pages/PdfViewer/`

Fully converted from `public/pdf-viewer.html` to React. No `LegacyIframe`.

**Architecture:**
- `hooks/usePdfViewer.js` — all pdf.js state and rendering logic; loads pdf.js
  from CDN via a dynamically injected `<script>` tag; exposes `canvasRef` /
  `fsCanvasRef` for the page to attach to canvas elements; `setFsMode()` directs
  rendering to the correct target; `fitWidth(containerWidth)` for auto-scaling
- `PdfViewer/index.jsx` — collapsible sidebar, controls bar (reused in fullscreen),
  fullscreen overlay with its own canvas + dark controls bar

**Improvements over vanilla version:**
- `rendering` flag shown as a `<Spinner>` overlay on the canvas area instead of
  silently blocking further renders
- `usePdfViewer` hook is fully testable in isolation (no DOM coupling in state logic)
- pdf.js loaded lazily once — script tag injected only if `window.pdfjsLib` is absent
- Keyboard shortcuts (`←/→`, `+/-`, `F`, `Esc`) properly remove their listeners
  on unmount via `useEffect` cleanup

`/pdf-viewer` Express route removed.

---

### Added: `writing-mode` Tailwind utilities

`tailwind.config.js` plugin adds `.writing-mode-vertical` and
`.writing-mode-horizontal` utility classes used by the PdfViewer sidebar toggle.

---


## [4.3.0] – Unreleased — ItemCards migration

### Migrated: `pages/ItemCards/`

Fully converted from `public/item-cards.html` to React. No `LegacyIframe`.

**Sub-components:**

- `constants.js` — item types, rarities (with border colours), armor types,
  type-groupings, and `defaultForm()` factory
- `RichTextEditor.jsx` — controlled contenteditable editor; Bold / Italic /
  Bullet list / Clear toolbar; syncs HTML string to parent via `onChange`
- `ItemCardPreview.jsx` — `forwardRef` card component rendered from form state;
  scoped `<style>` block keeps CSS-variable styles intact for html2canvas capture
- `ItemCards/index.jsx` — main page: split form/preview layout, download PNG via
  CDN html2canvas, clear form, type-change resets type-specific stats

**Fixes over vanilla version:**
- Type change now resets only type-specific stat fields (weapon/armor/uses),
  preserving name, rarity, flavor text, attunement and abilities — resolves the
  "Item Card form fields should reset when Item Type is changed" backlog item ✅
- `<script>` tag for html2canvas is async so it doesn't block render
- `forwardRef` pattern means the parent holds the canvas target ref cleanly
  without DOM queries

`/item-cards` Express route removed — React SPA catch-all handles it now.

---


## [4.2.0] – Unreleased — NpcSheet migration + housekeeping fixes

### Migrated: `pages/NpcSheet/`

Fully converted from `public/npc-sheet.html` to React. No `LegacyIframe`.

**Sub-components:**
- `TagInput.jsx` — reusable autocomplete tag-chip input (keyboard + click, Backspace to remove)
- `AbilityScores.jsx` — six ability columns with score input, auto-modifier, ST proficiency toggle
- `SkillsBlock.jsx` — 18 skills in a 3-column grid with 0/proficient/expert cycling
- `SpellSection.jsx` — spell slot table with used/unused toggles per slot
- `NpcSheet/index.jsx` — main page assembling all sections

**New shared files:**
- `src/data/dnd.js` — static D&D 5e constants (abilities, skills, damage types, conditions,
  classes, spell slots tables, FULL/HALF/WARLOCK caster lists, `abilityMod`, `profBonus`,
  `fmtMod`, `getSlotArray` helpers). Shared with future PcSheet migration.
- `src/hooks/useNpcSheet.js` — all sheet state: fields, abilities, skillProfs, tags,
  spellNames, usedSlots, legRes. Exposes `collectSheet` / `populateSheet` for the
  embedded postMessage bridge used by PcSheet iframe.

**Embedded mode preserved:** `?embedded=1` hides the header and sets up the
`postMessage` bridge (`NPC_READY`, `LOAD_STATS`, `COLLECT_STATS`, `STATS_DATA`,
`IFRAME_RESIZE`) so the PcSheet iframe integration continues to work.

**Print support:** `@media print { .app-header { display:none } }` added to
`globals.css`; clicking "🖨 Print / PDF" calls `window.print()`.

---

### Fixed: duplicate `const fs` in `app.js`

The static-serving refactor accidentally introduced a second `const fs = require('fs')`.
Fixed by keeping one declaration at the top:

```js
const fs         = require('fs');         // sync (existsSync)
const fsPromises = fs.promises;           // async (readFile, readdir)
```

All `await fs.readFile` / `await fs.readdir` calls updated to use `fsPromises`.

---

### Fixed: `dnd-tools-db` renamed to `dnd-tools-ref-db`

`container_name` in `docker-compose.yml` and all references in `run.sh` updated.

---


## [4.1.0] – Unreleased — UserPanel migration + build fixes

### Migrated: `pages/UserPanel.jsx`

Fully converted from `public/user-panel.html` to React. No `LegacyIframe`.

**Improvements over the vanilla version:**
- Role change, password reset, and delete now use `<Modal>` components
  instead of browser `confirm()` / `prompt()` — non-blocking and styled
- All API calls go through `src/api/users.js`
- Error and success feedback via `useToast` instead of injected HTML strings
- `useAsync` hook handles loading / error states for the user list
- Refresh button to re-fetch without reloading the page
- "You" label on the current user's row; Delete button disabled for self
- Accessible table with proper `<th>` elements

---

### Fixed: `Dockerfile` — multi-stage build

The previous single-stage image did not build the React frontend.
Replaced with a two-stage build:
- **Stage 1 `frontend-build`** — `node:20-alpine`, runs `npm ci` + `npm run build` inside `frontend/`, outputs to `frontend/dist/`
- **Stage 2 `production`** — `node:20-alpine`, installs backend deps, copies `public/`, copies `frontend/dist/` → `public/app/`
- Upgraded base image from `node:25-alpine` (pre-release) to `node:20-alpine` (LTS)

---

### Fixed: `docker-compose.yml`

- Added `SESSION_SECRET` and `ID_SECRET` environment variables (read from `.env` via `${VAR:-default}` syntax)
- Added `restart: unless-stopped` to the postgres service
- Bumped healthcheck `retries` from 5 → 10 for slower machines
- Added comments explaining each section

---

### Fixed: `vite.config.js`

- Fixed `__dirname` for ESM (`fileURLToPath` pattern — required for `"type": "module"` packages)
- Changed `outDir` from `'../public/app'` (wrong — resolved relative to cwd) to `path.resolve(__dirname, 'dist')` (always correct)
- The Dockerfile then copies `frontend/dist/` → `public/app/` in the image

---

### Fixed: `app.js` — SPA static serving + catch-all route

Added two blocks after the existing `express.static` calls:
1. Serves `public/app/` as static assets at `/app/*` (only when the build exists)
2. A catch-all `GET *` route that serves `public/app/index.html` for any unmatched path, enabling client-side routing — legacy `.html` routes are still handled by Express directly

---

### Fixed: `run.sh`

Added two new steps before Docker build:
- **Step 4** — `npm install` inside `frontend/` (skipped if `node_modules` is current)
- **Step 5** — `npm run build` inside `frontend/` (skipped if `dist/` is newer than all source files)

Other improvements:
- Node.js version check (requires v18+)
- Better container restart detection (checks `State.Running` before `$COMPOSE up`)
- Cleaner banner formatting
- Added `$COMPOSE down -v` to the useful commands list

---


## [4.0.0] – Unreleased — React Frontend Scaffold

### Summary

Introduced a fully structured React 18 + Vite frontend in `frontend/`.
The Express backend (`app.js`, `public/`) is **unchanged** — this is a
pure frontend refactor. All modules remain accessible during migration via
a `LegacyIframe` bridge that embeds the original vanilla-JS pages inside
the React router shell.

---

### New: `frontend/` directory

| Path | Description |
|---|---|
| `frontend/package.json`     | React 18, React Router 6, Tailwind CSS 3, Lucide React, Vite 5 |
| `frontend/vite.config.js`   | Dev proxy to Express on `:3080`; builds to `public/app/` for production |
| `frontend/tailwind.config.js` | Extends Tailwind with D&D CSS variable tokens (`bg-surface`, `text-gold`, …) |
| `frontend/index.html`       | SPA entry; applies saved `data-theme` before React mounts to prevent flash |

---

### New: `frontend/src/styles/globals.css`

Single CSS file imported once in `main.jsx`:
- Tailwind `@base`, `@components`, `@utilities` directives
- All three theme token sets (`dark` / `light` / `slate`) as CSS variable declarations — identical to the previous `public/theme.css`, enabling Tailwind utilities and legacy vanilla pages to share the same tokens
- Global resets, scrollbar styles
- Tailwind `@layer components` entries for `.hdr-btn`, `.hdr-btn-accent`, `.hdr-btn-danger`, `.hdr-sel`, `.hdr-sep` — reusable across all pages

---

### New: Context providers (`frontend/src/contexts/`)

| File | Description |
|---|---|
| `ThemeContext.jsx` | Manages `dark`/`light`/`slate` theme with `localStorage` persistence; applies `data-theme` to `<html>` on change |
| `AuthContext.jsx`  | Fetches session user on mount; exposes `user`, `login()`, `logout()`, `changePassword()`, `loading`, `refresh()` |
| `ToastContext.jsx` | Global toast notification queue; `toast(msg, type?)` renders timed overlays at the bottom of the screen |

---

### New: API layer (`frontend/src/api/`)

Thin `fetch` wrapper (`client.js`) with `get / post / put / patch / del` helpers.
Error responses are normalised to `throw new Error(body.error)`.

| Module | Covers |
|---|---|
| `auth.js`         | `getUser`, `login`, `logout`, `changePassword` |
| `campaigns.js`    | Campaigns, players, locations, NPCs, meta, timelines summary, char-tree, export/import |
| `timeline.js`     | Named player timelines, entries, private (DM) timeline, public share |
| `pc.js`           | PC character, portrait, stats, relationships, DM notes, export/import, public token |
| `journeyMaps.js`  | Maps, locations, distances, trackers, paths, share, public data |
| `users.js`        | User CRUD (admin) |
| `docs.js`         | Module README fetcher |
| `index.js`        | Barrel re-export of all modules |

---

### New: Shared hooks (`frontend/src/hooks/`)

| Hook | Description |
|---|---|
| `useAuth.js`  | Re-export of `useAuth` from `AuthContext` |
| `useTheme.js` | Re-export of `useTheme` from `ThemeContext` |
| `useToast.js` | Re-export of `useToast` from `ToastContext` |
| `useAsync.js` | Generic async data-fetching hook: `{ data, loading, error, run }`; supports `autoRun` + deps |

---

### New: UI components (`frontend/src/components/ui/`)

| Component | Description |
|---|---|
| `Button`    | `default` / `accent` / `danger` / `ghost` variants; `loading` spinner state |
| `Modal`     | Portal-based accessible dialog; closes on Escape + backdrop click |
| `Badge`     | Inline label: `default` / `gold` / `danger` / `dm` variants |
| `Select`    | Styled `<select>` matching `.hdr-sel` |
| `Spinner`   | Animated loading indicator |
| `FormField` | `label` + children + `error` wrapper |
| `index.js`  | Barrel export (`import { Button, Modal, … } from '@/components/ui'`) |

---

### New: Layout components (`frontend/src/components/layout/`)

| Component | Description |
|---|---|
| `AppHeader.jsx`    | Standard header for all pages: `[icon][name] | [module slot] → [← Back][▾ Account]`. Account menu contains theme selector, change-password form, and logout. Login button shown when unauthenticated. |
| `AppLayout.jsx`    | Root `<Outlet>` wrapper providing the full-height flex-column shell |
| `LegacyIframe.jsx` | Temporary bridge that embeds a vanilla-JS HTML page in an `<iframe>` while it awaits migration |

---

### New: Pages (`frontend/src/pages/`)

| Page | Status | Notes |
|---|---|---|
| `Home.jsx`              | ✅ **Fully migrated** | Module grid, login modal, docs modal (fetches README.md), role-based visibility |
| `NotFound.jsx`          | ✅ **Implemented**    | 404 fallback |
| `Timeline.jsx`          | 🔲 Stub (LegacyIframe) | Awaiting migration |
| `ManageCampaigns.jsx`   | 🔲 Stub | |
| `JourneyMap.jsx`        | 🔲 Stub | |
| `PcSheet.jsx`           | 🔲 Stub | |
| `NpcSheet.jsx`          | 🔲 Stub | |
| `ItemCards.jsx`         | 🔲 Stub | |
| `PdfViewer.jsx`         | 🔲 Stub | |
| `SplitView.jsx`         | 🔲 Stub | |
| `UserPanel.jsx`         | 🔲 Stub | |
| `PcPublic.jsx`          | 🔲 Stub | Token-based public PC sheet |
| `JourneyMapPublic.jsx`  | 🔲 Stub | Token-based public journey map |
| `TimelinePublic.jsx`    | 🔲 Stub | Token-based public timeline |

---

### New: Router (`frontend/src/App.jsx`)

React Router 6 with a `ProtectedRoute` wrapper that redirects to `/` when
role requirements are not met. All routes are nested under `AppLayout`.

---

### Backend — no changes

`app.js`, `public/*.html`, `public/theme.css`, `public/app.css`,
`public/header-component.js`, and all API routes are **unchanged**.
The new frontend communicates with the same REST API as before.

---

### Getting started

```bash
cd frontend
npm install
npm run dev     # React dev server on :5173, proxies /api/* to Express on :3080

# Production build (outputs to public/app/)
npm run build
# Then add the SPA catch-all to app.js (see TODO)
```

---

## [0.1.1] – 2026-05-21

### Timeline — DM Combined View fixes

- **Event dot labels show real names**: in the DM combined view, every event circle now displays the name of the actual actor (character, NPC, or relationship) rather than always showing `"DM"`. A new `_dmNpcNames` map is loaded in parallel with relationships on `loadDMCombinedView` (`GET /api/campaigns/:cid/npcs`), and `cp_<id>` tokens are resolved via a new `_dmCampaignPlayers` list (see below). The dot abbreviation also strips leading emoji (`🎭 `, `👤 `) and trailing `(username)` parentheticals before slicing to two characters.
- **All campaign players resolved, not just those with timelines**: `_dmCampaignPlayers` is fetched from `GET /api/campaigns/:cid/players` (all players in the campaign), replacing the previous approach of building `cpIdToName` only from `_dmAllData` rows. Players who have no timeline entries yet are now correctly identified when referenced by `cp_<id>` tokens in other players' events.
- **`cp_` and `npc_` tokens fully handled in export and import** (`app.js`): previously only `self_`, `p_`, and `rel_` prefixes were remapped during campaign export/import; `cp_<db_id>` (campaign players referenced in DM events) and `npc_<db_id>` tokens fell through as raw IDs and broke after re-import. All four export paths (player timelines + DM timelines) and both import paths now map `cp_<id>` ↔ `player_name` and `npc_<id>` ↔ `npc_name`. A `npcNameById` lookup is built from the already-fetched `npcsRes` rows before the per-player loop — no extra query needed on export.

### Timeline — Player search

- **Search in "New Event" → Players** (sidebar): a live filter input above the player checkbox list narrows choices as you type. Clears automatically when `renderAll()` rebuilds the list.
- **Search in Edit Event modal**: the same filter sits above the `.mpc` scrollable checkbox list in the event-edit modal.
- **Search in Players sidebar section**: a live filter input above `#pl-list` hides player rows whose names don't match, useful when a campaign has many characters.
- All three use the shared `.pl-search` style (dark surface, gold focus border, italic placeholder) and a `filterPcl()` / `filterPlayerList()` helper that operates without re-rendering.

### PC Sheet — Cross-connections overhaul

- **All connection types now shown**: the API query previously only returned connections where one side was a `relationship` in `relIds`. Added two additional OR clauses so `player↔player`, `player↔npc`, and `relationship→player` (on the player side) are all returned. The query uses `DISTINCT ON (cr.id)` to prevent duplicates when a connection matches multiple conditions.
- **One bubble per external entity**: the chip list now groups by the *external* entity (the side not owned by the current player) rather than by the DB storage direction. Two connections from the same NPC to two different of the player's relationships now produce a single bubble with both arrows (`NPC ⟶ label ⟶ Rel A · ⟶ label ⟶ Rel B`).
- **Graph also fixed**: the graph renderer had the same directional blind spots. Rewrote `byLocalRel` grouping to use `isMyGraphEntity()` matching both `relationship` and `player` types. Connections anchored to the player directly (no relationship node) use a `'self'` sentinel key resolving to `{x:0, y:0}` with `SR` radius for edge start.
- **One graph node per external entity**: graph now builds `extNodeMap` keyed by external entity, with all edges accumulated per node. One circle is drawn per external entity; multiple dashed lines fan out to each local anchor. Repulsion iterations increased 60→120 and min gap 6→10 px to reduce overlap.
- **Cross-connections not shown when `relationships` is empty**: `renderRelList` returned early before reaching the cross-connections section. Now returns early only when both `relationships` and `crossConnections` are empty.
- **Notes hidden from players**: the API strips the `notes` field from cross-connection rows before returning them to non-DM viewers. DMs still see notes in both chips and graph tooltips.
- **DM-only connections shown to DMs**: the `WHERE cr.is_public = true` filter is now conditional — omitted for DM/admin viewers so they see hidden connections with a `🔒 DM only` badge.

### Manage Campaigns — Char-tree player show/hide

- **👁 / 🙈 toggle per player**: each player group header now has a button that hides or shows that player's entire tree column. State is held in a module-level `_hiddenPlayerIds` Set and survives tab switches within the session.
- **Canvas redraws on toggle**: `_treeVP` is reset to `{scale:1, ox:0, oy:0}` and `initTreeCanvas` is called immediately so the tree re-layouts around the remaining visible players.
- **No gaps for hidden centre players**: layout now uses `visiblePlayers = players.filter(...)` for column count and index, so hiding a middle player closes the gap rather than leaving empty space.
- **NPC nodes and cross-connection lines respect visibility**: NPC nodes are only added when at least one of their connections touches a visible player. Cross-connection lines are skipped if either endpoint belongs to a hidden player. `isEntityHidden()` moved to module scope so `drawTree` (a separate top-level function) can access it.

### Export filenames include date

- Campaign exports now download as `campaign-<slug>-YYYY-MM-DD.json`
- Journey Map exports now download as `journey-map-<slug>-YYYY-MM-DD.json`

### Unique location names per campaign

- **DB**: a case-insensitive unique index (`campaign_locations_campaign_name_unique`) on `(campaign_id, LOWER(name))` is created on startup via migration — prevents duplicates at the database level.
- **API**: `POST` and `PUT` location endpoints now return HTTP 409 with a clear message (`A location named "X" already exists in this campaign`) on conflict rather than a raw DB error.
- **Import**: campaign import uses `ON CONFLICT (campaign_id, LOWER(name)) DO UPDATE SET name=EXCLUDED.name` so re-importing a bundle never creates duplicate rows; the existing location is reused and its ID is mapped correctly.

### Module info bubbles on the Index

- Each module card on the index page now has an **ℹ** button in the header.
- Clicking it opens a modal that fetches and renders the module's `docs/<module>/README.md` as formatted HTML (headings, tables, code blocks, lists, links).
- New API endpoint: `GET /api/docs/:module` — serves the README as plain text. Only whitelisted slugs are accepted; no path traversal is possible.
- The modal closes on backdrop click or `Escape`.

### Campaign Export / Import — DM timelines + bug fixes

- **World timeline & Private DM timeline exported**: the DM's special `is_dm_player` row and all its timelines (`player_timelines`) are now included in the bundle under `dm_timelines: [{ name, entries }]`. Entry `player_id_refs` are remapped to name-based refs exactly like player timeline entries. **The DM's identity (username, user assignment) is intentionally omitted** — it is irrelevant to portability.
- **DM timelines restored on import**: if `dm_timelines` is present, a fresh DM player row is created and linked to the *importing* DM's user account. All timelines and entries are recreated under that row with `player_id_refs` remapped to the new DB IDs. Old bundles without `dm_timelines` import unchanged.
- **Fix — `player_ids` array type**: the `player_timeline_entries.player_ids` column is `TEXT[]`; the import was incorrectly passing `JSON.stringify(array)` instead of the raw array, causing a Postgres `malformed array literal` error. Fixed by removing the `JSON.stringify` wrapper.
- **Fix — body parser limit**: `express.json` limit raised from `5mb` to `50mb` to accommodate large campaign bundles containing base64 map images and PC portraits.

### Campaign Export table (updated)

| Section | Detail |
|---|---|
| Campaign meta | name, description, calendar type, today marker |
| NPCs | name list |
| Locations | name, description, `is_public`, `size_type`, parent hierarchy |
| Players | player name, linked username, PC sheet, stats, DM notes, relationships, timelines |
| **DM timelines** | **World timeline + Private DM timeline entries (no DM identity)** |
| Cross-connections | DM character-tree connections, fully ref-encoded |
| Journey maps | background image, pins, regions, distances, trackers, paths |

### Campaign Export / Import — full snapshot (v3)

Previous versions only exported the campaign skeleton (name, players, locations, NPCs). v3 exports and imports the complete campaign state.

**What is now exported**

| Section | Detail |
|---|---|
| Campaign meta | name, description, calendar type, today marker |
| NPCs | name list |
| Locations | name, description, `is_public`, `size_type`, parent hierarchy (via `parent_ref`) |
| Players | player name, linked username |
| → PC Sheet | name, story, traits, flaws, goals, public/private info, portrait (base64) |
| → Stats JSON | full NPC-style stat block |
| → DM Notes | content + `dm_visible` flag |
| → Relationships | name, type, link, `is_family`, `is_dm_only`, nested parent (via `parent_ref`) |
| → Timelines | all named timelines with every entry (title, description, location, date, duration, `player_id_refs`) |
| Cross-connections | DM character-tree connections, fully ref-encoded |
| Journey maps | name, description, background image, scope; locations (with polygon, `campaign_location_ref`, `linked_map_ref`); distances; trackers; paths with waypoints |

**No DB IDs in the bundle** — every cross-reference uses a symbolic `_ref` derived from the entity's name (e.g. `"Waterdeep"`, `"Aragorn:Gandalf"`). Duplicates are disambiguated with a `__N` suffix. This makes bundles human-readable and instance-independent.

**Import behaviour**
- Creates a brand-new campaign; never overwrites existing data
- All entities created inside a single DB transaction — any failure rolls back completely
- Two-pass inserts for locations and relationships to correctly restore parent/child hierarchies
- Two-pass insert for journey maps so `linked_map_ref` between maps resolves correctly
- `player_id_refs` in timeline entries are remapped to the new player/relationship DB IDs
- Cross-connections are silently skipped if either end ref cannot be resolved
- Username → user_id links are resolved against the live users table; unmatched usernames are skipped without error
- v2 bundles (previous format, no `_ref` fields) remain importable — the import falls back to using `name` as the ref key

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
