# ─────────────────────────────────────────────────────────────
#  D&D Tools — multi-stage Dockerfile
#
#  Stage 1 (frontend-build): installs frontend deps, runs Vite build
#  Stage 2 (production):     copies backend + built frontend assets
#
#  Result: a single image that serves both the React SPA and the
#  Express API from port 3080.
# ─────────────────────────────────────────────────────────────

# ── Stage 1: build the React frontend ────────────────────────
FROM node:24-alpine AS frontend-build

LABEL stage=frontend-build

WORKDIR /build

# Install frontend dependencies (cached layer when package.json unchanged).
# `ci` not `install`, so the image is built from the exact versions in the
# lockfile rather than re-resolving transitive deps on every build. This is only
# possible because the lockfiles are committed — see the note in .gitignore.
# --legacy-peer-deps is still required: eslint-plugin-react does not yet declare
# support for the ESLint version this project pins.
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --legacy-peer-deps

# Copy source and build.
# WORKDIR is /build, and vite.config.js sets outDir '../public/app', so the
# bundle lands at /public/app. Stage 2 copies it from there.
COPY frontend/ ./
RUN npm run build


# ── Stage 2: production image ────────────────────────────────
FROM node:24-alpine AS production

LABEL maintainer="furnaripablojavier@gmail.com"
LABEL description="D&D Campaign Tools – NPC sheets, item cards, PDF viewer, campaign timeline"

WORKDIR /app

# Install backend production dependencies only
# Not a glob: `npm ci` below fails hard without the lockfile, so a missing one
# should break the COPY with a clear error rather than three lines later with
# "npm ci can only install packages when your package-lock.json is in sync".
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy Express application
COPY app.js ./
COPY scripts/ ./scripts/
COPY docs/ ./docs/

# Copy the built React SPA from stage 1 into public/app/.
# app.js serves public/app/ at the ROOT (not at /app/), because Vite emits
# absolute asset paths like /assets/main-xxx.js; the catch-all then returns
# index.html for every client-side route.
COPY --from=frontend-build /public/app/ ./public/app/

# Runtime PDF directory — mount a volume here at run time.
# We do NOT create a non-root user here because Docker volume mounts inherit
# host directory ownership, which typically conflicts with a custom UID/GID
# inside the container and causes "Permission denied" on the pdfs/ folder.
# For a self-hosted private deployment this is an acceptable trade-off.
RUN mkdir -p /app/pdfs

EXPOSE 3080

CMD ["node", "app.js"]
