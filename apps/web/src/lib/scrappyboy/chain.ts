import {
  type Address,
  address,
  appendTransactionMessageInstructions,
  createSolanaRpc,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  type Instruction,
  lamports,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type TransactionSigner,
} from "@solana/kit";
import {
  closePositionInstructions,
  fetchPositionsForOwner,
  fetchWhirlpoolsByTokenPair,
  harvestPositionInstructions,
  increaseLiquidityInstructions,
  openPositionInstructions,
  swapInstructions,
  WhirlpoolDeployment,
} from "@orca-so/whirlpools";
import { fetchWhirlpool } from "@orca-so/whirlpools-client";

/**
 * Everything SCRAPPY BOY knows about the chain. Game code never imports Orca or kit directly,
 * so every number on screen traces back to one function here.
 */

export const NETWORK = "devnet" as const;
const RPC_URL = process.env.NEXT_PUBLIC_SCRAPPY_RPC ?? "https://api.devnet.solana.com";
const deployment = WhirlpoolDeployment.devnet;

export const SOL_MINT = address("So11111111111111111111111111111111111111112");
/** Orca's devnet USDC stand-in. Checked at runtime: pickPool() fails loudly if no pool exists. */
export const DEV_USDC_MINT = address("BRjpCHtyQLNCo8gqRUr8jtdAj5AjPYQaoqbvcZiHok1k");
const USDC_DECIMALS = 6;
const SOL_DECIMALS = 9;

export const rpc = createSolanaRpc(RPC_URL);

export interface Pool {
  address: Address;
  /** USDC per SOL, already adjusted for decimals. */
  price: number;
  tickSpacing: number;
  feeRate: number;
  liquidity: bigint;
  /** True when token A is SOL (Orca orders mints by address). */
  solIsA: boolean;
}

export interface Creature {
  mint: Address;
  pool: Address;
  lowerPrice: number;
  upperPrice: number;
  liquidity: bigint;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Retry public-RPC rate limits (HTTP 429) with backoff; anything else is a real error. */
export async function withRetry<T>(fn: () => Promise<T>, tries = 5): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      const is429 = String((e as Error)?.message ?? e).includes("429");
      if (!is429 || i >= tries - 1) throw e;
      await sleep(800 * 2 ** i);
    }
  }
}

/**
 * Sign, send, and confirm by polling over HTTP. Websocket confirmation hangs on the public
 * devnet endpoint and on some mobile networks, so we never depend on it.
 */
async function send(signer: TransactionSigner, instructions: Instruction[]): Promise<string> {
  const { value: blockhash } = await withRetry(() => rpc.getLatestBlockhash().send());
  const msg = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(signer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
    (m) => appendTransactionMessageInstructions(instructions, m),
  );
  const tx = await signTransactionMessageWithSigners(msg);
  const sig = getSignatureFromTransaction(tx);
  const wire = getBase64EncodedWireTransaction(tx);
  await withRetry(() => rpc.sendTransaction(wire, { encoding: "base64", preflightCommitment: "confirmed" }).send());
  for (let i = 0; i < 60; i++) {
    await sleep(1000);
    const { value } = await withRetry(() => rpc.getSignatureStatuses([sig]).send());
    const s = value[0];
    if (s?.err) throw new Error(`transaction failed: ${JSON.stringify(s.err, (_, v) => (typeof v === "bigint" ? v.toString() : v))}`);
    if (s?.confirmationStatus === "confirmed" || s?.confirmationStatus === "finalized") return sig;
    if (i % 10 === 9) {
      const height = await withRetry(() => rpc.getBlockHeight().send());
      if (height > blockhash.lastValidBlockHeight) throw new Error("transaction expired, try again");
    }
  }
  throw new Error("transaction not confirmed in 60 s");
}

/** Orca tick index -> USDC per SOL. */
function tickToPrice(tick: number, solIsA: boolean): number {
  const raw = Math.pow(1.0001, tick); // token B per token A, raw units
  const perA = raw * Math.pow(10, (solIsA ? SOL_DECIMALS : USDC_DECIMALS) - (solIsA ? USDC_DECIMALS : SOL_DECIMALS));
  return solIsA ? perA : 1 / perA;
}

/** The deepest initialized SOL/devUSDC pool. */
/** Orca's devnet stand-in stablecoins. Only pools that exist and hold liquidity are ever shown. */
const QUOTES: { label: string; mint: Address }[] = [
  { label: "SOL / USDC", mint: DEV_USDC_MINT },
  { label: "SOL / USDT", mint: address("H8UekPGwePSmQ3ttuYGPU1szyFfjZR4N53rymSFwmPaw") },
];

export interface ListedPool extends Pool {
  label: string;
}

/** Every live SOL/stable pool on devnet, deepest first, at most one per fee tier per pair. */
export async function listPools(): Promise<ListedPool[]> {
  const out: ListedPool[] = [];
  for (const q of QUOTES) {
    let pools;
    try {
      pools = await withRetry(() => fetchWhirlpoolsByTokenPair(rpc, SOL_MINT, q.mint, deployment));
    } catch {
      continue;
    }
    for (const p of pools) {
      if (!p.initialized || p.liquidity === BigInt(0)) continue;
      try {
        out.push({ ...(await readPool(p.address)), label: q.label });
      } catch {
        // skip pools we cannot price
      }
    }
  }
  out.sort((a, b) => (b.liquidity > a.liquidity ? 1 : -1));
  if (out.length === 0) throw new Error("no live pools on devnet right now");
  return out.slice(0, 6);
}

export async function pickPool(): Promise<Pool> {
  const pools = await fetchWhirlpoolsByTokenPair(rpc, SOL_MINT, DEV_USDC_MINT, deployment);
  const live = pools.flatMap((p) => (p.initialized && p.liquidity > 0n ? [p] : []));
  if (live.length === 0) throw new Error("No live SOL/devUSDC pool on devnet");
  live.sort((a, b) => (b.liquidity > a.liquidity ? 1 : -1));
  return readPool(live[0]!.address);
}

/** One account read (cheap), unlike fetchWhirlpoolsByTokenPair which scans the program. */
export async function readPool(poolAddress: Address): Promise<Pool> {
  const { data: p } = await withRetry(() => fetchWhirlpool(rpc, poolAddress));
  const solIsA = p.tokenMintA === SOL_MINT;
  if (!solIsA && p.tokenMintB !== SOL_MINT) throw new Error(`pool ${poolAddress} is not a SOL pool`);
  const sqrt = Number(p.sqrtPrice) / 2 ** 64;
  const rawBperA = sqrt * sqrt;
  const decA = solIsA ? SOL_DECIMALS : USDC_DECIMALS;
  const decB = solIsA ? USDC_DECIMALS : SOL_DECIMALS;
  const bPerA = rawBperA * Math.pow(10, decA - decB);
  return {
    address: poolAddress,
    price: solIsA ? bPerA : 1 / bPerA,
    tickSpacing: p.tickSpacing,
    feeRate: p.feeRate,
    liquidity: p.liquidity,
    solIsA,
  };
}

export async function solBalance(owner: Address): Promise<bigint> {
  const { value } = await rpc.getBalance(owner).send();
  return value;
}

/** Devnet faucet. Rate-limited by Solana; callers show the error as-is. */
export async function starterFood(owner: Address, sol = 1): Promise<string> {
  const sig = await rpc.requestAirdrop(owner, lamports(BigInt(Math.round(sol * 1e9)))).send();
  for (let i = 0; i < 30; i++) {
    const { value } = await rpc.getSignatureStatuses([sig]).send();
    const s = value[0];
    if (s?.err) throw new Error("airdrop failed");
    if (s?.confirmationStatus === "confirmed" || s?.confirmationStatus === "finalized") return sig;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("airdrop not confirmed in 30 s");
}

/**
 * Cast the net = swap half the SOL for devUSDC, then open a position with both halves.
 * The net spans [low, high] in USDC per SOL, chosen by the player in the net mini-game.
 * Returns the position mint (the creature's id) and both signatures.
 */
export async function hatch(signer: TransactionSigner, pool: Pool, solAmount: number, net: { low: number; high: number }) {
  const half = BigInt(Math.floor((solAmount / 2) * 1e9));
  const swap = await swapInstructions(rpc, { inputAmount: half, mint: SOL_MINT }, pool.address, {
    signer,
    whirlpoolDeployment: deployment,
  });
  const swapSig = await send(signer, swap.instructions);
  const usdcOut = swap.quote.tokenEstOut;

  const fresh = await readPool(pool.address);
  const lo = net.low;
  const hi = net.high;
  if (!(lo > 0 && hi > lo)) throw new Error("the net has no size");
  // Orca prices are token B per token A.
  const [lower, upper] = fresh.solIsA ? [lo, hi] : [1 / hi, 1 / lo];
  const param = fresh.solIsA ? { tokenMaxA: half, tokenMaxB: usdcOut } : { tokenMaxA: usdcOut, tokenMaxB: half };
  const open = await openPositionInstructions(rpc, pool.address, param, lower, upper, {
    funder: signer,
    whirlpoolDeployment: deployment,
  });
  const openSig = await send(signer, open.instructions);
  return { mint: open.positionMint, swapSig, openSig };
}

/**
 * A plain swap on the deepest devnet SOL/devUSDC pool - MEME DASH's devnet trade.
 * Pass SOL_MINT to buy devUSDC with SOL, DEV_USDC_MINT to sell it back.
 */
export async function devSwap(
  signer: TransactionSigner,
  inputMint: Address,
  inputAmount: bigint,
): Promise<{ sig: string; out: bigint }> {
  const pool = await pickPool();
  const swap = await swapInstructions(rpc, { inputAmount, mint: inputMint }, pool.address, {
    signer,
    whirlpoolDeployment: deployment,
  });
  const sig = await send(signer, swap.instructions);
  return { sig, out: swap.quote.tokenEstOut };
}

export async function creatures(owner: Address): Promise<Creature[]> {
  const all = await withRetry(() => fetchPositionsForOwner(rpc, owner, deployment));
  const out: Creature[] = [];
  const solIsAByPool = new Map<string, boolean>();
  for (const p of all) {
    if (p.isPositionBundle) continue;
    const d = p.data;
    let solIsA = solIsAByPool.get(d.whirlpool);
    if (solIsA === undefined) {
      try {
        solIsA = (await readPool(d.whirlpool)).solIsA;
      } catch {
        continue; // not a SOL pool position: not a creature in this game
      }
      solIsAByPool.set(d.whirlpool, solIsA);
    }
    const a = tickToPrice(d.tickLowerIndex, solIsA);
    const b = tickToPrice(d.tickUpperIndex, solIsA);
    out.push({ mint: d.positionMint, pool: d.whirlpool, lowerPrice: Math.min(a, b), upperPrice: Math.max(a, b), liquidity: d.liquidity });
  }
  return out;
}

export interface Food {
  sol: number;
  usdc: number;
}

/** Fees owed right now, from Orca's own quote. Reading is free: no transaction is sent. */
export async function foodInBowl(signer: TransactionSigner, c: Creature, solIsA: boolean): Promise<Food> {
  const h = await withRetry(() => harvestPositionInstructions(rpc, c.mint, { authority: signer, whirlpoolDeployment: deployment }));
  const a = Number(h.feesQuote.feeOwedA);
  const b = Number(h.feesQuote.feeOwedB);
  return solIsA ? { sol: a / 1e9, usdc: b / 1e6 } : { sol: b / 1e9, usdc: a / 1e6 };
}

export async function eat(signer: TransactionSigner, c: Creature): Promise<string> {
  const h = await harvestPositionInstructions(rpc, c.mint, { authority: signer, whirlpoolDeployment: deployment });
  return send(signer, h.instructions);
}

export async function feed(signer: TransactionSigner, c: Creature, solAmount: number, solIsA: boolean): Promise<string> {
  const lam = BigInt(Math.floor(solAmount * 1e9));
  // Cap the other side generously; the quote takes only what the band needs.
  const usdcCap = BigInt(1_000_000_000_000);
  const param = solIsA ? { tokenMaxA: lam, tokenMaxB: usdcCap } : { tokenMaxA: usdcCap, tokenMaxB: lam };
  const inc = await increaseLiquidityInstructions(rpc, c.mint, param, { authority: signer, whirlpoolDeployment: deployment });
  return send(signer, inc.instructions);
}

export async function release(signer: TransactionSigner, c: Creature): Promise<string> {
  const cl = await closePositionInstructions(rpc, c.mint, { authority: signer, whirlpoolDeployment: deployment });
  return send(signer, cl.instructions);
}

export const explorer = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=${NETWORK}`;
