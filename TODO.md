# TODO

Only open work lives here. Everything that is built and waiting on your QA moved to
[`TOQA.md`](TOQA.md).

---

## Bootstrap / ops — known gaps

Found while making `run.sh` work on a clean machine. None of these block a bootstrap.

- [ ] **`DB_PASSWORD` is hardcoded `dndtools123`** in both `.env.example` and
      `docker-compose.yml`. Generating it means keeping the two in sync — compose would have to
      read it from `.env` for both the server and the app container. Worth doing before this is
      exposed anywhere.
- [ ] **`PORT` in `.env` is a trap.** `app.js` honours it, but `docker-compose.yml` hardcodes the
      mapping `3080:3080`, so setting `PORT=4000` makes the container listen on 4000 while the
      publish still points at 3080 — the app silently becomes unreachable.
- [ ] **`/tmp/dndtools-init-creds.txt` can be left behind.** It holds the initial admin password
      at mode 0600 and is normally deleted after the banner prints, but a crash between creating
      the admin and printing leaves it until the next run cleans it.
- [ ] **`chmod 755 pdfs` runs unconditionally** on every `run.sh`, silently reverting tightened
      permissions.
- [ ] **The build-staleness check watches only** `frontend/src`, `frontend/index.html` and
      `frontend/tailwind.config.js`. Editing `vite.config.js`, `postcss.config.js` or
      `frontend/package.json` will not trigger a rebuild.
- [ ] **`scripts/setup-db.js` lets `.env` override exported environment variables.** `app.js`
      loads `.env` through dotenv, which never overwrites a variable already in the environment;
      the setup script reads the file itself with no such guard, so `DB_PORT=15433 node
      scripts/setup-db.js` still connects to whatever `.env` says. This bit during the campaign
      merge: a scratch-stack command reached the **live** database instead. It was a read, so
      nothing was damaged, but the next one might not be.

---

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

### PC Sheet — other

- [ ] Prepare for Multi-Class

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

### 3. Give Item Cards server-side storage

Already noted above as the blocker for inventory, but it deserves to be its own item: the module
is **localStorage-only**. Clear your browser data, switch laptops, or open the app on the tablet
you actually use at the table, and the cards are gone. There is no export for them either. Every
other module in the app persists; this one quietly does not, which is a trap rather than a
limitation.

Moving it to a table behind `requireAuth`, with the same export convention as everything else,
is small and unblocks the inventory work at the same time.

### 4. Cross-links between modules in the text you already write

You have a shared markdown renderer (`components/ui/renderMarkdown.js`) used by the diary, notes
and descriptions. Teaching it a `[[Location Name]]` / `[[NPC Name]]` form that resolves to the
campaign entity and renders as a link would connect the diary to the map to the timeline without
any new UI. It also gives search (idea 2) a graph to rank by.

Caveat worth settling first: links have to resolve *per viewer*, or a player's diary page links
to an NPC they have never met.

*Compare:* this is exactly Obsidian's and Kanka's mention syntax, and it is the reason both feel
cohesive rather than like a set of forms.

### 5. A trash can for campaigns

When you deleted a campaign you had to ask me for SQL to prove nothing was orphaned. That is the
right instinct and the wrong workflow. A `deleted_at` column, a filter on the list, and a purge
after N days would mean a misclick is survivable and the cascade behaviour gets exercised once,
deliberately, instead of being audited by hand each time.

*Compare:* Roll20 and D&D Beyond both keep deleted campaigns recoverable for a window.

### 6. A player-facing campaign page

You already generate share links for timelines, the campaign diary, PC sheets and journey maps —
four separate URLs a player has to keep track of. One per-campaign player page that gathers
whatever that player is allowed to see (their sheet, the shared timelines, the published diary,
the public map, the NPCs they have met once idea 1 above exists) would replace all four.

The access rules all exist; this is mostly assembly.

*Compare:* Obsidian Portal's campaign homepage, World Anvil's player-facing world.

### 7. Finish or remove `campaign_locations.image_data`

The column exists and `app.js` reads and writes it, but in your export every value is
null — nothing in the UI ever sets it. Either wire it up (a handout image on the location popup
and the public map, which is a genuinely nice table moment) or drop it. A half-built column is
worse than neither, because the next person to touch locations has to work out which it is.

### 8. Session prep, in the app

The diary records what *happened*. Nothing records what you intend to happen. A "next session" note per
campaign, with a one-click promote-to-diary-entry after the session, would close that loop and
reuse the diary's editor and markdown wholesale.

Lower down the list because your Obsidian workflow already works, and a worse copy inside the app
is a step backwards. Only worth it if the cross-links from idea 4 exist, so prep can point at
real NPCs and locations.
