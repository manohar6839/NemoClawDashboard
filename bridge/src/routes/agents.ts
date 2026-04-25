/**
 * agents.ts — Per-agent workspace file browser + activity feed
 */

import { Router, Request, Response } from "express";
import { execInSandbox } from "../tiger.js";

const router = Router();

const AGENTS = [
  { id: "main",       name: "Tiger",  emoji: "🐯", role: "orchestrator", basePath: "/home/node/.openclaw/workspace" },
  { id: "coder",      name: "Cody",   emoji: "👷", role: "Coder",        basePath: "/home/node/.openclaw/agents/coder" },
  { id: "researcher", name: "Ethan",  emoji: "🔍", role: "Researcher",   basePath: "/home/node/.openclaw/agents/researcher" },
  { id: "writer",     name: "Cathy",  emoji: "✍️",  role: "Writer",       basePath: "/home/node/.openclaw/agents/writer" },
  { id: "pm",         name: "Elon",   emoji: "✅", role: "PM",           basePath: "/home/node/.openclaw/agents/pm" },
];

function getAgent(id: string) {
  return AGENTS.find((a) => a.id === id) ?? null;
}

function isSafePath(p: string): boolean {
  return !p.includes("..") && !p.startsWith("/");
}

// GET /tiger/agents
router.get("/", async (_req: Request, res: Response) => {
  try {
    const results = await Promise.all(
      AGENTS.map(async (agent) => {
        const { stdout } = await execInSandbox(
          `find ${agent.basePath} -type f -printf '%T@\n' 2>/dev/null | sort -rn`
        );
        const mtimes = stdout.split("\n").filter(Boolean).map(Number);
        return {
          id: agent.id, name: agent.name, emoji: agent.emoji, role: agent.role,
          fileCount: mtimes.length,
          lastActivity: mtimes.length > 0 ? Math.floor(mtimes[0] * 1000) : 0,
        };
      })
    );
    res.json({ ok: true, agents: results });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /tiger/agents/:id/files?path=deliverables
router.get("/:id/files", async (req: Request, res: Response) => {
  const agent = getAgent(req.params.id);
  if (!agent) return res.status(404).json({ ok: false, error: "Unknown agent id" });

  const relPath = (req.query.path as string) || "";
  if (relPath && !isSafePath(relPath)) return res.status(400).json({ ok: false, error: "Invalid path" });

  const targetDir = relPath ? `${agent.basePath}/${relPath}` : agent.basePath;
  const dirName = targetDir.split("/").pop() ?? "";

  try {
    const { stdout } = await execInSandbox(
      `find ${targetDir} -maxdepth 1 -printf '%y|%s|%T@|%f\n' 2>/dev/null | sort`
    );

    const items = stdout
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [typeChar, sizeStr, mtimeStr, ...rest] = line.split("|");
        const name = rest.join("|");
        return {
          name,
          type: typeChar === "d" ? "dir" as const : "file" as const,
          size: parseInt(sizeStr) || 0,
          modifiedAt: Math.floor(parseFloat(mtimeStr) * 1000),
        };
      })
      .filter((f) => f.name !== "." && f.name !== dirName);

    res.json({ ok: true, items });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /tiger/agents/:id/file?path=deliverables/ev-dashboard.html
router.get("/:id/file", async (req: Request, res: Response) => {
  const agent = getAgent(req.params.id);
  if (!agent) return res.status(404).json({ ok: false, error: "Unknown agent id" });

  const relPath = req.query.path as string;
  if (!relPath) return res.status(400).json({ ok: false, error: "Missing path param" });
  if (!isSafePath(relPath)) return res.status(400).json({ ok: false, error: "Invalid path" });

  const fullPath = `${agent.basePath}/${relPath}`;

  try {
    const { stdout: sizeOut } = await execInSandbox(`stat -c%s ${fullPath} 2>/dev/null || echo 0`);
    const size = parseInt(sizeOut.trim()) || 0;
    if (size > 5 * 1024 * 1024) return res.status(413).json({ ok: false, error: "File too large (> 5MB)" });

    const { stdout: mimeOut } = await execInSandbox(`file --mime-type -b ${fullPath} 2>/dev/null`);
    const mime = mimeOut.trim();
    const isText = mime.startsWith("text/") || mime.includes("json") || mime.includes("xml") || mime.includes("javascript");

    if (!isText && size > 0) {
      const { stdout: b64 } = await execInSandbox(`base64 -w0 ${fullPath} 2>/dev/null`);
      return res.json({ ok: true, path: relPath, content: b64, encoding: "base64", size, mime });
    }

    const { stdout: content, exitCode } = await execInSandbox(`cat ${fullPath} 2>/dev/null`);
    if (exitCode !== 0) return res.status(404).json({ ok: false, error: "File not found" });

    res.json({ ok: true, path: relPath, content, encoding: "utf8", size, mime });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});


// GET /tiger/agents/activity?limit=50
router.get("/activity", async (req: Request, res: Response) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
  try {
    const agentPaths = AGENTS.map((a) => a.basePath).join(" ");
    const { stdout } = await execInSandbox(
      `find ${agentPaths} -type f -printf '%T@ %p\n' 2>/dev/null | sort -rn | head -${limit}`
    );
    const events = stdout
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const spaceIdx = line.indexOf(" ");
        const ts = Math.floor(parseFloat(line.slice(0, spaceIdx)) * 1000);
        const fullPath = line.slice(spaceIdx + 1);
        const agent = AGENTS.find((a) => fullPath.startsWith(a.basePath)) ?? null;
        if (!agent) return null;
        const relPath = fullPath.slice(agent.basePath.length + 1);
        return { agentId: agent.id, agentName: agent.name, agentEmoji: agent.emoji, path: relPath, action: "modified", ts };
      })
      .filter(Boolean);
    res.json({ ok: true, events });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});


// PUT /tiger/agents/:id/file?path=... — write file contents back into container
// Body: { content: string }
router.put("/:id/file", async (req: Request, res: Response) => {
  const agent = getAgent(req.params.id);
  if (!agent) return res.status(404).json({ ok: false, error: "Unknown agent id" });

  const relPath = req.query.path as string;
  if (!relPath) return res.status(400).json({ ok: false, error: "Missing path param" });
  if (!isSafePath(relPath)) return res.status(400).json({ ok: false, error: "Invalid path" });

  const { content } = req.body as { content?: string };
  if (typeof content !== "string") {
    return res.status(400).json({ ok: false, error: "Body must be { content: string }" });
  }

  const fullPath = `${agent.basePath}/${relPath}`;

  try {
    // Write via stdin to avoid shell quoting issues with special characters.
    // We base64-encode the content on the Node side, pipe it in, and decode inside the container.
    const b64 = Buffer.from(content, "utf-8").toString("base64");
    const { exitCode, stderr } = await execInSandbox(
      `echo '${b64}' | base64 -d > ${fullPath}`
    );
    if (exitCode !== 0) {
      return res.status(500).json({ ok: false, error: "Write failed", details: stderr });
    }
    res.json({ ok: true, path: relPath });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
