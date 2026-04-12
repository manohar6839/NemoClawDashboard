/**
 * watcher.ts — File watcher for task status updates
 *
 * Watches the sandbox's task directories for file moves.
 * When a task file moves between inbox → active → completed → failed,
 * updates the corresponding task's status in SQLite.
 */

import chokidar from "chokidar";
import { tasks } from "./db.js";
import { execInSandbox } from "./tiger.js";

// Watch through the workspace symlink that maps to container's /sandbox/
const TASK_BASE_PATH = "/root/tiger-workspace/tasks";
const DIRECTORIES = ["inbox", "active", "completed", "failed"];

// Map directory to task status
const STATUS_MAP: Record<string, string> = {
  inbox: "backlog",
  active: "in-progress",
  completed: "done",
  failed: "failed",
};

// Extract task ID from filename (e.g., "task_task_123_abc.json" -> "task_123_abc")
function extractTaskId(filename: string): string | null {
  const match = filename.match(/^task_(task_.*)\.json$/);
  return match ? match[1] : null;
}

// Update task status in SQLite based on file location
async function updateTaskStatus(filePath: string, newDirectory: string) {
  const filename = filePath.split("/").pop() || "";
  const taskId = extractTaskId(filename);

  if (!taskId) {
    console.log(`[watcher] Could not extract task ID from ${filename}`);
    return;
  }

  const newStatus = STATUS_MAP[newDirectory];
  if (!newStatus) {
    console.log(`[watcher] Unknown directory: ${newDirectory}`);
    return;
  }

  console.log(`[watcher] Task ${taskId} moved to ${newDirectory}, updating status to ${newStatus}`);

  try {
    tasks.update(taskId, { status: newStatus });
  } catch (err) {
    console.error(`[watcher] Failed to update task ${taskId}:`, err);
  }
}

// Initialize watcher
export function initWatcher() {
  console.log("[watcher] Initializing task directory watcher...");

  // Create task directories inside the container
  // The symlink at /root/tiger-workspace will expose them to the host watcher
  execInSandbox(`mkdir -p /sandbox/.openclaw-data/workspace/tasks/{inbox,active,completed,failed}`).catch(err => {
    console.error("[watcher] Failed to create task directories:", err);
  });

  // Watch each directory for changes
  const watchers: chokidar.FSWatcher[] = [];

  for (const dir of DIRECTORIES) {
    const watchPath = `${TASK_BASE_PATH}/${dir}`;

    const watcher = chokidar.watch(watchPath, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 1000,
        pollInterval: 100,
      },
    });

    // File added (moved into this directory)
    watcher.on("add", (filePath) => {
      console.log(`[watcher] File added: ${filePath}`);
      updateTaskStatus(filePath, dir);
    });

    // File changed
    watcher.on("change", (filePath) => {
      console.log(`[watcher] File changed: ${filePath}`);
    });

    // File removed (moved out of this directory)
    watcher.on("unlink", (filePath) => {
      console.log(`[watcher] File removed: ${filePath}`);
    });

    watcher.on("error", (err) => {
      console.error(`[watcher] Error watching ${dir}:`, err);
    });

    watchers.push(watcher);
    console.log(`[watcher] Watching ${watchPath}`);
  }

  console.log("[watcher] Task directory watcher initialized");

  return () => {
    console.log("[watcher] Closing watchers...");
    watchers.forEach(w => w.close());
  };
}

// Run as standalone process
// Uncomment below to run: npx tsx src/watcher.ts
// initWatcher();