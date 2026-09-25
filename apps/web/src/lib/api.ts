// Client for the Scrappy Human API (apps/api). Workers use a device token; developers use a project API key.
// Production default is same-origin: Vercel rewrites /v1 and /health to the API host.
export const API_URL = (process.env.NEXT_PUBLIC_SCRAPPY_API ?? (process.env.NODE_ENV === "production" ? "" : "http://localhost:8787")).replace(/\/$/, "");
export const EXPLORER_CLUSTER = process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet";
const clusterQs = EXPLORER_CLUSTER === "mainnet" ? "" : `?cluster=${EXPLORER_CLUSTER}`;
export const addressUrl = (addr: string) => `https://explorer.solana.com/address/${addr}${clusterQs}`;
export const txUrl = (sig: string) => `https://explorer.solana.com/tx/${sig}${EXPLORER_CLUSTER === "mainnet" ? "" : `?cluster=${EXPLORER_CLUSTER}`}`;

export type ResponseSchema =
  | { type: "binary" }
  | { type: "choice"; options: string[] }
  | { type: "rating"; scale: number }
  | { type: "text"; max_length: number };

export type WorkerTask = {
  task_id: string;
  prompt: string;
  content: string | null;
  response_schema: ResponseSchema;
  language: string;
  skill: string;
  reward_usdc: number;
  qualification: boolean;
  estimated_seconds: number;
  expires_at: string;
};

export type Skill = { skill: string; accuracy: number; samples: number };
export type PetState = { food: number; hunger: number; starving: boolean; dead: boolean; revive_price_usdc: number };

export type WorkerProfile = {
  wallet: string;
  pet_name: string | null;
  species: string | null;
  city: string | null;
  languages: string[];
  tasks_done: number;
  accuracy: number | null;
  checks: number;
  avg_response_ms: number | null;
  skills: Skill[];
  level: number;
  next_level_at: number | null;
  unlocks: { better_pay: boolean; expert_tasks: boolean; first_pick: boolean };
  earnings: { today_usdc: number; week_usdc: number; total_usdc: number; owed_usdc: number; paid_usdc: number };
  payout_hold_until: string;
  payout_held: boolean;
  available_tasks: number;
  qualification_checks: number;
  push: boolean;
  pet: PetState;
};

export type History = {
  answers: { prompt: string; answer: string; earned_usdc: number; at: string; qualification: boolean; matched_consensus: boolean | null }[];
  payouts: { amount_usdc: number; tx_sig: string; at: string }[];
};

export type NetworkStats = {
  human_answers: number;
  tasks_finished: number;
  agent_spend_usdc: number;
  paid_to_humans_usdc: number;
  median_latency_ms: number | null;
  avg_agreement: number | null;
  workers: number;
  workers_online: number;
};

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly body: unknown) {
    super(message);
  }
}

async function call<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const { token, headers, ...rest } = init;
  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: { "content-type": "application/json", ...(token && { authorization: `Bearer ${token}` }), ...headers },
  });
  if (res.status === 204) return null as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(body.message ?? (typeof body.error === "string" ? body.error : `API error ${res.status}`), res.status, body);
  return body as T;
}

// ---- public ----
export const getStats = () => call<NetworkStats>("/v1/stats");
export const getConfig = () => call<{ network: string | null; platform_wallet: string | null; push_public_key: string | null; worker_share: number }>("/v1/config");
export const getLeaderboard = (city?: string, token?: string) =>
  call<{ entries: { rank: number; pet_name: string | null; species: string | null; city: string | null; tasks_done: number; earned_usdc: number; you: boolean }[] }>(
    `/v1/leaderboard${city ? `?city=${encodeURIComponent(city)}` : ""}`,
    { token },
  );

// ---- workers ----
export const registerWorker = (b: { wallet: string; languages: string[]; pet_name?: string; species?: string; city?: string }) =>
  call<{ worker_token: string }>("/v1/workers", { method: "POST", body: JSON.stringify(b) });
export const signInWorker = (b: { wallet: string; nonce: string; issued_at: string; signature: string }) =>
  call<{ worker_token: string; profile: { pet_name: string | null; species: string | null; city: string | null; languages: string[] } }>(
    "/v1/workers/session",
    { method: "POST", body: JSON.stringify(b) },
  );
export const getMe = (token: string) => call<WorkerProfile>(`/v1/worker/me?tz_offset=${new Date().getTimezoneOffset()}`, { token });
export const patchMe = (token: string, b: Partial<{ languages: string[]; pet_name: string; species: string; city: string }>) =>
  call<{ ok: true }>("/v1/worker/me", { method: "PATCH", token, body: JSON.stringify(b) });
export const nextTask = (token: string) => call<WorkerTask | null>("/v1/worker/next", { token });
export const respond = (token: string, taskId: string, answer: string, confidence: number) =>
  call<{ ok: true; earned_usdc: number; qualification: boolean; correct?: boolean }>(`/v1/tasks/${taskId}/respond`, {
    method: "POST",
    token,
    body: JSON.stringify({ answer, confidence }),
  });
export const feedPet = (token: string) => call<{ ok: true; pet: PetState }>("/v1/worker/feed", { method: "POST", token });
export const revivePet = (token: string, tx_sig?: string) =>
  call<{ ok: true; pet: PetState }>("/v1/worker/revive", { method: "POST", token, body: JSON.stringify(tx_sig ? { tx_sig } : {}) });
export const getHistory = (token: string) => call<History>("/v1/worker/history", { token });
export const savePush = (token: string, sub: PushSubscriptionJSON) => call<{ ok: true }>("/v1/worker/push", { method: "PUT", token, body: JSON.stringify(sub) });

// ---- developers ----
export type ProjectOverview = {
  project: { id: string; name: string; funding_wallet: string | null; created_at: string };
  balance_usdc: number;
  tasks: { total: number; today: number; active: number; completed: number };
  avg_latency_ms: number | null;
  avg_agreement: number | null;
  consensus_rate: number | null;
  human_spend_usdc: number;
};
export type ProjectTask = {
  task_id: string; prompt: string; status: string; answer?: string | null; agreement?: number; humans: number; humans_requested: number;
  latency_ms?: number; price_usdc: number; refund_usdc: number; created_at: string;
};
export const createProject = (name: string, funding_wallet?: string) =>
  call<{ project_id: string; api_key: string; webhook_secret: string }>("/v1/projects", { method: "POST", body: JSON.stringify({ name, funding_wallet }) });
export const getProject = (key: string) => call<ProjectOverview>("/v1/project", { token: key });
export const patchProject = (key: string, b: { name?: string; funding_wallet?: string }) => call<{ ok: true }>("/v1/project", { method: "PATCH", token: key, body: JSON.stringify(b) });
export const getProjectTasks = (key: string) => call<{ tasks: ProjectTask[] }>("/v1/project/tasks", { token: key });
export const getKeys = (key: string) =>
  call<{ keys: { id: string; prefix: string; label: string; created_at: number; last_used_at: number | null; revoked_at: number | null; current: boolean }[] }>("/v1/project/keys", { token: key });
export const createKey = (key: string, label: string) => call<{ id: string; api_key: string }>("/v1/project/keys", { method: "POST", token: key, body: JSON.stringify({ label }) });
export const revokeKey = (key: string, id: string) => call<{ ok: true }>(`/v1/project/keys/${id}`, { method: "DELETE", token: key });
export const creditDeposit = (key: string, tx_sig: string) => call<{ credited_usdc: number }>("/v1/project/deposits", { method: "POST", token: key, body: JSON.stringify({ tx_sig }) });
export const getPayments = (key: string) => call<{ deposits: { amount_usdc: number; tx_sig: string; at: string }[] }>("/v1/project/payments", { token: key });

export const usd = (n: number) => `$${n.toFixed(2)}`;
export const pct = (n: number | null | undefined) => (n == null ? "–" : `${(n * 100).toFixed(n >= 0.995 || n === 0 ? 0 : 1)}%`);
export const secs = (ms: number | null | undefined) => (ms == null ? "–" : `${(ms / 1000).toFixed(1)} s`);
