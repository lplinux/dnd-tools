# 🗺️ Journey Path Map

An interactive map tool for plotting character and group movement across a campaign. Upload any map image as a background, pin campaign locations, draw colour-coded movement paths for individual trackers (players, NPCs, or groups), and **draw polygon boundaries for region-type locations**.

## Features

- **Upload any map image** — PNG, JPG, or WebP; stored in the database alongside map data
- **Campaign locations** — pin any location from the campaign's location list onto the map; positions are saved per map
- **Region polygons** — locations of type `region` can be drawn as freeform polygons rather than single points; polygons are filled, labelled at their centroid, and fully reshapeable
- **Auto-create locations** — drawing a path through empty space automatically creates and pins new campaign locations at each waypoint; a naming modal appears after saving to let you give them proper names
- **Trackers** — colour-coded entities (group, player, NPC) each drawn as a separate path
- **Draw paths** — click to place waypoints, double-click or press Enter to finish; waypoints snap to nearby pins automatically
- **Draggable pins, region vertices, and waypoints** — reposition any pin, reshape a region polygon by dragging its vertices, or move a region body wholesale by dragging its interior
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

- Select a location from the dropdown and click **📍** to activate the appropriate tool, then click the map to pin it
- For **region-type locations**, clicking 📍 (or pressing `R`) activates the **Draw Region** tool automatically
- Alternatively, activate the **Place Location** tool (`P`) manually for non-region locations, or **Draw Region** (`R`) for regions

### Drawing region polygons

1. Select a `region`-type campaign location from the Locations dropdown
2. Click **📍 Place on Map** — the **Draw Region** tool (`R`) activates automatically
3. Click on the map to place each vertex of the polygon boundary (minimum 3 vertices)
4. **Double-click** or press **Enter** to close and save the polygon
5. The region renders as a semi-transparent filled shape with its name at the centroid

### Reshaping regions

- Select the **Select / Move** tool (`V`) and click a region polygon to select it
- **Vertex handles** (small gold circles) appear at each corner — drag them to reshape
- Drag the **interior** of the region to move the entire polygon
- Changes are auto-saved on mouse-up

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

Click **🔗 Share** in the header to generate a public read-only link. The public view shows the map, all pins, region polygons, and all paths with their labels.

### Keyboard shortcuts

| Key | Action |
|---|---|
| `V` | Select / Move tool |
| `H` | Pan tool |
| `P` | Place Location tool |
| `R` | Draw Region tool |
| `D` | Draw Path tool |
| `X` | Delete tool |
| `Enter` | Finish drawing current path or region |
| `Escape` | Cancel / return to Select |
| `Alt` / `⌘` (hold) | Temporarily switch to Pan |
| `Delete` | Delete selected pin, region or path |
| Scroll wheel | Zoom in / out |

## Data storage

All map data (locations, paths, waypoints, distances, trackers, and the background image) is stored in PostgreSQL. Images are stored as base64 data URLs in the `journey_maps.map_image` column.

**Image size limit**: uploaded images are automatically resized to a maximum of 4096 px on the longest edge and JPEG-compressed until the stored data URL is under 2 MB. Raw uploads over 20 MB are rejected before processing. This keeps the database lean and export files portable.

Region polygons are stored as a `JSONB` array of `{x, y}` percentage-coordinate objects in `journey_map_locations.polygon`. A `NULL` polygon means the location is a regular pin.

---

## Export

Click **⬇ Export** when a map is loaded. Downloads a JSON file containing:

- Map name and description
- **Map background image** (base64 data URL — already compressed to ≤ 2 MB at upload time)
- All pinned locations (x/y coordinates, and polygon vertices for regions)
- The distance matrix between locations
- All trackers (name, type, colour)
- All paths (waypoints with location links, tracker assignment, notes, event links)

## Import

Click **⬆ Import Map** and select a `.json` file. A campaign must be selected first. Import creates:

1. A new journey map in the current campaign
2. **Restores the background image** if `map_image` is present in the file
3. Fresh `campaign_locations` for each location in the file
4. New `journey_map_locations` pinned at the same x/y positions (polygon preserved for regions)
5. Trackers with the same names/colours
6. Distances remapped to the new location IDs
7. Paths with waypoints remapped to the new location IDs

If the export file pre-dates image export support (no `map_image` key), the success toast will prompt you to re-upload the background image manually.

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
    },
    {
      "id": 3,
      "name": "The High Forest",
      "description": "Ancient woodland region",
      "x": 55.0,
      "y": 28.0,
      "polygon": [
        { "x": 50.0, "y": 22.0 },
        { "x": 62.0, "y": 23.5 },
        { "x": 64.0, "y": 34.0 },
        { "x": 55.0, "y": 37.0 },
        { "x": 48.0, "y": 33.0 }
      ]
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
| `locations[].x` / `.y` | float | Yes | Position as percentage of image width/height (0–100). For regions, this is the centroid |
| `locations[].polygon` | array | No | Array of `{x, y}` objects (percentages). Present for region-type locations. Minimum 3 points |
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
