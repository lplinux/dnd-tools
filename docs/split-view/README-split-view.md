# 🪟 Split View

A side-by-side reference pane for use during D&D sessions. Display two sources of information simultaneously without switching tabs.

## Features

- Two independently scrollable panels side by side
- Load any URL from your browser into either panel
- Adjustable divider — drag to resize the panels
- Useful for comparing two PDFs, two sheets, or a map and a stat block

## Usage

Open `/split-view` in your browser after starting the server.

### Loading content

Each panel has an address bar at the top. Type or paste any URL and press **Enter** (or click **Go**) to load that page in the panel.

### Suggested uses

| Left panel | Right panel |
|---|---|
| NPC Sheet (`/npc-sheet`) | Item Cards (`/item-cards`) |
| PDF Viewer (`/pdf-viewer`) | NPC Sheet (`/npc-sheet`) |
| Monster stat block | Encounter tracker |
| Map image URL | Adventure text |

### Resizing panels

Drag the vertical divider bar between the two panels left or right to adjust their relative widths.

## Notes

Some external websites (Google, YouTube, etc.) block being loaded inside an iframe due to security headers (`X-Frame-Options`). This tool works best with locally hosted pages or sites that permit embedding.
