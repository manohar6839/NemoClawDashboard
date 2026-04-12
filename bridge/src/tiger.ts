/**
 * tiger.ts — Core executor for Tiger agent inside Docker→k3s→sandbox
 * 
 * The key insight: Tiger lives 3 layers deep. Every command must traverse:
 *   Host → Docker (openshell-cluster-nemoclaw) → k3s (kubectl exec) → sandbox pod (tiger)
 * 
 * This module wraps that complexity into clean async functions.
 */

import { exec, execFile, spawn } from "child_process";
import { promisify } from "util";
import { readFile, writeFile } from "fs/promises";
import { createHash } from "crypto";

const execAsync = promisify(exec);

// ─── Configuration ───────────────────────────────────────────────
// These match your known paths from the Tiger setup
const DOCKER_CONTAINER = "openshell-cluster-nemoclaw";
const K8S_NAMESPACE = "openshell";
const POD_NAME = "tiger";
const OPENCLAW_CONFIG_HOST = "/root/.nemoclaw/openclaw.json";
const CONFIG_HASH_PATH_SANDBOX = "/sandbox/.openclaw/.config-hash";
const WORKSPACE_SYMLINK = "/root/tiger-workspace";
const GATEWAY_WATCHDOG = "/root/gateway-watchdog.sh";

// Timeout for commands (30s default, some ops need longer)
const DEFAULT_TIMEOUT = 30_000;

/**
 * Execute a command inside the Tiger sandbox pod.
 * This is the fundamental operation — everything else builds on it.
 * 
 * The full command chain:
 *   docker exec <container> kubectl exec -n <ns> <pod> -- <cmd>
 */
export async function execInSandbox(
  command: string,
  timeoutMs = DEFAULT_TIMEOUT
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const fullCmd = `docker exec ${DOCKER_CONTAINER} kubectl exec -n ${K8S_NAMESPACE} ${POD_NAME} -- sh -c ${JSON.stringify(command)}`;

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
    const { stdout, stderr } = await execAsync(command, {
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
      execInSandbox("cat /sandbox/.openclaw-data/workspace/HEARTBEAT.md 2>/dev/null || echo 'NO_HEARTBEAT'"),

      // 5. Agent identity from SOUL.md
      execInSandbox("head -20 /sandbox/.openclaw-data/workspace/SOUL.md 2>/dev/null || echo 'NO_SOUL'"),
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

  // Read host config for model info
  let currentModel = "unknown";
  let fallbackModels: string[] = [];
  try {
    const configRaw = await readFile(OPENCLAW_CONFIG_HOST, "utf-8");
    const config = JSON.parse(configRaw);
    // Navigate the OpenClaw config structure for model info
    currentModel = config?.model?.primary || config?.model || "unknown";
    fallbackModels = config?.model?.fallbacks || [];
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
      heartbeat: heartbeat.status === "fulfilled" ? heartbeat.value.stdout : null,
      soul: soulMd.status === "fulfilled" ? soulMd.value.stdout : null,
    },
  };
}

/**
 * Read the OpenClaw config from the host.
 * Config lives at /root/.nemoclaw/openclaw.json on the host,
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
  // 1. Read current config
  const current = await getConfig();

  // 2. Deep merge the patch (shallow for now, can enhance later)
  const merged = deepMerge(current, patch);
  const configStr = JSON.stringify(merged, null, 2);

  // 3. Backup current config before writing
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  await execOnHost(`cp ${OPENCLAW_CONFIG_HOST} /root/.nemoclaw/backups/openclaw-${timestamp}.json`);

  // 4. Write updated config
  await writeFile(OPENCLAW_CONFIG_HOST, configStr, "utf-8");

  // 5. Regenerate config hash — the step that was always forgotten!
  const hash = createHash("sha256").update(configStr).digest("hex");
  await execInSandbox(`echo '${hash}' > ${CONFIG_HASH_PATH_SANDBOX}`);
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
  // Security: prevent path traversal
  const sanitized = filepath.replace(/\.\./g, "").replace(/^\//, "");
  const { stdout, exitCode } = await execOnHost(
    `cat "${WORKSPACE_SYMLINK}/${sanitized}" 2>/dev/null`
  );
  if (exitCode !== 0) throw new Error(`File not found: ${sanitized}`);
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
