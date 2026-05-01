# 📜 Campaign Timeline

A server-backed timeline tool for D&D campaigns. Tracks events for multiple players across locations using either the **Calendar of Harptos** (Faerûn) or the **Gregorian calendar**. Each campaign has one shared DM timeline and separate private timelines per player.

## Features

- **Campaign-based** — timelines belong to a campaign; data is stored in PostgreSQL
- **Two calendar systems** — Harptos (12 × 30-day months + 5 festival days) and Gregorian
- **Event duration** — set duration as `1d`, `3m`, `2y`; events render as bars on the graph
- **Per-player colour lanes** — each player gets their own horizontal lane within a location column
- **Connection lines** — bezier curves link each player's events in chronological order
- **Segment-compressed Y axis** — empty years between event clusters collapse to a small gap bar
- **Today marker** — per-campaign date marker managed from the Campaign Manager
- **Show/hide players and locations** — for sharing your screen with players
- **Three themes** — Dark, Light, Slate (persisted in localStorage)
- **Table view** — chronological table with CSV export
- **Search** — instant search across titles, descriptions, locations, and player names
- **Drag to move events** — drag any event circle to a new date or column
- **Location column reorder** — drag location names in the sidebar to reorder columns
- **Private player timelines** — each player has their own private journal, viewable by the DM in a combined view
- **Public share link** — generate a read-only token to share the timeline with players

## Usage

Open `/timeline` in your browser after starting the server.

Select a **Campaign** from the header. DMs see all players and locations. Players see only their own data.

### Timeline Graph View (with demo data)
![alt text](img/main_screen_dark_mode.png "Main Screen Dark Mode")
![alt text](img/main_screen_dark_blue_mode.png "Main Screen Dark Blue Mode")
![alt text](img/main_screen_light_mode.png "Main Screen Light Mode")

### Timeline Table View (with demo data)
![alt text](img/event_table_mode.png "Event Table Mode")

### Create a new Timeline
![alt text](img/new_timeline_menu.png "New Timeline Menu")

### Set a Today Marker

The Today Marker is set in **Manage Campaigns** (`/manage-campaigns`):

1. Select the campaign
2. Open **📍 Today Marker** and click **📅 Set Date**
3. Choose year, month, and day; click **Set Marker**

A white/blue line will appear across the full timeline at that date.

### Adding Players and Locations

Players and locations are managed in **Manage Campaigns** (`/manage-campaigns`). The timeline reflects the campaign's player list and uses campaign locations as column headers.

### Adding an event

1. Open the **New Event** section in the sidebar
2. Select one or more players
3. Choose a location, date, and optional duration
4. Click **Add Event** — the timeline scrolls to it and highlights it

![alt text](img/sidebar_menu_2.png "Sidebar Menu to Add Events")

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

All timeline data is stored in PostgreSQL under the campaign. Use the **Export** button to download a JSON backup. The **Import** button can restore from a backup file.

Theme preference is stored in the browser's `localStorage`.
