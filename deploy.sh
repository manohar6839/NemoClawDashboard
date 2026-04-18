#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# deploy.sh — Push local changes to the Tiger VPS
#
# WHAT IT DOES:
#   1. Validates local state (no uncommitted changes, build works)
#   2. SSHes to server and pulls YOUR local git repo as the source
#   3. Installs any new dependencies
#   4. Rebuilds the Next.js dashboard
#   5. Restarts tiger-bridge and tiger-dashboard services
#   6. Verifies everything came back healthy
#
# USAGE:
#   ./deploy.sh           # deploy whatever is at current HEAD
#   ./deploy.sh --skip-build-check  # skip local build (NOT recommended)
#   ./deploy.sh --dry-run # show what would happen, don't do it
#
# FAILURE MODES (what to do when it breaks):
#   - "uncommitted changes" → git commit first, or git stash
#   - "local build failed" → fix TypeScript errors locally, retry
#   - "server unreachable" → check Tailscale; ssh root@100.75.128.45 manually
#   - "deploy.sh fails mid-way" → server might be in broken state. See
#     troubleshooting section at bottom of this file.
# ═══════════════════════════════════════════════════════════════════

set -euo pipefail

# ─── Configuration ───────────────────────────────────────────────────
SERVER="root@100.75.128.45"
SERVER_PATH="/root/NemoClawDashboard"
LOCAL_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors — makes scanning the output easier when things go wrong
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # reset

# Parse flags
SKIP_BUILD_CHECK=false
DRY_RUN=false
for arg in "$@"; do
  case $arg in
    --skip-build-check) SKIP_BUILD_CHECK=true ;;
    --dry-run) DRY_RUN=true ;;
    --help|-h)
      echo "Usage: $0 [--skip-build-check] [--dry-run]"
      exit 0
      ;;
  esac
done

# ─── Helper functions ────────────────────────────────────────────────
log()    { echo -e "${BLUE}[deploy]${NC} $*"; }
ok()     { echo -e "${GREEN}✓${NC} $*"; }
warn()   { echo -e "${YELLOW}⚠${NC} $*"; }
die()    { echo -e "${RED}✗${NC} $*"; exit 1; }
section() { echo; echo -e "${BLUE}═══ $* ═══${NC}"; }

run_remote() {
  if $DRY_RUN; then
    echo "  [dry-run] ssh $SERVER '$*'"
  else
    ssh "$SERVER" "$@"
  fi
}

START_TIME=$(date +%s)

# ═══════════════════════════════════════════════════════════════════
# PRE-FLIGHT: Local checks (fail fast, don't touch server if local is bad)
# ═══════════════════════════════════════════════════════════════════

section "Pre-flight checks"

# [1] Are we in the right directory?
cd "$LOCAL_PATH"
if [ ! -d .git ] || [ ! -d dashboard ] || [ ! -d bridge ]; then
  die "Not in NemoClawDashboard repo root. cd to the repo first."
fi
ok "In repo: $LOCAL_PATH"

# [2] Uncommitted changes?
# WHY: if we deploy code that isn't committed, git log can't tell us what's
# running on the server. Commit first, always.
if ! git diff-index --quiet HEAD --; then
  warn "You have uncommitted changes:"
  git status --short | head -10
  echo
  read -r -p "Deploy anyway? Uncommitted changes will NOT be deployed. (y/N) " ans
  if [ "$ans" != "y" ]; then
    die "Aborted. Commit or stash, then retry."
  fi
fi

# [3] Untracked files of note (warn only)
UNTRACKED=$(git status --short | grep '^??' | wc -l | xargs)
if [ "$UNTRACKED" -gt 0 ]; then
  warn "$UNTRACKED untracked file(s) exist — they won't be deployed."
fi

# [4] What commit are we about to deploy?
LOCAL_SHA=$(git rev-parse HEAD)
LOCAL_SHA_SHORT=$(git rev-parse --short HEAD)
LOCAL_MSG=$(git log -1 --pretty=format:"%s")
ok "Deploying commit: ${LOCAL_SHA_SHORT} — ${LOCAL_MSG}"

# [5] Local build sanity check
# WHY: catches TypeScript errors in 30s on Mac instead of 5min on server.
# Building the dashboard also pre-checks bridge ts imports if types are
# shared, though bridge has its own tsc separately.
if ! $SKIP_BUILD_CHECK; then
  log "Running local build check (dashboard)…"
  if $DRY_RUN; then
    echo "  [dry-run] would: cd dashboard && npm run build"
  else
    # Use a subshell so we don't accidentally cd out of the repo
    (cd dashboard && npm run build > /tmp/deploy-build.log 2>&1) || {
      warn "Local build FAILED. Last 30 lines:"
      tail -30 /tmp/deploy-build.log
      die "Fix local build errors before deploying. (Or use --skip-build-check to bypass, NOT recommended.)"
    }
  fi
  ok "Local dashboard build passed"
fi

# [6] Is the server reachable?
log "Checking server reachability…"
if ! ssh -o ConnectTimeout=5 -o BatchMode=yes "$SERVER" 'echo ok' >/dev/null 2>&1; then
  die "Can't SSH to $SERVER. Check Tailscale + SSH auth."
fi
ok "Server reachable"

# ═══════════════════════════════════════════════════════════════════
# DEPLOY: Push code and restart services
# ═══════════════════════════════════════════════════════════════════

section "Deploying to server"

# [7] On server: make sure its working tree is clean before we overwrite
# WHY: if someone SSHed in and edited files directly, this reset would
# silently discard their work. Check first so we can bail if so.
log "Checking server working tree…"
SERVER_DIRTY=$(ssh "$SERVER" "cd $SERVER_PATH && git status --porcelain | wc -l" 2>/dev/null | xargs)
if [ "$SERVER_DIRTY" -gt 0 ]; then
  warn "Server has uncommitted changes:"
  ssh "$SERVER" "cd $SERVER_PATH && git status --short | head -10"
  read -r -p "Discard them and deploy? (y/N) " ans
  if [ "$ans" != "y" ]; then
    die "Aborted. SSH in and review those changes first."
  fi
fi

# [8] Ensure 'mac' remote exists on the server (points back to Mac via ssh)
# WHY: server needs to fetch from Mac. First-time setup = add remote.
log "Ensuring server can fetch from Mac…"
run_remote "cd $SERVER_PATH && git remote get-url mac 2>/dev/null || git remote add mac $(whoami)@$(hostname).local:$LOCAL_PATH" >/dev/null 2>&1 || true

# ☝ Note: for this to work, Mac needs SSH server enabled.
# Alternative that doesn't require Mac to accept SSH: push over the
# existing SSH connection using git's stdio protocol. We'll use that
# instead — more reliable, no Mac SSH config required.

# [9] Push local commits to server via SSH stdio
# WHY: uses the same SSH connection we already have to server, pushing
# our .git/ contents to a bare-ish path. This works even if Mac doesn't
# accept incoming SSH.
log "Pushing commits to server…"
if $DRY_RUN; then
  echo "  [dry-run] would: git push -f ssh://$SERVER$SERVER_PATH HEAD:refs/heads/incoming"
else
  # We push to a throwaway branch 'incoming' on server. Then server-side
  # we reset main to match. This lets us push even when server's main
  # is checked out (which would otherwise block a direct push).
  git push -f "ssh://$SERVER$SERVER_PATH" "HEAD:refs/heads/incoming" 2>&1 | tail -5
fi
ok "Commits pushed"

# [10] On server: reset main to the newly-pushed incoming, clean state
log "Updating server working tree…"
run_remote "cd $SERVER_PATH && \
  git checkout main 2>/dev/null && \
  git reset --hard refs/heads/incoming && \
  git branch -D incoming 2>/dev/null; true"
ok "Server at commit $LOCAL_SHA_SHORT"

# [11] Install new deps if package.json changed
# WHY: if someone added a new library to dashboard or bridge, npm install
# must run or the build/runtime will error with 'Cannot find module'.
# We detect whether package.json or lockfile changed in the last commit.
log "Checking for dependency changes…"
if ! $DRY_RUN; then
  DEPS_CHANGED=$(ssh "$SERVER" "cd $SERVER_PATH && git diff HEAD~1 HEAD --name-only 2>/dev/null | grep -E '(package\.json|package-lock\.json)$' | head -5")
  if [ -n "$DEPS_CHANGED" ]; then
    warn "Dependencies changed in this commit:"
    echo "$DEPS_CHANGED" | sed 's/^/    /'
    # Install in whichever subdirs have changes
    if echo "$DEPS_CHANGED" | grep -q "^dashboard/"; then
      log "  Running npm install in dashboard/…"
      run_remote "cd $SERVER_PATH/dashboard && npm install --no-audit --no-fund 2>&1 | tail -5"
    fi
    if echo "$DEPS_CHANGED" | grep -q "^bridge/"; then
      log "  Running npm install in bridge/…"
      run_remote "cd $SERVER_PATH/bridge && npm install --no-audit --no-fund 2>&1 | tail -5"
    fi
  else
    ok "No dependency changes"
  fi
fi

# [12] Rebuild dashboard
# WHY: see ChunkLoadError story — Next.js prod server won't hot-reload
# when .next/ changes on disk. Must rebuild before restart.
log "Building dashboard on server…"
run_remote "cd $SERVER_PATH/dashboard && npm run build > /tmp/deploy-build.log 2>&1" || {
  warn "Server build failed. Last 30 lines:"
  ssh "$SERVER" "tail -30 /tmp/deploy-build.log"
  die "Server build failed. Server is now in inconsistent state — run deploy.sh again after fixing."
}
ok "Dashboard built"

# [13] Restart services — bridge first (tsx auto-picks up src/ changes
# on restart), then dashboard (must be restarted to pick up new .next/)
log "Restarting services…"
run_remote "systemctl restart tiger-bridge"
sleep 3
run_remote "systemctl restart tiger-dashboard"
sleep 5

# [14] Health verification — are services actually up and responding?
log "Verifying services…"
BRIDGE_STATE=$(ssh "$SERVER" "systemctl is-active tiger-bridge" 2>&1)
DASH_STATE=$(ssh "$SERVER" "systemctl is-active tiger-dashboard" 2>&1)
if [ "$BRIDGE_STATE" != "active" ]; then
  warn "tiger-bridge is '$BRIDGE_STATE' — checking logs:"
  ssh "$SERVER" 'journalctl -u tiger-bridge -n 15 --no-pager'
  die "tiger-bridge failed to start"
fi
if [ "$DASH_STATE" != "active" ]; then
  warn "tiger-dashboard is '$DASH_STATE' — checking logs:"
  ssh "$SERVER" 'journalctl -u tiger-dashboard -n 15 --no-pager'
  die "tiger-dashboard failed to start"
fi
ok "tiger-bridge: $BRIDGE_STATE"
ok "tiger-dashboard: $DASH_STATE"

# [15] Final sanity check: does /api/tiger/status respond?
log "Probing /api/tiger/status…"
STATUS_CODE=$(ssh "$SERVER" "curl -sS -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:3100/api/tiger/status" 2>&1)
if [ "$STATUS_CODE" = "200" ]; then
  ok "Dashboard API responding (HTTP $STATUS_CODE)"
else
  warn "Dashboard API returned HTTP $STATUS_CODE — investigate with: ssh $SERVER 'journalctl -u tiger-dashboard -f'"
fi

# ═══════════════════════════════════════════════════════════════════
# SUMMARY
# ═══════════════════════════════════════════════════════════════════

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

section "Deploy complete"
echo "  Commit:      $LOCAL_SHA_SHORT — $LOCAL_MSG"
echo "  Duration:    ${DURATION}s"
echo "  Production:  https://agent.manohargupta.com/"
echo
echo "  Rollback:    git checkout <older-sha> && ./deploy.sh"
echo "  Live logs:   ssh $SERVER 'journalctl -u tiger-bridge -f'"
echo "               ssh $SERVER 'journalctl -u tiger-dashboard -f'"

# ═══════════════════════════════════════════════════════════════════
# TROUBLESHOOTING (read this before panicking)
# ═══════════════════════════════════════════════════════════════════
#
# "Site is down after deploy"
#   ssh $SERVER 'journalctl -u tiger-bridge -n 50 --no-pager'
#   ssh $SERVER 'journalctl -u tiger-dashboard -n 50 --no-pager'
#   Common cause: TypeScript error in bridge src/ (tsx reads live so
#   syntax errors crash it). Fix src/ on Mac, redeploy.
#
# "I deployed broken code — how to rollback?"
#   git log --oneline               # find the last-known-good commit
#   git checkout <good-sha>         # get back to it locally
#   ./deploy.sh                     # push the good state to server
#   git checkout main               # return to tip
#   (Or: git revert <bad-sha> on main, ./deploy.sh — preserves history.)
#
# "deploy.sh hangs at 'Checking server reachability'"
#   Tailscale is down on Mac or server. Check: tailscale status
#   Or: ssh -v $SERVER — look for 'Connection timed out'
#
# "npm install takes forever"
#   First deploy after new deps IS slow. Subsequent deploys skip it
#   because only changed deps get reinstalled.
# ═══════════════════════════════════════════════════════════════════
