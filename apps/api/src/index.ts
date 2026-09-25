import { paymentMiddleware, x402ResourceServer } from "@x402/hono";
import { ExactSvmScheme } from "@x402/svm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { createApp } from "./app";
import { createAuth } from "./auth";
import { openDb, toUsdc } from "./db";
import { pushNotifier, solanaRpc, webhookSender } from "./payments";
import { createTaskService, taskInput } from "./tasks";

// Solana devnet by default; set SOLANA_NETWORK for mainnet when going live.
const NETWORK = (process.env.SOLANA_NETWORK ?? "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1") as `${string}:${string}`;
const PAY_TO = process.env.PAY_TO;
const FACILITATOR_URL = process.env.X402_FACILITATOR_URL ?? "https://x402.org/facilitator";

if (!PAY_TO) {
  console.error("PAY_TO is required: the Solana address that receives agent payments. There is no unpaid mode.");
  process.exit(1);
}

const db = openDb();
const push = pushNotifier(db);
const tasks = createTaskService(db, { onFinal: webhookSender(db), onNewTask: push });

/** x402 price = what the agent asked for: humans x per-human reward. Invalid bodies are rejected by the handler (no charge). */
const price = async (ctx: { adapter: { getBody?: () => unknown } }) => {
  const parsed = taskInput.safeParse(await ctx.adapter.getBody?.());
  return `$${parsed.success ? toUsdc(parsed.data.price_micro) : 0.05}`;
};
const route = (description: string) => ({
  accepts: [{ scheme: "exact", price, network: NETWORK, payTo: PAY_TO }],
  description,
  mimeType: "application/json",
});

const paywall = paymentMiddleware(
  {
    "POST /v1/tasks": route("Kage: ask real humans for a judgment"),
    "POST /v1/consensus": route("Kage: independent judgments from several humans, with consensus"),
  },
  new x402ResourceServer(new HTTPFacilitatorClient({ url: FACILITATOR_URL })).register(NETWORK, new ExactSvmScheme()),
);

const app = createApp({
  db, tasks, auth: createAuth(db), paywall, rpc: solanaRpc, platformWallet: PAY_TO, network: NETWORK,
  pushPublicKey: process.env.VAPID_PUBLIC_KEY,
});

// deadlines are enforced even when nobody is polling
setInterval(() => tasks.sweep(), 1_000);

const port = Number(process.env.PORT ?? 8787);
console.log(`Kage Human API on :${port} (${NETWORK}), payments to ${PAY_TO}`);

export default { port, fetch: app.fetch, idleTimeout: 60 };
