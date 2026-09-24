import { Hono, type MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import type { Store } from "./store";

export const VERIFY_PRICE_USDC = 0.05;
export const WORKER_SHARE = 0.8;

const verifyBody = z.object({
  task: z.string().min(3).max(500),
  content: z.string().max(4000).optional(),
  options: z.array(z.string().max(500)).min(2).max(6).optional(),
  requirements: z
    .object({
      language: z.string().min(2).max(5).default("en"),
      domain: z.string().min(2).max(40).default("general"),
      max_latency: z.number().int().min(5).max(600).default(60), // seconds
      min_accuracy: z.number().min(0).max(1).default(0.8),
    })
    .prefault({}),
});

const goldBody = z.object({
  task: z.string().min(3).max(500),
  content: z.string().max(4000).optional(),
  options: z.array(z.string().max(500)).min(2).max(6).optional(),
  language: z.string().min(2).max(5),
  domain: z.string().min(2).max(40).default("general"),
  answer: z.string().min(1).max(500),
});

const answerBody = z.object({
  worker_id: z.string().uuid(),
  answer: z.string().min(1).max(2000),
  confidence: z.number().min(0).max(100),
});

const workerBody = z.object({
  wallet: z.string().min(32).max(44),
  languages: z.array(z.string().min(2).max(5)).min(1).max(40),
  pet_name: z.string().min(1).max(20).optional(),
  species: z.string().min(2).max(12).optional(),
  city: z.string().max(40).optional(),
});

function publicResult(job: NonNullable<ReturnType<Store["getJob"]>>) {
  const answered = job.status === "answered";
  return {
    job_id: job.id,
    status: job.status,
    ...(answered && {
      answer: job.answer,
      confidence: (job.confidence ?? 0) / 100,
      human_id: job.assigned_to,
      latency_ms: (job.answered_at ?? 0) - job.created_at,
    }),
  };
}

/**
 * The Human API. `paywall` guards the paid endpoint (x402 in production).
 * Tests pass a pass-through paywall; production always wires the real x402 middleware.
 */
export function createApp(store: Store, paywall: MiddlewareHandler) {
  const app = new Hono();
  app.use("*", cors({ origin: (process.env.WEB_ORIGINS ?? "http://localhost:3000").split(","), exposeHeaders: ["x-payment-response"] }));

  app.get("/health", (c) => c.json({ ok: true }));

  // ---- agents ----
  app.post("/v1/human/verify", paywall, async (c) => {
    const parsed = verifyBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const b = parsed.data;
    const job = store.createJob({
      task: b.task,
      content: b.content ?? null,
      options: b.options ?? null,
      language: b.requirements.language,
      domain: b.requirements.domain,
      max_latency_ms: b.requirements.max_latency * 1000,
      min_accuracy: b.requirements.min_accuracy,
      price_usdc: VERIFY_PRICE_USDC,
      payment_tx: c.res.headers.get("x-payment-response") ?? null,
    });

    // wait for a human, up to the agent's latency budget (capped at 30 s per request)
    const deadline = Date.now() + Math.min(job.max_latency_ms, 30_000);
    while (Date.now() < deadline) {
      const cur = store.getJob(job.id)!;
      if (cur.status === "answered") return c.json(publicResult(cur));
      await Bun.sleep(250);
    }
    return c.json({ ...publicResult(store.getJob(job.id)!), poll: `/v1/jobs/${job.id}` }, 202);
  });

  app.get("/v1/jobs/:id", (c) => {
    const job = store.getJob(c.req.param("id"));
    return job && !job.is_gold ? c.json(publicResult(job)) : c.json({ error: "not found" }, 404);
  });

  // ---- admin: gold tasks (hidden known-answer checks) ----
  app.post("/v1/admin/gold", async (c) => {
    const token = process.env.ADMIN_TOKEN;
    if (!token || c.req.header("x-admin-token") !== token) return c.json({ error: "forbidden" }, 403);
    const parsed = goldBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const g = parsed.data;
    const job = store.createJob({
      task: g.task, content: g.content ?? null, options: g.options ?? null, language: g.language, domain: g.domain,
      max_latency_ms: 3_600_000, min_accuracy: 0, price_usdc: VERIFY_PRICE_USDC, payment_tx: null, gold_answer: g.answer,
    });
    return c.json({ gold_id: job.id });
  });

  // ---- workers ----
  app.post("/v1/workers", async (c) => {
    const parsed = workerBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const { wallet, languages, ...profile } = parsed.data;
    const w = store.createWorker(wallet, languages, profile);
    return c.json({ worker_id: w.id, jobs_done: w.jobs_done, owed_usdc: w.owed_usdc });
  });

  app.get("/v1/workers/:id", (c) => {
    const w = store.getWorker(c.req.param("id"));
    if (!w) return c.json({ error: "not found" }, 404);
    return c.json({
      worker_id: w.id,
      languages: w.languages,
      jobs_done: w.jobs_done,
      owed_usdc: w.owed_usdc,
      payout_held: store.payoutHeld(w),
      skills: store.skillsOf(w.id),
    });
  });

  app.get("/v1/workers/:id/next", (c) => {
    const w = store.getWorker(c.req.param("id"));
    if (!w) return c.json({ error: "worker not found" }, 404);
    const job = store.nextJobFor(w);
    if (!job) return c.body(null, 204);
    return c.json({
      job_id: job.id,
      task: job.task,
      content: job.content,
      options: job.options,
      language: job.language,
      domain: job.domain,
      pays_usdc: Math.round(job.price_usdc * WORKER_SHARE * 1e6) / 1e6,
      answer_within_ms: 60_000,
    });
  });

  app.post("/v1/jobs/:id/answer", async (c) => {
    const parsed = answerBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const r = store.answer(c.req.param("id"), parsed.data.worker_id, parsed.data.answer, parsed.data.confidence, WORKER_SHARE);
    return r.ok ? c.json(r) : c.json({ error: r.error }, 409);
  });

  // ---- public network data ----
  app.get("/v1/leaderboard", (c) => c.json({ entries: store.leaderboard(50, c.req.query("city") || undefined) }));
  app.get("/v1/stats", (c) => c.json(store.stats()));

  return app;
}
