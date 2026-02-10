# Setup & Usage

## Prerequisites
- Node.js installed.
- **API Keys**:
  - `OPENROUTER_API_KEY` (for Primary Model & Embeddings).
  - `ANTHROPIC_API_KEY` (for Fallback Model).
  - `SERPER_API_KEY` (for Web Search).

## Configuration "Gotchas"
- **Global Config**: `mcporter.json` MUST reside in `~/.clawdbot/mcporter.json` for the global agent to detect MCP servers.
- **Memory Sync**: Requires an OpenAI-compatible embedding endpoint. We use OpenRouter (`text-embedding-3-small`) configured in `clawdbot.json`.
- **Search**: If MCP fails (`mcp.local` errors), use the native fallback script: `node tools/search.js`.

## Installation
1.  Navigate to the project root.
2.  Install dependencies:
    ```bash
    npm install
    ```

## Bootstrapping a New Agent
1.  Read `BOOTSTRAP.md` if it exists.
    - Follow the instructions to initialize your identity.
    - Delete `BOOTSTRAP.md` once complete.
2.  Edit `IDENTITY.md` to define your name, avatar, and vibe.
3.  Edit `TOOLS.md` to configure local environment specifics (cameras, etc.).

## Running
- **Canvas UI**: Open `canvas/index.html` in a browser or a compatible mobile web view wrapper to test the interface.
- **Agent Logic**: The agent logic is primarily driven by the LLM reading the context files (`AGENTS.md`, `MEMORY.md`, etc.). There is no single "start" script defined in `package.json` by default, suggesting this workspace is context for an external runner or a custom script (not yet present or external to this repo).
