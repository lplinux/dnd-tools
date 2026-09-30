# 📜 Campaign Timeline

A server-backed timeline tool for D&D campaigns. Tracks events for multiple players across locations using either the **Calendar of Harptos** (Faerûn) or the **Gregorian calendar**. Each campaign has one shared DM timeline and separate private timelines per player.

## Features

- **Campaign-based** — timelines belong to a campaign; data is stored in PostgreSQL
- **Two calendar systems** — Harptos (12 × 30-day months + 5 festival days) and Gregorian
- **Event duration** — set duration as `1d`, `3m`, `2y`; events render as bars on the graph
- **Per-player colour lanes** — each player gets their own horizontal lane within a location column
- **Connection lines** — bezier curves link each player's events in chronological order
- **Segment-compressed Y axis** — empty years between event clusters collapse to a small gap bar
- **Today marker** — per-campaign date marker managed from the Campaign Manager, with a **Go to Today** button in the toolbar that scrolls the graph straight to it
- **Show/hide players and locations** — for sharing your screen with players
- **Solo a player** — click a player's **name** in the Players sidebar to show **only** that player's events (everyone else is hidden); click the name again to clear. The 👁 eye button still hides/shows individual players; solo overrides the eye toggles while active
- **Three themes** — Dark, Light, Slate (persisted in localStorage)
- **Table view** — chronological table with CSV export
- **Search** — instant search across titles, descriptions, locations, and player names
- **Player filter** — live search box in the Players sidebar, New Event player picker, and Edit Event modal to quickly find actors in large campaigns
- **Drag to move events** — drag any event circle to a new date or column
- **Location column reorder** — drag location names in the sidebar to reorder columns
- **Private player timelines** — each player has their own private journal, viewable by the DM in a combined view. Players (and the DM) create their own timelines with the **＋ New** button in the campaign selector bar — this is available even before you have any timeline yet (an empty player also gets a **＋ Create your first timeline** button in the main area)
- **Party events (DM)** — flag a new event as a 🌍 **Party event** for the whole group; it's stored once and shown in a shared **Party lane** in the combined + public views and alongside each player's own timeline
- **Drives the Journey Map** — an event's **location + date** feed the map's derived movement paths: party events (and any event involving 3+ players) build the 🌍 Party path, fewer-player events build each involved player's own 👤 path, and events tagging an NPC build that NPC's path, in date order
- **Public share link** — generate a read-only token to share the timeline with players

## Usage

Open `/timeline` in your browser after starting the server.

Select a **Campaign** from the header. DMs see all players and locations. Players see only their own data.

### Views

Two views of the same data, switched from the toolbar:

- **Graph** — an SVG Gantt: one column per location, events drawn as bars down a
  date axis, with each player's own colour. Zoomable, and **Fit** scales the whole
  span to the window.
- **Table** — the same events as a sortable list, which is easier for scanning
  dates and for copying text out.

### Create a new Timeline

Pick a player (or the DM's own private timeline) in the campaign selector bar,
then **＋ New Timeline**. A campaign can hold any number of timelines per actor;
the **World** timeline is the shared one.

### Set a Today Marker

The Today Marker is set in **Manage Campaigns** (`/manage-campaigns`):

1. Select the campaign
2. Open **📍 Today Marker** and click **📅 Set Date**
3. Choose year, month, and day; click **Set Marker**

A white/blue line will appear across the full timeline at that date.

### Adding Players and Locations

Players and locations are managed in **Manage Campaigns** (`/manage-campaigns`). The timeline reflects the campaign's player list and uses campaign locations as column headers.

### Filtering players

When a campaign has many characters (players, NPCs, relationships) the player picker can become long. A **🔍 Search players…** input appears:

- Above the **Players** list in the sidebar — filters which players are shown for hide/show and colour editing
- Above the player checkboxes in the **New Event** form
- Above the player checkboxes in the **Edit Event** modal

Typing narrows the list live; clearing the input restores all entries.

### Adding an event

1. Open the **New Event** section in the sidebar
2. Select one or more players
3. Choose a location, date, and optional duration
4. Click **Add Event** — the timeline scrolls to it and highlights it

### Party events (DM only)

To record something that happened to the **whole group**, tick **🌍 Party event (whole group)** at the top of the New Event form. A party event isn't tied to any single player — it's stored once and appears in a shared **Party** lane in the combined view and the public timeline, and alongside every player's own events. Edit or delete it like any other event.

> Party events are **campaign-scoped**: they travel with the whole-campaign export/import (as a top-level `party_events[]` array in the v3 bundle), not with a per-player timeline export.

### Deleting an event

1. Find the event on the timeline or via search
2. Click the event circle to open the Event Card
3. Click **Delete**

You can also delete events from the sidebar list.

### Editing an event

1. Find the event on the timeline or via search
2. Click the event circle to open the Event Card
3. Click **Edit**, make changes, then **Save**

### Duration syntax

| Input | Meaning |
|---|---|
| `1d` (default) | 1 day |
| `14d` | 14 days |
| `3m` | ~3 months (90 days) |
| `2y` | ~2 years (730 days) |

### Keyboard shortcuts (search box)

| Key | Action |
|---|---|
| `Enter` | Jump to first result |
| `Escape` | Close search |

## Data storage

All campaign timeline data is stored in PostgreSQL under the campaign. Theme preference is stored in
the browser's `localStorage`.

---

## Export / Import

### Export a timeline

With a specific named timeline selected in the campaign selector bar, click **⬇** to download it as a
portable `type:'timeline'` `.json`. Actors are stored by **name + kind** (player / npc / relationship)
and locations by name, so the file can be re-imported into any campaign.

```json
{
  "version": 1, "type": "timeline",
  "timeline": { "name": "Aldric's Journal" },
  "calendar_type": "harptos",
  "events": [
    {
      "title": "Yawning Portal Brawl", "description": "…", "location": "Waterdeep",
      "year": 1492, "day_of_year": 8, "duration_days": 1, "is_party": false,
      "actors": [ { "name": "Aldric", "kind": "player" }, { "name": "Volo", "kind": "npc" } ]
    }
  ]
}
```

### Import a timeline

Import is done from **Manage Campaigns → ⬆ Import** (the single import hub). Select the target campaign,
drop the timeline file, and choose the **target player** + a timeline name. Events are appended under a
new timeline for that player; actors are matched to the campaign's players / NPCs / relationships by
name (unmatched actors are dropped), and any missing location is created.

> The legacy per-timeline JSON format below is still accepted by older paths but is superseded by the
> `type:'timeline'` bundle above.

### Full example with all fields

```json
{
  "profile": {
    "id": "abc123",
    "name": "Main Campaign",
    "calendarType": "harptos"
  },
  "db": {
    "players": [
      { "id": "p1", "name": "Aldric",  "color": "#c0392b" },
      { "id": "p2", "name": "Miriel",  "color": "#2980b9" },
      { "id": "p3", "name": "Zora",    "color": "#27ae60" }
    ],
    "locations": ["Waterdeep", "Baldur's Gate", "Neverwinter"],
    "locationOrder": ["Waterdeep", "Neverwinter", "Baldur's Gate"],
    "events": [
      {
        "id": "e1",
        "title": "Yawning Portal Brawl",
        "description": "Fought off cultists beneath the tavern.",
        "location": "Waterdeep",
        "playerIds": ["p1"],
        "year": 1492,
        "dayOfYear": 8,
        "durationDays": 1,
        "manualLinks": [],
        "color": null
      },
      {
        "id": "e2",
        "title": "Council of Three",
        "description": "All three gathered to plan the heist.",
        "location": "Waterdeep",
        "playerIds": ["p1", "p2", "p3"],
        "year": 1492,
        "dayOfYear": 72,
        "durationDays": 3,
        "manualLinks": ["e1"],
        "color": "#8e44ad"
      }
    ]
  }
}
```

### Schema reference

#### Top-level

| Field | Type | Required | Notes |
|---|---|---|---|
| `profile` | object | No | Metadata about the timeline; ignored by the importer |
| `profile.id` | string | No | Arbitrary identifier |
| `profile.name` | string | No | Display name of the timeline |
| `profile.calendarType` | string | No | `"harptos"` or `"gregorian"` |
| `db` | object | Yes* | Container for all data. If absent, the root object is treated as `db` (legacy format) |
| `db.players` | array | Yes | List of player definitions |
| `db.locations` | array | Yes | List of location name strings |
| `db.locationOrder` | array | No | Display order of location columns; defaults to `locations` order if omitted |
| `db.events` | array | Yes | List of events |

#### `db.players[]`

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | Yes | Unique within this file; used for cross-referencing `events[].playerIds` in public/legacy exports — not stored in the database. In private-mode exports, `events[].playerIds` contains player **names** instead and this field is not referenced |
| `name` | string | Yes | Must match an existing player, NPC, or relationship name in the campaign (case-insensitive). For the **private timeline import**, valid names are: the character's own name, any relationship name, campaign player names (without the `👤` prefix), and NPC names (without the `🎭` prefix) |
| `color` | string | No | Hex colour (e.g. `"#c0392b"`); used in the DM shared timeline; ignored by the private importer |

#### `db.locations[]`

A flat array of location name strings. Each name must match a location that exists in the campaign (case-insensitive) when importing into a private timeline. The DM shared timeline import accepts any names.

#### `db.events[]`

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | No | Arbitrary identifier; used only for `manualLinks` cross-references within the file |
| `title` | string | Yes | Event title; defaults to `"(untitled)"` if blank |
| `description` | string | No | Free-text body of the event |
| `location` | string | No | Must match a value in `db.locations[]` (case-insensitive); `null` for locationless events |
| `playerIds` | string[] | Yes | **Public/legacy exports:** references one or more `db.players[].id` values. **Private-mode exports:** contains player **names** directly (e.g. `["Aldric", "👤 Miriel"]`). The importer handles both formats — it tries name lookup first, then falls back to ID-based lookup for legacy files |
| `year` | integer | Yes | In-game year (e.g. `1492`) |
| `dayOfYear` | integer | Yes | Day within the year: 1–365 for Harptos, 1–366 for Gregorian. Also accepted as `day_of_year` |
| `durationDays` | integer | No | Duration in days; minimum 1. Defaults to `1` if omitted or `< 1`. Also accepted as `duration_days` |
| `manualLinks` | string[] | No | IDs of other events to draw a manual connection line to; defaults to `[]` |
| `color` | string | No | Per-event hex colour override; `null` to use the player's colour |

### Legacy flat format

Older exports omit the `profile`/`db` wrapper. The importer detects this automatically — if the root object contains `players`, `locations`, and `events` directly it is treated as `db`:

```json
{
  "players": [
    { "id": "p1", "name": "Aldric", "color": "#c0392b" }
  ],
  "locations": ["Waterdeep"],
  "events": [
    {
      "id": "e1",
      "title": "Yawning Portal Brawl",
      "playerId": "p1",
      "location": "Waterdeep",
      "year": 1492,
      "dayOfYear": 8
    }
  ]
}
```

The legacy `playerId` (singular) field on events is also supported — it is automatically promoted to `playerIds: ["p1"]` on load.