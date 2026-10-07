import { httpRouter } from "convex/server";
import { registerStaticRoutes } from "@convex-dev/static-hosting";
import { components } from "./_generated/api";
import { httpAction } from "./_generated/server";

const http = httpRouter();

/**
 * Same-origin JSON-RPC proxy for MEME DASH mainnet calls. The public mainnet endpoint 403s browser
 * origins, so the play key's balance polls and swap sends ride through here. Body capped at 64 KB.
 */
const RPC_UPSTREAM = process.env.SCRAPPY_RPC_MAINNET ?? "https://api.mainnet-beta.solana.com";
http.route({
  path: "/api/rpc",
  method: "POST",
  handler: httpAction(async (_ctx, req) => {
    const body = await req.arrayBuffer();
    if (body.byteLength > 64 * 1024) return Response.json({ error: "too large" }, { status: 413 });
    try {
      const r = await fetch(RPC_UPSTREAM, { method: "POST", headers: { "content-type": "application/json" }, body });
      return new Response(r.body, { status: r.status, headers: { "content-type": r.headers.get("content-type") ?? "application/json" } });
    } catch (e) {
      return Response.json({ error: `rpc upstream failed: ${(e as Error).message}` }, { status: 502 });
    }
  }),
});

/** Coin-icon proxy: token art hosts send no CORS headers, so the canvas cannot read them directly. */
http.route({
  path: "/api/icon",
  method: "GET",
  handler: httpAction(async (_ctx, req) => {
    const u = new URL(req.url).searchParams.get("u");
    if (!u) return Response.json({ error: "missing u" }, { status: 400 });
    let target: URL;
    try {
      target = new URL(u);
    } catch {
      return Response.json({ error: "bad url" }, { status: 400 });
    }
    if (target.protocol !== "https:") return Response.json({ error: "https only" }, { status: 400 });
    try {
      const r = await fetch(target);
      if (!r.ok) return Response.json({ error: `upstream ${r.status}` }, { status: 502 });
      const type = r.headers.get("content-type") ?? "";
      if (!type.startsWith("image/")) return Response.json({ error: "not an image" }, { status: 415 });
      return new Response(r.body, { headers: { "content-type": type, "cache-control": "public, max-age=86400" } });
    } catch (e) {
      return Response.json({ error: (e as Error).message }, { status: 502 });
    }
  }),
});

/**
 * Clean page URLs. The export writes `<route>/index.html`; serve those bytes at the clean URL
 * (never redirect to the file, or the address bar shows /index.html and client routing breaks).
 */
const pages: Record<string, string> = {
  "/scrappyboy": "/scrappyboy/index.html",
  "/scrappyboy/": "/scrappyboy/index.html",
};
for (const [path, file] of Object.entries(pages)) {
  http.route({
    path,
    method: "GET",
    handler: httpAction(async (ctx) => {
      const asset = await ctx.runQuery(components.staticHosting.lib.resolveAssetForHttp, { path: file });
      if (!asset?.storageUrl) return new Response("Not found", { status: 404 });
      const res = await fetch(asset.storageUrl);
      return new Response(res.body, {
        status: 200,
        headers: { "content-type": asset.contentType || "text/html; charset=utf-8", "cache-control": "public, max-age=0, must-revalidate" },
      });
    }),
  });
}

/** The Android build, with the type Android expects so the browser offers to install it. */
http.route({
  path: "/scrappy.apk",
  method: "GET",
  handler: httpAction(async (ctx) => {
    const asset = await ctx.runQuery(components.staticHosting.lib.resolveAssetForHttp, { path: "/scrappy.apk" });
    if (!asset?.storageUrl) return new Response("Not found", { status: 404 });
    const res = await fetch(asset.storageUrl);
    return new Response(res.body, {
      status: 200,
      headers: {
        "content-type": "application/vnd.android.package-archive",
        "content-disposition": 'attachment; filename="scrappy.apk"',
        "cache-control": "public, max-age=0, must-revalidate",
      },
    });
  }),
});

/**
 * Built chunks. The uploader stores .wasm as application/octet-stream, and browsers refuse to
 * compile WebAssembly served with any type but application/wasm: the Orca SDK's wasm then never
 * loads and the console never boots. Serve /_next/* here with the right type for wasm.
 */
http.route({
  pathPrefix: "/_next/",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    const path = new URL(req.url).pathname;
    const asset = await ctx.runQuery(components.staticHosting.lib.resolveAssetForHttp, { path });
    if (!asset?.storageUrl) return new Response("Not found", { status: 404 });
    const res = await fetch(asset.storageUrl);
    const type = path.endsWith(".wasm") ? "application/wasm" : asset.contentType || "application/octet-stream";
    return new Response(res.body, {
      status: 200,
      headers: { "content-type": type, "cache-control": "public, max-age=31536000, immutable" },
    });
  }),
});

/** Old screens of an earlier product on this codebase go to the console. */
const toConsole = httpAction(async () => new Response(null, { status: 302, headers: { location: "/scrappyboy?net=devnet" } }));
for (const path of ["/live", "/play", "/tidepool", "/app"]) http.route({ path, method: "GET", handler: toConsole });
http.route({ pathPrefix: "/app/", method: "GET", handler: toConsole });

registerStaticRoutes(http, components.staticHosting);

export default http;
