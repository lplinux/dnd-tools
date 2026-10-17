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

## Planned features (not started)

Captured for later — nothing here has been designed or scoped yet.

### NPC Management — mostly shipped

Most of this section is **done** — see the CHANGELOG. Settled: it is a **tab**, not a module;
public/private info is withheld server-side like the PC sheet's; and players see revealed NPCs
through cross-links and the Campaign Links tab, gated on having met them. What remains:

- [ ] **A flag for NPCs that have a stat block** (enemies/allies) versus those that do not, so
      the ones that need a sheet can be told apart from the ones that are just a name and a note.
      The one part of the original idea not built.


### PHB & DM Rules - A series of quicklinks for accessing the Official Rules of D&D

- [ ] Accesss to Official books (Maybe upload the PDF into the PDF Viewer or by API calls to SRDs)

### PC Sheet — other

- [ ] Prepare for Multi-Class
- [ ] Expand to character creation and level up (automatical, based on D&D rules and not manual)

### Manage Campaign

- [ ] A campaign can export a bundle larger than the 50 MB import limit (`express.json`), so a
      big enough campaign produces a backup it cannot restore. The dominant payload is base64
      map and portrait images. A 413 currently surfaces as Express's HTML error page.
- [x] Invite link for new users to join a Campaign — **done**, see the CHANGELOG. One hour,
      single use, token stored hashed, revocable. The DM points it at a new seat or an
      existing empty one, and someone who already has an account can use it too.
      - [ ] Still no email — the link is copied to the clipboard and sent by hand, as agreed.

---

## Ideas worth considering

### 1. Session prep, in the app

The diary records what *happened*. Nothing records what you intend to happen. A "next session" note per
campaign, with a one-click promote-to-diary-entry after the session, would close that loop and
reuse the diary's editor and markdown wholesale.

Lower down the list because your Obsidian workflow already works, and a worse copy inside the app
is a step backwards. Only worth it if the cross-links from idea 3 exist, so prep can point at
real NPCs and locations — **and they now do**, so the precondition is met if you ever want this.