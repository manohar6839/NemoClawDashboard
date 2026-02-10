# Technology Stack

- **Runtime**: Node.js (inferred from `package.json`).
- **AI Model Integration**: 
  - **Primary**: OpenRouter (Model: `arcee-ai/trinity-large-preview:free`).
  - **Fallback**: Anthropic (Model: `claude-3-haiku`).
  - **Embeddings**: OpenRouter (Model: `text-embedding-3-small`).
- **Search**: 
  - **MCP**: `serper-search` (via `mcporter` configuration).
  - **Native**: `tools/search.js` (Direct Node.js script using Serper API).
- **Frontend / UI**:
  - HTML5 & CSS3 (Vanilla).
  - JavaScript (ES6+).
  - **Canvas**: A web-based interface (`canvas/index.html`) acting as a bridge to mobile native layers.
- **Data/Config format**: Markdown (`.md`) is used as the primary database for identity, memory, and instructions.
- **Memory Storage**: Local filesystem (`memory/` directory) for persistence.

## Dashboard Tech Stack
- **Framework**: Next.js 14+ (App Router).
- **Styling**: Tailwind CSS.
- **UI Architecture**: **Fixed Sidebar + Flex Content** (Standardized layout across all pages).
- **Components**: Shadcn/UI (Radix Primitives).
- **Icons**: Lucide React.
- **Theme**: `next-themes` (Dark/Light mode).
- **Visual Feedback**: `agentation`.
- **Data Fetching**: `SWR` for real-time status updates.
- **Integration**:
  - **Chat**: Iframe embedding of native Clawdbot interface.
  - **Memory**: Direct filesystem access via API routes.
  - **Status**: HTTP liveness probe to agent process.
