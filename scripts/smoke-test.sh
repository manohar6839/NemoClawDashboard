#!/usr/bin/env bash
# scripts/smoke-test.sh — Tiger Bridge smoke test
# Run after every deploy: bash scripts/smoke-test.sh
# Wire into deploy.sh as the final step.
set -uo pipefail

BRIDGE_ENV="/root/OpenClawDashboard/bridge/.env"
TOKEN=$(grep ^TIGER_BRIDGE_TOKEN= "$BRIDGE_ENV" | cut -d= -f2-)
H="Authorization: Bearer $TOKEN"
B="http://127.0.0.1:3456"
PASS=0
FAIL=0

green() { echo -e "\033[32m$*\033[0m"; }
red()   { echo -e "\033[31m$*\033[0m"; }

check_json() {
  local name=$1 url=$2 field=$3
  local resp
  resp=$(curl -sf -H "$H" "$B$url" 2>/dev/null)
  local code=$?
  if [ $code -ne 0 ]; then
    red "FAIL  $name  → curl error (bridge down?)"
    ((FAIL++)); return
  fi
  if echo "$resp" | python3 -c "import json,sys; d=json.load(sys.stdin); assert d.get('$field') is not None" 2>/dev/null; then
    green "PASS  $name"
    ((PASS++))
  else
    red "FAIL  $name  → $(echo "$resp" | head -c 150)"
    ((FAIL++))
  fi
}

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Tiger Bridge Smoke Test  $(date '+%Y-%m-%d %H:%M:%S')"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── Core endpoints ─────────────────────────────────────────────────────────────
check_json "status"         /tiger/status              "status"
check_json "file-tasks"     /tiger/file-tasks          "tasks"
check_json "file-tasks/active" /tiger/file-tasks/active "tasks"
check_json "file-projects"  /tiger/file-tasks/projects "projects"
check_json "cron"           /tiger/cron                "jobs"
check_json "models"         /tiger/config/models       "models"
check_json "keys"           /tiger/keys                "ok"

# ── Auth: unauthenticated request must return 401 ──────────────────────────────
http_code=$(curl -s -o /dev/null -w '%{http_code}' "$B/tiger/status")
if [ "$http_code" = "401" ]; then
  green "PASS  auth-required (got 401)"
  ((PASS++))
else
  red "FAIL  auth-required (got $http_code, expected 401)"
  ((FAIL++))
fi

# ── OpenClaw direct exec ───────────────────────────────────────────────────────
if docker exec tiger-openclaw openclaw agent --session-id smoke-test -m "reply OK only" \
     --json --timeout 30 2>/dev/null | grep -q '"text"'; then
  green "PASS  openclaw-direct"
  ((PASS++))
else
  red "FAIL  openclaw-direct (container issue or timeout)"
  ((FAIL++))
fi

# ── Model fallback chain check (verify config) ─────────────────────────────────
fallbacks=$(python3 -c "
import json
with open('/var/lib/docker/volumes/tiger_tiger-config/_data/openclaw.json') as f:
    c = json.load(f)
fb = c.get('agents',{}).get('defaults',{}).get('model',{}).get('fallbacks',[])
print(len(fb))
" 2>/dev/null)
if [ "${fallbacks:-0}" -ge 2 ]; then
  green "PASS  model-fallback-chain (${fallbacks} fallbacks configured)"
  ((PASS++))
else
  red "FAIL  model-fallback-chain (only ${fallbacks:-0} fallback(s) — need ≥2)"
  ((FAIL++))
fi

# ── TASKS.md JSON block present ────────────────────────────────────────────────
if docker exec tiger-openclaw grep -q '```json' /home/node/.openclaw/workspace/TASKS.md 2>/dev/null; then
  green "PASS  tasks-json-block (TASKS.md has JSON block)"
  ((PASS++))
else
  red "FAIL  tasks-json-block (TASKS.md missing TASKS_JSON block — Tiger needs to add it)"
  ((FAIL++))
fi

# ── Summary ────────────────────────────────────────────────────────────────────
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
total=$((PASS + FAIL))
if [ $FAIL -eq 0 ]; then
  green "  ALL PASSED  ($PASS/$total)"
else
  red "  $FAIL FAILED  ($PASS/$total passed)"
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
[ $FAIL -eq 0 ]  # exit 0 on all pass, 1 on any failure
