#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  D&D Tools — run.sh
#
#  From a fresh clone:   ./run.sh
#
#  Steps:
#    1.  Verify prerequisites (Node.js 18+, npm, Docker/Podman + Compose)
#    2.  Copy .env.example → .env if missing
#    3.  npm install         (backend, skipped if up to date)
#    4.  npm install         (frontend, skipped if up to date)
#    5.  npm test            (vitest, ~1s; SKIP_TESTS=1 to bypass)
#    6.  npm run build       (React → public/app/, skipped if built & unchanged)
#    7.  docker compose build  (builds the multi-stage image)
#    8.  Start postgres container
#    9.  Wait for postgres to be healthy
#    10. node scripts/setup-db.js --db-only  (create DB if missing)
#    11. Start dnd-tools container, then:
#          - wait for the backend to return HTTP 200
#          - node scripts/setup-db.js        (create initial admin if missing)
#          - print the banner and keep running; Ctrl+C stops everything cleanly
#
#  The numbers match the "N/11" banners the script prints. The last four actions
#  share step 11 because they share one banner.
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${CYAN}  ▸ $*${RESET}"; }
success() { echo -e "${GREEN}  ✓ $*${RESET}"; }
warn()    { echo -e "${YELLOW}  ⚠ $*${RESET}"; }
err()     { echo -e "${RED}  ✗ $*${RESET}"; }
header()  { echo -e "\n${BOLD}$*${RESET}"; }

# ── Guard: must run from repo root ────────────────────────────────────────────
# Only TRACKED paths may be tested here. This used to require `public/` too,
# which is gitignored Vite build output — so on a fresh clone (the very case
# step 6 exists to handle, and the header advertises) the script aborted here
# with a message blaming the working directory, which was not the problem.
if [[ ! -f "app.js" || ! -d "frontend" ]]; then
  err "Please run this script from the dnd-tools repository root."
  exit 1
fi

CREDS_FILE="/tmp/dndtools-init-creds.txt"
rm -f "$CREDS_FILE"

header "═══════════════════════════════════════════"
header " 🎲  D&D Campaign Tools"
header "═══════════════════════════════════════════"

# ── 1. Prerequisites ──────────────────────────────────────────────────────────
header "1/11  Checking prerequisites…"

# Node.js (18+)
if ! command -v node &>/dev/null; then
  err "Node.js is not installed. Download it from https://nodejs.org (v18+)."
  exit 1
fi
NODE_MAJOR=$(node -e 'process.stdout.write(process.versions.node.split(".")[0])')
if [[ "$NODE_MAJOR" -lt 20 ]]; then
  err "Node.js v$NODE_MAJOR found — v20 or later is required."
  exit 1
fi
success "Node.js $(node -e 'process.stdout.write(process.versions.node)')"

# npm
if ! command -v npm &>/dev/null; then
  err "npm is not installed (should come with Node.js)."; exit 1
fi
success "npm $(npm --version)"

# Docker or Podman
CONTAINER_CMD=""
if   command -v podman &>/dev/null; then CONTAINER_CMD="podman"
elif command -v docker &>/dev/null; then CONTAINER_CMD="docker"
else err "Neither Docker nor Podman found. Install one to continue."; exit 1
fi
success "$CONTAINER_CMD $(${CONTAINER_CMD} --version | head -1)"

# Docker Compose
if $CONTAINER_CMD compose version &>/dev/null 2>&1; then
  COMPOSE="$CONTAINER_CMD compose"
elif command -v docker-compose &>/dev/null; then
  COMPOSE="docker-compose"
else
  err "Docker Compose plugin not found."
  echo "  Install it: https://docs.docker.com/compose/install/"
  exit 1
fi
success "compose (${COMPOSE})"

# The daemon must be RUNNING, not merely installed. `compose version` answers
# without it, so without this check the first real contact is the image build,
# which fails with a raw "Cannot connect to the Docker daemon" and no guidance.
if ! $CONTAINER_CMD info &>/dev/null 2>&1; then
  err "$CONTAINER_CMD is installed but its daemon is not responding."
  if [[ "$CONTAINER_CMD" == "podman" ]]; then
    echo "  Start it:  podman machine start"
  else
    echo "  Start Docker Desktop, or:  sudo systemctl start docker"
  fi
  exit 1
fi
success "$CONTAINER_CMD daemon responding"

# Ports must be free before compose tries to bind them. Without this, 15432 in
# use fails with an opaque bind error — and 3080 in use is worse: the readiness
# poll later goes green against whatever else is answering, and the banner then
# points you at a foreign service.
# /dev/tcp is a bash builtin, which is why this script requires bash.
port_busy() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null && return 0 || return 1; }
# `--filter name=` deliberately, NOT `publish=`: the latter is Docker-only and
# podman rejects it outright, which under `set -e` aborted the whole run with no
# message at all.
ours_running() { $CONTAINER_CMD ps --filter "name=$1" --format '{{.Names}}' 2>/dev/null | grep -qx "$1"; }

PORTS_OK=true
for spec in "3080:dnd-tools" "15432:dnd-tools-ref-db"; do
  p="${spec%%:*}"; owner="${spec##*:}"
  if port_busy "$p"; then
    # Our own container holding the port is the normal re-run case, not a clash.
    if ours_running "$owner"; then
      info "port $p held by $owner (this project) — it will be reused"
    else
      err "Port $p is in use by something that is not this project."
      echo "  Find it:  lsof -nP -iTCP:$p -sTCP:LISTEN"
      echo "  Free that port, or change the mapping in docker-compose.yml."
      PORTS_OK=false
    fi
  fi
done
[[ "$PORTS_OK" == "true" ]] || exit 1
success "ports 3080 and 15432 are usable"

# curl (optional — used for health check)
HAS_CURL=true
if ! command -v curl &>/dev/null; then
  warn "curl not found — backend health check will use a sleep fallback."
  HAS_CURL=false
fi

# ── 2. .env setup ─────────────────────────────────────────────────────────────
header "2/11  Environment configuration…"

if [[ ! -f ".env" ]]; then
  if [[ -f ".env.example" ]]; then
    cp .env.example .env
    warn ".env not found — copied from .env.example."

    # Replace the published placeholder secrets with real ones. Both are in the
    # repository, so shipping them means anyone can forge a session cookie or a
    # share-link token. Node is already a verified prerequisite by this point.
    # Only ever applied to a .env we just created — an existing one is untouched.
    gen_secret() { node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"; }
    SESSION_GEN="$(gen_secret)"
    ID_GEN="$(gen_secret)"
    # -i '' is the BSD/macOS form; GNU sed wants -i with no argument.
    if sed --version >/dev/null 2>&1; then SED_INPLACE=(-i); else SED_INPLACE=(-i ''); fi
    sed "${SED_INPLACE[@]}" "s|^SESSION_SECRET=.*|SESSION_SECRET=${SESSION_GEN}|" .env
    sed "${SED_INPLACE[@]}" "s|^ID_SECRET=.*|ID_SECRET=${ID_GEN}|" .env
    success "Generated random SESSION_SECRET and ID_SECRET"

    echo ""
    echo -e "  ${YELLOW}Still worth reviewing in .env before production:${RESET}"
    echo "    DB_PASSWORD     — must match docker-compose.yml"
    echo ""
    # Only pause for a human. Under `run.sh < /dev/null` or CI, `read` hits EOF
    # and returns non-zero, which `set -e` turns into an abort — after .env has
    # already been written.
    if [[ -t 0 ]]; then
      read -r -p "  Press Enter to continue, or Ctrl+C to edit .env first… "
    fi
  else
    warn ".env not found and no .env.example — using built-in defaults."
  fi
else
  success ".env found"
fi

# ── 3. Backend npm install ────────────────────────────────────────────────────
header "3/11  Backend dependencies…"

if [[ ! -d "node_modules" ]] || [[ "package.json" -nt "node_modules" ]]; then
  info "Running npm install (backend)…"
  npm install
  success "Backend npm install complete"
else
  success "Backend node_modules up to date"
fi

# ── 4. Frontend npm install ───────────────────────────────────────────────────
header "4/11  Frontend dependencies…"

if [[ ! -d "frontend/node_modules" ]] || [[ "frontend/package.json" -nt "frontend/node_modules" ]]; then
  info "Running npm install (frontend)…"
  # --legacy-peer-deps avoids resolution failures when peer dep ranges are
  # stricter than the installed version (e.g. @vitejs/plugin-react vs vite).
  (cd frontend && npm install --legacy-peer-deps)
  success "Frontend npm install complete"
else
  success "Frontend node_modules up to date"
fi

# ── 5. Frontend build ─────────────────────────────────────────────────────────
header "5/11  Running tests…"

if [[ "${SKIP_TESTS:-0}" == "1" ]]; then
  warn "SKIP_TESTS=1 — skipping the test suite"
elif (cd frontend && npm test --silent); then
  success "Tests passed"
else
  err "Tests failed. Fix them, or re-run with SKIP_TESTS=1 to bypass."
  # Plain exit, not cleanup(): nothing is running yet at this point, and
  # cleanup() ends in `exit 0` — which would report success on a failed suite.
  exit 1
fi

# ── 6. Frontend build ─────────────────────────────────────────────────────────
header "6/11  Building React frontend…"

# Vite writes straight into public/app/ (see frontend/vite.config.js), which is
# what Express serves. Rebuild if that is missing, or if any source is newer.
NEEDS_BUILD=false
if [[ ! -f "public/app/index.html" ]]; then
  NEEDS_BUILD=true
  info "public/app not built yet — building…"
elif find frontend/src frontend/index.html frontend/tailwind.config.js \
     -newer public/app/index.html 2>/dev/null | grep -q .; then
  NEEDS_BUILD=true
  info "Source files changed — rebuilding…"
else
  success "public/app is up to date — skipping build"
fi

if $NEEDS_BUILD; then
  (cd frontend && npm run build)
  success "React build complete → public/app/"
fi

# ── 6. Docker image build ─────────────────────────────────────────────────────
header "7/11  Building Docker image…"

info "Running: $COMPOSE build dnd-tools"
$COMPOSE build dnd-tools
success "Docker image built"

# ── Cleanup trap ──────────────────────────────────────────────────────────────
# Takes an exit code. Ctrl+C is a successful stop (0); the failure paths below
# pass 1, because this used to `exit 0` unconditionally — so "PostgreSQL did not
# become healthy" and "Backend did not respond" both reported success to anything
# wrapping this script.
cleanup() {
  local code="${1:-0}"
  echo ""
  header "Shutting down…"
  $COMPOSE down || true
  exit "$code"
}
trap cleanup SIGINT SIGTERM

# ── 7. Start postgres ─────────────────────────────────────────────────────────
header "8/11  Starting PostgreSQL…"

mkdir -p pdfs   # ensure the volume mount source exists

if $CONTAINER_CMD inspect dnd-tools-ref-db &>/dev/null 2>&1; then
  RUNNING=$($CONTAINER_CMD inspect --format='{{.State.Running}}' dnd-tools-ref-db 2>/dev/null || echo "false")
  if [[ "$RUNNING" == "true" ]]; then
    success "postgres container already running"
  else
    info "Restarting existing postgres container…"
    $COMPOSE up -d postgres
    success "postgres container started"
  fi
else
  info "Starting postgres service…"
  $COMPOSE up -d postgres
  success "postgres container started"
fi

# Ensure pdfs/ folder exists and is readable by the container
mkdir -p pdfs
chmod 755 pdfs

# ── 8. Wait for postgres healthy ──────────────────────────────────────────────
header "9/11  Waiting for PostgreSQL to be healthy…"

MAX=60
for ((i=1; i<=MAX; i++)); do
  STATUS=$($CONTAINER_CMD inspect --format='{{.State.Health.Status}}' dnd-tools-ref-db 2>/dev/null || echo "missing")
  if [[ "$STATUS" == "healthy" ]]; then
    success "PostgreSQL is healthy"
    break
  fi
  if [[ $i -eq $MAX ]]; then
    err "PostgreSQL did not become healthy after ${MAX}s."
    err "Run: $CONTAINER_CMD logs dnd-tools-ref-db"
    cleanup 1
  fi
  printf "\r  Waiting… (%d/%ds) status=%-10s" "$i" "$MAX" "$STATUS"
  sleep 1
done
echo ""

# ── 9. Create database if missing ─────────────────────────────────────────────
header "10/11  Database initialisation…"

node scripts/setup-db.js --db-only
success "Database ready"

# ── 10. Start the app container ───────────────────────────────────────────────
header "11/11  Starting app…"

APP_RUNNING=false
if $CONTAINER_CMD inspect dnd-tools &>/dev/null 2>&1; then
  APP_RUNNING=$($CONTAINER_CMD inspect --format='{{.State.Running}}' dnd-tools 2>/dev/null || echo "false")
fi

# Unconditional: `up -d` is idempotent, and it RECREATES the container when the
# image has changed. The previous "already running, skip" short-circuit meant a
# code change rebuilt the image at step 7 and then kept serving the old one.
info "Starting dnd-tools service…"
$COMPOSE up -d dnd-tools
if [[ "$APP_RUNNING" == "true" ]]; then
  success "App container up to date with the built image"
else
  success "App container started"
fi

# ── Wait for backend ──────────────────────────────────────────────────────────
info "Waiting for backend to accept requests…"

if $HAS_CURL; then
  MAX=60
  for ((i=1; i<=MAX; i++)); do
    HTTP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 2 http://localhost:3080/ 2>/dev/null || true)
    if [[ "$HTTP" == "200" || "$HTTP" == "302" || "$HTTP" == "301" ]]; then
      success "Backend is up (HTTP $HTTP)"
      break
    fi
    if [[ $i -eq $MAX ]]; then
      err "Backend did not respond after ${MAX}s."
      err "Run: $CONTAINER_CMD logs dnd-tools"
      cleanup 1
    fi
    printf "\r  Waiting… (%d/%ds) HTTP=%-5s" "$i" "$MAX" "$HTTP"
    sleep 1
  done
  echo ""
else
  warn "No curl — waiting 10s for app startup…"
  sleep 10
fi

# ── Initial admin ─────────────────────────────────────────────────────────────
# app.js runs initializeDatabase() on startup so tables exist by now
node scripts/setup-db.js
success "Setup complete"

# ── Banner ────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}═══════════════════════════════════════════════════${RESET}"
echo -e "${GREEN}${BOLD} ✅  D&D Tools is running!${RESET}"
echo -e "${GREEN}${BOLD}═══════════════════════════════════════════════════${RESET}"
echo ""
echo -e "  🌐  ${CYAN}http://localhost:3080${RESET}   ← use this one (React SPA + API)"
echo -e "  ℹ️   Port 5173 is only for local dev (${BOLD}npm run dev${RESET} inside frontend/)"
echo ""

if [[ -f "$CREDS_FILE" ]]; then
  INIT_USER=$(sed -n '1p' "$CREDS_FILE")
  INIT_PASS=$(sed -n '2p' "$CREDS_FILE")
  rm -f "$CREDS_FILE"
  echo -e "${YELLOW}${BOLD}  ╔══════════════════════════════════════════════╗${RESET}"
  echo -e "${YELLOW}${BOLD}  ║  🔑  Initial admin credentials               ║${RESET}"
  echo -e "${YELLOW}${BOLD}  ║                                              ║${RESET}"
  printf "${YELLOW}${BOLD}  ║  Username : ${RESET}${BOLD}%-30s${YELLOW}${BOLD}║${RESET}\n" "$INIT_USER"
  printf "${YELLOW}${BOLD}  ║  Password : ${RESET}${BOLD}%-30s${YELLOW}${BOLD}║${RESET}\n" "$INIT_PASS"
  echo -e "${YELLOW}${BOLD}  ║                                              ║${RESET}"
  echo -e "${YELLOW}${BOLD}  ║  ⚠  Change this password after first login  ║${RESET}"
  echo -e "${YELLOW}${BOLD}  ╚══════════════════════════════════════════════╝${RESET}"
  echo ""
fi

echo "  Useful commands:"
echo "    node scripts/create-admin.js      — add another admin account"
echo "    $CONTAINER_CMD logs -f dnd-tools          — stream app logs"
echo "    $CONTAINER_CMD logs -f dnd-tools-ref-db        — stream DB logs"
echo "    $COMPOSE down                      — stop everything"
echo "    $COMPOSE down -v                   — stop and wipe DB volume"
echo ""
echo -e "  Press ${BOLD}Ctrl+C${RESET} to stop all services."
echo ""

while true; do sleep 1; done
