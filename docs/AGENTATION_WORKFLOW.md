# Agentation Workflow for UI Feedback

Use this workflow when you need to provide or receive precise visual feedback on the UI. The `agentation` tool allows you to click elements, add notes, and copy structured output that helps AI agents identify the exact DOM elements you are referring to.

## Project Setup
Ensure `agentation` is installed and integrated into your root layout (done in this project).

## How to Use Agentation

1.  **Activate Toolbar**: Click the Agentation toolbar in the **bottom-right corner** of the screen.
2.  **Select Element**: Click on any UI element you want to modify or comment on. The tool will automatically generate a unique CSS selector for it.
3.  **Add Feedback**: Type your request or observation in the comment box (e.g., "Change background to blue", "Fix padding here").
4.  **Copy Prompt**: Click the **Copy** button. This copies a structured Markdown snippet containing:
    *   The specific element selector
    *   Your feedback note
    *   Contextual information (viewport size, current URL)

    *   Contextual information (viewport size, current URL)

## Prompts for Antigravity

### 1. To Install Agentation in a New Project
If you want to add this tool to a new project, give this prompt to your agent:

```markdown
Please integrate the 'agentation' tool into this project for UI feedback.
1. Install the package: `npm install agentation -D`
2. Add the `<Agentation />` component to the root `layout.tsx` (or equivalent).
3. Ensure it's imported correctly.
```

### 2. To Provide UI Feedback using Agentation
When you have copied the feedback from the toolbar, paste it to the agent like this:

```markdown
I have feedback on the UI. Here are the details from Agentation:

[PASTE AGENTATION CLIPBOARD CONTENT HERE]

Please implement these changes.
```

## Internal Implementation Details
The `Agentation` component is rendered in `src/app/layout.tsx`. It is a client-side component that injects the toolbar overlay. It is safe to leave enabling in production for internal tools, or wrap in a conditional for public-facing apps.

## Example of Agentation Output
```markdown
## Page Feedback: /
**Viewport:** 1470×801

### 1. <SidebarHeader> "v1.0.0"
**Location:** .group/sidebar-wrapper > .p-2 > .text-xs
**React:** <SidebarHeader> <SidebarMenu>
**Feedback:** Add a status dot here to show if the agent is online.
```
