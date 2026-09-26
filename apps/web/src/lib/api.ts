import type { Animal } from "./mimic";
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
    // a saved login the server no longer knows (older app version, reset server): drop it and ask to reconnect
    if (res.status === 401 && token) {
      if (typeof window !== "undefined") window.dispatchEvent(new Event("scrappy:signed-out"));
      throw new ApiError("Your sign-in expired. Connect your wallet again to keep battling.", "unauthorized");
    }
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

// ================= Mimic battles =================

export type ClipView =
  | { id: string; kind: "tune"; title: string; notes: { semi: number; ms: number }[]; frames: number[]; duration_ms: number }
  | { id: string; kind: "animal"; title: string; animal: Animal; frames: number[]; duration_ms: number }
  | {
      id: string; kind: "upload"; title: string; audio_url: string; frames: number[]; duration_ms: number; hidden?: boolean;
      category?: "sound" | "dialogue" | "animal"; quote?: string | null; movie?: string | null; by?: string | null;
    };
export type MimicPlayer = { seat: number; name: string; species: string; bot: boolean; submitted: boolean; total: number; winner: boolean };
export type MimicView = {
  id: string;
  mode: "friend" | "quick";
  status: "open" | "active" | "done" | "cancelled";
  host: number;
  you: number | null;
  max_players: number;
  round: number;
  rounds_total: number;
  round_deadline: string | null;
  players: MimicPlayer[];
  clips: (ClipView | null)[];
  results: { round: number; scores: { seat: number; score: number }[] }[];
  your_entry: number | null;
  created_at: string;
};

export const getMimics = (token: string) => call<{ battles: MimicView[]; record: { wins: number; played: number } }>("/v1/mimic", { token });
export const getMimic = (id: string, token?: string) => call<MimicView>(`/v1/mimic/${id}`, { token });
export const createMimic = (token: string, players: number) => call<MimicView>("/v1/mimic", { method: "POST", token, body: JSON.stringify({ players }) });
export const quickMimic = (token: string) => call<MimicView>("/v1/mimic/quick", { method: "POST", token });
export const joinMimic = (id: string, token: string) => call<MimicView>(`/v1/mimic/${id}/join`, { method: "POST", token });
export const startMimic = (id: string, token: string, fill_with_bots: boolean) =>
  call<MimicView>(`/v1/mimic/${id}/start`, { method: "POST", token, body: JSON.stringify({ fill_with_bots }) });
export const leaveMimic = (id: string, token: string) => call<{ ok: true }>(`/v1/mimic/${id}/leave`, { method: "POST", token });
export const submitMimic = (id: string, token: string, round: number, contour: string) =>
  call<MimicView>(`/v1/mimic/${id}/submit`, { method: "POST", token, body: JSON.stringify({ round, contour }) });
export const uploadClip = (token: string, clip: { title: string; mime: string; audio: string; contour: string; duration_ms: number; category?: "sound" | "dialogue" | "animal"; quote?: string; movie?: string }) =>
  call<ClipView>("/v1/clips", { method: "POST", token, body: JSON.stringify(clip) });
export const reportClip = (id: string) => call<{ ok: true }>(`/v1/clips/${id}/report`, { method: "POST" });

// ================= pet shop =================
export type ShopView = {
  network: "devnet" | "mainnet";
  pay_to: string | null;
  equipped: string | null;
  pets: { species: string; name: string; tier: "common" | "rare" | "legendary"; price_sol: number; owned: boolean }[];
};
export const getShop = (token?: string) => call<ShopView>("/v1/shop", { token });
export const buyPet = (token: string, species: string, tx_sig: string) => call<ShopView>("/v1/shop/buy", { method: "POST", token, body: JSON.stringify({ species, tx_sig }) });
export const equipPet = (token: string, species: string) => call<ShopView>("/v1/shop/equip", { method: "POST", token, body: JSON.stringify({ species }) });
