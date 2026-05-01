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
