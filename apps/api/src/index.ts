import { paymentMiddleware, x402ResourceServer } from "@x402/hono";
import { ExactSvmScheme } from "@x402/svm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { createApp, VERIFY_PRICE_USDC } from "./app";
import { openStore } from "./store";

// Solana devnet by default; set SOLANA_NETWORK for mainnet when going live.
const NETWORK = (process.env.SOLANA_NETWORK ?? "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1") as `${string}:${string}`;
const PAY_TO = process.env.PAY_TO;
const FACILITATOR_URL = process.env.X402_FACILITATOR_URL ?? "https://x402.org/facilitator";

if (!PAY_TO) {
  console.error("PAY_TO is required: the Solana address that receives agent payments. No unpaid mode in production.");
  process.exit(1);
}

const paywall = paymentMiddleware(
  {
    "POST /v1/human/verify": {
      accepts: [{ scheme: "exact", price: `$${VERIFY_PRICE_USDC}`, network: NETWORK, payTo: PAY_TO }],
      description: "Scrappy Human API: one human judgment with confidence",
      mimeType: "application/json",
    },
  },
  new x402ResourceServer(new HTTPFacilitatorClient({ url: FACILITATOR_URL })).register(NETWORK, new ExactSvmScheme()),
);

const app = createApp(openStore(), paywall);
const port = Number(process.env.PORT ?? 8787);
console.log(`Scrappy Human API on :${port} (${NETWORK}), payments to ${PAY_TO}`);

export default { port, fetch: app.fetch };
