import { Database } from "bun:sqlite";

export type JobStatus = "open" | "assigned" | "answered" | "expired";

export type Job = {
  id: string;
  task: string;
  content: string | null;
  options: string[] | null;
  language: string;
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
};

export type Worker = {
  id: string;
  wallet: string;
  languages: string[];
  created_at: number;
  jobs_done: number;
  owed_usdc: number;
};

const LOCK_MS = 60_000;

/** SQLite store. Real persistence; swap for Postgres when deployed. */
export function openStore(path = process.env.SCRAPPY_DB ?? "scrappy.db") {
  const db = new Database(path, { create: true });
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS workers (
      id TEXT PRIMARY KEY, wallet TEXT NOT NULL UNIQUE, languages TEXT NOT NULL,
      created_at INTEGER NOT NULL, jobs_done INTEGER NOT NULL DEFAULT 0, owed_usdc REAL NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY, task TEXT NOT NULL, content TEXT, options TEXT, language TEXT NOT NULL,
      max_latency_ms INTEGER NOT NULL, min_accuracy REAL NOT NULL, price_usdc REAL NOT NULL,
      status TEXT NOT NULL, created_at INTEGER NOT NULL,
      assigned_to TEXT, assigned_at INTEGER, answer TEXT, confidence REAL, answered_at INTEGER, payment_tx TEXT
    );
    CREATE INDEX IF NOT EXISTS jobs_open ON jobs(status, language, created_at);
  `);

  const rowToJob = (r: any): Job => ({ ...r, options: r.options ? JSON.parse(r.options) : null });
  const rowToWorker = (r: any): Worker => ({ ...r, languages: JSON.parse(r.languages) });

  return {
    db,

    createWorker(wallet: string, languages: string[]): Worker {
      const existing = db.query("SELECT * FROM workers WHERE wallet = ?").get(wallet);
      if (existing) {
        db.query("UPDATE workers SET languages = ? WHERE wallet = ?").run(JSON.stringify(languages), wallet);
        return rowToWorker({ ...(existing as object), languages: JSON.stringify(languages) });
      }
      const w: Worker = { id: crypto.randomUUID(), wallet, languages, created_at: Date.now(), jobs_done: 0, owed_usdc: 0 };
      db.query("INSERT INTO workers (id, wallet, languages, created_at) VALUES (?, ?, ?, ?)").run(w.id, wallet, JSON.stringify(languages), w.created_at);
      return w;
    },

    getWorker(id: string): Worker | null {
      const r = db.query("SELECT * FROM workers WHERE id = ?").get(id);
      return r ? rowToWorker(r) : null;
    },

    createJob(j: Pick<Job, "task" | "content" | "options" | "language" | "max_latency_ms" | "min_accuracy" | "price_usdc" | "payment_tx">): Job {
      const job: Job = { ...j, id: crypto.randomUUID(), status: "open", created_at: Date.now(), assigned_to: null, assigned_at: null, answer: null, confidence: null, answered_at: null };
      db.query(
        `INSERT INTO jobs (id, task, content, options, language, max_latency_ms, min_accuracy, price_usdc, status, created_at, payment_tx)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`,
      ).run(job.id, job.task, job.content, job.options ? JSON.stringify(job.options) : null, job.language, job.max_latency_ms, job.min_accuracy, job.price_usdc, job.created_at, job.payment_tx);
      return job;
    },

    getJob(id: string): Job | null {
      const r = db.query("SELECT * FROM jobs WHERE id = ?").get(id);
      return r ? rowToJob(r) : null;
    },

    /**
     * Router v0 (pull): the oldest open job in one of the worker's languages, or an assignment
     * whose 60 s lock expired. Locked to this worker atomically.
     */
    nextJobFor(worker: Worker, now = Date.now()): Job | null {
      const langs = worker.languages;
      if (!langs.length) return null;
      const marks = langs.map(() => "?").join(",");
      const tx = db.transaction(() => {
        const r: any = db
          .query(
            `SELECT * FROM jobs
             WHERE language IN (${marks})
               AND (status = 'open' OR (status = 'assigned' AND assigned_at < ? AND assigned_to != ?))
               AND created_at + max_latency_ms > ?
             ORDER BY created_at ASC LIMIT 1`,
          )
          .get(...langs, now - LOCK_MS, worker.id, now);
        if (!r) return null;
        db.query("UPDATE jobs SET status = 'assigned', assigned_to = ?, assigned_at = ? WHERE id = ?").run(worker.id, now, r.id);
        return rowToJob({ ...r, status: "assigned", assigned_to: worker.id, assigned_at: now });
      });
      return tx();
    },

    /** Record a worker's answer. Only the assigned worker can answer; earnings are recorded as owed. */
    answer(jobId: string, workerId: string, answer: string, confidence: number, workerShare: number, now = Date.now()) {
      const tx = db.transaction(() => {
        const job: any = db.query("SELECT * FROM jobs WHERE id = ?").get(jobId);
        if (!job) return { ok: false as const, error: "job not found" };
        if (job.status !== "assigned" || job.assigned_to !== workerId) return { ok: false as const, error: "job is not assigned to this worker" };
        const earned = Math.round(job.price_usdc * workerShare * 1e6) / 1e6;
        db.query("UPDATE jobs SET status = 'answered', answer = ?, confidence = ?, answered_at = ? WHERE id = ?").run(answer, confidence, now, jobId);
        db.query("UPDATE workers SET jobs_done = jobs_done + 1, owed_usdc = owed_usdc + ? WHERE id = ?").run(earned, workerId);
        return { ok: true as const, earned_usdc: earned };
      });
      return tx();
    },
  };
}

export type Store = ReturnType<typeof openStore>;
