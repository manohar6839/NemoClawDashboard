/**
 * lib/agents.ts — Sub-agent registry (single source of truth)
 *
 * Why this file exists:
 *   Agent identity was previously scattered across spawn.ts, agents-activity.ts,
 *   dispatch.ts and the dashboard, with TWO competing id schemes:
 *     - classifier ids: cody / ethan / cathy / elon   (lib/llm.ts AGENT_IDS)
 *     - legacy UI ids:  coder / researcher / writer / pm
 *   This registry canonicalizes on the classifier ids and maps legacy
 *   aliases onto them, so every layer can call normalizeAgentId() and agree.
 *
 * Personas:
 *   Sub-agents currently run as isolated *sessions* of the `main` OpenClaw
 *   agent (one shared workspace, separate conversation histories). The
 *   persona block below is prepended to the task message, acting as the
 *   specialist's system prompt for that session.
 *
 *   Upgrade path (documented, not yet taken): define real per-agent entries
 *   in openclaw.json `agents.list`, each with its own IDENTITY.md and
 *   workspace, then change ONE line in spawn.ts — the `--agent` flag.
 */

export type SpecialistId = "cody" | "ethan" | "cathy" | "elon";

export interface SpecialistAgent {
  id: SpecialistId;
  /** Display name used across the dashboard and Telegram reports. */
  name: string;
  /** Short role label for UI chips. */
  role: string;
  /** Legacy ids that must keep working (old UI, old API callers). */
  aliases: string[];
  /** Persona preamble injected at the top of every spawned session. */
  persona: string;
}

export const SPECIALISTS: Record<SpecialistId, SpecialistAgent> = {
  cody: {
    id: "cody",
    name: "Cody",
    role: "Code",
    aliases: ["coder"],
    persona: [
      "You are Cody, Tiger's software engineering specialist.",
      "Scope: code, debugging, devops, deployments, scripts, infra, build systems.",
      "Style: read existing code before changing it; smallest correct diff;",
      "state assumptions explicitly; never run destructive commands without flagging.",
    ].join(" "),
  },
  ethan: {
    id: "ethan",
    name: "Ethan",
    role: "Research",
    aliases: ["researcher"],
    persona: [
      "You are Ethan, Tiger's research specialist.",
      "Scope: market research, policy analysis, technical investigation, due diligence.",
      "Style: cite sources, separate facts from inference, quantify with units,",
      "end with a short actionable summary.",
    ].join(" "),
  },
  cathy: {
    id: "cathy",
    name: "Cathy",
    role: "Write",
    aliases: ["writer"],
    persona: [
      "You are Cathy, Tiger's writing specialist.",
      "Scope: documents, summaries, reports, communication drafts.",
      "Style: clear structure, no filler, match the register the task asks for.",
    ].join(" "),
  },
  elon: {
    id: "elon",
    name: "Elon",
    role: "PM",
    aliases: ["pm"],
    persona: [
      "You are Elon, Tiger's project management specialist.",
      "Scope: planning, prioritization, breaking work into tasks, status synthesis.",
      "Style: concrete next actions with owners and order; surface blockers first.",
    ].join(" "),
  },
};

/** All ids + aliases that POST /tiger/spawn accepts. */
export const ACCEPTED_AGENT_IDS: string[] = Object.values(SPECIALISTS).flatMap(
  (a) => [a.id, ...a.aliases],
);

/**
 * Map any accepted id/alias ("coder", "cody", "CODY") to its canonical
 * specialist, or null if unknown. "tiger"/"main" are deliberately NOT
 * spawnable — Tiger is the orchestrator, not a sub-agent.
 */
export function normalizeAgentId(raw: string): SpecialistAgent | null {
  const id = (raw || "").trim().toLowerCase();
  for (const agent of Object.values(SPECIALISTS)) {
    if (agent.id === id || agent.aliases.includes(id)) return agent;
  }
  return null;
}

/**
 * Build the message a spawned session receives: persona + task + optional
 * context + reporting contract. The reporting contract matters — the spawn
 * runner parses the final reply and relays it to Telegram, so we ask for a
 * result the human can read in one glance.
 */
export function buildSpawnPrompt(
  agent: SpecialistAgent,
  task: string,
  context?: string,
): string {
  const parts = [
    `[SUB-AGENT SESSION — ${agent.name} (${agent.role})]`,
    agent.persona,
    "",
    "TASK:",
    task.trim(),
  ];
  if (context && context.trim()) {
    parts.push("", "CONTEXT:", context.trim());
  }
  parts.push(
    "",
    "When finished, end your reply with a line starting with 'RESULT:' " +
      "summarizing the outcome in 1-3 sentences. If you could not complete " +
      "the task, start that line with 'BLOCKED:' and say what you need.",
  );
  return parts.join("\n");
}
