import { Hono, type Context, type MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import { decodePaymentResponseHeader } from "@x402/core/http";
import { z } from "zod";
import { type Auth, bearer, rateLimit, SOLANA_ADDRESS } from "./auth";
import { type Db, toUsdc, uid } from "./db";
import { type Rpc, verifyDeposit, verifyRevive, type WorkerPush } from "./payments";
import { checkProof, createProofStore, type ProofStore, proofSubmit } from "./proofs";
import { createBattleService, MAX_STAKE } from "./battles";
import { GAMES } from "./games";
import { EXPERT_LEVEL, feedPet, HIGH_REWARD_LEVEL, isFinal, levelOf, nextLevelAt, petView, PRIORITY_LEVEL, responseSchema, REVIVE_MICRO, type TaskInput, taskInput, type TaskService, type TaskStatus, tickPet, WORKER_SHARE } from "./tasks";

type Billing = { mode: "x402" } | { mode: "balance"; projectId: string };
type Env = { Variables: { input: TaskInput; billing: Billing; taskId?: string } };

export type AppDeps = {
  db: Db;
  tasks: TaskService;
  auth: Auth;
  /** x402 payment middleware in production; tests inject a stand-in. */
  paywall: MiddlewareHandler;
  rpc?: Rpc;
  platformWallet?: string;
  network?: string;
  pushPublicKey?: string;
  /** Web push to one worker (battle turns). */
  workerPush?: WorkerPush;
  /** Where proof photos live; defaults to PROOF_DIR on disk. */
  proofs?: ProofStore;
};

const lang = z.string().trim().toLowerCase().min(2).max(5);
const workerBody = z.object({
  wallet: z.string().regex(SOLANA_ADDRESS),
  languages: z.array(lang).min(1).max(40),
  pet_name: z.string().trim().min(1).max(20).optional(),
  species: z.string().trim().regex(/^[a-z]{2,12}$/).optional(),
  city: z.string().trim().max(40).optional(),
});
const profilePatch = workerBody.omit({ wallet: true }).partial();
const signInBody = z.object({ wallet: z.string().regex(SOLANA_ADDRESS), nonce: z.string(), issued_at: z.string(), signature: z.string().max(120) });
const respondBody = z.object({ answer: z.string().min(1).max(2000), confidence: z.number().min(0).max(100).default(80), proof: proofSubmit.optional() });
const positionQuery = z.object({ lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180) });
const pushBody = z.object({ endpoint: z.string().url().max(1000), keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }) });
const projectBody = z.object({ name: z.string().trim().min(2).max(60), funding_wallet: z.string().regex(SOLANA_ADDRESS).optional() });
const goldBody = z.object({
  task: z.string().min(3).max(500),
  content: z.string().max(4000).optional(),
  response_schema: responseSchema,
  language: lang,
  skill: z.string().regex(/^[a-z0-9_-]{2,40}$/).default("general"),
  answer: z.string().min(1).max(300),
});

const DAY = 86_400_000;
const bad = (c: Context, err: z.ZodError) => c.json({ error: "invalid_request", issues: z.flattenError(err).fieldErrors }, 400);
const body = async (c: Context) => c.req.json().catch(() => null);

export function createApp(deps: AppDeps) {
  const { db, tasks, auth } = deps;
  const proofs = deps.proofs ?? createProofStore(db);
  const battles = createBattleService(db, deps.workerPush);
  const app = new Hono<Env>();

  app.use("*", cors({
    origin: (process.env.WEB_ORIGINS ?? "http://localhost:3000").split(","),
    allowHeaders: ["content-type", "authorization", "payment-signature", "x-payment", "x-admin-token"],
    exposeHeaders: ["payment-response", "payment-required", "x-payment-response"],
  }));
  app.onError((err, c) => {
    console.error(err);
    return c.json({ error: "internal_error" }, 500);
  });

  app.get("/health", (c) => c.json({ ok: true }));
  app.get("/v1/config", (c) =>
    c.json({ network: deps.network ?? null, platform_wallet: deps.platformWallet ?? null, push_public_key: deps.pushPublicKey ?? null, worker_share: WORKER_SHARE }),
  );

  // ================= agents: paid human tasks =================

  /** Validate, pick billing (API key balance or x402), check capacity before anyone is asked to pay. */
  const billing: MiddlewareHandler<Env> = async (c, next) => {
    const parsed = taskInput.safeParse(await body(c));
    if (!parsed.success) return bad(c, parsed.error);
    c.set("input", parsed.data);

    const key = bearer(c.req.header("authorization"));
    if (key) {
      const project = auth.projectForKey(key);
      if (!project) return c.json({ error: "invalid_api_key" }, 401);
      c.set("billing", { mode: "balance", projectId: project.id });
      return next();
    }

    c.set("billing", { mode: "x402" });
    const i = parsed.data;
    if (!i.extends) {
      const cap = tasks.capacity({ language: i.language, skill: i.skill, min_accuracy: i.min_accuracy, reward_micro: i.reward_micro });
      if (cap.available < i.humans) {
        return c.json({ status: "insufficient_capacity", reason: "Not enough qualified humans are online for this task right now", available: cap.available, required: i.humans }, 409);
      }
    }
    // x402: the handler runs inside the paywall; settlement happens after it returns
    const challenge = await deps.paywall(c, next);
    if (challenge) return challenge; // 402 payment required / payment error: handler never ran
    const taskId = c.get("taskId");
    if (!taskId) return;
    const header = c.res.headers.get("payment-response");
    const settle = header ? safeDecode(header) : null;
    if (c.res.status < 300 && settle?.success && settle.transaction) tasks.markFunded(taskId, settle.transaction, settle.payer);
    else tasks.cancelUnpaid(taskId);
  };

  const create = (c: Context<Env>) => {
    const r = tasks.createTask(c.get("input"), c.get("billing"));
    if (!r.ok) return c.json(r.detail ?? { error: r.error }, r.status as 400);
    c.set("taskId", r.task.id);
    return c.json(
      {
        task_id: r.task.id,
        status: r.task.status === "pending_payment" ? "matching" : r.task.status,
        humans_requested: r.task.humans_required,
        price_usdc: toUsdc(r.task.budget_micro),
        deadline_at: new Date(r.task.deadline_at).toISOString(),
        poll: `/v1/tasks/${r.task.id}?wait=20`,
      },
      201,
    );
  };

  const paidLimit = rateLimit("paid", 120);
  app.post("/v1/tasks", paidLimit, billing, create);
  app.post("/v1/consensus", paidLimit, billing, create);

  /** Result. `?wait=N` long-polls up to N (<=25) seconds for the task to finish. */
  app.get("/v1/tasks/:id", rateLimit("read", 600), async (c) => {
    const id = c.req.param("id");
    const t = tasks.getTask(id);
    if (!t || t.is_gold) return c.json({ error: "not found" }, 404);
    if (t.project_id) {
      const p = auth.projectForKey(bearer(c.req.header("authorization")));
      if (p?.id !== t.project_id) return c.json({ error: "not found" }, 404);
    }
    const until = Date.now() + Math.min(Math.max(Number(c.req.query("wait") ?? 0), 0), 25) * 1000;
    for (;;) {
      tasks.sweep();
      const cur = tasks.getTask(id)!;
      if (isFinal(cur.status as TaskStatus) || Date.now() >= until) return c.json(tasks.publicResult(id));
      await Bun.sleep(250);
    }
  });

  /** The agent tells the humans what it did with their answer ("Ordered from the shop that has it in stock"). */
  app.post("/v1/tasks/:id/outcome", rateLimit("outcome", 60), async (c) => {
    const p = auth.projectForKey(bearer(c.req.header("authorization")));
    if (!p) return c.json({ error: "invalid_api_key" }, 401);
    const q = z.object({ outcome: z.string().trim().min(3).max(280) }).safeParse(await body(c));
    if (!q.success) return bad(c, q.error);
    return tasks.setOutcome(c.req.param("id"), p.id, q.data.outcome) ? c.json({ ok: true }) : c.json({ error: "not found" }, 404);
  });

  /** Free: how many qualified humans are online right now. */
  app.get("/v1/capacity", rateLimit("read", 600), (c) => {
    const q = z.object({ language: lang.default("en"), skill: z.string().default("general"), min_accuracy: z.coerce.number().min(0).max(1).default(0.8) }).safeParse(c.req.query());
    if (!q.success) return bad(c, q.error);
    return c.json(tasks.capacity(q.data));
  });

  // ================= workers =================

  const worker = (c: Context) => auth.workerForToken(bearer(c.req.header("authorization")));

  app.post("/v1/workers", rateLimit("signup", 10), async (c) => {
    const p = workerBody.safeParse(await body(c));
    if (!p.success) return bad(c, p.error);
    const { wallet, languages, ...profile } = p.data;
    const r = auth.registerWorker(wallet, languages, profile);
    if (!r.ok) return c.json({ error: "wallet_registered", message: r.error }, 409);
    return c.json({ worker_token: r.token, tasks_done: 0 }, 201);
  });

  app.post("/v1/workers/session", rateLimit("signin", 20), async (c) => {
    const p = signInBody.safeParse(await body(c));
    if (!p.success) return bad(c, p.error);
    const r = await auth.signIn(p.data.wallet, p.data.nonce, p.data.issued_at, p.data.signature);
    if (!r.ok) return c.json({ error: r.error }, 401);
    const w = r.worker;
    return c.json({ worker_token: r.token, profile: { pet_name: w.pet_name, species: w.species, city: w.city, languages: JSON.parse(w.languages) } });
  });

  app.get("/v1/worker/me", (c) => {
    const w = worker(c);
    if (!w) return c.json({ error: "unauthorized" }, 401);
    const now = Date.now();
    tickPet(db, w, now);
    const tz = Number(c.req.query("tz_offset") ?? 0) * 60_000; // client's getTimezoneOffset(), minutes
    const dayStart = Math.floor((now - tz) / DAY) * DAY + tz;
    const sum = (since: number) =>
      (db.query("SELECT COALESCE(SUM(paid_micro), 0) AS s FROM task_responses WHERE worker_id = ? AND created_at >= ?").get(w.id, since) as any).s;
    const rep = db.query("SELECT COUNT(*) AS n, COALESCE(SUM(correct), 0) AS k FROM reputation_events WHERE worker_id = ?").get(w.id) as any;
    const lat = db.query("SELECT AVG(latency_ms) AS a FROM task_responses WHERE worker_id = ?").get(w.id) as any;
    const paid = db.query("SELECT COALESCE(SUM(amount_micro), 0) AS s FROM payments WHERE kind = 'payout' AND worker_id = ?").get(w.id) as any;
    return c.json({
      wallet: w.wallet,
      pet_name: w.pet_name,
      species: w.species,
      city: w.city,
      languages: JSON.parse(w.languages),
      tasks_done: w.tasks_done,
      accuracy: rep.n >= 3 ? rep.k / rep.n : null,
      checks: rep.n,
      avg_response_ms: lat.a === null ? null : Math.round(lat.a),
      skills: tasks.skillsOf(w.id).filter((s) => s.samples > 0).sort((a, b) => b.samples - a.samples),
      level: levelOf(w.tasks_done),
      next_level_at: nextLevelAt(levelOf(w.tasks_done)),
      unlocks: {
        better_pay: levelOf(w.tasks_done) >= HIGH_REWARD_LEVEL,
        expert_tasks: levelOf(w.tasks_done) >= EXPERT_LEVEL,
        first_pick: levelOf(w.tasks_done) >= PRIORITY_LEVEL,
      },
      earnings: { today_usdc: toUsdc(sum(dayStart)), week_usdc: toUsdc(sum(now - 7 * DAY)), total_usdc: toUsdc(w.earned_micro), owed_usdc: toUsdc(w.owed_micro), paid_usdc: toUsdc(paid.s) },
      payout_hold_until: new Date(w.created_at + 48 * 3_600_000).toISOString(),
      payout_held: now < w.created_at + 48 * 3_600_000,
      available_tasks: tasks.availableFor(w, now),
      qualification_checks: tasks.qualificationFor(w),
      push: !!w.push_subscription,
      pet: petView(w),
    });
  });

  app.patch("/v1/worker/me", async (c) => {
    const w = worker(c);
    if (!w) return c.json({ error: "unauthorized" }, 401);
    const p = profilePatch.safeParse(await body(c));
    if (!p.success) return bad(c, p.error);
    const d = p.data;
    db.query("UPDATE workers SET languages = COALESCE(?, languages), pet_name = COALESCE(?, pet_name), species = COALESCE(?, species), city = COALESCE(?, city) WHERE id = ?").run(
      d.languages ? JSON.stringify(d.languages) : null, d.pet_name ?? null, d.species ?? null, d.city ?? null, w.id,
    );
    return c.json({ ok: true });
  });

  app.put("/v1/worker/push", async (c) => {
    const w = worker(c);
    if (!w) return c.json({ error: "unauthorized" }, 401);
    const p = pushBody.safeParse(await body(c));
    if (!p.success) return bad(c, p.error);
    db.query("UPDATE workers SET push_subscription = ? WHERE id = ?").run(JSON.stringify(p.data), w.id);
    return c.json({ ok: true });
  });

  app.get("/v1/worker/next", rateLimit("poll", 120), (c) => {
    const w = worker(c);
    if (!w) return c.json({ error: "unauthorized" }, 401);
    tickPet(db, w);
    if (w.pet_dead) return c.json({ error: "pet_dead", pet: petView(w) }, 403);
    // the app sends the phone's position (when the worker allows it) so tasks at nearby places find them
    const pos = positionQuery.safeParse(c.req.query());
    if (pos.success) tasks.setPosition(w, pos.data.lat, pos.data.lng);
    const t = tasks.nextFor(w);
    return t ? c.json(tasks.workerView(t, w)) : c.body(null, 204);
  });

  app.post("/v1/worker/feed", rateLimit("pet", 30), (c) => {
    const w = worker(c);
    if (!w) return c.json({ error: "unauthorized" }, 401);
    const r = feedPet(db, w);
    return r.ok ? c.json(r) : c.json({ error: r.error }, r.status as 409);
  });

  /**
   * Revive a dead Scrappy. Pays from earned owed_micro when it's enough; otherwise the worker
   * sends $0.05 USDC to the platform wallet and passes the signature for on-chain verification.
   */
  app.post("/v1/worker/revive", rateLimit("pet", 30), async (c) => {
    const w = worker(c);
    if (!w) return c.json({ error: "unauthorized" }, 401);
    const now = Date.now();
    tickPet(db, w, now);
    if (!w.pet_dead) return c.json({ error: "not_dead" }, 409);
    const b = (await body(c)) ?? {};
    const txSig = typeof b.tx_sig === "string" ? b.tx_sig : undefined;
    if (txSig) {
      if (!deps.rpc || !deps.platformWallet) return c.json({ error: "on-chain revive unavailable on this server" }, 503);
      const r = await verifyRevive(db, deps.rpc, w, txSig, deps.platformWallet, now);
      if (!r.ok) return c.json({ error: r.error }, 400);
      return c.json({ ok: true, pet: petView({ ...w, pet_dead: 0, pet_hunger: 60 }) });
    }
    if (w.owed_micro < REVIVE_MICRO) {
      return c.json({ error: "payment_required", price_usdc: toUsdc(REVIVE_MICRO), pay_to: deps.platformWallet }, 402);
    }
    db.transaction(() => {
      const r = db.query("UPDATE workers SET owed_micro = owed_micro - ? WHERE id = ? AND owed_micro >= ?").run(REVIVE_MICRO, w.id, REVIVE_MICRO);
      if (r.changes === 0) throw new Error("insufficient owed");
      db.query("INSERT INTO payments (id, kind, worker_id, wallet, amount_micro, tx_sig, created_at) VALUES (?, 'revive', ?, ?, ?, ?, ?)").run(
        uid(), w.id, w.wallet, REVIVE_MICRO, `revive:${w.id}:${now}`, now,
      );
      db.query("UPDATE workers SET pet_dead = 0, pet_hunger = 60, pet_hunger_at = ?, pet_starving_at = NULL WHERE id = ?").run(now, w.id);
    })();
    return c.json({ ok: true, pet: petView({ ...w, pet_dead: 0, pet_hunger: 60 }) });
  });

  app.post("/v1/tasks/:id/respond", rateLimit("respond", 60), async (c) => {
    const w = worker(c);
    if (!w) return c.json({ error: "unauthorized" }, 401);
    const p = respondBody.safeParse(await body(c));
    if (!p.success) return bad(c, p.error);
    const id = c.req.param("id");
    const t = tasks.getTask(id);
    const held = t && db.query("SELECT 1 FROM task_assignments WHERE task_id = ? AND worker_id = ? AND status = 'assigned'").get(id, w.id);
    if (!t || !held) {
      const r = tasks.respond(id, w, p.data.answer, p.data.confidence); // yields the precise 404/409/410
      return r.ok ? c.json(r) : c.json({ error: r.error }, r.status as 400);
    }
    // proof is checked before the answer counts, so nobody is paid for a task they did not do
    const { req, place } = tasks.proofReqFor(t);
    const chk = checkProof(req, place, p.data.proof);
    if (!chk.ok) return c.json({ error: "proof_rejected", message: chk.error }, 422);
    const hasProof = !!chk.proof.photo || chk.proof.lat !== null;
    const proofId = hasProof ? await proofs.save(t.id, w.id, chk.proof) : null;
    const r = tasks.respond(id, w, p.data.answer, p.data.confidence);
    if (!r.ok) {
      if (proofId) await proofs.remove(proofId);
      return c.json({ error: r.error }, r.status as 400);
    }
    return c.json({ ...r, ...(proofId && { proof_id: proofId, location_verified: chk.proof.location_verified, distance_m: chk.proof.distance_m }) });
  });

  /** A proof photo. Tasks paid from a project balance need that project's key; x402 tasks are reachable by the unguessable proof id. */
  app.get("/v1/proofs/:id/photo", rateLimit("read", 600), async (c) => {
    const row = proofs.get(c.req.param("id"));
    const t = row && tasks.getTask(row.task_id);
    if (!row || !t) return c.json({ error: "not found" }, 404);
    if (t.project_id && auth.projectForKey(bearer(c.req.header("authorization")))?.id !== t.project_id) return c.json({ error: "not found" }, 404);
    const f = proofs.photo(row);
    if (!f || !(await f.exists())) return c.json({ error: "not found" }, 404);
    return new Response(f, { headers: { "content-type": row.photo_mime ?? "image/jpeg", "cache-control": "private, max-age=86400", "x-sha256": row.photo_sha256 ?? "" } });
  });

  app.get("/v1/worker/history", (c) => {
    const w = worker(c);
    if (!w) return c.json({ error: "unauthorized" }, 401);
    const answers = db.query(
      `SELECT r.task_id, t.prompt, r.answer, r.paid_micro, r.created_at, t.status, t.is_gold, cr.answer AS consensus,
              x.agent_name, x.kind, COALESCE(o.outcome, x.outcome) AS outcome
       FROM task_responses r JOIN tasks t ON t.id = r.task_id LEFT JOIN consensus_results cr ON cr.task_id = r.task_id
       LEFT JOIN task_context x ON x.task_id = t.root_id LEFT JOIN task_context o ON o.task_id = t.id
       WHERE r.worker_id = ? ORDER BY r.created_at DESC LIMIT 50`,
    ).all(w.id) as any[];
    const payouts = db.query("SELECT amount_micro, tx_sig, created_at FROM payments WHERE kind = 'payout' AND worker_id = ? ORDER BY created_at DESC LIMIT 50").all(w.id) as any[];
    return c.json({
      answers: answers.map((a) => ({
        prompt: a.prompt, answer: a.answer, earned_usdc: toUsdc(a.paid_micro), at: new Date(a.created_at).toISOString(),
        qualification: !!a.is_gold, matched_consensus: a.consensus == null || a.is_gold ? null : a.consensus.toLowerCase() === a.answer.toLowerCase(),
        agent: a.agent_name ?? null, kind: a.kind ?? "judgment", outcome: a.outcome ?? null,
      })),
      payouts: payouts.map((p) => ({ amount_usdc: toUsdc(p.amount_micro), tx_sig: p.tx_sig, at: new Date(p.created_at).toISOString() })),
    });
  });

  // ================= developers =================

  const project = (c: Context) => auth.projectForKey(bearer(c.req.header("authorization")));

  app.post("/v1/projects", rateLimit("projects", 5), async (c) => {
    const p = projectBody.safeParse(await body(c));
    if (!p.success) return bad(c, p.error);
    const r = auth.createProject(p.data.name, p.data.funding_wallet ?? null);
    return c.json({ project_id: r.projectId, api_key: r.apiKey, webhook_secret: r.webhookSecret, note: "Store the API key and webhook secret now; they are shown once." }, 201);
  });

  app.get("/v1/project", (c) => {
    const p = project(c);
    if (!p) return c.json({ error: "unauthorized" }, 401);
    const now = Date.now();
    const agg = db.query(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS today,
         SUM(CASE WHEN status IN ('matching','collecting') THEN 1 ELSE 0 END) AS active,
         SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
         SUM(CASE WHEN status IN ('completed','low_confidence','insufficient_capacity') THEN 1 ELSE 0 END) AS finished,
         COALESCE(SUM(budget_micro - refund_micro), 0) AS spend
       FROM tasks WHERE project_id = ?`,
    ).get(now - DAY, p.id) as any;
    const q = db.query(
      "SELECT AVG(cr.latency_ms) AS lat, AVG(cr.agreement) AS agr FROM consensus_results cr JOIN tasks t ON t.id = cr.task_id WHERE t.project_id = ? AND cr.responses > 0",
    ).get(p.id) as any;
    return c.json({
      project: { id: p.id, name: p.name, funding_wallet: p.funding_wallet, created_at: new Date(p.created_at).toISOString() },
      balance_usdc: toUsdc(p.balance_micro),
      tasks: { total: agg.total, today: agg.today ?? 0, active: agg.active ?? 0, completed: agg.completed ?? 0 },
      avg_latency_ms: q.lat === null ? null : Math.round(q.lat),
      avg_agreement: q.agr,
      consensus_rate: agg.finished ? (agg.completed ?? 0) / agg.finished : null,
      human_spend_usdc: toUsdc(agg.spend),
    });
  });

  app.patch("/v1/project", async (c) => {
    const p = project(c);
    if (!p) return c.json({ error: "unauthorized" }, 401);
    const b = projectBody.partial().safeParse(await body(c));
    if (!b.success) return bad(c, b.error);
    db.query("UPDATE projects SET name = COALESCE(?, name), funding_wallet = COALESCE(?, funding_wallet) WHERE id = ?").run(b.data.name ?? null, b.data.funding_wallet ?? null, p.id);
    return c.json({ ok: true });
  });

  app.get("/v1/project/tasks", (c) => {
    const p = project(c);
    if (!p) return c.json({ error: "unauthorized" }, 401);
    const rows = db.query("SELECT id FROM tasks WHERE project_id = ? ORDER BY created_at DESC LIMIT 100").all(p.id) as { id: string }[];
    return c.json({ tasks: rows.map((r) => ({ ...tasks.publicResult(r.id), prompt: tasks.getTask(r.id)!.prompt })) });
  });

  app.get("/v1/project/keys", (c) => {
    const p = project(c);
    if (!p) return c.json({ error: "unauthorized" }, 401);
    const keys = db.query("SELECT id, prefix, label, created_at, last_used_at, revoked_at FROM api_keys WHERE project_id = ? ORDER BY created_at").all(p.id) as any[];
    return c.json({ keys: keys.map((k) => ({ ...k, current: k.id === p.key_id })) });
  });

  app.post("/v1/project/keys", async (c) => {
    const p = project(c);
    if (!p) return c.json({ error: "unauthorized" }, 401);
    const b = z.object({ label: z.string().trim().min(1).max(40).default("key") }).safeParse((await body(c)) ?? {});
    if (!b.success) return bad(c, b.error);
    const k = auth.createKey(p.id, b.data.label);
    return c.json({ id: k.id, api_key: k.apiKey }, 201);
  });

  app.delete("/v1/project/keys/:id", (c) => {
    const p = project(c);
    if (!p) return c.json({ error: "unauthorized" }, 401);
    if (c.req.param("id") === p.key_id) return c.json({ error: "you cannot revoke the key you are signed in with" }, 409);
    const r = db.query("UPDATE api_keys SET revoked_at = ? WHERE id = ? AND project_id = ? AND revoked_at IS NULL").run(Date.now(), c.req.param("id"), p.id);
    return r.changes ? c.json({ ok: true }) : c.json({ error: "not found" }, 404);
  });

  app.post("/v1/project/deposits", rateLimit("deposit", 20), async (c) => {
    const p = project(c);
    if (!p) return c.json({ error: "unauthorized" }, 401);
    if (!deps.rpc || !deps.platformWallet) return c.json({ error: "deposits are not configured" }, 503);
    const b = z.object({ tx_sig: z.string().max(100) }).safeParse(await body(c));
    if (!b.success) return bad(c, b.error);
    const r = await verifyDeposit(db, deps.rpc, p, b.data.tx_sig, deps.platformWallet);
    return r.ok ? c.json({ credited_usdc: toUsdc(r.amount_micro) }) : c.json({ error: r.error }, 400);
  });

  app.get("/v1/project/payments", (c) => {
    const p = project(c);
    if (!p) return c.json({ error: "unauthorized" }, 401);
    const deposits = db.query("SELECT amount_micro, tx_sig, created_at FROM payments WHERE kind = 'deposit' AND project_id = ? ORDER BY created_at DESC LIMIT 100").all(p.id) as any[];
    return c.json({ deposits: deposits.map((d) => ({ amount_usdc: toUsdc(d.amount_micro), tx_sig: d.tx_sig, at: new Date(d.created_at).toISOString() })) });
  });

  // ================= admin: gold tasks =================
  app.post("/v1/admin/gold", async (c) => {
    const token = process.env.ADMIN_TOKEN;
    if (!token || c.req.header("x-admin-token") !== token) return c.json({ error: "forbidden" }, 403);
    const p = goldBody.safeParse(await body(c));
    if (!p.success) return bad(c, p.error);
    try {
      return c.json({ gold_id: tasks.addGold({ ...p.data, schema: p.data.response_schema }) }, 201);
    } catch (e) {
      return c.json({ error: (e as Error).message }, 400);
    }
  });

  // ================= public network data =================
  // ================= battles =================

  const me = (c: Context) => {
    const w = worker(c);
    if (w) tickPet(db, w);
    return w;
  };
  const battleOut = (c: Context, r: { ok: true; battle: Parameters<typeof battles.view>[0] } | { ok: false; status: number; error: string }, w: { id: string }, code = 200) =>
    r.ok ? c.json(battles.view(r.battle, w.id), code as 200) : c.json({ error: r.error }, r.status as 409);

  /** Challenge a friend (share the link) with an optional food stake. */
  app.post("/v1/battles", rateLimit("battle", 30), async (c) => {
    const w = me(c);
    if (!w) return c.json({ error: "unauthorized" }, 401);
    const p = z.object({ stake_food: z.number().int().min(0).max(MAX_STAKE).default(0), game: z.enum(GAMES).default("duel") }).safeParse((await body(c)) ?? {});
    if (!p.success) return bad(c, p.error);
    return battleOut(c, battles.create(w, "friend", p.data.stake_food, p.data.game), w, 201);
  });

  /** Fight whoever is looking for a match right now, or wait for the next one. */
  app.post("/v1/battles/quick", rateLimit("battle", 30), async (c) => {
    const w = me(c);
    if (!w) return c.json({ error: "unauthorized" }, 401);
    const p = z.object({ game: z.enum(GAMES).default("duel") }).safeParse((await body(c)) ?? {});
    if (!p.success) return bad(c, p.error);
    return battleOut(c, battles.quick(w, p.data.game), w);
  });

  app.get("/v1/battles", (c) => {
    const w = me(c);
    if (!w) return c.json({ error: "unauthorized" }, 401);
    return c.json({ battles: battles.listFor(w), record: battles.record(w.id), food: w.pet_food });
  });

  app.get("/v1/battles/leaderboard", rateLimit("read", 600), (c) => {
    const city = c.req.query("city")?.trim();
    return c.json({ entries: battles.leaderboard(worker(c)?.id ?? null, city || undefined) });
  });

  /** Anyone with the link can see a battle (to accept it); moves stay hidden until each round closes. */
  app.get("/v1/battles/:id", rateLimit("read", 600), (c) => {
    const b = battles.get(c.req.param("id"));
    if (!b) return c.json({ error: "battle not found" }, 404);
    return c.json(battles.view(b, worker(c)?.id ?? null));
  });

  app.post("/v1/battles/:id/join", rateLimit("battle", 30), (c) => {
    const w = me(c);
    if (!w) return c.json({ error: "unauthorized" }, 401);
    return battleOut(c, battles.join(c.req.param("id"), w), w);
  });

  app.post("/v1/battles/:id/cancel", (c) => {
    const w = me(c);
    if (!w) return c.json({ error: "unauthorized" }, 401);
    const r = battles.cancel(c.req.param("id"), w);
    return r.ok ? c.json(r) : c.json({ error: r.error }, r.status as 409);
  });

  const roundBody = z.object({ round: z.number().int().min(1).max(5) });

  app.post("/v1/battles/:id/commit", rateLimit("move", 120), async (c) => {
    const w = me(c);
    if (!w) return c.json({ error: "unauthorized" }, 401);
    const p = roundBody.extend({ hash: z.string().trim().toLowerCase() }).safeParse(await body(c));
    if (!p.success) return bad(c, p.error);
    const r = battles.commit(c.req.param("id"), w, p.data.round, p.data.hash);
    if (!r.ok) return c.json({ error: r.error }, r.status as 409);
    return c.json(battles.view(battles.get(c.req.param("id"))!, w.id));
  });

  app.post("/v1/battles/:id/reveal", rateLimit("move", 120), async (c) => {
    const w = me(c);
    if (!w) return c.json({ error: "unauthorized" }, 401);
    const p = roundBody.extend({ move: z.string(), salt: z.string() }).safeParse(await body(c));
    if (!p.success) return bad(c, p.error);
    return battleOut(c, await battles.reveal(c.req.param("id"), w, p.data.round, p.data.move, p.data.salt), w);
  });

  app.get("/v1/stats", (c) => {
    const now = Date.now();
    const answers = db.query("SELECT COUNT(*) AS n FROM task_responses r JOIN tasks t ON t.id = r.task_id WHERE t.is_gold = 0").get() as any;
    const done = db.query(
      `SELECT COUNT(*) AS n, COALESCE(SUM(t.budget_micro - t.refund_micro), 0) AS spend FROM tasks t
       WHERE t.is_gold = 0 AND t.status IN ('completed','low_confidence','insufficient_capacity') AND (t.billing = 'balance' OR t.payment_tx IS NOT NULL)`,
    ).get() as any;
    const lats = (db.query("SELECT cr.latency_ms AS l FROM consensus_results cr JOIN tasks t ON t.id = cr.task_id WHERE t.is_gold = 0 AND cr.responses > 0 ORDER BY l").all() as any[]).map((r) => r.l);
    const agr = db.query("SELECT AVG(cr.agreement) AS a FROM consensus_results cr JOIN tasks t ON t.id = cr.task_id WHERE t.is_gold = 0 AND cr.responses >= 2").get() as any;
    const paidOut = db.query("SELECT COALESCE(SUM(amount_micro), 0) AS s FROM payments WHERE kind = 'payout'").get() as any;
    const workers = db.query("SELECT COUNT(*) AS n, SUM(CASE WHEN last_seen_at >= ? THEN 1 ELSE 0 END) AS online FROM workers").get(now - 45_000) as any;
    return c.json({
      human_answers: answers.n,
      tasks_finished: done.n,
      agent_spend_usdc: toUsdc(done.spend),
      paid_to_humans_usdc: toUsdc(paidOut.s),
      median_latency_ms: lats.length ? lats[Math.floor(lats.length / 2)] : null,
      avg_agreement: agr.a,
      workers: workers.n,
      workers_online: workers.online ?? 0,
    });
  });

  app.get("/v1/leaderboard", (c) => {
    const me = worker(c);
    const city = c.req.query("city")?.slice(0, 40);
    const rows = (city
      ? db.query("SELECT id, pet_name, species, city, tasks_done, earned_micro FROM workers WHERE city = ? AND tasks_done > 0 ORDER BY earned_micro DESC, tasks_done DESC LIMIT 50").all(city)
      : db.query("SELECT id, pet_name, species, city, tasks_done, earned_micro FROM workers WHERE tasks_done > 0 ORDER BY earned_micro DESC, tasks_done DESC LIMIT 50").all()) as any[];
    return c.json({
      entries: rows.map((r, i) => ({ rank: i + 1, pet_name: r.pet_name, species: r.species, city: r.city, tasks_done: r.tasks_done, earned_usdc: toUsdc(r.earned_micro), you: r.id === me?.id })),
    });
  });

  return app;
}

function safeDecode(h: string) {
  try {
    return decodePaymentResponseHeader(h);
  } catch {
    return null;
  }
}
