# TODO

Only open work lives here. Everything that is built and waiting on your QA moved to
[`TOQA.md`](TOQA.md).

---

## Security — noted, not fixed

Standing rule for this repo: findings get written down, not scheduled. The campaign-ownership
and trash-sealing items are **done**, and so are the three that stood here — unvalidated stats
JSON, no login throttling, no CSRF. All of it is in `TOQA.md`. What is left is what turned up
*while* doing them, and none of it was in scope:

- [ ] **`cookie.secure` and `trust proxy` are both deliberately off**, and must be turned on
      together if this ever goes behind TLS or a reverse proxy. Neither is a defect today and
      turning either on alone breaks things — see the deployment note in `ARCH.md`.
- [ ] **Tailwind 4 migration — five build-time advisories, no patched release.** `braces`,
      `micromatch`, `chokidar` and `fast-glob` are all reached through `tailwindcss`, and there
      is **no patched release** for them — `braces` is vulnerable at `<=3.0.3` and 3.0.3 is the
      latest version there is. The remediation npm offers is `tailwindcss@4`, which is a rewrite
      of the config model rather than a bump, so it is a migration to schedule rather than a fix
      to apply. None of them ships to a browser: they are devDependencies that run at build time
      against your own CSS, so an attacker would already need code in the repo to reach them.
- [ ] **`frontend/package.json` overrides `postcss-selector-parser` to `^7.1.6`** while Tailwind 3
      declares `^6.1.2`. It clears two advisories and the built CSS is byte-identical, so it
      works — but it is a deliberate semver violation and the first thing to drop if a Tailwind
      patch release ever builds oddly.
- [ ] **Print: continuation cards were promised but never built.** `constants.js` and the print
      help text both claimed content "flows across one or more cards" and spills "to another card"
      when it overflows. No such logic exists in `ItemCardPrint.jsx` — a face that still does not
      fit at the minimum font is clipped by `overflow: hidden`, silently. The false claims are now
      corrected, and the floor dropped 8px → 6px, which takes the Leruhy set from 30 clipped cards
      to 4. The remaining four (Crown of the Final Silence, Twin Swords, Spear of the Resonant
      Soul, Boots of the Veiled Passage) are each ~1.0–1.2× over and still lose their tail.
      Building it properly means paginating the abilities HTML across fixed boxes without
      splitting mid-word or orphaning a heading, and numbering the faces "2/2".

---

## General

Touch input and the two overflowing layouts are **done** — see `TOQA.md`. What is left of
"responsive" is a long tail of smaller fixes, listed here so they are not rediscovered:

- [ ] **Timeline's own layout** — a 256px sidebar plus a 160px gutter is 416px of chrome before
      any timeline is drawn. The sidebar already has a collapse path in CSS (`.sidebar.collapsed`
      plus an 18px `.sb-toggle` rail); it just is not wired to a breakpoint.
- [ ] **PdfViewer** defaults its 240px sidebar open (`sidebarOpen = true`), so it opens wrong on
      a phone. One line — default it from a width check.
- [ ] **Non-responsive two-column form grids** in six modals: `Diary/EntryModal.jsx:75`,
      `ManageCampaigns/tabs/OtherTabs.jsx:229` (a 3-col date picker), `Timeline/Modals.jsx:23,280`
      and `NpcSheet/index.jsx:741` (both **inline styles**, so unreachable by a Tailwind prefix —
      they need a class), and `timeline.css:325` `.fg`.
- [ ] **Viewport-unit jitter** — `85vh`/`88vh`/`92vh` on modals resize as the mobile address bar
      hides and reappears. Nothing in the app uses `dvh`. (Timeline's `100vh`, the worst case,
      is already fixed.)
- [ ] **`PcPublic.jsx:32`** — a 120px portrait in a `flex` row with no `flex-wrap`.
- [ ] **`CharTreeTab.jsx`** draws at a hard-coded `H = 560`.
- [ ] **The distance matrix** is an N×N `white-space: nowrap` table — it scrolls on a phone but
      is not usable. Probably wants a different presentation rather than a responsive fix.
- [ ] **SplitView** — four iframes at ~195px each on a phone. Arguably should just say
      "desktop only" rather than be fixed.

---

## Manage Campaign

- [ ] Small search box on Char Tree to filter for people


---

## Planned features (not started)

Captured for later — nothing here has been designed or scoped yet.

### NPC Management — a new module, or a section of Manage Campaigns

- [ ] **Manage NPCs and other characters properly**, the way LoreForge does — somewhere richer
      than the current `campaign_npcs` table, which holds little more than a name. Important to have a flag to define NPCs with Sheet (enemies/allies) and without it.
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

### PHB & DM Rules - A series of quicklinks for accessing the Official Rules of D&D

- [ ] Link for status, conditions, properties, etc (inside PC Sheets)
- [ ] Accesss to Official books (Maybe upload the PDF into the PDF Viewer or by API calls to SRDs)


### PC Sheet — other

- [ ] Prepare for Multi-Class
- [ ] Expand to character creation and level up (automatical, based on D&D rules and not manual)

---

## Ideas worth considering

My suggestions, not your backlog — nothing here has been agreed. Ordered by what I think is
worth most relative to its cost, and each one grounded in something this app already has or
is missing rather than in a feature list from elsewhere. The comparisons name the tool that
does the same thing well, so you can judge whether you want that at all.

### 2. One search box across the whole campaign

`grep -n "search" app.js` returns **nothing** — there is no search endpoint at all. Finding
"that inn where they met the tiefling" means remembering which module you wrote it in and
scrolling. You already have the corpus: location descriptions, NPC entries, PC public/private
info, DM notes, timeline events, and diary entries per campaign.

Postgres full-text (`tsvector` + a GIN index per table, or one materialised search view) gets
you there without a new dependency. The result list needs to respect the same visibility rules
the modules do — a player's search must not surface `private_info` or an unpublished diary
entry — which is the actual design work, not the indexing.

*Compare:* LegendKeeper, Kanka and Obsidian Portal all live or die on this. It is the single
feature that turns a pile of notes into a wiki.

### 3. Cross-links between modules in the text you already write

You have a shared markdown renderer (`components/ui/renderMarkdown.js`) used by the diary, notes
and descriptions. Teaching it a `[[Location Name]]` / `[[NPC Name]]` form that resolves to the
campaign entity and renders as a link would connect the diary to the map to the timeline without
any new UI. It also gives search (idea 2) a graph to rank by.

Caveat worth settling first: links have to resolve *per viewer*, or a player's diary page links
to an NPC they have never met.

*Compare:* this is exactly Obsidian's and Kanka's mention syntax, and it is the reason both feel
cohesive rather than like a set of forms.

### 4. A player-facing campaign page

You already generate share links for timelines, the campaign diary, PC sheets and journey maps —
four separate URLs a player has to keep track of. One per-campaign player page that gathers
whatever that player is allowed to see (their sheet, the shared timelines, the published diary,
the public map, and the NPCs they have met once NPC Management exists) would replace all four.

The access rules all exist; this is mostly assembly.

*Compare:* Obsidian Portal's campaign homepage, World Anvil's player-facing world.

### 5. Session prep, in the app

The diary records what *happened*. Nothing records what you intend to happen. A "next session" note per
campaign, with a one-click promote-to-diary-entry after the session, would close that loop and
reuse the diary's editor and markdown wholesale.

Lower down the list because your Obsidian workflow already works, and a worse copy inside the app
is a step backwards. Only worth it if the cross-links from idea 3 exist, so prep can point at
real NPCs and locations.
