import { afterEach, describe, expect, setSystemTime, test } from "bun:test";
import { base58 } from "@scure/base";
import { encodePaymentResponseHeader } from "@x402/core/http";
import type { MiddlewareHandler } from "hono";
import { createApp } from "./app";
import { createAuth, signInMessage } from "./auth";
import { openDb } from "./db";
import { verifyDeposit } from "./payments";
import { computeConsensus, createTaskService, MIN_ANSWER_MS, normalizeAnswer, safeWebhookUrl } from "./tasks";

// Stand-in for the x402 facilitator: lets the handler run, then "settles" (or fails) like the real middleware does.
function fakePaywall(opts: { settle: boolean; calls: { n: number } }): MiddlewareHandler {
  return async (c, next) => {
    opts.calls.n++;
    await next();
    if (c.res.status >= 300) return;
    const res = new Response(c.res.body, c.res);
    if (opts.settle) {
      res.headers.set(
        "payment-response",
        encodePaymentResponseHeader({ success: true, transaction: `sig${opts.calls.n}`.padEnd(88, "x"), network: "solana:devnet", payer: AGENT }),
      );
    }
    c.res = res;
  };
}

const AGENT = "AgentWa11et1111111111111111111111111111111";
const wallets = Array.from({ length: 8 }, (_, i) => base58.encode(new Uint8Array(32).fill(i + 1)));

function setup(settle = true) {
  const db = openDb(":memory:");
  const tasks = createTaskService(db);
  const auth = createAuth(db);
  const calls = { n: 0 };
  const app = createApp({ db, tasks, auth, paywall: fakePaywall({ settle, calls }), platformWallet: "P1atform1111111111111111111111111111111111" });
  const req = async (method: string, path: string, body?: unknown, token?: string) => {
    const res = await app.request(path, {
      method,
      headers: { "content-type": "application/json", ...(token && { authorization: `Bearer ${token}` }) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
  const worker = async (i: number, languages = ["en"]) => {
    const r = await req("POST", "/v1/workers", { wallet: wallets[i], languages, pet_name: `Pet${i}` });
    expect(r.status).toBe(201);
    await req("GET", "/v1/worker/next", undefined, r.body.worker_token); // comes online
    return r.body.worker_token as string;
  };
  return { db, tasks, auth, app, req, worker, calls };
}

let clock = Date.UTC(2026, 9, 1);
const tick = (ms: number) => setSystemTime(new Date((clock += ms)));
afterEach(() => setSystemTime());

async function answer(req: ReturnType<typeof setup>["req"], token: string, value: string) {
  const job = await req("GET", "/v1/worker/next", undefined, token);
  expect(job.status).toBe(200);
  tick(MIN_ANSWER_MS + 100);
  const r = await req("POST", `/v1/tasks/${job.body.task_id}/respond`, { answer: value, confidence: 90 }, token);
  expect(r.status).toBe(200);
  return { job: job.body, r: r.body };
}

describe("Scrappy consensus", () => {
  test("3 humans answer independently, agent gets majority + agreement; extending with 2 more reaches the threshold", async () => {
    tick(0);
    const s = setup();
    const t = [await s.worker(0), await s.worker(1), await s.worker(2)];

    const created = await s.req("POST", "/v1/consensus", {
      task: "Which Telugu translation sounds more natural?", options: ["A", "B"], humans: 3, budget: 0.3, deadline: 20,
    });
    expect(created.status).toBe(201);
    expect(created.body.price_usdc).toBe(0.3);
    const id = created.body.task_id;
    expect(s.tasks.getTask(id)!.payment_tx).toStartWith("sig");

    const a = await answer(s.req, t[0], "B");
    expect(a.job.reward_usdc).toBe(0.08); // 80% of $0.10
    await answer(s.req, t[1], "B");
    await answer(s.req, t[2], "A");

    const res = await s.req("GET", `/v1/tasks/${id}`);
    expect(res.body).toMatchObject({ status: "low_confidence", answer: "B", agreement: 0.667, humans: 3 });
    expect(res.body.votes).toEqual([{ answer: "B", humans: 2 }, { answer: "A", humans: 1 }]);
    expect(JSON.stringify(res.body)).not.toContain(wallets[0]); // no worker identities

    // escalate: 2 more humans who did not take part
    const t2 = [await s.worker(3), await s.worker(4)];
    const ext = await s.req("POST", "/v1/consensus", { task: "ignored for extensions", extends: id, humans: 2, budget: 0.2, deadline: 20 });
    expect(ext.status).toBe(201);
    expect((await s.req("GET", "/v1/worker/next", undefined, t[0])).status).toBe(204); // original humans excluded
    await answer(s.req, t2[0], "B");
    await answer(s.req, t2[1], "B");
    const res2 = await s.req("GET", `/v1/tasks/${ext.body.task_id}`);
    expect(res2.body).toMatchObject({ status: "completed", answer: "B", agreement: 0.8, humans: 5, extends: id });

    const me = await s.req("GET", "/v1/worker/me", undefined, t[0]);
    expect(me.body.earnings.total_usdc).toBe(0.08);
    expect(me.body.tasks_done).toBe(1);
  });

  test("insufficient capacity is returned before the agent is asked to pay", async () => {
    tick(0);
    const s = setup();
    await s.worker(0);
    const r = await s.req("POST", "/v1/consensus", { task: "Is this Hindi natural?", humans: 3, language: "en" });
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ status: "insufficient_capacity", available: 1, required: 3 });
    expect(s.calls.n).toBe(0);
  });

  test("deadline passes with a seat unfilled: structured failure and a refund for the empty seat", async () => {
    tick(0);
    const s = setup();
    const a = await s.worker(0);
    await s.worker(1);
    const created = await s.req("POST", "/v1/consensus", { task: "Is this safe to send?", humans: 2, budget: 0.1, deadline: 10 });
    await answer(s.req, a, "yes");
    tick(11_000);
    const r = await s.req("GET", `/v1/tasks/${created.body.task_id}`);
    expect(r.body).toMatchObject({ status: "insufficient_capacity", responses_this_round: 1, refund_usdc: 0.05, answer: "yes" });
  });

  test("failed settlement cancels the task; no human ever sees it", async () => {
    tick(0);
    const s = setup(false);
    const w = await s.worker(0);
    const r = await s.req("POST", "/v1/tasks", { task: "Is this correct?", humans: 1 });
    expect(r.status).toBe(201);
    expect(s.tasks.getTask(r.body.task_id)!.status).toBe("cancelled");
    expect((await s.req("GET", "/v1/worker/next", undefined, w)).status).toBe(204);
  });

  test("answers faster than the floor and answers that don't fit the schema are rejected", async () => {
    tick(0);
    const s = setup();
    const w = await s.worker(0);
    await s.req("POST", "/v1/tasks", { task: "Rate this reply", response_schema: { type: "rating", scale: 5 } });
    const job = await s.req("GET", "/v1/worker/next", undefined, w);
    expect(job.body.response_schema).toEqual({ type: "rating", scale: 5 });
    expect((await s.req("POST", `/v1/tasks/${job.body.task_id}/respond`, { answer: "4" }, w)).status).toBe(429);
    tick(MIN_ANSWER_MS + 1);
    expect((await s.req("POST", `/v1/tasks/${job.body.task_id}/respond`, { answer: "9" }, w)).status).toBe(400);
    expect((await s.req("POST", `/v1/tasks/${job.body.task_id}/respond`, { answer: "4" }, w)).status).toBe(200);
  });
});

describe("workers: auth, quality, privacy", () => {
  test("worker endpoints need the device token; a wallet cannot be re-registered by someone else", async () => {
    tick(0);
    const s = setup();
    await s.worker(0);
    expect((await s.req("GET", "/v1/worker/next")).status).toBe(401);
    expect((await s.req("GET", "/v1/worker/me", undefined, "kw_forged")).status).toBe(401);
    const again = await s.req("POST", "/v1/workers", { wallet: wallets[0], languages: ["en"] });
    expect(again.status).toBe(409);
    const lb = await s.req("GET", "/v1/leaderboard");
    expect(JSON.stringify(lb.body)).not.toContain("id");
  });

  test("wallet sign-in: valid signature issues a new token, a replayed signature is refused", async () => {
    tick(0);
    const s = setup();
    const kp = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
    const wallet = base58.encode(new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey)));
    await s.req("POST", "/v1/workers", { wallet, languages: ["hi"] });
    const nonce = "abcdefghijklmnop1234";
    const issued = new Date().toISOString();
    const sig = base58.encode(new Uint8Array(await crypto.subtle.sign("Ed25519", kp.privateKey, new TextEncoder().encode(signInMessage(wallet, nonce, issued)))));
    const ok = await s.req("POST", "/v1/workers/session", { wallet, nonce, issued_at: issued, signature: sig });
    expect(ok.status).toBe(200);
    expect(ok.body.worker_token).toStartWith("kw_");
    expect((await s.req("GET", "/v1/worker/me", undefined, ok.body.worker_token)).body.languages).toEqual(["hi"]);
    expect((await s.req("POST", "/v1/workers/session", { wallet, nonce, issued_at: issued, signature: sig })).status).toBe(401);
  });

  test("new workers get unpaid qualification tasks first; gold answers build skill-specific accuracy", async () => {
    tick(0);
    const s = setup();
    for (let i = 0; i < 3; i++) s.tasks.addGold({ task: `Gold ${i}: is 2+2=4?`, schema: { type: "binary" }, language: "te", skill: "general", answer: "yes" });
    const w = await s.worker(0, ["te"]);
    for (let i = 0; i < 3; i++) {
      const { job, r } = await answer(s.req, w, "yes");
      expect(job.qualification).toBe(true);
      expect(r).toMatchObject({ earned_usdc: 0, correct: true });
    }
    const me = await s.req("GET", "/v1/worker/me", undefined, w);
    expect(me.body.skills[0]).toMatchObject({ skill: "te:general", samples: 3, accuracy: 0.8 });
    expect(me.body.accuracy).toBe(1);
  });

  test("expert tasks (>= 95% accuracy) never reach unproven workers", async () => {
    tick(0);
    const s = setup();
    await s.worker(0);
    const r = await s.req("POST", "/v1/tasks", { task: "Security review", min_accuracy: 0.95, skill: "security" });
    expect(r.status).toBe(409);
  });

  test("levels: Lv5 unlocks better-paid seats, Lv20 sees new tasks first", async () => {
    tick(0);
    const s = setup();
    const low = await s.worker(0);
    const pro = await s.worker(1);
    s.db.query("UPDATE workers SET tasks_done = 20 WHERE wallet = ?").run(wallets[1]); // Lv5

    const rich = await s.req("POST", "/v1/tasks", { task: "Long code review", humans: 1, budget: 0.5 });
    expect(rich.status).toBe(201);
    expect((await s.req("GET", "/v1/worker/next", undefined, low)).status).toBe(204);
    expect((await s.req("GET", "/v1/worker/next", undefined, pro)).status).toBe(200);

    const vip = await s.worker(2);
    s.db.query("UPDATE workers SET tasks_done = 95 WHERE wallet = ?").run(wallets[2]); // Lv20
    await s.req("POST", "/v1/tasks", { task: "Urgent cheap", humans: 1, budget: 0.05, deadline: 20 });
    await s.req("POST", "/v1/tasks", { task: "Better paid", humans: 1, budget: 0.2, deadline: 60 });
    const jLow = await s.req("GET", "/v1/worker/next", undefined, low);
    expect(jLow.body.prompt).toBe("Urgent cheap"); // most urgent first
    const jVip = await s.req("GET", "/v1/worker/next", undefined, vip);
    expect(jVip.body.prompt).toBe("Better paid"); // first pick goes to the best seat

    const me = await s.req("GET", "/v1/worker/me", undefined, pro);
    expect(me.body).toMatchObject({ level: 5, next_level_at: 25 });
    expect(me.body.unlocks).toMatchObject({ better_pay: true, expert_tasks: false, first_pick: false });
  });
});

describe("developers: API keys, balance, deposits", () => {
  test("API key tasks debit the prepaid balance and refund unfilled seats to it", async () => {
    tick(0);
    const s = setup();
    const p = await s.req("POST", "/v1/projects", { name: "Acme AI", funding_wallet: wallets[7] });
    const key = p.body.api_key;
    await s.worker(0);
    const broke = await s.req("POST", "/v1/tasks", { task: "Is this a refund case?", budget: 0.1 }, key);
    expect(broke.status).toBe(402);

    s.db.query("UPDATE projects SET balance_micro = 1000000").run();
    const t = await s.req("POST", "/v1/tasks", { task: "Is this a refund case?", budget: 0.1, deadline: 10 }, key);
    expect(t.status).toBe(201);
    expect(s.calls.n).toBe(0); // no x402 on the API-key path
    expect((await s.req("GET", "/v1/project", undefined, key)).body.balance_usdc).toBe(0.9);
    expect((await s.req("GET", `/v1/tasks/${t.body.task_id}`)).status).toBe(404); // project tasks need the key
    tick(11_000);
    expect((await s.req("GET", `/v1/tasks/${t.body.task_id}`, undefined, key)).body.status).toBe("insufficient_capacity");
    expect((await s.req("GET", "/v1/project", undefined, key)).body.balance_usdc).toBe(1);
  });

  test("deposits are verified from the chain and credited once", async () => {
    const db = openDb(":memory:");
    const PLATFORM = "P1atform1111111111111111111111111111111111";
    const FUNDER = wallets[7];
    const mint = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
    const bal = (owner: string, amount: number) => ({ owner, mint, uiTokenAmount: { amount: String(amount) } });
    const rpc = async () => ({ meta: { err: null, preTokenBalances: [bal(FUNDER, 5e6), bal(PLATFORM, 0)], postTokenBalances: [bal(FUNDER, 3e6), bal(PLATFORM, 2e6)] } });
    const { projectId } = createAuth(db).createProject("Acme", FUNDER);
    const sig = "5".repeat(88);
    expect(await verifyDeposit(db, rpc, { id: projectId, funding_wallet: FUNDER }, sig, PLATFORM)).toEqual({ ok: true, amount_micro: 2_000_000 });
    expect((await verifyDeposit(db, rpc, { id: projectId, funding_wallet: FUNDER }, sig, PLATFORM)).ok).toBe(false);
    expect((db.query("SELECT balance_micro FROM projects").get() as any).balance_micro).toBe(2_000_000);
  });
});

describe("pet", () => {
  /** Keep "jobs live" over multi-day ticks without touching capacity checks. */
  const liveTask = (db: ReturnType<typeof openDb>, deadlineMs = 600_000) => {
    const id = crypto.randomUUID();
    db.query(
      `INSERT INTO tasks (id, root_id, billing, prompt, response_schema, language, skill, min_accuracy, humans_required,
         reward_micro, budget_micro, consensus_threshold, deadline_at, status, created_at)
       VALUES (?, ?, 'none', 'keepalive', '{"type":"binary"}', 'en', 'general', 0.5, 15, 50000, 50000, 0.8, ?, 'matching', ?)`,
    ).run(id, id, Date.now() + deadlineMs, Date.now());
  };

  test("answers earn food, feeding drops hunger, starvation kills, revive costs $0.05", async () => {
    tick(0);
    const s = setup();
    const t = await s.worker(0);
    const t2 = await s.worker(1);

    const task = await s.req("POST", "/v1/consensus", { task: "Is this image a cat?", options: ["yes", "no"], humans: 1, budget: 0.1, deadline: 600 });
    expect(task.status).toBe(201);

    await answer(s.req, t, "yes"); // +1 meal
    let me = await s.req("GET", "/v1/worker/me", undefined, t);
    expect(me.body.pet).toMatchObject({ food: 1, hunger: 0, starving: false, dead: false });
    expect((await s.req("POST", "/v1/worker/feed", {}, t)).status).toBe(409); // not hungry

    tick(16 * 3_600_000);
    liveTask(s.db);
    me = await s.req("GET", "/v1/worker/me", undefined, t);
    expect(me.body.pet.hunger).toBe(20); // +10 per 8h while jobs are live

    const fed = await s.req("POST", "/v1/worker/feed", {}, t);
    expect(fed.body.pet).toMatchObject({ food: 0, hunger: 0, starving: false });
    expect((await s.req("POST", "/v1/worker/feed", {}, t)).body.error).toContain("no food"); // food spent

    tick(80 * 3_600_000);
    liveTask(s.db);
    me = await s.req("GET", "/v1/worker/me", undefined, t);
    await s.req("GET", "/v1/worker/me", undefined, t2); // t2 starves on the same schedule
    expect(me.body.pet).toMatchObject({ starving: true, dead: false });

    tick(72 * 3_600_000 + 60_000);
    liveTask(s.db);
    const nx = await s.req("GET", "/v1/worker/next", undefined, t);
    expect(nx.status).toBe(403);
    expect(nx.body.error).toBe("pet_dead");
    expect((await s.req("POST", "/v1/worker/feed", {}, t)).body.error).toBe("pet_dead");

    // earned $0.08 -> revive pays $0.05 from owed, recorded as a payment
    const rv = await s.req("POST", "/v1/worker/revive", {}, t);
    expect(rv.status).toBe(200);
    expect(rv.body.pet).toMatchObject({ dead: false, hunger: 60 });
    expect((s.db.query("SELECT kind, amount_micro FROM payments WHERE kind = 'revive'").get() as any)).toMatchObject({ amount_micro: 50_000 });
    expect((await s.req("GET", "/v1/worker/me", undefined, t)).body.earnings.owed_usdc).toBeCloseTo(0.03);

    // t2 is dead too but never earned -> 402 with the pay-to address
    tick(1);
    liveTask(s.db);
    await s.req("GET", "/v1/worker/me", undefined, t2);
    const broke = await s.req("POST", "/v1/worker/revive", {}, t2);
    expect(broke.status).toBe(402);
    expect(broke.body.pay_to).toStartWith("P1atform");
  });
});

describe("pure pieces", () => {
  test("consensus math", () => {
    const v = (answer: string, weight = 0.9, confidence = 80) => ({ answer, weight, confidence });
    expect(computeConsensus([v("vulnerable"), v("vulnerable"), v("vulnerable")], { type: "binary" })).toMatchObject({ answer: "vulnerable", agreement: 1, confidence: 0.8 });
    expect(computeConsensus([v("B"), v("B"), v("A")], { type: "choice", options: ["A", "B"] }).agreement).toBe(0.667);
    expect(computeConsensus([], { type: "binary" }).answer).toBeNull();
    expect(computeConsensus([v("2"), v("4"), v("4")], { type: "rating", scale: 5 }).mean).toBe(3.333);
  });

  test("answers are normalized to the schema", () => {
    expect(normalizeAnswer({ type: "binary" }, " YES ")).toBe("yes");
    expect(normalizeAnswer({ type: "choice", options: ["Natural", "Unnatural"] }, "natural")).toBe("Natural");
    expect(normalizeAnswer({ type: "choice", options: ["A", "B"] }, "C")).toBeNull();
  });

  test("webhooks cannot target private networks", () => {
    expect(safeWebhookUrl("https://hooks.acme.ai/scrappy")).toBe(true);
    for (const u of ["http://acme.ai", "https://localhost/x", "https://127.0.0.1", "https://10.0.0.5", "https://192.168.1.1"]) expect(safeWebhookUrl(u)).toBe(false);
  });
});
