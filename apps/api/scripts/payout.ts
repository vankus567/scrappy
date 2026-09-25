// Settlement worker: sends real USDC from the platform wallet.
//  1. Workers: what they are owed (skips accounts in the 48 h payout hold).
//  2. Agents that paid with x402: refunds for seats no human filled before the deadline.
// Every transfer's signature is recorded. Run on a timer (e.g. every 10 min).
//   bun scripts/payout.ts            (devnet by default)
import { readFileSync } from "node:fs";
import {
  address, appendTransactionMessageInstructions, createKeyPairSignerFromBytes, createSolanaRpc, createSolanaRpcSubscriptions,
  createTransactionMessage, getSignatureFromTransaction, pipe, sendAndConfirmTransactionFactory,
  setTransactionMessageFeePayerSigner, setTransactionMessageLifetimeUsingBlockhash, signTransactionMessageWithSigners,
} from "@solana/kit";
import {
  findAssociatedTokenPda, getCreateAssociatedTokenIdempotentInstructionAsync, getTransferCheckedInstruction, TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import { base58 } from "@scure/base";
import { openDb, toUsdc, uid } from "../src/db";
import { USDC_MINT } from "../src/payments";

const RPC = process.env.SOLANA_RPC ?? "https://api.devnet.solana.com";
const WS = process.env.SOLANA_WS ?? RPC.replace("https", "wss");
const MIN_PAYOUT_MICRO = Math.round(Number(process.env.MIN_PAYOUT_USDC ?? 0.1) * 1e6);
const HOLD_MS = 48 * 3_600_000;

const keyFile = process.env.PLATFORM_KEY_FILE ?? new URL("../.keys/platform.json", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const platform = await createKeyPairSignerFromBytes(base58.decode(JSON.parse(readFileSync(keyFile, "utf8")).secret));
const rpc = createSolanaRpc(RPC);
const sendAndConfirm = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions: createSolanaRpcSubscriptions(WS) });
const mint = address(USDC_MINT);
const db = openDb();
const [fromAta] = await findAssociatedTokenPda({ owner: platform.address, mint, tokenProgram: TOKEN_PROGRAM_ADDRESS });

async function send(to: string, micro: number) {
  const owner = address(to);
  const [toAta] = await findAssociatedTokenPda({ owner, mint, tokenProgram: TOKEN_PROGRAM_ADDRESS });
  const { value: blockhash } = await rpc.getLatestBlockhash().send();
  const createAta = await getCreateAssociatedTokenIdempotentInstructionAsync({ payer: platform, owner, mint });
  const transfer = getTransferCheckedInstruction({ source: fromAta, mint, destination: toAta, authority: platform, amount: BigInt(micro), decimals: 6 });
  const msg = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(platform, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
    (m) => appendTransactionMessageInstructions([createAta, transfer], m),
  );
  const signed = await signTransactionMessageWithSigners(msg);
  await sendAndConfirm(signed as Parameters<typeof sendAndConfirm>[0], { commitment: "confirmed" });
  return getSignatureFromTransaction(signed);
}

const workers = db.query("SELECT id, wallet, owed_micro FROM workers WHERE owed_micro >= ? AND created_at <= ?").all(MIN_PAYOUT_MICRO, Date.now() - HOLD_MS) as any[];
console.log(`${workers.length} worker payout(s) from ${platform.address}`);
for (const w of workers) {
  try {
    const sig = await send(w.wallet, w.owed_micro);
    db.transaction(() => {
      db.query("INSERT INTO payments (id, kind, worker_id, wallet, amount_micro, tx_sig, created_at) VALUES (?, 'payout', ?, ?, ?, ?, ?)").run(uid(), w.id, w.wallet, w.owed_micro, sig, Date.now());
      db.query("UPDATE workers SET owed_micro = owed_micro - ? WHERE id = ?").run(w.owed_micro, w.id);
    })();
    console.log(`paid ${w.wallet} $${toUsdc(w.owed_micro).toFixed(2)}  tx ${sig}`);
  } catch (err) {
    console.error(`payout to ${w.wallet} failed:`, err instanceof Error ? err.message : err);
  }
}

const refunds = db.query("SELECT id, payer, refund_micro FROM tasks WHERE billing = 'x402' AND refund_micro > 0 AND refund_tx IS NULL AND payer IS NOT NULL").all() as any[];
console.log(`${refunds.length} refund(s) for unfilled seats`);
for (const t of refunds) {
  try {
    const sig = await send(t.payer, t.refund_micro);
    db.transaction(() => {
      db.query("INSERT INTO payments (id, kind, task_id, wallet, amount_micro, tx_sig, created_at) VALUES (?, 'refund', ?, ?, ?, ?, ?)").run(uid(), t.id, t.payer, t.refund_micro, sig, Date.now());
      db.query("UPDATE tasks SET refund_tx = ? WHERE id = ?").run(sig, t.id);
    })();
    console.log(`refunded ${t.payer} $${toUsdc(t.refund_micro).toFixed(2)}  tx ${sig}`);
  } catch (err) {
    console.error(`refund for task ${t.id} failed:`, err instanceof Error ? err.message : err);
  }
}
