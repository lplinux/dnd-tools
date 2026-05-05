#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# D&D Tools — run.sh
#
# From a fresh clone:   ./run.sh
#
# Steps:
#   1. Verify prerequisites (Node.js, npm, Docker/Podman)
#   2. Copy .env.example → .env if missing
#   3. npm install  (skipped if node_modules is current)
#   4. Start the postgres container only
#   5. Wait for postgres to be healthy
#   6. npm run setup-db --db-only  — create the dndtools database
#   7. Start the app container
#   8. Wait for the backend to return HTTP 200
#   9. npm run setup  — create initial admin if none exists
#  10. Print banner (with credentials if a new admin was created)
#  11. Keep running — Ctrl+C cleanly stops everything
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${CYAN}  ▸ $*${RESET}"; }
success() { echo -e "${GREEN}  ✓ $*${RESET}"; }
warn()    { echo -e "${YELLOW}  ⚠ $*${RESET}"; }
err()     { echo -e "${RED}  ✗ $*${RESET}"; }
header()  { echo -e "\n${BOLD}$*${RESET}"; }

if [[ ! -f "app.js" || ! -d "public" ]]; then
  err "Please run this script from the dnd-tools repository root."
  exit 1
fi

CREDS_FILE="/tmp/dndtools-init-creds.txt"
rm -f "$CREDS_FILE"

header "═══════════════════════════════════════════"
header " 🎲  D&D Campaign Tools"
header "═══════════════════════════════════════════"

# ── 1. Prerequisites ──────────────────────────────────────────────────────────
header "1/9  Checking prerequisites…"

if ! command -v node &>/dev/null; then
  err "Node.js is not installed. Download it from https://nodejs.org (v18+)."; exit 1
fi
success "Node.js $(node -e 'process.stdout.write(process.versions.node)')"

if ! command -v npm &>/dev/null; then
  err "npm is not installed (should come with Node.js)."; exit 1
fi
success "npm $(npm --version)"

CONTAINER_CMD=""
if   command -v podman &>/dev/null; then CONTAINER_CMD="podman"
elif command -v docker &>/dev/null; then CONTAINER_CMD="docker"
else err "Neither Docker nor Podman found."; exit 1
fi
success "$CONTAINER_CMD"

if $CONTAINER_CMD compose version &>/dev/null 2>&1; then
  COMPOSE="$CONTAINER_CMD compose"
elif command -v docker-compose &>/dev/null; then
  COMPOSE="docker-compose"
else
  err "Docker Compose plugin not found."; exit 1
fi
success "compose"

HAS_CURL=true
if ! command -v curl &>/dev/null; then
  warn "curl not found — backend health check will be skipped."
  HAS_CURL=false
fi

# ── 2. .env setup ─────────────────────────────────────────────────────────────
header "2/9  Environment configuration…"

if [[ ! -f ".env" ]]; then
  if [[ -f ".env.example" ]]; then
    cp .env.example .env
    warn ".env not found — copied from .env.example."
    echo ""
    echo -e "  ${YELLOW}Edit .env before going to production:${RESET}"
    echo "    SESSION_SECRET  — set to a long random string"
    echo "    DB_PASSWORD     — must match docker-compose.yml"
    echo ""
    read -r -p "  Press Enter to continue with defaults, or Ctrl+C to edit .env first… "
  else
    warn ".env not found and no .env.example — using built-in defaults."
  fi
else
  success ".env found"
fi

# ── 3. npm install ────────────────────────────────────────────────────────────
header "3/9  Node.js dependencies…"

if [[ ! -d "node_modules" ]]; then
  info "node_modules missing — running npm install"
  npm install
  success "npm install complete"
elif [[ "package.json" -nt "node_modules" ]]; then
  info "package.json changed — running npm install"
  npm install
  success "npm install complete"
else
  success "node_modules up to date"
fi

# ── Cleanup trap ──────────────────────────────────────────────────────────────
cleanup() {
  echo ""
  header "Shutting down…"
  $COMPOSE down || true
  exit 0
}
trap cleanup SIGINT SIGTERM

# ── 4. Start postgres only ────────────────────────────────────────────────────
header "4/9  Starting PostgreSQL…"

mkdir -p pdfs

if $CONTAINER_CMD inspect dnd-tools-db &>/dev/null; then
  success "postgres container already exists"
else
  info "Starting postgres service…"
  $COMPOSE up -d postgres
  success "postgres container started"
fi

# ── 5. Wait for postgres healthy ──────────────────────────────────────────────
header "5/9  Waiting for PostgreSQL to be healthy…"

MAX=60
for ((i=1; i<=MAX; i++)); do
  STATUS=$($CONTAINER_CMD inspect --format='{{.State.Health.Status}}' dnd-tools-db 2>/dev/null || echo "missing")
  if [[ "$STATUS" == "healthy" ]]; then
    success "PostgreSQL is healthy"
    break
  fi
  if [[ $i -eq $MAX ]]; then
    err "PostgreSQL did not become healthy after ${MAX}s."
    err "Run: $CONTAINER_CMD logs dnd-tools-db"
    cleanup
  fi
  printf "\r  Waiting… (%d/%ds) status=%s      " "$i" "$MAX" "$STATUS"
  sleep 1
done
echo ""

# ── 6. Create database ────────────────────────────────────────────────────────
header "6/9  Creating database…"

node scripts/setup-db.js --db-only

# ── 7. Start the app ──────────────────────────────────────────────────────────
header "7/9  Starting app…"

if $CONTAINER_CMD inspect dnd-tools &>/dev/null && \
   [[ "$($CONTAINER_CMD inspect --format='{{.State.Running}}' dnd-tools 2>/dev/null)" == "true" ]]; then
  success "app container already running"
else
  info "Building and starting app service…"
  $COMPOSE up -d --build dnd-tools
  success "app container started"
fi

# ── 8. Wait for backend ───────────────────────────────────────────────────────
header "8/9  Waiting for backend…"

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
      cleanup
    fi
    printf "\r  Waiting… (%d/%ds) HTTP=%s      " "$i" "$MAX" "$HTTP"
    sleep 1
  done
  echo ""
else
  warn "Skipping backend health check — waiting 8s for app startup…"
  sleep 8
fi

# ── 9. Create initial admin ───────────────────────────────────────────────────
header "9/9  Setup (initial admin)…"
echo ""

# At this point app.js has run initializeDatabase() so all tables exist
node scripts/setup-db.js

# ── Banner ────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}═══════════════════════════════════════════════${RESET}"
echo -e "${GREEN}${BOLD} ✅  D&D Tools is running!${RESET}"
echo -e "${GREEN}${BOLD}═══════════════════════════════════════════════${RESET}"
echo ""
echo -e "  🌐  ${CYAN}http://localhost:3080${RESET}"
echo ""

if [[ -f "$CREDS_FILE" ]]; then
  INIT_USER=$(sed -n '1p' "$CREDS_FILE")
  INIT_PASS=$(sed -n '2p' "$CREDS_FILE")
  rm -f "$CREDS_FILE"
  echo -e "${YELLOW}${BOLD}  ╔══════════════════════════════════════════╗${RESET}"
  echo -e "${YELLOW}${BOLD}  ║  🔑  Initial admin credentials           ║${RESET}"
  echo -e "${YELLOW}${BOLD}  ║                                          ║${RESET}"
  echo -e "${YELLOW}${BOLD}  ║  Username : ${RESET}${BOLD}${INIT_USER}${RESET}${YELLOW}${BOLD}                           ║${RESET}"
  echo -e "${YELLOW}${BOLD}  ║  Password : ${RESET}${BOLD}${INIT_PASS}${RESET}${YELLOW}${BOLD}     ║${RESET}"
  echo -e "${YELLOW}${BOLD}  ║                                          ║${RESET}"
  echo -e "${YELLOW}${BOLD}  ║  ⚠  Change this after first login        ║${RESET}"
  echo -e "${YELLOW}${BOLD}  ╚══════════════════════════════════════════╝${RESET}"
  echo ""
fi

echo "  Useful commands:"
echo "    npm run create-admin          — add another admin account"
echo "    $CONTAINER_CMD logs -f dnd-tools      — stream app logs"
echo "    $CONTAINER_CMD logs -f dnd-tools-db   — stream DB logs"
echo "    $COMPOSE down                 — stop everything"
echo ""
echo -e "  Press ${BOLD}Ctrl+C${RESET} to stop all services."
echo ""

while true; do sleep 1; done
