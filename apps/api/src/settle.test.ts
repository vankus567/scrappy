import { describe, expect, test } from "bun:test";
import { openDb, uid } from "./db";
import { createSettler, type Sender } from "./settle";

const NOW = 1_760_000_000_000;
const HOLD = 48 * 3_600_000;
const MIN = 100_000; // $0.10
const W = (i: number) => `Worker${String(i).padEnd(3, "0")}1111111111111111111111111111111`;

function seed() {
  const db = openDb(":memory:");
  const worker = (i: number, owed: number, createdAt = NOW - HOLD - 1) =>
    db.query("INSERT INTO workers (id, wallet, token_hash, languages, created_at, owed_micro) VALUES (?, ?, 'h', '[]', ?, ?)").run(
      `w${i}`, W(i), createdAt, owed,
    );
  const task = (p: { refund?: number; payer?: string | null; refundTx?: string | null }) => {
    const id = uid();
    db.query(
      `INSERT INTO tasks (id, root_id, billing, prompt, response_schema, language, skill, min_accuracy, humans_required,
         reward_micro, budget_micro, consensus_threshold, deadline_at, status, refund_micro, payer, refund_tx, created_at)
       VALUES (?, ?, 'x402', 't', '{"type":"binary"}', 'en', 'general', 0.8, 2, 50000, 100000, 0.8, ?, 'insufficient_capacity', ?, ?, ?, ?)`,
    ).run(id, id, NOW - 1000, p.refund ?? 0, p.payer ?? null, p.refundTx ?? null, NOW - 1000);
    return id;
  };
  return { db, worker, task };
}

const goodSig = () => { let n = 0; return async () => `sig${++n}`.padEnd(88, "x"); };

describe("settlement worker", () => {
  test("pays what a worker is owed and records the tx signature", async () => {
    const s = seed();
    s.worker(1, 250_000);
    const settler = createSettler(s.db, { send: goodSig(), minPayoutMicro: MIN, log: () => {} });
    const r = await settler.runOnce(NOW);
    expect(r).toMatchObject({ paid: 1, refunded: 0, errors: 0 });
    expect((s.db.query("SELECT owed_micro FROM workers WHERE id = 'w1'").get() as any).owed_micro).toBe(0);
    expect(s.db.query("SELECT * FROM payments WHERE kind = 'payout' AND worker_id = 'w1'").get() as any).toMatchObject({
      wallet: W(1), amount_micro: 250_000,
    });
  });

  test("skips dust below the minimum and accounts still in the payout hold", async () => {
    const s = seed();
    s.worker(1, MIN - 1); // dust
    s.worker(2, 500_000, NOW - HOLD + 1); // 1ms short of the hold
    const sent: string[] = [];
    const send: Sender = async (to) => (sent.push(to), "sig".padEnd(88, "x"));
    const r = await createSettler(s.db, { send, minPayoutMicro: MIN, log: () => {} }).runOnce(NOW);
    expect(r).toMatchObject({ paid: 0, errors: 0 });
    expect(sent).toHaveLength(0);
    expect((s.db.query("SELECT owed_micro FROM workers WHERE id = 'w1'").get() as any).owed_micro).toBe(MIN - 1);
  });

  test("a failed transfer keeps the worker owed and does not block the next one", async () => {
    const s = seed();
    s.worker(1, 200_000);
    s.worker(2, 300_000);
    const send: Sender = async (to) => {
      if (to === W(1)) throw new Error("rpc down");
      return "sig".padEnd(88, "x");
    };
    const r = await createSettler(s.db, { send, minPayoutMicro: MIN, log: () => {} }).runOnce(NOW);
    expect(r).toMatchObject({ paid: 1, errors: 1 });
    expect((s.db.query("SELECT owed_micro FROM workers WHERE id = 'w1'").get() as any).owed_micro).toBe(200_000);
    expect((s.db.query("SELECT owed_micro FROM workers WHERE id = 'w2'").get() as any).owed_micro).toBe(0);
  });

  test("refunds the x402 payer for unfilled seats, once", async () => {
    const s = seed();
    const payer = "AgentWa11et1111111111111111111111111111111";
    const t1 = s.task({ refund: 50_000, payer });
    s.task({ refund: 50_000, payer: null }); // no payer recorded: cannot refund
    s.task({ refund: 50_000, payer, refundTx: "done".padEnd(88, "x") }); // already refunded
    const settler = createSettler(s.db, { send: goodSig(), minPayoutMicro: MIN, log: () => {} });
    const r = await settler.runOnce(NOW);
    expect(r).toMatchObject({ paid: 0, refunded: 1, errors: 0 });
    expect((s.db.query("SELECT refund_tx FROM tasks WHERE id = ?").get(t1) as any).refund_tx).toStartWith("sig");
    expect((s.db.query("SELECT * FROM payments WHERE kind = 'refund' AND task_id = ?").get(t1) as any)).toMatchObject({
      wallet: payer, amount_micro: 50_000,
    });
    expect(s.db.query("SELECT COUNT(*) AS n FROM payments WHERE kind = 'refund'").get() as any).toEqual({ n: 1 });
  });

  test("single-flight: an overlapping run returns immediately", async () => {
    const s = seed();
    s.worker(1, 200_000);
    let release = () => {};
    const send: Sender = async () => {
      await new Promise<void>((r) => (release = r));
      return "sig".padEnd(88, "x");
    };
    const settler = createSettler(s.db, { send, minPayoutMicro: MIN, log: () => {} });
    const p1 = settler.runOnce(NOW);
    const p2 = await settler.runOnce(NOW);
    expect(p2.skipped).toBe(true);
    release();
    expect((await p1).paid).toBe(1);
  });
});
