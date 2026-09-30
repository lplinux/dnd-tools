# 🪟 Split View

A multi-frame reference board for use during D&D sessions. Keep three or four sources on screen at
once — a map, a stat block, a PDF, your notes — without switching tabs.

## Features

- **Three or four frames at once**, in a fixed grid: `4 Frames (2×2)`, `3 Frames (1 tall + 2)`, or
  `3 Frames (1 wide + 2)`
- **An address bar per frame** — type any URL and click **Load** to commit it to that frame
- **Named profiles** — save a layout plus its four URLs under a name and switch between them; useful
  for one arrangement per campaign, or one for prep and one for play
- Profiles persist in your browser's `localStorage`, so they survive a reload

## Usage

Open `/split-view` in your browser after starting the server.

### Choosing a layout

Pick one of the three layouts from the selector in the toolbar. The grid rearranges immediately and
keeps whatever is already loaded. Note the layouts are **fixed grids** — there is no draggable
divider, so frame sizes are not adjustable.

### Loading content

Each frame has its own address bar. Type or paste a URL and click **Load** to commit it to that
frame. A frame with an empty URL stays blank.

Four URLs are stored per profile regardless of the layout, so switching from a 4-frame layout to a
3-frame one keeps the fourth URL — it reappears when you switch back.

### Profiles

Use the profile selector in the toolbar to switch between saved arrangements, create a new one, or
delete the current one. A profile stores the layout and all four URLs. Creating a profile with a
name that already exists is rejected.

> Profiles live only in your own browser (`localStorage`, key `splitview-profiles`). They are not
> saved to the server and are not shared between devices or users.

### Suggested uses

| Frame | Content |
|---|---|
| 1 | Journey Map (`/journey-map`) |
| 2 | NPC Sheet (`/npc-sheet`) |
| 3 | PDF Viewer (`/pdf-viewer`) |
| 4 | Timeline (`/timeline`) |

## Notes

Some external websites (Google, YouTube, etc.) block being loaded inside an iframe via
`X-Frame-Options` or `Content-Security-Policy`. This tool works best with this app's own pages and
other sites that permit embedding.
