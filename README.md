# Tiger Command Center

> Self-hosted AI orchestration: one Tiger, four specialists, every action audited.

The control plane for **Tiger**, an OpenClaw-based AI agent running on a
Hetzner VPS, reachable at `agent.manohargupta.com`. Tiger orchestrates four
specialist sub-agents — **Cody** (code), **Ethan** (research), **Cathy**
(writing), **Elon** (planning) — handles Telegram, watches Angel One
positions, and drains a TASKS.md inbox while you do real work.

## What lives here

| Path | What it is |
|---|---|
| `dashboard/` | Next.js 14 command center UI (`tiger-dashboard`, :3100) |
| `bridge/` | Express control-plane API (`tiger-bridge`, :3456, localhost-only) |
| `skills/` | OpenClaw skills (spawn-delegate, angel-positions, inbox-manager, sys-health, youtube-full) |
| `ARCHITECTURE.md` | The real system map — read this first |
| `TOOLS.md` | Tool/skill quick reference |

## Core capabilities

- **Sub-agent spawning** — `POST /tiger/spawn` runs a specialist in an
  isolated OpenClaw session; result lands on Telegram. Tracked in `executions`.
- **TASKS.md inbox** — drop `- [ ]` lines under `## 📥 INBOX`; the bridge
  dispatches the top item to the right specialist every 30 min (9–20 IST).
- **Telegram mirror** — the homepage thread reads OpenClaw's native session
  transcript: full history, both directions, perfectly in sync.
- **Audit trail** — `/activity` merges spawns, cron runs, task lifecycle,
  and outputs into one paginated, filterable timeline.
- **Own model gateway** — every model call routes through
  `llm.manohargupta.com` (LiteLLM on own MiniMax/Anthropic keys). Primary:
  MiniMax-M3.

## Running it

Both services are systemd units on the host:

```bash
systemctl restart tiger-bridge      # Express via tsx — no build step
cd dashboard && npm run build && systemctl restart tiger-dashboard
```

Env contracts:
- `bridge/.env` — `TIGER_BRIDGE_TOKEN`, `LLM_GATEWAY_URL`, `LLM_GATEWAY_KEY`,
  `TIGER_ROUTER_MODEL`, Telegram credentials
- `dashboard/.env.local` — `TIGER_BRIDGE_URL`, `TIGER_BRIDGE_TOKEN`

⚠️ The bridge token is also embedded in OpenClaw cron payloads
(`cron/jobs.json`, twice). Rotate all four locations together.

## Git

Forgejo is canonical (`git.manohargupta.com/manohar/OpenClawDashboard`, SSH
port 2222); GitHub (`manohar6839/NemoClawDashboard`) is a **public** mirror —
never commit secrets. Push to both:

```bash
git push origin main && git push github main
```
