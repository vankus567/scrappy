// Settlement worker: one pass over worker payouts + x402 refunds (real USDC from the platform wallet).
// The API runs this automatically on a timer when the platform keypair is present; run this manually
// to force a settlement pass now.
//   bun scripts/payout.ts            (devnet by default)
import { fileURLToPath } from "node:url";
import { openDb } from "../src/db";
import { createSettler, solanaSender } from "../src/settle";

const keyFile = process.env.PLATFORM_KEY_FILE ?? fileURLToPath(new URL("../.keys/platform.json", import.meta.url));
const { send, from } = await solanaSender({
  keyFile,
  rpcUrl: process.env.SOLANA_RPC ?? "https://api.devnet.solana.com",
  wsUrl: process.env.SOLANA_WS,
});
const db = openDb();
const settler = createSettler(db, { send, minPayoutMicro: Math.round(Number(process.env.MIN_PAYOUT_USDC ?? 0.1) * 1e6) });

console.log(`settling from ${from}`);
const r = await settler.runOnce();
console.log(`done: ${r.paid} payout(s), ${r.refunded} refund(s), ${r.errors} error(s)`);
