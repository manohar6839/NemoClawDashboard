---
name: inbox-manager
description: Manage the TASKS.md INBOX — the queue the bridge drains every 30 minutes (9:00–20:00 IST), dispatching each item to the right specialist automatically. Use when Manohar says "add to my tasks/inbox/queue", wants something done later or recurring-ish, or asks what's pending. Also supports triggering an immediate drain.
metadata:
  {
    "moltbot":
      {
        "emoji": "📥",
        "requires": { "env": ["TIGER_BRIDGE_TOKEN"] },
        "primaryEnv": "TIGER_BRIDGE_TOKEN",
      },
  }
---

# INBOX Manager

`~/.openclaw/workspace/TASKS.md` has a `## 📥 INBOX` section. Each
`- [ ] task` line gets auto-dispatched: the bridge classifies it, spawns the
right specialist, rewrites the line to `- [⏳ run-id → agent]`, and the
result lands on Telegram.

## Add a task
Append ONE line under the `## 📥 INBOX` header (before the next `## `):
```
- [ ] research upcoming SECI BESS tenders and summarize timelines
```
Write tasks self-contained — the specialist gets no chat context.

## List pending
Read TASKS.md and report the unchecked `- [ ]` lines under INBOX, in order
(top item dispatches first).

## Drain now (don't wait for the 30-min cycle)
```bash
curl -s -X POST http://172.17.0.1:3456/tiger/inbox/drain \
  -H "Authorization: Bearer $TIGER_BRIDGE_TOKEN"
```
Dispatches exactly ONE item (the top one). Outside 9:00–20:00 IST the
manual drain still works (force=true server-side).
