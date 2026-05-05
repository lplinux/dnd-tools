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
| `GET` | `/api/campaigns/:id/export` | Export campaign as JSON (v2) |
| `POST` | `/api/campaigns/import` | Import a campaign from a v2 JSON file |

---

## Export / Import

### Export

Click **⬇ Export** in the page header (visible once a campaign is selected). Downloads a `.json` file containing:

- Campaign name, description, and calendar type
- The Today Marker (if set)
- All player names with their linked usernames (if assigned)
- All locations with descriptions
- All NPC names

### Import

Click **⬆ Import** in the page header and select a previously exported `.json` file. A new campaign is created with `(Imported)` appended to the name.

**Username linking during import:** If a player's `username` field matches an existing user account (case-insensitive), the player is automatically linked to that account — no manual re-linking needed. If the username doesn't match any account in the system, the player is created unlinked and can be assigned later using the Reassign dropdown.

---

### JSON schema (v2)

```json
{
  "$schema": "object",
  "version": 2,
  "exported_at": "ISO 8601 datetime string",
  "type": "campaign",

  "campaign": {
    "name": "string — required",
    "description": "string — optional",
    "calendar_type": "\"harptos\" | \"gregorian\" — optional, defaults to harptos",
    "today_marker": "string or integer (absolute day number) — optional, null to leave unset"
  },

  "players": [
    {
      "player_name": "string — required",
      "username": "string — optional; matched to existing users on import to auto-link accounts"
    }
  ],

  "locations": [
    {
      "name": "string — required",
      "description": "string — optional"
    }
  ],

  "npcs": [
    "string (NPC name)"
  ]
}
```

### Full example with all fields

```json
{
  "version": 2,
  "exported_at": "2025-04-01T14:30:00.000Z",
  "type": "campaign",
  "campaign": {
    "name": "Lost Mines of Phandelver",
    "description": "Starter adventure set in the Sword Coast wilderness.",
    "calendar_type": "harptos",
    "today_marker": "544965"
  },
  "players": [
    { "player_name": "Thorn Ashwick", "username": "alice" },
    { "player_name": "Lirien Dawnwhisper", "username": "bob" },
    { "player_name": "Grumm Stonefist", "username": null }
  ],
  "locations": [
    { "name": "Phandalin", "description": "Small frontier town on the Triboar Trail." },
    { "name": "Tresendar Manor", "description": "Ruined manor on the eastern edge of town." },
    { "name": "Wave Echo Cave", "description": "Ancient dwarven mine — location of the Forge of Spells." }
  ],
  "npcs": [
    "Gundren Rockseeker",
    "Sildar Hallwinter",
    "Glasstaff",
    "The Black Spider"
  ]
}
```

### Field reference

| Field | Type | Required | Notes |
|---|---|---|---|
| `version` | number | No | Must be `2` if present; older v1 files (without NPCs) are still accepted |
| `type` | string | Yes | Must be `"campaign"` |
| `campaign.name` | string | Yes | `" (Imported)"` is appended automatically |
| `campaign.description` | string | No | Description text for the campaign |
| `campaign.calendar_type` | string | No | `"harptos"` (default) or `"gregorian"` — **cannot be changed after import** |
| `campaign.today_marker` | string \| number | No | Absolute day integer; omit or `null` to leave unset |
| `players[].player_name` | string | Yes | Character name |
| `players[].username` | string | No | Matched case-insensitively to existing user accounts; auto-links on import |
| `locations[].name` | string | Yes | Location name |
| `locations[].description` | string | No | Short description |
| `npcs[]` | string[] | No | Array of NPC name strings |
