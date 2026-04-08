# Architecture

## Overview

D&D Campaign Tools is a deliberately simple, zero-dependency web application. The server is a thin Express.js static-file host; all application logic runs in the browser.

```
┌─────────────────────────────────────┐
│            Browser (client)          │
│                                     │
│  ┌──────────┐  ┌─────────────────┐  │
│  │ Timeline │  │ Other tools     │  │
│  │ (SPA)    │  │ (static HTML)   │  │
│  └────┬─────┘  └────────┬────────┘  │
│       │ localStorage     │           │
└───────┼──────────────────┼───────────┘
        │ HTTP              │ HTTP
┌───────┼──────────────────┼───────────┐
│       ▼       Node.js     ▼          │
│  ┌──────────────────────────────┐    │
│  │        Express server        │    │
│  │  app.js  – port 3080         │    │
│  └──────────────────────────────┘    │
│        │               │             │
│  ┌─────▼──────┐  ┌─────▼──────┐     │
│  │ public/    │  │  pdfs/     │     │
│  │ (static)   │  │ (static)   │     │
│  └────────────┘  └────────────┘     │
└──────────────────────────────────────┘
```

---

## Server (`app.js`)

| Concern | Implementation |
|---|---|
| Static files | `express.static('public')` |
| PDF serving | `express.static('pdfs')` on `/pdfs` |
| Named routes | One `GET` per tool, all `res.sendFile` |
| Framework | Express 5 |
| Port | 3080 (hardcoded) |
| Auth | None – intended for local / LAN use |

The server has no database, no sessions, no authentication. It is meant to run on a trusted local network or a personal VPS behind a reverse proxy.

---

## Timeline tool (`public/timeline.html`)

The timeline is a single-file SPA (~1 600 lines). It depends only on a Google Fonts CDN import and nothing else.

### Data model

All state lives in `localStorage` under two key namespaces:

| Key | Contents |
|---|---|
| `ht-profiles` | `{ profiles: Profile[], activeId: string }` |
| `ht-db-<profileId>` | `DB` object (see below) |
| `ht-ui` | Collapsed sections, theme, hidden players/locs |

**Profile**
```ts
{ id: string; name: string; calendarType: 'harptos' | 'gregorian' }
```

**DB** (per profile)
```ts
{
  players:       Player[];
  locations:     string[];
  locationOrder: string[];   // manual column order
  events:        Event[];
  todayAbs:      number | null; // absolute day index of "today" marker
}
```

**Player**
```ts
{ id: string; name: string; color: string /* CSS hex */ }
```

**Event**
```ts
{
  id:           string;
  title:        string;
  playerIds:    string[];
  location:     string;
  year:         number;
  dayOfYear:    number;    // 1-based within calendar year
  durationDays: number;    // ≥ 1
  description?: string;
}
```

### Calendar systems

| System | Year length | Leap years | Months |
|---|---|---|---|
| Harptos (Faerûn) | 365 days | None | 12 × 30-day months + 5 festival days |
| Gregorian | 365 / 366 days | Standard | 12 calendar months |

Absolute day indices (`absDay`) are computed from epoch (year 1, day 1) so events from any era can be placed on the same axis.

### Rendering

The timeline graph is rendered as inline SVG. There is no canvas, no WebGL, no charting library.

Key rendering concepts:

- **Segment-compressed Y axis** — empty years between event clusters are collapsed to a 32 px gap bar, keeping the viewport efficient regardless of how spread-out events are.
- **Dynamic column width** — each location column fills `floor(availableWidth / numColumns)`, minimum 90 px, and recomputes on `window.resize`.
- **Duration bars** — events with `durationDays > 1` render a semi-transparent pill from start to end date, with the event circle at the start.
- **Player connections** — bezier curves connect each player's events in chronological order, from the end of one event to the start of the next.
- **Pie slices** — events shared by multiple players render as a color pie chart.
- **Today line** — a full-width white/blue/dark line (theme-dependent) marks the "today" date. Stored per-profile in `db.todayAbs`.

### Themes

Three CSS custom-property themes are defined on `:root` / `[data-theme]`:

| Theme | Palette |
|---|---|
| `dark` | Charcoal parchment with amber gold |
| `light` | Warm cream with dark ink |
| `slate` | GitHub dark with blue accents |

Theme is stored in `ht-ui` and applied via `document.documentElement.setAttribute('data-theme', ...)`.

---

## Container

The Dockerfile uses a multi-step approach:

1. `node:20-alpine` base (small footprint, ~50 MB compressed)
2. `npm ci --omit=dev` installs only production deps
3. A non-root `dnd` user runs the process
4. The `pdfs/` directory is expected as a **bind mount** at runtime

```
/app
├── app.js
├── node_modules/   (production only)
├── public/
└── pdfs/           ← bind-mount from host
```

The container exposes port `3080`. No volumes are declared in the image itself — the PDF folder is always a bind mount so the user controls where PDFs live on the host.

---

## Extending

**Adding a new tool:**

1. Create `public/my-tool.html`
2. Add a route in `app.js`:
   ```js
   app.get('/my-tool', (req, res) =>
     res.sendFile(path.join(__dirname, 'public', 'my-tool.html')));
   ```
3. Rebuild the Docker image if running containerised.

**Adding server-side persistence:**

The simplest upgrade is SQLite via `better-sqlite3`. Because all current tools are localStorage-only, this would only affect new tools.

**Adding authentication:**

For LAN use, HTTP Basic Auth via a reverse proxy (nginx, Caddy) is the recommended approach. Do not expose this application directly to the internet without authentication.
