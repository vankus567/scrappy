import { NextResponse } from "next/server";

/** Coin-icon proxy: token art hosts don't send CORS headers, so the canvas can't read them directly. */
export async function GET(req: Request) {
  const u = new URL(req.url).searchParams.get("u");
  if (!u) return NextResponse.json({ error: "missing u" }, { status: 400 });
  let target: URL;
  try {
    target = new URL(u);
  } catch {
    return NextResponse.json({ error: "bad url" }, { status: 400 });
  }
  if (target.protocol !== "https:") return NextResponse.json({ error: "https only" }, { status: 400 });
  try {
    const r = await fetch(target, { cache: "no-store" });
    if (!r.ok) return NextResponse.json({ error: `upstream ${r.status}` }, { status: 502 });
    const type = r.headers.get("content-type") ?? "";
    if (!type.startsWith("image/")) return NextResponse.json({ error: "not an image" }, { status: 415 });
    return new NextResponse(r.body, { headers: { "content-type": type, "cache-control": "public, max-age=86400" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
