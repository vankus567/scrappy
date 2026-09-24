// Pays workers what they are owed: USDC from the platform wallet to each worker's wallet on Solana.
// Skips accounts still in the 48 h payout hold. Records every tx signature.
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
import { openStore } from "../src/store";

const RPC = process.env.SOLANA_RPC ?? "https://api.devnet.solana.com";
const WS = process.env.SOLANA_WS ?? RPC.replace("https", "wss");
// Devnet USDC by default; set USDC_MINT=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v on mainnet.
const USDC_MINT = address(process.env.USDC_MINT ?? "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
const MIN_PAYOUT = Number(process.env.MIN_PAYOUT_USDC ?? 0.1);

const keyFile = new URL("../.keys/platform.json", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const platform = await createKeyPairSignerFromBytes(base58.decode(JSON.parse(readFileSync(keyFile, "utf8")).secret));
const rpc = createSolanaRpc(RPC);
const sendAndConfirm = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions: createSolanaRpcSubscriptions(WS) });
const store = openStore();

const [fromAta] = await findAssociatedTokenPda({ owner: platform.address, mint: USDC_MINT, tokenProgram: TOKEN_PROGRAM_ADDRESS });
const due = store.payable(MIN_PAYOUT);
console.log(`${due.length} worker(s) due a payout from ${platform.address}`);

for (const w of due) {
  const amount = Math.floor(w.owed_usdc * 1e6) / 1e6;
  const owner = address(w.wallet);
  const [toAta] = await findAssociatedTokenPda({ owner, mint: USDC_MINT, tokenProgram: TOKEN_PROGRAM_ADDRESS });
  const { value: blockhash } = await rpc.getLatestBlockhash().send();
  const tx = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(platform, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
    (m) => appendTransactionMessageInstructions([], m),
  );
  const createAta = await getCreateAssociatedTokenIdempotentInstructionAsync({ payer: platform, owner, mint: USDC_MINT });
  const transfer = getTransferCheckedInstruction({
    source: fromAta, mint: USDC_MINT, destination: toAta, authority: platform, amount: BigInt(Math.round(amount * 1e6)), decimals: 6,
  });
  const signed = await signTransactionMessageWithSigners(appendTransactionMessageInstructions([createAta, transfer], tx));
  try {
    await sendAndConfirm(signed as Parameters<typeof sendAndConfirm>[0], { commitment: "confirmed" });
    const sig = getSignatureFromTransaction(signed);
    store.recordPayout(w, amount, sig);
    console.log(`paid ${w.wallet} $${amount.toFixed(2)}  tx ${sig}`);
  } catch (err) {
    console.error(`payout to ${w.wallet} failed:`, err instanceof Error ? err.message : err);
  }
}
