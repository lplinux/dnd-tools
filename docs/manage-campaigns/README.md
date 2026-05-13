# 🏰 Manage Campaigns

The campaign manager is the control centre for everything in the app. Before using the Timeline, PC Sheet, or Journey Map, a DM must create a campaign here and configure it with players and locations.

**Access:** DM, Admin — `/manage-campaigns`

---

## Overview

The page has a two-panel layout. The left panel lists all campaigns and contains the **Create Campaign** form. The right panel shows the full detail for whichever campaign is selected.

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

Click **Edit** on any location row to open a modal. Change the name or description and click **Save**.

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

## Deleting a campaign

The **Delete Campaign** button at the bottom of the detail panel permanently removes the campaign and **all its data**: players, locations, timeline entries, journey maps, PC sheets, and all DM notes. There is a confirmation prompt, but the action cannot be undone.

---

## API reference

All endpoints require the `dm` or `admin` role unless noted.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/campaigns` | List all campaigns (auth required) |
| `POST` | `/api/campaigns` | Create a new campaign |
| `DELETE` | `/api/campaigns/:id` | Delete a campaign and all its data |
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
| `GET` | `/api/campaigns/:id/meta` | Get campaign metadata (today marker, public token) |
| `PUT` | `/api/campaigns/:id/meta` | Update campaign metadata |
| `GET` | `/api/campaigns/:id/timelines` | Get player timeline summary |
| `POST` | `/api/player-timelines/:campaignId/:playerId` | Create a new timeline for a player |
| `GET` | `/api/campaigns/:id/export` | Export full campaign snapshot as JSON (v3) |
| `POST` | `/api/campaigns/import` | Import a campaign from a v3 (or v2) JSON bundle |

---

## Export / Import

### Export

Click **⬇ Export** in the page header (visible once a campaign is selected). Downloads a `.json` file (v3) containing the complete campaign state:

- Campaign name, description, calendar type, today marker
- All NPCs (names)
- All locations — including hidden ones (`is_public: false`), `size_type`, and the full parent/child hierarchy
- All players with:
  - PC sheet (name, story, traits, flaws, goals, public/private info, portrait image as base64)
  - Full stats JSON block
  - DM notes (content + visibility flag)
  - PC relationships (including DM-only ones, with nested parent relationships)
  - All named timelines and every entry within them
- DM cross-connections from the character tree
- All Journey Maps — including background image, all pins and region polygons, distances, trackers, and paths with waypoints

**No database IDs appear in the file.** Every cross-reference uses a symbolic `_ref` derived from the entity's name, making the bundle human-readable and portable across instances.

### Import

Click **⬆ Import** in the page header and select a previously exported `.json` file. A new campaign is created; existing data is never modified.

- All entities are created inside a single database transaction — any error rolls the entire import back cleanly
- Parent/child hierarchies (locations, relationships) are restored with a two-pass insert
- Journey map `linked_map_ref` links between maps are resolved after all maps are created
- Timeline `player_id_refs` are remapped to the new player and relationship IDs
- Cross-connections are silently skipped if either end ref cannot be resolved (e.g. a player was removed before export)
- Username → user account links are resolved against the live users table; unmatched usernames are skipped without error (player is created unlinked)
- **v2 bundles** (previous format, no `_ref` fields, no character/timeline/map data) are still accepted — the importer falls back to using `name` as the lookup key

---

## Bundle format (v3)

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
          "campaign_location_ref": "Phandalin",
          "linked_map_ref": null
        }
      ],
      "distances": [
        { "from_ref": "Phandalin", "to_ref": "Neverwinter", "distance_miles": 50 }
      ],
      "trackers": [
        { "name": "The Party", "type": "group", "color": "#c9a84c" }
      ],
      "paths": [
        {
          "name": "Journey to Phandalin",
          "notes": "Ambushed by goblins on the Triboar Trail.",
          "distance_miles": 50,
          "tracker_ref": "The Party",
          "waypoints": [
            { "x": 38.0, "y": 22.0, "loc_ref": null },
            { "x": 42.5, "y": 31.0, "loc_ref": "Phandalin" }
          ]
        }
      ]
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
| `npcs[]` | string[] | No | NPC name strings |
| `locations[]._ref` | string | Yes | Symbolic key for cross-references; defaults to `name` if absent |
| `locations[].name` | string | Yes | |
| `locations[].description` | string | No | |
| `locations[].is_public` | boolean | No | Default `true` |
| `locations[].size_type` | string | No | `"city"`, `"town"`, `"village"`, `"dungeon"`, `"region"`, etc. |
| `locations[].parent_ref` | string | No | `_ref` of the parent location |
| `players[].player_name` | string | Yes | |
| `players[].username` | string | No | Matched case-insensitively to existing accounts |
| `players[].character` | object | No | Full PC sheet fields |
| `players[].character.picture_data` | string | No | Base64 portrait image |
| `players[].stats_json` | object | No | Arbitrary stat block JSON |
| `players[].dm_notes[]` | object[] | No | `{ content, dm_visible }` |
| `players[].relationships[]._ref` | string | Yes | Symbolic key scoped to this player |
| `players[].relationships[].parent_ref` | string | No | `_ref` of parent relationship |
| `players[].timelines[].entries[].player_id_refs[]` | string[] | No | Tokens like `"self_PlayerName"`, `"rel_PlayerName:RelRef"` |
| `cross_connections[].from_type` | string | Yes | `"player"`, `"relationship"`, or `"npc"` |
| `cross_connections[].from_ref` | string | Yes | Player name / `"PlayerName:RelRef"` / NPC name |
| `journey_maps[].locations[]._ref` | string | Yes | Symbolic key for waypoint references |
| `journey_maps[].locations[].campaign_location_ref` | string | No | `_ref` of the matching campaign location |
| `journey_maps[].locations[].linked_map_ref` | string | No | `name` of a journey map in this bundle |
| `journey_maps[].locations[].polygon` | array | No | `[{x,y}]` percentage coords for region shapes |
| `journey_maps[].paths[].waypoints[].loc_ref` | string | No | `_ref` of pinned map location |
