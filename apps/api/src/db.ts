import { Database } from "bun:sqlite";

/**
 * Scrappy relational schema (SQLite; one file on the API host).
 * Money is stored in micro-USDC integers (1 USDC = 1_000_000) so sums are exact.
 */
export function openDb(path = process.env.SCRAPPY_DB ?? "scrappy.db") {
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
      pending_micro INTEGER NOT NULL DEFAULT 0 CHECK (pending_micro >= 0),
      pet_food INTEGER NOT NULL DEFAULT 0 CHECK (pet_food >= 0),
      pet_hunger INTEGER NOT NULL DEFAULT 0 CHECK (pet_hunger BETWEEN 0 AND 100),
      pet_hunger_at INTEGER,
      pet_starving_at INTEGER,
      pet_dead INTEGER NOT NULL DEFAULT 0
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
      kind TEXT NOT NULL CHECK (kind IN ('payout', 'refund', 'deposit', 'revive')),
      worker_id TEXT REFERENCES workers(id),
      project_id TEXT REFERENCES projects(id),
      task_id TEXT REFERENCES tasks(id),
      wallet TEXT NOT NULL,
      amount_micro INTEGER NOT NULL CHECK (amount_micro > 0),
      tx_sig TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL
    );

    -- Who asked and why, what kind of real-world check it is, and what the agent did with the answer.
    CREATE TABLE IF NOT EXISTS task_context (
      task_id TEXT PRIMARY KEY REFERENCES tasks(id),
      agent_name TEXT,
      agent_reason TEXT,
      kind TEXT NOT NULL DEFAULT 'judgment' CHECK (kind IN ('judgment', 'call', 'photo_check', 'price_check', 'visit')),
      city TEXT,
      phone TEXT,
      outcome TEXT,
      outcome_at INTEGER,
      lat REAL, lng REAL, radius_m INTEGER, place TEXT,
      proof TEXT
    );

    -- Evidence a human submitted with an answer: photo (on disk, hashed) and a GPS fix checked against the task's place.
    CREATE TABLE IF NOT EXISTS task_proofs (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id),
      worker_id TEXT NOT NULL REFERENCES workers(id),
      photo_file TEXT, photo_mime TEXT, photo_sha256 TEXT,
      lat REAL, lng REAL, accuracy_m REAL, distance_m INTEGER,
      location_verified INTEGER NOT NULL DEFAULT 0,
      captured_at INTEGER,
      created_at INTEGER NOT NULL,
      UNIQUE (task_id, worker_id)
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
  const addWorkerCol = (def: string) => {
    if (!wcols.includes(def.split(" ")[0])) db.exec(`ALTER TABLE workers ADD COLUMN ${def}`);
  };
  addWorkerCol("pending_micro INTEGER NOT NULL DEFAULT 0 CHECK (pending_micro >= 0)");
  addWorkerCol("pet_food INTEGER NOT NULL DEFAULT 0 CHECK (pet_food >= 0)");
  addWorkerCol("pet_hunger INTEGER NOT NULL DEFAULT 0 CHECK (pet_hunger BETWEEN 0 AND 100)");
  addWorkerCol("pet_hunger_at INTEGER");
  addWorkerCol("pet_starving_at INTEGER");
  addWorkerCol("pet_dead INTEGER NOT NULL DEFAULT 0");
  addWorkerCol("last_lat REAL");
  addWorkerCol("last_lng REAL");
  addWorkerCol("last_fix_at INTEGER");

  // task_context gained a place, proof requirements and the 'visit' kind after it first shipped
  const ctxSql = (db.query("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'task_context'").get() as { sql?: string } | null)?.sql ?? "";
  if (ctxSql && !ctxSql.includes("'visit'")) {
    db.exec(`
      CREATE TABLE task_context_v2 (
        task_id TEXT PRIMARY KEY REFERENCES tasks(id),
        agent_name TEXT,
        agent_reason TEXT,
        kind TEXT NOT NULL DEFAULT 'judgment' CHECK (kind IN ('judgment', 'call', 'photo_check', 'price_check', 'visit')),
        city TEXT,
        phone TEXT,
        outcome TEXT,
        outcome_at INTEGER,
        lat REAL, lng REAL, radius_m INTEGER, place TEXT,
        proof TEXT
      );
      INSERT INTO task_context_v2 (task_id, agent_name, agent_reason, kind, city, phone, outcome, outcome_at)
        SELECT task_id, agent_name, agent_reason, kind, city, phone, outcome, outcome_at FROM task_context;
      DROP TABLE task_context;
      ALTER TABLE task_context_v2 RENAME TO task_context;
    `);
  }

  // payments.kind gained 'revive' after the table first shipped: rebuild it when the old CHECK is still there
  const paySql = (db.query("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'payments'").get() as { sql?: string } | null)?.sql ?? "";
  if (paySql && !paySql.includes("'revive'")) {
    db.exec(`
      CREATE TABLE payments_v2 (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL CHECK (kind IN ('payout', 'refund', 'deposit', 'revive')),
        worker_id TEXT REFERENCES workers(id),
        project_id TEXT REFERENCES projects(id),
        task_id TEXT REFERENCES tasks(id),
        wallet TEXT NOT NULL,
        amount_micro INTEGER NOT NULL CHECK (amount_micro > 0),
        tx_sig TEXT NOT NULL UNIQUE,
        created_at INTEGER NOT NULL
      );
      INSERT INTO payments_v2 SELECT * FROM payments;
      DROP TABLE payments;
      ALTER TABLE payments_v2 RENAME TO payments;
    `);
  }
  return db;
}

export type Db = ReturnType<typeof openDb>;

export const MICRO = 1_000_000;
export const toMicro = (usdc: number) => Math.round(usdc * MICRO);
export const toUsdc = (micro: number) => micro / MICRO;
export const uid = () => crypto.randomUUID();
