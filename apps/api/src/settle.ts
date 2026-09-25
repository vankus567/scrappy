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
import { type Db, toUsdc, uid } from "./db";
import { USDC_MINT } from "./payments";

/** Sends `micro` USDC to a wallet (creating its ATA if needed); resolves to the tx signature. */
export type Sender = (to: string, micro: number) => Promise<string>;
export type SettleLog = (msg: string) => void;

const MIN_PAYOUT_USDC = 0.1;
const HOLD_MS = 48 * 3_600_000; // new accounts settle after 48 h

/**
 * Settlement worker: sends real USDC from the platform wallet.
 *  1. Workers: what they are owed (skips accounts in the payout hold and dust below the minimum).
 *  2. Agents that paid with x402: refunds for seats no human filled before the deadline.
 * Every transfer's signature is recorded, so a crashed run never double-pays.
 */
export function createSettler(
  db: Db,
  opts: { send: Sender; minPayoutMicro?: number; holdMs?: number; log?: SettleLog },
) {
  const min = opts.minPayoutMicro ?? Math.round(MIN_PAYOUT_USDC * 1e6);
  const hold = opts.holdMs ?? HOLD_MS;
  const log = opts.log ?? ((m: string) => console.log(`[settle] ${m}`));
  let running = false;

  /** One settlement pass. Single-flight: overlapping calls return immediately. */
  const runOnce = async (now = Date.now()) => {
    if (running) return { paid: 0, refunded: 0, errors: 0, skipped: true };
    running = true;
    let paid = 0, refunded = 0, errors = 0;
    try {
      const workers = db
        .query("SELECT id, wallet, owed_micro FROM workers WHERE owed_micro >= ? AND created_at <= ?")
        .all(min, now - hold) as { id: string; wallet: string; owed_micro: number }[];
      for (const w of workers) {
        // claim first: owed -> pending inside one transaction, so a second settler can never pick the same money
        const claimed = db.transaction(() => {
          const r = db.query("UPDATE workers SET owed_micro = owed_micro - ?, pending_micro = pending_micro + ? WHERE id = ? AND owed_micro >= ?").run(
            w.owed_micro, w.owed_micro, w.id, w.owed_micro,
          );
          return r.changes === 1;
        })();
        if (!claimed) continue;
        try {
          const sig = await opts.send(w.wallet, w.owed_micro);
          db.transaction(() => {
            db.query("INSERT INTO payments (id, kind, worker_id, wallet, amount_micro, tx_sig, created_at) VALUES (?, 'payout', ?, ?, ?, ?, ?)").run(
              uid(), w.id, w.wallet, w.owed_micro, sig, now,
            );
            db.query("UPDATE workers SET pending_micro = pending_micro - ? WHERE id = ?").run(w.owed_micro, w.id);
          })();
          paid++;
          log(`paid ${w.wallet} $${toUsdc(w.owed_micro).toFixed(2)}  tx ${sig}`);
        } catch (err) {
          db.query("UPDATE workers SET owed_micro = owed_micro + ?, pending_micro = pending_micro - ? WHERE id = ?").run(w.owed_micro, w.owed_micro, w.id);
          errors++;
          log(`payout to ${w.wallet} failed: ${err instanceof Error ? err.message : err}`);
        }
      }

      const refunds = db
        .query("SELECT id, payer, refund_micro FROM tasks WHERE billing = 'x402' AND refund_micro > 0 AND refund_tx IS NULL AND payer IS NOT NULL")
        .all() as { id: string; payer: string; refund_micro: number }[];
      for (const t of refunds) {
        // claim with a placeholder signature; tx_sig is UNIQUE so a second settler's claim fails
        const claimId = uid();
        const claimed = db.transaction(() => {
          try {
            db.query("INSERT INTO payments (id, kind, task_id, wallet, amount_micro, tx_sig, created_at) VALUES (?, 'refund', ?, ?, ?, ?, ?)").run(
              claimId, t.id, t.payer, t.refund_micro, `pending:${t.id}`, now,
            );
            return true;
          } catch {
            return false;
          }
        })();
        if (!claimed) continue;
        try {
          const sig = await opts.send(t.payer, t.refund_micro);
          db.transaction(() => {
            db.query("UPDATE payments SET tx_sig = ? WHERE id = ?").run(sig, claimId);
            db.query("UPDATE tasks SET refund_tx = ? WHERE id = ?").run(sig, t.id);
          })();
          refunded++;
          log(`refunded ${t.payer} $${toUsdc(t.refund_micro).toFixed(2)}  tx ${sig}`);
        } catch (err) {
          db.query("DELETE FROM payments WHERE id = ?").run(claimId);
          errors++;
          log(`refund for task ${t.id} failed: ${err instanceof Error ? err.message : err}`);
        }
      }
      return { paid, refunded, errors, skipped: false };
    } finally {
      running = false;
    }
  };

  return { runOnce };
}

export type Settler = ReturnType<typeof createSettler>;

/** Real USDC sender from a keypair file (`{ "secret": "<base58 64-byte>" }`, see scripts/keys.ts). */
export async function solanaSender(deps: { keyFile: string; rpcUrl: string; wsUrl?: string; mint?: string }) {
  const platform = await createKeyPairSignerFromBytes(base58.decode(JSON.parse(readFileSync(deps.keyFile, "utf8")).secret));
  const rpc = createSolanaRpc(deps.rpcUrl);
  const sendAndConfirm = sendAndConfirmTransactionFactory({
    rpc,
    rpcSubscriptions: createSolanaRpcSubscriptions(deps.wsUrl ?? deps.rpcUrl.replace("https", "wss")),
  });
  const mint = address(deps.mint ?? USDC_MINT);
  const [fromAta] = await findAssociatedTokenPda({ owner: platform.address, mint, tokenProgram: TOKEN_PROGRAM_ADDRESS });

  const send: Sender = async (to, micro) => {
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
  };

  return { send, from: platform.address };
}
