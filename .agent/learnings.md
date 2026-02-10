# Learnings & Best Practices

## User Preferences & Constraints
- **NO AUTO-BROWSER TESTING**: Do **not** automatically test features in the browser to save tokens. **ALWAYS ASK** the user before running browser verification steps.
- **Keep it Simple**: Avoid over-engineering. Use standard, robust solutions (e.g., Flexbox) over complex libraries (e.g., `react-resizable-panels`) unless necessary.

## Technical Learnings

### Layout Architecture
- **Issue**: `react-resizable-panels` caused significant layout instability ("fluid shit"), with panels shrinking to unusable widths and overlapping content.
- **Solution**: Use a **Fixed Sidebar + Fluid Content** pattern using standard Flexbox (`flex-none w-[300px]` + `flex-1 min-w-0`). This is robust, predictable, and easier to maintain.
- **Consistency**: Standardize layout across related pages (Skills, Memory, Cron, Sessions) to reduce cognitive load and maintenance overhead.
- **Critical CSS**: Always use `min-w-0` on flex children to prevent text overflow from breaking the layout.

### API & File Handling
- **Root Files**: When accessing core files like `MEMORY.md` at the project root via API routes, explicitly handle the path traversal (e.g., `../MEMORY.md`) to avoid being restricted to subdirectories.
- **Path Security**: Always validate or sanitize dynamic path segments to prevent arbitrary file access, but allow controlled exceptions for known root files.

### Tool Integration
- **Agentation**: Integrated for visual feedback.
  - **Workflow**: Defined in `docs/AGENTATION_WORKFLOW.md`.
  - **Implementation**: Added to `layout.tsx` for global availability.

### Feature Implementation
- **Navigation**: Wrap interactive cards (Memory, Cron) in `Link` components to match the behavior of Skills cards.
- **Status Indicators**: Use simple visual cues (e.g., green/red dots) in the Sidebar to convey system status (fetching from `/api/status` via SWR).

## Workflow Improvements
- **Prompting**: Use the structured output from `agentation` to clearly communicate UI changes.
- **Documentation**: Keep `.agent/` updated with new architectural decisions to prevent regression.
- **Git Sync**: Regularly commit changes to `.agent` and `.claude` to keep the agent's self-knowledge in sync with the repository.
