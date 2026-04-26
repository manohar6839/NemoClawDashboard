# NemoClawDashboard

Web dashboard + Express bridge for Tiger, a personal AI agent running on
OpenClaw inside a Docker container on a Hetzner VPS.

## Layout

- `dashboard/` — Next.js 14 web UI (chat, workspace, tasks, memory,
  cron, logs, sessions, etc.). Served at `agent.manohargupta.com`.
- `bridge/` — Express API that wraps `docker exec tiger-openclaw`
  commands for the dashboard. Runs as systemd unit `tiger-bridge`.
- `deploy.sh` / `local-dev.sh` — operational scripts.
- `data/tiger.db` — SQLite for dashboard-side persistence (projects,
  tasks dispatch state).

## Architecture

Dashboard ⇄ Bridge ⇄ `docker exec tiger-openclaw` ⇄ OpenClaw gateway
(WebSocket on `127.0.0.1:18789`) ⇄ Tiger + sub-agents.

For chat specifically, the dashboard talks directly to the OpenClaw
WebSocket gateway via `dashboard/src/lib/openclaw-ws.ts`, bypassing
the bridge.

## Deployment

Reverse-proxied through Dokploy's Traefik. BasicAuth on
`agent.manohargupta.com`. See `deploy.sh` for the full deploy flow.
