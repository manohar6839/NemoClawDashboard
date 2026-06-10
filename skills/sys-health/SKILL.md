---
name: sys-health
description: Check the health of the Tiger Command Center itself — RAM/swap pressure on the VPS, LLM gateway reachability, bridge status, recent audit events, cron run outcomes. Use when asked "is everything running", "why is it slow", after failures, or proactively when your own turns feel sluggish.
metadata:
  {
    "moltbot":
      {
        "emoji": "🩺",
        "requires": { "env": ["TIGER_BRIDGE_TOKEN"] },
        "primaryEnv": "TIGER_BRIDGE_TOKEN",
      },
  }
---

# System Health

## Memory pressure (the #1 failure mode on this host)
/proc inside the container shows HOST memory:
```bash
grep -E 'MemTotal|MemAvailable|SwapTotal|SwapFree' /proc/meminfo
```
Interpretation: MemAvailable under ~800MB or swap more than half used means
agent turns will crawl and cron jobs may hit their 300s timeouts. Say so
explicitly and recommend deferring heavy work.

## LLM gateway (all models route through it)
```bash
curl -s -o /dev/null -w '%{http_code}' https://llm.manohargupta.com/health/liveliness
```
Anything but 200 = every agent in the system is degraded.

## Bridge + recent activity
```bash
curl -s http://172.17.0.1:3456/tiger/status -H "Authorization: Bearer $TIGER_BRIDGE_TOKEN"
# last 20 audited events (spawns, cron, tasks, outputs):
curl -s 'http://172.17.0.1:3456/tiger/activity/audit?limit=20' -H "Authorization: Bearer $TIGER_BRIDGE_TOKEN"
```

## Report format
Lead with a one-line verdict (healthy / degraded / critical), then only the
metrics that are off. Quantify with numbers and units.
