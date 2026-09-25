// A real agent paying Kage per task over x402 (devnet USDC from .keys/agent.json).
//   bun scripts/agent-pay.ts "Which answer is factually correct?"
import { readFileSync } from "node:fs";
import { Kage } from "../../../packages/sdk/src/index";

const keyFile = new URL("../.keys/agent.json", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const { secret, address } = JSON.parse(readFileSync(keyFile, "utf8"));
const kage = new Kage({ baseUrl: process.env.KAGE_API ?? "http://localhost:8787", walletSecretKey: secret });

console.log(`agent ${address} asking 3 humans...`);
const r = await kage.consensus({
  task: process.argv[2] ?? "Which answer is factually correct?",
  options: ["The Pacific is the largest ocean", "The Atlantic is the largest ocean"],
  humans: Number(process.env.HUMANS ?? 3),
  budget: 0.15,
  deadline: 60,
});
console.log(JSON.stringify(r, null, 2));
