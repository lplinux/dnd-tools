# ⚔ D&D Campaign Tools

A self-hosted Node.js web application with a suite of tools for tabletop RPG campaign management, all accessible from a single server.

## Tools included

| Route | Tool |
|---|---|
| `/` | Index / landing |
| `/timeline` | Campaign Timeline (Calendar of Harptos or Gregorian) |
| `/npc-sheet` | NPC Character Sheet |
| `/item-cards` | Item Card Creator |
| `/full-item-cards` | Full-page Item Cards |
| `/split-view` | Split-screen reference view |
| `/pdf-viewer` | PDF viewer (reads from the `pdfs/` folder) |

---

## Quick start (local Node.js)

**Requirements:** Node.js 18 or newer.

```bash
git clone https://github.com/your-username/dnd-tools.git
cd dnd-tools
npm install
node app.js
```

Then open <http://localhost:3080> in your browser.

To serve your own PDFs, place `.pdf` files in a `pdfs/` folder at the project root.

---

## Running with Docker

### Build the image

```bash
docker build -t dnd-tools .
```

### Run (no PDFs)

```bash
docker run -d \
  --name dnd-tools \
  -p 3080:3080 \
  dnd-tools
```

### Run with a PDF folder mounted

```bash
docker run -d \
  --name dnd-tools \
  -p 3080:3080 \
  -v /absolute/path/to/your/pdfs:/app/pdfs:ro \
  dnd-tools
```

The `:ro` flag mounts the folder read-only inside the container (recommended).

### Stop / remove

```bash
docker stop dnd-tools
docker rm dnd-tools
```

---

## Running with Podman

Podman is a drop-in replacement for Docker and runs rootless by default.

### Build

```bash
podman build -t dnd-tools .
```

### Run (no PDFs)

```bash
podman run -d \
  --name dnd-tools \
  -p 3080:3080 \
  localhost/dnd-tools
```

### Run with a PDF folder

```bash
podman run -d \
  --name dnd-tools \
  -p 3080:3080 \
  -v /absolute/path/to/your/pdfs:/app/pdfs:ro,z \
  localhost/dnd-tools
```

> **Note:** The `,z` flag is important on SELinux-enabled systems (Fedora, RHEL, etc.) — it relabels the volume so the container process can read it.

### Rootless auto-start with systemd (Podman only)

```bash
# Generate a systemd unit
mkdir -p ~/.config/systemd/user
podman generate systemd --name dnd-tools --files --new
mv container-dnd-tools.service ~/.config/systemd/user/

systemctl --user daemon-reload
systemctl --user enable --now container-dnd-tools.service
```

---

## Docker Compose

A `docker-compose.yml` is provided for convenience:

```bash
# Start
docker compose up -d

# With a local pdfs/ folder (already wired up in compose file)
docker compose up -d

# Stop
docker compose down
```

---

## Environment / configuration

The app currently takes no environment variables. The port is hardcoded to `3080`. To change it, edit the `PORT` constant at the top of `app.js` before building.

---

## Data persistence

The **Campaign Timeline** stores all data in the browser's `localStorage`. No server-side persistence is needed; data lives in the user's browser and can be exported/imported as JSON via the Export / Import buttons in the timeline UI.

---

## Project structure

```
dnd-tools/
├── app.js              # Express server
├── package.json
├── Dockerfile
├── docker-compose.yml
├── public/
│   ├── timeline.html   # Campaign Timeline
│   ├── npc-sheet.html
│   ├── item-cards.html
│   ├── full-item-cards.html
│   ├── split-view.html
│   ├── pdf-viewer.html
│   └── styles.css
└── pdfs/               # Drop your PDFs here (gitignored)
```

See [ARCH.md](ARCH.md) for a deeper technical overview.
