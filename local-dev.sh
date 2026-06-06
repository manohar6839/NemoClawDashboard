#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# local-dev.sh — Run bridge + dashboard locally on Mac
#
# WHAT IT DOES:
#   Starts two Node.js processes:
#     - Bridge on :3457  (runs in TIGER_REMOTE=true mode, talks to
#                         the real tiger-openclaw container on VPS via SSH)
#     - Dashboard on :3101 (Next.js dev mode with hot-reload)
#
# ARCHITECTURE:
#
#     [Mac] Dashboard :3101 ──HTTP──▶ [Mac] Bridge :3457
#                                          │
#                                          ├── SQLite (local ./data/tiger-local.db)
#                                          │
#                                          └──SSH──▶ [VPS] docker exec tiger-openclaw
#                                                           │
#                                                           └── OpenClaw + Tiger
#
# SAFETY:
#   - Uses separate ports (3101, 3457) so production on :3100, :3456
#     keeps running normally.
#   - Uses a SEPARATE SQLite file (data/tiger-local.db) so local chat
#     history doesn't mix with production.
#   - Read-only for Tiger state: your local bridge can invoke Tiger and
#     READ its workspace, but there's no "commit my local chat history
#     to server" step. Production Tiger is untouched.
#
# USAGE:
#   ./local-dev.sh              # start both services
#   ./local-dev.sh --bridge     # only bridge
#   ./local-dev.sh --dashboard  # only dashboard
#   Ctrl-C                      # stop everything cleanly
#
# REQUIREMENTS:
#   - Node 20+ (already have this)
#   - bridge/node_modules installed (cd bridge && npm install, once)
#   - dashboard/node_modules installed (cd dashboard && npm install, once)
#   - SSH access to root@100.75.128.45 (already set up via Tailscale)
# ═══════════════════════════════════════════════════════════════════

set -uo pipefail

LOCAL_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$LOCAL_PATH"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

# Parse flags
MODE="both"
for arg in "$@"; do
  case $arg in
    --bridge) MODE="bridge" ;;
    --dashboard) MODE="dashboard" ;;
    --help|-h)
      echo "Usage: $0 [--bridge | --dashboard]"
      exit 0
      ;;
  esac
done

# ─── Pre-flight ──────────────────────────────────────────────────────

# Check ssh to server (we need it if bridge is starting)
if [ "$MODE" != "dashboard" ]; then
  if ! ssh -o ConnectTimeout=5 -o BatchMode=yes root@100.75.128.45 'echo ok' >/dev/null 2>&1; then
    echo -e "${RED}✗${NC} Can't SSH to server. Bridge needs it for remote docker exec."
    echo "  Try: ssh root@100.75.128.45 manually; check tailscale status"
    exit 1
  fi
  echo -e "${GREEN}✓${NC} SSH to server works"
fi

# Check node_modules are installed
if [ "$MODE" != "dashboard" ] && [ ! -d bridge/node_modules ]; then
  echo -e "${YELLOW}⚠${NC} bridge/node_modules missing. Installing…"
  (cd bridge && npm install --no-audit --no-fund) || { echo "npm install failed"; exit 1; }
fi
if [ "$MODE" != "bridge" ] && [ ! -d dashboard/node_modules ]; then
  echo -e "${YELLOW}⚠${NC} dashboard/node_modules missing. Installing…"
  (cd dashboard && npm install --no-audit --no-fund) || { echo "npm install failed"; exit 1; }
fi

# Check port conflicts (we use 3101 and 3457 to stay clear of prod's 3100/3456)
for port in 3101 3457; do
  if lsof -ti:$port >/dev/null 2>&1; then
    echo -e "${RED}✗${NC} Port $port is already in use. Kill the process first:"
    echo "    lsof -ti:$port | xargs kill"
    exit 1
  fi
done

# ─── PID tracking so Ctrl-C cleans up children ──────────────────────

PIDS=()
cleanup() {
  echo
  echo -e "${YELLOW}Shutting down…${NC}"
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null
  echo -e "${GREEN}✓${NC} All services stopped"
  exit 0
}
trap cleanup INT TERM

# ─── Start bridge ────────────────────────────────────────────────────

start_bridge() {
  echo -e "${BLUE}[bridge]${NC} Starting on :3457 in REMOTE mode…"
  cd "$LOCAL_PATH/bridge"

  # Environment for local bridge:
  #   TIGER_REMOTE=true       → prefix docker commands with SSH
  #   TIGER_REMOTE_SSH=...    → which host to SSH to
  #   TIGER_BRIDGE_PORT=3457  → don't collide with prod :3456
  #   TIGER_DB_DIR=./data     → separate SQLite file from prod
  #   TIGER_BRIDGE_TOKEN=dev-local-token → auth for dev (server uses different token)
  export TIGER_REMOTE=true
  export TIGER_REMOTE_SSH=root@100.75.128.45
  export TIGER_BRIDGE_PORT=3457
  export TIGER_BRIDGE_HOST=127.0.0.1
  export TIGER_BRIDGE_TOKEN=dev-local-token
  export TIGER_DB_DIR="$LOCAL_PATH/data"

  # Use tsx directly (same as systemd does on server) so changes to src/
  # reload automatically without rebuilding.
  node --import tsx src/index.ts 2>&1 | sed -u "s/^/$(printf "${BLUE}[bridge]${NC} ")/" &
  PIDS+=($!)
  cd "$LOCAL_PATH"
}

# ─── Start dashboard ─────────────────────────────────────────────────

start_dashboard() {
  echo -e "${GREEN}[dashboard]${NC} Starting on :3101…"
  cd "$LOCAL_PATH/dashboard"

  # Environment for local dashboard:
  #   PORT=3101                      → don't collide with prod :3100
  #   TIGER_BRIDGE_URL=localhost:3457 → talk to OUR local bridge, not prod
  #   TIGER_BRIDGE_TOKEN=dev-local-token → match local bridge's auth
  export PORT=3101
  export TIGER_BRIDGE_URL=http://localhost:3457
  export TIGER_BRIDGE_TOKEN=dev-local-token

  # next dev → hot-reload, fast compile
  npm run dev 2>&1 | sed -u "s/^/$(printf "${GREEN}[dashboard]${NC} ")/" &
  PIDS+=($!)
  cd "$LOCAL_PATH"
}

# ─── Start requested services ──────────────────────────────────────

echo
echo "═══════════════════════════════════════════════════════════════"
echo "Local dev environment starting"
echo "═══════════════════════════════════════════════════════════════"
[ "$MODE" = "both" ] || [ "$MODE" = "bridge" ]    && start_bridge
[ "$MODE" = "both" ] || [ "$MODE" = "dashboard" ] && start_dashboard

sleep 2
echo
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
[ "$MODE" != "bridge" ]    && echo -e "  Dashboard:  ${GREEN}http://localhost:3101${NC}"
[ "$MODE" != "dashboard" ] && echo -e "  Bridge:     ${BLUE}http://localhost:3457${NC}  (TIGER_REMOTE mode)"
echo -e "  Production: https://agent.manohargupta.com  (${YELLOW}untouched${NC})"
echo -e "  Stop with:  ${YELLOW}Ctrl-C${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo

# Wait for any child to exit (usually Ctrl-C triggers cleanup first)
wait "${PIDS[@]}"
