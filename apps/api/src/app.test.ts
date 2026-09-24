import { describe, expect, test } from "bun:test";
import { createApp, WORKER_SHARE, VERIFY_PRICE_USDC } from "./app";
import { openStore } from "./store";

// The paywall is x402 in production; here it passes through so we can test routing and answers.
const passThrough = async (_c: unknown, next: () => Promise<void>) => next();

function setup() {
  const store = openStore(":memory:");
  const app = createApp(store, passThrough as never);
  const req = (method: string, path: string, body?: unknown) =>
    app.request(path, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return { store, req };
}

const WALLET_A = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
const WALLET_B = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";

describe("Human API", () => {
  test("agent asks, matching human answers, agent gets answer with confidence", async () => {
    const { req } = setup();
    const w = await (await req("POST", "/v1/workers", { wallet: WALLET_A, languages: ["hi", "en"] })).json();

    const pending = req("POST", "/v1/human/verify", {
      task: "Does this Hindi reply sound natural?",
      content: "आपका ऑर्डर कल तक पहुँच जाएगा।",
      options: ["Natural", "Unnatural"],
      requirements: { language: "hi", max_latency: 10 },
    });

    // the worker polls, gets the job, answers
    let next: Response | null = null;
    for (let i = 0; i < 20; i++) {
      next = await req("GET", `/v1/workers/${w.worker_id}/next`);
      if (next.status === 200) break;
      await Bun.sleep(50);
    }
    expect(next!.status).toBe(200);
    const job = await next!.json();
    expect(job.language).toBe("hi");
    expect(job.pays_usdc).toBeCloseTo(VERIFY_PRICE_USDC * WORKER_SHARE);

    const ans = await req("POST", `/v1/jobs/${job.job_id}/answer`, { worker_id: w.worker_id, answer: "Natural", confidence: 92 });
    expect(ans.status).toBe(200);

    const res = await pending;
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.answer).toBe("Natural");
    expect(body.confidence).toBeCloseTo(0.92);
    expect(body.human_id).toBe(w.worker_id);

    const after = await (await req("GET", `/v1/workers/${w.worker_id}`)).json();
    expect(after.jobs_done).toBe(1);
    expect(after.owed_usdc).toBeCloseTo(VERIFY_PRICE_USDC * WORKER_SHARE);
  });

  test("router never hands a job to a worker without the language", async () => {
    const { req, store } = setup();
    const w = await (await req("POST", "/v1/workers", { wallet: WALLET_B, languages: ["ta"] })).json();
    store.createJob({ task: "Check this", content: null, options: null, language: "hi", max_latency_ms: 60_000, min_accuracy: 0.9, price_usdc: 0.05, payment_tx: null });
    const next = await req("GET", `/v1/workers/${w.worker_id}/next`);
    expect(next.status).toBe(204);
  });

  test("only the assigned worker can answer", async () => {
    const { req, store } = setup();
    const a = await (await req("POST", "/v1/workers", { wallet: WALLET_A, languages: ["en"] })).json();
    const b = await (await req("POST", "/v1/workers", { wallet: WALLET_B, languages: ["en"] })).json();
    store.createJob({ task: "Which is correct?", content: null, options: ["A", "B"], language: "en", max_latency_ms: 60_000, min_accuracy: 0.9, price_usdc: 0.05, payment_tx: null });
    const job = await (await req("GET", `/v1/workers/${a.worker_id}/next`)).json();
    const stolen = await req("POST", `/v1/jobs/${job.job_id}/answer`, { worker_id: b.worker_id, answer: "B", confidence: 99 });
    expect(stolen.status).toBe(409);
  });

  test("bad input is rejected", async () => {
    const { req } = setup();
    expect((await req("POST", "/v1/human/verify", { task: "x" })).status).toBe(400);
    expect((await req("POST", "/v1/workers", { wallet: "short", languages: [] })).status).toBe(400);
  });
});
