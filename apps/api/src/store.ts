import { Database } from "bun:sqlite";

export type JobStatus = "open" | "assigned" | "answered" | "expired";

export type Job = {
  id: string;
  task: string;
  content: string | null;
  options: string[] | null;
  language: string;
  domain: string;
  max_latency_ms: number;
  min_accuracy: number;
  price_usdc: number;
  status: JobStatus;
  created_at: number;
  assigned_to: string | null;
  assigned_at: number | null;
  answer: string | null;
  confidence: number | null;
  answered_at: number | null;
  payment_tx: string | null;
  is_gold: number;
  gold_answer: string | null;
  gold_of: string | null;
};

export type Worker = {
  id: string;
  wallet: string;
  languages: string[];
  pet_name: string | null;
  species: string | null;
  city: string | null;
  created_at: number;
  jobs_done: number;
  owed_usdc: number;
};

export type Skill = { key: string; accuracy: number; samples: number };

export const LOCK_MS = 60_000;
export const MIN_ANSWER_MS = 2_000; // anti-farming latency floor
export const PAYOUT_HOLD_MS = 48 * 3_600_000; // new accounts: payouts held 48 h
export const GOLD_WARMUP = 5; // first gold tasks for new workers
export const EXPERT_ACCURACY = 0.95;
export const EXPERT_MIN_JOBS = 50; // "level 10"
const PROBATION_MAX_ACCURACY = 0.8; // unproven workers only see jobs asking <= 80%

/** Laplace-smoothed accuracy so one lucky answer is not "100%". */
export const smoothAccuracy = (correct: number, seen: number) => (correct + 1) / (seen + 2);

/** SQLite store. Real persistence; swap for Postgres when deployed. */
export function openStore(path = process.env.SCRAPPY_DB ?? "scrappy.db") {
  const db = new Database(path, { create: true });
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS workers (
      id TEXT PRIMARY KEY, wallet TEXT NOT NULL UNIQUE, languages TEXT NOT NULL,
      pet_name TEXT, species TEXT, city TEXT,
      created_at INTEGER NOT NULL, jobs_done INTEGER NOT NULL DEFAULT 0, owed_usdc REAL NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY, task TEXT NOT NULL, content TEXT, options TEXT, language TEXT NOT NULL,
      domain TEXT NOT NULL DEFAULT 'general',
      max_latency_ms INTEGER NOT NULL, min_accuracy REAL NOT NULL, price_usdc REAL NOT NULL,
      status TEXT NOT NULL, created_at INTEGER NOT NULL,
      assigned_to TEXT, assigned_at INTEGER, answer TEXT, confidence REAL, answered_at INTEGER, payment_tx TEXT,
      is_gold INTEGER NOT NULL DEFAULT 0, gold_answer TEXT, gold_of TEXT
    );
    CREATE TABLE IF NOT EXISTS skills (
      worker_id TEXT NOT NULL, key TEXT NOT NULL, gold_seen INTEGER NOT NULL DEFAULT 0, gold_correct INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (worker_id, key)
    );
    CREATE TABLE IF NOT EXISTS payouts (
      id TEXT PRIMARY KEY, worker_id TEXT NOT NULL, wallet TEXT NOT NULL, amount_usdc REAL NOT NULL, tx_sig TEXT NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS jobs_open ON jobs(status, language, created_at);
  `);

  const rowToJob = (r: any): Job => ({ ...r, options: r.options ? JSON.parse(r.options) : null });
  const rowToWorker = (r: any): Worker => ({ ...r, languages: JSON.parse(r.languages) });

  const skillsOf = (workerId: string): Skill[] =>
    (db.query("SELECT key, gold_seen, gold_correct FROM skills WHERE worker_id = ?").all(workerId) as any[]).map((s) => ({
      key: s.key,
      accuracy: smoothAccuracy(s.gold_correct, s.gold_seen),
      samples: s.gold_seen,
    }));

  const goldSeen = (workerId: string) =>
    ((db.query("SELECT COALESCE(SUM(gold_seen), 0) AS n FROM skills WHERE worker_id = ?").get(workerId) as any).n as number);

  /** Can this worker take this job? Proven skill, probation, and expert level. */
  const eligible = (w: Worker, skills: Map<string, Skill>, job: any) => {
    if (job.is_gold) return true;
    if (job.min_accuracy >= EXPERT_ACCURACY && w.jobs_done < EXPERT_MIN_JOBS) return false;
    const s = skills.get(`${job.language}:${job.domain}`) ?? skills.get(`${job.language}:general`);
    if (!s || s.samples < 3) return job.min_accuracy <= PROBATION_MAX_ACCURACY;
    return s.accuracy >= job.min_accuracy;
  };

  return {
    db,

    createWorker(wallet: string, languages: string[], profile: { pet_name?: string; species?: string; city?: string } = {}): Worker {
      const existing: any = db.query("SELECT * FROM workers WHERE wallet = ?").get(wallet);
      if (existing) {
        db.query("UPDATE workers SET languages = ?, pet_name = COALESCE(?, pet_name), species = COALESCE(?, species), city = COALESCE(?, city) WHERE wallet = ?").run(
          JSON.stringify(languages), profile.pet_name ?? null, profile.species ?? null, profile.city ?? null, wallet,
        );
        return rowToWorker(db.query("SELECT * FROM workers WHERE wallet = ?").get(wallet));
      }
      const w: Worker = {
        id: crypto.randomUUID(), wallet, languages, pet_name: profile.pet_name ?? null, species: profile.species ?? null, city: profile.city ?? null,
        created_at: Date.now(), jobs_done: 0, owed_usdc: 0,
      };
      db.query("INSERT INTO workers (id, wallet, languages, pet_name, species, city, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
        w.id, wallet, JSON.stringify(languages), w.pet_name, w.species, w.city, w.created_at,
      );
      return w;
    },

    getWorker(id: string): Worker | null {
      const r = db.query("SELECT * FROM workers WHERE id = ?").get(id);
      return r ? rowToWorker(r) : null;
    },

    skillsOf,

    payoutHeld(w: Worker, now = Date.now()) {
      return now - w.created_at < PAYOUT_HOLD_MS;
    },

    createJob(j: Pick<Job, "task" | "content" | "options" | "language" | "max_latency_ms" | "min_accuracy" | "price_usdc" | "payment_tx"> & { domain?: string; gold_answer?: string | null; gold_of?: string | null }): Job {
      const job: Job = {
        ...j, domain: j.domain ?? "general", id: crypto.randomUUID(), status: "open", created_at: Date.now(),
        assigned_to: null, assigned_at: null, answer: null, confidence: null, answered_at: null,
        is_gold: j.gold_answer ? 1 : 0, gold_answer: j.gold_answer ?? null, gold_of: j.gold_of ?? null,
      };
      db.query(
        `INSERT INTO jobs (id, task, content, options, language, domain, max_latency_ms, min_accuracy, price_usdc, status, created_at, payment_tx, is_gold, gold_answer, gold_of)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?)`,
      ).run(job.id, job.task, job.content, job.options ? JSON.stringify(job.options) : null, job.language, job.domain, job.max_latency_ms, job.min_accuracy, job.price_usdc, job.created_at, job.payment_tx, job.is_gold, job.gold_answer, job.gold_of);
      return job;
    },

    getJob(id: string): Job | null {
      const r = db.query("SELECT * FROM jobs WHERE id = ?").get(id);
      return r ? rowToJob(r) : null;
    },

    /**
     * Router v1 (pull). New workers get gold tasks first; otherwise the oldest open job in the
     * worker's languages that their proven skill and level qualify them for. Locked atomically.
     */
    nextJobFor(worker: Worker, now = Date.now()): Job | null {
      const langs = worker.languages;
      if (!langs.length) return null;
      const marks = langs.map(() => "?").join(",");
      const skills = new Map(skillsOf(worker.id).map((s) => [s.key, s]));
      const warmup = goldSeen(worker.id) < GOLD_WARMUP;
      const seenGold = new Set(
        (db.query("SELECT gold_of FROM jobs WHERE is_gold = 1 AND gold_of IS NOT NULL AND assigned_to = ?").all(worker.id) as any[]).map((r) => r.gold_of),
      );

      const tx = db.transaction(() => {
        // gold tasks are reusable prompts: each worker answers each one once
        if (warmup) {
          const golds = db.query(`SELECT * FROM jobs WHERE is_gold = 1 AND gold_of IS NULL AND language IN (${marks}) ORDER BY created_at ASC`).all(...langs) as any[];
          const g = golds.find((r) => !seenGold.has(r.id));
          if (g) {
            const copy = this.createJob({ ...rowToJob(g), gold_answer: g.gold_answer, gold_of: g.id, payment_tx: null, max_latency_ms: 3_600_000 });
            db.query("UPDATE jobs SET status = 'assigned', assigned_to = ?, assigned_at = ? WHERE id = ?").run(worker.id, now, copy.id);
            return { ...copy, status: "assigned" as const, assigned_to: worker.id, assigned_at: now };
          }
        }
        const candidates = db
          .query(
            `SELECT * FROM jobs
             WHERE is_gold = 0 AND language IN (${marks})
               AND (status = 'open' OR (status = 'assigned' AND assigned_at < ? AND assigned_to != ?))
               AND created_at + max_latency_ms > ?
             ORDER BY created_at ASC LIMIT 25`,
          )
          .all(...langs, now - LOCK_MS, worker.id, now) as any[];
        const r = candidates.find((c) => eligible(worker, skills, c));
        if (!r) return null;
        db.query("UPDATE jobs SET status = 'assigned', assigned_to = ?, assigned_at = ? WHERE id = ?").run(worker.id, now, r.id);
        return rowToJob({ ...r, status: "assigned", assigned_to: worker.id, assigned_at: now });
      });
      return tx();
    },

    /**
     * Record an answer. Only the assigned worker can answer, not faster than the latency floor.
     * Gold answers update the capability graph. Earnings are recorded as owed.
     */
    answer(jobId: string, workerId: string, answer: string, confidence: number, workerShare: number, now = Date.now()) {
      const tx = db.transaction(() => {
        const job: any = db.query("SELECT * FROM jobs WHERE id = ?").get(jobId);
        if (!job) return { ok: false as const, error: "job not found" };
        if (job.status !== "assigned" || job.assigned_to !== workerId) return { ok: false as const, error: "job is not assigned to this worker" };
        if (now - job.assigned_at < MIN_ANSWER_MS) return { ok: false as const, error: "too fast: read the task before answering" };

        const earned = Math.round(job.price_usdc * workerShare * 1e6) / 1e6;
        db.query("UPDATE jobs SET status = 'answered', answer = ?, confidence = ?, answered_at = ? WHERE id = ?").run(answer, confidence, now, jobId);
        db.query("UPDATE workers SET jobs_done = jobs_done + 1, owed_usdc = owed_usdc + ? WHERE id = ?").run(earned, workerId);

        if (job.is_gold) {
          const key = `${job.language}:${job.domain}`;
          const correct = answer.trim().toLowerCase() === String(job.gold_answer).trim().toLowerCase() ? 1 : 0;
          db.query(
            `INSERT INTO skills (worker_id, key, gold_seen, gold_correct) VALUES (?, ?, 1, ?)
             ON CONFLICT(worker_id, key) DO UPDATE SET gold_seen = gold_seen + 1, gold_correct = gold_correct + ?`,
          ).run(workerId, key, correct, correct);
        }
        return { ok: true as const, earned_usdc: earned };
      });
      return tx();
    },

    /** Workers owed at least `min` USDC whose payout hold has ended. */
    payable(min: number, now = Date.now()): Worker[] {
      return (db.query("SELECT * FROM workers WHERE owed_usdc >= ? AND created_at <= ?").all(min, now - PAYOUT_HOLD_MS) as any[]).map(rowToWorker);
    },

    /** Record an on-chain payout and reduce what is owed. */
    recordPayout(w: Worker, amount: number, txSig: string, now = Date.now()) {
      db.transaction(() => {
        db.query("INSERT INTO payouts (id, worker_id, wallet, amount_usdc, tx_sig, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(crypto.randomUUID(), w.id, w.wallet, amount, txSig, now);
        db.query("UPDATE workers SET owed_usdc = MAX(0, owed_usdc - ?) WHERE id = ?").run(amount, w.id);
      })();
    },

    leaderboard(limit = 50, city?: string) {
      const rows = city
        ? db.query("SELECT id, pet_name, species, city, jobs_done, owed_usdc FROM workers WHERE city = ? ORDER BY owed_usdc DESC, jobs_done DESC LIMIT ?").all(city, limit)
        : db.query("SELECT id, pet_name, species, city, jobs_done, owed_usdc FROM workers ORDER BY owed_usdc DESC, jobs_done DESC LIMIT ?").all(limit);
      return rows as { id: string; pet_name: string | null; species: string | null; city: string | null; jobs_done: number; owed_usdc: number }[];
    },

    /** Public network stats, computed from real rows only. */
    stats() {
      const answered = db.query("SELECT created_at, answered_at FROM jobs WHERE status = 'answered' AND is_gold = 0").all() as any[];
      const latencies = answered.map((r) => r.answered_at - r.created_at).sort((a, b) => a - b);
      const median = latencies.length ? latencies[Math.floor(latencies.length / 2)] : null;
      const paid = db.query("SELECT COALESCE(SUM(price_usdc), 0) AS total FROM jobs WHERE status = 'answered' AND is_gold = 0").get() as any;
      const workers = db.query("SELECT COUNT(*) AS n FROM workers").get() as any;
      return { human_answers: answered.length, agent_spend_usdc: paid.total, median_latency_ms: median, workers: workers.n };
    },
  };
}

export type Store = ReturnType<typeof openStore>;
