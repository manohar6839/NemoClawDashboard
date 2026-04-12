/**
 * /api/tiger/workspace — GET
 *
 * List files in the Tiger agent's workspace.
 *
 * Query params:
 *   ?path=subdir  — list files in a subdirectory (default: root)
 *   ?read=filepath — read a specific file's contents
 *
 * List response:
 *   {
 *     ok: true,
 *     path: "/",
 *     count: 12,
 *     files: [{ name, type, size, modified }]
 *   }
 *
 * Read response:
 *   {
 *     ok: true,
 *     path: "MEMORY.md",
 *     content: "...",
 *     size: 1234
 *   }
 */

import { NextResponse } from "next/server";
import { bridgeGet } from "@/lib/bridge";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const readPath = searchParams.get("read");
  const listPath = searchParams.get("path") || "";

  try {
    if (readPath) {
      // Read mode: get file contents
      const result = await bridgeGet("/tiger/files/read", { path: readPath });
      return NextResponse.json(result);
    } else {
      // List mode: list directory contents
      const query: Record<string, string> = {};
      if (listPath) query.path = listPath;
      const result = await bridgeGet("/tiger/workspace", query);
      return NextResponse.json(result);
    }
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: "Workspace error", details: err.message },
      { status: 502 }
    );
  }
}
