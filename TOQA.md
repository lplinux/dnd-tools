# TOQA — done, pending your QA

Everything below is **implemented and in the code**. This file is the QA queue, moved out of
`TODO.md` so that file only holds work that is still open.

The `- [x]` marks the *work* as done. Tick items off here as you verify them in the browser —
or delete the section once a whole area has been signed off. Most of this has only been
verified by tests and by reading the code; the UI changes in particular want a real pass with
a real campaign.

Already confirmed by you in use: the **campaign and player export/import round-trip**, and the
PC Sheet / Journey Map / Manage Campaign fix batch that went with it.

---

## Character evolution (🌱 Evolution tab)

- [ ] **Manage Campaigns → 🌱 Evolution.** Pick a character along the top; the three groups
      should each show a count and open on click.
- [ ] **Add a card in each of the three groups**, nest a sub-card under one, and check the
      sub-card stays with its parent's character and group.
- [ ] **There should be no "What they have revealed" group** — that belongs in the Campaign
      Journal as a DM-only entry under its own category. If you had already added one before
      this change, it is now under Learning paths, moved rather than deleted, for you to
      refile.
- [ ] **The third group reads "✨ Homebrew"**, not "Homebrew spells". Anything you filed there
      before the rename should still be in it.
- [ ] **Characters are listed alphabetically**, with 🎲 The party always last.
- [ ] **Switch character** — the cards should follow the selection, and 🎲 The party should
      have its own set.
- [ ] **Mark a parent Done** — its sub-cards should go Done with it. **Mark one Running** —
      only that card should change.
- [ ] **Edit a card that is already Done** — the state must survive the edit.
- [ ] **`[[Calcifer]]` in a body** should resolve to the NPC card, as it does elsewhere.
- [ ] **Delete a card with sub-cards** — they should all go, without the page reloading or
      jumping to the top.
- [ ] **The private bit, worth checking once:** log in as a player and confirm there is no way
      to reach any of this. There is no route for it, but your eyes are the test that counts.

---

## API tokens, and the TLS switch

### Tokens

- [ ] **Account menu (header) → API Tokens.** It should open a dialog, and be reachable from
      any page and by any logged-in user, not just a DM.
- [ ] **Create one, copy it, close the box** — it should never be shown again, and the list
      should never show the secret.
- [ ] It should **no longer appear** in Manage Campaigns → ⚙️ Settings.
- [ ] **Use it**: `curl -H "Authorization: Bearer dnd_…" http://localhost:3080/api/campaigns`.
      No cookie, no CSRF header, should just work.
- [ ] **A read-only token should refuse a PUT**, and **neither scope should be able to DELETE**.
- [ ] **Revoke one** — whatever was using it should stop immediately.
- [ ] **`used` should fill in** after a call (within a minute; it is written at most once a
      minute on purpose).
- [ ] The three things it must refuse: `/api/tokens`, `/api/auth/change-password`, `/api/users`.
- [ ] **The browser must be unaffected** — logging in, editing, and CSRF should behave exactly
      as before.

### Discovery

- [ ] **`curl -H "Authorization: Bearer dnd_…" .../api/discover`** — should list every route
      with `allowed` true or false, and a `why` on each refusal.
- [ ] **The same call with a read-only token** should mark every POST/PUT/PATCH refused.
- [ ] **Anonymous should get 401.**
- [ ] **As a player** (session), DM-only routes should read `needs role: dm or admin`.
- [ ] Spot-check the promise: pick a route it marks `allowed` and call it; pick one it refuses
      and confirm it really is refused.

### TLS

Nothing to do locally: `TRUST_PROXY_HOPS` defaults to `0`, which is the current behaviour.
Worth one check at boot that it still says *"Plain HTTP, no proxy"*.

- [ ] When you do put it behind a proxy: set `TRUST_PROXY_HOPS=1`, make the proxy send
      `X-Forwarded-Proto: https`, and confirm the boot line says *Behind 1 proxy hop(s); secure
      cookies ON*. The session cookie should then carry `Secure`. (Verified here against a
      simulated proxy, but your real one is the test that counts.)

---

## Session prep: the three loose ends

All three were written down as open questions when the feature shipped. Each is now built,
covered by tests that were each proved to fail when the guard is reverted, and exercised live
against a scratch Postgres (34 checks).

### Skipped now cascades

- [ ] **Mark a parent card Skipped** — every sub-card beneath it, to any depth, should go
      skipped with it, the same way Done already did.
- [ ] **Mark a parent On-Going, Ready or In-Preparation** — those must still change only the
      card you clicked. A parent is on-going precisely because one child is and the rest are
      not, and that distinction is the reason the other three do not cascade.

### Dragging between sections

- [ ] **Drag a beat into *What happened*.** The strip at the foot of each section is the
      target, and it should now appear for a drag that started anywhere — it is the only
      target an empty section has, and *What happened* usually is empty.
- [ ] **It should be labelled "Move to …"** when the drag came from another section, and
      unlabelled when you are just reordering within the one you are in.
- [ ] **Its sub-cards must come too.** Drag a card that has a couple of levels under it and
      check they all land in the new section — a child left behind would simply disappear
      from the page.
- [ ] **Reordering within a section should be exactly as it was.** This is the regression
      risk: the renumbering now runs against the *destination* list.
- [ ] **Dropping a card inside its own subtree is still refused.**
- [ ] **A played session still freezes** — no dragging at all until it is marked Prepared.

### Still Running vs. What happened

- [ ] **Mark a card On-Going, see it in a later session's Still Running, then drag it into
      *What happened*.** It should leave Still Running — it is a record now, not a thread.
      The count beside the session in the list should agree.

### What happened → the Campaign Journal

- [ ] **📖 To journal** on the *What happened* heading. It should appear only when that
      section has cards, and **also on a played session** — that is when you would use it.
- [ ] **The checkbox is an opt-in.** Left alone, the entries land DM-only; a player should
      see nothing. Tick "let the players read these" and they should.
- [ ] **Sub-cards fold into the body** as nested bullets, not as separate entries.
- [ ] **Click it twice.** The second run should write nothing and say so, not double the
      journal.
- [ ] **The session keeps every card** — this copies, it never moves.
- [ ] **No card from the other three sections** should ever appear in the journal.
- [ ] Filed under `Session N` by default; the in-game day is optional, and **day 0 is a real
      date** in this epoch, so it should survive as 0 rather than vanishing.

### Marking a session Played

- [ ] With *What happened* **empty**, it should warn first and explain that Played is
      read-only. Cancelling should leave the session Prepared.
- [ ] With notes written, no warning — straight to the generate-next offer as before.

### The page no longer jumps

- [ ] **Scroll down, edit a card, save.** The page should stay where it is, with the same
      cards expanded. This was the bug: it went back to the top and collapsed everything.
- [ ] **Same for deleting**, including a card with sub-cards — they should all disappear
      without a reload.
- [ ] **Add a sub-card to a collapsed parent** — the parent should open so you can see it.
- [ ] **The section headings should stay visible** while their cards scroll under them, and
      the state menu must still open *over* a heading, not behind it.

### The campaign bundle carries the prep

- [ ] **Export a campaign and reimport it.** The sessions, their cards, the nesting and the
      states should all come back. The confirmation now names how many sessions and cards
      arrived.
- [ ] **An older bundle with no prep in it should still import**, landing zero sessions
      rather than erroring.
- [ ] **The `campaign-sessions` file is unchanged** and still the way to move prep between
      campaigns without the players and maps.

Note for later, not a QA item: the bundle still declares **version 5** although it now carries
a `sessions` key. Nothing reads that number — the import is field-driven — and the unmerged
`npc-management-feature` branch has already claimed 6. It is in `TODO.md` to reconcile when
those branches meet.

---

## Rules lookups on a pinned item card

### Already proved live

- [x] **The SRD returns real text** for both resources ✅ — `weapon-properties/finesse` and
      `damage-types/slashing` both answer, under `description` (not `desc`; our `lookup()`
      already reads either).

### Wants your eyes in the browser

- [ ] **Escape closes a pinned card** — and moving the pointer still dismisses an unpinned one.
- [ ] **Click an item in the inventory to pin it**, then click a property — the SRD text should
      open. Hovering alone should still just show the card, unclickable.
- [ ] **A weapon with several properties** — each word separately clickable, commas untouched.
- [ ] **Damage type** likewise.
- [ ] **A homebrew property** the SRD does not have should be plain text, not a link.
- [ ] **The PNG and the Print Set must be unchanged.** Download a card and print a set; neither
      should carry a dotted underline or any other affordance. This is the regression the
      `lookups` default exists to prevent.
- [ ] **The Item Cards creator's live preview** should also be unchanged.
- [ ] **The lookup modal over the pinned card** — it should open above it, and closing it should
      leave the card still pinned.
- [ ] **Offline**, a property should fall back to plain text or an empty modal rather than
      hanging.

---

## Cross-link popover, the party in the filter, SRD lookups, Char Tree filter

### Already proved live

- [x] **`link-targets` returns the party** ✅ — sheet name when set (*Thalia Moonwhisper*),
      player-slot name otherwise (*Brun*), for both the DM and a player.
- [x] **A player still gets no NPCs** ✅ — the party being added did not widen anything.
- [x] **A character name does not resolve as a link** ✅ — `buildIndex` takes only locations and
      NPCs, asserted by a test that passes characters in and expects an empty index.
- [x] **The SRD resources exist and are reachable** ✅ — spells 339, damage-types 13,
      weapon-properties 10.

### Wants your eyes in the browser

- [ ] **Click a `[[link]]` while reading a journal entry.** The popover must appear ON TOP of
      the entry — this is the bug being fixed, so it is the one to check first. Then press
      Escape, and click outside it, and confirm both dismiss it.
- [ ] **Type `[[` and look for a party member** — they should appear with a 🧝 and *name only*.
      Pick one, save, and confirm the name renders as plain text rather than a link.
- [ ] **The chips look like a field** in the Item Cards form — a bordered box on the dark
      theme, level with the Damage Type input above it, not bare text beside a white browser
      input. Check the NPC sheet's parchment chips are untouched.
- [ ] **Spell suggestions are per level**: type `fire` in the 3rd-level row and only Fireball
      should appear; the cantrip row should offer Fire Bolt and not Fireball.
- [ ] **The cantrip row still has suggestions at all** — level 0 is the one most likely to have
      been filtered away to nothing.
- [ ] **Spells are chips now.** Add one, add a second, remove the first with its ×, and check
      the ⓘ opens its SRD text. Then save, reload, and add another — reopening must not land
      you inside the last spell, which is the bug this replaced.
- [ ] **Free text still works** — type a homebrew spell and press Enter.
- [ ] **A comma also commits**, matching the old habit.
- [ ] **Ten spell levels of chips** — check the table is not noticeably taller or harder to
      scan than the old single-line chip row.
- [ ] **Print the stat sheet**: no × and no ⓘ on paper, for spells *or* Defenses, and no
      "+ Add spell level…" row under the last level.
- [ ] **Item Card properties** behave the same way.
- [ ] **No ⓘ beside Damage Type** in the Item Cards form.
- [ ] **Item card damage type**: the combobox should offer the 13 SRD types and still accept
      free text for homebrew.
- [ ] **Offline behaviour** — with no network, all three fields should behave as plain inputs
      rather than hanging or erroring.
- [ ] **Char Tree filter**: type a player's name and check the chips AND the cross-connection
      columns narrow, that the count reads sensibly, and that **nobody disappears from the
      tree** — the filter is for the lists only.
- [ ] **On a phone**, the three dropdowns: tapping a suggestion must insert it. They use
      `onPointerDown` for exactly this reason and it is the part most likely to be wrong.

---

## Character/player uniqueness, and the diary's hidden names

### Already proved live

- [x] **A differing-case duplicate character name is refused** ✅ (409), by the route and by
      the database — while the same name in **another** campaign is fine.
- [x] **One user cannot hold two seats** ✅, by adding or by reassigning; a refused reassign
      leaves the existing assignment untouched, and they can still play in another campaign.
- [x] **The migration renames rather than deletes** ✅ — seeded `DAVIN` + `davin`, restarted:
      5 rows before and after, the character sheet survived, 0 duplicates remain.
- [x] **A published diary entry naming a hidden location or an unmet NPC is withheld** ✅,
      with no trace of the name in the payload, and returns when the NPC is revealed.
- [x] **The DM still reads all of it** in the Diary module ✅.

### Wants your eyes in the browser

- [ ] **After upgrading**, look for any character name ending in ` #<number>` in Players —
      that is a clash the migration renamed and wants a human to resolve. Leruhy has none.
- [ ] **Try to add a second character for a user who already plays** — the message should name
      the character they already have.
- [ ] **Open your published diary share link as a player** and confirm entries naming
      unrevealed things are absent, not blanked.
- [ ] **Then reveal one** and reload the link — the entry should appear.

---

## Hidden-aware journal, cards, and import-into

### Already proved live

- [x] **An entry naming a hidden location or an unmet NPC is withheld** ✅ — including the
      accent-folded form `[[thea]]`, the typed form `[[npc:Théa]]`, and an entry merely
      *tagged* with a secret location and containing no link at all.
- [x] **Entries that name nothing hidden still show** ✅, including one that links a name
      matching nothing at all.
- [x] **Revealing the NPC brings its entries back on their own** ✅, while an entry naming a
      still-hidden location stays withheld.
- [x] **No hidden name appears anywhere in the player's payload** ✅.
- [x] **import-into replaces only the sections in the file** ✅ — an NPC-only file left the
      campaign's locations, journal and diary untouched.
- [x] **A matched NPC keeps its row id**, takes the file's notes and visibility ✅.
- [x] **An unreferenced NPC absent from the file is removed; a referenced one is kept** and
      reported ✅.
- [x] **The real Leruhy file imported into a live campaign** ✅ — 91 NPCs, 106 locations,
      22 diary entries, 0.3s, players/maps/DM-timelines reported as skipped.

### Already proved live — location maps

- [x] **A location with both its own map and a pin on the world map links to its own** ✅.
- [x] **A pinned-only location links to the map it is on** ✅; one on no map gets no globe.
- [x] **Players get no map link at all** ✅.
- [x] **43 locations still load in 6ms** ✅ — one LATERAL, not a query per row.

### Wants your eyes in the browser

- [ ] **Open a location's card** and check the people listed there are right, with unmet ones
      dimmed.
- [ ] **Click the globe** beside a location — it should open the Journey Map on the right map,
      and NOT also open the card.
- [ ] **Then pick a different map** on that page — it must stay picked, not snap back to the
      one in the URL.
- [ ] **A location with no map** should show no globe at all.
- [ ] **As a player**, open a place in Campaign Links — the people listed must only be ones
      you have met.
- [ ] **Click an NPC row and a location row** in Manage Campaigns — the card should open where
      you clicked, show your private notes, and Escape or a click away should close it.
- [ ] **The pencil should still edit** — clicking the name must not open the editor by accident.
- [ ] **As a player, open Campaign Links**: People and Places, both clickable, and no private
      notes anywhere in the card.
- [ ] **Write a journal entry naming a hidden place**, then check a player cannot see the entry
      at all. Reveal the place; it should appear.
- [ ] **Import a file with a campaign selected** — read the confirmation carefully and check
      the counts match what you expect before accepting.
- [ ] **Cancel that dialog** and confirm it imports as a new campaign instead.
- [ ] **A long NPC description** in the card should scroll rather than run off the screen.

---

## Campaign export / import

### Already proved live

A real round-trip against a scratch Postgres — 15 checks, plus 23 static. Four guards were
broken one at a time to confirm each check can fail.

- [x] **NPC description, public/private notes, visibility and location all survive** ✅.
- [x] **The Journal survives**, DM-only entries included, with its category, author, location
      and in-game day ✅.
- [x] **Day zero survives as zero**, not null ✅.
- [x] **Nothing points at another campaign after import** ✅ — asserted by a join, for NPC
      locations and journal locations and players.
- [x] **The hidden location's raw id appears nowhere in the bundle** ✅ — asserted by walking
      the whole JSON.
- [x] **A v5-shaped bundle lands every NPC hidden and no journal** ✅ — restoring an old
      backup must not publish anyone.
- [x] **Restored data is still governed by the visibility gate** ✅ — a player reading the
      imported campaign gets the hidden NPC not at all, and the visible one with no location.
- [x] **Importing the same bundle twice** produces two clean campaigns ✅.

### NPC name uniqueness — already proved live

- [x] **Two NPCs differing only in case cannot exist** ✅ — by bulk add (silently skipped), by
      rename (409), or by raw SQL (23505).
- [x] **An existing clash is renamed, not deleted** ✅ — seeded `GRATHUL` + `grathul` in a
      94-row campaign, restarted: still 94 rows, one became `grathul #96`, and the
      `character_relationships` row pointing at it survived.

### Wants your eyes in the browser

- [ ] **After upgrading**, check the NPCs tab for any name ending in ` #<number>` — that is a
      case clash the migration renamed, and it wants a human to pick the right name.
- [ ] **Export Leruhy, then import the file.** Open the new copy's NPCs tab: descriptions,
      notes and locations should all be there, and the hide/show state should match.
- [ ] **Check the Journal in the copy** — entries, categories, dates, and your DM-only ones.
- [ ] **Import one of your OLD backup files** (pre-v6). It should load without complaint, with
      NPCs as bare hidden names and an empty journal. Nothing should be published.
- [ ] **Open a restored journal entry that points at a hidden location** and confirm it still
      reads as hidden rather than naming the place.
- [ ] **A very large campaign**: the export has no size cap but the import is limited to 50 MB,
      so a big enough campaign can produce a file it cannot re-import. Worth knowing where
      Leruhy sits — check the downloaded file's size.

---

## NPC management

### Already proved live

Against a scratch Postgres — 37 checks. Each leak guard was then re-broken to confirm the
check fails: `SELECT n.*` on the player branch returns `private_info` outright.

- [x] **New NPCs start hidden** ✅, and a player sees none of them — not in the list, not in
      cross-links, not on the Campaign Links tab.
- [x] **Revealing one shows description + public info and NOTHING else** ✅ — the player's
      payload has no `private_info` key at all.
- [x] **An NPC in a hidden location** ✅ — the player gets neither the location name nor its
      id. Move them somewhere public and both appear.
- [x] **No player-reachable payload contains the secret** ✅ — swept `npcs`, `link-targets`
      and `links` for the private text and the hidden place name.
- [x] **A player cannot POST, PUT, PATCH or DELETE an NPC** ✅ (403 on all four).
- [x] **A location from another campaign is refused** ✅, and a duplicate name is a 409.
- [x] **Deleting a location leaves the NPC standing**, location cleared ✅.
- [x] **The DM search finds an NPC by name, description, public info and private note** ✅,
      and still refuses a player.

### Wants your eyes in the browser

- [ ] **The NPCs tab** — add a few by comma, then edit one and fill in all four fields.
- [ ] **The eye toggles without the tab flickering** (it patches one row rather than
      reloading the campaign).
- [ ] **Hidden NPCs look hidden** in the list — dimmed, with a closed eye.
- [ ] **The search box** appears once you have more than three, and matches private notes.
- [ ] **As a PLAYER**: an unrevealed NPC's `[[name]]` in a journal entry stays plain text;
      once revealed it becomes a link and the popover shows description and public info, with
      no sign of your private notes.
- [ ] **As a PLAYER**: the Campaign Links tab shows a People section with the revealed ones.
- [ ] **As the DM** on that same tab: you should see all of them, with the hidden ones marked.
- [ ] **Current location** — set it, check it shows in the list; point an NPC at a hidden
      location and confirm the player sees no location at all for them.
- [ ] **A long description** in the list should truncate rather than stretch the row.

---

## Campaign invite links

### Already proved live

Against a scratch Postgres — 52 checks, all passing. Each guard was also re-broken to confirm
the check could fail.

- [x] **A link creates the account, the seat and the character sheet** ✅, and logs them in.
- [x] **It works once** ✅ — the second use 404s and creates nothing.
- [x] **20 simultaneous redemptions produce exactly one account** ✅. With the conditional
      dropped, 19 of 20 got through — so the guard is doing the work, not the row lock.
- [x] **A fumbled attempt does not burn it** ✅ — short password, missing character name,
      taken username and wrong password all leave the invite live.
- [x] **`"role": "admin"` in the body is ignored** ✅ — the account comes out a player.
- [x] **Expired, revoked and forged links are all refused identically** ✅.
- [x] **A seat invite fills that seat** ✅, keeps the DM's name for it, and makes no new user.
- [x] **Another DM cannot mint, list or revoke invites for a campaign they do not own** ✅,
      and a player cannot mint one at all.
- [x] **You cannot join the same campaign twice** ✅.
- [x] **The raw token is never in the database** ✅ — only a sha256 of it.

### Wants your eyes in the browser

- [ ] **Create a link** in Players and check it lands on the clipboard, and that the box warns
      it cannot be shown again.
- [ ] **Open it in a private window** — you should see the campaign name before being asked
      for anything.
- [ ] **Join as a new player**, and confirm you land on the PC Sheet already logged in with
      your character on it.
- [ ] **Open the same link again** — it should say it is spent, with no form.
- [ ] **Invite into an existing empty seat** and check the seat selector only offers empty
      ones.
- [ ] **While logged in as someone else**, open a link: it should offer "join as <you>", and
      "use a different account" should actually honour the credentials you then type.
- [ ] **Revoke** an outstanding invite and confirm the link dies.
- [ ] **Let one expire** (or edit `expires_at`) and check the message reads sensibly.
- [ ] **Unassign a player**: on a row that has a user, pick "— None —" and Save. The User
      column should go to `—`. This was impossible before, so it is the one to check.
- [ ] **The Reassign select should open showing the current user**, not a blank.
- [ ] **Save should be greyed out** until you change the selection.
- [ ] **No DM accounts in either user dropdown** — the Add one or the Reassign one.
- [ ] **If any seat is currently assigned to a DM account**, that row should still show them,
      marked *(not a player)*, and saving without touching it should be impossible.
- [ ] **The Players tab header block** — "Create a character" and "Invite a player" should sit
      side by side in one bordered block with a divider, not stacked.
- [ ] **Narrow the window** — below the md breakpoint they should stack with a horizontal
      divider instead of a vertical one, and nothing should overflow sideways.
- [ ] **With a link showing and invites outstanding**, the right column gets taller than the
      left — check that looks deliberate rather than broken.
- [ ] **On a phone** — this is the one screen a player may well open on one.

---

## Printing the Journal and the Diary

### Already proved live

- [x] **The document is well-formed** ✅ — every tag balanced across groups, notes, markdown
      lists and blockquotes.

### Wants your eyes in the browser

The whole point of this one is how it looks on paper, so these need a real print preview.

- [ ] **As a PLAYER, print the Journal** from the PC Sheet tab, and **print your Diary** from
      the Diary tab. Both buttons should be there at all.
- [ ] **Search first, then print** — only the matching entries should be on the page, and the
      header should say what it was filtered by.
- [ ] **Change Group by, then print** — the printed headings should follow the selector.
- [ ] **Collapse a group, then print** — it should still print. (Deliberate; say if you want
      the opposite.)
- [ ] **Two columns** should look right, and a short note should not be torn across a column
      or a page.
- [ ] **A long note** will break across columns — check it still reads sensibly.
- [ ] **A heading should never be the last thing on a page.**
- [ ] **A diary with no categories** should print as a plain list, with no "Uncategorised"
      heading over everything.
- [ ] **Markdown**: bold, italics, a bullet list (bullets should actually appear) and a
      blockquote.
- [ ] **Nothing matching the search** — the page should say so rather than printing blank.
- [ ] **Block pop-ups** and press Print: you should get a message, not silence.
- [ ] **As the DM**, print the journal with a DM-only entry in it — it should be marked
      *DM only* on the paper, since the printout leaves the table.
- [ ] **The campaign Diary's own book button is unchanged** — it moved to shared plumbing, so
      check the title page, contents, drop caps and party annex all still come out.

---

## Campaign-wide search (DM only)

### Already proved live

- [x] **All nine sources return hits** ✅ — journal, campaign diary, player diary, locations,
      NPCs, character sheets and DM notes all matched a seeded row.
- [x] **Accent folding works both ways** ✅ — `thea` finds seven rows that all spell it *Théa*,
      and `théa` returns the same seven.
- [x] **Two terms in different fields of one row match** ✅ — `letter vault` finds the journal
      entry whose title holds one and whose body holds the other.
- [x] **A player gets 403, anonymous gets 401, a DM of another campaign gets 403** ✅, with no
      body in any case.
- [x] **A one-character query is refused** before any row is read ✅.
- [x] **DM-only, draft, hidden and private rows are labelled** in the results ✅ — this is the
      DM's own view, so they are shown *and* marked rather than withheld.

### Wants your eyes in the browser

- [ ] **The 🔍 Search tab** sits between Journal and Settings in Manage Campaigns, and the
      header has no search control left on any page.
- [ ] **Switching campaign in the sidebar** clears the box and the results — the previous
      campaign's hits must not sit under a new campaign's name.
- [ ] **A long result fills the tab** rather than stopping part-way down, and there is only one
      scrollbar on screen.
- [ ] **The columns** — check at one, two and three columns by narrowing the window, and that no
      group is split across a column boundary.
- [ ] **The result list reads well** with a real campaign behind it — Leruhy has far more rows
      than my seven-row fixture, so this is the first honest look at the grouping and the caps.
- [ ] **The marked match** is legible in all three themes, in the list *and* inside an opened
      result.
- [ ] **Highlighting inside an opened result** — this is the one piece with no automated
      coverage: the DOM walk needs a browser, and there is no jsdom in this project. The
      arithmetic under it has 17 tests; the walk itself has none. Check a long journal entry
      (markdown), an item (its abilities are HTML) and a DM note (plain text).
- [ ] **Search for a word that is also an HTML tag name** — `div`, `span`, `mark` — in an item's
      abilities. The word should be marked and the card should still render; if the tags were
      being rewritten instead, the formatting would collapse.
- [ ] **Search two words** and check both are marked, not just the first.
- [ ] **Clicking a hit opens it in the search**, not a new page. Check each of the nine kinds
      renders sensibly — especially an item (its abilities are HTML) and a character sheet
      (several fields, not one body).
- [ ] **Follow a `[[link]]` out of a journal entry** and come back with Back. Then do it twice
      and check the step counter reads sensibly.
- [ ] **Open in the module ↗** still goes somewhere useful.
- [ ] **Collapse a group, and Collapse all.** Then type a new query — the groups should come
      back expanded and you should be returned to the list, not left reading the old result.
- [ ] **With more than one campaign**, the selector appears and the choice is remembered.
- [ ] **On a phone** — the modal is `max-w-3xl` with a scrolling result area.
- [ ] **Search speed** on the real Leruhy database. Every row of nine tables is read per query;
      if it feels slow, the fix is a coarse SQL pre-filter for queries that contain no accented
      characters, which would cover most of them.

---

## Security: session fixation, the postMessage bridge, and one password floor

### Already proved live

- [x] **The session-fixation attack is dead** ✅ — and it was run against the OLD code first to
      watch it succeed. An attacker plants a session cookie, the victim logs in carrying it, the
      attacker replays it: before, `LOGGED IN AS dm1`; after, `anonymous`.
- [x] **The victim is still logged in** after the regeneration, with a different session id ✅.
- [x] **Remember-me survives** ✅ — the cookie still expires in 30.0 days, so setting `maxAge`
      *after* `regenerate()` (it resets the cookie to the store default) is the right order.
- [x] **The CSRF token rotates with the session** ✅.
- [x] **All three password routes enforce 8** ✅ — change-password, admin-creates-a-user and
      admin-resets-a-password. The last two accepted *any* non-empty string before, so a
      one-character password was reachable.
- [x] **An existing short password still logs in** ✅ — a user whose password is two characters
      was not locked out. The floor applies only when a password is set.

### Wants your eyes in the browser

- [ ] **Log in normally** and confirm nothing feels different — this is the change most likely to
      break the session silently, so use the app for a minute afterwards.
- [ ] **Tick Remember me**, log in, close the browser, reopen — you should still be logged in.
- [ ] **The Stats Sheet tab still loads and saves.** The postMessage bridge now names its origin
      on every send and ignores anything from elsewhere; if the handshake were wrong the sheet
      would sit empty or refuse to save.
- [ ] **Print the stat block** from that tab, which goes through the same bridge.
- [ ] **Change your own password** to something shorter than 8 — the form should refuse before
      it sends.
- [ ] **As admin, create a user** and **reset someone's password** with a short one; both should
      refuse. The create form now also has `minLength`, so the browser may stop you first.

### Not done, deliberately

- **Tailwind 4** — the five advisories are devDependencies with no patched release. `npm audit
  --omit=dev` reports **0**, so nothing reaches a browser. It is a migration to schedule, not a
  fix to apply, and it stays in `TODO.md`.
- **The `postcss-selector-parser` override** — still a deliberate semver violation, still
  working, still the first thing to drop if a Tailwind patch builds oddly. Unchanged.

---

## Share links need a login, and [[cross-links]]

### Already proved live

- [x] **All five share links**: 401 anonymous, 403 non-member, 200 member and DM ✅.
- [x] **A revoked map token still answers 404 to a member**, not 403 ✅ — gating before the token
      lookup would have sent people to log in for a link that no longer exists.
- [x] **`pc-public` no longer leaks the `campaign_id`** it fetches for the gate ✅.
- [x] **`next=` refuses** `//evil`, `http://evil`, `/\evil` and control characters ✅.
- [x] **A player's link index** omits a hidden location entirely and contains no NPCs ✅.
- [x] **The index never carries `image_data`** ✅ — 270 bytes for a campaign with a 4 KB pin image.
- [x] **A name never reaches an HTML attribute** ✅, including through display text.

### Wants your eyes in the browser

- [ ] **The whole login round trip**: open a map link logged out → "Log in to see this" → log in
      → land back on the map. Then the same for a timeline and the diary book.
- [ ] **Signed in as the wrong user** — should say it is not your campaign, not "not found".
- [ ] **Type `[[` in a journal entry.** The list should appear under the field, filter as you
      type, and accept ↑ ↓ Enter and Escape. Escape must close the list without closing the
      modal.
- [ ] **On a phone**, tapping a suggestion must insert it — the list uses `onPointerDown` for
      exactly this reason, and it is the part most likely to be wrong.
- [ ] **Pick a suggestion mid-sentence** and check the caret lands after the `]]`.
- [ ] **Click a finished link** in a saved entry: popover with the description, correctly placed
      near the edges of the window, Escape closes it.
- [ ] **As a player**, a `[[hidden location]]` the DM wrote should read as ordinary text —
      not gold, not clickable, not visibly broken.
- [ ] **The "Show on the map" button** appears only where it should.
- [ ] **The Diary is unchanged otherwise** — this touched `EntryList`, `EntryModal`,
      `GroupedEntries` and `Markdown`, which the whole module shares.

---

## Campaign Links tab, and the share link that kept dying

### Already proved live

- [x] **A second Share returns the same token** ✅ — and the old code was re-run first to watch it
      return a different one and 404 the first link.
- [x] **Revoking works, and the next Share mints a fresh token** ✅.
- [x] **A dead link says it is a dead link**, not "Map not found" ✅.
- [x] **An unshared map is invisible to players** ✅ — named nowhere in the response, not merely
      hidden in the UI.
- [x] **A non-member gets 403** on the links endpoint ✅.
- [x] **Every link handed to a player resolves 200** ✅ — one map, the campaign timeline, and one
      player timeline.

### Wants your eyes in the browser

- [ ] **The tab itself** — maps in a column, then timelines. Check it reads well with one map and
      with several.
- [ ] **A campaign with nothing shared** should show the "nothing yet" line, not an empty frame.
- [ ] **The links open in a new tab**, and middle-click / copy-link-address behave.
- [ ] **As a player**, confirm you can now reach the map that was 404ing. You may need to press
      Share once more in the Journey Map first — the token that broke is gone, and the new one
      is stable from here on.
- [ ] **As the DM**, confirm the tab shows the same list you expect, and that your unshared maps
      are absent.
- [ ] **On a phone.**

---

## Stat boxes that overwrite, and the floating temp-HP badge

All on screen, so none of it is proved — the tests cover the rules and where each control sits,
not how any of it looks or feels under a thumb.

- [ ] **The stats bar does not change height** when temporary HP appears and disappears. This is
      the whole point of the change; watch the row below it for any shift.
- [ ] **The blue badge sits beside the HP label** and does not collide with ✎ or ⟳, including
      with a three-digit value like `+120`.
- [ ] **Clicking the blue number** opens Manage HP.
- [ ] **Overwrite behaviour** on current HP, AC, Speed and each ability score: click in, the box
      empties and the old value shows in grey behind the cursor; type `8`, it becomes 8.
- [ ] **Click in and click away without typing** — the old value must come back. Try it on every
      one of the nine boxes; this is the risky one.
- [ ] **Type then delete back to empty, then click away** — AC and Speed should end up blank; an
      ability score should fall back to 10.
- [ ] **The ability modifier** should not flicker to `+0` while you clear the score on the way to
      a new one.
- [ ] **Current HP still clamps** to max + temp max when you leave the field.
- [ ] **On a phone** — this is where it should feel best. Tapping a stat and typing a number
      should need no selecting.
- [ ] **Printing** — grey hints should not appear on paper, and the blue temp number should.
- [ ] **The NPC Sheet standalone**, since it is the same component.

---

## HP on the stats bar (PC Sheet → Stats Sheet, and the NPC Sheet)

All of this is on screen, so none of it is proved — the tests cover the arithmetic and that each
control is where it should be, not how any of it looks.

- [ ] **Current HP is gone from ✎ Manage HP** and the dialog opens focused on Max HP.
- [ ] **Typing into current HP inline** still works, and leaving the field still clamps when it
      exceeds max + temp max.
- [ ] **Temporary HP** — set 8 in the dialog. A small blue `+8` should appear above the current
      number, the other six stats should stay on one line, and the HP label should move up
      rather than the number moving down.
- [ ] **Clear it** and the badge disappears with no layout left behind.
- [ ] **A negative temp max** still turns the right half green, and does *not* produce a blue
      badge.
- [ ] **⟳** — appears when wounded or carrying a temporary value, disappears on an untouched
      character and when Max HP is blank. Clicking it clears both temporary values and sets
      current to the base max.
- [ ] **⟳ with a temp max of +10** should heal to the base maximum, not to max + 10.
- [ ] **Printing the stats sheet** — the blue badge should still be legible on the parchment, and
      neither ✎ nor ⟳ should print.
- [ ] **On the NPC Sheet standalone**, since it is the same component.
- [ ] **On a phone**, where the stats bar is seven narrow columns.

---

## Search, group-by, and the duplicated campaign selector

### Already proved live

- [x] **A player with three characters in one campaign sees it once** ✅ — and the old SQL was
      re-run first to watch it return `[Leruhy, Leruhy, Leruhy]`, so the fix is confirmed against
      the actual failure rather than against my reading of it.
- [x] **A trashed campaign still disappears for the player** ✅ — the fix did not cost the trash
      filter.
- [x] **The DM's own campaign list is untouched** ✅ — different branch, not edited.

### Wants your eyes in the browser

- [ ] **The campaign selector** on the PC Sheet with a player who has two characters. One entry,
      and — if that is their only campaign — it should now auto-select and hide the selector
      entirely, which it did not before.
- [ ] **The same selector in the Diary, Journey Map and Timeline**, which read the same endpoint.
- [ ] **Search in the journal** — try a word that is only in a body, only in a category, only in a
      location, and only in an author's name. Then a two-word search where the words are in
      different fields.
- [ ] **Search without accents** — type `thea` for an entry mentioning Théa, and `buldamar` both
      ways.
- [ ] **A search matching nothing** says *Nothing matches "…"* rather than going blank.
- [ ] **The count** beside the box ("3 of 17") appears only while filtering.
- [ ] **Group by Location** and **Who wrote it** — alphabetical, with *Nowhere in particular* /
      *Unknown* at the bottom. Switching grouping should leave everything expanded.
- [ ] **Search plus grouping together** — group counts should reflect the filter.
- [ ] **Search in all four diary lists**: the campaign diary (DM), a player's diary seen by the DM
      (per-player tabs), your own diary in the Diary module, and the PC Sheet's Diary tab.
- [ ] **On a phone** — the search box and the group-by selector share a row and should wrap, not
      squash.

---

## Campaign Journal — now filed, dated and on the DM's side too

### Already proved live

- [x] **The category column reaches an existing database** ✅ — proved by dropping the column and
      restarting the app, not by reading the migration.
- [x] **Entries come back in in-game date order, ascending, undated last** ✅.
- [x] **A 200-character category stores as 120; a blank one stores NULL** ✅.
- [x] **Day zero is accepted** ✅ — the epoch is year 1 day 1, and the old `> 0` bound dropped it.
- [x] **Every 4.21.0 withholding rule still holds with categories in play** ✅ — DM-only filtered,
      hidden location blanked, player's `dm_only: true` stored false, DM's edit of a player's
      entry 403.
- [x] **The date arithmetic round-trips** ✅ — 16 cases including every Harptos festival, 29 Feb on
      a leap year, the year-1 epoch, and consecutive days staying consecutive across a festival.

### Wants your eyes in the browser

- [ ] **The cards read well** — it is the Diary's layout now. Check a long entry, and a card with
      no title.
- [ ] **Grouping and collapse** — make two categories, collapse one, add an entry to it. Check the
      unfiled pile sits at the bottom.
- [ ] **The date picker.** Pick Hammer 30, then switch to Midwinter: the day control should vanish.
      Switch to Alturiak: it should come back at 30. On a Gregorian campaign, pick 31 January then
      switch to February — it should clamp, and show 29 days in 2024 and 28 in 2025.
- [ ] **Clear date** removes the in-game date and the entry still saves.
- [ ] **The category datalist** offers what the campaign already uses, and still lets you type a
      new one.
- [ ] **The location dropdown is alphabetical** — and as a player, still only the public ones.
- [ ] **Manage Campaigns → 📖 Journal.** Same entries as the PC Sheet tab. DM-only ones outlined in
      gold. The ✎ button absent on entries you did not write; ✕ present on all of them.
- [ ] **Switching campaign in Manage Campaigns** reloads the journal rather than showing the
      previous campaign's.
- [ ] **The PC Sheet journal still works** after the refactor that moved it out of `usePcSheet` —
      specifically that switching campaign reloads it.
- [ ] **The Diary is unchanged** — this touched `EntryList` and `GroupedEntries`, which it shares.
      Check a player diary and the campaign diary still group, collapse, read and publish as
      before. One deliberate change: an **empty** diary now says so instead of showing a lone
      "Expand all", and an uncategorised entry no longer drags its heading to the top.
- [ ] **On a phone**, both tabs.

---

## Campaign Journal (new 📖 tab on the PC Sheet)

Server behaviour below was verified live against a scratch Postgres, reading the result back from
the database rather than from the response body. What is **not** yet verified is the tab itself in
a browser — the modal, the date picker, the Markdown rendering and how it looks on a phone.

### Already proved live (re-check if you want, but these are not guesses)

- [x] **A player's listing never contains a DM-only entry** ✅ — filtered in SQL with
      `AND j.dm_only = false`, and the column is not even selected for a player.
- [x] **A player cannot post a DM-only entry** ✅ — asking for `dm_only: true` stores `false`.
- [x] **Tagging a location the player cannot see is refused** ✅ — 400, rather than accepted and
      blanked, because accepting it would confirm the guessed id exists.
- [x] **Hiding a location afterwards blanks it for players** ✅ — both the name *and* the id go
      null on entries written while it was public; the DM still sees both; the entries survive.
- [x] **Only the author may edit** ✅ — another player 403, the DM 403, the author 200.
- [x] **The author or the DM may delete** ✅ — another player 403, the DM 200.
- [x] **A user outside the campaign gets 403** on GET, POST and DELETE ✅.
- [x] **Deleting a location keeps the notes written about it** ✅ — `SET NULL`, not `CASCADE`.
- [x] **An entry with neither a title nor a body is refused** ✅; an absurd `in_game_day` is
      dropped rather than stored.

### Still wants your eyes in the browser

- [ ] **The tab reads well** — who wrote it, where, the in-game date and the real date are all
      legible at a glance, and a long note does not blow the layout out.
- [ ] **The author line for the DM** — the DM has no character, so it shows the username alone.
      Check that reads sensibly at your table.
- [ ] **The Harptos date picker** on a Harptos campaign and on a Gregorian one.
- [ ] **Markdown in the body** — a list, a bold run, and a link.
- [ ] **The location dropdown as a player** — it must offer only public locations, and must not
      offer one the DM has since hidden.
- [ ] **Editing your own entry whose location has since been hidden** — the select will show
      nothing matching, and saving will clear the location. Decide whether that is what you want
      or whether it should hold the old value.
- [ ] **On a phone**, since the PC Sheet is the one surface scoped for mobile.

---

## Campaign export now carries the gear, and the library has multi-select

- [x] **The campaign bundle includes in-use item cards and inventory** ✅ — bundle version 5. The
      export had 13 tables and neither `inventory_items` nor `item_cards`, while the Danger Zone
      said *"delete it for good once you are sure. Export first if you want a copy."* and
      `campaign_id` is ON DELETE CASCADE. The documented safe path destroyed every granted magic
      item and the backup did not contain them.
- [x] **Cards are matched by name on import, never by id** ✅ — the key is
      **name + type + rarity**, case-insensitive. Missing cards are added, existing ones reused,
      and an existing card is **never overwritten**: importing someone's campaign cannot rewrite
      your version of an item.
- [x] **Chains are matched whole** ✅ — and this is the part that had to be got right. Every tier
      shares one name by design, so matching card-by-card would see three identical keys and link
      the row to whichever came back first — a one-in-three chance of the wrong sword. A chain
      matches only when the base tiers agree *and* the lengths match; anything else imports as a
      new chain.
- [x] **The export is chain-complete** ✅ — holding tier 2 drags tiers 1 and 3 with it. A lone
      tier would land as an orphan and the ▴/▾ buttons would never appear.
- [x] **Library multi-select** ✅ — a checkbox per card, All/None over whatever the filter is
      currently showing, and three actions: **＋ To print set**, **🖼 Download PNGs**, and
      **Export JSON**.
- [x] **Batch PNG download as a ZIP** ✅ — every ticked card rendered and zipped into one file.
      One card at a time through a hidden host fixed at `CARD_WIDTH`, so each image is the same
      591px (5cm at 300dpi) as the per-card Download PNG. JSZip is imported lazily and lands in
      its own 30KB-gzipped chunk, so nobody who never presses the button fetches it — the
      ItemCards chunk went 31.4KB → 33.0KB. Shows a live count and can be cancelled.
- [x] **PNG filenames disambiguate chain tiers** ✅ — three cards named "Tidecaller" would give
      one filename three times and a ZIP keeps the last. They come out as `tidecaller.png`,
      `tidecaller-2.png`, `tidecaller-3.png`, with a counter fallback so a name can never repeat.
- [x] **Export JSON kept alongside** ✅ — the chain-complete bundle of a selection. Say if you
      would rather the button was only PNGs.

Verified live with two separate DM accounts and your real 69-card library: exporting a campaign
holding a middle tier produced 4 cards (the standalone plus the whole 3-tier chain) with **no raw
ids**; importing into an empty library added 4 and rebuilt the chain, with the inventory pointing
at **the middle tier**, not the base; importing back into the owning library added **0** and
matched **4**, leaving it at 69 with both campaigns legitimately sharing one card.

**A real bug was found by running it, and it would not have shown up any other way.** Catching
the duplicate-key error inside the import's transaction without a `SAVEPOINT` poisoned the whole
transaction — Postgres aborts everything after a failed statement and turns `COMMIT` into a
rollback — so the import discarded the entire campaign while answering `success: true,
campaign_id: 4`. There was no campaign 4. Fixed with a savepoint around each row, and
`test/campaignGear.test.js` guards it; the first version of that guard passed with the savepoint
deleted, because `/SAVEPOINT inv_row/` also matches the `ROLLBACK TO SAVEPOINT` line, so it was
tightened to match the creation statement and re-verified by deleting it again.

**The savepoint fix was re-checked**, and more usefully than re-running one test: every
`BEGIN…COMMIT` region in `app.js` was audited. Eight transactions, exactly one contains a
`catch`, and it is the one with the savepoints — so the bug is not lurking anywhere else.
`test/transactions.test.js` now enforces that for the whole file rather than for one route, and
the live round-trip was repeated reading from **psql** rather than the response body, because the
response body is the thing that lied: the campaign row is present, both players landed, the
duplicate was skipped and named, and the library stayed at 69.

**Worth QA'ing**: that All/None respects an active search (it selects what you can see, not the
whole library); that a selection survives typing in the search box; that the print set receives
the cards in a usable order; a full round-trip of a real campaign — export, delete, import —
checking that attunement and equipped flags come back; and **a ZIP of a whole chain**, confirming
the three same-named tiers arrived as three distinct images matching the per-card download.

---

## Print: smaller font floor, and a promise the code never kept

- [x] **The font floor is 6px instead of 8px** ✅ — about 73% more room on a face. Measured
      against your 69 cards, that takes the number clipped from **30 to 4**.
- [x] **The fit loop now actually tests the floor** ✅ — it ran `f > minFontPx`, so it stopped one
      step above and returned the minimum *untested*. A face that fitted exactly at the smallest
      size was indistinguishable from one that overflowed it.
- [x] **Three places that promised continuation cards no longer do** ✅ — `constants.js` said
      content "flows across one or more of these fixed-size cards (Front → Back → Continuation)",
      and the print help text said "plus Continuation cards if the text overflows". **That logic
      was never written.** Anything past the floor is clipped by `overflow: hidden`, silently. The
      copy now says so, and the README's 8px figure is updated.

**Four cards are still clipped** — Crown of the Final Silence, Twin Swords, Spear of the Resonant
Soul and Boots of the Veiled Passage, each about 1.0–1.2× over. Real continuation cards are the
only fix that neither truncates nor shrinks past legibility; it is in `TODO.md`.

**Worth QA'ing**: print one of those four and confirm you can live with the tail being cut, and
print a mid-length card at 6px to judge whether that size is usable at the table at all — 6px is
roughly 1.5mm, which is a real legibility question rather than a settled one.

---

## The print set no longer outlives its sitting

- [x] **The print set is cleared when you close the tab** ✅ — moved from `localStorage` to
      `sessionStorage`. It still survives a reload and moving between pages mid-batch, which the
      "rescue it into your library" offer depends on, but a set assembled weeks ago or by a
      logged-out visitor no longer sits there looking like something you queued today.
- [x] **The stale set is removed once** ✅ — whatever is currently in `localStorage` is deleted on
      the next load rather than carried across, since by definition it is from a previous sitting.
      If you had a batch part-assembled, it is gone; the Clear set button existed for that anyway.

Copy updated to match in three places (the rescue offer, the not-signed-in note, the empty-state
hint) plus `docs/item-cards/README.md` — the old text promised it "survives a reload, but not a
cleared browser", which is no longer what happens.

Confirmed in the built bundle: the only `localStorage` calls left are the one-time cleanup and the
flag remembering that the rescue offer was answered. That flag stays permanent deliberately — a
dismissal should not be re-asked every session.

---

## Live preview card fills the panel

- [x] **The preview card is wider, at the original letter size** ✅ — it was drawn at true card
      size (63mm, ~238px), which is faithful to the print but tiny in a half-width panel. It now
      fills the panel up to `34rem`, with the **type unchanged**: the card gets wider, not
      louder, so the same text simply takes fewer lines.

The cap is a readability limit rather than an arbitrary number — at 14px, 34rem is roughly 70
characters a line, about the most that still scans. Say if you want it wider still.

**The PNG is unchanged, and now provably independent of the preview.** Line breaks follow the
layout width, so capturing a panel-wide card would have produced a differently-set image.
`handleDownload` pins the element back to 63mm for the duration of the capture and restores it in
a `finally`, so a failure cannot leave the preview stuck at card size. There is a brief flicker
while it captures; that is the trade for the PNG being exactly what it was.

Every length inside the card is an `em` now, verified to resolve to the original pixel sizes at
14px (32/13/12/8/6/4/2/1px all exact), so the card scales as a unit if the base ever changes.

`ItemCardPrint.jsx` is untouched; the print sheet still needs its own text reduction.

**Worth QA'ing**: download a PNG and compare it against one from before — it should be
indistinguishable. And check the flicker during capture is not objectionable.

---

## Item Cards library: grouping, collapsing, and deleting what is in play

- [x] **Deleting a card removes it from inventories too** ✅ — but only as a second step. The
      first attempt still refuses and tells you *who* is holding it; the confirmation then names
      them and says it will be taken off them. The refusal was deliberate (RESTRICT over CASCADE
      so a DM finds out rather than a player silently losing a magic item) and it still is —
      forcing is the informed choice, not a way around it.
- [x] **Clear the whole library** ✅ — a Clear button beside Export/Import. Same two-step shape:
      refuses while anything is in play, names the holders, then clears in one transaction.
- [x] **Grouped by rarity, sorted by name** ✅ — groups in rarity order (common → artifact), not
      the order the data happened to arrive in, with the rarity's own colour on the heading and a
      card count.
- [x] **Groups collapse** ✅ — click a rarity heading. While a search or filter is active the
      groups force open, because a search that found matches should show them rather than a
      column of closed headings.
- [x] **Tiered items are collapsed by default** ✅ — a chain shows as one row reading "3 tiers"
      with a ▸ to expand. 69 cards read as 51 items.
- [x] **Search box bigger, rarity filter smaller** ✅ — the box takes the room; the select only
      ever shows one of six fixed words. The first attempt did not work, and the reason is worth
      knowing: the shared `INPUT_CLS` begins with `w-full`, and appending `w-24` to it cannot
      win — Tailwind emits `.w-full` *after* the numeric widths, specificity is equal, so the
      later rule applies whatever order the class names are written in. With `flex-none` on top
      of that, the select was pinned to the full row and refused to shrink, squeezing the input
      to a square. The field style is now split: `FIELD_CLS` carries no width, `INPUT_CLS` is
      `w-full` plus it, and only the search row uses the former.

Verified live against a scratch database, with your real 69-card bundle imported: deleting a
held card refused with `Iris (Leruhy)` named, then with `?force=true` deleted the card, emptied
her inventory **and healed the chain** (tier 2 became the new base); clearing refused with all 69
still present, then with force deleted all 69 and emptied the inventory.

**Worth QA'ing**: that searching for a name only a *later* tier has still finds the item — the
filter matches any tier but shows the base row, which is the one case where the grouping could
surprise you. Also the Clear button when the library is empty (it disables), and that collapsing
a group does not lose your place when you then open a card for editing.

---

## Evolving items, and library search

- [x] **An item card can evolve from another** ✅ — a chain of tiers. Which tier a character
      holds is which card their inventory row points at, so there is no tier column anywhere.
- [x] **Bump, downgrade and reset** ✅ — ▴ and ▾ on a granted row, DM-only, and only for an item
      that actually has a chain. The route takes a target rather than a direction, so reversing
      is the same call. Nothing resets on transfer; that is yours to do.
- [x] **Players are told nothing** ✅ — not the tier, not the chain, not that another tier
      exists. Enforced in the query, not the UI.
- [x] **Library search** ✅ — name/type search plus a rarity filter, appearing once you have more
      than five cards. Chains are grouped under their base and indented, with `2/3` showing the
      tier position. That badge is the only place a tier number appears anywhere in the app.

Verified live against a scratch database: the migration lands on an **existing** database with
existing rows — I dropped the column and restarted to prove the `ALTER` is doing the work rather
than the `CREATE TABLE`, which is the shape of the bug this repo already had once. Then: tier 1
granted, bumped to 2 and 3, dropped back to 2, reset to 1, with the **row id unchanged
throughout**, so the item kept its identity and transfer trail. A self-link, a loop and a parent
in another user's library were all refused; shortening a chain was allowed, because it is not a
loop. A card from outside the chain could not be swapped in. Deleting the middle tier re-pointed
tier 3 at tier 1 rather than orphaning it. The export bundle carries positions rather than ids,
reimported into a different library with entirely new ids and rebuilt correctly, and a
hand-edited bundle claiming a raw `evolves_from` was ignored.

**The spoiler check, in full**, since it is the requirement you set: logged in as the player, the
entire inventory payload for their granted item contained no occurrence of *evolves*, *chain* or
*tier*, and `PUT …/card` returned 403.

**Both bugs you found are fixed.** The tier buttons threw `actions.setItemCard is not a function`
because the PC sheet forwards actions to its tabs through two hand-written lists and I had
updated neither — the same omission class as the three form fields above, and now covered by
`PcSheet/actionsBag.test.js`, which compares the lists and names anything that does not make it
through. And the **Evolves from** picker rendered only when it had something to offer, so it
disappeared right after you saved your first card; it now always shows, disabled with an
explanation when the library is empty.

- [x] **Picking an "Evolves from" copies that card into the form** ✅ — a later tier starts as the
      earlier one, ready to edit. It will not do this over a saved card you have open, and on a
      new card with anything typed it asks first; declining links them without copying.

**Worth QA'ing**, none of it rendered in a browser yet:
- The **Evolves from** picker with two tiers deliberately sharing a name — this is the case that
  would have broken had I reused `SrdCombobox`, so it is the one worth trying.
- The ▴/▾ controls at both ends of a chain (disabled at base and at the last tier), and that an
  ordinary non-evolving magic item shows no new buttons at all.
- That the library search box only appears past five cards, and that chain indenting still reads
  correctly while a filter is active — filtering happens after grouping, so a search matching
  only tier 2 still shows it in its chain's position rather than reordering the list.
- Changing an item's **type** on a tier-2 card and confirming it is still linked afterwards.
- The copy behaviour three ways: on an **empty** new card (copies silently), on a new card where
  you have **typed something** (asks, and declining still links), and while **editing a saved
  card** (only links, never overwrites what is open).

---

## SRD descriptions, and the card popping up in the corner

- [x] **SRD items keep their description** ✅ — the mapper read `desc`; the 2024 API sends
      `description`. Only the cost was surviving, which is why a Potion of Healing showed its
      price and nothing else. Verified against the live API, not only fixtures.
- [x] **Weapons and armour show their stats** ✅ — their SRD `description` is empty by design;
      the information is in `damage`, `properties`, `mastery` and `armor_class`, all of which
      were being thrown away. A longsword now reads its damage, reach, versatile die and
      mastery; half-plate reads its AC, Dex cap, stealth penalty and don/doff times.
- [x] **The item card opens beside the pointer** ✅ — it was hardcoded to the bottom-right
      corner. It now flips rather than slides near an edge, so it never covers the row it is
      describing. Tapping still centres it, which is right for touch.

**You need to re-add four items**, or say the word and I will backfill them. The fix only
applies to items added from now on — the four free-text rows you already have were imported by
the broken mapper and still carry only their cost: **Alchemist's Fire, Gem, Half-Plate Armor,
Potion of Healing**. None of them has hand-written notes, so a backfill would overwrite nothing,
but it is your data and re-adding four items is about as fast.

**Worth QA'ing**: the popover near the right and bottom edges of the window, and in a scrolled
panel; and whether "Gem" even resolves against the SRD — it is a generic name and may simply
not be an SRD entry, in which case it will keep the notes it has.

One thing I did not change: **Antitoxin lands in Inventory, not Potions & Poisons.** The panel
is chosen by matching "potion" or "poison" in the name, and "Antitoxin" contains neither. I
could extend the word list, but any list I write is a guess at which dozen items you care
about — dragging it across is the designed path, and that now works. Say if you would rather
have the list.

---

## Security: the last three findings

The three that had sat in `TODO.md` under *noted, not fixed*. All three are **verified live**
against a scratch database and a running server, not only by tests — a text test cannot prove a
middleware actually refuses anything.

- [x] **`PUT /api/pc/:playerId/stats` no longer takes arbitrary JSON** ✅ — a `validateStats`
      whitelist, applied at **all three** sites that write that column. The two import routes
      took the same blob from an uploaded file, so hardening only the PUT would have left the
      back door open.
- [x] **Login is throttled** ✅ — 10 failures per 15 minutes, keyed on IP *and* username
      together, 429 with `Retry-After`. Cleared by a correct password. Hand-rolled: it is one
      route, and the alternative wanted `trust proxy`, which this deployment should not set.
- [x] **CSRF tokens on every mutating route** ✅ — a synchroniser token in the session, no new
      dependency, **no route exempt** (login and logout included). One header on the single
      `fetch` in `api/client.js` covers all 81 mutating call sites.

Two fixes that came with them, in the same code:

- [x] **A user-enumeration timing oracle on login** ✅ — an unknown username returned before
      doing any bcrypt work while a real one paid a full round. Identical wording, different
      clock. Measured after the fix: 53.3 ms vs 54.2 ms, 1.02×.
- [x] **An empty stats body used to 500** ✅ — `JSON.stringify(undefined)` is `undefined`, which
      hit a `NOT NULL` column and surfaced as a raw Postgres error. Now a clean `{}`.

Verified live: a forged write refused and **nothing written to the database** while the same
write with a token succeeded; login refused without a token, so login-CSRF is covered too; a
tampered, a too-short and another session's token all refused, the short one without the 500
`timingSafeEqual` throws on a length mismatch; the token rotating on login and the old one
going dead; the 11th bad login 429ing with `Retry-After: 900` while a *different* username from
the same IP stayed free; a correct password clearing the window; and a 35-key sheet carrying
`cr: "1/2"`, `hp: "10 (3d6)"` and four deliberately-empty strings coming back **byte-identical**,
while a hostile 209 KB payload was stored as 21 KB with every unknown key gone.

**Worth QA'ing specifically**, because none of it has been through a browser: that saving a
character sheet, saving stats from the embedded NPC sheet, uploading a portrait, and importing a
campaign bundle all still work; and that **restarting the server mid-session is invisible** —
sessions live in memory, so every restart invalidates the token the browser holds, and the
client is supposed to fetch a new one and replay the write rather than lose your edit. That
replay is the one path most likely to misbehave in real use.

A caveat worth keeping in view: the cookie was already `SameSite=Lax`, which blocks cross-site
writes in any current browser. CSRF here is a second layer for same-site subdomain attackers and
old clients — worth having, but `TODO.md` overstated it as an open door.

---

## Inventory: coins, drag, card previews, alignment

- [x] **Item cards can have a weight** ✅ — the column existed since I added it; the input did
      not, so it was unsettable. Beside Rarity now.
- [x] **Coin purse in Treasure** ✅ — PP/GP/SP/CP on the character, saved on blur, weighed at the
      5e rate of 50 coins to the pound and counted in the carry total.
- [x] **Consumables are not equippable** ✅ — enforced server-side against the *new* category, so
      dragging an equipped item into Potions unequips it.
- [x] **Drag ⠿ between panels** ✅ — Pointer Events, so it works with a finger. The edit dialog's
      Panel selector remains as the non-drag path.
- [x] **Granted items show their card** ✅ — hover on desktop, tap the ◆ on touch. Reuses
      `ItemCardPreview`, so it matches the printable card.
- [x] **# and lb columns aligned** ✅ — header and rows share one grid template; figures moved
      from 0.7rem to text-sm.

Verified live: card weight round-trip, a negative coin value clamped to 0, a potion requested as
equipped coming back unequipped, an equipped sword unequipping on the move into Potions.

**Worth QA'ing specifically** (none of it rendered): the drag ghost and the gold drop-target
outline; the card popover position when a panel is scrolled; the coin fields saving on blur; and
the column alignment at the width in your screenshot.

### Follow-up: alignment and the missing previews

- [x] **Columns genuinely aligned** ✅ — the first attempt could not have worked: the grid's last
      track was `auto`, and a header and a row are separate grid containers, so it sized to each
      one's own buttons (one in the header, two to four in a row). All tracks are fixed now
      except the name, shared via one constant. Confirmed the arbitrary Tailwind value reached
      the built CSS, which is the other way this silently fails.
- [x] **Sizes increased** ✅ — figures to `text-sm`, names to `text-base`, headers and notes up.
- [x] **Every item opens** ✅ — two separate causes for "I see no cards": the ◆ in the Equipped
      strip was an inert `<span>` (and that strip is where granted items are most visible), and
      rows without a card had no marker at all, so SRD descriptions were unreadable. Now ◆ opens
      the card, ⓘ opens a details panel, and the Equipped names are buttons too.
- [x] **Coin row wraps** ✅ — it was clipping its first label against the panel edge.

---

## Attunement rules

- [x] **Equipping attunes, unequipping un-attunes** ✅ — for items that require it. A torch does
      not become attuned by being held.
- [x] **The manual badge still works as an override** ✅ — the automatic rule fires only on an
      *equipped* transition, so a hand-set attunement is not undone by the next unrelated save.
      This is the one subtle bit; without it the two requirements cancel each other out.
- [x] **The 3-item limit is enforced server-side** ✅ — in both writers, with a 409 the UI
      surfaces as a toast. Only checked when a write would *newly* attune, so un-attuning at the
      cap and re-saving an already-attuned item both still work.
- [x] **The limit is about attunement, not wearing things** ✅ — at three attuned you can still
      equip a sword or a torch.
- [x] **Granted items inherit the requirement from their card** ✅ — enforced even though the
      row's own flag is false.
- [x] **Inventory errors now toast** ✅ — they were unhandled promise rejections, visible only in
      the console. Worth QA'ing: try to equip a fourth attunable item and confirm you get a
      readable message rather than silence.

Verified live across all eight branches. **Not verified**: the disabled checkbox and its tooltip
in a browser.

---

## Inventory fixes and attunement

- [x] **Equip no longer fails** ✅ — `weight = CASE WHEN … THEN NULL ELSE $7 END` left `$7`
      untyped, so Postgres inferred `text` and rejected the assignment on every edit. Now
      `$7::numeric`, with a test pinning the cast.
- [x] **Carry weight counts everything** ✅ — it always did; the weight edits were simply being
      rejected by the bug above. The header now names unweighed items explicitly rather than
      leaving the shortfall unexplained. Verified at 75.5 lb across three items, one equipped.
- [x] **Maximum is read-only** ✅ — STR × 15, no override. Route, API method and dialog removed;
      the leftover column is documented as unused.
- [x] **Attunement** ✅ — amber badge → green when attuned, counted against the 5e limit of three.
      `requires_attunement` (the item) and `attuned` (this character) are separate columns, and a
      granted item inherits the requirement from its card.
- [x] **Edit payloads built from the row** ✅ — the equip toggle sent a partial body against a
      route that replaces every column, so adding attunement would have made equipping
      un-attune. Latent before this change; would have bitten immediately after.
- [x] **Tab order** ✅ — Character · Public · Private · Relationships · Diary · DM Notes · Stats
      Sheet · Inventory.

---

## Touch support and the two overflowing layouts

**This is the batch that most needs your device, not your desk.** I cannot verify a single
gesture: there is no browser here, and jsdom implements neither PointerEvent properly nor
`setPointerCapture` at all. Everything below is reasoned, linted, built and guarded by static
tests — none of it has been touched by a finger.

- [x] **Pointer Events across all five interaction systems** ✅ — the map stage (and through its
      shared `interaction` contract, both journey-map pages), the JourneyMap editor's seven drag
      kinds, the Timeline event drag, the relationship graph and the character tree.
      `setPointerCapture` replaces the old `onMouseLeave={onMouseUp}` trick, which **cancelled** a
      drag that wandered off the element — and in the editor a cancel also wrote the half-finished
      drag to the database.
- [x] **`pointercancel` everywhere a release persists** ✅ — the riskiest part. Touch gets
      cancelled by the OS constantly; without a cancel path a drag ref stayed non-null and the
      next finger-move would teleport a pin and save it. Cancel clears every ref **without**
      saving. A test asserts all seven refs are cleared and that none of the three save calls
      appears in the cancel path.
- [x] **Pinch-to-zoom** ✅ — one shared helper for the three surfaces that previously had three
      hand-rolled wheel ratchets with three different constants. The maths is pure and unit
      tested, including the two ways it used to be able to destroy the view: a near-zero previous
      distance producing `Infinity`, and an unclamped jittery frame.
- [x] **`touch-action: none`** ✅ — on the stage, the graph and the canvas. On Timeline it is
      narrow, on `.ev-g` only: putting it on the scrolling container would have killed scrolling.
      A test checks `.tl-body` specifically does *not* have it.
- [x] **The four focus-preservation handlers** ✅ — `SrdCombobox`, `SrdInfo`, `TagInput`,
      `RichTextEditor`. These were never drags, but they were a **live touch bug**: `mousedown` is
      a compatibility event fired *after* `touchend`, so blur had already committed the typed text
      and tapping a suggestion kept the wrong value.
- [x] **Hover-only affordances given a touch path** ✅ — journey-map pin labels (every pin except
      big/huge was unlabelled on a tablet) and the Timeline tooltip, via a new `useCoarsePointer()`
      hook. That hook is the app's first input-modality seam; there was no `matchMedia` anywhere.
- [x] **Hit targets enlarged on coarse pointers** ✅ — transparent circles behind the 8×8 bend
      handles, r=5 region vertices and r=6 waypoints. Visuals unchanged.
- [x] **A Finish button for draw/region** ✅ — completing a path was `Enter` or double-click only,
      and a tablet has neither a keyboard nor a reliable double-tap.
- [x] **↑/↓ reordering in the Timeline sidebar** ✅ — it used HTML5 drag-and-drop, which does not
      work on iOS Safari or Android Chrome at all and which Pointer Events cannot fix.
- [x] **Timeline's `100vh` removed** ✅ — a leftover from the standalone legacy page. On a phone
      `100vh` is the *large* viewport, so the bottom sat under the address bar and jumped.

### Layout

- [x] **JourneyMap** ✅ — the fixed `248px 1fr 272px` (520px of chrome before the map got a pixel)
      becomes one column below `lg`, with both panels as overlay drawers behind 🧰/ℹ️ toggles.
      Overlays rather than inline, deliberately: an inline panel resizes the stage, which now
      triggers a re-fit and would move the map under your finger.
- [x] **`fit()` now re-runs on resize** ✅ — a `ResizeObserver` in `useMapViewport`. This was a
      **pre-existing bug**, not just a blocker for the drawers: rotating a tablet already left the
      map at the old scale, parked off-centre.
- [x] **ManageCampaigns** ✅ — master/detail below `lg`, reusing the existing "Select or create a
      campaign" empty state. A `‹ All` back button appears only below `lg`, and `loadCampaign`
      gained a null guard (it would otherwise have fired five requests with a null id).
- [x] **JourneyMapPublic** ✅ — stacks map-over-details below `lg`, with the panel capped at 40vh.

### PC Character Sheet on mobile *(your added priority)*

- [x] **Single-option selectors hidden for players** ✅ — a player with one character saw two
      selectors that could not do anything, wrapping onto their own line. This required adding
      campaign auto-select to the hook: only the *player* was auto-selected before, so hiding the
      campaign selector alone would have stranded them on an empty page.
- [x] **Form grids single-column below `sm`** ✅ — the inventory add/edit dialog and the
      relationship modal.
- [x] **The stats toolbar wraps** ✅, and the relationship graph's minimum height drops from 360px
      to 240px so it does not eat a phone screen.

**What to try first, on the tablet:** pan and pinch the journey map; drag a pin and a region
vertex; draw a route and finish it with the new button; drag a timeline event and confirm the
page does not scroll instead; tap a pin and a timeline event for their labels; rotate the device
and confirm the map re-fits; and open the PC Sheet as a player.

---

## PC Inventory

Built on top of the item-card library. The rules came from your own note — *"reusable on any
Campaign, but only once per Campaign"*, plus consumables deliberately kept out of cards — and
they are enforced in the **database**, not just the handlers, so no code path can quietly break
them.

- [x] **Two kinds of row, distinguished by CHECK constraints** ✅ — *granted* (an item card the DM
      assigned: unique per campaign, always quantity 1) and *carried gear* (free-text, the only
      kind with a quantity). A row must be one or the other; the schema makes anything else
      unrepresentable.
- [x] **"Only once per campaign"** ✅ — a **partial** unique index on `(campaign_id,
      item_card_id) WHERE item_card_id IS NOT NULL`. Partial so two players can both carry rope.
      The duplicate surfaces as a 409 from the constraint rather than a pre-check, so no race can
      slip a second copy past it.
- [x] **Authority split** ✅ — only the DM grants a card, and only the DM removes one. A player
      manages their own gear freely and can equip or annotate anything. A player editing a
      granted item's name or quantity is accepted but ignored: the name belongs to the card.
- [x] **Giving** ✅ — holder hands an item to another character **in the same campaign**, no
      approval step. It arrives unequipped and the row keeps `prev_player_id` and
      `transferred_at` so the DM can see what moved. Cross-campaign transfers are refused —
      that would be a way around the one-per-campaign rule.
- [x] **Deleting a card that is in play is refused** ✅ — `ON DELETE RESTRICT`, surfaced as a 409
      naming the characters holding it ("held by Bob (C1), Xavier (C2)"). The alternative was a
      player's magic item vanishing because the DM tidied their library.
- [x] **No widening of item-card access** ✅ — the card's fields are joined into the inventory
      response, so a player sees what they hold without gaining any route into the DM's library.
      `/api/item-cards` stays strictly owner-scoped, and a test asserts `ownsItemCard` never
      grew an inventory escape hatch.

Verified live with two campaigns, three characters and one card: granting twice in a campaign
→ **409**, the same card into a second campaign → **200**; a player granting themselves → 403,
deleting a granted item → 403, renaming one → silently ignored; give across campaigns → 400, to
self → 400, within the campaign → 200 with the trail recorded; another player reading or writing
the inventory → 403; and the two CHECK constraints rejecting bad rows at the database directly.

### Fixed: schema migration gap

- [x] **`category` and `weight` now reach existing databases** ✅ — they were in the
      `CREATE TABLE` only, which is a no-op once the table exists, so adding an item failed with
      `column "category" ... does not exist`. Now proper `ALTER TABLE … ADD COLUMN IF NOT EXISTS`
      migrations, with all four CHECK constraints moved to the same named idempotent path so a
      fresh install and an upgraded one cannot diverge.
      Verified by **upgrading** a seeded old-shape database rather than creating a fresh one —
      the fresh-database runs used everywhere else in this file are structurally blind to this
      class of bug. Both paths now produce byte-identical columns, constraints and indexes.

### Equipment-sheet layout (second pass)

Rebuilt after the printed equipment sheet you sent. Worth QA'ing as a whole page rather than
feature by feature — the point of it is the layout.

- [x] **The tab sits beside Stats Sheet** ✅ — Character · Stats · **Inventory** · Relationships · …
- [x] **Four panels** ✅ — Treasure, Potions & Poisons, Inventory, Miscellaneous, each with the
      sheet's `#` and weight columns and its own subtotal. A `category` column, deliberately
      **orthogonal** to granted-vs-free-text: a granted potion is still granted (◆, DM-removable
      only) but sits under Potions. Provenance is now a marker, not a grouping.
- [x] **Carry weight** ✅ — per-item `weight` (NUMERIC, so a vial is 0.5 lb not 1), totalled as
      `weight × quantity`. Maximum defaults to **STR × 15** read from the Stats Sheet, with a
      manual override on its own route and a one-click revert. Over capacity turns red. Unweighed
      items are counted and reported separately rather than treated as weightless.
- [x] **Weight is single-sourced** ✅ — a card-linked row stores NULL and uses the card's weight,
      enforced in the UPDATE, so the two can never drift apart.
- [x] **SRD lookup for carried gear** ✅ — the ＋ Add dialog searches the published equipment
      list (182 entries) and fills name, weight and a cost/description line. A new
      `equipmentToItem` mapper rather than a reuse of `magicItemToCard`, which targets a card.
- [x] **Equipped strip** ✅ — the printed sheet's named slots (Head, Back, Neck, …) are
      deliberately **not** modelled, per your call: equipping stays a flag and the strip lists
      what is worn rather than pinning items to slots.

Verified live: four panels populated, totals exact (2×10 + 3×0.5 + 120×0.02 + 65 = **88.9 lb**),
granted row taking its weight from the card, capacity override set and cleared, and the SRD
`equipment` endpoint confirmed to return weight and cost. The mapper has its own test suite
pinned against real API payloads.

**Not covered**: none of this has been rendered in a browser. The four panels, the carry-weight
header, the grant picker, the SRD combobox in the add dialog and the give dialog are all unseen.

**Known gap**: the sheet's centre trackers (Bedroll, Water, Feet of Rope, Rations) were skipped
by your call — those go in Carried gear like anything else.

---

## Item Cards — server-side storage

The module was the only one in the app that never persisted. Worth QA'ing in a browser both
signed in **and** signed out, since the two paths are deliberately different.

- [x] **Saved library for signed-in users** ✅ — `item_cards`, scoped to a user rather than a
      campaign. Six routes, all `requireAuth` and all filtered by `user_id`, with an
      `ownsItemCard` helper so the route-table walk in `test/campaignAuth.test.js` covers them.
- [x] **Cards can be reopened and edited** ✅ — the real gain. The old print set held read-only
      snapshots: a card in it could be deleted but never changed. Clicking a library entry loads
      it back into the form; **Update** overwrites, **Save as new** forks, **New card** clears.
- [x] **The module is still public** ✅ — no login, no route guard, no change for a guest. The
      build/print/PNG path works exactly as before on localStorage. QA this specifically in a
      private window: there should be no 401s in the console.
- [x] **Export / import** ✅ — `item-cards-<you>-<date>.json` via the shared `downloadBundle`.
      Import **adds** rather than replaces, is transactional, caps at 500 cards, and rejects a
      bundle whose `type` is not `item-cards` before writing anything.
- [x] **One-time migration offer** ✅ — a signed-in user with cards in their browser's print set
      is offered once to move them into their library. Dismissal is remembered.
- [x] **`abilities` sanitised on write** ✅ — it is contenteditable HTML rendered with
      `dangerouslySetInnerHTML`. Harmless while it lived in your own localStorage; with an import
      route it becomes someone else's markup in your page. Allowlist is exactly what the toolbar
      produces. Adds `sanitize-html` as the sixth runtime dependency.
- [x] **The inventory blocker is cleared** ✅ — cards have ids now, so the PC Sheet inventory
      items can reference them.

Verified live: XSS payload stored clean with formatting intact, all twelve fields round-tripped,
second user got an empty library and 403 on PUT/DELETE, a `user_id` planted in the body was
ignored, invalid rarity coerced rather than violating the CHECK, export→import into another
account re-sanitised on the way in.

**Not covered by any of that**: the UI itself. The library panel, the Save/Update/Save-as-new
buttons, the migration banner and the guest notice have never been rendered in a browser.

---

## Authorization

The big one. Worth QA'ing by using the app normally as a DM and confirming nothing you expect
to work has started refusing — the automated cross-DM probe already proves the *denials*.

- [x] **Every campaign-scoped route now checks ownership** ✅ — 43 routes were guarded by
      `requireRole(['dm'])` alone, which answers "is this user a DM somewhere", not "is this user
      the DM of THIS campaign". Locations, NPCs, char-tree, meta, players, journey maps (13 of
      them) and the party timeline were all reachable by any DM with a guessed id. They now call
      `dmOwnsCampaign`, `canAccessCampaign`, `dmOwnsMap` or `canAccessPC`, and
      `test/campaignAuth.test.js` walks the route table so a *future* unguarded route fails the
      build.
- [x] **`canAccessPC` repaired** ✅ — it opened with `if (userRole === 'dm') return true;` and ran
      no query at all, so any DM could read **or write** any other DM's character sheets,
      portraits, relationships, DM notes, stats, exports and imports. One helper, 15 routes.
      It also had no admin branch, so admins were the one role locked *out*; they now pass.
- [x] **`GET /api/pc/:playerId/public-token` no longer mints tokens for anyone** ✅ — the token is
      a pure function of the player id and the route checked nothing, so any logged-in **player**
      could generate a working public character-sheet URL for any character in the system by
      counting upwards. The sharpest hole found.
- [x] **Child ids scoped to their parent** ✅ — DM notes and relationships were addressed by bare
      `id`, so a DM authorised for player A could edit or delete player B's notes by passing B's
      `noteId` under A's `playerId`. Now `AND character_id = (SELECT … WHERE player_id = $n)`.
- [x] **The trash actually seals now** ✅ — `deleted_at` threads through every helper, and the
      check sits **above** the admin short-circuit, because a trash an admin walks straight
      through is not a trash. A deep link by campaign id into a trashed campaign now 403s where
      it previously served the data.
- [x] **Two deliberate carve-outs** ✅ — the campaign export and the campaign-diary export keep
      working on a trashed campaign, so you can take a copy before purging. A test asserts
      nothing *else* passes `includeTrashed`. The Trash panel also gained an **Export** button,
      because until now there was no UI path to that export at all — the carve-out protected a
      door nobody could reach.
- [x] **`GET /api/player-timelines/:campaignId/all` returns 403 instead of 500 for a player** ✅ —
      it passed `playerId: null` into `parseInt`, producing `NaN`, which Postgres rejected as a
      bad integer bind and the catch turned into a 500.

Verified live against a throwaway stack: two DMs with separate campaigns, 23 cross-DM reads all
403, 10 cross-player reads all 403, 25 legitimate DM reads all 200, 7 legitimate player reads all
200, trashed campaign 403 on 16 routes with both exports still 200, restore back to 200.

---

## PC Sheet

- [x] **Spell list no longer appears twice** ✅ — each level rendered its names as an editable
      `<input>` *and* again as read-only chips below it. The chips are not redundant: they carry
      the per-spell ⓘ SRD lookup, which cannot live inside an input. The same mirror pattern is
      used for textareas, where it is correctly hidden on screen; the spell chips just never got
      that gate. Now the chips are the resting view and clicking swaps in the input — one list on
      screen, lookups intact. Escape and Enter both close the editor; a `beforeprint` listener
      closes it too, so printing mid-edit still puts chips on the paper.
- [x] **Special Traits lookup strip labelled** ✅ — same unhidden mirror, but deliberately *not*
      given click-to-edit: that list is filtered to names the SRD actually has, so it is a subset
      of the textarea rather than a copy, and hiding a multi-line field behind two chips would
      lose more than it cleaned up. It now carries a small `SRD` label so it reads as a lookup
      bar. **This differs from what you picked — say so and I will make it match the spells.**
- [x] **TEMP HP and TEMP MAX HP removed from the stats bar** ✅ — two usually-empty columns on
      every sheet to serve the few characters that use them. Both stay in the Manage HP dialog
      and still tint the HP box green. The bar held nine boxes against a 7-column grid, so it
      wrapped; it is now exactly seven and fits one row, with no CSS change needed.
- [x] **Current HP editable inline, with clamping** ✅ — the left half of the HP box is a real
      input now, so recording a hit costs no clicks. It holds the **raw** current value, not
      current + temp, because a box you type into has to mean what it says. Lowering Max HP or
      applying a negative Temp Max pulls current down to match — **on blur, never per keystroke**,
      since state is written on every character and typing `4` on the way to `40` would otherwise
      destroy the value. Never clamps when Max HP is blank, which is the normal state for an
      SRD-imported monster.

---

## Bootstrap / ops

All six were found while making `run.sh` work on a clean machine, and all six are now fixed.
Worth QA'ing together with one clean bootstrap in a scratch clone.

- [x] **`DB_PASSWORD` no longer hardcoded in two places** ✅ — `docker-compose.yml` interpolates
      `${DB_PASSWORD:-dndtools123}` into *both* the app service and `POSTGRES_PASSWORD`, so the
      two cannot drift, and `run.sh` generates a random one into a freshly created `.env` the
      same way it already did for the two secrets. **Only when no database volume exists yet**:
      postgres honours `POSTGRES_PASSWORD` solely at `initdb` time, so rotating it against an
      initialised volume changes what the app sends but not what the server expects — and the
      `pg_isready` healthcheck does not authenticate, so the container keeps reporting healthy
      while every connection fails. When a volume is found, run.sh says so and points at
      `compose down -v`.
- [x] **The `PORT` trap is closed** ✅ — compose now maps `"${PORT:-3080}:${PORT:-3080}"` and
      passes the same variable into the container, and `run.sh` reads it for the port preflight,
      the readiness poll and the banner URL. Previously `app.js` honoured `PORT` while compose
      hardcoded `3080:3080`, so setting it made the app unreachable.
- [x] **`/tmp/dndtools-init-creds.txt` is always cleaned up** ✅ — a file-only
      `trap … EXIT` in `run.sh`, kept separate from `cleanup()` so the "Ctrl+C is exit 0,
      failures are exit 1" contract is untouched and the plain-`exit 1` paths are covered too.
      `setup-db.js` also unlinks before writing, because `mode: 0o600` applies only when the file
      is *created* — writing over an existing path silently inherited its permissions.
      Known limitation, commented rather than solved: run via `docker compose exec`, the file
      lands in the container's `/tmp` where run.sh never looks.
- [x] **`chmod 755 pdfs` removed** ✅ — along with a duplicate `mkdir -p pdfs`. It was never
      doing anything: the container runs as root (deliberately, per the Dockerfile), so mode bits
      are bypassed, and nothing writes to `pdfs/` — there is no upload route. It only ever
      reverted permissions an operator had tightened. The compose mount is now genuinely `:ro`,
      which the file header had claimed since before it was true.
- [x] **Build-staleness check widened** ✅ — the `find` now also watches `vite.config.js`,
      `postcss.config.js` and `frontend/package.json`. Editing any of those changed the output
      but left the check happy, so `run.sh` served a stale bundle.
- [x] **`.env` no longer overrides exported environment variables** ✅ — both
      `scripts/setup-db.js` and `scripts/create-admin.js` (which had the identical bug, under a
      comment claiming parity with `app.js`) now use `dotenv`, which was already a direct
      dependency. dotenv never overwrites a key already in `process.env`, so an exported variable
      wins — matching `app.js`. This is the bug that sent a scratch-stack command at the live
      database during the campaign merge. It also fixes the old regex's handling of `export`
      prefixes, inline comments, CRLF and trailing whitespace.

---

## Campaign trash

- [x] **Deleting a campaign is now reversible** ✅ — `campaigns.deleted_at` (nullable, no
      default, so nothing disappears on upgrade), a Trash section in the Manage Campaigns
      sidebar with Restore and Delete-forever, and `GET /api/campaigns/trash`,
      `POST /api/campaigns/:id/restore`, `DELETE /api/campaigns/:id/purge`. Purge refuses a
      campaign that is not already in the trash, so the undo step cannot be skipped via the API.
      No scheduler and no automatic purge — nothing is destroyed unless you say so.
      - Filtering `GET /api/campaigns` hides a trashed campaign from **all five** module
        selectors at once, since Manage Campaigns, PC Sheet, Diary, Journey Map and Timeline each
        call that one endpoint — including the three that auto-select when exactly one campaign
        comes back.
      - **All five public share surfaces** refuse a trashed campaign with the same generic 404 as
        an unknown token: the diary, its roster, the timeline, the journey map and the public PC
        sheet. The last three never read the `campaigns` row at all and needed a join added.
      - Worth QA'ing specifically: delete → confirm it vanishes everywhere and the share links
        404 → restore → confirm the links work again → delete and purge → re-run the orphan-check
        SQL.
      - **Known and deliberate**: a trashed campaign is hidden, not sealed — a logged-in deep
        link by campaign id still reaches its contents. See the security appendix in `TODO.md`.

---

## React Migration (v1.0.0)

**This migration is complete** — every module below is ✅, the legacy
`public/<module>.html` pages are deleted and `LegacyIframe` no longer exists.
Kept as a record of what moved and when; nothing here is outstanding.

### Module migration order (suggested — most self-contained first)

- [x] **UserPanel** (`pages/UserPanel.jsx`) ✅ — migrated
- [x] **NpcSheet** (`pages/NpcSheet/`) ✅ — migrated
- [x] **ItemCards** (`pages/ItemCards/`) ✅ — migrated
- [x] **SplitView** (`pages/SplitView/`) ✅ — migrated
- [x] **PdfViewer** (`pages/PdfViewer/`) ✅ — migrated
- [x] **ManageCampaigns** (`pages/ManageCampaigns/`) ✅ — migrated
- [x] **PcSheet** (`pages/PcSheet/`) ✅ — migrated
- [x] **JourneyMap** (`pages/JourneyMap/`) ✅ — migrated
      (idiomatic SVG rewrite; reuses the `components/map/` renderer)
- [x] **PcPublic** (`pages/PcPublic.jsx`) ✅ — migrated
- [x] **JourneyMapPublic** (`pages/JourneyMapPublic/`) ✅ — migrated
      (built the reusable `components/map/` renderer — MapStage + SVG layers)
- [x] **Timeline** (`pages/Timeline/`) ✅ — migrated
      (idiomatic SVG Gantt; personal + campaign + public modes)
- [x] **TimelinePublic** (`pages/TimelinePublic/`) ✅ — migrated

> 🎉 React migration complete — every module is React-owned; no `LegacyIframe`
> stubs remain. The in-app DM combined read-only view is wired.

### Production build wiring

- [x] Add SPA catch-all route to `app.js` ✅
- [x] Serve `public/app/` as static assets ✅
- [x] Multi-stage `Dockerfile` builds React frontend ✅
- [x] `run.sh` installs frontend deps and builds before Docker build ✅
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

## Refactor

### General

- [x] Pressing "Enter" key should not trigger a lot of submits but only the ones I'm writing or I have open ✅ v1.0.0
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

- [x] Refactor Distance Matrix: instead of distance between locations, build a `Route System` where routes are drawn and distance is set by `Route Section` ✅ v1.0.0
      (Routes = a tracker-free road network — road/flight/maritime types, map-only
      waypoints that don't create campaign locations, per-section distances. Paths =
      tracker movement, reverted. One Draw tool with a Path|Route toggle.)
- [x] Route network: compute the real distance between any two locations via shortest
      path over the drawn roads (uses the per-section distances) ✅ v1.0.0
      (geometry.networkDistances/effectiveDistances; feeds paths, measure, matrix, proximity)

### Timelines

- [x] Add a filter by date so timeline could show only a specific timeframe ✅ v1.0.0
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

Some mutations refetched all data and re-rendered behind a full-tab loading spinner, which
unmounted the content and reset scroll to the top (and, in the Char Tree, reset the graph
zoom/pan). Fixed by updating local state optimistically — or at least NOT toggling `loading`
on a post-mutation refresh — following Timeline/JourneyMap, which already did this.

- [x] Manage Campaigns: stop the full-tab spinner on post-mutation `reload()` ✅ v1.0.0
      (`loadCampaign(id, { silent })`; `reload()` is now silent — spinner only shows on
      initial select / campaign switch. Fixes the scroll jump on player add/delete/reassign,
      location add/edit/delete/toggle-visibility, NPC add/delete, timeline create.)
- [x] `toggleLocVisibility` / `toggleConnVisibility` flip the flag in local state ✅ v1.0.0
      (optimistic flip, no refetch; reverts + toasts on error.)
- [x] Char Tree tab: connection add/edit/delete/toggle no longer remount the tab ✅ v1.0.0
      (silent reload for add/edit/delete, optimistic flip for toggle; the canvas now
      auto-fits only on first mount and keeps the user's zoom/pan on later changes.)
- [x] PC Sheet: `toggleRelVisibility` updates local state instead of re-listing ✅ v1.0.0
      (`addRelationship`/`editRelationship` still re-list on purpose — they need the
      server-assigned ids + recomputed `cross_connections`; neither causes a visible jump.)
- [x] UserPanel: role-change and delete now patch their row locally ✅ v1.0.0
      (`useAsync` already exposed `setData`. Both know the exact resulting value, so a
      refetch bought nothing. **Create still refetches on purpose**: its response
      returns only id/username/role while the table also shows Email and Created, so
      appending locally would render two blank cells or force an invented timestamp.)
- [x] General: scroll preservation audited app-wide ✅ v1.0.0
      (Every remaining `loading`-gated unmount was checked and each is an *initial* load,
      an explicit Refresh, or a deliberate context switch — player change, campaign
      switch — where resetting scroll is the correct behaviour. Manage Campaigns already
      keeps its scroll container outside the spinner swap; PC Sheet's relationship and
      note mutations are all local or optimistic. No post-mutation refetch remains that
      unmounts a pane. The audit did turn up one real defect: `addDmNote` appended while
      the API returns notes newest-first, so the list silently reordered itself on the
      next load — now prepends.)

---

## Fixes

### Item Card

- [x] Item Card form fields should reset when "Item Type" is changed ✅

### PC Sheet

- [x] Caster Type should be blocked depending on the selected Class ✅
      (locked when the class decides it — Full/Half/Warlock lists in `data/dnd.js`;
      left editable for a blank class, Multiclass, and the martial classes, because
      an Eldritch Knight Fighter and an Arcane Trickster Rogue are third casters.
      The old code forced `none` for those, which blocked exactly that.)
- [x] Add Button to the HP to add temporary Hit Points and Temporary Max Hitpoints ✅ v1.0.0
      (a `+` on the HP label reveals TEMP HP and TEMP MAX HP; they auto-reveal for a
      sheet that already carries either, so a loaded character never hides the value
      behind a click. Stored in `stats_json` as `temp_hp` / `temp_max_hp`. Behind a
      toggle because most characters never have either, and two permanently empty
      boxes in the core stats bar is clutter on every sheet to serve a few.)
      Later reworked into the Current/Max + Temp boxes with the colour rules and the
      **Manage HP** pop-up.
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

- [x] Reorganize the Graph with every new connection so lines doesn't cross too much ✅ v1.0.0
      (player columns ordered by cross-connection affinity, NPC row by median peer X)

### Timeline

- [x] **Editing an event silently rounds its duration.** ✅ v1.0.0
      The edit form pre-filled with `formatDuration(ev.durationDays).replace('~','')` and
      parsed it back on save — but `formatDuration` is approximate above 30 days. A 45-day
      event formatted to `~2m`, stripped to `2m`, and parsed back as **60 days**, so opening
      the modal and saving without touching the duration changed it. The form now pre-fills
      the exact day count (`45d`); typing `3m` or `2y` still converts on save, only the
      pre-fill changed. (Found by the new test suite; `data/calendar.test.js` now asserts
      the corrected round-trip for 1…1000 days.)

---

## Bug fixes

### General

- [x] Double `login` button on the header. Only the Right one should stay ✅ v1.0.0
- [x] Order for index: NPC Sheet -> Item Cards => Split View => Timeline => PDF Viewer => PC Character Sheet => Manage Campaigns => Journey Map ✅ v1.0.0

### Scripts

- [x] `npm run create-admin` password should be hidden when typing ✅ v1.0.0
      (a second readline interface was echoing it; now mutes the single interface)

### npc-sheet module

- [x] Print form only shows what's on the screen. Should print everything ✅ v1.0.0
      (round 2: the app shell capped #root/main to the viewport with overflow;
      global print rules now unclip the shell + hide the header)
- [x] Double `+` on prof and initiative ✅ v1.0.0
- [x] Ability Scores SV are not centered/aligned with the modifier ✅ v1.0.0
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
      Their hard-coded default values were removed afterwards.
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

- [x] Export → import round-trip is now safe ✅ — **you have confirmed this one in use.**
      Bundles are `version: 2` and declare a `scope`:
      - **`scope: 'full'`** (DM export) carries `private_info` and every DM note.
      - **`scope: 'player'`** omits both keys *entirely* rather than blanking them.
      Import writes a field only when the bundle actually carries it, which fixes
      all three defects: `private_info` survives a player-produced bundle, DM notes
      are replaced (not appended, so no more 2 → 4 → 6 doubling) and only from a
      full export, and relationships now round-trip `parent_id`, `is_dm_only`,
      `status_label` and `created_by_role` instead of flattening the family tree.
      **Importing is DM-only** (`requireRole(['dm'])`), through Manage Campaigns →
      Import, with a per-player shortcut on the Players tab. A player can still
      export their own sheet; it carries their visible DM notes but no hidden ones.
- [x] 🌳 Family Tree & Relationship Matrix is too big. Condensed the table ✅ v1.0.0
      (round 2: relations list capped 30vh, graph 240px/34vh)
- [x] DM Notes are also too big. ✅ v1.0.0 (round 2: capped 35vh)
- [x] Generate PDF doesn't work. Should print all the pages of the pc-sheet ✅ v1.0.0
      (round 2: prints a combined all-tabs print document, not just the active tab)

### Journey Map

- [x] Regions, pinned locations, paths are not shown in the map ✅ v1.0.0
      (round 2: React <img onLoad> race — data-URL map decoded before the handler
      attached, so `loaded` stayed false and the layer gate hid the SVG; MapStage
      now detects an already-complete image)
- [x] By default, all tools in the menu should be collapsed ✅ v1.0.0
- [x] Distance Matrix should fit the whole screen when opened ✅ v1.0.0
- [x] Pick location should be at the beginning of the list so it's easier to select ✅ v1.0.0

### Manage Campaign module

- [x] Reorganize the Graph with every new connection so lines doesn't cross too much ✅ v1.0.0
      (crossing-reduction layout: shared `components/graph/ordering.js` — min-crossing
      player order + median NPC order; PC Sheet ego graph also reduced via fan extremes)

### timeline module

- [x] Today marker should be moved on top of the menu ✅ v1.0.0
- [~] By default, all tools in the menu should be collapsed — already collapsed by
      default in code; if seen expanded it's remembered `ht-ui` localStorage from a
      previous session (clearing it restores collapsed). **No code change** — nothing
      to QA beyond clearing localStorage once.
- [x] Search event, type of timeline, selector for table/timeline graph, zoom, etc, should be on a line as a menu ✅ v1.0.0
- [x] I can't select a campaign when moving to the private timeline ✅ v1.0.0
      (round 2: the campaign selector bar was permanently `display:none` — the
      `.priv-sel-bar` needed the `.visible` class the legacy JS used to add)
- [x] Fit button doesn't fit the timeline ✅ v1.0.0
      (round 2: content height is linear in ppd — H = A·ppd + B; the old rescale
      ignored the fixed B term and always overflowed. Now solved exactly.)
