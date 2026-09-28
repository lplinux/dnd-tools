# 🗺️ Journey Path Map

An interactive map tool for a campaign. Upload any map image as a background, pin campaign locations, draw the **road network** (routes), and **draw polygon boundaries for region-type locations**. **Movement paths are derived automatically from the Timeline** — a **Party** path and one path per **NPC** — so you never draw them by hand.

## Features

- **Upload any map image** — PNG, JPG, or WebP; stored in the database alongside map data
- **Campaign locations** — pin any location from the campaign's location list onto the map; positions are saved per map
- **Region polygons** — locations of type `region` can be drawn as freeform polygons rather than single points; polygons are filled, labelled at their centroid, and fully reshapeable
- **Draggable pins & region vertices** — reposition any pin, reshape a region polygon by dragging its vertices, or move a region body wholesale by dragging its interior
- **Click a location to focus** — clicking a location in the sidebar list centres the map on its pin (zooming in to at least 1× so it's legible). Clicking a pin directly on the map just selects it (so dragging still works)
- **Draw = Routes (roads)** — the Draw tool builds the **road network** only. Pick a type — 🛣️ **Road**, ✈️ **Flight**, or ⚓ **Maritime** — and draw roads across the map. Road points are **map-only** and do **not** create campaign locations. Set each **section's** distance afterward; the road's total is the sum of its sections.
- **Movement paths are derived from the Timeline** — you don't draw them:
  - **🌍 Party path** — built from events that are *party events* **or** involve **3 or more players**, in date order.
  - **👤 Player paths** — one per player, built from the remaining (fewer-than-3-player, non-party) events that player took part in. A 2-player event feeds **both** players' paths.
  - **🎭 NPC paths** — one per NPC, built from **any** event that tags that NPC — including the DM's own timelines, since NPC movements are usually logged there. NPC paths are **DM-only** (never shown on the public map).
  - Each stop is a timeline event's location matched to a pinned location; events at unpinned locations are skipped. Paths are read-only here — edit the **Timeline** to change them.
- **Distances come from the roads** — the real distance between any two locations is the shortest path over the drawn road network (sum of the relevant section distances). This feeds the derived paths, the measure tool, and the Distance Matrix. The stored matrix is only a fallback for location pairs no road connects.
- **Show/Hide roads** — toggle all road lines on/off from the Routes panel; road lines are translucent so they don't hide map markers. Delete individual road points from the Route panel when rebuilding.
- **Bend a road** — with the **Select/Move** tool, select a road, then **double-click** a section to drop a bend point where you click. (Under Draw/Extend, double-click still finishes the line.) Drag each **diamond** to shape the curve (add several for coastlines/mountain passes); **double-click a diamond** to remove it. Bending is shape-only — it never adds a routing waypoint and never changes the distance.
- **Location icons by size/type** — each pin is drawn as a vector icon chosen by its `size_type` (🏰 castle for big cities, 🏠 house for towns, ⛺ village, 🛏️ inn, landmark, ⚓ port, … with a map-pin fallback). Each pin has a **size slider** in its details panel (`icon_scale`) so you can fit it to the map art; icons scale with zoom.
- **Custom pin images** — give a location a **custom image** (in Manage Campaigns → Locations → edit) and its pin renders as that image (circular-clipped) on every map instead of the vector icon. Images are auto-shrunk to a small thumbnail and travel with the campaign export. A pin resolves in this order: its **own image** → the **per-type default** (admin-set, see below) → the built-in size/type vector icon.
- **Default pin images by type** — an **admin** can upload a default image per location type (city / town / village / port / …) in **User Management → Location Pin Defaults**. Every location of that type then shows that image automatically — no need to set each location individually. These defaults are global (shared by all campaigns); individual locations can still override with their own image.
- **Names on parchment, decluttered** — location and road/path names render on small parchment plates. Only **big/huge** location names stay drawn on the map; every other name is **hidden and appears on hover**. Road-name plates read in a route-typed colour and can be **dragged** along the map to sit clear of other markers.
- **Auto-named roads** — drawing a route between two pinned locations names it `"Start City ⇄ End City"` by default (falls back to the type label when an end isn't a placed location). Editable in the Road Info panel.
- **Per-path Show/Hide** — in the **Movement (from Timeline)** sidebar list, each path (Party, player, NPC) has a 👁/🙈 toggle that hides its line on your map to reduce clutter. This is a **local view toggle** — it affects only your editor view and resets on reload; it does not change what the public map shows.
- **Tool shortcuts expand the right panel** — pressing a tool key (or clicking it) other than Select/Move auto-opens the matching sidebar section: **Draw** → Tools (route type); **Place/Region/Measure** → Locations.
- **Shareable read-only link** — generate a public token to share a player-safe view-only version of the map (see **Sharing** below)

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

### Movement paths (from the Timeline)

Movement is **not drawn** — it's derived from Timeline events:

1. In the **Timeline**, give events a **location** (a campaign location) and a **date**, and tag the participants (players / NPCs), or mark whole-group events as **🌍 Party**.
2. Pin those locations on the map.
3. The Journey Map automatically draws a **🌍 Party** path (events that are party events or involve 3+ players), a **👤 path per player** (their remaining, fewer-than-3-player events), and a **🎭 path per NPC** (any event tagging that NPC, including the DM's own timelines), each connecting the event locations in date order.

Stops at locations not pinned on the current map are skipped. To change a path, edit the underlying Timeline events. In the **Movement (from Timeline)** sidebar list, use 👁/🙈 to hide a path on your own map (view-only declutter; resets on reload).

### Drawing roads (routes)

1. Select the **Draw** tool (`D`) and pick a road type (🛣️ Road / ✈️ Flight / ⚓ Maritime)
2. Click the map to place points — click near a pin to snap to it
3. Double-click or press **Enter** to finish; then set each section's distance in the Road Info panel
4. With **Select/Move**, select a road and double-click a section to add a bend point

### Distance matrix

Open **📏 Distance Matrix** in the sidebar to set distances between any pair of pinned locations. Click any cell to enter the distance in miles. Travel time estimates are shown automatically.

### Sharing

Click **🔗 Share** in the header to generate a public read-only link. The public view is **player-safe**:

- **Hidden locations are omitted** — locations you've hidden in Manage Campaign (and their children) don't appear.
- **The road/route network is not drawn** on the public map. Roads are still used *only to calculate distances*, so distances between visible locations are shown even when the shortest path runs through hidden places; a distance that can't be computed simply isn't shown.
- **Movement paths are per-viewer**: the DM (map owner) sees the Party path + all player paths + all NPC paths; a **logged-in player** sees the **Party** path + **their own** player path; an **anonymous** visitor sees no movement paths. **NPC paths are DM-only** — they never appear on the public map for anyone but the owning DM.
- Location icons appear as on the editor; only **big/huge** names show by default (others on hover).

### Keyboard shortcuts

| Key | Action |
|---|---|
| `V` | Select / Move tool |
| `H` | Pan tool |
| `P` | Place Location tool |
| `R` | Draw Region tool |
| `D` | Draw / Extend Route (road) tool |
| `X` | Delete tool |
| `Enter` | Finish drawing current road or region |
| `Escape` | Cancel / return to Select |
| `Alt` / `⌘` (hold) | Temporarily switch to Pan |
| `Delete` | Delete selected pin, region or path |
| Scroll wheel | Zoom in / out |

## Data storage

All map data (locations, paths, waypoints, distances, and the background image) is stored in PostgreSQL. Images are stored as base64 data URLs in the `journey_maps.map_image` column.

**Image size limit**: uploaded images are automatically resized to a maximum of 4096 px on the longest edge and JPEG-compressed until the stored data URL is under 2 MB. Raw uploads over 20 MB are rejected before processing. This keeps the database lean and export files portable.

Region polygons are stored as a `JSONB` array of `{x, y}` percentage-coordinate objects in `journey_map_locations.polygon`. A `NULL` polygon means the location is a regular pin.

---

## Export

Click **⬇ Export** when a map is loaded. Downloads a JSON file containing:

- Map name and description
- **Map background image** (`map_image`, base64 data URL — already compressed to ≤ 2 MB at upload time)
- All pinned locations (name, description, x/y coordinates, `icon_scale`, and polygon vertices for regions)
- The distance matrix between locations
- All roads/paths (waypoints with location links, notes, event links, `kind`/`route_type`, label position, per-section distances/bends)

> **Note:** movement *trackers* were retired — they are no longer exported. Old export files that still
> contain a `trackers` array (or `paths[].tracker_ref`/`tracker_id`) import fine; those fields are ignored.

## Import

Journey-map import is now done from **Manage Campaigns → ⬆ Import** (the single import hub) — the
Journey Map module keeps **Export** only. Select the target campaign there, drop the map file, and it:

1. Creates a new journey map in that campaign
2. **Restores the background image** if `map_image` is present
3. Reuses `campaign_locations` by name (case-insensitive) or creates them
4. Re-creates the placed locations (polygon + `icon_scale` preserved), distances, and paths (waypoints remapped)

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
  "paths": [
    {
      "name": "Waterdeep ⇄ Baldur's Gate",
      "notes": "The Trade Way.",
      "kind": "route",
      "route_type": "road",
      "distance_miles": 250,
      "label_x": 40.0,
      "label_y": 49.0,
      "waypoints": [
        { "x": 42.5, "y": 31.0, "locId": 1 },
        { "x": 40.1, "y": 49.8, "segMiles": 120 },
        { "x": 38.2, "y": 68.4, "locId": 2, "segMiles": 130 }
      ]
    }
  ]
}
```

> `map_image` (a base64 data URL) is also a top-level key when the map has a background image; it's
> omitted from this template for brevity.

### Field reference

| Field | Type | Required | Notes |
|---|---|---|---|
| `version` | integer | Yes | Must be `1` |
| `type` | string | Yes | Must be `"journey-map"` |
| `map.name` | string | Yes | Map name |
| `map.description` | string | No | Short description |
| `map_image` | string | No | Top-level base64 data URL of the background image (omitted if none) |
| `locations[].id` | integer | Yes | Used to cross-reference distances and waypoints within this file — replaced with new DB ids on import |
| `locations[].name` | string | Yes | Location name (also used to reuse an existing campaign location on import) |
| `locations[].description` | string | No | Location description (creates the campaign location if it doesn't exist yet) |
| `locations[].x` / `.y` | float | Yes | Position as percentage of image width/height (0–100). For regions, this is the centroid |
| `locations[].polygon` | array | No | Array of `{x, y}` objects (percentages). Present for region-type locations. Minimum 3 points |
| `locations[].icon_scale` | float | No | Per-pin icon size multiplier (default `1`) |
| `distances[].from_loc_id` | integer | Yes | References `locations[].id` in this file |
| `distances[].to_loc_id` | integer | Yes | References `locations[].id` in this file |
| `distances[].distance_miles` | float | Yes | Distance in miles |
| `paths[].name` | string | No | Road/path name |
| `paths[].notes` | string | No | Freeform notes |
| `paths[].kind` | string | No | `"route"` (road network) or `"path"` (legacy movement) |
| `paths[].route_type` | string | No | `"road"`, `"flight"`, or `"maritime"` (routes only) |
| `paths[].distance_miles` | float | No | Total path distance (roads sum their section distances) |
| `paths[].label_x` / `.label_y` | float | No | Dragged name-label position (percent); `null` = default midpoint |
| `paths[].waypoints[].x` / `.y` | float | Yes | Position as percentage (0–100) |
| `paths[].waypoints[].locId` | integer | No | References `locations[].id` in this file |
| `paths[].waypoints[].segMiles` | float | No | Per-section distance for a route segment |
| `paths[].waypoints[].curve` | array | No | Bend control points for a curved road section |
| `paths[].waypoints[].eventIds` | integer[] | No | Timeline event IDs — not remapped on import |
| `paths[].waypoints[].eventTitles` | string[] | No | Cached event titles for display |

> **Legacy / no longer emitted:** `trackers[]` and `paths[].tracker_id` / `tracker_ref` (and the
> `tracker_color_override` / `tracker_name_override` columns behind them). Movement trackers were
> retired — new exports omit these, and imports ignore them in older files.
