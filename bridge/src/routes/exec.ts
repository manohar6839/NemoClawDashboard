/**
 * Exec route — POST /api/exec
 * Run arbitrary commands inside the Tiger sandbox.
 * Use with care — this is the raw escape hatch.
 * 
 * Body: { command: string, timeout?: number }
 */

import { Router } from "express";
import { execInSandbox, execOnHost } from "../tiger.js";

const router = Router();

router.post("/", async (req, res) => {
  const { command, timeout, target = "sandbox" } = req.body;

  if (!command || typeof command !== "string") {
    return res.status(400).json({ error: "Missing 'command' in request body" });
  }

  // Safety: block obviously destructive commands
  const blocked = ["rm -rf /", "mkfs", "dd if=", ":(){ :|:& };:"];
  if (blocked.some((b) => command.includes(b))) {
    return res.status(403).json({ error: "Command blocked for safety" });
  }

  try {
    const exec = target === "host" ? execOnHost : execInSandbox;
    const result = await exec(command, timeout || 30_000);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
