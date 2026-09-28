import { type Address, address } from "@solana/kit";

/**
 * The world map: every playable Orca pool on devnet, from Orca's own pool API.
 * Playable = SOL paired with a dollar or euro stablecoin, with liquidity in it.
 * Each pin is placed by two scores computed from real pool data only:
 *   safety: how deep the pool is (TVL), how gentle its fee tier is, and how solid its quote coin is
 *   heat:   how busy it is (24h volume against TVL)
 * Nothing is invented: a pool with no volume data simply has zero heat.
 */

const API = "https://api.devnet.orca.so/v2/solana/pools?size=100&sortBy=tvl";
const SOL = "So11111111111111111111111111111111111111112";
const STABLE = /^(dev)?(USDC|USDT|PYUSD|EURC)$/i;

export interface MapPool {
  address: Address;
  label: string;
  feeRate: number; // hundredths of a basis point (2000 = 0.20%)
  tvl: number; // USD
  vol24: number; // USD
  safety: number; // 0..100
  heat: number; // 0..100
}

interface ApiToken {
  symbol?: string | null;
}
interface ApiPool {
  address: string;
  feeRate: number;
  liquidity: string;
  tokenMintA: string;
  tokenMintB: string;
  tokenA?: ApiToken;
  tokenB?: ApiToken;
  tvlUsdc?: string | number | null;
  stats?: { "24h"?: { volume?: string | number | null } };
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export async function mapPools(): Promise<MapPool[]> {
  const res = await fetch(API, { cache: "no-store" });
  if (!res.ok) throw new Error(`orca pool list ${res.status}`);
  const { data } = (await res.json()) as { data: ApiPool[] };
  const out: MapPool[] = [];
  for (const p of data) {
    const solA = p.tokenMintA === SOL;
    const solB = p.tokenMintB === SOL;
    if (!solA && !solB) continue;
    const quote = (solA ? p.tokenB?.symbol : p.tokenA?.symbol) ?? "";
    if (!STABLE.test(quote) || BigInt(p.liquidity || "0") === BigInt(0)) continue;
    const tvl = Number(p.tvlUsdc ?? 0) || 0;
    const vol24 = Number(p.stats?.["24h"]?.volume ?? 0) || 0;
    const feePct = p.feeRate / 10000;
    const depth = (Math.log10(1 + tvl) / 4) * 55; // $10k TVL fills the depth part
    const gentle = feePct <= 0.05 ? 25 : feePct <= 0.3 ? 18 : feePct <= 1 ? 10 : 4;
    const solid = /USDC|USDT/i.test(quote) ? 20 : 12;
    const turnover = tvl > 0 ? vol24 / tvl : vol24 > 0 ? 10 : 0;
    out.push({
      address: address(p.address),
      label: `SOL/${quote.replace(/^dev/i, "").toUpperCase()}`,
      feeRate: p.feeRate,
      tvl,
      vol24,
      safety: clamp(depth + gentle + solid),
      heat: clamp((Math.log10(1 + turnover * 100) / 3) * 100),
    });
  }
  if (out.length === 0) throw new Error("no playable pools on devnet right now");
  return out.slice(0, 12);
}

export type Dir = "UP" | "DOWN" | "LEFT" | "RIGHT";

/** Cursor to the nearest pin in a direction on the safety (x) / heat (y) map. */
export function nextPin(pins: MapPool[], i: number, dir: Dir): number {
  const c = pins[i];
  if (!c) return i;
  let best = i;
  let bestD = Infinity;
  pins.forEach((p, j) => {
    if (j === i) return;
    const dx = p.safety - c.safety;
    const dy = p.heat - c.heat;
    const ok = dir === "RIGHT" ? dx > 0 : dir === "LEFT" ? dx < 0 : dir === "UP" ? dy > 0 : dy < 0;
    if (!ok) return;
    const along = dir === "LEFT" || dir === "RIGHT" ? Math.abs(dx) : Math.abs(dy);
    const across = dir === "LEFT" || dir === "RIGHT" ? Math.abs(dy) : Math.abs(dx);
    const d = along + across * 2;
    if (d < bestD) {
      bestD = d;
      best = j;
    }
  });
  if (best === i) {
    // nothing strictly that way (pins can share a spot): step through the list instead
    return dir === "RIGHT" || dir === "DOWN" ? (i + 1) % pins.length : (i + pins.length - 1) % pins.length;
  }
  return best;
}
