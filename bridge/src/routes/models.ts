/**
 * routes/models.ts — Available models + per-agent model overrides
 *
 * GET    /tiger/config/models                       List models from registry
 * GET    /tiger/config/models/agents                List per-agent overrides
 * PATCH  /tiger/config/models/agents/:agentId       Set/clear an agent's override
 *
 * Per-agent override semantics:
 *   - Each agent in openclaw.json's `agents.list[]` may carry its own
 *     `model.primary` (and optional `model.fallback`) which overrides the
 *     global `agents.defaults.model`.
 *   - PATCH body { model: "anthropic/claude-haiku-4-5" } sets the primary.
 *   - PATCH body { model: null } CLEARS the override (revert to default).
 *   - We never touch agents that aren't in the body. Only the targeted entry
 *     is mutated. Other agents' overrides are preserved as-is.
 *
 * Why we don't use updateConfig() / deepMerge here:
 *   `agents.list` is a JSON array. The bridge's deepMerge treats arrays as
 *   scalar values (replacement), but writing the whole list with a single
 *   missing entry would silently drop other agents. So we do an explicit
 *   read-mutate-write pass on the array — safer and easier to reason about.
 */

import { Router, Request, Response } from "express";
import { readFile, writeFile } from "fs/promises";
import { execOnHost, readModels } from "../tiger.js";

const router = Router();

// Hard path — same one tiger.ts uses. Kept local rather than re-exported
// because tiger.ts treats it as a private constant.
const OPENCLAW_CONFIG_HOST =
  "/var/lib/docker/volumes/tiger_tiger-config/_data/openclaw.json";

// Curated agent IDs we expose for override. Must align with agents.ts.
const KNOWN_AGENT_IDS = ["tiger", "cody", "ethan", "cathy", "elon"] as const;
type KnownAgentId = (typeof KNOWN_AGENT_IDS)[number];

// ─── GET /tiger/config/models ──────────────────────────────────────────────
// Returns the full registry of available models. Existing endpoint — kept
// as-is so the dashboard's model picker continues to work.
router.get("/", async (_req: Request, res: Response) => {
  try {
    const models = await readModels();
    res.json({ ok: true, models });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /tiger/config/models/agents ───────────────────────────────────────
// Returns the global default plus the per-agent override map.
// Shape:
//   {
//     ok: true,
//     defaults: { primary: "...", fallback: "..." },
//     overrides: {
//       tiger:  { primary: "minimax/MiniMax-M2.7" },
//       cody:   { primary: "anthropic/claude-sonnet-4-6" },
//       ethan:  null,    // no override → uses defaults
//       cathy:  null,
//       elon:   null,
//     }
//   }
router.get("/agents", async (_req: Request, res: Response) => {
  try {
    const raw = await readFile(OPENCLAW_CONFIG_HOST, "utf-8");
    const cfg = JSON.parse(raw);

    const defaults = cfg?.agents?.defaults?.model ?? null;
    const list: any[] = Array.isArray(cfg?.agents?.list) ? cfg.agents.list : [];

    // Build the override map. Missing agents → null (no override).
    const overrides: Record<string, any> = {};
    for (const id of KNOWN_AGENT_IDS) {
      const entry = list.find((a) => a?.id === id);
      overrides[id] = entry?.model ?? null;
    }

    res.json({ ok: true, defaults, overrides });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── PATCH /tiger/config/models/agents/:agentId ────────────────────────────
// Body: { model: string | null }
//   string → set primary (e.g. "anthropic/claude-haiku-4-5")
//   null   → clear override (revert to defaults)
// Optional body: { model: { primary: "...", fallback: "..." } } for full set.
router.patch("/agents/:agentId", async (req: Request, res: Response) => {
  const agentId = req.params.agentId as KnownAgentId;

  if (!(KNOWN_AGENT_IDS as readonly string[]).includes(agentId)) {
    return res.status(400).json({
      ok: false,
      error: `Unknown agentId. Must be one of: ${KNOWN_AGENT_IDS.join(", ")}`,
    });
  }

  const { model } = req.body as { model?: string | { primary: string; fallback?: string } | null };

  if (model !== null && model !== undefined && typeof model !== "string" && typeof model !== "object") {
    return res.status(400).json({
      ok: false,
      error: "Body.model must be a string slug, an object {primary,fallback}, or null",
    });
  }

  try {
    // 1. Read current config straight from the volume.
    const raw = await readFile(OPENCLAW_CONFIG_HOST, "utf-8");
    const cfg = JSON.parse(raw);

    // 2. Make sure the shape we need exists.
    cfg.agents ??= {};
    cfg.agents.list ??= [];
    if (!Array.isArray(cfg.agents.list)) {
      return res.status(500).json({
        ok: false,
        error: "openclaw.json: agents.list is not an array",
      });
    }

    // 3. Locate or create the agent's entry in the list.
    const list: any[] = cfg.agents.list;
    let idx = list.findIndex((a) => a?.id === agentId);
    if (idx === -1) {
      list.push({ id: agentId });
      idx = list.length - 1;
    }

    // 4. Apply the patch.
    if (model === null || model === undefined) {
      // Clear override: drop the model field entirely. We keep the entry
      // around (don't delete it) so future PATCHes can add it back.
      delete list[idx].model;
    } else if (typeof model === "string") {
      list[idx].model = { primary: model };
    } else {
      // Object form — { primary, fallback? }
      if (typeof model.primary !== "string" || !model.primary) {
        return res.status(400).json({
          ok: false,
          error: "model.primary is required when model is an object",
        });
      }
      list[idx].model = {
        primary: model.primary,
        ...(model.fallback ? { fallback: model.fallback } : {}),
      };
    }

    // 5. Backup before writing (mirrors updateConfig's pattern).
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = OPENCLAW_CONFIG_HOST.replace(
      "openclaw.json",
      `openclaw-${timestamp}.bak.json`,
    );
    await execOnHost(`cp ${OPENCLAW_CONFIG_HOST} ${backupPath} 2>/dev/null || true`);

    // 6. Write back. v2026 doesn't need the hash regen step.
    await writeFile(OPENCLAW_CONFIG_HOST, JSON.stringify(cfg, null, 2), "utf-8");

    res.json({
      ok: true,
      agentId,
      model: list[idx].model ?? null,
      backupPath,
    });
  } catch (err: any) {
    console.error("[models] PATCH failed:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
