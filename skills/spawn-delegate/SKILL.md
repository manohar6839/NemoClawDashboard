---
name: spawn-delegate
description: Delegate work to Tiger's specialist sub-agents (Cody=code, Ethan=research, Cathy=writing, Elon=planning) and check on their runs. Use whenever a task is substantial enough to hand off — the specialist runs in its own session and reports to Telegram when done, so you stay free for the conversation. Also use to list recent runs or fetch a run's full result.
metadata:
  {
    "moltbot":
      {
        "emoji": "🤝",
        "requires": { "env": ["TIGER_BRIDGE_TOKEN"] },
        "primaryEnv": "TIGER_BRIDGE_TOKEN",
      },
  }
---

# Spawn / Delegate to Specialists

The bridge (host) exposes real sub-agent execution. You hold the bearer
token in `$TIGER_BRIDGE_TOKEN`. Bridge base URL from inside this container:
`http://172.17.0.1:3456`.

## Who does what
- **cody** — code, debugging, devops, scripts, infra
- **ethan** — research, market/policy analysis, due diligence
- **cathy** — writing, summaries, reports, drafts
- **elon** — planning, prioritization, breaking down projects

## Delegate a task
```bash
curl -s -X POST http://172.17.0.1:3456/tiger/spawn \
  -H "Authorization: Bearer $TIGER_BRIDGE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"agentId":"ethan","task":"<one clear, self-contained task>","context":"<optional background>"}'
```
Returns `{runId, sessionId, queued}`. Runs execute one at a time
(RAM-constrained host) — `queued > 0` means it waits its turn.
Completion is announced on Telegram automatically; you do NOT need to poll.

## Check runs
```bash
# recent runs + queue state
curl -s http://172.17.0.1:3456/tiger/spawn/runs -H "Authorization: Bearer $TIGER_BRIDGE_TOKEN"
# one run, full reply
curl -s http://172.17.0.1:3456/tiger/spawn/runs/<runId> -H "Authorization: Bearer $TIGER_BRIDGE_TOKEN"
```

## Rules
- Write the task so it stands alone — the specialist has NO chat context.
- One task per spawn. Split compound requests.
- Don't spawn for things you can answer in one turn yourself.
