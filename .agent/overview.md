# Clawdbot Overview

Clawdbot is an AI agent framework designed to function as a persistent, personalized assistant. It emphasizes:

- **Identity & Personality**: Defined via `AGENTS.md`, `SOUL.md`, and `IDENTITY.md`.
- **Memory**: Maintains both short-term (daily logs in `memory/YYYY-MM-DD.md`) and long-term memory (`MEMORY.md`).
- **Context Awareness**: "Heartbeat" mechanisms to periodically check environment states (email, calendar, etc.).
- **Mobile Integration**: Uses a "Canvas" (`canvas/index.html`) to interact with iOS and Android host applications via a bridge.
- **Tool Use**: Expands capabilities through "Skills" defined in `tools/` or `SKILL.md` files.

## Command Center Dashboard
A Next.js-based local dashboard (`clawd/dashboard`) provides a visual interface for managing the agent:
- **Status Monitoring**: Real-time agent status, memory usage, and uptime.
- **Skill Management**: View and manage installed capabilities.
- **Memory Explorer**: Browse and read daily memory logs.
- **Cron Job Scheduler**: Manage scheduled tasks and background jobs.
- **Visual Feedback**: Integrated `Agentation` tool for precise UI annotation.

The goal is to create an agent that "lives" in your workspace, remembers context across sessions, and acts proactively.
