import { Database } from "bun:sqlite";

/**
 * Scrappy relational schema (SQLite; one file on the API host).
 * Money is stored in micro-USDC integers (1 USDC = 1_000_000) so sums are exact.
 */
export function openDb(path = process.env.SCRAPPY_DB ?? process.env.KAGE_DB ?? "scrappy.db") {
  const db = new Database(path, { create: true, strict: true });
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS organizations (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id),
      name TEXT NOT NULL,
      funding_wallet TEXT,
      balance_micro INTEGER NOT NULL DEFAULT 0 CHECK (balance_micro >= 0),
      webhook_secret TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      prefix TEXT NOT NULL,
      hash TEXT NOT NULL UNIQUE,
      label TEXT,
      created_at INTEGER NOT NULL,
      last_used_at INTEGER,
      revoked_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS workers (
      id TEXT PRIMARY KEY,
      wallet TEXT NOT NULL UNIQUE,
      token_hash TEXT NOT NULL,
      languages TEXT NOT NULL,
      pet_name TEXT, species TEXT, city TEXT,
      created_at INTEGER NOT NULL,
      last_seen_at INTEGER,
      tasks_done INTEGER NOT NULL DEFAULT 0,
      earned_micro INTEGER NOT NULL DEFAULT 0,
      owed_micro INTEGER NOT NULL DEFAULT 0 CHECK (owed_micro >= 0),
      push_subscription TEXT,
      pending_micro INTEGER NOT NULL DEFAULT 0 CHECK (pending_micro >= 0)
    );
    CREATE TABLE IF NOT EXISTS worker_skills (
      worker_id TEXT NOT NULL REFERENCES workers(id),
      skill TEXT NOT NULL,
      seen INTEGER NOT NULL DEFAULT 0,
      correct INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (worker_id, skill)
    );
    CREATE TABLE IF NOT EXISTS reputation_events (
      id TEXT PRIMARY KEY,
      worker_id TEXT NOT NULL REFERENCES workers(id),
      skill TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('gold', 'consensus')),
      correct INTEGER NOT NULL,
      task_id TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS auth_nonces (
      nonce TEXT PRIMARY KEY, used_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      root_id TEXT NOT NULL,
      parent_id TEXT REFERENCES tasks(id),
      project_id TEXT REFERENCES projects(id),
      payer TEXT,
      billing TEXT NOT NULL CHECK (billing IN ('x402', 'balance', 'none')),
      prompt TEXT NOT NULL,
      content TEXT,
      response_schema TEXT NOT NULL,
      language TEXT NOT NULL,
      skill TEXT NOT NULL,
      min_accuracy REAL NOT NULL,
      humans_required INTEGER NOT NULL CHECK (humans_required BETWEEN 1 AND 15),
      reward_micro INTEGER NOT NULL,
      budget_micro INTEGER NOT NULL,
      consensus_threshold REAL NOT NULL,
      deadline_at INTEGER NOT NULL,
      status TEXT NOT NULL,
      payment_tx TEXT,
      webhook_url TEXT,
      refund_micro INTEGER NOT NULL DEFAULT 0,
      refund_tx TEXT,
      is_gold INTEGER NOT NULL DEFAULT 0,
      gold_answer TEXT,
      created_at INTEGER NOT NULL,
      completed_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS tasks_live ON tasks(status, language, deadline_at);
    CREATE INDEX IF NOT EXISTS tasks_project ON tasks(project_id, created_at);
    CREATE INDEX IF NOT EXISTS tasks_root ON tasks(root_id);

    CREATE TABLE IF NOT EXISTS task_assignments (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id),
      root_id TEXT NOT NULL,
      worker_id TEXT NOT NULL REFERENCES workers(id),
      status TEXT NOT NULL CHECK (status IN ('assigned', 'responded', 'expired')),
      assigned_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      UNIQUE (root_id, worker_id)
    );
    CREATE INDEX IF NOT EXISTS assignments_task ON task_assignments(task_id, status);

    CREATE TABLE IF NOT EXISTS task_responses (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id),
      root_id TEXT NOT NULL,
      worker_id TEXT NOT NULL REFERENCES workers(id),
      answer TEXT NOT NULL,
      confidence INTEGER NOT NULL CHECK (confidence BETWEEN 0 AND 100),
      weight REAL NOT NULL,
      latency_ms INTEGER NOT NULL,
      paid_micro INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE (root_id, worker_id)
    );
    CREATE INDEX IF NOT EXISTS responses_worker ON task_responses(worker_id, created_at);

    CREATE TABLE IF NOT EXISTS consensus_results (
      task_id TEXT PRIMARY KEY REFERENCES tasks(id),
      answer TEXT,
      agreement REAL NOT NULL,
      confidence REAL NOT NULL,
      responses INTEGER NOT NULL,
      votes TEXT NOT NULL,
      latency_ms INTEGER NOT NULL,
      computed_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL CHECK (kind IN ('payout', 'refund', 'deposit')),
      worker_id TEXT REFERENCES workers(id),
      project_id TEXT REFERENCES projects(id),
      task_id TEXT REFERENCES tasks(id),
      wallet TEXT NOT NULL,
      amount_micro INTEGER NOT NULL CHECK (amount_micro > 0),
      tx_sig TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      worker_id TEXT NOT NULL REFERENCES workers(id),
      task_id TEXT NOT NULL REFERENCES tasks(id),
      channel TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);
  // migrations for databases created before a column existed
  const wcols = (db.query("PRAGMA table_info(workers)").all() as { name: string }[]).map((c) => c.name);
  if (!wcols.includes("pending_micro")) db.exec("ALTER TABLE workers ADD COLUMN pending_micro INTEGER NOT NULL DEFAULT 0 CHECK (pending_micro >= 0)");
  return db;
}

export type Db = ReturnType<typeof openDb>;

export const MICRO = 1_000_000;
export const toMicro = (usdc: number) => Math.round(usdc * MICRO);
export const toUsdc = (micro: number) => micro / MICRO;
export const uid = () => crypto.randomUUID();
