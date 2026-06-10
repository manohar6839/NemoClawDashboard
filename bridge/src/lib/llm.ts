/**
 * lib/llm.ts — Lightweight LLM helpers for the Tiger Bridge
 *
 * Provides three small, opinionated helpers used by routing and project naming:
 *   classifyAgent(text)        → which sub-agent should own a task
 *   generateProjectTitle(text) → 3-7 word project title
 *   generateProjectGoal(text)  → one-line success criterion
 *
 * Configured via env vars (declared in bridge/.env):
 *   TIGER_ROUTER_MODEL    Model slug for ALL router calls.
 *                         Examples:
 *                           "anthropic/claude-haiku-4-5"   → Anthropic API direct
 *                           "minimax-3"                    → self-hosted LiteLLM gateway
 *                         Default if unset: "minimax-3" (gateway).
 *   ANTHROPIC_API_KEY     Required when ROUTER_MODEL has "anthropic/" prefix.
 *   LLM_GATEWAY_URL       Self-hosted gateway base URL.
 *                         Default: https://llm.manohargupta.com/v1
 *   LLM_GATEWAY_KEY       Bearer key for the gateway (LiteLLM master/virtual key).
 *
 * Routing rule (intentionally simple):
 *   slug startsWith "anthropic/"  → Anthropic API, model = slug minus "anthropic/"
 *   anything else                 → LiteLLM gateway, model = slug verbatim
 *
 *   OpenRouter was removed 2026-06-10: its credits ran dry and silently took
 *   classifyAgent down with it. The gateway runs on Manohar's own MiniMax /
 *   Anthropic keys, so there is no third-party balance to surprise us.
 *
 * Failure mode (the most important property):
 *   Every public helper catches errors internally. Callers never see exceptions
 *   from this module. The bridge MUST keep working when the router LLM is down,
 *   the API key is missing, or the upstream returns garbage.
 *
 *     classifyAgent → returns { agent: "tiger", reason: "router_unavailable: ..." }
 *     generateProjectTitle → returns null (caller falls back to raw text)
 *     generateProjectGoal  → returns null (caller leaves goal empty)
 */

// ─── Configuration ─────────────────────────────────────────────────────────
const ROUTER_MODEL = process.env.TIGER_ROUTER_MODEL || "minimax-3";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const LLM_GATEWAY_URL = (process.env.LLM_GATEWAY_URL || "https://llm.manohargupta.com/v1").replace(/\/$/, "");
const LLM_GATEWAY_KEY = process.env.LLM_GATEWAY_KEY || "";
const ANTHROPIC_VERSION = "2023-06-01";

// Curated list of valid agent IDs. Used to validate classifier output.
export const AGENT_IDS = ["tiger", "cody", "ethan", "cathy", "elon"] as const;
export type AgentId = (typeof AGENT_IDS)[number];

// ─── Internal: provider resolution ──────────────────────────────────────────
interface ResolvedModel {
  provider: "anthropic" | "gateway";
  model: string;
}

/**
 * Decide which provider handles a given slug, and return the model string
 * that should actually go on the wire.
 */
function resolveModel(slug: string): ResolvedModel {
  if (slug.startsWith("anthropic/")) {
    return { provider: "anthropic", model: slug.slice("anthropic/".length) };
  }
  return { provider: "gateway", model: slug };
}

// ─── Internal: low-level LLM call ───────────────────────────────────────────
/**
 * Send a single (system + user) message pair to the configured router model.
 * Returns the trimmed text reply. Throws on ANY failure — the public helpers
 * catch and convert these into safe fallbacks.
 *
 * Why throw here instead of returning null? Because the public helpers each
 * want to package the failure differently (sentinel agent for routing, null
 * for naming). Centralising the throw keeps this fn single-purpose.
 */
async function callLLM(
  systemPrompt: string,
  userMessage: string,
  maxTokens: number,
): Promise<string> {
  const { provider, model } = resolveModel(ROUTER_MODEL);

  if (provider === "anthropic") {
    if (!ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY not set");
    }
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      }),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => "<no body>");
      throw new Error(`Anthropic API ${res.status}: ${errBody.slice(0, 200)}`);
    }
    const data = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const text = data.content?.find((b) => b.type === "text")?.text;
    if (!text) throw new Error("Anthropic returned no text content");
    return text.trim();
  }

  // Self-hosted LiteLLM gateway (catch-all for everything except "anthropic/")
  if (!LLM_GATEWAY_KEY) {
    throw new Error("LLM_GATEWAY_KEY not set");
  }
  const res = await fetch(`${LLM_GATEWAY_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LLM_GATEWAY_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
    }),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => "<no body>");
    throw new Error(`LLM gateway ${res.status}: ${errBody.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("LLM gateway returned no message content");
  return text.trim();
}

// ─── Public: agent classifier ───────────────────────────────────────────────
/**
 * Decide which sub-agent should own a given task.
 *
 * Returns { agent, reason }. Always succeeds. On any failure (network error,
 * missing key, model returns garbage) it returns:
 *   { agent: "tiger", reason: "router_unavailable: <details>" }
 * so dispatch logic can surface routing failures via UI filter.
 */
export async function classifyAgent(
  taskText: string,
): Promise<{ agent: AgentId; reason: string }> {
  const systemPrompt = `You are the task router for Tiger, a personal AI orchestrator.

Assign each task to EXACTLY ONE of these 5 sub-agents:

- tiger : the orchestrator itself. Use ONLY for high-level coordination, daily summaries, deciding what to do next, or when no other agent fits.
- cody  : code, debugging, software engineering, devops, deployments, scripts, infra, build systems.
- ethan : web research, fact-finding, gathering external information, market data, news, papers, regulatory filings.
- cathy : writing, prose, emails, content, summaries written for human consumption, polishing language.
- elon  : analysis, financial modelling, energy/macro/markets reasoning, BESS/solar/policy work, structured quantitative thinking.

Reply with EXACTLY two lines, no preamble, no quotes, no markdown:
agent: <id>
reason: <one short sentence, max 15 words>`;

  try {
    const reply = await callLLM(systemPrompt, taskText.slice(0, 4000), 80);
    const agentMatch = reply.match(/agent\s*:\s*(\w+)/i);
    const reasonMatch = reply.match(/reason\s*:\s*(.+)/i);
    const rawAgent = (agentMatch?.[1] || "").toLowerCase();
    const reason = (reasonMatch?.[1] || "").trim() || "no reason returned";

    if ((AGENT_IDS as readonly string[]).includes(rawAgent)) {
      return { agent: rawAgent as AgentId, reason };
    }
    // Call succeeded but the model returned an agent we don't recognise.
    // Distinct from "router_unavailable" — the call worked, the answer was bad.
    return {
      agent: "tiger",
      reason: `router_unrecognized: model returned "${rawAgent}"`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      agent: "tiger",
      reason: `router_unavailable: ${msg.slice(0, 140)}`,
    };
  }
}

// ─── Public: project title generator ────────────────────────────────────────
/**
 * Turn a seed text (first user message, or explicit goal) into a 3-7 word title.
 * Returns null on failure so the caller can fall back to using the raw text.
 */
export async function generateProjectTitle(seedText: string): Promise<string | null> {
  const systemPrompt =
    `You generate concise project titles. Rules: 3-7 words. No quotes. ` +
    `No trailing period. Plain text only — no markdown, no labels.`;
  const user = `Title this in 3-7 words:\n\n${seedText.slice(0, 1000)}`;
  try {
    const reply = await callLLM(systemPrompt, user, 30);
    // Defensive cleanup — strip leading "Title:" labels, surrounding quotes,
    // trailing periods, trailing newlines. Cap length as a sanity guard.
    const cleaned = reply
      .replace(/^title\s*:\s*/i, "")
      .replace(/^["'`]+|["'`]+$/g, "")
      .replace(/\.+$/, "")
      .trim()
      .slice(0, 80);
    return cleaned || null;
  } catch (err) {
    console.warn("[llm] generateProjectTitle failed:", err);
    return null;
  }
}

// ─── Public: project goal generator ─────────────────────────────────────────
/**
 * Turn a seed text into a one-line second-person goal statement.
 * Examples of expected output:
 *   "Compare BESS economics across three scenarios"
 *   "Pull and rank latest CERC tariff orders"
 *   "Draft the Q4 investor letter"
 * Returns null on failure so the caller can leave the goal field empty.
 */
export async function generateProjectGoal(seedText: string): Promise<string | null> {
  const systemPrompt =
    `You write one-line project goal statements in imperative mood (second person). ` +
    `Examples: "Compare BESS economics across three scenarios", "Pull and rank ` +
    `latest CERC tariff orders", "Draft the Q4 investor letter". ` +
    `Rules: ONE sentence. Maximum 18 words. No preamble, no labels, no bullet points.`;
  const user = `Write the goal for this:\n\n${seedText.slice(0, 1000)}`;
  try {
    const reply = await callLLM(systemPrompt, user, 60);
    const cleaned = reply
      .replace(/^goal\s*:\s*/i, "")
      .replace(/^["'`]+|["'`]+$/g, "")
      .trim()
      .slice(0, 200);
    return cleaned || null;
  } catch (err) {
    console.warn("[llm] generateProjectGoal failed:", err);
    return null;
  }
}
