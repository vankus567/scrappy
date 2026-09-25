import { z } from "zod";
import { type Db, toMicro, toUsdc, uid } from "./db";

// ---- policy constants ----
export const WORKER_SHARE = 0.8; // workers get 80% of each human slot; 20% runs the network
export const MIN_REWARD_USDC = 0.01;
export const MAX_REWARD_USDC = 5;
export const AVAILABLE_MS = 45_000; // a worker polled within this window counts as online
export const ASSIGN_MS = 60_000; // a claimed task must be answered within this window
export const MIN_ANSWER_MS = 2_000; // anti-farming latency floor
export const PENDING_PAYMENT_MS = 120_000;
export const GOLD_WARMUP = 5; // qualification tasks before paid work (when gold exists for the language)
export const EXPERT_ACCURACY = 0.95;
const PROBATION_MAX_ACCURACY = 0.8; // unproven workers only see tasks asking <= 80%
const PROVEN_SAMPLES = 3;

// ---- worker levels: progress that unlocks better work (POSITIONING item 9) ----
export const TASKS_PER_LEVEL = 5; // Lv N needs (N-1)*5 tasks done
export const HIGH_REWARD_LEVEL = 5; // Lv5 sees better-paid tasks
export const HIGH_REWARD_MICRO = 250_000; // a seat paying >= $0.25 counts as better-paid
export const EXPERT_LEVEL = 10; // Lv10 sees expert tasks
export const PRIORITY_LEVEL = 20; // Lv20 gets first pick: their queue sorts by pay, not urgency

/** Work level from real answers only: Lv1 at 0-4 tasks, Lv5 at 20, Lv10 at 45, Lv20 at 95, Lv30 at 145. */
export const levelOf = (tasksDone: number) => Math.min(30, 1 + Math.floor(tasksDone / TASKS_PER_LEVEL));
export const nextLevelAt = (level: number) => (level >= 30 ? null : level * TASKS_PER_LEVEL);

/** Laplace-smoothed accuracy so one lucky answer is not "100%". */
export const smoothAccuracy = (correct: number, seen: number) => (correct + 1) / (seen + 2);

// ---- task primitive ----
export const responseSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("binary") }),
  z.object({ type: z.literal("choice"), options: z.array(z.string().trim().min(1).max(300)).min(2).max(8) }),
  z.object({ type: z.literal("rating"), scale: z.number().int().min(3).max(10).default(5) }),
  z.object({ type: z.literal("text"), max_length: z.number().int().min(1).max(2000).default(280) }),
]);
export type ResponseSchema = z.infer<typeof responseSchema>;

export const taskInput = z
  .object({
    task: z.string().trim().min(3).max(500),
    content: z.string().max(8000).optional(),
    options: z.array(z.string().trim().min(1).max(300)).min(2).max(8).optional(),
    response_schema: responseSchema.optional(),
    humans: z.number().int().min(1).max(15).default(1),
    budget: z.number().positive().max(75).optional(),
    deadline: z.number().int().min(10).max(600).default(60),
    language: z.string().trim().toLowerCase().min(2).max(5).default("en"),
    skill: z.string().trim().toLowerCase().regex(/^[a-z0-9_-]{2,40}$/).default("general"),
    min_accuracy: z.number().min(0).max(1).default(0.8),
    quality_threshold: z.number().min(0.5).max(1).default(0.8),
    webhook_url: z.string().url().max(500).optional(),
    extends: z.string().uuid().optional(),
  })
  .transform((b, ctx) => {
    const schema: ResponseSchema = b.response_schema ?? (b.options ? { type: "choice", options: b.options } : { type: "binary" });
    const perHuman = b.budget !== undefined ? b.budget / b.humans : 0.05;
    if (perHuman < MIN_REWARD_USDC || perHuman > MAX_REWARD_USDC) {
      ctx.addIssue({ code: "custom", path: ["budget"], message: `budget per human must be between $${MIN_REWARD_USDC} and $${MAX_REWARD_USDC}` });
      return z.NEVER;
    }
    if (b.webhook_url && !safeWebhookUrl(b.webhook_url)) {
      ctx.addIssue({ code: "custom", path: ["webhook_url"], message: "webhook_url must be a public https URL" });
      return z.NEVER;
    }
    const reward_micro = Math.floor(toMicro(perHuman));
    return { ...b, schema, reward_micro, price_micro: reward_micro * b.humans };
  });
export type TaskInput = z.output<typeof taskInput>;

/** Blocks webhooks to localhost / private ranges (SSRF). */
export function safeWebhookUrl(raw: string) {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return false;
    const h = u.hostname.toLowerCase();
    if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || h === "[::1]") return false;
    if (/^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h)) return false;
    if (/^\[?(fc|fd|fe80)/.test(h)) return false;
    return true;
  } catch {
    return false;
  }
}

export type TaskStatus =
  | "pending_payment" | "matching" | "collecting"
  | "completed" | "low_confidence" | "insufficient_capacity" | "cancelled" | "template";

const FINAL: TaskStatus[] = ["completed", "low_confidence", "insufficient_capacity", "cancelled"];
const TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  pending_payment: ["matching", "cancelled"],
  matching: ["collecting", "insufficient_capacity", "cancelled"],
  collecting: ["completed", "low_confidence", "insufficient_capacity"],
  completed: [], low_confidence: [], insufficient_capacity: [], cancelled: [], template: [],
};
export const isFinal = (s: TaskStatus) => FINAL.includes(s);
export function assertTransition(from: TaskStatus, to: TaskStatus) {
  if (!TRANSITIONS[from].includes(to)) throw new Error(`invalid task transition ${from} -> ${to}`);
}

export type TaskRow = {
  id: string; root_id: string; parent_id: string | null; project_id: string | null; payer: string | null;
  billing: "x402" | "balance" | "none"; prompt: string; content: string | null; response_schema: string;
  language: string; skill: string; min_accuracy: number; humans_required: number; reward_micro: number; budget_micro: number;
  consensus_threshold: number; deadline_at: number; status: TaskStatus; payment_tx: string | null; webhook_url: string | null;
  refund_micro: number; refund_tx: string | null; is_gold: number; gold_answer: string | null; created_at: number; completed_at: number | null;
};

export type WorkerRow = {
  id: string; wallet: string; token_hash: string; languages: string; pet_name: string | null; species: string | null; city: string | null;
  created_at: number; last_seen_at: number | null; tasks_done: number; earned_micro: number; owed_micro: number; pending_micro: number; push_subscription: string | null;
};

type Skill = { skill: string; accuracy: number; samples: number };

/** Normalizes a worker's answer against the task's response schema. Returns null when it doesn't fit. */
export function normalizeAnswer(schema: ResponseSchema, raw: string): string | null {
  const a = raw.trim();
  if (!a) return null;
  switch (schema.type) {
    case "binary": {
      const v = a.toLowerCase();
      return v === "yes" || v === "no" ? v : null;
    }
    case "choice":
      return schema.options.find((o) => o === a) ?? schema.options.find((o) => o.toLowerCase() === a.toLowerCase()) ?? null;
    case "rating": {
      const n = Number(a);
      return Number.isInteger(n) && n >= 1 && n <= schema.scale ? String(n) : null;
    }
    case "text":
      return a.length <= schema.max_length ? a.replace(/\s+/g, " ") : null;
  }
}

export type Vote = { answer: string; confidence: number; weight: number };

/**
 * Consensus over independent human votes.
 * answer = most votes (ties broken by summed worker accuracy);
 * agreement = share of humans who gave that answer;
 * confidence = accuracy-weighted share of the answer x mean self-reported confidence of those who gave it.
 */
export function computeConsensus(votes: Vote[], schema: ResponseSchema) {
  if (!votes.length) return { answer: null, agreement: 0, confidence: 0, tally: [] as { answer: string; humans: number }[], mean: null as number | null };
  const key = (a: string) => (schema.type === "text" ? a.toLowerCase() : a);
  const groups = new Map<string, { answer: string; n: number; w: number; conf: number }>();
  for (const v of votes) {
    const g = groups.get(key(v.answer)) ?? { answer: v.answer, n: 0, w: 0, conf: 0 };
    g.n += 1;
    g.w += v.weight;
    g.conf += v.confidence;
    groups.set(key(v.answer), g);
  }
  const ranked = [...groups.values()].sort((a, b) => b.n - a.n || b.w - a.w);
  const top = ranked[0];
  const totalW = votes.reduce((s, v) => s + v.weight, 0) || 1;
  const agreement = top.n / votes.length;
  const confidence = (top.w / totalW) * (top.conf / top.n / 100);
  const mean = schema.type === "rating" ? votes.reduce((s, v) => s + Number(v.answer), 0) / votes.length : null;
  return {
    answer: top.answer,
    agreement: round(agreement),
    confidence: round(confidence),
    tally: ranked.map((g) => ({ answer: g.answer, humans: g.n })),
    mean: mean === null ? null : round(mean),
  };
}

const round = (n: number, d = 3) => Math.round(n * 10 ** d) / 10 ** d;
const parseLangs = (w: WorkerRow) => JSON.parse(w.languages) as string[];

export type Webhook = (task: TaskRow, payload: unknown) => void;

export function createTaskService(db: Db, opts: { onFinal?: Webhook; onNewTask?: (task: TaskRow) => void } = {}) {
  const getTask = (id: string) => db.query("SELECT * FROM tasks WHERE id = ?").get(id) as TaskRow | null;

  const setStatus = (t: TaskRow, to: TaskStatus, extra: Record<string, unknown> = {}) => {
    assertTransition(t.status, to);
    const cols = Object.keys(extra);
    db.query(`UPDATE tasks SET status = ?${cols.map((c) => `, ${c} = ?`).join("")} WHERE id = ? AND status = ?`).run(
      to, ...(Object.values(extra) as any[]), t.id, t.status,
    );
    t.status = to;
    Object.assign(t, extra);
  };

  const skillsOf = (workerId: string): Skill[] =>
    (db.query("SELECT skill, seen, correct FROM worker_skills WHERE worker_id = ?").all(workerId) as any[]).map((s) => ({
      skill: s.skill, accuracy: smoothAccuracy(s.correct, s.seen), samples: s.seen,
    }));

  const skillFor = (skills: Map<string, Skill>, language: string, skill: string) =>
    skills.get(`${language}:${skill}`) ?? skills.get(`${language}:general`);

  /** Can this worker take this task? Language, proven skill, probation, work level. */
  const eligible = (w: WorkerRow, skills: Map<string, Skill>, t: Pick<TaskRow, "language" | "skill" | "min_accuracy"> & { reward_micro?: number }) => {
    if (!parseLangs(w).includes(t.language)) return false;
    if (t.min_accuracy >= EXPERT_ACCURACY && levelOf(w.tasks_done) < EXPERT_LEVEL) return false;
    if (t.reward_micro !== undefined && t.reward_micro >= HIGH_REWARD_MICRO && levelOf(w.tasks_done) < HIGH_REWARD_LEVEL) return false;
    const s = skillFor(skills, t.language, t.skill);
    if (!s || s.samples < PROVEN_SAMPLES) return t.min_accuracy <= PROBATION_MAX_ACCURACY;
    return s.accuracy >= t.min_accuracy;
  };

  const record = (skillKey: string, workerId: string, kind: "gold" | "consensus", correct: boolean, taskId: string, now: number) => {
    db.query(
      `INSERT INTO worker_skills (worker_id, skill, seen, correct) VALUES (?, ?, 1, ?)
       ON CONFLICT(worker_id, skill) DO UPDATE SET seen = seen + 1, correct = correct + excluded.correct`,
    ).run(workerId, skillKey, correct ? 1 : 0);
    db.query("INSERT INTO reputation_events (id, worker_id, skill, kind, correct, task_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
      uid(), workerId, skillKey, kind, correct ? 1 : 0, taskId, now,
    );
  };

  const chainVotes = (rootId: string): (Vote & { task_id: string; worker_id: string; latency_ms: number })[] =>
    db.query("SELECT task_id, worker_id, answer, confidence, weight, latency_ms FROM task_responses WHERE root_id = ? ORDER BY created_at").all(rootId) as any[];

  const responsesFor = (taskId: string) =>
    (db.query("SELECT COUNT(*) AS n FROM task_responses WHERE task_id = ?").get(taskId) as any).n as number;

  /** Close a task: consensus over the whole chain, reputation, refunds for unfilled slots. Idempotent. */
  const finalize = (t: TaskRow, now: number) => {
    if (isFinal(t.status)) return;
    const schema = JSON.parse(t.response_schema) as ResponseSchema;
    const votes = chainVotes(t.root_id);
    const got = responsesFor(t.id);
    const c = computeConsensus(votes, schema);
    const latency = votes.length ? Math.max(...votes.filter((v) => v.task_id === t.id).map((v) => v.latency_ms), 0) : now - t.created_at;

    let status: TaskStatus;
    if (got < t.humans_required) status = "insufficient_capacity";
    else status = c.agreement >= t.consensus_threshold ? "completed" : "low_confidence";

    const refund = (t.humans_required - got) * t.reward_micro;
    db.transaction(() => {
      // matching -> insufficient_capacity is direct; every other close goes through collecting
      if (t.status === "matching" && status !== "insufficient_capacity") setStatus(t, "collecting");
      setStatus(t, status, { completed_at: now, refund_micro: refund });
      db.query(
        `INSERT OR REPLACE INTO consensus_results (task_id, answer, agreement, confidence, responses, votes, latency_ms, computed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(t.id, c.answer, c.agreement, c.confidence, votes.length, JSON.stringify(c.tally), latency, now);

      // unfilled slots on prepaid balance go straight back; x402 refunds are paid on-chain by the settlement worker
      if (refund > 0 && t.billing === "balance" && t.project_id) {
        db.query("UPDATE projects SET balance_micro = balance_micro + ? WHERE id = ?").run(refund, t.project_id);
      }

      // reputation: with 3+ independent humans, agreeing with the majority is evidence of skill
      if (votes.length >= 3 && c.answer !== null && !t.is_gold) {
        const key = (a: string) => (schema.type === "text" ? a.toLowerCase() : a);
        for (const v of votes.filter((v) => v.task_id === t.id)) {
          record(`${t.language}:${t.skill}`, v.worker_id, "consensus", key(v.answer) === key(c.answer), t.id, now);
        }
      }
    })();
    opts.onFinal?.(t, publicResult(t.id));
  };

  /** Expire stale claims, close tasks whose deadline passed, drop unpaid tasks. Cheap; run often. */
  const sweep = (now = Date.now()) => {
    db.query("UPDATE task_assignments SET status = 'expired' WHERE status = 'assigned' AND expires_at < ?").run(now);
    for (const t of db.query("SELECT * FROM tasks WHERE status IN ('matching', 'collecting') AND deadline_at <= ?").all(now) as TaskRow[]) {
      finalize(t, now);
    }
    for (const t of db.query("SELECT * FROM tasks WHERE status = 'pending_payment' AND created_at < ?").all(now - PENDING_PAYMENT_MS) as TaskRow[]) {
      setStatus(t, "cancelled", { completed_at: now });
    }
  };

  /** Workers online now who qualify for a task with these requirements. */
  const capacity = (req: { language: string; skill: string; min_accuracy: number; reward_micro?: number }, now = Date.now(), exclude: Set<string> = new Set()) => {
    const online = db.query("SELECT * FROM workers WHERE last_seen_at >= ?").all(now - AVAILABLE_MS) as WorkerRow[];
    const qualified = online.filter((w) => !exclude.has(w.id) && eligible(w, new Map(skillsOf(w.id).map((s) => [s.skill, s])), req));
    return { online: online.length, available: qualified.length };
  };

  /** Workers who already took part in a chain (they cannot be the "independent" extra human). */
  const chainWorkers = (rootId: string) =>
    new Set((db.query("SELECT worker_id FROM task_assignments WHERE root_id = ?").all(rootId) as any[]).map((r) => r.worker_id as string));

  const createTask = (
    input: TaskInput,
    billing: { mode: "x402" } | { mode: "balance"; projectId: string } | { mode: "none" },
    now = Date.now(),
  ): { ok: true; task: TaskRow } | { ok: false; status: number; error: string; detail?: unknown } => {
    let base = { prompt: input.task, content: input.content ?? null, schema: input.schema, language: input.language, skill: input.skill };
    let rootId: string | null = null;
    let parentId: string | null = null;

    if (input.extends) {
      const parent = getTask(input.extends);
      if (!parent || parent.is_gold) return { ok: false, status: 404, error: "task to extend not found" };
      if (!isFinal(parent.status) || parent.status === "cancelled") return { ok: false, status: 409, error: "a task can only be extended after it finishes" };
      if (parent.project_id && (billing.mode !== "balance" || billing.projectId !== parent.project_id)) {
        return { ok: false, status: 404, error: "task to extend not found" };
      }
      base = { prompt: parent.prompt, content: parent.content, schema: JSON.parse(parent.response_schema), language: parent.language, skill: parent.skill };
      rootId = parent.root_id;
      parentId = parent.id;
    }

    const cap = capacity({ language: base.language, skill: base.skill, min_accuracy: input.min_accuracy, reward_micro: input.reward_micro }, now, rootId ? chainWorkers(rootId) : new Set());
    if (cap.available < input.humans) {
      return {
        ok: false, status: 409, error: "insufficient_capacity",
        detail: { status: "insufficient_capacity", reason: "Not enough qualified humans are online for this task right now", available: cap.available, required: input.humans },
      };
    }

    const id = uid();
    const task: TaskRow = {
      id, root_id: rootId ?? id, parent_id: parentId, project_id: billing.mode === "balance" ? billing.projectId : null, payer: null,
      billing: billing.mode, prompt: base.prompt, content: base.content, response_schema: JSON.stringify(base.schema),
      language: base.language, skill: base.skill, min_accuracy: input.min_accuracy, humans_required: input.humans,
      reward_micro: input.reward_micro, budget_micro: input.price_micro, consensus_threshold: input.quality_threshold,
      deadline_at: now + input.deadline * 1000, status: billing.mode === "x402" ? "pending_payment" : "matching",
      payment_tx: null, webhook_url: input.webhook_url ?? null, refund_micro: 0, refund_tx: null, is_gold: 0, gold_answer: null,
      created_at: now, completed_at: null,
    };

    const ok = db.transaction(() => {
      if (billing.mode === "balance") {
        const r = db.query("UPDATE projects SET balance_micro = balance_micro - ? WHERE id = ? AND balance_micro >= ?").run(task.budget_micro, billing.projectId, task.budget_micro);
        if (r.changes === 0) return false;
      }
      db.query(
        `INSERT INTO tasks (id, root_id, parent_id, project_id, payer, billing, prompt, content, response_schema, language, skill, min_accuracy,
           humans_required, reward_micro, budget_micro, consensus_threshold, deadline_at, status, webhook_url, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(task.id, task.root_id, task.parent_id, task.project_id, task.payer, task.billing, task.prompt, task.content, task.response_schema,
        task.language, task.skill, task.min_accuracy, task.humans_required, task.reward_micro, task.budget_micro, task.consensus_threshold,
        task.deadline_at, task.status, task.webhook_url, task.created_at);
      return true;
    })();
    if (!ok) return { ok: false, status: 402, error: "insufficient_balance", detail: { required_usdc: toUsdc(task.budget_micro) } };
    if (task.status === "matching") opts.onNewTask?.(task);
    return { ok: true, task };
  };

  /** x402 settled: the task goes live. The deadline starts when the money lands. */
  const markFunded = (taskId: string, tx: string, payer: string | undefined, now = Date.now()) => {
    const t = getTask(taskId);
    if (!t || t.status !== "pending_payment") return;
    const shift = now - t.created_at;
    setStatus(t, "matching", { payment_tx: tx, payer: payer ?? null, deadline_at: t.deadline_at + shift });
    opts.onNewTask?.(t);
  };

  const cancelUnpaid = (taskId: string, now = Date.now()) => {
    const t = getTask(taskId);
    if (t?.status === "pending_payment") setStatus(t, "cancelled", { completed_at: now });
  };

  // ---- gold (hidden known-answer qualification tasks) ----
  const addGold = (g: { task: string; content?: string; schema: ResponseSchema; language: string; skill: string; answer: string }, now = Date.now()) => {
    const answer = normalizeAnswer(g.schema, g.answer);
    if (answer === null) throw new Error("gold answer does not fit the response schema");
    const id = uid();
    db.query(
      `INSERT INTO tasks (id, root_id, billing, prompt, content, response_schema, language, skill, min_accuracy, humans_required, reward_micro,
         budget_micro, consensus_threshold, deadline_at, status, is_gold, gold_answer, created_at)
       VALUES (?, ?, 'none', ?, ?, ?, ?, ?, 0, 1, 0, 0, 1, 0, 'template', 1, ?, ?)`,
    ).run(id, id, g.task, g.content ?? null, JSON.stringify(g.schema), g.language, g.skill, answer, now);
    return id;
  };

  const goldSeen = (workerId: string) =>
    (db.query("SELECT COUNT(DISTINCT task_id) AS n FROM reputation_events WHERE worker_id = ? AND kind = 'gold'").get(workerId) as any).n as number;

  const claim = (t: TaskRow, workerId: string, now: number) => {
    db.query("INSERT INTO task_assignments (id, task_id, root_id, worker_id, status, assigned_at, expires_at) VALUES (?, ?, ?, ?, 'assigned', ?, ?)").run(
      uid(), t.id, t.root_id, workerId, now, Math.min(now + ASSIGN_MS, t.deadline_at),
    );
    if (t.status === "matching") setStatus(t, "collecting");
  };

  /**
   * Router (pull). Marks the worker online. New workers get qualification tasks first; then the most urgent
   * live task in their languages that their proven skill and level qualify them for, one seat per human.
   */
  const nextFor = (w: WorkerRow, now = Date.now()): TaskRow | null => {
    db.query("UPDATE workers SET last_seen_at = ? WHERE id = ?").run(now, w.id);
    sweep(now);
    const langs = parseLangs(w);
    if (!langs.length) return null;
    const marks = langs.map(() => "?").join(",");

    // an open claim comes back first (e.g. the app was reloaded)
    const open = db.query(
      "SELECT t.* FROM task_assignments a JOIN tasks t ON t.id = a.task_id WHERE a.worker_id = ? AND a.status = 'assigned' AND a.expires_at > ?",
    ).get(w.id, now) as TaskRow | null;
    if (open) return open;

    const skills = new Map(skillsOf(w.id).map((s) => [s.skill, s]));
    return db.transaction(() => {
      if (goldSeen(w.id) < GOLD_WARMUP) {
        const g = db.query(
          `SELECT * FROM tasks t WHERE is_gold = 1 AND status = 'template' AND language IN (${marks})
             AND NOT EXISTS (SELECT 1 FROM tasks c JOIN task_assignments a ON a.task_id = c.id WHERE c.parent_id = t.id AND a.worker_id = ?)
           ORDER BY created_at LIMIT 1`,
        ).get(...langs, w.id) as TaskRow | null;
        if (g) {
          const id = uid();
          const inst: TaskRow = { ...g, id, root_id: id, parent_id: g.id, status: "matching", deadline_at: now + ASSIGN_MS, created_at: now };
          db.query(
            `INSERT INTO tasks (id, root_id, parent_id, billing, prompt, content, response_schema, language, skill, min_accuracy, humans_required,
               reward_micro, budget_micro, consensus_threshold, deadline_at, status, is_gold, gold_answer, created_at)
             VALUES (?, ?, ?, 'none', ?, ?, ?, ?, ?, 0, 1, 0, 0, 1, ?, 'matching', 1, ?, ?)`,
          ).run(id, id, g.id, g.prompt, g.content, g.response_schema, g.language, g.skill, inst.deadline_at, g.gold_answer, now);
          claim(inst, w.id, now);
          return inst;
        }
      }
      const candidates = db.query(
        `SELECT t.* FROM tasks t
         WHERE t.is_gold = 0 AND t.status IN ('matching', 'collecting') AND t.deadline_at > ? AND t.language IN (${marks})
           AND NOT EXISTS (SELECT 1 FROM task_assignments a WHERE a.root_id = t.root_id AND a.worker_id = ?)
           AND (SELECT COUNT(*) FROM task_assignments a WHERE a.task_id = t.id AND a.status IN ('assigned', 'responded')) < t.humans_required
         ORDER BY CASE WHEN ? >= ? THEN t.reward_micro ELSE -t.deadline_at END DESC LIMIT 50`,
      ).all(now + MIN_ANSWER_MS + 1_000, ...langs, w.id, levelOf(w.tasks_done), PRIORITY_LEVEL) as TaskRow[];
      const t = candidates.find((c) => eligible(w, skills, c));
      if (!t) return null;
      claim(t, w.id, now);
      return t;
    })();
  };

  /** Qualification checks waiting for a new worker (0 once warm-up is done or none exist in their languages). */
  const qualificationFor = (w: WorkerRow) => {
    const langs = parseLangs(w);
    const left = GOLD_WARMUP - goldSeen(w.id);
    if (!langs.length || left <= 0) return 0;
    const n = (db.query(
      `SELECT COUNT(*) AS n FROM tasks t WHERE is_gold = 1 AND status = 'template' AND language IN (${langs.map(() => "?").join(",")})
         AND NOT EXISTS (SELECT 1 FROM tasks c JOIN task_assignments a ON a.task_id = c.id WHERE c.parent_id = t.id AND a.worker_id = ?)`,
    ).get(...langs, w.id) as any).n as number;
    return Math.min(n, left);
  };

  /** Tasks this worker could take right now (count only; nothing is claimed). */
  const availableFor = (w: WorkerRow, now = Date.now()) => {
    const langs = parseLangs(w);
    if (!langs.length) return 0;
    const skills = new Map(skillsOf(w.id).map((s) => [s.skill, s]));
    const rows = db.query(
      `SELECT t.* FROM tasks t WHERE t.is_gold = 0 AND t.status IN ('matching', 'collecting') AND t.deadline_at > ? AND t.language IN (${langs.map(() => "?").join(",")})
         AND NOT EXISTS (SELECT 1 FROM task_assignments a WHERE a.root_id = t.root_id AND a.worker_id = ?)
         AND (SELECT COUNT(*) FROM task_assignments a WHERE a.task_id = t.id AND a.status IN ('assigned', 'responded')) < t.humans_required`,
    ).all(now, ...langs, w.id) as TaskRow[];
    return rows.filter((t) => eligible(w, skills, t)).length;
  };

  /** A worker answers a task they claimed. */
  const respond = (taskId: string, w: WorkerRow, rawAnswer: string, confidence: number, now = Date.now()) => {
    return db.transaction(() => {
      const t = getTask(taskId);
      if (!t) return { ok: false as const, status: 404, error: "task not found" };
      const a = db.query("SELECT * FROM task_assignments WHERE task_id = ? AND worker_id = ?").get(taskId, w.id) as any;
      if (!a || a.status === "responded") return { ok: false as const, status: 409, error: a ? "already answered" : "this task is not assigned to you" };
      if (a.status === "expired" || now > a.expires_at || isFinal(t.status)) {
        db.query("UPDATE task_assignments SET status = 'expired' WHERE id = ?").run(a.id);
        return { ok: false as const, status: 410, error: "time ran out for this task" };
      }
      if (now - a.assigned_at < MIN_ANSWER_MS) return { ok: false as const, status: 429, error: "too fast: read the task before answering" };

      const schema = JSON.parse(t.response_schema) as ResponseSchema;
      const answer = normalizeAnswer(schema, rawAnswer);
      if (answer === null) return { ok: false as const, status: 400, error: "answer does not fit this task" };

      const skills = new Map(skillsOf(w.id).map((s) => [s.skill, s]));
      const weight = skillFor(skills, t.language, t.skill)?.accuracy ?? 0.5;
      const paid = t.is_gold ? 0 : Math.floor(t.reward_micro * WORKER_SHARE);

      db.query(
        `INSERT INTO task_responses (id, task_id, root_id, worker_id, answer, confidence, weight, latency_ms, paid_micro, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(uid(), t.id, t.root_id, w.id, answer, Math.round(confidence), weight, now - a.assigned_at, paid, now);
      db.query("UPDATE task_assignments SET status = 'responded' WHERE id = ?").run(a.id);
      db.query("UPDATE workers SET tasks_done = tasks_done + 1, earned_micro = earned_micro + ?, owed_micro = owed_micro + ? WHERE id = ?").run(paid, paid, w.id);

      let correct: boolean | null = null;
      if (t.is_gold) {
        correct = answer.toLowerCase() === String(t.gold_answer).toLowerCase();
        record(`${t.language}:${t.skill}`, w.id, "gold", correct, t.id, now);
        if (t.skill !== "general") record(`${t.language}:general`, w.id, "gold", correct, t.id, now);
      }
      if (responsesFor(t.id) >= t.humans_required) finalize(t, now);
      return { ok: true as const, earned_usdc: toUsdc(paid), qualification: !!t.is_gold, ...(correct !== null && { correct }) };
    })();
  };

  /** What an agent (or anyone holding the task id) sees. Never exposes worker identities. */
  const publicResult = (taskId: string) => {
    const t = getTask(taskId);
    if (!t || t.is_gold) return null;
    const c = db.query("SELECT * FROM consensus_results WHERE task_id = ?").get(taskId) as any;
    const got = responsesFor(t.id);
    const chain = t.root_id !== t.id ? (db.query("SELECT COUNT(*) AS n FROM task_responses WHERE root_id = ?").get(t.root_id) as any).n : got;
    const done = isFinal(t.status);
    return {
      task_id: t.id,
      status: t.status,
      ...(done && c && {
        answer: c.answer,
        agreement: c.agreement,
        confidence: c.confidence,
        votes: JSON.parse(c.votes),
        latency_ms: c.latency_ms,
      }),
      humans: chain,
      humans_requested: t.humans_required,
      responses_this_round: got,
      ...(t.parent_id && { extends: t.parent_id }),
      ...(t.status === "insufficient_capacity" && { reason: "Not enough qualified humans answered before the deadline" }),
      price_usdc: toUsdc(t.budget_micro),
      refund_usdc: toUsdc(t.refund_micro),
      payment_tx: t.payment_tx,
      refund_tx: t.refund_tx,
      deadline_at: new Date(t.deadline_at).toISOString(),
      created_at: new Date(t.created_at).toISOString(),
    };
  };

  /** What a worker sees for a task they hold. */
  const workerView = (t: TaskRow, w: WorkerRow) => {
    const a = db.query("SELECT expires_at FROM task_assignments WHERE task_id = ? AND worker_id = ?").get(t.id, w.id) as any;
    const schema = JSON.parse(t.response_schema) as ResponseSchema;
    return {
      task_id: t.id,
      prompt: t.prompt,
      content: t.content,
      response_schema: schema,
      language: t.language,
      skill: t.skill,
      reward_usdc: t.is_gold ? 0 : toUsdc(Math.floor(t.reward_micro * WORKER_SHARE)),
      qualification: !!t.is_gold,
      estimated_seconds: schema.type === "text" ? 45 : t.content && t.content.length > 400 ? 30 : 10,
      expires_at: new Date(a?.expires_at ?? t.deadline_at).toISOString(),
    };
  };

  return { getTask, createTask, markFunded, cancelUnpaid, sweep, capacity, nextFor, availableFor, qualificationFor, respond, publicResult, workerView, addGold, skillsOf, finalize };
}

export type TaskService = ReturnType<typeof createTaskService>;
