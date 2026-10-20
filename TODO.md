# TODO

Only open work lives here. Everything that is built and waiting on your QA moved to
[`TOQA.md`](TOQA.md).

---

## Security — noted, not fixed

Standing rule for this repo: findings get written down, not scheduled. The campaign-ownership
and trash-sealing items are **done**, and so are the three that stood here — unvalidated stats
JSON, no login throttling, no CSRF — and now the TLS pair as well: `cookie.secure` and
`trust proxy` are one knob, `TRUST_PROXY_HOPS`, so neither can be set without the other. All of
it is in `TOQA.md`. What is left is what turned up *while* doing them, and none of it was in
scope:

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
- [ ] Increase Font size. In general looks too small. Point me first to the files that have the size config and I'll try to change it.
- [ ] Item Cards "Print set (9)" is kept in cache/memory even after logout and should not

---

## Features — planned, or part-built

Most of this was captured before anything was designed. Where a section has since shipped it
says so and keeps only what is still open; the built part is in `CHANGELOG.md`, and whatever
is waiting on your QA is in `TOQA.md`.

### NPC Management — mostly shipped

Most of this section is **done** — see the CHANGELOG. Settled: it is a **tab**, not a module;
public/private info is withheld server-side like the PC sheet's; and players see revealed NPCs
through cross-links and the Campaign Links tab, gated on having met them. What remains:

- [ ] **A flag for NPCs that have a stat block** (enemies/allies) versus those that do not, so
      the ones that need a sheet can be told apart from the ones that are just a name and a note.
      The one part of the original idea not built.
- [ ] NPC view should show relationships to DM and to players (only the public ones)
- [ ] Clic on an NPC or location should show a big card instead (so big text is more readable)
- [ ] SEEN status should be along the name (so it's faster to hide or show based on the names)
- [ ] Add also the status between "alive/dead/unknown"
- [ ] NPC Description should be the only thing a Player should be for now. The rest is only for DM

### New Module - DM Screen
#### DM Notes

- [ ] A way of taking notes with ideas not linked to a Campaign (like a DM Diary of what I'd like a future Campaign or One Shot to be). This would be the start of a World Building module.

#### PHB & DM Rules - A series of quicklinks for accessing the Official Rules of D&D

- [ ] Accesss to Official books (Maybe upload the PDF into the PDF Viewer or by API calls to SRDs)
- [ ] Quick access to Conditions, Spells, Monsters, rules, etc... Search would be the key here

### PC Sheet — other

- [ ] Prepare for Multi-Class
- [ ] Expand to character creation and level up (automatical, based on D&D rules and not manual)

### Manage Campaign

- [ ] A campaign can export a bundle larger than the 50 MB import limit (`express.json`), so a
      big enough campaign produces a backup it cannot restore. The dominant payload is base64
      map and portrait images. A 413 currently surfaces as Express's HTML error page.

### Modals and type — **done**, see the CHANGELOG

The entry dialogs are full screen, the timeline event form is two columns, and the type scale
is rooted at 16px with nothing below 10.4px. What is left of the original survey:

- [ ] **`SrdInfo.jsx:77`** — SRD rules text at the 448px default. Left alone by choice; raise
      it if spell descriptions feel cramped in use.
- [ ] **The remaining non-responsive two-column grids**: `ManageCampaigns/tabs/OtherTabs.jsx:229`
      (a 3-col date picker), `NpcSheet/index.jsx:741` and `:808` (inline styles, so unreachable
      by a Tailwind prefix — they need classes), and `timeline.css:325` `.fg`. The two in
      `Timeline/Modals.jsx` are fixed.
- [ ] **Viewport-unit jitter** — `85vh`/`88vh`/`92vh` on modals resize as the mobile address
      bar hides and reappears. Nothing uses `dvh`. The new full-screen dialogs inherit this.

---|---|---|
| `Diary/EntryList.jsx:150` | **Reading an entry** — shared by Campaign Diary, player diaries, PC Sheet 📔, Journal | `max-w-2xl` | Change to `95vw/92vh`
| `Diary/EntryModal.jsx:57` | New/edit diary entry (campaign + player) | `max-w-2xl` | Change to `95vw/92vh`
| `Journal/JournalPanel.jsx:329` | New/edit journal entry | `max-w-2xl` | Change to `95vw/92vh`
| `Sessions/SessionsPanel.jsx:608` | New/edit session card — markdown body | **default** | Change to `95vw/92vh`
| `components/SrdInfo.jsx:77` | SRD rules text — spells, item descriptions | **default** | Leave as is

*Many fields, cramped at 448px:*

| File | What it is |
|---|---|
| `ManageCampaigns/tabs/NpcsTab.jsx:214` | Edit NPC — **three textareas** (description, public, private) plus name and location |  Double the size so description is bigger
| `ManageCampaigns/tabs/LocationsTab.jsx:275` | Edit Location — also listed above for its non-responsive 2-col grid | Leave it as is
| `ManageCampaigns/tabs/CharTreeTab.jsx:830` | Add/edit cross-connection | Leave it as is
| `PcSheet/components/RelationModal.jsx:49` | Add/edit relationship | Leave it as is
| `Timeline/Modals.jsx:258` and `:192` | Edit event / read event — also listed above for its 2-col grid | Convert into multiple columns and transform it into `95vw/92vh`
| `PcSheet/tabs/InventoryTab.jsx:690`, `:772` | Item editor, grant from library | Leave it as is

*Already wide — nothing to do:* `JourneyMap/modals/DistanceMatrixModal.jsx:29` (`95vw × 92vh`,
the only true full-screen one), `Home.jsx:144` and `JourneyMap/modals/WaypointEventModal.jsx:63`
(both `max-w-lg`).

*Small by nature — leave them:* confirm dialogs (`ConfirmContext.jsx:45`), login
(`Home.jsx:192`), Manage HP (`NpcSheet/index.jsx:806`), Set Today Marker (×2), New Timeline
(×2), Add Player, Add Location, Filter by date, Share Map, New Journey Map, Name Path,
Distance, Import PC Sheet/Timeline, Give item, User Panel. Each is a few short fields;
widening only spreads three inputs across a wall.

---

## Ideas worth considering

### 1. Session prep, in the app — **shipped**

The 🗓 Sessions tab in Manage Campaigns. Everything asked for was built except the one item
below: the five states, nesting to any depth, cross-links, the On-Going view, drag and drop
across sections, search and filtering, read-only played sessions, generate-next, export and
import, a place in the campaign bundle, and converting *What happened* into Journal entries.
The detail is in `CHANGELOG.md`; the QA checklist is in `TOQA.md`.

- [ ] **Campaign Pendings** — a campaign-level backlog, not tied to any session. Deferred by
      agreement when the feature was scoped, and still the only part not built. Until it
      exists, the *Pending* and *For later on* headings of the Obsidian prep notes import
      into one labelled parent card under the session's beats.
- [ ] Cambiar de fecha en sessions y que haya algún mensaje de eventos próximos basado en el timeline

