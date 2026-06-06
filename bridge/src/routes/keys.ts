/**
 * routes/keys.ts — API key management for the bridge
 *
 * Persists API keys (Anthropic, OpenRouter, Telegram) to the bridge's .env
 * file so they survive restarts. The settings page in the dashboard calls
 * these endpoints.
 *
 * Endpoints:
 *   GET   /tiger/keys           — return key presence (NEVER the values themselves)
 *   PATCH /tiger/keys           — set one or more keys; { ANTHROPIC_API_KEY?, ... }
 *   DELETE /tiger/keys/:name    — clear a single key
 *
 * Security model:
 *   - GETs return only { isSet: true|false } per key. The actual value
 *     never leaves the server. This means the UI shows "Anthropic key
 *     configured ✓" rather than echoing the key back.
 *   - PATCH writes the .env file with the new values. systemd then needs
 *     a restart to pick them up — we do NOT auto-restart from this route
 *     because that would kill the very HTTP request that triggered the
 *     change. The UI tells the user to click "Restart bridge" after saving.
 *   - .env is owned by uid 1000 (the bridge user) and chmod 600.
 *
 * We do NOT support env vars other than the documented allowlist below.
 * That keeps an attacker who finds a way past auth from injecting
 * arbitrary env into a service restart.
 */

import { Router, Request, Response } from "express";
import { readFile, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// .env lives at bridge/.env — i.e. two directories up from src/routes.
// __dirname when running compiled code is dist/routes, when running via tsx
// it's src/routes. Both resolve to the same target via "../../".
const ENV_PATH = path.resolve(__dirname, "../../.env");

// Allowlist — only these keys may be set/cleared via this endpoint.
const ALLOWED_KEYS = [
  "ANTHROPIC_API_KEY",
  "OPENROUTER_API_KEY",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_CHAT_ID",
  "TIGER_ROUTER_MODEL",
] as const;
type AllowedKey = (typeof ALLOWED_KEYS)[number];

const router = Router();

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Read the .env file as a Map<key, value>. Lines that aren't KEY=VALUE
 * (comments, blanks) are kept verbatim so we can preserve them on write.
 *
 * Returns { entries, raw } where:
 *   entries is the parsed map of KEY → VALUE
 *   raw is the original line array (so we can reconstruct on write)
 */
async function readEnvFile(): Promise<{
  entries: Map<string, string>;
  raw: string[];
}> {
  let content = "";
  try {
    content = await readFile(ENV_PATH, "utf-8");
  } catch {
    // Missing .env is fine — treat as empty
    return { entries: new Map(), raw: [] };
  }
  const raw = content.split("\n");
  const entries = new Map<string, string>();
  for (const line of raw) {
    // Skip comments and blanks
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const k = line.slice(0, eq).trim();
    const v = line.slice(eq + 1).trim();
    entries.set(k, v);
  }
  return { entries, raw };
}

/**
 * Reconstruct the .env file with `updates` applied. Existing lines are kept
 * (including comments and order); updated keys are replaced in place;
 * new keys are appended at the bottom.
 */
function applyUpdates(
  raw: string[],
  updates: Map<string, string | null>,
): string {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const line of raw) {
    const trimmed = line.trim();
    // Pass through comments and blanks unchanged
    if (!trimmed || trimmed.startsWith("#")) {
      out.push(line);
      continue;
    }
    const eq = line.indexOf("=");
    if (eq < 0) {
      out.push(line);
      continue;
    }
    const k = line.slice(0, eq).trim();

    if (updates.has(k)) {
      const v = updates.get(k);
      if (v === null) {
        // Cleared: replace with empty value but keep the key so the
        // structure of .env is preserved across restarts.
        out.push(`${k}=`);
      } else {
        out.push(`${k}=${v}`);
      }
      seen.add(k);
    } else {
      // Not being updated — keep as-is
      out.push(line);
    }
  }

  // Append any new keys not already in the file
  for (const [k, v] of updates) {
    if (seen.has(k)) continue;
    if (v === null) continue; // don't bother adding cleared keys
    out.push(`${k}=${v}`);
  }

  return out.join("\n");
}

// ─── GET /tiger/keys ───────────────────────────────────────────────────────
// Returns presence-only: { ANTHROPIC_API_KEY: { isSet: true }, ... }
router.get("/", async (_req: Request, res: Response) => {
  try {
    const { entries } = await readEnvFile();
    const result: Record<string, { isSet: boolean; preview?: string }> = {};

    for (const k of ALLOWED_KEYS) {
      const v = entries.get(k) ?? "";
      // For TIGER_ROUTER_MODEL, the value is non-secret — return it directly.
      // For everything else, only return presence.
      if (k === "TIGER_ROUTER_MODEL") {
        result[k] = { isSet: v.length > 0, preview: v };
      } else {
        result[k] = { isSet: v.length > 0 };
      }
    }
    res.json({ ok: true, keys: result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── PATCH /tiger/keys ─────────────────────────────────────────────────────
// Body: partial object of allowed keys → string (set) or null (clear).
// Example: { ANTHROPIC_API_KEY: "sk-ant-...", TELEGRAM_CHAT_ID: null }
router.patch("/", async (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;
  if (!body || typeof body !== "object") {
    return res.status(400).json({ ok: false, error: "Body must be an object" });
  }

  const updates = new Map<string, string | null>();
  for (const [k, v] of Object.entries(body)) {
    if (!(ALLOWED_KEYS as readonly string[]).includes(k)) {
      return res.status(400).json({
        ok: false,
        error: `Key not allowed: ${k}. Allowed: ${ALLOWED_KEYS.join(", ")}`,
      });
    }
    if (v === null) {
      updates.set(k, null);
    } else if (typeof v === "string") {
      // Reject control chars and newlines that would break .env format
      if (/[\r\n]/.test(v)) {
        return res.status(400).json({
          ok: false,
          error: `Value for ${k} contains newline characters`,
        });
      }
      updates.set(k, v);
    } else {
      return res.status(400).json({
        ok: false,
        error: `Value for ${k} must be a string or null`,
      });
    }
  }

  try {
    const { raw } = await readEnvFile();
    const newContent = applyUpdates(raw, updates);
    await writeFile(ENV_PATH, newContent, { encoding: "utf-8", mode: 0o600 });

    res.json({
      ok: true,
      updated: Array.from(updates.keys()),
      message:
        "Keys saved to .env. Restart tiger-bridge for changes to take effect.",
    });
  } catch (err: any) {
    console.error("[keys] PATCH failed:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── DELETE /tiger/keys/:name ──────────────────────────────────────────────
// Clear a single key (sets it to empty in .env).
router.delete("/:name", async (req: Request, res: Response) => {
  const name = req.params.name;
  if (!(ALLOWED_KEYS as readonly string[]).includes(name)) {
    return res.status(400).json({
      ok: false,
      error: `Key not allowed: ${name}`,
    });
  }
  try {
    const { raw } = await readEnvFile();
    const updates = new Map<string, string | null>([[name, null]]);
    const newContent = applyUpdates(raw, updates);
    await writeFile(ENV_PATH, newContent, { encoding: "utf-8", mode: 0o600 });
    res.json({
      ok: true,
      cleared: name,
      message: "Key cleared. Restart tiger-bridge for changes to take effect.",
    });
  } catch (err: any) {
    console.error("[keys] DELETE failed:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
