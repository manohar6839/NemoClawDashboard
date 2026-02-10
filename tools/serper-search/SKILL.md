---
name: serper-search
description: Search the web for real-time information using Serper.dev
---

# Web Search Skill

This skill allows the agent to search the internet for up-to-date information, news, and data not present in its training set.

## Capabilities

The tool is provided by the `serper-search-scrape-mcp-server` package.
It provides:
- **google_search**: Perform a Google search.
- **scrape**: Scrape a webpage found in search results.

## Usage

## Usage

When you need to find information online, use the `google_search` tool.

**Required Parameters**:
- `q`: The search query.
- `gl`: Country code. **ALWAYS use "in" (India) unless explicitly asked otherwise.**
- `hl`: Language code. **ALWAYS use "en" (English) unless explicitly asked otherwise.**

**Example**:
```json
{
  "q": "Indian Budget 2026",
  "gl": "in",
  "hl": "en"
}
```

### Configuration

- **Env**: `SERPER_API_KEY` is loaded from the root `.env` file.
- **Run**: `npm start` in this directory.
