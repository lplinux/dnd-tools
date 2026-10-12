# 🧝 PC Character Sheet

A full character sheet for Player Characters, stored in the database and accessible by both the player and the DM. The sheet is organised into tabs, each covering a different aspect of the character. DMs have additional tabs not visible to players.

**Access:** DM, Player — `/pc-sheet`

---

## Getting started

1. Log in and open `/pc-sheet`
2. Select a **Campaign** from the header dropdown
3. Select a **Player** from the second dropdown

The sheet loads immediately. All changes are saved per-section with the **💾 Save** button in each tab.

> **DMs** can view and edit any player's sheet in any of their campaigns. **Players** can only see and edit their own character.

---

## Tabs

### ⚔️ Character

| Field | Description |
|---|---|
| Character Name | The character's full name |
| Portrait | Upload an image file (JPEG/PNG/GIF/WebP, max 500 KB) or enter a URL |
| Story | Free-text backstory |
| Traits | Personality traits |
| Flaws | Character flaws |
| Goals | Goals and motivations |

**Portrait upload** stores the image as base64 in the database. Once uploaded, the URL field is ignored.

---

### 🎲 Stats Sheet

An embedded NPC Sheet form used as a D&D 5e stat block. Tracks ability scores, HP, AC, speed, skills, attacks, spell slots, and more. See [NPC Sheet documentation](../npc-sheet/README.md) for all fields.

**HP in play.** Current HP is typed straight into the stats bar — that is the only place it can
be changed, so a hit costs no clicks and the number cannot be set in two places. Temporary HP
floats beside the HP label in blue, only while there is some; click it to change it. **⟳**
clears every temporary value and heals to full; **✎** opens the dialog for max and temporary
values.

**The stat boxes overwrite.** Click into current HP, AC, Speed or an ability score and the box
empties, with the old value left as a grey hint behind what you type. Leaving without typing
puts it back.

#### Spells and cantrips

The spell table has **one text input per spell level**, so each `spell_names` entry is a single
**comma-separated string** — not an array.

| Key | Holds |
|---|---|
| `"0"` | **Cantrips.** This row is always shown, for every caster, at every level |
| `"1"`–`"9"` | Spells for that level |

A level is shown when it has spell slots **or** already has an entry. Levels with no slots show `∞`
in the Slots column (cantrips, and spells a caster knows but has no matching slot for — a warlock's
1st/2nd-level spells, since Pact Magic slots are all one level). Use **+ Add spell level…** beneath
the table to bring back a level that has no slots.

```json
"spell_names": {
  "0": "Guidance, Sacred Flame, Spare the Dying, Light, Toll the Dead",
  "1": "Bless, Healing Word, Inflict Wounds, Guiding Bolt",
  "2": "Aid, Spiritual Weapon, Lesser Restoration",
  "3": "Spirit Guardians"
},
"used_slots": { "1": [0, 1], "3": [] }
```

Spell slots are computed from `caster_type` + `level` and are never stored. `used_slots` records
only which boxes are ticked off, as zero-based indices into that level's slots.

---

### 🌳 Relationships

A relationship tracker with two views:

- **List view** — a single horizontal strip of relationship chips, grouped by type and scrolling
  sideways, so it stays one line tall however many relations there are
- **➕ Add Relation** — directly below the list, above the graph
- **Graph view** — SVG diagram separating family (left) from social (right) connections. Re-renders automatically when the tab is opened or the panel is resized.

#### Relationship types

| Type | Branch |
|---|---|
| Grandparent, Parent, Sibling, Child, Grandchild | Family |
| Mentor, Ally, Friend, Rival, Enemy, Other | Social |

---

### 🎒 Inventory

Two lists, and the split is the whole design.

**Granted items** are magic items the DM assigned from their **Item Cards** library. The card is a
reusable *template*; the row in an inventory is its one *instance*. An item card can be used in
any number of campaigns but **only once within a campaign** — grant the Sword of Kas in Leruhy and
it cannot be granted again there until it is removed, though the same card is still free to appear
in a different campaign. There is no quantity: these are artifacts, not stock.

| | Player | DM |
|---|---|---|
| Grant a card | — | ✅ (from their own library) |
| Equip / annotate | ✅ | ✅ |
| Rename or restack | — (the name belongs to the card) | via the Item Cards module |
| Give to another character | ✅ | ✅ |
| Remove from the inventory | — | ✅ |

**Carried gear** is everything else: rope, rations, coin, potions. Free-text rows the player owns
and manages, and the only kind with a **quantity**. Consumables live here deliberately — authoring
an item card for a flask of oil is busywork, and stacks would break the one-per-campaign rule that
makes a granted artifact meaningful. **＋ Add** offers a **Load from SRD** search that fills the
name, weight and a cost/description line from the published equipment list.

**Four panels.** Every row sits in one of **Treasure**, **Potions & Poisons**, **Inventory** or
**Miscellaneous**, chosen when you add it and changeable at any time — either from the *Panel*
selector in the edit dialog, or by **dragging the ⠿ handle** onto another panel. The drag is
pointer-based, so it works with a finger as well as a mouse.

**Treasure opens with a coin purse** — platinum, gold, silver and copper, saved when you click
away from the field. Coins weigh something: 5e puts fifty to the pound, so a thousand gold pieces
is twenty pounds and shows up in your carry total.

**Consumables cannot be equipped.** Anything in Potions & Poisons has no equip checkbox — a
potion is used, not worn. Moving an equipped item into that panel unequips it. This is *orthogonal* to
where the item came from: a granted potion is still granted (◆, DM-removable only) but lives
under Potions. Each panel totals its own weight.

**Carry weight.** Each row can carry a weight in pounds, and the header totals `weight × quantity`
across **everything in the inventory** — not just what is equipped. The maximum is **STR × 15**
(the 5e rule, read from the Stats Sheet) and is not editable: a second, hand-set copy of a derived
number is only a way for the two to disagree. Going over turns the total red. Items with no weight
set are counted separately rather than treated as weightless, so the total never quietly
understates what the character is carrying.

**Attunement follows equipping.** Equip an item that requires attunement and it becomes attuned;
unequip it and it stops being attuned. The ◇/◈ badge remains clickable as an **override**, because
5e lets you attune something you are not currently wielding — a rod in your pack, say. The
automatic rule fires only when the equipped state actually *changes*, so setting attunement by
hand is not undone by the next unrelated edit.

For a granted item the requirement comes from its item card; for your own gear there is a
*Requires attunement* checkbox in the add/edit dialog.

**Seeing an item.** Every row carries a marker — **◆** for an item the DM granted, **ⓘ** for your
own gear. Hover it for a preview, or tap it on a touchscreen to pin the panel open until you
dismiss it. A granted item shows the actual item card, identical to the one the Item Cards module
prints; anything else shows its quantity, weight and full description, which the one-line summary
in the list truncates. The names in the **Equipped** strip work the same way.

**The 5e limit of three is enforced**, not merely displayed. At three attuned items the equip
checkbox and the badge are disabled on any *other* item that needs attunement, and the server
refuses the change with a conflict if it is attempted anyway. The limit is about attunement
only — with three rings attuned you can still equip a sword, armour or a torch.

> The printed sheet's named slots (Head, Back, Neck, …) are **not** modelled. Equipping is a
> single flag, and the Equipped strip lists what is worn or wielded rather than pinning each item
> to a slot.

**Giving.** The ↪ button hands an item to another character **in the same campaign**. It moves
immediately with no DM approval, arrives unequipped, and the row records who held it before and
when — so the DM can see what changed hands without having to police every trade. Transfers across
campaigns are refused: that would be both a continuity break and a way around the one-per-campaign
rule.

**Deleting a card that is in play.** The Item Cards module will refuse, naming the characters
holding it. Remove it from their inventories first. This is deliberate: the alternative is a
player's magic item silently disappearing because the DM tidied their library.

---

### 📢 Public Info

Shown on the character's public share page (`/pc-public/:token`) — accessible without login.

---

### 🔒 Private Info *(player and DM only)*

Private notes for the player's eyes only. Never shown on the public share page.

---

### 📔 Diary

Your own session diary, private to you. A search box filters it the same way the Journal's does. Your DM can read it; no other player can, and nobody but
you can edit or delete an entry. Entries can be filed into **categories** of your choosing
(*Session notes*, *Theories*, *People we met*…), and the list groups by them — click a group
heading to collapse it.

The DM sees this same tab on your sheet, read-only, and all players' diaries together in the
Diary module.

### 📖 Journal

The campaign's shared notebook, and the opposite of the Diary above: everyone in the campaign
writes in it and everyone reads it. Useful for the things the party collectively knows — a
document found, a name overheard, what the innkeeper said.

It reads like the Diary on purpose: compact cards grouped under headings you can collapse, click
one to read it in full. Entries are listed in **in-game date order**, oldest first, with undated
ones at the end.

A **search box** filters what you can see — any word from a title, a note, a category, a location
or an author's name, accents optional, and several words narrow it further. A **Group by**
selector beside it switches the headings between **Category**, **Location** and **Who wrote it**.

Each entry records:

- **Who wrote it** — the username, and the character they play when they play one. The DM shows
  as themselves, since they have no character.
- **Where** — picked from the campaign's locations, listed alphabetically. You are only offered
  the places you can see; if your DM later hides one, entries written there keep their text but
  stop naming the place.
- **When** — the real date it was written, and optionally an **in-game date** on the campaign's
  own calendar. The date control is a picker rather than three boxes to type in, so a day the
  month does not have is not offered: pick Midwinter and the day control disappears, because the
  festival is the whole day.
- **A category**, optional and your own words — *Documents*, *Rumours*, *People we met*. Entries
  file under it, and whatever the campaign already uses is one keystroke away.
- **The note**, written in Markdown, so lists and emphasis work.

Only the person who wrote an entry can edit it — including your DM, who cannot rewrite your
words. Your DM *can* delete an entry, so the campaign can be tidied.

**For DMs:** you also get a **DM only** checkbox. An entry marked that way is invisible to
players — it is filtered out of their request on the server, not merely hidden on their screen —
so you can stage a document in the journal before the party has found it, then untick the box
when they do. Those entries are outlined in gold so you can tell at a glance what the table
cannot see.

The same journal is also a tab in **Manage Campaigns**, which is usually the better place to run
it from: the locations an entry points at are managed two tabs away, and staging a document for
the party to find later is campaign prep rather than character work. It is the same journal, not
a copy.

### Printing the sheet

**PDF** in the header prints the whole character — story, traits, relationships, public and
private info, the DM notes you are allowed to see — and then **your diary, starting on a fresh
page**, so the sheet and the journal can be separated once printed. The diary section appears
only when there is something in it.

The **Stats Sheet** tab has its own 🖨 button, which prints the stat block alone in its parchment
design.

### 📜 DM Notes

Notes the DM keeps against a character, each with a visibility toggle:

| State | Player sees it |
|---|---|
| 👁 Visible | Yes |
| 🙈 Hidden | No |

**The DM** always has this tab, and can add notes, toggle each one's visibility, and delete them.

**A player** sees the tab only once the DM has shared at least one note, and then sees just the
shared ones, read-only — no compose box, no toggle, no delete. The API never sends a player a
hidden note, so nothing is hidden in the browser only.

---

## Export / Import

### Who can export

The file is named `character-<campaign>-<character>-<date>.json`.

| Role | What is included |
|---|---|
| DM / Admin | `scope: 'full'` — everything: `private_info`, **all** DM notes (hidden + visible) and **all** relationships |
| Player | `scope: 'player'` — their own `private_info` and the DM notes **shared with them** (`dm_visible`), so their copy matches what the sheet shows them. **Hidden DM notes and DM-only relationships are omitted entirely** |

### Who can import

**DM only.** There are two routes, both in Manage Campaigns:

- **Players tab → ⬆ Import** on a player's row — the direct route. Pick the `.json`, confirm, done;
  the target player is the row you clicked, so there is no target prompt.
- **Sidebar → ⬆ Import** (the general import hub) — accepts any of the five export types. For a
  `pc-sheet` file it asks which player to assign it to.

The PC Sheet page keeps **Export** only (its Import button was removed).

**What happens on import** depends on the bundle's `scope`, which the export
stamps according to who produced it:

| Data | `scope: 'full'` (DM export) | `scope: 'player'` (player export) |
|---|---|---|
| Character fields | Overwritten | Overwritten |
| `private_info` | Overwritten | **Ignored** — the bundle carries it, but not authoritatively |
| Relationships | **All** replaced, including hierarchy, DM-only flags and status labels | Only **non-DM-only** ones replaced — DM-only relationships are **left alone**, since the bundle does not carry them |
| Stats sheet | Overwritten | Overwritten |
| DM notes | **Replaced** — a full export contains all of them | **Ignored** — the bundle holds only the shared ones, so writing from it would delete the hidden ones |
| Portrait (base64) | Not restored — re-upload manually | Same |

This is what makes the round-trip safe. A player exporting their own sheet and
handing it back can no longer wipe the DM's private notes or DM-only
relationships, and re-importing a DM export no longer doubles the DM notes each
time.

> **Carrying a field and being authoritative for it are different things.** A
> player's export *includes* `private_info` and the shared DM notes, so the file
> they keep is a complete copy of their own sheet. The importer still ignores
> both unless `scope` is `full`, because a player-scope bundle only ever holds
> the subset a player may see — writing from it would silently drop the DM's
> hidden material. Anything a player cannot see is neither exported to them nor
> restorable from their file.

> A DM-only relationship that was the *parent* of a visible one survives a
> player-scope import, but re-parents to root — the bundle has no way to express
> a link to a node it cannot see. Bundles written before this
(`version: 1`, no `scope`) are read as player-scope — the non-destructive
reading — so they will not clear anything.

---

## JSON schema

```json
{
  "version": 2,
  "exported_at": "ISO 8601 timestamp",
  "type": "pc-sheet",
  "scope": "'full' (DM export) | 'player' (player export)",

  "player_name": "string — informational only, not used on import",

  "character": {
    "name":         "string",
    "picture_url":  "string — external URL only; base64 is never exported",
    "story":        "string",
    "traits":       "string",
    "flaws":        "string",
    "goals":        "string",
    "public_info":  "string",
    "private_info": "string — omitted from player exports"
  },

  "relationships": [
    {
      "name":          "string — required",
      "relation_type": "Grandparent | Parent | Sibling | Child | Grandchild | Mentor | Ally | Friend | Rival | Enemy | Other",
      "link":          "string — optional URL or reference",
      "is_family":     "boolean"
    }
  ],

  "stats": {
    "char_name":     "string",
    "char_class":    "string",
    "subclass":      "string",
    "race":          "string",
    "sex":           "string",
    "alignment":     "string",
    "level":         "string or number",
    "cr":            "string — leave blank for PCs",
    "caster_type":   "none | full | half | third | warlock",
    "spell_ability": "int | wis | cha",
    "slot_reset":    "Long Rest | Short Rest",

    "hp":          "string or number — CURRENT hit points",
    "max_hp":      "string or number — maximum hit points",
    "temp_hp":     "string or number — temporary hit points, blank when unused",
    "temp_max_hp": "string or number — change to the maximum, blank when unused",
    "ac":     "string or number",
    "speed":  "string",
    "senses": "string",
    "langs":  "string",

    "abilities": {
      "str": { "score": "number", "st_prof": "boolean" },
      "dex": { "score": "number", "st_prof": "boolean" },
      "con": { "score": "number", "st_prof": "boolean" },
      "int": { "score": "number", "st_prof": "boolean" },
      "wis": { "score": "number", "st_prof": "boolean" },
      "cha": { "score": "number", "st_prof": "boolean" }
    },

    "skill_profs": {
      "Acrobatics":      "0 | 1 | 2",
      "Animal Handling": "0 | 1 | 2",
      "Arcana":          "0 | 1 | 2",
      "Athletics":       "0 | 1 | 2",
      "Deception":       "0 | 1 | 2",
      "History":         "0 | 1 | 2",
      "Insight":         "0 | 1 | 2",
      "Intimidation":    "0 | 1 | 2",
      "Investigation":   "0 | 1 | 2",
      "Medicine":        "0 | 1 | 2",
      "Nature":          "0 | 1 | 2",
      "Perception":      "0 | 1 | 2",
      "Performance":     "0 | 1 | 2",
      "Persuasion":      "0 | 1 | 2",
      "Religion":        "0 | 1 | 2",
      "Sleight of Hand": "0 | 1 | 2",
      "Stealth":         "0 | 1 | 2",
      "Survival":        "0 | 1 | 2"
    },

    "tags": {
      "resist":     ["string"],
      "immune":     ["string"],
      "vuln":       ["string"],
      "condimmune": ["string"],
      "damagetype": ["string"]
    },

    "personality":       "string",
    "spec_traits":       "string",
    "features":          "string",
    "equipment":         "string",
    "actions":           "string",
    "bonus_actions":     "string",
    "legendary_res":     "[boolean, boolean, boolean, boolean, boolean]",
    "leg_actions":       "string",
    "lair_actions":      "string",
    "special_abilities": "string",
    "dm_notes":          "string — stat-block inline note, separate from the DM Notes tab",

    "spell_names": {
      "0": "string — CANTRIPS. Comma-separated, e.g. \"Fire Bolt, Mage Hand\"",
      "1": "string — comma-separated spell names for this level",
      "2": "string",
      "3": "string",
      "4": "string",
      "5": "string",
      "6": "string",
      "7": "string",
      "8": "string",
      "9": "string"
    },

    "used_slots": {
      "1": "[number] — indices of spent slots at this level, e.g. [0, 2]",
      "9": "[number]"
    }
  },

  "dm_notes": [
    {
      "content":    "string — required",
      "dm_visible": "boolean — true = player can see this note"
    }
  ]
}
```

---

## Full example

```json
{
  "version": 2,
  "exported_at": "2025-03-14T10:00:00.000Z",
  "type": "pc-sheet",
  "scope": "full",
  "player_name": "Thorn Ashwick",

  "character": {
    "name": "Thorn Ashwick",
    "picture_url": "https://i.imgur.com/XZQ8Jk2.png",
    "story": "A former Neverwinter City Watch sergeant, discharged after refusing orders during the Harbour District purge. Drifted south as a caravan guard before a chance meeting with Gundren Rockseeker set him on the road to Phandalin.",
    "traits": "Honest to a fault. Speaks plainly and expects the same from others. Polishes his shield when anxious.",
    "flaws": "Cannot trust authority figures, assuming corruption until proven otherwise. Carries survivor's guilt from a bandit ambush that killed two guards under his command.",
    "goals": "Find the person who sold his patrol route to the bandits. Clear his name with the Neverwinter Watch.",
    "public_info": "A grizzled veteran with a scar from eyebrow to jaw. Carries a battered kite shield bearing a faded Neverwinter emblem.",
    "private_info": "Suspects Halia Thornton is in contact with his former commander, Captain Veldris. Has not told the party."
  },

  "relationships": [
    { "name": "Jorin Ashwick",     "relation_type": "Parent",  "link": "", "is_family": true  },
    { "name": "Sera Ashwick",      "relation_type": "Sibling", "link": "", "is_family": true  },
    { "name": "Sildar Hallwinter", "relation_type": "Mentor",  "link": "", "is_family": false },
    { "name": "Gundren Rockseeker","relation_type": "Ally",    "link": "", "is_family": false },
    { "name": "Captain Veldris",   "relation_type": "Enemy",   "link": "", "is_family": false },
    { "name": "Halia Thornton",    "relation_type": "Rival",   "link": "", "is_family": false }
  ],

  "stats": {
    "char_name":  "Thorn Ashwick",
    "char_class": "Fighter",
    "subclass":   "Battle Master",
    "race":       "Human (Variant)",
    "sex":        "Male",
    "alignment":  "Lawful Neutral",
    "level":      "5",
    "cr":         "",
    "caster_type":   "none",
    "spell_ability": "",
    "slot_reset":    "Long Rest",

    "hp": "45", "ac": "17", "speed": "30 ft.",
    "senses": "Passive Perception 13",
    "langs":  "Common, Elvish (basic)",

    "abilities": {
      "str": { "score": 17, "st_prof": true  },
      "dex": { "score": 12, "st_prof": false },
      "con": { "score": 15, "st_prof": true  },
      "int": { "score": 10, "st_prof": false },
      "wis": { "score": 12, "st_prof": false },
      "cha": { "score":  9, "st_prof": false }
    },

    "skill_profs": {
      "Acrobatics": 0, "Animal Handling": 0, "Arcana": 0,
      "Athletics": 2, "Deception": 0, "History": 1,
      "Insight": 1, "Intimidation": 1, "Investigation": 0,
      "Medicine": 0, "Nature": 0, "Perception": 1,
      "Performance": 0, "Persuasion": 0, "Religion": 0,
      "Sleight of Hand": 0, "Stealth": 0, "Survival": 1
    },

    "tags": {
      "resist": [], "immune": [], "vuln": [],
      "condimmune": [], "damagetype": []
    },

    "personality":   "Direct and no-nonsense. Dislikes small talk.",
    "spec_traits":   "Second Wind (1/short rest, 1d10+5 HP)\nAction Surge (1/short rest)\nBattle Master: 5d8 superiority dice\nManoeuvres: Riposte, Disarming Strike, Rally, Precision Attack, Menacing Attack",
    "features":      "Fighting Style: Defence (+1 AC in armour)\nExtra Attack (2 per Attack action)\nAlert (feat): +5 initiative, cannot be surprised\nTough (feat): +10 max HP",
    "equipment":     "Chain Mail +1, Kite Shield, Longsword, 2× Hand Axe, Explorer's Pack, 38 gp",
    "actions":       "Longsword: +6 to hit, 1d8+3 slashing (versatile 1d10+3)\nHand Axe (thrown): +6 to hit, range 20/60, 1d6+3 slashing",
    "bonus_actions": "Second Wind\nRally manoeuvre: ally gains superiority die + CHA mod as temp HP",
    "legendary_res": [false, false, false, false, false],
    "leg_actions":   "",
    "lair_actions":  "",
    "special_abilities": "Alert: +5 initiative; cannot be surprised while conscious.\nTough: +2 HP per level.",
    "dm_notes": "",
    "spell_names": {},
    "used_slots": {}
  },

  "dm_notes": [
    {
      "content": "Thorn intercepted a letter signed with a broken wax seal — handwriting matches Glasstaff. Connects his backstory to the Redbrand plot. Reveal in Session 4 or 5.",
      "dm_visible": false
    },
    {
      "content": "Disadvantage on Charisma checks against Neverwinter Watch members due to his discharge record.",
      "dm_visible": true
    },
    {
      "content": "If Thorn faces Captain Veldris in combat: DC 14 Wisdom save or Frightened for 1 round.",
      "dm_visible": false
    }
  ]
}
```

---

## API reference

| Method | Endpoint | Role | Description |
|---|---|---|---|
| `GET` | `/api/pc/:playerId` | auth | Load full sheet data |
| `PUT` | `/api/pc/:playerId` | auth | Save narrative sections |
| `POST` | `/api/pc/:playerId/portrait` | auth | Upload portrait image |
| `PUT` | `/api/pc/:playerId/stats` | auth | Save stats sheet |
| `GET` | `/api/pc/:playerId/stats` | auth | Load stats sheet |
| `GET` | `/api/pc/:playerId/relationships` | auth | List relationships |
| `POST` | `/api/pc/:playerId/relationships` | auth | Add a relationship |
| `DELETE` | `/api/pc/:playerId/relationships/:rid` | auth | Delete a relationship |
| `GET` | `/api/pc/:playerId/dm-notes` | auth | List DM notes (visibility-filtered for players) |
| `POST` | `/api/pc/:playerId/dm-notes` | dm | Add a DM note |
| `PUT` | `/api/pc/:playerId/dm-notes/:nid` | dm | Toggle visibility or edit |
| `DELETE` | `/api/pc/:playerId/dm-notes/:nid` | dm | Delete a DM note |
| `GET` | `/api/pc/:playerId/inventory` | auth | List the inventory; card-linked rows carry the card's fields inline as `card_*` |
| `POST` | `/api/pc/:playerId/inventory` | auth | Add a free-text row. Never creates a card-linked one |
| `PUT` | `/api/pc/:playerId/inventory/:iid` | auth | Edit. Name and quantity are ignored for a card-linked row |
| `DELETE` | `/api/pc/:playerId/inventory/:iid` | auth | Delete. Card-linked rows are DM-only |
| `POST` | `/api/pc/:playerId/inventory/assign` | dm | Grant one of your item cards. `409` if already in this campaign |
| `POST` | `/api/pc/:playerId/inventory/:iid/give` | auth | Hand the item to another character in the same campaign |
| `GET` | `/api/pc/:playerId/export` | auth | Export sheet (visibility rules apply per role) |
| `POST` | `/api/pc/:playerId/import` | dm | Import sheet from JSON |
| `GET` | `/api/pc/:playerId/public-token` | auth | Get or create the public share token |
| `GET` | `/api/pc-public/:token` | public | Load public-facing sheet data |
| `GET` | `/api/campaigns/:campaignId/journal` | member | Journal entries (DM-only ones filtered out for players) |
| `POST` | `/api/campaigns/:campaignId/journal` | member | Write an entry (`dm_only` honoured only from the DM) |
| `PUT` | `/api/campaigns/:campaignId/journal/:entryId` | author | Edit — the author only, never the DM |
| `DELETE` | `/api/campaigns/:campaignId/journal/:entryId` | author or DM | Delete an entry |

---

## Data model

```
campaign_players
  id, campaign_id, player_name, is_dm_player (bool)

pc_characters
  id, player_id → campaign_players.id
  name, picture_url, picture_data (base64), story, traits,
  flaws, goals, public_info, private_info, updated_at

pc_char_stats
  player_id → campaign_players.id  (unique)
  stats_json JSONB, updated_at

pc_relationships
  id, character_id → pc_characters.id
  name, relation_type, link, is_family (bool), created_at
  is_dm_only (bool)        -- hidden from the player-facing view
  created_by_role          -- 'player' | 'dm'
  parent_id → self         -- family-tree nesting
  status_label             -- Alive / Dead / Deceased / Missing / Unknown

pc_dm_notes
  id, character_id → pc_characters.id
  content, dm_visible (bool), created_at

-- NOTE: there is no pc_public_tokens table. Public share tokens are stateless:
-- GET /api/pc/:playerId/public-token returns an HMAC of the id (hashId), and
-- /api/pc-public/:token reverses it with unhashId. Nothing is persisted.
```
