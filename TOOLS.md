# Available Tools

## Web Search

- **Skill**: `serper-search` (registered in `config/mcporter.json`)
- **Action**: Use the `google_search` tool for web queries.
- **Fallback**: If `google_search` fails or MCP is unavailable, execute:
  `node tools/search.js "your query here"`
  (This script runs natively and bypasses the MCP server).

## YouTube

- **Skill**: `youtube-full`
- **Location**: `skills/youtube-full`
- **Capabilities**: Search videos, get transcripts, monitor channels/playlists.
- **Reference**: Read `skills/youtube-full/SKILL.md` for instructions.
## Specialist Delegation

- **Skill**: `spawn-delegate` — hand work to Cody/Ethan/Cathy/Elon via the
  bridge; results arrive on Telegram. Read `skills/spawn-delegate/SKILL.md`.

## Trading Positions

- **Skill**: `angel-positions` — read-only live P&L from
  `angel.manohargupta.com/api/positions`. Never executes trades.

## Task Inbox

- **Skill**: `inbox-manager` — add/list/drain `## 📥 INBOX` items in
  TASKS.md; the bridge auto-dispatches the top item every 30 min.

## System Health

- **Skill**: `sys-health` — host RAM/swap from `/proc/meminfo`, LLM gateway
  liveliness, bridge status, recent audit events.
