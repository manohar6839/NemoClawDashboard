# Project Structure

## Core Configuration
- **AGENTS.md**: Main entry point. Defines rules, interactions, and "life" philosophy.
- **SOUL.md**: Defines the agent's core personality and internal monologue style.
- **IDENTITY.md**: Brief summary of the agent's name, avatar, and vibe (e.g., "Tarzan").
- **TOOLS.md**: User-specific configuration for tools (e.g., camera names, API keys, preferences).
- **BOOTSTRAP.md**: Instructions for the very first run (birth certificate).

## Memory System
- **MEMORY.md**: Long-term, curated memory. Only strictly loaded in main sessions for security.
- **memory/**: Directory containing daily log files (`YYYY-MM-DD.md`) and state modules (e.g., `heartbeat-state.json`).

## Interface & Interaction
- **canvas/**: Contains `index.html` which acts as the UI surface for the agent when running on mobile devices.
  - Interacts with `window.clawdbotSendUserAction` bridge.
- **HEARTBEAT.md**: Instructions for periodic background checks (cron-like behavior).

## Tools & Skills
- **tools/**: Directory for external tool definitions and scripts.
  - **serper-search/**: MCP server implementation.
  - **search.js**: Native fallback script for web search.
- **config/**:
  - **mcporter.json**: MCP server configuration (Symlink or copy to `~/.clawdbot/`).
- **package.json**: Defines Node.js dependencies.

## Command Center Dashboard (`dashboard/`)
- **src/app/**: Next.js App Router structure.
  - **layout.tsx**: Root layout with `ThemeProvider`, `Agentation`, and `Sidebar`.
  - **page.tsx**: Main dashboard view with Stat Cards.
  - **skills/**, **memory/**, **cron/**, **chat/**, **sessions/**: Feature-specific pages.
  - **api/**: Backend API routes.
    - **status/**: System and agent status (including `clawdbot` liveness probe).
    - **memory/**: Read/Write memory files (supports root `MEMORY.md`).
    - **skills/**, **cron/**, **sessions/**: Feature APIs.
- **src/components/**:
  - **app-sidebar.tsx**: Navigation and agent status indicator.
  - **theme-provider.tsx**: Dark/Light mode support.
  - **mode-toggle.tsx**: UI for switching themes.
  - **chat-interface.tsx**: Embedded chat component.

## Documentation
- **docs/AGENTATION_WORKFLOW.md**: Guide for using the visual feedback tool.
