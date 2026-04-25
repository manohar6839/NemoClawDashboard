/**
 * bridge.ts — HTTP client for the Tiger Bridge API
 *
 * This module replaces the old WebSocket gateway client (gateway.ts) for
 * Tiger-specific operations.  Instead of a persistent WebSocket connection,
 * we make simple HTTP fetch calls to the Bridge API running on the VPS.
 *
 * The Bridge URL is set via TIGER_BRIDGE_URL environment variable.
 * In production: https://agent.manohargupta.com/bridge
 * In development: http://localhost:3456
 *
 * How calls flow:
 *   Dashboard component
 *     → fetch("/api/tiger/status")       [Next.js API route — server-side]
 *       → bridgeGet("/tiger/status")     [this file — makes authenticated call]
 *         → Tiger Bridge (Express)       [VPS]
 *           → execOnHost / execInSandbox [docker exec...]
 *
 * Why go through Next.js API routes instead of calling the Bridge directly
 * from the browser?
 *   1. The Bridge token never leaves the server
 *   2. CORS is simpler (same-origin requests from the browser)
 *   3. We can add caching/rate limiting in one place
 */

// ─── Configuration ──────────────────────────────────────────────────────────
// These are read on the SERVER side (Next.js API routes), not the browser.
// In .env.local:
//   TIGER_BRIDGE_URL=http://localhost:3456
//   TIGER_BRIDGE_TOKEN=your-secret-token-here

const BRIDGE_URL = process.env.TIGER_BRIDGE_URL || "http://localhost:3456";
const BRIDGE_TOKEN = process.env.TIGER_BRIDGE_TOKEN || "";

// ─── Request helpers ─────────────────────────────────────────────────────────

/**
 * Build the Authorization header for Bridge API calls.
 * If no token is set, omit the header (dev mode).
 */
function authHeaders(): Record<string, string> {
  if (!BRIDGE_TOKEN) return {};
  return { Authorization: `Bearer ${BRIDGE_TOKEN}` };
}

/**
 * Make a GET request to the Tiger Bridge.
 *
 * @param path - Bridge API path, e.g. "/tiger/status"
 * @param query - Optional query string params, e.g. { lines: "100" }
 * @returns Parsed JSON response
 * @throws Error if the response is not ok
 *
 * Example:
 *   const status = await bridgeGet("/tiger/status")
 *   const files = await bridgeGet("/tiger/workspace", { path: "memory" })
 */
export async function bridgeGet(
  path: string,
  query: Record<string, string> = {}
): Promise<unknown> {
  const url = new URL(`${BRIDGE_URL}${path}`);

  // Append query params to the URL
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    // Don't cache — bridge data is always live
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Bridge GET ${path} failed: ${res.status} ${body}`);
  }

  return res.json();
}

/**
 * Make a POST request to the Tiger Bridge.
 *
 * @param path - Bridge API path, e.g. "/tiger/exec"
 * @param body - Request body (will be JSON-encoded)
 * @returns Parsed JSON response
 * @throws Error if the response is not ok
 *
 * Example:
 *   const result = await bridgePost("/tiger/exec", { command: "ls /sandbox" })
 *   const updated = await bridgePost("/tiger/config", { patch: { model: "..." } })
 */
export async function bridgePost(
  path: string,
  body: Record<string, unknown> = {}
): Promise<unknown> {
  const res = await fetch(`${BRIDGE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`Bridge POST ${path} failed: ${res.status} ${errBody}`);
  }

  return res.json();
}

/**
 * Make a DELETE request to the Tiger Bridge.
 *
 * @param path - Bridge API path, e.g. "/tiger/projects/proj_xxx"
 */
export async function bridgeDelete(path: string): Promise<unknown> {
  const res = await fetch(`${BRIDGE_URL}${path}`, {
    method: "DELETE",
    headers: {
      ...authHeaders(),
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`Bridge DELETE ${path} failed: ${res.status} ${errBody}`);
  }

  return res.json();
}

/**
 * Get the full URL for the Bridge's SSE logs endpoint.
 * This is used by the Next.js API route that proxies the SSE stream.
 *
 * @param lines - How many historical lines to tail
 * @param filter - Optional keyword filter
 */

/**
 * Make a PUT request to the Tiger Bridge.
 * Used for file saves: PUT /tiger/agents/:id/file?path=...
 */
export async function bridgePut(
  path: string,
  query: Record<string, string> = {},
  body: Record<string, unknown> = {}
): Promise<unknown> {
  const params = new URLSearchParams(query);
  const qs = params.toString() ? `?${params.toString()}` : "";
  const res = await fetch(`${BRIDGE_URL}${path}${qs}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`Bridge PUT ${path} failed: ${res.status} ${errBody}`);
  }

  return res.json();
}

export function bridgeLogsUrl(lines = 100, filter = ""): string {
  const url = new URL(`${BRIDGE_URL}/tiger/logs`);
  url.searchParams.set("lines", String(lines));
  if (filter) url.searchParams.set("filter", filter);
  return url.toString();
}

/**
 * Export the auth headers so the SSE proxy route can use them.
 */
export { authHeaders };
