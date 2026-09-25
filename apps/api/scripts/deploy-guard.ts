// The Scrappy demo: an AI coding agent changed an auth check and wants human security verification before it deploys.
// Its own model reviews first; before an irreversible deploy it asks 3 humans through Scrappy and obeys the consensus.
//   SCRAPPY_API_KEY=scrappy_sk_... ANTHROPIC_API_KEY=... bun scripts/deploy-guard.ts
import { Scrappy } from "../../../packages/sdk/src/index";

const DIFF = `--- a/src/auth/session.ts
+++ b/src/auth/session.ts
 export function verifySession(token: string, userId: string) {
   const session = sessions.get(token);
-  if (!session || session.userId !== userId || session.expiresAt < Date.now()) return false;
+  if (!session) return false;
+  if (session.expiresAt < Date.now()) return false;
   return true;
 }`;

const QUESTION = "Does this change let one user act as another user?";
const scrappy = new Scrappy({
  baseUrl: process.env.SCRAPPY_API ?? "https://kageai.me",
  apiKey: process.env.SCRAPPY_API_KEY,
  walletSecretKey: process.env.SCRAPPY_AGENT_SECRET,
});

async function ownReview(): Promise<{ answer: "yes" | "no"; confidence: number }> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is required for the agent's own review.");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.AGENT_MODEL ?? "claude-sonnet-5",
      max_tokens: 200,
      messages: [{ role: "user", content: `${QUESTION}\n\n${DIFF}\n\nReply ONLY as JSON: {"answer": "yes" | "no", "confidence": <0-1, calibrated>}` }],
    }),
  });
  const data: any = await res.json();
  const m = String(data.content?.[0]?.text ?? "").match(/\{[\s\S]*\}/);
  if (!m) throw new Error("model reply was not JSON");
  return JSON.parse(m[0]);
}

const log = (s: string) => console.log(`[agent] ${s}`);
log("Patched src/auth/session.ts. Tests pass. Preparing deploy...");
const own = await ownReview();
log(`My own review: "${own.answer}" at ${(own.confidence * 100).toFixed(0)}% confidence.`);
log("Auth changes are irreversible in production. Asking 3 humans through Scrappy before deploying.");

const cap = await scrappy.findCapacity({ skill: "security" });
log(`Scrappy: ${cap.available} qualified humans online.`);

const r = await scrappy.consensus({
  task: QUESTION,
  content: DIFF,
  skill: "security",
  humans: 3,
  budget: 0.3,
  deadline: 60,
  qualityThreshold: 0.67,
});

if (r.status === "insufficient_capacity") {
  log(`Not enough humans (${r.available ?? 0}/${r.required ?? 3}). Policy: no human sign-off, no deploy. Stopping.`);
  process.exit(2);
}
log(`Humans: ${r.votes.map((v) => `${v.answer} x${v.humans}`).join(", ")} -> "${r.answer}", agreement ${(r.agreement * 100).toFixed(0)}%, ${((r.latency_ms ?? 0) / 1000).toFixed(1)} s, $${r.spent_usdc.toFixed(2)} paid to humans.`);
if (r.answer === "yes") {
  log("Humans say this lets one user act as another. Deployment CANCELLED. Reverting the patch.");
  process.exit(1);
}
log(r.status === "completed" ? "Humans cleared it. Deploying." : "Humans are split. Holding the deploy for a maintainer.");
