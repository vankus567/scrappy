import type { Db } from "./db";
import type { Rpc } from "./payments";
import type { WorkerRow } from "./tasks";

/**
 * Pet shop: unlock more pets with SOL (devnet while the game is in testing). The phone sends SOL to the
 * platform wallet; the server checks that exact transfer on-chain before unlocking the pet. A
 * transaction unlocks one pet, once.
 */

export const LAMPORTS = 1_000_000_000;
export const PETS: { species: string; name: string; tier: "common" | "rare" | "legendary"; price_sol: number }[] = [
  { species: "mochi", name: "Mochi", tier: "common", price_sol: 0.05 },
  { species: "bun", name: "Bun", tier: "common", price_sol: 0.05 },
  { species: "pip", name: "Pip", tier: "common", price_sol: 0.05 },
  { species: "neko", name: "Neko", tier: "common", price_sol: 0.05 },
  { species: "kumo", name: "Kumo", tier: "rare", price_sol: 0.1 },
  { species: "pengu", name: "Pengu", tier: "rare", price_sol: 0.1 },
  { species: "goo", name: "Goo", tier: "rare", price_sol: 0.1 },
  { species: "zap", name: "Zap", tier: "rare", price_sol: 0.1 },
  { species: "kitsu", name: "Kitsu", tier: "legendary", price_sol: 0.25 },
  { species: "drako", name: "Drako", tier: "legendary", price_sol: 0.25 },
  { species: "ember", name: "Ember", tier: "legendary", price_sol: 0.25 },
  { species: "boo", name: "Boo", tier: "legendary", price_sol: 0.25 },
];

export function createShop(db: Db, rpc: Rpc | undefined, platformWallet: string | undefined) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS owned_pets (
      worker_id TEXT NOT NULL REFERENCES workers(id), species TEXT NOT NULL, tx_sig TEXT UNIQUE, lamports INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL, PRIMARY KEY (worker_id, species)
    );
  `);

  /** The pets this player can use: the one they hatched (free) plus everything bought. */
  const owned = (w: WorkerRow) => {
    const bought = (db.query("SELECT species FROM owned_pets WHERE worker_id = ?").all(w.id) as { species: string }[]).map((r) => r.species);
    return [...new Set([...(w.species ? [w.species] : []), ...bought])];
  };

  const catalog = (w: WorkerRow | null) => {
    const mine = w ? owned(w) : [];
    return {
      network: process.env.SOLANA_NETWORK?.includes("5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp") ? "mainnet" : "devnet",
      pay_to: platformWallet ?? null,
      equipped: w?.species ?? null,
      pets: PETS.map((p) => ({ ...p, owned: mine.includes(p.species) })),
    };
  };

  /** Unlock a pet after checking the SOL transfer on-chain: right payer, right amount, to us, not used before. */
  const buy = async (w: WorkerRow, species: string, txSig: string, now = Date.now()) => {
    const pet = PETS.find((p) => p.species === species);
    if (!pet) return { ok: false as const, status: 404, error: "no such pet" };
    if (owned(w).includes(species)) return { ok: false as const, status: 409, error: "you already have this pet" };
    if (!rpc || !platformWallet) return { ok: false as const, status: 503, error: "the shop is closed on this server" };
    if (!/^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(txSig)) return { ok: false as const, status: 400, error: "not a transaction signature" };
    if (db.query("SELECT 1 FROM owned_pets WHERE tx_sig = ?").get(txSig)) return { ok: false as const, status: 409, error: "this payment was already used" };

    const tx = await rpc("getTransaction", [txSig, { encoding: "jsonParsed", commitment: "confirmed", maxSupportedTransactionVersion: 0 }]);
    if (!tx) return { ok: false as const, status: 404, error: "payment not found yet; wait a few seconds and try again" };
    if (tx.meta?.err) return { ok: false as const, status: 400, error: "that payment failed on-chain" };
    const keys: string[] = (tx.transaction?.message?.accountKeys ?? []).map((k: any) => (typeof k === "string" ? k : k.pubkey));
    const signers: string[] = (tx.transaction?.message?.accountKeys ?? []).filter((k: any) => typeof k !== "string" && k.signer).map((k: any) => k.pubkey);
    if (!signers.includes(w.wallet)) return { ok: false as const, status: 400, error: "pay from the wallet you signed in with" };
    const at = keys.indexOf(platformWallet);
    if (at < 0) return { ok: false as const, status: 400, error: "that payment didn't go to Scrappy" };
    const received = (tx.meta?.postBalances?.[at] ?? 0) - (tx.meta?.preBalances?.[at] ?? 0);
    const price = Math.round(pet.price_sol * LAMPORTS);
    if (received < price) return { ok: false as const, status: 400, error: `this pet costs ${pet.price_sol} SOL` };

    const r = db.query("INSERT OR IGNORE INTO owned_pets (worker_id, species, tx_sig, lamports, created_at) VALUES (?, ?, ?, ?, ?)").run(w.id, species, txSig, received, now);
    if (!r.changes) return { ok: false as const, status: 409, error: "this payment was already used" };
    return { ok: true as const, shop: catalog(w) };
  };

  /** Switch the pet you battle with (must be one you own). */
  const equip = (w: WorkerRow, species: string) => {
    if (!owned(w).includes(species)) return { ok: false as const, status: 403, error: "buy this pet first" };
    db.query("UPDATE workers SET species = ? WHERE id = ?").run(species, w.id);
    // keep the hatched pet owned after switching away from it
    db.query("INSERT OR IGNORE INTO owned_pets (worker_id, species, created_at) VALUES (?, ?, ?)").run(w.id, w.species, Date.now());
    return { ok: true as const, shop: catalog({ ...w, species }) };
  };

  return { catalog, buy, equip };
}
