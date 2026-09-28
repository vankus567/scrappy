import { NextResponse } from "next/server";

/**
 * Same-origin JSON-RPC proxy for MEME DASH mainnet calls.
 * api.mainnet-beta.solana.com 403s browser origins, so the play key's balance
 * polls and swap sends ride through here instead.
 */
const UPSTREAM = process.env.SCRAPPY_RPC_MAINNET ?? "https://api.mainnet-beta.solana.com";

export async function POST(req: Request) {
  const body = await req.arrayBuffer();
  if (body.byteLength > 64 * 1024) return NextResponse.json({ error: "too large" }, { status: 413 });
  try {
    const r = await fetch(UPSTREAM, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      cache: "no-store",
    });
    return new NextResponse(r.body, { status: r.status, headers: { "content-type": r.headers.get("content-type") ?? "application/json" } });
  } catch (e) {
    return NextResponse.json({ error: `rpc upstream failed: ${(e as Error).message}` }, { status: 502 });
  }
}
