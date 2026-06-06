/**
 * Smoke test for the new openclaw-ws.ts library.
 * Tests:
 *   1. callGateway with sessions.list — verify non-streaming RPC works
 *   2. streamAgentRun on agent:main:main — verify chunks arrive in real time
 *   3. streamAgentRun on a NEW sessionKey — verify isolation
 */
import { callGateway, streamAgentRun, newSessionKey } from "./src/lib/openclaw-ws.js";

async function main() {
  process.env.OPENCLAW_GATEWAY_TOKEN = "c5996580041c8f117532462877c34996d5563ef7a571a2b42913ee53d8fdfa6d";

  console.log("=== TEST 1: sessions.list ===");
  const r = await callGateway("sessions.list", {});
  console.log("ok:", r.ok, "count:", (r.payload as any)?.sessions?.length);
  ((r.payload as any)?.sessions || []).forEach((s: any) => console.log("  -", s.key, "|", s.displayName));

  console.log("\n=== TEST 2: streamAgentRun on agent:main:main ===");
  const t0 = Date.now();
  let chunks = 0;
  for await (const ev of streamAgentRun({
    sessionKey: "agent:main:main",
    message: "Reply with exactly the word PONG. Nothing else.",
  })) {
    if (ev.kind === "chunk") chunks++;
    console.log(`  +${Date.now()-t0}ms ${ev.kind}: ${ev.content.slice(0,60)}`);
  }
  console.log(`  total chunks: ${chunks}`);

  console.log("\n=== TEST 3: streamAgentRun on NEW sessionKey ===");
  const newKey = newSessionKey();
  console.log("new sessionKey:", newKey);
  for await (const ev of streamAgentRun({
    sessionKey: newKey,
    message: "What is your name? Reply briefly.",
  })) {
    if (ev.kind !== "status") console.log(`  ${ev.kind}: ${ev.content.slice(0,80)}`);
  }
  console.log("DONE");
}

main().catch(e => { console.error("FAIL", e); process.exit(1); });
