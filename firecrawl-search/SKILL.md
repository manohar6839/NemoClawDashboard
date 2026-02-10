# FireCrawl Search Integration

## Overview
This skill integrates the FireCrawl API to enable web search capabilities within Clawdbot.

## Tool: firecrawl-search
The `firecrawl-search` tool provides the following functionality:

### Parameters
- `query` (required): The search query to be executed.
- `apiKey` (required): The FireCrawl API key to authenticate the request.

### Output
The tool returns a JSON object with the following structure:
```json
{
  "results": [
    {
      "url": "https://example.com",
      "title": "Example Website",
      "snippet": "This is an example website description."
    },
    {
      "url": "https://another.com",
      "title": "Another Website",
      "snippet": "This is another website description."
    }
  ]
}
```

## Implementation
1. The `firecrawl-search` tool will make a POST request to the FireCrawl `/v2/scrape` endpoint, passing the provided `query` and `apiKey` as parameters.
2. The tool will process the API response, extracting the relevant search results (URL, title, and snippet).
3. The tool will return the search results in the format specified above.

## Configuration
To use the `firecrawl-search` tool, you'll need to add the following configuration to the Clawdbot `clawdbot.json` file:

```json
{
  "tools": {
    "firecrawl-search": {
      "path": "/Users/manohar_air/clawd/firecrawl-search/index.js",
      "parameters": {
        "query": {
          "type": "string",
          "required": true
        },
        "apiKey": {
          "type": "string",
          "required": true
        }
      }
    }
  }
}
```

Please let me know if you have any other questions or if you'd like me to proceed with the implementation of the `firecrawl-search` tool.