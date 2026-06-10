# Tiger Command Center — Architecture

*Last updated: 2026-06-10. Covers the gateway migration, real sub-agent
spawning, the TASKS.md inbox loop, the Telegram transcript mirror, and the
unified audit trail.*

---

## 1. System Overview

Self-hosted AI agent orchestration on a Hetzner VPS (8 GB RAM, Helsinki;
Tailscale 100.75.128.45). Three host services + one containerised AI
runtime behind Traefik, with ALL model traffic routed through a self-hosted
LiteLLM gateway — no third-party balance can silently kill the system.

```
Internet/Manohar
     |  HTTPS 443
     v
dokploy-traefik (v3.6.7)
     |
     +-- agent.manohargupta.com --> tiger-dashboard (Next.js, :3100)
     |                                    | /api/* proxies (token server-side)
     |                                    v
     |                             tiger-bridge (Express+tsx, :3456, localhost)
     |                                    |  docker exec / volume reads
     |                                    v
     |                             tiger-openclaw (OpenClaw v2026.3.12)
     |                                    |
     +-- llm.manohargupta.com ----> litellm-gateway <-- ALL model calls
     |                                    |-- MiniMax API (own key): minimax-3 (primary),
     |                                    |   minimax-2.7, minimax-2.7-fast
     |                                    +-- Anthropic API (own key): claude-haiku, claude-sonnet
     |
     +-- angel.manohargupta.com --> position-tracker (standalone repo/deploy)
     |
Telegram @Tiger_4321_bot <--> OpenClaw native channel (long-polling, owns the bot)
```

## 2. Model Routing (post-OpenRouter)

OpenRouter was removed 2026-06-10 after its credits ran dry and silently
broke both Tiger and the bridge's classifier. Everything now goes through
the self-hosted gateway:

- **OpenClaw** (`openclaw.json`): custom provider `litellm`
  (`baseUrl: https://llm.manohargupta.com/v1`, `api: openai-completions`).
  Primary `litellm/minimax-3` (1M ctx), fallbacks `litellm/minimax-2.7` →
  `litellm/claude-haiku` (cross-provider: survives a MiniMax outage).
- **Bridge** (`lib/llm.ts`): slugs starting `anthropic/` go to Anthropic
  direct; everything else goes to the gateway. Env: `LLM_GATEWAY_URL`,
  `LLM_GATEWAY_KEY`, `TIGER_ROUTER_MODEL` (default `minimax-3`).
- **Gateway config**: `/root/litellm/litellm_config.yaml`
  (`request_timeout: 300` to match the cron budget).

## 3. Sub-Agent Execution (the orchestration layer)

`bridge/src/lib/agents.ts` is the canonical specialist registry:
**cody** (code), **ethan** (research), **cathy** (writing), **elon** (PM).
Legacy ids coder/researcher/writer/pm are accepted as aliases.

A spawn (`POST /tiger/spawn`) runs an isolated OpenClaw session
(`--session-id spawn-<agent>-<id>`) with the specialist persona prepended.
Message transport is docker-cp of a temp file (escaping-proof). Runs are
tracked in the `executions` table and serialized (`MAX_CONCURRENT=1` —
parallel turns push the 8GB host into swap and everything times out).
Completion fires a Telegram notification via `/tiger/notify`.

Upgrade path: define real per-agent entries in `openclaw.json agents.list`
(own IDENTITY.md + workspace each), then change the `--agent` flag in
spawn.ts. Documented in lib/agents.ts; deferred until the RAM situation is
resolved.

## 4. TASKS.md Inbox Loop

`workspace/TASKS.md` has a `## 📥 INBOX` section. `bridge/src/lib/inbox.ts`
checks every 30 min (09:00–20:00 IST): takes the first `- [ ]` line,
classifies it (`classifyAgent`), spawns the specialist, rewrites the line to
`- [⏳ run-id → agent]`. Manual trigger: `POST /tiger/inbox/drain`.
Bridge-side scheduling means zero model tokens burned on empty checks and
no bearer tokens embedded in cron prompts.

## 5. Telegram

- **The bot is owned by OpenClaw's native channel** (long-polling). The
  bridge's `TelegramChannel`, `telegram-webhook.ts` and `chat-mirror.ts`
  are legacy: Telegram forbids webhook + getUpdates on one token, so the
  webhook design could never receive a message.
- **The dashboard mirror reads the native session transcript** —
  `routes/chat-telegram.ts` resolves the `telegram:` session from
  `sessions.json` and serves the JSONL with cursor pagination and mtime
  caching. It filters to what Telegram actually saw: assistant messages
  carrying toolCall blocks (working narration) are skipped, thinking blocks
  ignored, injected metadata/system boilerplate stripped from user messages.

## 6. Audit Trail

`GET /tiger/activity/audit` merges, at read time, every durable action
store: `executions` (spawns), `tasks` (lifecycle), `outputs` (artifacts),
and OpenClaw's cron run JSONL. Cursor-paginated (`before=<ISO>`), type
filters. The dashboard `/activity` page adds recent file-modification
events on the first page. Read-time merging means history is complete
retroactively and no action can happen without its audit row.

## 7. Crons (OpenClaw, tz Asia/Kolkata)

| Job | Schedule | Timeout |
|---|---|---|
| Trade Baseline Reset | 9:15 daily | 60s |
| Trade P&L Monitor | every 2 min | 60s |
| Hourly Trade Summary + News | hourly | 90s |
| Hourly Task Check-in | 0 9-21 | 300s |
| EOD Trade Summary | 16:00 Mon–Fri | 300s |
| Weekly Digest | Mon 9:00 | 300s |

Timeout budget rationale: agent turns on this RAM-starved host can take
minutes; 300s is the ceiling that made chronically-failing jobs pass.

## 8. Security Posture

- Bridge: Bearer auth on all routes; token in `bridge/.env` +
  `dashboard/.env.local` + embedded in cron payloads (rotate all four
  together — `jobs.json` has it twice). Rotated 2026-06-10 after the old
  token leaked via a hardcode in `agents-activity.ts` to the public GitHub
  mirror. NEVER hardcode tokens in source: this repo mirrors publicly.
- Git: Forgejo (origin, SSH port 2222, key `id_ed25519_forgejo`) + GitHub
  mirror. Push both.
- position-tracker binds 127.0.0.1:3457; public access via Traefik at
  angel.manohargupta.com.
- Known weak spots: litellm-db password, `/opt/dashboard` fossil with a
  stale token, dual Telegram pollers (bridge poller should be disabled).

## 9. Known Constraints

- **RAM**: ~13GB workload on 8GB physical; 6+GB swap in steady state. This
  is the root cause of historical cron timeouts and the reason spawn
  concurrency is 1. Decision pending: evict homelab services vs upgrade.
- OpenClaw v2026.3.12 predates MiniMax-M3, hence the explicit
  `litellm/minimax-3` provider-prefixed model id.
