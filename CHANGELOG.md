# Changelog

All notable changes to **dnd-tools** are documented here.

`1.0.0` is the full refactor: everything between the `0.1.0` tag and the first release of the
React application, collapsed into one entry. The per-step detail that used to live here as
twenty-six *Unreleased* sections is in the git history of this file; what follows is the summary
worth keeping. The `0.x` entries below it are left exactly as they were.

The newest tag is `1.0.0`. Anything above it is marked *Unreleased* until it is tagged.

---

## [1.0.1] – Unreleased

### Added — Session prep

A **🗓 Sessions** tab in Manage Campaigns: the DM's plan for one sitting, and what came of it.
DM-only, all of it — there is no player-facing counterpart anywhere, which is the point, since
this is where the twist lives.

A session has a number, a title, a date and a status (**prepared** or **played**). Its notes
are cards, in the order a session is actually used:

- **Where we left off** — the short version of last time, to read aloud.
- **Before it begins** — what you need ready: statblocks, handouts, a map.
- **The session** — things that could happen. Nothing here has to.
- **What happened** — written during or after; the raw material a diary entry comes from.

Every card carries a **state** — in preparation, ready, on-going, done, skipped — changed with
one click to open the picker and one to choose, never a trip into a form. It has its own route
for that, because a PUT omitting the title would blank it and flipping a card to Done is the
most frequent write the feature has. **Cards nest** as deep as the DM's own notes do, so a beat
can carry its own "if they refuse"; deleting one takes its subtree, because a beat's detail has
no life of its own. `[[Cross-links]]` work in every card body.

**"Still running" is a view, not a section.** Any card marked on-going shows up in every *later*
session until someone changes its state, and marking it done clears it everywhere at once.
Carrying a thread forward by copying it is how you end up with two of it, one of them quietly
stale — so the section has no "add" and is read-only in place, labelled with where the thread
came from.

It looks backwards in the **campaign's own order**, not clock time: a DM writing session 12
before session 11 should still see 11's threads in 12, and 12's must not leak back into 11.

Deliberately not the campaign diary. The diary is the finished account the table reads; this is
the working document behind it.

#### Reading a session of a hundred cards

Six changes from first real use, with 258 cards of actual prep in the page.

**Sections open shut**, each with its card count in the heading, so a closed
section still tells you whether it is worth opening. Four sections open at once was
a page nobody could find anything in.

**Marking a card done takes its sub-cards with it.** Finishing a beat and leaving three
half-ticked details underneath is just a second chore. Only `done` cascades — a parent is
on-going precisely because one child is and the rest are not, and cascading that would erase
the distinction. It is one recursive statement rather than a walk from the client, bounded at
fifty levels because `parent_id` is a tree by construction and not by constraint.

**Skipped cascades too.** It did not at first, because only Done had been asked for — but the
two mean the same thing to a DM reading the page, and leaving skipped per-card meant abandoning
a beat and then ticking its three details off one by one. The other three still do not cascade,
and that asymmetry is the point.

**Changing a state no longer refetches the session.** It did, which remounted every card and
threw the DM back to the top of the page — mid-session, while they were ticking something off,
which is the worst possible moment. The route now returns every row it changed and the page
patches those in place.

**A finished card folds itself away**, and **Expand deliberately skips the finished ones** —
re-opening fifty done beats is not what anyone means by "expand all". That needed open/closed
to move out of the card and into the page, since local state inside a card cannot be told to
skip anything.

**The state menu is opaque again.** A finished card used to dim its whole box, and the menu
inside it inherited that. It fades its text instead.

**"What happened" has no state control and is never greyed.** Those are things that actually
happened at the table; preparing or skipping one after the fact is a question with a single
answer.

#### Running a session from the page

**A played session is read-only.** Cards, states and drag all freeze until it is marked
Prepared again — a finished night is a record, and editing it should take a deliberate act
rather than a stray click in last month's notes. The page says so, instead of just not
responding. **Still Running is hidden** on one too: it is a working view of what is live, and
the rows are untouched, only the view is gone.

**Marking a session played offers to build the next one**, because that is the moment the DM
knows what survived. Ready and on-going cards carry into *The session*, in-preparation ones
into *Before it begins*, and *What happened* becomes a single recap card to read aloud. Done
and skipped carry nothing. It **copies** — the played session keeps its record — and the
confirmation names the counts first.

**The whole tree comes with a live card.** A live sub-beat under a finished one is meaningless
on its own — *"if they refuse"* with nothing to refuse — so every ancestor of a carrying card
carries too, keeping its own state so it is visibly already done. Finished *leaves* are still
dropped: only the connective tissue between a root and something live earns its place.

That also means a tree gets **one section**, decided by what is live inside it rather than by
its root — a tree holding anything ready or on-going is a thing that might happen, so it goes
to *The session*; a tree that is only in-preparation is still work to do. Splitting a tree
across the two is the thing this avoids.

An earlier version promoted such a card to the root instead. That kept the thread and threw
away what it was part of. And the version before that carried *What happened* twice: once as
prose and again as cards, putting every event of last session into next session's plan.

**Drag and drop.** A strip between cards reorders among siblings; dropping onto a card makes
it a sub-card. The two are separate targets rather than halves of one, because a card is both a
neighbour and a possible parent and halves make that a guess. Dropping a card inside its own
subtree is refused — that would detach the branch and leave rows nothing ever renders again.

**And a card may now cross sections.** This was refused at first, on the grounds that a card
means something because of where it sits. That is true, and it turned out to be the argument
for allowing it: a beat that actually happened belongs in *What happened*, and the DM should
be able to say so by dragging it rather than retyping it. The strip at the foot of each section
is the target, and it shows for any drag — it is the only one an empty section has, and *What
happened* is usually empty.

**The subtree goes with it**, which is the load-bearing half. A child's section is its parent's
everywhere else in the feature, so moving a card without its descendants would leave them in a
section their parent has left, where nothing renders them at all.

One consequence worth naming: a card dragged into *What happened* keeps whatever state it had,
so an on-going thread could have arrived there and gone on announcing itself as still running
in every later session. **Still Running now ignores *What happened*** — those cards are a
record, not a thread — and so does the count beside each session in the list.

**Search and a state filter**, inside the session. A matching card keeps its whole subtree,
because you searched for the card and its detail is what you wanted to read; a card kept only
because something beneath it matched is dimmed as the path to a hit. Filtering opens the
sections that have one, or a match behind a shut heading reads as "no results".

**Still Running now updates in place.** Those rows come from other sessions, so patching the
session's own items left a thread you had just closed sitting there until a reload.

**Neither does saving a card.** Saving called the same reload, which swapped the whole panel
for a spinner — the list unmounted, the page jumped back to the top and every expanded card
shut, mid-session, while the DM was writing in one. It patches the row instead. Deleting had
the identical fault and the same fix, mirroring the server's cascade to sub-cards rather than
refetching. A new sub-card also opens its parent, which otherwise swallowed it.

**The section headings float.** A long section used to scroll past unlabelled. They sit at
`z-20` — over the cards, deliberately under the state menu at `z-50`, which would otherwise
have its clicks eaten.

**Marking a session Played warns when *What happened* is empty**, and asks *before* the write.
Played makes the session read-only, so doing it the other way round left the DM to work out
that they had to mark it Prepared again before they could type the notes they were about to
type.

#### What happened → the Campaign Journal

The same night was being written down twice: once as the DM's private record in *What
happened*, and again in the Journal so the table could read it. **📖 To journal** on that
section's heading copies the first into the second.

**One entry per card**, with its sub-cards folded into the body as bullets — a sub-card is
detail about its parent, not a separate event, so splitting them would file four entries for
one thing that happened. Only *What happened* is ever read: the other three sections are a
plan, and publishing a plan as a record of the night gives away what has not happened yet.

**It copies.** The session keeps everything, because a played session being a record is the
whole point of it.

**DM-only unless you say otherwise.** These are the DM's own notes, so publishing them is the
deliberate act and the box is an opt-in that says what it does rather than naming the column.
Un-ticked, the entries land hidden and can be published one at a time from the Journal.

**Clicking twice is safe** — a card whose title is already in the campaign's journal is
skipped, and the toast says how many. People click twice, and a convert button that silently
doubles the journal is worse than one that does nothing the second time.

Offered on a played session too: copying reads the prep, it does not edit it, so read-only has
no say — and after the night is played is exactly when you would want it.

#### Merging a bundle into an existing campaign

**The prep now merges too.** The campaign bundle grew a `sessions` key and this path did not,
so a merge quietly dropped it — and it was not even listed among the things the dialog says it
refuses, because that list is written by hand. It goes through `importSessionList`, the same
function the `campaign-sessions` file and the whole-campaign restore use, so three paths cannot
drift apart. A session matched by number is **replaced whole**, which the confirmation now
names: it is the most destructive thing in that dialog, and agreeing to "replace 3 NPCs" should
not cost you a session's cards.

**Player sheets and maps are still refused, and now say why.** It read as a defect — "will NOT
be imported", with no reason. They are refused because there is no safe way to match them to
what is already there: a seat, its user assignment, its stats, its inventory and its timelines
all have to agree, and guessing wrong overwrites a character. Sessions have such a rule, which
is why they can merge and these cannot. The dialog now says that, and points at importing as a
new campaign — which carries everything.

#### Export and import

Session prep has its own file type, **`campaign-sessions`**, for the same reason the diary and
the journey maps have theirs: a DM moving prep between campaigns should not drag players and
maps along. **💾 Export** sits in the Sessions tab; import goes through the usual hub in
Settings, which sniffs the file type.

**The whole-campaign bundle now carries the prep as well.** It did not, and that was wrong in a
quiet way: the campaign bundle is the whole-world backup, so a restore silently returned a
campaign with every session's planning gone. Both sides go through the *same* two helpers the
`campaign-sessions` file uses — two importers would drift, and the one with fewer tests would
be the one a backup went through. The prep is written last and inside the campaign's own
transaction, so a bundle that fails anywhere above leaves none of it behind.

The bundle version stays at **5** even though it carries a new key. Compatibility here is
field-driven and not version-driven — the import reads `sessions = []` and never looks at the
number — and a bundle without the key still restores, simply with no prep in it.

**The import MERGES, which is the one way it differs from the diary import.** A diary is a
single document and importing one replaces it; sessions are a running series, and a DM
importing session 25 should not lose the twenty-four they already have. Identity is the
session **number**, falling back to the **title** — a session that matches is replaced whole,
so importing the same file twice leaves the same thing rather than doubling it. The
confirmation names which numbers will be overwritten.

Items are **nested** in the file and carry **no database ids**: a file is read by people and
diffed by tools, and `children` survives both while a flat list keyed on ids survives neither.
A hand-edited bundle cannot smuggle a card into the wrong place — a child takes its parent's
section on import exactly as it does through the UI, and an unknown state or section is clamped
rather than stored.

The export opts in to trashed campaigns, like the diary's, so prep can be taken out before a
purge. That carve-out list is now two routes and the test names both, and additionally asserts
each is read-only.

**Not built yet:** Campaign Pendings, the campaign-level backlog of ideas — deferred by
agreement, and noted in `TODO.md`. Card reordering is also not in: the `position` column exists
and ordering is stable, but there is no drag yet.

Verified against a scratch Postgres — 28 checks covering nesting, the section-inheritance rule,
the on-going view in both directions, cascade on delete, and a player being refused at every
route. Plus 24 static tests and 10 on the flat-rows-to-tree step, with four guards re-broken to
confirm each check fails.


### Added — rules lookups on a pinned item card

Open an item from the inventory and its **weapon properties** and **damage type** are clickable,
each showing its 2024 SRD text. *Finesse* on a rapier now answers what Finesse does, without
leaving the sheet.

Each property is its own control rather than the line being one — "Light, Finesse, Thrown" reads
as prose and the words are the affordance, because an ⓘ after each of three would be more
punctuation than card. `SrdInfo` takes `children` as the trigger for that; every existing caller
still gets the ⓘ.

**Two things gate it, and both matter:**

- `lookups` is **off by default**. The same component is what `handleDownload` captures for the
  PNG and what the Item Cards creator renders as a live preview — interactive chrome in either
  would be baked into an image. Only the pinned inventory card turns it on, so the creator and
  the capture fetch no SRD index either.
- The inventory card was **`pointer-events-none`**, so nothing inside it was reachable however it
  rendered. The *hover* card keeps that — it follows the pointer and must not steal the hover
  from the row beneath — while a **pinned** card now takes clicks, which is what makes any of
  this work.

A name the SRD does not have renders as plain text rather than a link, so a homebrew property is
the DM's own word instead of a dead end that opens "no entry".

**What was left out, and why.** Rarity and attunement have no SRD entry. `armorType` here is
free text ("Medium"), not an SRD resource. Conditions named inside an item's abilities prose
would need scanning the text rather than a field — that is the existing `TODO.md` item about
linking statuses and conditions from the PC Sheet, and it is a bigger job than this one.


### Fixed — a cross-link popover opened behind the note that triggered it

Clicking `[[Buldamar]]` while reading a journal or diary entry appeared to do nothing. The
reading `Modal` portals itself to the end of `<body>`, so a popover rendered in place sat at the
same `z-50` but EARLIER in the document and lost the tie. It is now portalled too, at `z-[60]`,
with its click-away layer above the modal so it can still be dismissed.

### Added — the party in the `[[` autocomplete, offered but not linked

`link-targets` now returns the campaign's characters alongside locations and NPCs, and the
dropdown offers them, marked *name only*. They are deliberately **not** indexed: a character has
no page to open, so `[[Thalia]]` renders as plain text like any other unresolved name. Picking
one spells the name consistently, which is the point. A character's sheet name is used when
there is one, falling back to the player slot's name.

### Added — three SRD lookups

- **Spell names** on the NPC/stat sheet, per level. 339 SRD spells.
- **Weapon properties** on an item card. Ten of them.
- **Damage type** on an item card, via the existing `SrdCombobox`.

**Spells and weapon properties are edited as chips**, the same way Defenses always has been:
each one has an × to remove it and an ⓘ for its SRD text, and the box takes free text for
anything the SRD does not have.

They were first built as a comma-separated text field that completed the segment the caret was
in. That was the wrong shape twice over. Picking the last entry left the caret *inside* it, so
the field still read as editing that entry and the dropdown offered it straight back; and
reopening a saved item put the caret at the end — inside the last entry — reproducing the same
thing on every edit. A chip is finished the moment it is added, so there is no half-edited entry
to land in. `ListAutocompleteInput` and `data/listInput` are gone rather than left orphaned;
`data/listValue` is the string ↔ list seam, since the column still stores
`"Light, Finesse"` and every import, export and print path reads it.

The spell editor loses its click-to-edit toggle with them, along with the `beforeprint` hook
that existed to close a half-open text input before the sheet reached paper.

All three fail open: `loadEntries` already caches per resource and returns null when the API is
slow or unreachable, so offline the fields behave exactly as they did before.

### Changed — a character's name is unique in its campaign, and one person holds one seat

Two rules that `campaign_players` never had.

**A character's name is unique within its campaign**, case-insensitively, and free across
campaigns — the same character may be played in two of them, which is not a clash. The third
table to get this rule after locations and NPCs, and for the same reason: the campaign bundle
refers to a player by NAME, so two seats called "Davin" collapsed into one on import, taking
the second one's inventory, diary and timelines with them.

Existing clashes are **renamed, not deleted** — a seat owns a character sheet, stats,
relationships, diary entries and timelines. Adding a duplicate now answers 409 rather than
500, as does redeeming an invite with a name already taken, and the import upserts rather than
aborting a whole restore on a constraint a pre-rule bundle cannot satisfy.

**One person holds one seat per campaign.** Two seats for the same user make "which character
wrote this" unanswerable — the journal's author query picks the lowest id and says so in a
comment — and it duplicated the PC Sheet's campaign selector, which is how it first surfaced.
Enforced when adding a player and when reassigning one, and the check on reassign runs
**before** the existing assignment is deleted, so a refusal leaves the seat as it was. The DM's
own marker row is excluded: it is bookkeeping, not a character anyone plays.

### Fixed — the diary withheld nothing, while the journal withheld everything

The rule that hides an entry naming a place the party has not found, or a person they have not
met, was applied to the journal only. A published diary entry could still name either — and
the campaign diary reaches players solely through the share link, so that was the one surface
still leaking.

It now goes through **one shared implementation**, because two copies of a withholding rule
are worse than one: they disagree eventually, and the DM stops being able to reason about it.

On the share link the rule applies to **everyone, the DM included**, which keeps that route
session-blind — what the link shows is what the table sees, and a DM opening their own link is
previewing exactly that. They read the unabridged diary in the Diary module.

That closes the TODO note about unmet NPCs surfacing in the journal and diary searches. The
other half of it was already closed by the NPC visibility flag: the `[[` autocomplete and the
cross-link index have been filtered since that shipped.

### Added — a location's card lists who is there, and links to its map

Opening a location's card now shows **the people standing there** — the NPCs whose current
location is that place, each marked as met or not. The list comes from the NPCs the page
already holds rather than a request per card, and a player's copy of that list contains only
revealed NPCs, so a place cannot give away someone they have not met.

A **globe beside the name** in the Locations tab opens the map that place is on, and the card
offers the same. Only for a location that actually has one: an icon that is present but dead
is worse than no icon.

Three ways a location can have a map, and they are not equally good answers, so they are
ranked rather than taken in whatever order the planner returns:

1. a map scoped **to** it — the city's own map,
2. a region pin **linking out** to one — the same idea, reached from a parent map,
3. a map it is **pinned on** — not its map, but where to go to see it.

Buldamar having both its own street map and a pin on the world map is the ordinary case, and
sending the DM to the world map there would be the wrong answer. One `LEFT JOIN LATERAL`, not
a query per row: a campaign runs to a hundred locations and this list loads on every visit.

Players do not get the link. A DM map has no share token, so it would be an affordance that
cannot work.

The link needed somewhere to go, so the Journey Map page now reads `?campaign=&map=`, mirroring
the Timeline module. It applies them **once** — without that guard it re-runs as the map list
settles and drags the DM back to the URL's map every time they pick a different one.

### Added — click an NPC or a place to read its card

In the **NPCs** and **Locations** tabs, clicking a row opens the read-only card instead of the
edit modal. Reading and editing are different intents and the modal is a poor reader — it is a
stack of textareas. The pencil still opens it. For a DM the card also shows their private
notes, gated by the data rather than by a role check: the server never sends `private_info` to
a player, so that section can only ever render for someone entitled to it.

The player's **Campaign Links** tab gets the same treatment, plus a **Places** section
alongside People — public locations, which a player could not reach from anywhere before. Both
are compact rows that open the card, rather than expanded blocks: a campaign has dozens of
each, and forty open blocks is a scroll rather than a list.

### Added — a journal entry that names something hidden is withheld whole

An entry can mention a place the party has not found or a person they have not met. Blanking
the **link** was never enough — the name is still in the prose, and the sentence around it is
usually the spoiler. Such an entry is now withheld entirely, and reappears on its own the
moment the DM reveals the last thing it names.

It covers `[[links]]` in the body **and** the entry's own "where it happened" field, since
tagging an entry with a secret place and not linking it would otherwise walk straight around
the rule. It applies to every entry, whoever wrote it, rather than only the DM's: a player
quoting a name they heard somewhere is the same leak.

This is the one withholding rule in the app that **cannot be a SQL predicate** — it needs the
body parsed — so it happens in the route. The row still never leaves the server.

Two details decide whether it works at all. The resolution index is built from **all** rows,
hidden ones included: filter to the visible set first and a hidden name simply fails to
resolve, so the entry publishes — a failure that looks exactly like success. And names are
folded the way the client folds them, so `[[thea]]` is caught for Théa.

### Added — import into a campaign that already exists

Importing a campaign file used to always create a new campaign. With one selected, it now asks
whether to **replace content in the campaign you are looking at** instead, naming real counts
— "Replace 91 NPCs, 106 locations in *Leruhy*?" — because "are you sure?" with no numbers is
not a decision anyone can make. Cancel still imports it as a separate campaign.

**Only the sections the file carries are touched.** A file with just NPCs replaces the NPCs and
leaves locations, the diary, the journal and the maps exactly as they were.

Rows are matched **by name**, so one that exists in both keeps its row id — which is what keeps
journey-map pins, `npc_<id>` timeline actors and cross-connections pointing at the right thing.
An insert-after-delete would renumber everything and quietly break all three.

An NPC the file omits is removed, **unless something still points at it**, in which case it is
kept and named in the result. Neither referrer is a foreign key the database would protect:
`character_relationships` stores a bare id beside a type, and a timeline's actors are
`npc_<id>` strings inside a `text[]`.

**It will not touch players, timelines, maps or gear**, and says so rather than ignoring them.
Replacing a player means deleting their character sheet, their stats, their relationships and
their timelines — far past what an import should do without a much more specific conversation.

### Changed — NPC names are unique per campaign, case-insensitively

The table already had `UNIQUE (campaign_id, name)`, which is exact: "Grathul" and "grathul"
could both exist and then resolve unpredictably, because every lookup that matters keys on the
**name** — the bundle's NPC refs, the character-tree cross-connection refs, the `[[Name]]`
index. Locations settled this long ago with a `LOWER(name)` index; NPCs now match.

**Existing clashes are renamed, not deleted** — the opposite of what the locations migration
did, and deliberately. A location was a name and a description; an NPC carries prose the DM
wrote, and its id is referenced by `character_relationships` and by `npc_<id>` actor tokens in
timeline entries, so deleting the loser of a case clash would silently orphan both. The
survivor keeps its name and the rest get their row id appended — an id, because any fixed
suffix could clash with the next renamed row in the same group.

Both upserts now name `(campaign_id, LOWER(name))` as their conflict target. Naming the plain
column would miss a differing-case clash and surface it as a 500 rather than skipping the
duplicate; renaming onto an existing name still answers 409.

### Fixed — the campaign backup was losing NPCs and the whole Journal

Export succeeded, import succeeded, and data was gone. Two separate holes, found while
checking whether this week's work had broken the bundle.

**NPC detail never travelled.** The export was `SELECT id, name` emitting `{ name }`, and the
import inserted a name and nothing else — so a backup/restore destroyed every NPC's
description, public and private notes, visibility and current location. A regression from the
NPC work, caught before it shipped.

**The Campaign Journal had never been in the bundle at all.** `campaign_journal_entries`
appeared nowhere in either handler, so every backup ever taken was missing the table's shared
notes. That one predates this week.

Both now travel, by symbolic ref rather than by id — the rule the rest of the bundle already
follows, because a row id means nothing in the campaign being created.

**The NPC pass now runs after locations, rather than gaining a second pass.** Every
create-then-UPDATE in the importer exists because of a *cycle* — a location's parent is a
location, a relationship's parent is a relationship. An NPC's location is not a cycle, so
ordering settles it; copying the two-pass shape here would have cost a second statement per NPC
and blunted a marker that currently means something specific.

Three details that would each have been a quiet data bug:

- **`is_public` is read as `=== true`, not the `!== false` locations use.** A location defaults
  to visible because it always was; an NPC has never been visible to a player. An absent key
  therefore has to mean *hidden*, or restoring a backup written before the field existed would
  publish every NPC in the campaign at once.
- **In-game day goes through `journalDay`, never `|| null`.** The absolute-day epoch puts year
  1 day 1 at **zero**, so a falsy test silently deletes a real date.
- **`created_at` is `COALESCE`d.** A bare null parameter *stores* null — a column DEFAULT only
  fires when the column is omitted — and a null `created_at` scrambles the order the journal
  reads back in.

**Journal authorship is resolved, but fenced.** A restore onto the same instance keeps who
wrote what — but only for someone who is actually in the campaign being built. `created_by`
governs who may edit an entry, so matching a bare username without that fence would hand edit
rights over a restored note to an unrelated account that merely shares a name on the server.
Anyone who does not resolve collapses to the importing DM.

Old bundles still import silently: NPCs arrive hidden with no detail, the journal is empty, and
the response says `journal: 0` — a fact about the file rather than a failure. The version is
now 6, and the import still does not read it: compatibility here is field-driven, and a version
branch nobody keeps fixtures for would rot untested.

`campaign_invites` stays out, and the export now says why. An invite is a credential, not
campaign content — the same reason the share tokens do not travel, which is a different reason
from `journey_trackers` being retired.

#### Verified

The first live round-trip test in the repo — `test/campaignRoundTrip.live.test.js`, gated on
`ROUNDTRIP_DB` so `npm test` stays green. It spawns the server against a scratch Postgres,
seeds a campaign with a hidden location and a visible NPC standing in it, exports, imports and
compares. 15 checks, plus 23 static ones in `test/campaignBundle.test.js`.

The sharpest is a join asserting no restored row points at a location in another campaign, and
a walk over the whole bundle asserting the hidden location's raw id appears nowhere in it at
all. Four guards were then broken one at a time to confirm each check fails: reading
`is_public` the location way republishes every NPC from an old bundle; dropping the ref
resolution makes the cross-campaign count non-zero; `|| null` loses day zero; and putting the
NPC pass back above locations fails both suites.

Also fixed: a seed case in that test asserted two locations could share a name. They cannot —
`campaign_locations_campaign_name_unique` forbids it — so the `__n` disambiguation suffix in
the exporter is unreachable for anything created through the app and only protects rows older
than that index.

### Added — NPC management

NPCs were a name and nothing else. They are now managed the way locations are, in the same
**🧟 NPCs** tab: a table with a hide/show eye, an edit modal, a search box, and delete.

Each NPC gains **a description**, **public info**, **private info**, and **a current location**
picked from the campaign's own locations. Bulk-add by comma-separated names stays — naming six
NPCs before a session is still the common case — and the rest is filled in later, when they
turn out to matter.

**Hidden by default**, which is the opposite of how locations behave and is deliberate.
Locations default to visible because they always were; a player has never been able to see an
NPC at all, so defaulting to visible would publish every NPC a DM has ever named the moment
they upgrade. Reveal them one at a time as the party meets them.

A revealed NPC shows up in the two places that were already built for it:

- **`[[Grathul]]` in prose** resolves for players, opening his description and public info. The
  cross-link machinery was DM-only purely because NPCs had no visibility flag.
- **The PC Sheet's Campaign Links tab** grows a *People* section — the empty `npcs: []`
  placeholder the server has been carrying, with a comment saying it was waiting for exactly
  this. They are plain cards, not links: an NPC has no page to open.

**Their current location is a single column, not a history table.** An NPC's movement over time
already exists — timeline events tagged with them are what the journey map draws their path
from — and a second, unconnected history would be two answers to one question.

#### What took the care

`campaign_npcs` is the first table in this app that a player may read *and* that holds a column
they must never see. Locations get away with `SELECT *` because nothing on that table is secret;
the moment `private_info` exists, a star is a leak. Every player-reachable query here names its
columns, and reverting just that one line hands `private_info` straight to the table — which is
how it was verified.

**A hidden location stays hidden even when the NPC standing in it does not.** Withholding the
location's *name* but keeping its *id* is a leak rather than a half-measure: two NPCs coming
back with the same unexplained id tells a player they are in the same undiscovered place, and
that id maps onto a location they may know by another route. The journal shipped exactly this
mistake once; both are nulled together here.

A current location is **verified to belong to this campaign** before it is written. Without
that, an id from another campaign would be accepted and that location's name would then surface
in this campaign's NPC list — a cross-campaign leak through a column nobody would think to
audit.

The DM search now reads the new fields, private notes included, and the DM-only search popover
shows all three rather than *"NPCs hold only a name today"*.

### Fixed — a seat could never be freed, and DMs were offered as players

Two bugs in the Players tab's **Reassign** column.

**Unassigning was impossible.** The select's value was always `''` — which *is* the "— None —"
option — so choosing it changed nothing, fired no change event, and left Save with nothing to
send. A seat could be handed from one user to another but never emptied. The select now shows
whoever holds the seat, so "— None —" is a real change; the server already read `null` as
unassign, and always had.

That also means the current holder has to stay in the option list. They were filtered out, on
the reasoning that reassigning to the same person is a no-op — but a `<select>` cannot display
a value that is not among its options, so the row showed whichever name happened to be first as
though it were saved.

**The user list was `role !== 'admin'`**, which left every DM in it. It is players only now. A
DM already has a seat in their own campaign through `is_dm_player`, so offering them another
here only ever produced a mistake. An assignment that predates the filter is still shown,
marked *(not a player)*, rather than vanishing and letting Save quietly replace it.

Save is disabled until something actually changes, so a no-op press no longer looks like a
failed one.

### Added — invite links

A DM can hand someone a link that puts them in the campaign. **Players → Invite a player →
Create link**, which copies it to the clipboard. Whoever opens it sees the campaign name, picks
a username, password and character name, and lands on their sheet already logged in — or signs
in, if they already have an account, which is the case when you invite someone who plays in
another of your campaigns.

The DM chooses whether the link makes a **new seat** or fills **one that already exists**. The
second keeps whatever is already hanging off that seat — timeline entries, DM notes — and keeps
the DM's spelling of the character's name over whatever the invitee types.

**The link is a bearer credential that creates an account**, so it is treated as one:

- **256 bits of CSPRNG**, not the `hashId(id) + 4 bytes` the share links use. That pattern has
  32 bits of randomness and leaks the row id; fine for a read-only map, not for this.
- **Stored hashed.** The server keeps a sha256 of the token and never the token, so a leaked
  backup is not a stack of live invites. It also means the link genuinely cannot be shown
  again — the panel says so rather than letting a DM discover it.
- **One hour, one use.** Both enforced in SQL against the database's own clock.
- **The role is a literal `'player'`** in the INSERT. This is the only route in the app where a
  caller with no account writes to `users`, and a role read from the body would be a
  self-service admin account.
- **Revocable**, with the outstanding links listed under the button.

**Single use had to survive two people clicking at once**, which is the part that is easy to get
wrong and impossible to notice by hand. The token is consumed by an `UPDATE … WHERE id = $1 AND
used_at IS NULL`, running last inside the transaction. Conditional, because a plain `UPDATE`
still takes the row lock but the second writer simply overwrites the first and succeeds —
against a live database, **19 of 20 concurrent redemptions got through, each with its own
account**. Last, because everything that can legitimately fail — a taken username, a seat filled
in the meantime — must roll back without burning the link, and ordering is the only thing that
guarantees it.

Joining with an existing account **prefers the credentials typed into the form over the current
session**. The opposite reading seems natural and is wrong: someone logged in as A can follow a
link meant for B, and preferring the session would collect B's password, ignore it, and quietly
seat A. A live test caught that one.

### Added — print the Journal and your Diary

A **🖨 Print** button on the Campaign Journal and on a player's Diary, in all three places a
diary is shown: the PC Sheet's Diary tab, the `/diary` page's player view, and the DM reading a
player's diary. Players get it as well as the DM — the journal is theirs to read, and the server
has already decided what is in the list, so a DM-only entry is not in a player's copy to filter.

**It prints what is on screen** — the current grouping, the current search, in the order shown,
and the printout says so in its header (*"by category, matching 'key'"*) so a filtered page does
not read as the whole journal with entries mysteriously missing. Collapsed groups still print:
collapsing is a way to see past a group, not a way to exclude it, and nothing on screen suggests
otherwise. The search lives inside `GroupedEntries`, so its `toolbar` prop now also takes a
render function and hands over the filtered, grouped list; a button outside that component could
only see the unfiltered entries and would quietly print a different set from the one you are
looking at.

**Notes, not the book.** `printBook` gives each entry a page of its own with a drop cap, which is
right for a dozen long session write-ups and absurd for forty short notes — *"Found a key,
Buldamar cellars"* would get an A4 sheet to itself. These flow in two columns under their group
headings, each note kept whole where it fits, with no forced break per entry and no heading left
stranded at the foot of a page. An all-unfiled list prints with no heading at all, the same call
the screen makes.

The separate-print-window machinery moved to `data/printDoc` and is now shared rather than
copied: the reasoning for it (a lazily loaded `@page` rule becomes global after one visit and
silently changes the PC and NPC sheets' margins) was already written down once and did not need
writing twice.

### Fixed — "+ Add spell level…" printed on the stat sheet

The whole table footer is hidden now, not just the control: hiding the `<select>` alone left an
empty row with the spell table's rules drawn under the last level.

### Changed — spell suggestions are narrowed to the row's level

Typing `fire` in the 3rd-level row offers **Fireball** and nothing else. It used to offer all
seven spells with "fire" in the name — Fire Bolt (a cantrip), Fire Shield (4th), Fire Storm
(7th) — every one of which belongs to a different row on the same table.

It costs no extra request. The spells index already carries `level` on every one of its 339
rows, so the filtering is local to the copy already cached; ten rows asking for ten levels still
make one call between them. A `?level=` query per row would have made ten.

Two things it is careful about, both of which would look fine in review:

- **A cantrip is level 0.** Testing `if (!level)` instead of `if (level == null)` would silently
  turn the cantrip row back into the unfiltered list — and only there, which is the kind of bug
  that survives a demo. Guarded at both ends: the index reads `typeof r.level === 'number'`
  before storing it, and the filter compares against null explicitly.
- **It fails open.** A resource with no levels — weapon properties, damage types, conditions —
  returns everything, as does a level that matches nothing. The worst case is the long list we
  had before, never an empty dropdown on a field whose whole job is to help.

### Fixed — chips were unstyled everywhere except the NPC sheet

`TagInput` was written for the stat sheet, so all of its CSS was scoped `.npc-sheet .tag-*`. The
Item Cards form was its first caller anywhere else, and got **none** of it: bare serif chips, a
raw `ⓘ×` with no chip around them, and a default browser input — a white box with a blue focus
ring, on a dark parchment form.

The base rules now live unscoped in `globals.css` on the app's own tokens, exactly as
`.srd-combo` already did after Languages hit the same problem. The sheet keeps its parchment
versions, which still win on specificity without an `!important` anywhere.

### Fixed — three things that only showed in use

- **Escape now closes a pinned item card.** It has a backdrop and takes clicks, so it is a
  dialog in all but name and Escape is what people try. Only when pinned: the hover card is
  dismissed by moving the pointer.
- **No ⓘ beside the Item Card form's damage type.** It sat outside the field's box, and the
  lookup belongs on the card, where you are reading the item rather than editing it.
  `SrdCombobox` takes `info={false}`; every other caller still gets the button.
- **A chip's × and ⓘ no longer print.** They are controls, not content, and had been printing
  on every Defenses tag since long before spells used the same editor — ten more rows of them
  is what made it worth noticing.

### Added — a people filter on the Char Tree

One box narrowing two lists: the player chips and the cross-connection rows, which is the one
that gets long. A connection matches on either end, because "show me everything touching
Grathul" is the question being asked. Accent-folded like every other search here.

It does **not** hide anyone from the tree — the eye on each chip owns that. Conflating "I cannot
find this person" with "this person is not in the tree" would make a filter destructive.

Four lists in that component were `data?.x ?? []`, producing a fresh array every render and
defeating every `useMemo` below them. They now share one stable empty array.


### Added — one search box over the whole campaign (DM only)

**🔍 Search**, a tab in Manage Campaigns between Journal and Settings. It covers the journal, the
campaign diary, every player diary, locations, NPCs, timeline events, character sheets, the DM's
own notes, and the item cards actually in play — nine sources, grouped and collapsible, with the
matched run marked in a line of context.

It answers *where did I write about Grathul?* The per-module boxes in the Diary and the Journal
stay, because filtering a list you are already reading is a different act from finding something
you cannot.

It lives in the module rather than the header for two reasons: the campaign is already chosen
there, so the tab has nothing to ask; and a global control only a DM may use is one most of the
table would be shown and then refused.

**DM only**, and the route refuses a player rather than filtering for them. Half of what it reads
is withheld elsewhere — DM-only journal entries, diary drafts, `private_info`, hidden locations,
every NPC — and teaching one query seven withholding rules is how a leak gets written.

**Matching is in Node, not SQL**, which is the decision worth recording. `ILIKE '%thea%'` does
not find *Théa*, and folding accents in Postgres needs the `unaccent` extension — a
`CREATE EXTENSION` a self-hosted install cannot assume it may run. Verified live: searching
`thea` finds all seven seeded sources, each of which spells it *Théa*, and searching `théa`
returns exactly the same seven.

Items search the cards granted **in this campaign**, joined through `inventory_items`, not the
DM's whole library — `item_cards` is keyed to a user. Their HTML abilities are read as text, so
searching "span" finds nothing.

### Changed — search results are read inside the search

Clicking a result used to navigate away, which was wrong twice over: it closed the search you
had just run, and it landed you on the *module* rather than on the thing, because nothing in
this app can be deep-linked to a single entry.

A result now opens in a reading pane in the same modal — title, metadata, and the body rendered
as what it actually is: markdown for journal and diary entries, the card editor's sanitised HTML
for an item's abilities, and plain text for everything else, because a DM note containing `*` is
not emphasis.

**`[[Name]]` links inside a result resolve and are clickable, and following one opens that thing
in the same pane.** Back walks the stack. That is what turns the search from a list you consume
once into something you can browse — find a journal entry, follow it to the location it names,
come back, carry on.

**Open in the module ↗** is still there for when you actually want to edit.

A second route, `GET /api/campaigns/:id/search/:kind/:id`, fetches the one row rather than
attaching every body to the list — nine groups of twenty-five with their bodies would have been
most of the campaign. It re-checks DM ownership rather than trusting the list it came from, and
every lookup is scoped **by campaign as well as by id**, so a valid id belonging to another DM's
campaign returns 404 rather than their note. Verified live in both directions.

### Added — search terms stay marked after you open a result

Finding the entry was half the job; finding the sentence inside a long session
write-up was the other half, and scrolling one hunting for the word you searched for is exactly
what the excerpt was meant to save you. Every term is now marked in the title, the flavour line,
the body and each section of a character sheet — and in all three body formats.

**Marking walks text nodes, never the HTML string.** A search for "div" must mark the word, not
rewrite the tags, so the markdown and item-card paths render first and then wrap matches using
the DOM API, building `<mark>` elements and setting `.textContent`. Nothing is re-parsed as
HTML. For markdown this means `Markdown` takes a `highlight` prop and fills the node from an
effect rather than via `dangerouslySetInnerHTML`, so React and the effect are never writing the
same node — which is how a mark ends up nested inside a mark. Every other caller of `Markdown`
is on the unchanged path.

**The offset arithmetic is the part that needed care.** Folding accents does not preserve
length: `é` is one character, but text pasted out of some editors arrives already decomposed as
`e` + U+0301, which folds to one — and every offset after it is then wrong by one.
`foldWithMap` folds character by character and records where each folded character came from, so
a match found in the folded string maps back exactly. 17 tests, including the decomposed case a
naive fold gets wrong.

The list excerpt now uses the same splitter. The server still chooses the window — it is the
only side holding the whole field — but the marking happens client-side, so the list and the
reading pane agree, **every** term is marked rather than only the first, and nothing depends on
an offset surviving a fold.

### Fixed — the search tab's sizing was left over from the modal

Two things only showed once it stopped being a modal and had a whole tab to fill:

**A result stopped mid-screen.** The reading pane carried `max-h-[22rem] overflow-y-auto`, sized
to fit inside a modal. In a tab that nested a second scrollbar inside the tab's own and cut a
long journal entry off part-way down. Both caps are gone; the tab body already scrolls.

**Results now flow into columns** — one, two or three by width — so a campaign's worth of hits
fits on a screen instead of running past the fold. CSS columns rather than a grid, because
groups are different heights and columns pack them without leaving a row's worth of empty space
under the short ones; `break-inside-avoid` keeps each group whole, so a heading never lands in
one column with its hits in the next. The toolbar and the empty states stay full width.

### Changed — search groups collapse

Individually or all at once, the same way the diary's groups do, with collapsed tracked rather
than expanded so a group that appears after a collapse is open rather than silently hidden.

### Fixed — accent folding was written with invisible characters

Every copy of the fold — `searchEntries.js`, `crossLinks.js`, `wikiLinkInput.js`,
`downloadBundle.js` and the new server one — had the combining-mark range written as **literal
U+0300–U+036F characters** rather than the `\u0300-\u036f` escape. Behaviourally identical, and
it worked; but they are invisible in an editor and one Unicode-normalising tool or a careless
copy-paste would have silently removed accent-insensitivity across search, cross-links and
export filenames at once. All six now use the escape.

Found by a test asserting the server's fold matches the client's, which could not be written
until both were spelled the same way.


### Security — session fixation, a wildcard postMessage, and one password floor

**Logging in now issues a new session id.** `POST /api/auth/login` assigned `userId` onto
whatever session the visitor arrived with. Since `saveUninitialized: true` hands every anonymous
visitor a cookie, anyone able to set one on this origin could plant a session id, wait for the
victim to log in, and then hold a cookie authenticated as them. `req.session.regenerate()` now
runs after the password check and before the identity is written.

Run against the old code first, to watch it work: attacker plants a cookie, victim logs in
carrying it, attacker replays it — **`LOGGED IN AS dm1`**. Against the new code, `anonymous`.

Two orderings matter and both are pinned by tests. The identity must be written *after*
regeneration, or it lands on the session being discarded. And `cookie.maxAge` must be set after
it too, because regeneration resets the cookie to the store default — otherwise "remember me"
silently becomes 24 hours. Verified live at 30.0 days.

**The stat-sheet bridge names its origin.** The PC Sheet embeds the NPC Sheet in an iframe and
the two talked with `postMessage(…, '*')` on every send, with no `e.origin` check on either
receiver. A whole character's stat block crosses that bridge in both directions, and `'*'` means
"give it to whatever document is in that frame". Both sides now name `window.location.origin`
and ignore anything else. The iframe's reply to `COLLECT_STATS` names our own origin rather than
echoing `e.origin`, so weakening the guard cannot quietly turn it into a send to whoever asked.

Pinning costs nothing here precisely because the iframe's `src` is a route of this same app —
which is what made leaving it as `'*'` indefensible rather than a trade-off.

**One password floor, and it was worse than recorded.** `TODO.md` noted that
`change-password` accepts 4 characters. It did — but `POST /api/users` and
`PUT /api/users/:id/password`, both admin, accepted **any non-empty string**, so a
one-character password was reachable by the person most likely to be setting them for other
people. Meanwhile `scripts/create-admin.js` has demanded 8 all along: the project was
contradicting itself rather than choosing a low bar.

`PASSWORD_MIN = 8` and a single `passwordError()` now cover all three, and the three UI forms
mirror it so nobody spends a round trip to be told. **Existing passwords are untouched** —
nothing re-checks a stored hash, so a user whose password is two characters still logs in
(verified) and meets the floor the next time they change it.

The new test walks the route table for anything calling `bcrypt.hash` on request data without
the check, rather than naming today's three — a fourth route shipping unguarded is the failure
that matters, and a fixed list would pass forever while it happened.

### Still open, deliberately

- **Tailwind 4.** The five build-time advisories have no patched release and `npm audit
  --omit=dev` reports **0** — they are devDependencies that never reach a browser. A migration
  to schedule, not a fix to apply.
- **The `postcss-selector-parser` override.** Still a deliberate semver violation, still
  working, still the first thing to drop if a Tailwind patch builds oddly.

### Verified

**25 new tests**, 892 in all. Every guard proved able to fail: the regeneration moved after the
identity write, `'*'` restored on one send, an origin check deleted, and the floor removed from
the admin reset route.


### Changed — a share link now needs a logged-in member of the campaign

All five token-gated surfaces — journey map, timeline, PC sheet, diary and its roster — took a
token and nothing else, so anyone holding the URL could read the content. They now also require
a logged-in member of that campaign: **401 `LOGIN_REQUIRED`** anonymous, **403
`NOT_YOUR_CAMPAIGN`** for someone signed in elsewhere. The token still names the thing and
revocation still works; it stopped being the only thing between a campaign and a stranger.

One helper, `shareGate`, called from all five, over the `canAccessCampaign` that already carries
the DM/admin arm and the trash guard. It runs **after** the token lookup, never before, so a
revoked link still answers 404 rather than sending someone to log in for something that no
longer exists.

**`campaignAuth.test.js` was excluded from looking at these routes**, which is how the only five
anyone on the internet could read ended up being the five the ownership walk skipped. `:token`
now counts as an id, and a token route must call `shareGate` by name.

That walk also had a quieter fault: it sliced each handler's body up to the *next* route
registration, so any helper defined between two routes was credited to the earlier one. Deleting
the guard from `/api/timeline-public/:token` left the suite green, satisfied by an `ownsPlayer`
that belonged to the code after it. It now stops at the handler's own closing brace, and
removing any of the five gates fails it.

`pc-public` is worth knowing about: its token is `hashId(playerId)`, a pure function of the row
id with no share table behind it, so it has never been revocable. This gate is the only
restriction it has ever actually had.

**Logging in brings you back.** There was no login route at all — the modal lives on the home
page and `/?login=1` discarded wherever you were. A share page now sends `?login=1&next=<path>`
and lands you on the page you asked for. `next` is validated as a same-origin relative path
before use: `//evil.example`, `http://evil.example`, `/\evil` and anything carrying a control
character are refused, because an unchecked `next` turns our own login screen into a redirect to
someone else's.

**Three failures, told apart.** `useAsync` discarded the HTTP status (`setError(e.message)`), so
no page could tell a 401 from a 404 — which is why the map page rendered every failure as one
line of text. It now also returns `errorInfo` with `{ status, code }`, as a second value rather
than by changing `error`'s type, since every caller renders `error` straight into JSX.

### Added — `[[Name]]` cross-links

Prose in the Diary and the Campaign Journal takes Obsidian's syntax, so notes paste between the
two: `[[Buldamar]]`, `[[npc:Grathul]]` when a place and a person share a name, and
`[[Buldamar|the festival town]]` for different display text. Matching ignores case and accents,
so `[[thea]]` finds *Théa* — which is how these names actually get typed.

**Type `[[` and the campaign's locations and NPCs are offered.** The dropdown is anchored to the
bottom of the field rather than to the caret: caret-anchoring inside a textarea needs a hidden
mirror div cloning its computed styles, which is a hundred fiddly lines that must survive three
themes and a scrolled field, for a difference the field is rarely tall enough to show. It can be
upgraded later without touching anything else.

**A link opens a popover**, not a page — there is no location page, and the in-app Journey Map
is DM-only. Name, description, pin image, and a *Show on the map* button when that location has
a pin on a shared map. An NPC popover is a name and little else, because `campaign_npcs` is a
name and nothing else; the branch is wired for the day that changes.

**An unresolved name renders as plain text, not a broken link** — which is also what a player
sees for a location the DM has hidden and for any NPC at all. That leaks nothing: the name is in
the sentence either way, so the only thing withheld is whether clicking does something.

**The safety argument.** `renderMarkdown.js` states that every rule puts user text in element
content, with the single exception of a link's href, and warns against adding syntax that puts
it anywhere else — its escape pass does not cover quotes. So the name never reaches an
attribute: `data-xlink` carries `kind:id`, a number this code produced, and the name stays in
element content like everything else. A test sweeps every emitted tag for an `on*=` handler.

The index behind it (`GET /api/campaigns/:id/link-targets`) is role-filtered in SQL and selects
an explicit column list — `campaign_locations.image_data` is a base64 pin image, and `SELECT *`
would have pulled every one of them into a fetch whose job is to offer six suggestions. Measured
live: 270 bytes for a campaign holding a 4 KB pin image.

`placeCard` moved from `InventoryTab.jsx` to `data/placeCard.js` so the popover can reuse its
flip-at-the-viewport-edge logic without importing a page component.

### Verified

**79 new tests**, 867 in all. Live against a scratch Postgres: all five share links answer 401
anonymous, 403 to a non-member and 200 to a member and the DM; a revoked map token still answers
404 to a member rather than 403; `pc-public` no longer returns the `campaign_id` it fetches for
the gate; and a player's link index omits a hidden location entirely and contains no NPCs.

Each guard was proved able to fail — the five gates removed one at a time, the `is_public`
filter and the NPC withholding dropped, and the name forced into an attribute.

---


### Fixed — a shared journey map stopped working the moment the DM pressed Share again

`POST /api/journey-maps/:id/share` minted a fresh token on every call and upserted over the old
one. Pressing Share a second time — which is mostly what Share is *for*, re-copying the URL —
silently orphaned every link already pasted into Discord. The players' next click returned a 404
reading *"Map not found"*, which points at the map rather than at the link, so the obvious thing
to go and check was the one thing that was fine.

Every other share token in the app was already stable (the diary's, a timeline's, the campaign
timeline's); this one was the exception. It now returns the existing token, with a separate
`DELETE …/share` for revocation so losing a link stays a deliberate act. The dead-link 404 says
so in words and carries `code: 'SHARE_REVOKED'`.

Reproduced on the old code before fixing it — two Shares, two different tokens, the first link
404 — and `test/shareTokens.test.js` now holds all five share routes to the same rule: SELECT the
existing row before INSERT, and do not even generate randomness until that check has passed.

### Added — 🔗 Campaign Links, a tab on the PC Sheet

Everything the DM has shared with the table, in one column: the public journey maps and the
shared timelines, each a real `<a>` to a read-only page that works without a session.

It exists because there was nowhere else to put a share link. The in-app Journey Map is DM-only,
so a player's only route to a map was a URL someone had pasted somewhere — and the bug above
was quietly invalidating those.

**A row appears only because a share token exists for it.** Every list is an INNER JOIN onto its
shares table, never a left join with the token nulled out, so an unshared map cannot leak its
name or the fact that it exists. The handler deliberately does not branch on role: the DM sees
exactly the same list, because the tab answers *what has the table been given*, not *what is
there*.

An **NPCs** section is prepared and returns empty. `campaign_npcs` has no visibility column, so
listing them today would mean either showing players every NPC the DM has ever named or
inventing a visibility model in passing; the tab renders the section only when the server
returns one, so filling it later is a server change and nothing else.

Verified live: a second, unshared map named *"SECRET — the Ultheon approach"* appears nowhere in
a player's response; a non-member gets 403; and every path handed to the player resolves 200.

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
