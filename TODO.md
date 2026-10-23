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
- [ ] **Weapon cards have no field for the weapon TYPE** — dagger, greatsword, warhammer. It
      is written into the abilities text on most cards, and `~/Documents/Leruhy/tidy-weapon-stats`
      reports it rather than guessing, because the parenthesised part ("Dagger (Finesse, Light,
      Thrown 20/60 ft.)") mixes the type with its properties.
- [ ] **Print: cut marks.** The sheet is centred and the backs line up, but you still cut by
      eye against the card border. Thin marks in the 7.5 mm margin would make the cut
      repeatable — and would show at a glance when a printer is shifting the page.
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
      *(The remaining form grids and the `dvh` jitter are listed under "Modals and type" below,
      where the rest of that survey lives.)*
- [ ] **`PcPublic.jsx:32`** — a 120px portrait in a `flex` row with no `flex-wrap`.
- [ ] **`CharTreeTab.jsx`** draws at a hard-coded `H = 560`.
- [ ] **The distance matrix** is an N×N `white-space: nowrap` table — it scrolls on a phone but
      is not usable. Probably wants a different presentation rather than a responsive fix.
- [ ] **SplitView** — four iframes at ~195px each on a phone. Arguably should just say
      "desktop only" rather than be fixed.

---

## Features — planned, or part-built

Most of this was captured before anything was designed. Where a section has since shipped it
says so and keeps only what is still open; the built part is in `CHANGELOG.md`, and whatever
is waiting on your QA is in `TOQA.md`.

### New Modules
#### DM Notes

- [ ] A way of taking notes with ideas not linked to a Campaign (like a DM Diary of what I'd like a future Campaign or One Shot to be). This would be the start of a World Building module.

##### PHB & DM Rules - A series of quicklinks for accessing the Official Rules of D&D

- [ ] Accesss to Official books (Maybe upload the PDF into the PDF Viewer or by API calls to SRDs)
- [ ] Quick access to Conditions, Spells, Monsters, rules, etc... Search would be the key here

#### Campaign Poll

- [ ] **Partial import into an existing campaign still refuses** players, maps, DM timelines,
      party events, item cards and Char Tree connections — now *saying* so, rather than dropping
      them. Each needs a matching rule before it can merge (a seat, its account and its stats all
      have to agree), so for those parts, import as a new campaign.
- [ ] **Campaign surveys — follow-ups.** The feature shipped; these did not:
      a player-facing history (they only ever see the form, never what the table said);
      CSV export of a run; a nudge for the players who have not answered, which today means
      telling them yourself; and a multi-select question type — your sixth question ("what
      aspect of play is missing") is still a scale plus a comment box, which collapses five
      different answers into one number.

### PC Sheet — other

- [ ] Prepare for Multi-Class
- [ ] Expand to character creation and level up (automatical, based on D&D rules and not manual)

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

---

## Ideas worth considering

### 1. Session prep, in the app — **shipped**

The 🗓 Sessions tab in Manage Campaigns.

- [ ] **Campaign Pendings** — a campaign-level backlog, not tied to any session. Deferred by
      agreement when the feature was scoped, and still the only part not built. 
