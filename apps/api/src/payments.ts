import { type Db, uid } from "./db";
import { sha256 } from "./auth";
import type { TaskRow } from "./tasks";

export const USDC_MINT = process.env.USDC_MINT ?? "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"; // devnet USDC
const RPC = process.env.SOLANA_RPC ?? "https://api.devnet.solana.com";

export type Rpc = (method: string, params: unknown[]) => Promise<any>;
export const solanaRpc: Rpc = async (method, params) => {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const j: any = await res.json();
  if (j.error) throw new Error(j.error.message ?? "rpc error");
  return j.result;
};

/**
 * Credit a project's balance from a real USDC transfer: the tx must be confirmed, succeed, move USDC out of the
 * project's funding wallet and into the platform wallet. Each signature can be credited once (replay protection).
 */
export async function verifyDeposit(db: Db, rpc: Rpc, project: { id: string; funding_wallet: string | null }, txSig: string, platform: string, now = Date.now()) {
  if (!project.funding_wallet) return { ok: false as const, error: "set a funding wallet for this project first" };
  if (!/^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(txSig)) return { ok: false as const, error: "not a transaction signature" };
  if (db.query("SELECT 1 FROM payments WHERE tx_sig = ?").get(txSig)) return { ok: false as const, error: "this transaction was already credited" };

  const tx = await rpc("getTransaction", [txSig, { encoding: "jsonParsed", commitment: "confirmed", maxSupportedTransactionVersion: 0 }]);
  if (!tx) return { ok: false as const, error: "transaction not found (wait for confirmation and retry)" };
  if (tx.meta?.err) return { ok: false as const, error: "transaction failed on-chain" };

  const delta = (owner: string) => {
    const pick = (list: any[] = []) =>
      list.filter((b) => b.owner === owner && b.mint === USDC_MINT).reduce((s, b) => s + Number(b.uiTokenAmount.amount), 0);
    return pick(tx.meta?.postTokenBalances) - pick(tx.meta?.preTokenBalances);
  };
  const received = delta(platform);
  const sent = -delta(project.funding_wallet);
  const amount = Math.min(received, sent);
  if (amount <= 0) return { ok: false as const, error: "no USDC moved from your funding wallet to Scrappy in this transaction" };

  db.transaction(() => {
    db.query("INSERT INTO payments (id, kind, project_id, wallet, amount_micro, tx_sig, created_at) VALUES (?, 'deposit', ?, ?, ?, ?, ?)").run(
      uid(), project.id, project.funding_wallet, amount, txSig, now,
    );
    db.query("UPDATE projects SET balance_micro = balance_micro + ? WHERE id = ?").run(amount, project.id);
  })();
  return { ok: true as const, amount_micro: amount };
}

/** Signed webhook: X-Scrappy-Signature: t=<unix ms>,v1=<hex hmac-sha256("t.body", secret)>. */
export function signWebhook(secret: string, body: string, t = Date.now()) {
  const mac = new Bun.CryptoHasher("sha256", secret).update(`${t}.${body}`).digest("hex");
  return `t=${t},v1=${mac}`;
}

export function webhookSender(db: Db) {
  return (task: TaskRow, payload: unknown) => {
    if (!task.webhook_url || !task.project_id) return;
    const p = db.query("SELECT webhook_secret FROM projects WHERE id = ?").get(task.project_id) as any;
    if (!p) return;
    const body = JSON.stringify({ type: "task.finished", data: payload });
    fetch(task.webhook_url, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(5_000),
      headers: { "content-type": "application/json", "x-scrappy-signature": signWebhook(p.webhook_secret, body) },
      body,
    }).catch(() => {});
  };
}

/** Web push to online-capable workers who qualify, when a task goes live. No-op without VAPID keys. */
export function pushNotifier(db: Db) {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return undefined;
  let webpush: typeof import("web-push") | null = null;
  import("web-push").then((m) => {
    webpush = m.default ?? (m as any);
    webpush!.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:hello@kageai.me", pub, priv);
  });
  return (task: TaskRow) => {
    if (!webpush) return;
    const workers = db.query(
      "SELECT id, push_subscription FROM workers WHERE push_subscription IS NOT NULL AND languages LIKE ? LIMIT 200",
    ).all(`%"${task.language}"%`) as { id: string; push_subscription: string }[];
    const reward = Math.floor(task.reward_micro * 0.8) / 1e6;
    const body = JSON.stringify({ title: "Scrappy task available", body: `${task.prompt.slice(0, 80)} · $${reward.toFixed(2)}`, url: "/app/tasks", tag: task.id });
    for (const w of workers) {
      db.query("INSERT INTO notifications (id, worker_id, task_id, channel, status, created_at) VALUES (?, ?, ?, 'webpush', 'sent', ?)").run(uid(), w.id, task.id, Date.now());
      webpush.sendNotification(JSON.parse(w.push_subscription), body, { TTL: 60 }).catch((err: any) => {
        if (err?.statusCode === 404 || err?.statusCode === 410) db.query("UPDATE workers SET push_subscription = NULL WHERE id = ?").run(w.id);
      });
    }
  };
}

