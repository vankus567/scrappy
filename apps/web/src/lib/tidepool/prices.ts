/**
 * The real SOL price for the chart and the round, from Coinbase's public market data
 * (keyless, browser-callable). Pyth Hermes now requires a key and the mainnet public RPC
 * blocks browsers, so this is the honest free source. The screen always names it.
 */

export const PRICE_SOURCE = "COINBASE SOL-USD";

export interface Candle {
  t: number; // unix seconds, candle open
  o: number;
  h: number;
  l: number;
  c: number;
}

const BASE = "https://api.exchange.coinbase.com/products/SOL-USD";

/** Last `n` one-minute candles, oldest first. */
export async function candles(n = 60): Promise<Candle[]> {
  const res = await fetch(`${BASE}/candles?granularity=60`, { cache: "no-store" });
  if (!res.ok) throw new Error(`price feed ${res.status}`);
  const rows = (await res.json()) as [number, number, number, number, number, number][];
  // Coinbase rows: [time, low, high, open, close, volume], newest first.
  return rows
    .slice(0, n)
    .map(([t, l, h, o, c]) => ({ t, o, h, l, c }))
    .reverse();
}

export async function lastPrice(): Promise<number> {
  const res = await fetch(`${BASE}/ticker`, { cache: "no-store" });
  if (!res.ok) throw new Error(`price feed ${res.status}`);
  const body = (await res.json()) as { price: string };
  const p = Number(body.price);
  if (!Number.isFinite(p) || p <= 0) throw new Error("bad price");
  return p;
}
