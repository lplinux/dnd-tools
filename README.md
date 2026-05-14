# ⚔️ D&D Campaign Tools

A self-hosted Node.js web application with a full suite of tools for tabletop RPG campaign management. All modules share a single Express server backed by a PostgreSQL database with role-based authentication.

## Modules

| Route | Tool | Access |
|---|---|---|
| `/` | Index / landing page | Public |
| `/item-cards` | Magic Item Card Creator | Public |
| `/journey-map-public/:token` | Shared read-only Journey Map | Public (token) |
| `/journey-map` | Journey Path Map | DM |
| `/manage-campaigns` | Campaign Manager | DM |
| `/npc-sheet` | NPC Character Sheet | Public |
| `/pc-public/:token` | Shared read-only PC Sheet | Public (token) |
| `/pc-sheet` | Player Character Sheet | DM, Player |
| `/pdf-viewer` | In-browser PDF Viewer | DM |
| `/split-view` | Split-screen Reference View | Public |
| `/timeline-public/:token` | Shared read-only Timeline | Public (token) |
| `/timeline` | Campaign Timeline | DM, Player |
| `/user-panel` | User & Role Management | Admin |

Each module card on the index page has an **ℹ** button that opens a formatted in-page modal showing the module's `docs/<module>/README.md`. The markdown is fetched from `GET /api/docs/:module` (whitelisted slugs only; no path traversal).

---

## Quick start (local Node.js)

**Requirements:** Node.js 18+, PostgreSQL 14+.

```bash
git clone https://github.com/your-username/dnd-tools.git
cd dnd-tools
npm install
```

Create a `.env` file at the project root (see `.env.example`):

```env
DATABASE_URL=postgres://user:password@localhost:5432/dndtools
SESSION_SECRET=your-secret-here
PORT=3080
```

Start the server:

```bash
node app.js
```

Open <http://localhost:3080>. On first run the database schema is created automatically. Create your first admin account through the registration flow.

---

## Running with Docker

### Build the image

```bash
docker build -t dnd-tools .
```

### Run

```bash
docker run -d \
  --name dnd-tools \
  -p 3080:3080 \
  -e DATABASE_URL=postgres://user:password@host:5432/dndtools \
  -e SESSION_SECRET=your-secret-here \
  dnd-tools
```

### With a PDF folder mounted

```bash
docker run -d \
  --name dnd-tools \
  -p 3080:3080 \
  -e DATABASE_URL=postgres://user:password@host:5432/dndtools \
  -e SESSION_SECRET=your-secret-here \
  -v /absolute/path/to/your/pdfs:/app/pdfs:ro \
  dnd-tools
```

### Stop / remove

```bash
docker stop dnd-tools
docker rm dnd-tools
```

---

## Running with Podman

```bash
podman build -t dnd-tools .

podman run -d \
  --name dnd-tools \
  -p 3080:3080 \
  -e DATABASE_URL=postgres://user:password@host:5432/dndtools \
  -e SESSION_SECRET=your-secret-here \
  -v /absolute/path/to/your/pdfs:/app/pdfs:ro,z \
  localhost/dnd-tools
```

> **Note:** The `,z` flag is required on SELinux-enabled systems (Fedora, RHEL) to relabel the volume.

### Rootless auto-start with systemd

```bash
mkdir -p ~/.config/systemd/user
podman generate systemd --name dnd-tools --files --new
mv container-dnd-tools.service ~/.config/systemd/user/

systemctl --user daemon-reload
systemctl --user enable --now container-dnd-tools.service
```

---

## Docker Compose

```bash
# Start (configure DATABASE_URL and SESSION_SECRET in docker-compose.yml first)
docker compose up -d

# Stop
docker compose down
```

---

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `SESSION_SECRET` | Yes | — | Secret key for session signing |
| `PORT` | No | `3080` | HTTP port to listen on |

---

## User roles

| Role | Access |
|---|---|
| `admin` | Full access — user management, all DM tools |
| `dm` | Campaign tools — manage campaigns, journey maps, timelines, PDF viewer |
| `player` | Player tools — PC sheet, timeline view |

---

## Data persistence

All data is stored in PostgreSQL. The schema is initialised automatically on first startup (`initializeDatabase()` in `app.js`). See [ARCH.md](ARCH.md) for the full data model.

PDF files are served as static files from the `pdfs/` folder and are **not** stored in the database.

---

## Project structure

```
dnd-tools/
├── .env                    # Local config (gitignored)
├── app.js                  # Express server, all API routes, DB schema
├── package.json
├── ARCH.md                 # Technical architecture
├── TODO.md                 # Known issues and planned work
├── Dockerfile
├── docker-compose.yml
├── docs/
│   ├── item-cards/README.md
│   ├── journey-map/README.md
│   ├── manage-campaigns/README.md
│   ├── npc-sheet/README.md
│   ├── pc-sheet/README.md
│   ├── pdf-viewer/README.md
│   ├── split-view/README.md
│   ├── timeline/README.md
│   └── user-panel/README.md
├── public/
│   ├── index.html
│   ├── item-cards.html
│   ├── journey-map-public.html
│   ├── journey-map.html
│   ├── manage-campaigns.html
│   ├── npc-sheet.html
│   ├── pc-public.html
│   ├── pc-sheet.html
│   ├── pdf-viewer.html
│   ├── split-view.html
│   ├── timeline.html
│   ├── user-panel.html
│   ├── header-component.js  # Shared auth/nav header
│   └── styles.css
└── pdfs/                   # Drop your PDFs here (gitignored)
```

See [ARCH.md](ARCH.md) for a deeper technical overview.
