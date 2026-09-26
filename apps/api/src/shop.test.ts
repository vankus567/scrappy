import { describe, expect, test } from "bun:test";
import { base58 } from "@scure/base";
import type { MiddlewareHandler } from "hono";
import { createApp } from "./app";
import { createAuth } from "./auth";
import { openDb } from "./db";
import { createProofStore } from "./proofs";
import { createTaskService } from "./tasks";

const PLATFORM = "P1atform1111111111111111111111111111111111";
const me = base58.encode(new Uint8Array(32).fill(51));
const stranger = base58.encode(new Uint8Array(32).fill(52));
const sig = (n: number) => String(n).repeat(88).slice(0, 88);

// a stand-in for the Solana RPC: transactions keyed by signature, shaped like jsonParsed getTransaction
const txs = new Map<string, any>();
const payment = (payer: string, lamports: number, err: unknown = null) => ({
  meta: { err, preBalances: [5e9, 1e9, 1], postBalances: [5e9 - lamports - 5000, 1e9 + lamports, 1] },
  transaction: { message: { accountKeys: [{ pubkey: payer, signer: true }, { pubkey: PLATFORM, signer: false }, { pubkey: "11111111111111111111111111111111", signer: false }] } },
});

function setup() {
  const db = openDb(":memory:");
  const pass: MiddlewareHandler = async (_c, next) => next();
  const app = createApp({
    db, tasks: createTaskService(db), auth: createAuth(db), paywall: pass, platformWallet: PLATFORM,
    rpc: async (method, params) => (method === "getTransaction" ? txs.get((params as string[])[0]) ?? null : null),
    proofs: createProofStore(db, `${process.env.TEMP ?? "/tmp"}/scrappy-shop-test`),
  });
  const req = async (method: string, path: string, body?: unknown, token?: string) => {
    const res = await app.request(path, { method, headers: { "content-type": "application/json", ...(token && { authorization: `Bearer ${token}` }) }, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
  return { req };
}

describe("pet shop", () => {
  test("buy with a verified SOL payment, reject bad payments, equip what you own", async () => {
    const s = setup();
    const token = (await s.req("POST", "/v1/workers", { wallet: me, languages: ["en"], pet_name: "Solo", species: "mochi" })).body.worker_token;
    const shop = (await s.req("GET", "/v1/shop", undefined, token)).body;
    expect(shop).toMatchObject({ network: "devnet", pay_to: PLATFORM, equipped: "mochi" });
    expect(shop.pets.find((p: any) => p.species === "mochi").owned).toBe(true); // the hatched pet is free
    expect(shop.pets.find((p: any) => p.species === "ember")).toMatchObject({ owned: false, price_sol: 0.25 });

    txs.set(sig(1), payment(me, 0.1e9)); // too little for a legendary
    txs.set(sig(2), payment(stranger, 0.25e9)); // someone else paid
    txs.set(sig(3), payment(me, 0.25e9, { InstructionError: [0, "Custom"] })); // failed on-chain
    txs.set(sig(4), payment(me, 0.25e9)); // good
    const buy = (tx: string, species = "ember") => s.req("POST", "/v1/shop/buy", { species, tx_sig: tx }, token);
    expect((await buy(sig(1))).body.error).toContain("costs 0.25 SOL");
    expect((await buy(sig(2))).body.error).toContain("wallet you signed in with");
    expect((await buy(sig(3))).body.error).toContain("failed");
    expect((await buy(sig(9))).status).toBe(404); // not on-chain yet
    expect((await s.req("POST", "/v1/shop/equip", { species: "ember" }, token)).status).toBe(403);

    const ok = await buy(sig(4));
    expect(ok.status).toBe(200);
    expect(ok.body.pets.find((p: any) => p.species === "ember").owned).toBe(true);
    expect((await buy(sig(4), "boo")).body.error).toContain("already used"); // one payment, one pet

    const eq = await s.req("POST", "/v1/shop/equip", { species: "ember" }, token);
    expect(eq.body.equipped).toBe("ember");
    const back = await s.req("POST", "/v1/shop/equip", { species: "mochi" }, token); // the starter stays yours
    expect(back.body.equipped).toBe("mochi");
  });
});
