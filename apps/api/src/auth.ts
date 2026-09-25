import { base58 } from "@scure/base";
import type { MiddlewareHandler } from "hono";
import { type Db, uid } from "./db";
import type { WorkerRow } from "./tasks";

export const sha256 = (s: string) => new Bun.CryptoHasher("sha256").update(s).digest("hex");
const randomToken = (prefix: string) => prefix + base58.encode(crypto.getRandomValues(new Uint8Array(32)));

export const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export const SIGN_IN_MAX_AGE_MS = 5 * 60_000;

/** The exact message a worker's wallet signs to prove it owns the address. */
export const signInMessage = (wallet: string, nonce: string, issuedAt: string) =>
  `Scrappy sign-in\nwallet: ${wallet}\nnonce: ${nonce}\nissued: ${issuedAt}`;

export function createAuth(db: Db) {
  // ---- projects + API keys (developers) ----
  const createProject = (name: string, fundingWallet: string | null, now = Date.now()) => {
    const orgId = uid();
    const projectId = uid();
    const apiKey = randomToken("scrappy_sk_");
    const webhookSecret = randomToken("whsec_");
    db.transaction(() => {
      db.query("INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)").run(orgId, name, now);
      db.query("INSERT INTO projects (id, org_id, name, funding_wallet, webhook_secret, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
        projectId, orgId, name, fundingWallet, webhookSecret, now,
      );
      db.query("INSERT INTO api_keys (id, project_id, prefix, hash, label, created_at) VALUES (?, ?, ?, ?, 'default', ?)").run(
        uid(), projectId, apiKey.slice(0, 14), sha256(apiKey), now,
      );
    })();
    return { projectId, apiKey, webhookSecret };
  };

  const createKey = (projectId: string, label: string, now = Date.now()) => {
    const apiKey = randomToken("scrappy_sk_");
    const id = uid();
    db.query("INSERT INTO api_keys (id, project_id, prefix, hash, label, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
      id, projectId, apiKey.slice(0, 14), sha256(apiKey), label, now,
    );
    return { id, apiKey };
  };

  const projectForKey = (key: string | undefined, now = Date.now()) => {
    if (!key?.startsWith("scrappy_sk_")) return null;
    const row = db.query(
      "SELECT k.id AS key_id, p.* FROM api_keys k JOIN projects p ON p.id = k.project_id WHERE k.hash = ? AND k.revoked_at IS NULL",
    ).get(sha256(key)) as any;
    if (!row) return null;
    db.query("UPDATE api_keys SET last_used_at = ? WHERE id = ?").run(now, row.key_id);
    return row as { key_id: string; id: string; name: string; funding_wallet: string | null; balance_micro: number; webhook_secret: string; created_at: number };
  };

  // ---- workers ----
  const registerWorker = (
    wallet: string,
    languages: string[],
    profile: { pet_name?: string; species?: string; city?: string },
    now = Date.now(),
  ): { ok: true; worker: WorkerRow; token: string } | { ok: false; error: string } => {
    if (db.query("SELECT 1 FROM workers WHERE wallet = ?").get(wallet)) {
      return { ok: false, error: "This wallet already has a Scrappy. Sign in with the wallet to continue on this device." };
    }
    const token = randomToken("kw_");
    const w: WorkerRow = {
      id: uid(), wallet, token_hash: sha256(token), languages: JSON.stringify(languages), pet_name: profile.pet_name ?? null,
      species: profile.species ?? null, city: profile.city ?? null, created_at: now, last_seen_at: now, tasks_done: 0,
      earned_micro: 0, owed_micro: 0, pending_micro: 0, push_subscription: null,
      pet_food: 0, pet_hunger: 0, pet_hunger_at: null, pet_starving_at: null, pet_dead: 0,
    };
    db.query(
      "INSERT INTO workers (id, wallet, token_hash, languages, pet_name, species, city, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(w.id, w.wallet, w.token_hash, w.languages, w.pet_name, w.species, w.city, w.created_at, w.last_seen_at);
    return { ok: true, worker: w, token };
  };

  const workerForToken = (token: string | undefined) => {
    if (!token?.startsWith("kw_")) return null;
    return db.query("SELECT * FROM workers WHERE token_hash = ?").get(sha256(token)) as WorkerRow | null;
  };

  /**
   * Wallet sign-in: the wallet signs `signInMessage`. Fresh (5 min), single-use nonce (replay protection),
   * Ed25519 over the wallet's own public key. Issues a new device token.
   */
  const signIn = async (wallet: string, nonce: string, issuedAt: string, signatureB58: string, now = Date.now()) => {
    const worker = db.query("SELECT * FROM workers WHERE wallet = ?").get(wallet) as WorkerRow | null;
    if (!worker) return { ok: false as const, error: "no Scrappy for this wallet" };
    const issued = Date.parse(issuedAt);
    if (!Number.isFinite(issued) || Math.abs(now - issued) > SIGN_IN_MAX_AGE_MS) return { ok: false as const, error: "sign-in message expired" };
    if (!/^[A-Za-z0-9]{16,64}$/.test(nonce)) return { ok: false as const, error: "bad nonce" };
    let valid = false;
    try {
      const key = await crypto.subtle.importKey("raw", new Uint8Array(base58.decode(wallet)), { name: "Ed25519" }, false, ["verify"]);
      valid = await crypto.subtle.verify("Ed25519", key, new Uint8Array(base58.decode(signatureB58)), new TextEncoder().encode(signInMessage(wallet, nonce, issuedAt)));
    } catch {
      valid = false;
    }
    if (!valid) return { ok: false as const, error: "signature does not match this wallet" };
    const used = db.query("INSERT OR IGNORE INTO auth_nonces (nonce, used_at) VALUES (?, ?)").run(nonce, now);
    if (used.changes === 0) return { ok: false as const, error: "this sign-in was already used" };
    db.query("DELETE FROM auth_nonces WHERE used_at < ?").run(now - 2 * SIGN_IN_MAX_AGE_MS);
    const token = randomToken("kw_");
    db.query("UPDATE workers SET token_hash = ? WHERE id = ?").run(sha256(token), worker.id);
    return { ok: true as const, worker, token };
  };

  return { createProject, createKey, projectForKey, registerWorker, workerForToken, signIn };
}

export type Auth = ReturnType<typeof createAuth>;

export const bearer = (h: string | undefined) => (h?.startsWith("Bearer ") ? h.slice(7).trim() : undefined);

/** Token-bucket rate limit per client IP + route group. In-memory: one API process. */
export function rateLimit(group: string, perMinute: number): MiddlewareHandler {
  const buckets = new Map<string, { tokens: number; at: number }>();
  return async (c, next) => {
    const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || c.req.header("x-real-ip") || "local";
    const key = `${group}:${ip}`;
    const now = Date.now();
    const b = buckets.get(key) ?? { tokens: perMinute, at: now };
    b.tokens = Math.min(perMinute, b.tokens + ((now - b.at) / 60_000) * perMinute);
    b.at = now;
    if (b.tokens < 1) {
      buckets.set(key, b);
      c.header("retry-after", String(Math.ceil(((1 - b.tokens) / perMinute) * 60)));
      return c.json({ error: "rate_limited" }, 429);
    }
    b.tokens -= 1;
    buckets.set(key, b);
    if (buckets.size > 50_000) buckets.clear();
    await next();
  };
}
