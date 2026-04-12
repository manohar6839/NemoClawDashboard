/**
 * files.ts — Workspace file browser
 *
 * Exposes the Tiger agent's workspace files so the dashboard can
 * display outputs, memory files, logs, etc.
 *
 * The workspace is accessed via a symlink on the host at:
 *   /root/tiger-workspace → (live pod filesystem)
 *
 * Routes:
 *   GET /tiger/workspace          — list files in workspace root
 *   GET /tiger/workspace?path=sub — list files in a subdirectory
 *   GET /tiger/files/read?path=x  — read a file's contents as text
 *
 * Security:
 *   - Path traversal (`../`) is stripped before use
 *   - Files outside the workspace symlink cannot be accessed
 */

import { Router, Request, Response } from "express";
import { listWorkspaceFiles, readWorkspaceFile } from "../tiger.js";

const router = Router();

// ─── GET /tiger/workspace  (or /tiger/workspace?path=subdir) ─────────────────
// Lists files and directories in the workspace (or a subdirectory)
router.get("/", async (req: Request, res: Response) => {
  try {
    // ?path=some/subdir — optional subdirectory to list
    const subpath = (req.query.path as string) || "";

    const files = await listWorkspaceFiles(subpath);

    res.json({
      ok: true,
      path: subpath || "/",
      count: files.length,
      files,
    });
  } catch (err: any) {
    res.status(500).json({
      ok: false,
      error: "Failed to list workspace files",
      details: err.message,
    });
  }
});

// ─── GET /tiger/files/read?path=MEMORY.md ────────────────────────────────────
// Read the text content of a single workspace file
router.get("/read", async (req: Request, res: Response) => {
  const filepath = req.query.path as string;

  if (!filepath) {
    return res.status(400).json({
      ok: false,
      error: "Missing 'path' query parameter — e.g. ?path=MEMORY.md",
    });
  }

  try {
    const content = await readWorkspaceFile(filepath);

    // Return JSON by default; if the client wants raw text, they can check 'content'
    res.json({
      ok: true,
      path: filepath,
      content,
      size: content.length,
    });
  } catch (err: any) {
    // File not found is a 404, not a 500
    const isNotFound = err.message?.includes("not found") || err.message?.includes("No such file");
    res.status(isNotFound ? 404 : 500).json({
      ok: false,
      error: isNotFound ? `File not found: ${filepath}` : "Failed to read file",
      details: err.message,
    });
  }
});

export default router;
