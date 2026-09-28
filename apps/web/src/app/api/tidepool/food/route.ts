import { address, createKeyPairSignerFromBytes, createSolanaRpc, lamports } from "@solana/kit";
import {
  appendTransactionMessageInstructions,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
} from "@solana/kit";
import { getTransferSolInstruction } from "@solana-program/system";

/**
 * Starter food: sends a new player 0.3 devnet SOL from a devnet-only faucet key (TIDEPOOL_FAUCET_KEY),
 * because the public devnet faucet is rate-limited. Refuses anyone who already has food.
 * Devnet SOL has no value; this route never runs against mainnet.
 */

const RPC_URL = process.env.NEXT_PUBLIC_TIDEPOOL_RPC ?? "https://api.devnet.solana.com";
const GIFT = BigInt(300_000_000); // 0.3 SOL
const ALREADY_FED = BigInt(250_000_000);

export async function POST(req: Request) {
  const secret = process.env.TIDEPOOL_FAUCET_KEY;
  if (!secret) return Response.json({ error: "starter food is not set up on this server" }, { status: 503 });
  if (!RPC_URL.includes("devnet")) return Response.json({ error: "devnet only" }, { status: 400 });

  let to;
  try {
    const body = (await req.json()) as { to?: string };
    to = address(String(body.to ?? ""));
  } catch {
    return Response.json({ error: "bad save slot" }, { status: 400 });
  }

  const rpc = createSolanaRpc(RPC_URL);
  const { value: have } = await rpc.getBalance(to).send();
  if (have >= ALREADY_FED) return Response.json({ error: "this save already has food" }, { status: 409 });

  const faucet = await createKeyPairSignerFromBytes(new Uint8Array(JSON.parse(secret) as number[]));
  const { value: blockhash } = await rpc.getLatestBlockhash().send();
  const msg = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(faucet, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
    (m) => appendTransactionMessageInstructions([getTransferSolInstruction({ source: faucet, destination: to, amount: lamports(GIFT) })], m),
  );
  const tx = await signTransactionMessageWithSigners(msg);
  await rpc.sendTransaction(getBase64EncodedWireTransaction(tx), { encoding: "base64" }).send();
  return Response.json({ signature: getSignatureFromTransaction(tx) });
}
