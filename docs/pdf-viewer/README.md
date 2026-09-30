# 📖 PDF Viewer

A browser-based PDF viewer that serves files from the server's `pdfs/` folder. Keep your rulebooks, supplements, and adventures accessible during a session without switching applications.

**Access:** DM only — `/pdf-viewer` (the `/api/pdfs` listing is DM-only too).

## Features

- Lists all PDFs in the `pdfs/` folder automatically, in a collapsible sidebar
- **Page-by-page rendering** onto a canvas via [pdf.js](https://mozilla.github.io/pdf.js/) — no
  browser plugin and no reliance on the browser's own PDF engine, so every browser renders it
  identically
- **Zoom** — slider, `+` / `−` buttons, and **Fit to width**
- **Direct page number input**, plus previous/next page controls
- **Fullscreen** overlay with its own canvas and controls bar
- **Keyboard navigation** — `←` `→` `↑` `↓` to change page, `+` / `−` to zoom, `F` for fullscreen,
  `Escape` to close it

> **pdf.js is loaded from a CDN** (`cdnjs.cloudflare.com`, v3.11.174), so the first page render on a
> given browser needs internet access even though the PDFs themselves are served locally. Once the
> library is cached by the browser, viewing works offline.

## Usage

Open `/pdf-viewer` in your browser after starting the server.

### Adding PDFs

Place any `.pdf` files in the `pdfs/` folder at the project root:

```
dnd-tools/
├── app.js
├── public/
└── pdfs/
    ├── players-handbook.pdf
    ├── dungeon-masters-guide.pdf
    └── ...
```

Refresh the PDF Viewer page — the new files will appear in the list immediately.

### Running with Docker / Podman

When running in a container, the `pdfs/` folder must be **mounted** from the host:

```bash
# Docker
docker run -d -p 3080:3080 \
  -v /path/to/your/pdfs:/app/pdfs:ro \
  dnd-tools

# Podman
podman run -d -p 3080:3080 \
  -v /path/to/your/pdfs:/app/pdfs:ro,z \
  dnd-tools
```

Files added to the host folder while the container is running are immediately visible — no restart needed.

### Supported formats

Only `.pdf` files are listed. Other file types in the folder are ignored.

## Notes

PDF files are served as static files over HTTP. They are accessible to anyone who can reach the server, so keep the server on a trusted local network if your PDFs contain licensed content.
