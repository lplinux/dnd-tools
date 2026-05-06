# 🗺️ Journey Path Map

An interactive map tool for plotting character and group movement across a campaign. Upload any map image as a background, pin campaign locations, and draw colour-coded movement paths for individual trackers (players, NPCs, or groups).

## Features

- **Upload any map image** — PNG, JPG, or WebP; stored in the database alongside map data
- **Campaign locations** — pin any location from the campaign's location list onto the map; positions are saved per map
- **Auto-create locations** — drawing a path through empty space automatically creates and pins new campaign locations at each waypoint; a naming modal appears after saving to let you give them proper names
- **Trackers** — colour-coded entities (group, player, NPC) each drawn as a separate path
- **Draw paths** — click to place waypoints, double-click or press Enter to finish; waypoints snap to nearby pins automatically
- **Draggable pins and waypoints** — reposition any pin or waypoint handle by dragging
- **Distance matrix** — set real-world distances between any pair of locations; travel time estimates (walking 🚶, horse 🐎, flying 🦅) are calculated automatically
- **Path distance** — manually set or auto-calculate path distance from the location distance matrix
- **Shareable read-only link** — generate a public token to share a view-only version of the map

## Usage

Open `/journey-map` in your browser after starting the server.

### Setting up a map

1. Select a **Campaign** from the header dropdown
2. Select an existing **Map** or click **+ New Map** to create one
3. Upload a map image via **Map Background → Upload Image** in the left sidebar

### Placing locations

Existing campaign locations appear in the **Locations** section of the sidebar.

- Select a location from the dropdown and click **📍** to activate the Place tool, then click the map to pin it
- Alternatively, activate the **Place Location** tool (`P`) and click the map after selecting a location

### Drawing paths

1. Create or select a **Tracker** in the Trackers section
2. Select the **Draw Path** tool (`D`) or click a tracker to activate it automatically
3. Click the map to place waypoints — click near a pin to snap to it
4. Double-click or press **Enter** to finish
5. If any waypoints were placed on empty space, a **Name New Locations** modal appears — give each one a meaningful name and optional description

### Editing paths

- Select the **Select / Move** tool (`V`) and click a path to select it
- Drag the white waypoint handles to reposition individual waypoints
- Use the right panel to edit the path name, distance, and notes

### Distance matrix

Open **📏 Distance Matrix** in the sidebar to set distances between any pair of pinned locations. Click any cell to enter the distance in miles. Travel time estimates are shown automatically.

### Sharing

Click **🔗 Share** in the header to generate a public read-only link. The public view shows the map, all pins, and all paths with their labels.

### Keyboard shortcuts

| Key | Action |
|---|---|
| `V` | Select / Move tool |
| `H` | Pan tool |
| `P` | Place Location tool |
| `D` | Draw Path tool |
| `X` | Delete tool |
| `Enter` | Finish drawing current path |
| `Escape` | Cancel / return to Select |
| `Alt` / `⌘` (hold) | Temporarily switch to Pan |
| `Delete` | Delete selected pin or path |
| Scroll wheel | Zoom in / out |

## Data storage

All map data (locations, paths, waypoints, distances, trackers, and the background image) is stored in PostgreSQL. Images are stored as base64 data URIs in the `journey_maps.map_image` column — keep map images reasonably sized (under ~2 MB) to avoid slow load times.

---

## Export

Click **⬇ Export** when a map is loaded. Downloads a JSON file containing:

- Map name and description
- All pinned locations (x/y coordinates)
- The distance matrix between locations
- All trackers (name, type, colour)
- All paths (waypoints with location links, tracker assignment, notes, event links)

The **background image is not exported** — it is stored as a base64 blob in the database and would make the file very large. Re-upload it after importing.

## Import

Click **⬆ Import Map** and select a `.json` file. A campaign must be selected first. Import creates:

1. A new journey map in the current campaign (`(Imported)` appended to the name)
2. Fresh `campaign_locations` for each location in the file
3. New `journey_map_locations` pinned at the same x/y positions
4. Trackers with the same names/colours
5. Distances remapped to the new location IDs
6. Paths with waypoints remapped to the new location IDs

After import, re-upload the background image using **Map Background → Upload Image**.

---

## JSON template

```json
{
  "version": 1,
  "exported_at": "2025-01-01T00:00:00.000Z",
  "type": "journey-map",
  "map": {
    "name": "The Sword Coast",
    "description": "Regional map for the main campaign arc"
  },
  "locations": [
    {
      "id": 1,
      "name": "Waterdeep",
      "description": "City of Splendors",
      "x": 42.5,
      "y": 31.0
    },
    {
      "id": 2,
      "name": "Baldur's Gate",
      "description": "City-state on the Chionthar",
      "x": 38.2,
      "y": 68.4
    }
  ],
  "distances": [
    {
      "from_loc_id": 1,
      "to_loc_id": 2,
      "distance_miles": 250
    }
  ],
  "trackers": [
    {
      "id": 1,
      "name": "The Party",
      "type": "group",
      "color": "#c9a84c"
    },
    {
      "id": 2,
      "name": "Aelthas",
      "type": "player",
      "color": "#6ba3d6"
    }
  ],
  "paths": [
    {
      "name": "Journey South",
      "notes": "Ambushed by gnolls near the Trade Way junction.",
      "tracker_id": 1,
      "waypoints": [
        { "x": 42.5, "y": 31.0, "locId": 1 },
        { "x": 40.1, "y": 49.8 },
        { "x": 38.2, "y": 68.4, "locId": 2 }
      ]
    }
  ]
}
```

### Field reference

| Field | Type | Required | Notes |
|---|---|---|---|
| `version` | integer | Yes | Must be `1` |
| `type` | string | Yes | Must be `"journey-map"` |
| `map.name` | string | Yes | Map name |
| `map.description` | string | No | Short description |
| `locations[].id` | integer | Yes | Used to cross-reference distances and waypoints within this file — replaced with new DB ids on import |
| `locations[].name` | string | Yes | Location name |
| `locations[].x` / `.y` | float | Yes | Position as percentage of image width/height (0–100) |
| `distances[].from_loc_id` | integer | Yes | References `locations[].id` in this file |
| `distances[].to_loc_id` | integer | Yes | References `locations[].id` in this file |
| `distances[].distance_miles` | float | Yes | Distance in miles |
| `trackers[].id` | integer | Yes | Used to cross-reference paths — replaced on import |
| `trackers[].name` | string | Yes | Tracker name |
| `trackers[].type` | string | No | `"group"`, `"player"`, or `"npc"` |
| `trackers[].color` | string | No | Hex colour string |
| `paths[].name` | string | No | Path name |
| `paths[].notes` | string | No | Freeform notes |
| `paths[].tracker_id` | integer | No | References `trackers[].id` in this file |
| `paths[].waypoints[].x` / `.y` | float | Yes | Position as percentage (0–100) |
| `paths[].waypoints[].locId` | integer | No | References `locations[].id` in this file |
| `paths[].waypoints[].eventIds` | integer[] | No | Timeline event IDs — not remapped on import |
| `paths[].waypoints[].eventTitles` | string[] | No | Cached event titles for display |
