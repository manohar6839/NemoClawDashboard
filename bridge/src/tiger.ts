/**
 * tiger.ts — Core executor for Tiger agent inside Docker container
 *
 * Tiger runs directly in tiger-openclaw container (no more k3s layers).
 * Commands are executed via docker exec inside the container.
 */

import { exec, execFile, spawn } from "child_process";
import { promisify } from "util";
import { readFile, writeFile } from "fs/promises";
import { createHash } from "crypto";
import path from "path";

const execAsync = promisify(exec);

// ─── Configuration ───────────────────────────────────────────────
// Tiger runs directly in the tiger-openclaw container
const DOCKER_CONTAINER = "tiger-openclaw";
// Real config lives in the Docker named volume, NOT on the host root path
const OPENCLAW_CONFIG_HOST = "/var/lib/docker/volumes/tiger_tiger-config/_data/openclaw.json";
const OPENCLAW_MODELS_HOST = "/var/lib/docker/volumes/tiger_tiger-config/_data/agents/main/agent/models.json";
const CONFIG_HASH_PATH_SANDBOX = "/sandbox/.openclaw/.config-hash";
const WORKSPACE_SYMLINK = "/var/lib/docker/volumes/tiger_tiger-workspace/_data";
const GATEWAY_WATCHDOG = "/root/gateway-watchdog.sh";

// Timeout for commands (30s default, some ops need longer)
const DEFAULT_TIMEOUT = 30_000;

// ─── Remote mode for local development ──────────────────────────
// When running this bridge on a dev machine (not the VPS), we need to
// reach the tiger-openclaw container over SSH. Setting TIGER_REMOTE=true
// in the env prefixes all docker/host commands with `ssh <TIGER_REMOTE_SSH>`.
// On the real VPS: TIGER_REMOTE is unset → commands run locally as before.
const IS_REMOTE = process.env.TIGER_REMOTE === "true";
const REMOTE_SSH = process.env.TIGER_REMOTE_SSH || "root@100.75.128.45";
const SSH_PREFIX = IS_REMOTE ? `ssh ${REMOTE_SSH} ` : "";

if (IS_REMOTE) {
  console.log(`[bridge] REMOTE MODE: docker commands will run via ssh ${REMOTE_SSH}`);
}

/**
 * Execute a file-based command (no shell) on the host, with optional SSH prefix.
 * Used for safe file reads where execFile avoids shell injection.
 */
async function execFileOnHost(
  file: string,
  args: string[],
  timeoutMs = DEFAULT_TIMEOUT
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const cmd = IS_REMOTE ? ["ssh", REMOTE_SSH, file, ...args] : [file, ...args];
  try {
    const { stdout: out, stderr: err } = await execFile(cmd[0], cmd.slice(1), {
      timeout: timeoutMs,
      maxBuffer: 5 * 1024 * 1024,
    });
    const stdout = typeof out === "string" ? out : out?.toString() ?? "";
    const stderr = typeof err === "string" ? err : err?.toString() ?? "";
    return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode: 0 };
  } catch (err: any) {
    const out = err.stdout;
    const er = err.stderr;
    const stdout = typeof out === "string" ? out : out?.toString() ?? "";
    const stderr = typeof er === "string" ? er : er?.toString() ?? "";
    return {
      stdout: stdout.trim(),
      stderr: (stderr || err.message || "").trim(),
      exitCode: err.code ?? 1,
    };
  }
}

/**
 * Execute a command inside the Tiger container.
 * Commands run directly via docker exec inside tiger-openclaw container.
 */
export async function execInSandbox(
  command: string,
  timeoutMs = DEFAULT_TIMEOUT
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  // Run command directly inside tiger-openclaw container.
  // SSH_PREFIX is empty on the VPS, 'ssh root@host ' for local dev mode.
  const fullCmd = `${SSH_PREFIX}docker exec ${DOCKER_CONTAINER} sh -c ${JSON.stringify(command)}`;

  try {
    const { stdout, stderr } = await execAsync(fullCmd, {
      timeout: timeoutMs,
      maxBuffer: 5 * 1024 * 1024, // 5MB — agent outputs can be large
    });
    return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode: 0 };
  } catch (err: any) {
    // exec throws on non-zero exit codes — we still want the output
    return {
      stdout: (err.stdout || "").trim(),
      stderr: (err.stderr || err.message || "").trim(),
      exitCode: err.code ?? 1,
    };
  }
}

/**
 * Execute a command on the Docker host (not inside the sandbox).
 * Used for: reading host configs, container health, docker inspect, etc.
 */
export async function execOnHost(
  command: string,
  timeoutMs = DEFAULT_TIMEOUT
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    // In remote mode, wrap the command so it runs on the VPS host, not on Mac.
    // Use single-quoted form to avoid local shell interpreting it.
    const fullCmd = IS_REMOTE
      ? `ssh ${REMOTE_SSH} ${JSON.stringify(command)}`
      : command;
    const { stdout, stderr } = await execAsync(fullCmd, {
      timeout: timeoutMs,
      maxBuffer: 5 * 1024 * 1024,
    });
    return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode: 0 };
  } catch (err: any) {
    return {
      stdout: (err.stdout || "").trim(),
      stderr: (err.stderr || err.message || "").trim(),
      exitCode: err.code ?? 1,
    };
  }
}

/**
 * Get comprehensive Tiger status — container health, process state, model info.
 * This replaces the old clawdbot gateway "health" check.
 */
export async function getTigerStatus() {
  // Run multiple checks in parallel for speed
  const [containerState, openclawProc, systemInfo, heartbeat, soulMd] =
    await Promise.allSettled([
      // 1. Is the Docker container running?
      execOnHost(`docker inspect --format='{{.State.Status}}:{{.State.ExitCode}}:{{.State.StartedAt}}' ${DOCKER_CONTAINER}`),

      // 2. Is the OpenClaw process alive inside the sandbox?
      execInSandbox("ps aux | grep -i openclaw | grep -v grep || echo 'NOT_RUNNING'"),

      // 3. System resources inside sandbox
      execInSandbox("cat /proc/meminfo | head -5 && echo '---' && uptime"),

      // 4. Last heartbeat content
      execInSandbox("cat /home/node/.openclaw/workspace/HEARTBEAT.md 2>/dev/null || echo 'NO_HEARTBEAT'"),

      // 5. Agent identity from SOUL.md
      execInSandbox("head -20 /home/node/.openclaw/workspace/SOUL.md 2>/dev/null || echo 'NO_SOUL'"),
    ]);

  // Parse container state
  let container = { status: "unknown", exitCode: -1, startedAt: "" };
  if (containerState.status === "fulfilled" && containerState.value.exitCode === 0) {
    const parts = containerState.value.stdout.split(":");
    container = {
      status: parts[0] || "unknown",
      exitCode: parseInt(parts[1] || "-1"),
      startedAt: parts.slice(2).join(":") || "",
    };
  }

  // Parse OpenClaw process state
  const openclawRunning =
    openclawProc.status === "fulfilled" &&
    !openclawProc.value.stdout.includes("NOT_RUNNING");

  // Parse memory info
  let memoryInfo = { totalKb: 0, freeKb: 0, availableKb: 0 };
  if (systemInfo.status === "fulfilled") {
    const lines = systemInfo.value.stdout.split("\n");
    for (const line of lines) {
      const match = line.match(/^(\w+):\s+(\d+)\s+kB/);
      if (match) {
        if (match[1] === "MemTotal") memoryInfo.totalKb = parseInt(match[2]);
        if (match[1] === "MemFree") memoryInfo.freeKb = parseInt(match[2]);
        if (match[1] === "MemAvailable") memoryInfo.availableKb = parseInt(match[2]);
      }
    }
  }

  // Read host config for model info.
  // OpenClaw stores the default agent model at agents.defaults.model.primary
  // and a list of fallbacks at agents.defaults.model.fallbacks. Some runtime
  // paths (e.g. channels.telegram) or session overrides may pick a different
  // model at request time — we also capture the provider list so the UI can
  // show what's actually available.
  let currentModel = "unknown";
  let fallbackModels: string[] = [];
  let availableModels: string[] = [];
  try {
    // Read config from INSIDE the container — the host copy at
    // OPENCLAW_CONFIG_HOST can be stale if Tiger has updated its config live.
    const { stdout: configRaw, exitCode } = await execInSandbox(
      "cat /home/node/.openclaw/openclaw.json 2>/dev/null"
    );
    if (exitCode === 0 && configRaw) {
      const config = JSON.parse(configRaw);

      const agentDefaults = config?.agents?.defaults?.model;
      if (typeof agentDefaults === "string") {
        currentModel = agentDefaults;
      } else if (agentDefaults && typeof agentDefaults === "object") {
        currentModel = agentDefaults.primary || "unknown";
        fallbackModels = Array.isArray(agentDefaults.fallbacks) ? agentDefaults.fallbacks : [];
      }

      // Surface available models from models.providers section
      const providers = config?.models?.providers || config?.providers || {};
      for (const [provName, provCfg] of Object.entries<any>(providers)) {
        const models = (provCfg as any)?.models;
        if (Array.isArray(models)) {
          for (const m of models) {
            if (m?.id) availableModels.push(`${provName}/${m.id}`);
          }
        }
      }
    }
  } catch { /* config not readable */ }

  return {
    status: container.status === "running" && openclawRunning ? "online" : "degraded",
    container,
    openclaw: {
      running: openclawRunning,
      processInfo: openclawProc.status === "fulfilled" ? openclawProc.value.stdout : "",
    },
    system: {
      memoryUsagePct: memoryInfo.totalKb > 0
        ? Math.round(((memoryInfo.totalKb - memoryInfo.availableKb) / memoryInfo.totalKb) * 100)
        : 0,
      memoryTotalMb: Math.round(memoryInfo.totalKb / 1024),
      uptime: systemInfo.status === "fulfilled"
        ? systemInfo.value.stdout.split("---")[1]?.trim() || ""
        : "",
    },
    agent: {
      currentModel,
      fallbackModels,
      availableModels,
      heartbeat: heartbeat.status === "fulfilled" ? heartbeat.value.stdout : null,
      soul: soulMd.status === "fulfilled" ? soulMd.value.stdout : null,
    },
  };
}

/**
 * Read the OpenClaw config from the host.
 * Config lives at /root/.openclaw/openclaw.json on the host,
 * gets mounted into the sandbox at /sandbox/.openclaw/openclaw.json
 */
export async function getConfig(): Promise<Record<string, any>> {
  const raw = await readFile(OPENCLAW_CONFIG_HOST, "utf-8");
  return JSON.parse(raw);
}

/**
 * Update OpenClaw config AND regenerate the config hash.
 * This is critical — the gateway refuses to start if the hash mismatches.
 * Previously this was a manual step that caused repeated failures.
 */
export async function updateConfig(patch: Record<string, any>): Promise<void> {
  // 1. Read current config from the Docker volume (the real runtime config)
  const current = await getConfig();

  // 2. Deep-merge the patch
  const merged = deepMerge(current, patch);
  const configStr = JSON.stringify(merged, null, 2);

  // 3. Backup before writing (in the volume directory)
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = OPENCLAW_CONFIG_HOST.replace("openclaw.json", `openclaw-${timestamp}.bak.json`);
  await execOnHost(`cp ${OPENCLAW_CONFIG_HOST} ${backupPath} 2>/dev/null || true`);

  // 4. Write back to the volume file — no hash regeneration needed in OpenClaw v2026
  await writeFile(OPENCLAW_CONFIG_HOST, configStr, "utf-8");
}


/**
 * Read the available models list from the agent models registry.
 * Returns an array of { id, name, provider, reasoning, contextWindow } objects.
 */
export async function readModels(): Promise<{
  id: string; name: string; provider: string;
  reasoning: boolean; contextWindow: number; cost?: { input: number; output: number }
}[]> {
  try {
    const raw = await readFile(OPENCLAW_MODELS_HOST, "utf-8");
    const data = JSON.parse(raw);
    const results: any[] = [];
    const providers: Record<string, any> = data?.providers ?? {};
    for (const [provName, provCfg] of Object.entries<any>(providers)) {
      for (const model of (provCfg.models ?? [])) {
        const rawId = model.id as string;
        // Normalise to "provider/id" form
        const id = rawId.includes("/") ? rawId : `${provName}/${rawId}`;
        results.push({
          id,
          name: model.name ?? rawId,
          provider: provName,
          reasoning: model.reasoning ?? false,
          contextWindow: model.contextWindow ?? 0,
          cost: model.cost,
        });
      }
    }
    return results;
  } catch {
    return [];
  }
}

/** Deep merge helper — second object wins on conflicts */
function deepMerge(target: any, source: any): any {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === "object" && !Array.isArray(source[key])) {
      result[key] = deepMerge(result[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

/**
 * List files in the Tiger workspace.
 * Uses the symlink at /root/tiger-workspace that points into the live pod.
 */
export async function listWorkspaceFiles(
  subpath = ""
): Promise<{ name: string; type: "file" | "dir"; size: number; modified: string }[]> {
  const targetDir = subpath
    ? `${WORKSPACE_SYMLINK}/${subpath}`
    : WORKSPACE_SYMLINK;

  const { stdout } = await execOnHost(
    `find ${targetDir} -maxdepth 1 -printf '%y|%s|%T@|%f\n' 2>/dev/null | sort`
  );

  return stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [type, size, mtime, name] = line.split("|");
      return {
        name,
        type: type === "d" ? "dir" as const : "file" as const,
        size: parseInt(size) || 0,
        modified: new Date(parseFloat(mtime) * 1000).toISOString(),
      };
    })
    .filter((f) => f.name !== "." && f.name !== "..");
}

/**
 * Read a file from the Tiger workspace.
 */
export async function readWorkspaceFile(filepath: string): Promise<string> {
  // Security: resolve the path and ensure it stays within the workspace.
  // Blocks path traversal attempts (e.g. ../../etc/passwd).
  const safeName = filepath.replace(/\.\./g, "");
  const fullPath = path.resolve(WORKSPACE_SYMLINK, safeName);
  if (!fullPath.startsWith(WORKSPACE_SYMLINK)) {
    throw new Error("Access denied: path outside workspace");
  }
  const { stdout, exitCode } = await execFileOnHost("cat", [fullPath], 10_000);
  if (exitCode !== 0) throw new Error(`File not found: ${safeName}`);
  return stdout;
}

/**
 * Restart Tiger — triggers the gateway watchdog script.
 * The watchdog at /root/gateway-watchdog.sh handles the full restart cycle
 * including the --allow-unconfigured flag.
 */
export async function restartTiger(): Promise<{ success: boolean; message: string }> {
  try {
    // First try the watchdog script
    const { stdout, stderr, exitCode } = await execOnHost(
      `bash ${GATEWAY_WATCHDOG} 2>&1`,
      60_000 // 60s timeout for restart
    );
    return {
      success: exitCode === 0,
      message: stdout || stderr || "Restart triggered",
    };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
}

/**
 * Stream container logs via a child process.
 * Returns a readable stream that the route handler can pipe to SSE.
 */
export function streamLogs(lines = 100) {
  // docker logs --follow gives us real-time output
  return spawn("docker", [
    "logs", "--follow", "--tail", String(lines), DOCKER_CONTAINER
  ]);
}
