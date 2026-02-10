# Clawd Agent Dashboard

> A premium, dark-mode "Command Center" for the Clawd AI Agent.

![Dashboard Preview](https://via.placeholder.com/800x400?text=Clawd+Dashboard+Preview)

## Overview

The **Clawd Dashboard** is a centralized interface designed to monitor and interact with the Clawd AI agent. It provides real-time visibility into the agent's memory, logs, scheduled tasks (cron jobs), and capabilities (skills), all wrapped in a sleek, responsive UI.

## Features

- **📊 System Status**: Real-time heartbeat monitoring of the `clawdbot` process.
- **🧠 Memory Management**: View and edit the agent's core memory (`MEMORY.md`) and daily logs.
- **🛠️ Skills Registry**: Browse, edit, and manage the agent's capabilities and MCP tools.
- **⏱️ Cron Jobs**: detailed view and control over scheduled background tasks.
- **💬 Chat Interface**: Integrated chat window to communicate directly with the agent.
- **🌗 Dark Mode**: Built with a "Slate & Violet" aesthetic optimized for low-light environments.

## Tech Stack

- **Framework**: [Next.js 14](https://nextjs.org/) (App Router)
- **UI Components**: [Shadcn/UI](https://ui.shadcn.com/) (Radix Primitives)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Icons**: [Lucide React](https://lucide.dev/)
- **State Management**: [SWR](https://swr.vercel.app/) / React Query
- **Backend**: Next.js API Routes (Serverless)

## Getting Started

### Prerequisites

- Node.js 18+
- npm or pnpm

### Installation

1.  Clone the repository:
    ```bash
    git clone https://github.com/manohar6839/clawd-dashboard.git
    cd clawd-dashboard
    ```

2.  Install dependencies:
    ```bash
    npm install
    cd dashboard && npm install
    ```

3.  Configure Environment:
    - Copy example configs:
      ```bash
      cp config/mcporter.example.json config/mcporter.json
      cp config/cron.example.json config/cron.json
      ```

### Running the Dashboard

Start the development server:

```bash
npm run dashboard
```

The dashboard will be available at [http://localhost:3000](http://localhost:3000).

## Project Structure

```
clawd/
├── .agent/          # Agent self-knowledge & documentation
├── dashboard/       # Next.js Application
│   ├── src/app/     # App Router Pages (Memory, Skills, Cron, Chat)
│   └── src/components/ # Shared UI Components
├── config/          # Agent configuration (Cron, MCP)
├── memory/          # Agent daily logs
├── tools/           # External tool scripts
└── MEMORY.md        # Core Agent Memory
```

## Contributing

1.  Fork the repository.
2.  Create a feature branch (`git checkout -b feature/amazing-feature`).
3.  Commit your changes (`git commit -m 'feat: Add amazing feature'`).
4.  Push to the branch (`git push origin feature/amazing-feature`).
5.  Open a Pull Request.

## License

MIT © [Manohar Air](https://github.com/manohar6839)
