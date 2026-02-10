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