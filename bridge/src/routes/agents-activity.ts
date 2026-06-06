/**
 * routes/agents-activity.ts — Transform agents data into per-agent activity view
 *
 * GET /tiger/agents/activity
 * Uses execInSandbox to call /tiger/agents from inside OpenClaw container,
 * then transforms to per-agent activity cards.
 */

import { Router, Request, Response } from "express";
import { execInSandbox } from "../tiger.js";

const router = Router();

function agentName(subAgentId: string | null | undefined): string {
  if (!subAgentId) return "Tiger";
  const map: Record<string, string> = {
    "main": "Tiger",
    "coder": "Cody",
    "researcher": "Ethan",
    "writer": "Cathy",
    "pm": "Elon",
  };
  return map[subAgentId] || subAgentId;
}

function timeAgo(timestamp: number | null): string {
  if (!timestamp) return "never";
  const seconds = Math.floor((Date.now() / 1000) - timestamp);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

router.get("/", async (_req: Request, res: Response) => {
  try {
    // Use execInSandbox to call /tiger/agents from inside OpenClaw container
    const { stdout } = await execInSandbox(
      `curl -s "http://172.17.0.1:3456/tiger/agents" -H "Authorization: Bearer 14fb879429386b69beac339bbd98e43011ec29485da17592410da34ed97e0236"`
    );

    let rawData: any;
    try {
      rawData = JSON.parse(stdout);
    } catch {
      return res.status(500).json({ ok: false, error: "Could not parse agents response" });
    }

    const rawSessions: any[] = rawData.sessions || [];

    // Build per-agent status
    const agentMap: Record<string, any> = {
      "Tiger":  { id: "main",       name: "Tiger",  subAgentId: "main",       sessions: [], lastActive: null, isRunning: false, currentTask: "" },
      "Cody":   { id: "coder",      name: "Cody",   subAgentId: "coder",      sessions: [], lastActive: null, isRunning: false, currentTask: "" },
      "Ethan":  { id: "researcher", name: "Ethan",  subAgentId: "researcher", sessions: [], lastActive: null, isRunning: false, currentTask: "" },
      "Cathy":  { id: "writer",     name: "Cathy",  subAgentId: "writer",    sessions: [], lastActive: null, isRunning: false, currentTask: "" },
      "Elon":   { id: "pm",         name: "Elon",   subAgentId: "pm",        sessions: [], lastActive: null, isRunning: false, currentTask: "" },
    };

    for (const session of rawSessions) {
      const name = agentName(session.subAgentId);
      if (!agentMap[name]) continue;

      agentMap[name].sessions.push({
        sessionKey: session.sessionKey,
        label: session.label,
        lastMessage: session.lastMessage || "",
        model: session.model,
        running: session.running || false,
      });

      if (session.running) {
        agentMap[name].isRunning = true;
        agentMap[name].currentTask = session.label || "Running";
        agentMap[name].lastActive = timeAgo(session.lastMessageTime);
      }
    }

    // Set lastActive for non-running agents based on most recent message
    for (const name of Object.keys(agentMap)) {
      const a = agentMap[name];
      if (!a.isRunning && a.sessions.length > 0) {
        a.sessions.sort((x: any, y: any) => (y.lastMessageTime || 0) - (x.lastMessageTime || 0));
        a.lastActive = timeAgo(a.sessions[0].lastMessageTime);
      }
    }

    const agents = Object.values(agentMap).map((a: any) => ({
      id: a.id,
      name: a.name,
      subAgentId: a.subAgentId,
      status: a.isRunning ? "active" : (a.sessions.length > 0 ? "idle" : "offline"),
      currentTask: a.currentTask,
      lastActive: a.lastActive,
      sessionCount: a.sessions.length,
      isRunning: a.isRunning,
    }));

    res.json({ ok: true, count: agents.length, agents, updated: new Date().toISOString() });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
