# Tiger Command Center — Architecture

*Last updated: 2026-05-03. Covers all services through the hardening session.*

---

## 1. System Overview

Self-hosted AI agent orchestration on a Hetzner VPS (77.42.82.225, 8 GB RAM, Helsinki).
Three host services + one containerised AI runtime behind Traefik.

Topology:

```
Internet/Manohar
     |  HTTPS 443
     v
dokploy-traefik (v3.6.7)
     |
     +-- agent.manohargupta.com --> tiger-dashboard (Next.js, :3100)
     |                                    |
     |                             tiger-bridge (Express, :3456, 127.0.0.1 only)
     |                                    |  docker exec
     |                             tiger-openclaw (OpenClaw v2026.3.12)
     |                                    |
     |                         MiniMax-M2.7 -> openrouter/auto -> trinity:free
     |
Telegram @Tiger_4321_bot <-- /tiger/notify <-- Tiger agent
```

---

## 2. Services

### 2.1 tiger-openclaw (Docker container)

| Property | Value |
|----------|-------|
| Image | ghcr.io/openclaw/openclaw:2026.3.12 |
| Container | tiger-openclaw |
| User | node (uid=1000) |
| Config | /home/node/.openclaw/openclaw.json |
| Workspace | /home/node/.openclaw/workspace/ |
| Volumes | tiger-config, tiger-workspace |
| Bind mount | /root/OpenClawDashboard -> /home/node/dashboard:rw |
| Compose | /opt/tiger/docker-compose.yml |

Agents: Tiger (orchestrator), Cody (coder), Ethan (researcher), Cathy (writer), Elon (PM).

Model chain (agents.defaults.model in openclaw.json):
  primary  : minimax/MiniMax-M2.7
  fallback1: openrouter/auto
  fallback2: openrouter/arcee-ai/trinity-large-preview:free  (free - billing safety net)

Cron jobs (cron/jobs.json):
  Tiger: Hourly Task Check-in   0 * * * * IST  90s timeout
  Tiger: Weekly Digest          0 9 * * 1 IST  90s timeout

Both use delivery.mode="none" — they notify via curl to /tiger/notify, not OpenClaw delivery channel.
  "none"   = no channel opened at all (correct: cron delivers via curl)
  "silent" = suppresses chat display but still opens the channel (wrong model for cron)

### 2.2 tiger-bridge (systemd: tiger-bridge.service)

  Language : TypeScript/Express -> bridge/dist/
  Port     : 3456, 127.0.0.1 only (UFW blocks public access)
  Source   : /root/OpenClawDashboard/bridge/src/
  Auth     : Authorization: Bearer TIGER_BRIDGE_TOKEN (all routes)
  SQLite   : /root/OpenClawDashboard/bridge/tiger.db
  Tables   : tasks, projects, messages (chat history), agents

Token shared with: dashboard (server-side only), Tiger cron curl commands, Tiger env var.

### 2.3 tiger-dashboard (systemd: tiger-dashboard.service)

  Framework  : Next.js 14, App Router
  Port       : 3100
  URL        : agent.manohargupta.com (via Traefik)
  Source     : /root/OpenClawDashboard/dashboard/src/
  WorkingDir : /root/OpenClawDashboard/dashboard

All API calls are server-side route handlers — bearer token never reaches the browser.

Build discipline: NEVER run npm run build while next start is live.
In-memory and on-disk manifests split-brain -> ChunkLoadError in browser. Correct:
  systemctl stop tiger-dashboard
  npm run build
  systemctl start tiger-dashboard

### 2.4 Traefik (dokploy-traefik v3.6.7)

File provider: /etc/dokploy/traefik/dynamic/ (host = container path, live reload).
One .yml file per service. No restart needed on edits.

BasicAuth: single $ in bcrypt hash in YAML (not $$ — that is Docker label syntax).
Generate: htpasswd -nbB manohar 'password'

UFW FORWARD — use subnet rules, not specific IPs (bridge IP changes on Traefik restart):
  ufw route allow proto tcp from any to 172.17.0.0/16 port 80
  ufw route allow proto tcp from any to 172.17.0.0/16 port 443

---

## 3. Full API Surface (40+ routes, all Bearer-token protected)

### Health
  GET  /tiger/status            container health, memory/CPU
  GET  /tiger/logs              SSE stream of container logs

### Config
  GET   /tiger/config                        read openclaw.json
  POST  /tiger/config                        update openclaw.json
  GET   /tiger/config/models                 list LLM providers + models
  GET   /tiger/config/models/agents          per-agent model overrides
  PATCH /tiger/config/models/agents/:id      update agent model

### File-Backed Tasks and Projects (canonical source of truth)
  GET  /tiger/file-tasks            TASKS.md JSON block -> tasks[]
  GET  /tiger/file-tasks/active     in-progress + pending-action only
  GET  /tiger/file-tasks/completed  completed section only
  GET  /tiger/file-tasks/projects   PROJECTS.md JSON block -> projects[]

  Parser contract: TASKS.md must contain a fenced json TASKS block at end-of-file.
  Absent -> 502 "TASKS.md missing TASKS json block". No regex fallback.
  Tiger always emits this block on every TASKS.md write.

### SQLite Tasks and Projects (legacy, used for dispatch queue)
  GET    /tiger/tasks               list tasks
  GET    /tiger/tasks/:id           get task
  PUT    /tiger/tasks/:id           update task
  DELETE /tiger/tasks/:id           delete task
  POST   /tiger/tasks/:id/execute   enqueue for execution
  GET    /tiger/projects            list projects
  POST   /tiger/projects            create project
  GET    /tiger/projects/:id        get project
  PUT    /tiger/projects/:id        update project
  DELETE /tiger/projects/:id        delete project
  GET    /tiger/projects/:id/tasks  tasks in project
  POST   /tiger/projects/:id/tasks  add task to project

### Agents and Workspace
  GET  /tiger/agents                list configured agents
  GET  /tiger/agents/:id/files      list agent workspace files
  GET  /tiger/agents/:id/file       read specific agent file
  PUT  /tiger/agents/:id/file       write agent file
  GET  /tiger/agents/activity       recent agent activity log
  GET  /tiger/workspace             list workspace root files
  GET  /tiger/files/:path           read workspace file by path

### Chat (SSE streaming)
  POST   /tiger/chat                SSE stream chat -> Tiger agent
  GET    /tiger/chat/history        recent messages (SQLite)
  DELETE /tiger/chat/history        clear history
  POST   /tiger/chat/persist        persist message to SQLite

  Shell safety: tempfile pattern (not string interpolation):
    Write message -> /tmp/msg_ts.txt
    docker cp /tmp/msg.txt tiger-openclaw:/tmp/msg.txt
    docker exec openclaw agent -m "$(cat /tmp/msg.txt)"

### Dispatch
  POST /tiger/dispatch              enqueue task -> SQLite + agent inbox file
  GET  /tiger/dispatch/status/:id   poll execution status

### Cron
  GET  /tiger/cron                  list jobs.json
  POST /tiger/cron/:id/run          fire job manually

### Notifications and Routing
  POST /tiger/notify                send Telegram msg {message, chatId?}
  POST /tiger/route-task            LLM router: which agent handles this?

### Keys
  GET    /tiger/keys                presence map only (no values returned)
  PATCH  /tiger/keys                upsert a key
  DELETE /tiger/keys/:name          remove a key

### Ops
  POST /tiger/exec                  run command in container (auth-gated)
  POST /tiger/restart               restart tiger-openclaw
  POST /tiger/deploy-dashboard      git pull + build + restart dashboard
  ALL  /api/gateway                 proxy to OpenClaw gateway port 18789

---

## 4. Data Flows

### Chat Message

  Browser -> POST /tiger/chat (SSE)
  bridge writes message -> /tmp/msg_ts.txt
  docker cp -> tiger-openclaw:/tmp/msg_ts.txt
  docker exec openclaw agent --session-id id -m "$(cat /tmp/msg.txt)"
  OpenClaw -> MiniMax (or fallback chain)
  SSE tokens -> bridge -> browser
  POST /tiger/chat/persist -> SQLite messages

### Cron Job Notification

  OpenClaw cron (hourly, IST)
  Tiger reads TASKS.md from workspace
  if active tasks:
    curl POST http://172.17.0.1:3456/tiger/notify
         Authorization: Bearer TOKEN
         body: {message: status update}
    bridge -> Telegram Bot API -> @Tiger_4321_bot -> Manohar
  if HEARTBEAT_OK:
    nothing sent

---

## 5. Failure Modes

| Scenario | What happens | Recovery |
|----------|-------------|----------|
| MiniMax timeout >90s | Falls to openrouter/auto | Automatic |
| OpenRouter billing error | Falls to trinity-large:free | Automatic |
| All LLMs fail | Chat 500; cron errors | Check /tiger/keys; top up credits |
| tiger-openclaw dies | 500 on exec routes | docker restart tiger-openclaw |
| Bridge EADDRINUSE | systemd restart fails (stale nohup) | pkill -f node.*dist/index then start |
| SQLite locked | Dispatch write contention | Retryable; rare |
| ChunkLoadError | Build ran while next start was live | systemctl restart tiger-dashboard |
| Traefik bridge IP change | UFW FORWARD drops traffic | Use subnet rules not specific IPs |
| TASKS.md missing JSON block | /tiger/file-tasks returns 502 | Tiger rewrites TASKS.md |

---

## 6. Deploy Workflow

  On Mac:
    cd ~/MyProjects/NemoClawDashboard
    npm run build           # preflight: catch errors locally first
    git add -p              # atomic commits, no git add -A
    git push origin main

  On server (scripts/deploy.sh):
    cd /root/OpenClawDashboard && git pull
    cd bridge && npx tsc --noEmit && npm run build
    systemctl restart tiger-bridge
    cd ../dashboard
    systemctl stop tiger-dashboard
    npm run build
    systemctl start tiger-dashboard
    bash /root/OpenClawDashboard/scripts/smoke-test.sh

  Mutagen: pause before server-side edits, resume after verifying build.
  Bind-mount perms: chown -R 1000:1000 /root/OpenClawDashboard

---

## 7. File Layout

  /root/OpenClawDashboard/           canonical source (has .git)
  /root/NemoClawDashboard/           HOLLOW / WRONG -- never use
  ~/MyProjects/NemoClawDashboard     Mac-side Mutagen source

  bridge/src/
    index.ts          entry point; full route list in file header comment
    auth.ts           bearer token middleware
    tiger.ts          docker exec wrapper; SSH prefix for local dev
    db.ts             SQLite schema + helpers
    lib/llm.ts        LLM routing + model fallback chain
    lib/telegram.ts   Telegram Bot API client (tempfile pattern)
    routes/           one file per route group (40+ routes)

  dashboard/src/
    app/              Next.js App Router pages
    components/       React components

  scripts/smoke-test.sh    run after every deploy
  ARCHITECTURE.md          this file

  /opt/tiger/docker-compose.yml        OpenClaw container definition

  /var/lib/docker/volumes/tiger_tiger-config/_data/
    openclaw.json         live config
    *.bak.json            auto-backups (keep latest 3)
    cron/jobs.json        cron job definitions

---

## 8. Security Posture

  UFW: 22, 80, 443 open publicly.
       3456 (bridge) only from Docker bridge subnets.
       3000 (Dokploy), 3100 (dashboard) not directly exposed -- only via Traefik.

  Bearer token: 64-char hex. Never logged, never sent to browser. Rotate via bridge/.env.
  Traefik BasicAuth: bcrypt, single $ in YAML files. Realm: Tiger Command Center.
  OpenClaw gateway: bind: lan (Docker bridge only). Token in openclaw.json.
  /tiger/exec: auth-gated. Arbitrary command execution requires bearer token.
  /tiger/keys GET: presence map only. Key values never returned by any endpoint.
