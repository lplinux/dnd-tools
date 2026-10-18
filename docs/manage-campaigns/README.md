# 🏰 Manage Campaigns

The campaign manager is the control centre for everything in the app. Before using the Timeline, PC Sheet, or Journey Map, a DM must create a campaign here and configure it with players and locations.

**Access:** DM, Admin — `/manage-campaigns`

---

## Overview

The page has a two-panel layout. The left panel lists all campaigns and contains the **Create Campaign** form. The right panel shows the full detail for whichever campaign is selected, under the tabs **Players · Locations · NPCs · Timelines · Char Tree · Journal · Settings**.

---

## Creating a campaign

Fill in the form at the top of the left panel:

| Field | Required | Notes |
|---|---|---|
| Name | Yes | Shown across all modules |
| Description | No | Free-text reminder for the DM |
| Calendar Type | Yes | **Cannot be changed after creation** |

### Calendar types

| Option | Use when |
|---|---|
| Harptos (D&D / Faerûn) | Running a Forgotten Realms campaign (12 × 30-day months + 5 festival days) |
| Gregorian | Running a historical, modern, or homebrew campaign with a standard calendar |

Click **Create Campaign** — the new campaign is immediately selected and its detail panel opens on the right.

---

## Players

Players appear on the Timeline and PC Sheet. Each player entry has two parts:

- **Character name** — the name shown on timelines, maps, and PC sheets (e.g. *Thorn Ashwick*)
- **User account** (optional) — the app user account this character belongs to; when linked, that user can log in and see their own timeline and PC sheet

### Adding a player

1. Type the character name in the **Name** field
2. Optionally select a user account from the dropdown (only accounts with the `player` role are listed)
3. Click **Add** or press Enter

### Reassigning a player to a different user

Use the **Reassign** dropdown in each player row to change (or unset) the linked user account, then click **Save**. The dropdown lists all player-role accounts except the currently logged-in DM.

### Removing a player

Click **Delete** next to the player row. Deletion is blocked if the player has timeline entries — remove those first. The button permanently removes the player and **all their associated data** — PC sheet, relationships, DM notes.

---

## Locations

Locations are the named places that appear as columns on the Timeline and as pins on the Journey Map. They are shared across all tools in the campaign.

### Adding a location

Enter the location name and an optional short description, then click **Add** or press Enter. Names should be concise — they appear as column headers on the Timeline.

### Editing a location

Click **Edit** on any location row to open a modal. Change the name, parent, type, or description and click **Save**.

The modal also has a **Pin image** field: **Upload** a custom image to use as this location's Journey-Map pin (it's shrunk to a small thumbnail and applies on every map), or **Clear** it to fall back to the size/type icon. The image saves immediately (independent of the Save button).

### Deleting a location

Click **Delete**. Deletion is blocked if the location is pinned on a Journey Map or referenced in any timeline event — a message will tell you where it is in use. Once cleared from those, it can be deleted. **This cannot be undone.**

---

## NPCs

NPCs are DM-only actors that can be added to Timeline events. They are not visible to players.

### Adding NPCs

Type one or more names (comma-separated) in the input and click **Add**.

### Deleting an NPC

Click the **✕** next to an NPC name. Deletion is blocked if the NPC is currently used as an actor in any timeline event — remove it from those events first.

---

## Journal

The campaign's shared notebook — the same journal the players see on their character sheets, with
the DM-only entries included. It is here as well as there because this is the module you run a
campaign from: the locations an entry points at are managed two tabs away, and staging a document
for the party to find later is prep rather than character work.

Entries are listed in **in-game date order**, oldest first, grouped under whatever category their
author filed them under, with undated entries and unfiled ones last. Click a card to read it in
full.

The **search box** filters on any word from a title, a note, a category, a location or an
author's name — accents optional, so `thea` finds Théa — and several words narrow it further.
Filtering happens before grouping, so the counts beside each heading track what you are looking
at. **Group by** switches the headings between **Category** (the default), **Location** and
**Who wrote it**; the last two are listed alphabetically.

### Writing one

**＋ New entry** takes a title, an optional category (free text — the ones already in use are
offered as you type), an optional location, an optional in-game date, and the note itself in
Markdown.

The date control is a picker, not three boxes to type in: the day list is built from the chosen
month, so a day that month does not have cannot be selected, and the five Harptos festivals hide
the day control entirely because the festival *is* the day. Leave the year blank for no date at
all.

### DM only

Tick **DM only** and the entry never reaches a player — it is filtered out of their request on
the server rather than hidden on their screen. Those cards are outlined in gold here so you can
see at a glance what the table cannot. Untick it when the party finds the thing.

### What you can and cannot do to a player's entry

You can **delete** any entry. You cannot **edit** one you did not write: a DM should be able to
tidy the campaign without a player's own words changing behind their back. The ✎ button simply
does not appear on entries that are not yours, and the server refuses it regardless.

### Hiding a location afterwards

If you make a location private on the **Locations** tab, entries written there keep their text
but stop naming the place for players — both the name and the id go, so nobody can tell two
entries happened at the same secret place. You still see both.

---

## Search

One box over everything written down about this campaign: the journal, the campaign diary, every
player's diary, locations, NPCs, timeline events, the character sheets, your own DM notes, and
the item cards actually granted to someone.

Accents are ignored in both directions — `thea` finds *Théa* and so does `théa` — and every word
you type has to appear somewhere in a result, though not all in the same field, so
`letter vault` finds the entry whose title holds one and whose body the other.

Whatever you searched for stays **marked** — in the result list and again inside a result once
you open it, so a hit in the middle of a long session write-up does not have to be hunted for.

**Results are read here, not somewhere else.** Click one and it opens in place, with its text
and the things worth knowing about it; **← Back to results** returns you to the list, which is
still exactly as you left it. A `[[Name]]` inside a result is a link, and following one opens
*that* thing in the same pane — so you can walk from a journal entry to the location it names
and back without losing your search. **Open in the module ↗** is there for when you want to edit
rather than read.

Results flow into two or three columns on a wide window, so a campaign's worth of hits fits
on one screen. Groups collapse, individually or all at once.

It is DM-only, and the server refuses a player outright rather than filtering nine sources for
them — half of what it reads is yours alone. Players keep the search boxes inside the Diary and
the Journal, which filter lists they are already allowed to see.

---

## Today Marker

The Today Marker places a highlighted line across the full Timeline at a specific in-game date. It is the DM's way of telling the group "the party is currently here in time."

The marker is stored per campaign in the database and is visible to all users who have access to the campaign's timeline.

### Setting the marker

1. Click **📅 Set Date** in the Today Marker section
2. In the calendar picker, choose year, month (Harptos or Gregorian depending on the campaign's calendar type), and day
3. Click **Set Marker**

### Clearing the marker

Click **Clear** inside the calendar picker to remove the marker entirely.

---

## Timelines

The **Private Timelines** section at the bottom of the detail panel shows a summary of each player's private journal entries — how many entries they have and the year range covered. Click **Open Timeline →** to jump directly to that player's private view.

To create a new private timeline for a player, click **+ New** in the Players table. You will be prompted to name the timeline and then taken directly to it.

Click **📜 Open Combined Timeline →** to open the DM's combined view showing all players' timelines side by side.

---

## Deleting a campaign — the Trash

The **Move to Trash** button at the bottom of the detail panel does *not* destroy anything. It marks the campaign as trashed, which means:

- It disappears from the campaign selector in **every** module — Manage Campaigns, PC Sheet, Diary, Journey Map and Timeline.
- Its **public share links stop working**: the shared diary, the diary roster, shared timelines, the public journey map and public PC sheets all return "not found" while the campaign is in the trash. Restoring the campaign brings them back — the tokens themselves are not revoked.

Trashed campaigns appear in a **Trash** section at the bottom of the sidebar (it is hidden when the trash is empty), each with two buttons:

| Button | Effect |
|---|---|
| **Restore** | Puts the campaign back. Everything returns, including the share links. |
| **Export** | Downloads a JSON copy. Deliberately still available while trashed — this is the last chance to take a backup before deleting for good. |
| **Delete** | **Permanent.** Removes the campaign and all its data — players, locations, timeline entries, journey maps, PC sheets, DM notes and diary entries. There is no undo. |

Nothing is ever purged automatically; there is no retention timer. A campaign stays in the trash until you empty it. **Export the campaign first** if you want a copy before deleting it for good — and note the DM export still works while a campaign is in the trash, precisely so you can.

A trashed campaign is genuinely unreachable, not merely hidden: every campaign-scoped endpoint refuses it, including for the owning DM and for an admin. The only exceptions are the two exports above and the restore/delete actions themselves.

---

## API reference

All endpoints require the `dm` or `admin` role unless noted.

**Every endpoint below also verifies that you own the campaign** (or, for the few a player may
call, that you play in it) and that the campaign is not in the trash. Holding the `dm` role is
not sufficient on its own — a request for a campaign belonging to another DM returns `403`.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/campaigns` | List campaigns, excluding trashed ones (auth required) |
| `POST` | `/api/campaigns` | Create a new campaign |
| `DELETE` | `/api/campaigns/:id` | **Move a campaign to the trash** (soft delete — reversible) |
| `GET` | `/api/campaigns/trash` | List the caller's trashed campaigns |
| `POST` | `/api/campaigns/:id/restore` | Restore a trashed campaign |
| `DELETE` | `/api/campaigns/:id/purge` | **Permanently** delete a trashed campaign and all its data |
| `GET` | `/api/campaigns/:id/players` | List players in a campaign |
| `POST` | `/api/campaigns/:id/players` | Add a player |
| `PUT` | `/api/campaigns/:id/players/:pid/reassign` | Reassign or unassign a player's user account |
| `DELETE` | `/api/campaigns/:id/players/:pid` | Remove a player (blocked if timeline entries exist) |
| `GET` | `/api/campaigns/:id/locations` | List locations |
| `POST` | `/api/campaigns/:id/locations` | Add a location |
| `PUT` | `/api/campaigns/:id/locations/:lid` | Update location name/description |
| `DELETE` | `/api/campaigns/:id/locations/:lid` | Delete a location (blocked if in use on map or timeline) |
| `GET` | `/api/campaigns/:id/npcs` | List NPCs |
| `POST` | `/api/campaigns/:id/npcs` | Add one or more NPCs (comma-separated `names`) |
| `DELETE` | `/api/campaigns/:id/npcs/:nid` | Delete an NPC (blocked if used in timeline events) |
| `GET` | `/api/campaigns/:id/journal` | List journal entries (any campaign member; players never receive DM-only ones) |
| `POST` | `/api/campaigns/:id/journal` | Write an entry (any member; `dm_only` honoured only from the DM) |
| `PUT` | `/api/campaigns/:id/journal/:eid` | Edit — **the author only**, the DM included |
| `DELETE` | `/api/campaigns/:id/journal/:eid` | Delete — the author, or the campaign's DM |
| `GET` | `/api/campaigns/:id/meta` | Get campaign metadata (today marker, public token) |
| `PUT` | `/api/campaigns/:id/meta` | Update campaign metadata |
| `GET` | `/api/campaigns/:id/timelines` | Get player timeline summary |
| `POST` | `/api/player-timelines/:campaignId/:playerId` | Create a new timeline for a player |
| `GET` | `/api/campaigns/:id/export` | Export full campaign snapshot as JSON (v6) |
| `POST` | `/api/campaigns/import` | Import a campaign bundle — v6, and older bundles still load |

---

## Export / Import

### Export

Open the **Settings** tab and click **💾 Export Campaign** (under "Export / Backup"). Downloads
`campaign-<campaign>-<date>.json` (v6) containing the complete campaign state:

- Campaign name, description, calendar type, today marker
- All NPCs — name, description, public and private notes, whether the party has met them
  (`is_public`), and where they are now (`current_location_ref`)
- All locations — including hidden ones (`is_public: false`), `size_type`, custom pin **image** (`image_data`), and the full parent/child hierarchy
- All players with:
  - PC sheet (name, story, traits, flaws, goals, public/private info, portrait image as base64)
  - Full stats JSON block
  - DM notes (content + visibility flag)
  - PC relationships (including DM-only ones, with nested parent relationships)
  - All named timelines and every entry within them
- **DM timelines** — the World timeline and Private DM timeline, with all entries and participant refs (DM identity is not written to the file)
- **Party timeline events** — whole-group events (not tied to any player/timeline), exported as a top-level `party_events[]` array
- The **Campaign Journal** — every entry including DM-only ones, with its category, in-game
  day, author and the location and character it points at
- DM cross-connections from the character tree
- All Journey Maps — including background image, all pins and region polygons (with per-pin `icon_scale`), `scope_type`/`scope_location_ref`, distances, and paths with waypoints, route type, and dragged name-label positions (`label_x`/`label_y`)

> **Never exported:** campaign **invite links**. An invite is a credential rather than campaign
> content — its token is unique, its user references do not exist on the far side, and it expires
> in an hour — so carrying one would either collide or install a live credential in a second
> campaign. The same reasoning keeps the diary and map **share tokens** out.
>
> **Retired:** journey-map *trackers* and the per-NPC `path_public` flag are no longer written to the
> export. Older bundles that still contain a `trackers[]` array or `npcs[].path_public` import fine —
> those fields are ignored.

**No database IDs appear in the file.** Every cross-reference uses a symbolic `_ref` derived from the entity's name, making the bundle human-readable and portable across instances.

### Import — the single import hub

Manage Campaigns is the **one place to import** any of the app's export files. Click **⬆ Import** (in the
sidebar) and pick a `.json`; the importer **detects the file type** and routes it:

| File `type` | What happens |
|---|---|
| `campaign` | Restores a **new campaign** (full bundle; existing data untouched). |
| `journey-map` | Adds the map to the **currently selected** campaign, reusing/creating locations by name. |
| `pc-sheet` | Prompts for a **target player** in the selected campaign, then imports the sheet onto them. |
| `timeline` | Prompts for a **target player** + timeline name, then adds the timeline's events to the selected campaign (actors/locations matched by name). |
| `campaign-diary` | **Replaces** the selected campaign's diary with the file's entries. ⚠️ See below. |

> For journey-map / pc-sheet / timeline / campaign-diary files you must **select a campaign first**
> (they merge *into* it). Per-module Import buttons were removed — **Export** still lives in each
> module (Journey Map, PC Sheet, Timeline, Diary), but importing is centralised here.

> ⚠️ **`campaign-diary` is the only destructive type.** Every other import adds to what is there;
> a diary import deletes the selected campaign's existing entries and installs the file's instead,
> keeping their draft/published status. That is what stops re-importing the same file building up
> duplicates. You are told how many entries will be deleted and how many will arrive, and asked to
> confirm, before anything is touched.

### Import — the per-module shortcuts

Two files have one obvious destination, so they can also be imported from the module itself
rather than here:

- a **`pc-sheet`** file, from the **Players** tab (see below);
- a **`campaign-diary`** file, from the **Diary** page's own **⬆ Import**.

Both apply to what you are already looking at, so neither asks you to pick a target. The sidebar
hub below remains the general entry point and accepts all five types.

### Import — the per-player shortcut

A `pc-sheet` file has one obvious destination, so the **Players** tab carries its own
**⬆ Import** on each player's row. It takes the same file the sidebar hub does, but the
target is the row you clicked, so it confirms and imports in one step rather than asking
which player to assign it to. Anything that is not a `pc-sheet` export is rejected there —
use the sidebar hub for the other four types.

**Campaign-bundle import** (the `campaign` type) works exactly as before:

- All entities are created inside a single database transaction — any error rolls the entire import back cleanly
- Parent/child hierarchies (locations, relationships) are restored with a two-pass insert
- Journey map `linked_map_ref` links between maps are resolved after all maps are created
- Timeline `player_id_refs` are remapped to the new player and relationship IDs
- **DM timelines** are restored under a fresh DM player row linked to the *importing* DM's account — no DM identity from the source instance is carried over
- Cross-connections are silently skipped if either end ref cannot be resolved (e.g. a player was removed before export)
- Username → user account links are resolved against the live users table; unmatched usernames are skipped without error (player is created unlinked)
- **v2 bundles** (previous format, no `_ref` fields, no character/timeline/map data) are still accepted — the importer falls back to using `name` as the lookup key

---

## Compatibility & migrations

**Cross-version safety.** The importer only checks `type === "campaign"` — there is **no version
gate**, so an older build and a newer build both accept each other's export files. No import ever
crashes or corrupts data because of a version mismatch; the only effect is that a field the
receiving build doesn't understand is dropped.

**Older bundle → newer build — clean.** Every newer field has a default, so nothing breaks:

| Field absent in an older bundle | Imported as |
|---|---|
| `party_events[]` | none (no party events) |
| `journey_maps[].locations[].icon_scale` | `1` |
| `journey_maps[].paths[].label_x` / `label_y` | `null` (label at default midpoint) |
| `journey_maps[].scope_type` / `scope_location_ref` | `"continent"` / `null` |

**Newer bundle → older build — imports, but newer-only data is dropped.** It loads without error,
but a build that predates these fields ignores them, so the following do **not** carry across:
**party events, per-pin `icon_scale`, road name-label positions, and map scope**.
(`kind`/`route_type` and all waypoint data — `locId`/`segMiles`/`curve` — do survive.) Round-tripping
newer → older → newer therefore loses those fields.

> A newer bundle no longer contains journey-map *trackers* or NPC `path_public` at all (both retired),
> so there's nothing for an older build to drop there.

**Migrations — automatic, no manual steps.** All schema changes are additive and idempotent
(`ALTER TABLE … ADD COLUMN IF NOT EXISTS …`, and one `ALTER COLUMN … DROP NOT NULL`) and run in the
server's startup block in `app.js`. There is no separate migration tool or folder — those statements
*are* the migration record.

- **Upgrading**: just start the newer `app.js`; it self-migrates on boot.
- **Downgrading**: start the older `app.js` against the already-migrated database — the extra columns
  simply sit unused, and party-event rows (which have no owning player/timeline) stay in the table
  but are invisible to the older queries. No data is lost from the database and there are no manual
  steps.

---

## Bundle format (v6)

```json
{
  "version": 3,
  "exported_at": "2026-05-12T10:00:00.000Z",
  "type": "campaign",
  "campaign": {
    "name": "Lost Mine of Phandelver",
    "description": "Starter adventure",
    "calendar_type": "harptos",
    "today_marker": 548
  },
  "npcs": ["Gundren Rockseeker", "Sildar Hallwinter", "The Black Spider"],
  "locations": [
    {
      "_ref": "Phandalin",
      "name": "Phandalin",
      "description": "A small frontier town.",
      "is_public": true,
      "size_type": "city",
      "parent_ref": null
    },
    {
      "_ref": "Tresendar Manor",
      "name": "Tresendar Manor",
      "description": "Redbrand hideout.",
      "is_public": false,
      "size_type": "dungeon",
      "parent_ref": "Phandalin"
    }
  ],
  "players": [
    {
      "player_name": "Aragorn",
      "username": "alice",
      "character": {
        "name": "Aragorn",
        "picture_url": null,
        "picture_data": null,
        "story": "A ranger from the north.",
        "traits": "Brave, loyal",
        "flaws": "Distrustful of magic",
        "goals": "Reclaim Erebor",
        "public_info": "Known ranger.",
        "private_info": "Secret heir."
      },
      "stats_json": { "str": 16, "dex": 14 },
      "dm_notes": [
        { "content": "Will betray the party if Gandalf is threatened.", "dm_visible": true }
      ],
      "relationships": [
        {
          "_ref": "Gandalf",
          "name": "Gandalf",
          "relation_type": "mentor",
          "link": null,
          "is_family": false,
          "is_dm_only": false,
          "parent_ref": null
        }
      ],
      "timelines": [
        {
          "name": "Main Quest",
          "entries": [
            {
              "title": "Arrived in Phandalin",
              "description": "The party rode into town.",
              "location": "Phandalin",
              "year": 1492,
              "day_of_year": 42,
              "duration_days": 1,
              "player_id_refs": ["self_Aragorn"]
            }
          ]
        }
      ]
    }
  ],
  "dm_timelines": [
    {
      "name": "World Timeline",
      "entries": [
        {
          "title": "The Cataclysm",
          "description": "An ancient disaster that shaped the world.",
          "location": "The Shattered Peaks",
          "year": 1,
          "day_of_year": 1,
          "duration_days": 7,
          "player_id_refs": []
        }
      ]
    },
    {
      "name": "DM Private Notes",
      "entries": [
        {
          "title": "BBEG reveals himself",
          "description": "Planned for session 12.",
          "location": null,
          "year": 1492,
          "day_of_year": 200,
          "duration_days": 1,
          "player_id_refs": ["dm_self", "cp_Aragorn"]
        }
      ]
    }
  ],
  "cross_connections": [
    {
      "from_type": "player",
      "from_ref": "Aragorn",
      "to_type": "npc",
      "to_ref": "Gundren Rockseeker",
      "label": "hired by",
      "notes": null,
      "is_public": true
    }
  ],
  "journey_maps": [
    {
      "name": "The Sword Coast",
      "description": "Regional overview",
      "map_image": "data:image/jpeg;base64,...",
      "scope_type": "continent",
      "scope_location_ref": null,
      "locations": [
        {
          "_ref": "Phandalin",
          "name": "Phandalin",
          "x": 42.5,
          "y": 31.0,
          "polygon": null,
          "icon_scale": 1,
          "campaign_location_ref": "Phandalin",
          "linked_map_ref": null
        }
      ],
      "distances": [
        { "from_ref": "Phandalin", "to_ref": "Neverwinter", "distance_miles": 50 }
      ],
      "paths": [
        {
          "name": "Phandalin ⇄ Neverwinter",
          "notes": "The Triboar Trail.",
          "distance_miles": 50,
          "kind": "route",
          "route_type": "road",
          "label_x": null,
          "label_y": null,
          "waypoints": [
            { "x": 38.0, "y": 22.0, "loc_ref": "Neverwinter" },
            { "x": 42.5, "y": 31.0, "loc_ref": "Phandalin" }
          ]
        }
      ]
    }
  ],
  "party_events": [
    {
      "title": "The whole party levels up",
      "description": "Milestone after clearing Cragmaw Castle.",
      "location": "Cragmaw Castle",
      "year": 1492,
      "day_of_year": 60,
      "duration_days": 1
    }
  ]
}
```

### Field reference

| Field | Type | Required | Notes |
|---|---|---|---|
| `version` | number | No | `3` for this format; `2` and `1` still accepted |
| `type` | string | Yes | Must be `"campaign"` |
| `campaign.name` | string | Yes | Used as-is (no suffix appended) |
| `campaign.description` | string | No | |
| `campaign.calendar_type` | string | No | `"harptos"` (default) or `"gregorian"` |
| `campaign.today_marker` | string/number | No | Absolute day integer; omit to leave unset |
| `npcs[]` | (string \| object)[] | No | NPC names (exported as `{ name }` objects). Plain strings and legacy `{ name, path_public }` objects are both still accepted on import; `path_public` is ignored (retired). |
| `locations[]._ref` | string | Yes | Symbolic key for cross-references; defaults to `name` if absent |
| `locations[].name` | string | Yes | |
| `locations[].description` | string | No | |
| `locations[].is_public` | boolean | No | Default `true` |
| `locations[].size_type` | string | No | `"city"`, `"town"`, `"village"`, `"dungeon"`, `"region"`, etc. |
| `locations[].image_data` | string | No | Base64 data URL of the location's custom map-pin image (small thumbnail); `null` to use the size/type icon |
| `locations[].parent_ref` | string | No | `_ref` of the parent location |
| `players[].player_name` | string | Yes | |
| `players[].username` | string | No | Matched case-insensitively to existing accounts |
| `players[].character` | object | No | Full PC sheet fields |
| `players[].character.picture_data` | string | No | Base64 portrait image |
| `players[].stats_json` | object | No | Stat block — same shape as `stats` in a `pc-sheet` bundle, see [PC Sheet docs](../pc-sheet/README.md#json-schema) |
| `players[].dm_notes[]` | object[] | No | `{ content, dm_visible }` |
| `players[].relationships[]._ref` | string | Yes | Symbolic key scoped to this player |
| `players[].relationships[].parent_ref` | string | No | `_ref` of parent relationship |
| `players[].timelines[].entries[].player_id_refs[]` | string[] | No | Participant tokens — see the table below |
| `dm_timelines[]` | object[] | No | DM-owned timelines (World timeline, Private DM timeline). Same structure as `players[].timelines[]`. Absent in v2 bundles. |
| `dm_timelines[].name` | string | Yes | Timeline name, e.g. `"World Timeline"` or `"DM Private Notes"` |
| `dm_timelines[].entries[].player_id_refs[]` | string[] | No | Same token format as player timeline entries; remapped to new IDs on import |
| `cross_connections[].from_type` | string | Yes | `"player"`, `"relationship"`, or `"npc"` |
| `cross_connections[].from_ref` | string | Yes | Player name / `"PlayerName:RelRef"` / NPC name |
| `journey_maps[].locations[]._ref` | string | Yes | Symbolic key for waypoint references |
| `journey_maps[].locations[].campaign_location_ref` | string | No | `_ref` of the matching campaign location |
| `journey_maps[].locations[].linked_map_ref` | string | No | `name` of a journey map in this bundle |
| `journey_maps[].locations[].polygon` | array | No | `[{x,y}]` percentage coords for region shapes |
| `journey_maps[].locations[].icon_scale` | number | No | Per-pin icon size multiplier (default `1`) |
| `journey_maps[].scope_type` | string | No | `"continent"` (default) or `"city"` |
| `journey_maps[].scope_location_ref` | string | No | `_ref` of the campaign location this map is scoped to; `null` for continent maps |
| `journey_maps[].paths[].kind` | string | No | `"route"` (road network) or `"path"` (legacy movement) |
| `journey_maps[].paths[].route_type` | string | No | `"road"`, `"flight"`, or `"maritime"` (routes only) |
| `journey_maps[].paths[].label_x` / `.label_y` | number | No | Dragged name-label position (percent); `null` = default midpoint |
| `journey_maps[].paths[].waypoints[].loc_ref` | string | No | `_ref` of pinned map location |
| `journey_maps[].paths[].waypoints[].segMiles` | number | No | Per-section distance for a route segment |
| `journey_maps[].paths[].waypoints[].curve` | array | No | Bend control points for a curved section |
| `party_events[]` | object[] | No | Whole-group timeline events (no owning player/timeline). Each: `{ title, description, location, year, day_of_year, duration_days }` |

### Timeline participant tokens

`player_id_refs[]` entries are symbolic on export and resolved to new database IDs on import.

| Token | Refers to |
|---|---|
| `self_<PlayerName>` | The player who owns this timeline |
| `cp_<PlayerName>` | Another player in the campaign |
| `rel_<PlayerName>:<RelRef>` | One player's relationship, by its `_ref` |
| `npc_<NpcName>` | A campaign NPC, by name |
| `dm_self` | The DM's own player row (`dm_timelines` only) |

> ⚠️ A token that doesn't resolve is **passed through verbatim** — no error, no warning, and the
> participant simply never appears. Likewise a `cross_connections` entry whose `from_ref`/`to_ref`
> doesn't resolve is **skipped silently**. Check names carefully: `<PlayerName>` must match
> `players[].player_name` exactly, and because the token is split on the first `_`, **player names
> must not contain underscores**.

---

## Export file names

Every module names its export the same way, so a folder of backups sorts and reads sensibly:

```
<module>[-<campaign>][-<name>]-<YYYY-MM-DD>.json
```

| Module | Example |
|---|---|
| Campaign | `campaign-the-last-performance-2026-10-02.json` |
| PC Sheet | `character-leruhy-teudis-2026-10-02.json` |
| Campaign Diary | `campaign-diary-leruhy-2026-10-02.json` |
| Timeline | `timeline-leruhy-macro-2026-10-02.json` |
| Journey Map | `journey-map-leruhy-road-to-nyth-2026-10-02.json` |

The date is the **local** date you saved the file, not UTC — an export taken late in the evening
carries that day, not tomorrow. Names are lowercased, accents are folded (`Ailyssë` → `ailysse`)
and anything that is not a letter or digit becomes a hyphen.

The **module prefix is not what the importer reads** — it routes on the `type` field inside the
file, so renaming a download is harmless.
