// Human Fallback demo: an AI agent answers on its own; when its confidence is low it pays a
// human through Scrappy and continues with the human-verified answer. Real model, real payment.
//   ANTHROPIC_API_KEY=... bun scripts/fallback-agent.ts "question" "option A" "option B"
import { readFileSync } from "node:fs";
import { createHuman } from "../../../packages/sdk/src/index";

const THRESHOLD = 0.9;
const [question = "Is this Hindi reply natural for a customer message: 'आपका ऑर्डर कल तक पहुँच जाएगा।'?", ...opts] = process.argv.slice(2);
const options = opts.length >= 2 ? opts : ["Natural", "Unnatural"];

async function aiAnswer(): Promise<{ answer: string; confidence: number }> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is required for the agent's own answer.");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.AGENT_MODEL ?? "claude-sonnet-5",
      max_tokens: 200,
      messages: [
        {
          role: "user",
          content: `${question}\nOptions: ${options.join(" | ")}\nReply ONLY as JSON: {"answer": "<one option>", "confidence": <0-1, your honest calibrated confidence>}`,
        },
      ],
    }),
  });
  const data: any = await res.json();
  const text: string = data.content?.[0]?.text ?? "";
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error(`Model reply was not JSON: ${text}`);
  return JSON.parse(m[0]);
}

const keyFile = new URL("../.keys/agent.json", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const { secret } = JSON.parse(readFileSync(keyFile, "utf8"));
const human = await createHuman({ apiUrl: process.env.SCRAPPY_API ?? "http://localhost:8787", secretKey: secret });

const ai = await aiAnswer();
console.log(`AI: "${ai.answer}" at ${(ai.confidence * 100).toFixed(0)}% confidence`);

if (ai.confidence >= THRESHOLD) {
  console.log("Confident enough. Continuing without a human.");
} else {
  console.log(`Below ${THRESHOLD * 100}%. Asking a human through Scrappy (paid in USDC)...`);
  const r = await human.askWithPolicy({ task: question, options, language: "hi", deadline: 60 });
  console.log(`Human: "${r.answer}" at ${(r.confidence * 100).toFixed(0)}% (${r.decision}, ${r.trail.length} human${r.trail.length > 1 ? "s" : ""})`);
  console.log(`Confidence ${(ai.confidence * 100).toFixed(0)}% -> ${(r.confidence * 100).toFixed(0)}%. Continuing with the human-verified answer.`);
}
