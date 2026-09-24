import { describe, expect, test } from "bun:test";
import { createApp } from "./app";
import { openStore, MIN_ANSWER_MS, GOLD_WARMUP } from "./store";

const passThrough = async (_c: unknown, next: () => Promise<void>) => next();
const W1 = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";

function setup() {
  process.env.ADMIN_TOKEN = "test-admin";
  const store = openStore(":memory:");
  const app = createApp(store, passThrough as never);
  const req = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
    app.request(path, { method, headers: { "content-type": "application/json", ...headers }, body: body ? JSON.stringify(body) : undefined });
  return { store, req };
}

describe("quality layer", () => {
  test("gold answers build the capability graph", async () => {
    const { req, store } = setup();
    for (let i = 0; i < 3; i++) {
      const r = await req("POST", "/v1/admin/gold", { task: `Is ${i}+1 = ${i + 1}?`, options: ["Yes", "No"], language: "en", domain: "math", answer: "Yes" }, { "x-admin-token": "test-admin" });
      expect(r.status).toBe(200);
    }
    const w = await (await req("POST", "/v1/workers", { wallet: W1, languages: ["en"] })).json();
    const now = Date.now();
    for (let i = 0; i < 3; i++) {
      const job = store.nextJobFor(store.getWorker(w.worker_id)!, now + i * 10_000)!;
      expect(job.is_gold).toBe(1);
      const r = store.answer(job.id, w.worker_id, i < 2 ? "Yes" : "No", 90, 0.8, now + i * 10_000 + MIN_ANSWER_MS + 1);
      expect(r.ok).toBe(true);
    }
    const info = await (await req("GET", `/v1/workers/${w.worker_id}`)).json();
    const math = info.skills.find((s: { key: string }) => s.key === "en:math");
    expect(math.samples).toBe(3);
    expect(math.accuracy).toBeCloseTo(3 / 5); // (2 correct + 1) / (3 + 2)
    expect(info.payout_held).toBe(true);
  });

  test("gold is never served twice to the same worker", async () => {
    const { req, store } = setup();
    await req("POST", "/v1/admin/gold", { task: "Only gold", options: ["A", "B"], language: "en", answer: "A" }, { "x-admin-token": "test-admin" });
    const w = await (await req("POST", "/v1/workers", { wallet: W1, languages: ["en"] })).json();
    const t = Date.now();
    const g = store.nextJobFor(store.getWorker(w.worker_id)!, t)!;
    store.answer(g.id, w.worker_id, "A", 90, 0.8, t + MIN_ANSWER_MS + 1);
    expect(store.nextJobFor(store.getWorker(w.worker_id)!, t + 10_000)).toBeNull();
  });

  test("unproven workers never get jobs that demand high accuracy", async () => {
    const { req, store } = setup();
    const w = await (await req("POST", "/v1/workers", { wallet: W1, languages: ["en"] })).json();
    store.createJob({ task: "Hard one", content: null, options: null, language: "en", max_latency_ms: 60_000, min_accuracy: 0.95, price_usdc: 0.05, payment_tx: null });
    expect(store.nextJobFor(store.getWorker(w.worker_id)!)).toBeNull();
    store.createJob({ task: "Easy one", content: null, options: null, language: "en", max_latency_ms: 60_000, min_accuracy: 0.7, price_usdc: 0.05, payment_tx: null });
    expect(store.nextJobFor(store.getWorker(w.worker_id)!)?.task).toBe("Easy one");
  });

  test("answers faster than the floor are rejected", async () => {
    const { req, store } = setup();
    const w = await (await req("POST", "/v1/workers", { wallet: W1, languages: ["en"] })).json();
    store.createJob({ task: "Read me", content: null, options: null, language: "en", max_latency_ms: 60_000, min_accuracy: 0.5, price_usdc: 0.05, payment_tx: null });
    const t = Date.now();
    const job = store.nextJobFor(store.getWorker(w.worker_id)!, t)!;
    const r = store.answer(job.id, w.worker_id, "ok", 50, 0.8, t + 100);
    expect(r.ok).toBe(false);
  });

  test("admin gold route needs the token; stats count only real answers", async () => {
    const { req } = setup();
    expect((await req("POST", "/v1/admin/gold", { task: "x?", language: "en", answer: "y" })).status).toBe(403);
    const s = await (await req("GET", "/v1/stats")).json();
    expect(s.human_answers).toBe(0);
    expect(GOLD_WARMUP).toBeGreaterThan(0);
  });
});
