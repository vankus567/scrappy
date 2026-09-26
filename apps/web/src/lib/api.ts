// Client for the Scrappy Human API (apps/api). Worker-side calls only; agents pay via x402.
// Production default is same-origin: vercel.json rewrites /v1 to the API host.
// The API issues a worker token at signup; this app stores it where it used to store worker_id.
export const API_URL = (process.env.NEXT_PUBLIC_SCRAPPY_API ?? (process.env.NODE_ENV === "production" ? "" : "http://localhost:8787")).replace(/\/$/, "");

export type WorkerStats = { worker_id: string; languages: string[]; jobs_done: number; owed_usdc: number };
export type WorkerJob = {
  job_id: string;
  task: string;
  content: string | null;
  options: string[] | null;
  language: string;
  pays_usdc: number;
  answer_within_ms: number;
  kind: TaskKind;
  agent: { name: string; reason: string | null } | null;
  city: string | null;
  phone: string | null;
  qualification: boolean;
  place: Place | null;
  proof: ProofReq;
};
export type TaskKind = "judgment" | "call" | "photo_check" | "price_check" | "visit";
export type Place = { lat: number; lng: number; radius_m: number; name?: string; distance_m?: number };
export type ProofReq = { photo: boolean; gps: boolean };
export type ProofSubmit = { photo?: string; lat?: number; lng?: number; accuracy_m?: number; captured_at?: string };
export type HistoryItem = { prompt: string; answer: string; earned_usdc: number; at: string; qualification: boolean; matched_consensus: boolean | null; agent: string | null; kind: TaskKind; outcome: string | null };

type ResponseSchema =
  | { type: "binary" }
  | { type: "choice"; options: string[] }
  | { type: "rating"; scale: number }
  | { type: "text"; max_length: number };

type WorkerTask = {
  task_id: string;
  prompt: string;
  content: string | null;
  response_schema: ResponseSchema;
  language: string;
  reward_usdc: number;
  expires_at: string;
  qualification: boolean;
  kind?: TaskKind;
  agent?: { name: string; reason: string | null } | null;
  city?: string | null;
  phone?: string | null;
  place?: Place | null;
  proof_required?: ProofReq;
};

export class ApiError extends Error {
  constructor(message: string, readonly code?: string) {
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
  if (!res.ok) {
    if (body.error === "wallet_registered") throw new ApiError("This wallet already has a Scrappy. Connect it to sign in.", "wallet_registered");
    throw new ApiError(body.message ?? (typeof body.error === "string" ? body.error : `API error ${res.status}`));
  }
  return body as T;
}

const optionsFor = (s: ResponseSchema): string[] | null => {
  if (s.type === "binary") return ["yes", "no"];
  if (s.type === "choice") return s.options;
  if (s.type === "rating") return Array.from({ length: s.scale }, (_, i) => String(i + 1));
  return null;
};

export async function registerWorker(wallet: string, languages: string[], profile: { pet_name?: string; species?: string; city?: string } = {}) {
  const r = await call<{ worker_token: string }>("/v1/workers", { method: "POST", body: JSON.stringify({ wallet, languages, ...profile }) });
  return { worker_id: r.worker_token, jobs_done: 0, owed_usdc: 0 };
}

/** Must match apps/api/src/auth.ts signInMessage. */
export const signInMessage = (wallet: string, nonce: string, issuedAt: string) => `Scrappy sign-in\nwallet: ${wallet}\nnonce: ${nonce}\nissued: ${issuedAt}`;

/** A wallet that already has a Scrappy proves ownership by signing one message. */
export async function signInWorker(wallet: string, nonce: string, issued_at: string, signature: string) {
  const r = await call<{ worker_token: string }>("/v1/workers/session", { method: "POST", body: JSON.stringify({ wallet, nonce, issued_at, signature }) });
  return r.worker_token;
}

export async function getWorker(token: string): Promise<WorkerStats> {
  const me = await call<{ languages: string[]; tasks_done: number; earnings: { owed_usdc: number } }>(
    `/v1/worker/me?tz_offset=${new Date().getTimezoneOffset()}`,
    { token },
  );
  return { worker_id: token, languages: me.languages, jobs_done: me.tasks_done, owed_usdc: me.earnings.owed_usdc };
}

/** Next job for this worker, or null when none is waiting. */
export async function nextJob(token: string, near?: { lat: number; lng: number } | null): Promise<WorkerJob | null> {
  const q = near ? `?lat=${near.lat.toFixed(5)}&lng=${near.lng.toFixed(5)}` : "";
  const t = await call<WorkerTask | null>(`/v1/worker/next${q}`, { token });
  if (!t) return null;
  return {
    job_id: t.task_id,
    task: t.prompt,
    content: t.content,
    options: optionsFor(t.response_schema),
    language: t.language,
    pays_usdc: t.reward_usdc,
    answer_within_ms: Math.max(0, new Date(t.expires_at).getTime() - Date.now()),
    kind: t.kind ?? "judgment",
    agent: t.agent ?? null,
    city: t.city ?? null,
    phone: t.phone ?? null,
    qualification: t.qualification,
    place: t.place ?? null,
    proof: t.proof_required ?? { photo: false, gps: false },
  };
}

/** Your answers, which agent asked, and what the agent did with them. */
export async function getHistory(token: string) {
  return (await call<{ answers: HistoryItem[] }>("/v1/worker/history", { token })).answers;
}

export async function submitAnswer(jobId: string, token: string, answer: string, confidence: number, proof?: ProofSubmit) {
  return call<{ ok: true; earned_usdc: number; location_verified?: boolean; distance_m?: number | null }>(`/v1/tasks/${jobId}/respond`, {
    method: "POST",
    token,
    body: JSON.stringify({ answer, confidence, ...(proof && { proof }) }),
  });
}

export const formatUsd = (n: number) => `$${n.toFixed(2)}`;

export const getConfig = () => call<{ push_public_key: string | null }>("/v1/config");
export const savePush = (token: string, sub: PushSubscriptionJSON) =>
  call<{ ok: true }>("/v1/worker/push", { method: "PUT", token, body: JSON.stringify(sub) });

// ================= battles =================

export type Move = "attack" | "guard" | "trick";
export type Play = Move | "locked" | null;
export type Element = "blaze" | "tide" | "spirit";
export type BattlePet = { name: string; species: string; element: Element };
export type RoundResult = { round: number; a: Play; b: Play; winner: "a" | "b" | null; by: "move" | "element" | "timeout" | "tie" };
export type BattleView = {
  id: string;
  mode: "friend" | "quick";
  status: "open" | "active" | "done" | "cancelled";
  you: "a" | "b" | null;
  a: BattlePet | null;
  b: BattlePet | null;
  stake_food: number;
  round: number;
  round_deadline: string | null;
  score: { a: number; b: number };
  rounds: RoundResult[];
  winner: "a" | "b" | "draw" | null;
  turn?: { you_locked: boolean; they_locked: boolean; you_revealed: boolean; they_revealed: boolean; next: "lock" | "wait_lock" | "reveal" | "wait_reveal" };
  created_at: string;
};
export type BattleRecord = { wins: number; losses: number; draws: number };

export const getBattles = (token: string) => call<{ battles: BattleView[]; record: BattleRecord; food: number }>("/v1/battles", { token });
export const getBattle = (id: string, token?: string) => call<BattleView>(`/v1/battles/${id}`, { token });
export const challengeFriend = (token: string, stake_food: number) =>
  call<BattleView>("/v1/battles", { method: "POST", token, body: JSON.stringify({ stake_food }) });
export const quickMatch = (token: string) => call<BattleView>("/v1/battles/quick", { method: "POST", token });
export const joinBattle = (id: string, token: string) => call<BattleView>(`/v1/battles/${id}/join`, { method: "POST", token });
export const cancelBattle = (id: string, token: string) => call<{ ok: true }>(`/v1/battles/${id}/cancel`, { method: "POST", token });
export const commitMove = (id: string, token: string, round: number, hash: string) =>
  call<BattleView>(`/v1/battles/${id}/commit`, { method: "POST", token, body: JSON.stringify({ round, hash }) });
export const revealMove = (id: string, token: string, round: number, move: Move, salt: string) =>
  call<BattleView>(`/v1/battles/${id}/reveal`, { method: "POST", token, body: JSON.stringify({ round, move, salt }) });
