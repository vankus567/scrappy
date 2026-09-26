import { wrapFetchWithPayment } from "@x402/fetch";
import { x402Client } from "@x402/core/client";
import { ExactSvmScheme } from "@x402/svm/exact/client";
import { createKeyPairSignerFromBytes } from "@solana/kit";
import { base58 } from "@scure/base";

export type ResponseSchema =
  | { type: "binary" }
  | { type: "choice"; options: string[] }
  | { type: "rating"; scale?: number }
  | { type: "text"; max_length?: number };

export type TaskOptions = {
  /** What the humans should decide, e.g. "Does this Telugu translation sound natural?" */
  task: string;
  /** Material to judge: a reply, a translation, a code diff. */
  content?: string;
  /** Shorthand for a choice schema. */
  options?: string[];
  /** Answer shape. Default: choice when `options` is given, otherwise yes/no. */
  responseSchema?: ResponseSchema;
  /** ISO language code of the task. Default "en". */
  language?: string;
  /** Skill for routing, e.g. "translation", "security", "support". Default "general". */
  skill?: string;
  /** Minimum proven accuracy each human needs (0-1). >= 0.95 routes to experts only. Default 0.8. */
  minAccuracy?: number;
  /** Seconds you can wait. 10-3600 (on-site tasks need minutes). Default 60. */
  deadline?: number;
  /** Total USDC for all humans in this round. Default $0.05 per human. */
  budget?: number;
  /** HTTPS URL that receives a signed `task.finished` event (API-key projects). */
  webhookUrl?: string;
  /** Real-world work a person does from their phone. Default "judgment". */
  kind?: "judgment" | "call" | "photo_check" | "price_check" | "visit";
  /** Where the human has to be. Routes the task to phones nearby and checks their GPS against it. */
  place?: { lat: number; lng: number; radius_m?: number; name?: string };
  /** Evidence the answer must carry. Defaults: photo for photo/price checks, GPS whenever a place is given. */
  proof?: { photo?: boolean; gps?: boolean };
  /** City routing when there is no exact place. */
  city?: string;
  /** Business phone number for call tasks. */
  phone?: string;
  /** Shown to the human: who is asking and why the agent is stuck. */
  agent?: { name: string; reason?: string };
};

export type Proof = {
  proof_id: string;
  /** Relative to the API base; fetch with your API key. */
  photo_url?: string;
  photo_sha256?: string;
  location?: { lat: number; lng: number; accuracy_m: number | null };
  distance_m?: number;
  location_verified: boolean;
  captured_at: string;
  submitted_at: string;
};

export type ConsensusOptions = TaskOptions & {
  /** Independent humans to ask. Default 3. */
  humans?: number;
  /** Agreement needed to call it settled (0.5-1). Default 0.8. */
  qualityThreshold?: number;
  /** Below the threshold, add humans until this many have answered in total. Default: no escalation. */
  maxHumans?: number;
  /** Humans added per escalation round. Default 2. */
  escalateBy?: number;
  /** Hard cap on total spend across rounds (USDC). */
  maxBudget?: number;
};

export type TaskStatus = "matching" | "collecting" | "completed" | "low_confidence" | "insufficient_capacity" | "cancelled";

export type ScrappyResult = {
  status: TaskStatus;
  /** Majority answer, or null if nobody answered. */
  answer: string | null;
  /** Share of humans who gave the majority answer (0-1). */
  agreement: number;
  /** Accuracy-weighted agreement x the humans' own confidence (0-1). */
  confidence: number;
  /** Humans who answered across all rounds. */
  humans: number;
  votes: { answer: string; humans: number }[];
  latency_ms: number | null;
  task_id: string;
  /** Every task in the chain (first round + escalations). */
  rounds: string[];
  spent_usdc: number;
  /** Evidence from each human (proof tasks only). */
  proof?: Proof[];
  /** Every answer carried the required photo and a GPS fix inside the place's radius. */
  verified?: boolean;
  reason?: string;
  available?: number;
  required?: number;
};

export class ScrappyError extends Error {
  constructor(message: string, readonly status: number, readonly body: unknown) {
    super(message);
  }
}

export type ScrappyConfig = {
  /** Scrappy API base URL. */
  baseUrl?: string;
  /** Project API key (scrappy_sk_...): tasks are paid from your prepaid USDC balance. */
  apiKey?: string;
  /** Or: agent wallet (base58 64-byte secret). Each task is paid per call in USDC via x402. */
  walletSecretKey?: string;
  /** Custom fetch (testing, proxies). */
  fetch?: typeof fetch;
};

const toBody = (o: TaskOptions & { humans?: number; qualityThreshold?: number; extends?: string }) => ({
  task: o.task,
  content: o.content,
  options: o.options,
  response_schema: o.responseSchema,
  language: o.language,
  skill: o.skill,
  min_accuracy: o.minAccuracy,
  deadline: o.deadline,
  budget: o.budget,
  humans: o.humans,
  quality_threshold: o.qualityThreshold,
  webhook_url: o.webhookUrl,
  extends: o.extends,
  kind: o.kind,
  place: o.place,
  proof: o.proof,
  city: o.city,
  phone: o.phone,
  agent: o.agent,
});

/**
 * Scrappy: call humans like you call an API.
 *
 *   const scrappy = new Scrappy({ apiKey: process.env.SCRAPPY_API_KEY });
 *   const r = await scrappy.consensus({ task: "Is this code vulnerable?", content: diff, humans: 3, budget: 0.3, deadline: 20 });
 *   if (r.answer === "yes") cancelDeploy();
 */
export class Scrappy {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly plainFetch: typeof fetch;
  private payingFetch?: Promise<typeof fetch>;

  constructor(config: ScrappyConfig) {
    if (!config.apiKey && !config.walletSecretKey) throw new Error("Scrappy needs an apiKey or a walletSecretKey");
    this.baseUrl = (config.baseUrl ?? "https://scrappypet.vercel.app").replace(/\/$/, "");
    this.apiKey = config.apiKey;
    this.plainFetch = config.fetch ?? fetch;
    if (!config.apiKey && config.walletSecretKey) {
      const secret = config.walletSecretKey;
      const base = this.plainFetch;
      this.payingFetch = (async () => {
        const signer = await createKeyPairSignerFromBytes(base58.decode(secret));
        const client = new x402Client();
        client.register("solana:*", new ExactSvmScheme(signer));
        return wrapFetchWithPayment(base, client) as typeof fetch;
      })();
    }
  }

  private headers() {
    return { "content-type": "application/json", ...(this.apiKey && { authorization: `Bearer ${this.apiKey}` }) };
  }

  private async post(path: string, body: unknown) {
    const f = this.payingFetch ? await this.payingFetch : this.plainFetch;
    const res = await f(`${this.baseUrl}${path}`, { method: "POST", headers: this.headers(), body: JSON.stringify(body) });
    const json: any = await res.json().catch(() => ({}));
    return { status: res.status, json };
  }

  /** Task result; waits up to `wait` seconds for it to finish. */
  async getTask(taskId: string, wait = 0): Promise<any> {
    const res = await this.plainFetch(`${this.baseUrl}/v1/tasks/${taskId}?wait=${wait}`, { headers: this.headers() });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) throw new ScrappyError(json.error ?? `Scrappy error ${res.status}`, res.status, json);
    return json;
  }

  /** How many qualified humans are online right now (free). */
  async findCapacity(req: { language?: string; skill?: string; minAccuracy?: number } = {}): Promise<{ online: number; available: number }> {
    const q = new URLSearchParams({ language: req.language ?? "en", skill: req.skill ?? "general", min_accuracy: String(req.minAccuracy ?? 0.8) });
    const res = await this.plainFetch(`${this.baseUrl}/v1/capacity?${q}`);
    return (await res.json()) as { online: number; available: number };
  }

  private async round(path: string, body: unknown, deadline: number): Promise<{ result: any } | { refused: any }> {
    const { status, json } = await this.post(path, body);
    if (status === 409 && json.status === "insufficient_capacity") return { refused: json };
    if (status !== 201) throw new ScrappyError(json.error ?? `Scrappy error ${status}`, status, json);
    let r = await this.getTask(json.task_id, 25);
    const until = Date.now() + (deadline + 15) * 1000;
    while (["matching", "collecting"].includes(r.status) && Date.now() < until) r = await this.getTask(json.task_id, 25);
    return { result: r };
  }

  private shape(r: any, rounds: string[], spent: number): ScrappyResult {
    return {
      status: r.status, answer: r.answer ?? null, agreement: r.agreement ?? 0, confidence: r.confidence ?? 0, humans: r.humans ?? 0,
      votes: r.votes ?? [], latency_ms: r.latency_ms ?? null, task_id: r.task_id, rounds, spent_usdc: Math.round(spent * 1e6) / 1e6,
      ...(r.proof && { proof: r.proof, verified: r.verified }),
      ...(r.reason && { reason: r.reason }),
    };
  }

  /**
   * Eyes and hands in the physical world: one nearby human goes to a place, checks it, and answers with
   * a photo and a GPS fix that Scrappy verifies before paying them.
   *
   *   const r = await scrappy.findHuman({ task: "Is Amul butter 500g on the shelf? Shelf price?", place: { lat, lng, name: "Reliance Smart" },
   *     responseSchema: { type: "text" }, budget: 0.5, deadline: 1800 });
   *   if (r.verified) console.log(r.answer, r.proof?.[0].photo_url);
   */
  async findHuman(o: TaskOptions & { place: NonNullable<TaskOptions["place"]> }): Promise<ScrappyResult> {
    return this.askHuman({ kind: "photo_check", deadline: 1_800, ...o });
  }

  /** One human, one judgment. */
  async askHuman(o: TaskOptions): Promise<ScrappyResult> {
    return this.consensus({ ...o, humans: 1, qualityThreshold: 0.5 });
  }

  /**
   * Several independent humans; returns the majority, agreement and confidence.
   * With `maxHumans`, a result below `qualityThreshold` recruits `escalateBy` more humans (never the same people)
   * until the threshold or the cap is reached. Never throws for capacity: returns status "insufficient_capacity".
   */
  async consensus(o: ConsensusOptions): Promise<ScrappyResult> {
    const humans = o.humans ?? 3;
    const threshold = o.qualityThreshold ?? 0.8;
    const deadline = o.deadline ?? 60;
    const perHuman = o.budget !== undefined ? o.budget / humans : 0.05;

    const first = await this.round("/v1/consensus", toBody({ ...o, humans, qualityThreshold: threshold, deadline }), deadline);
    if ("refused" in first) {
      return { status: "insufficient_capacity", answer: null, agreement: 0, confidence: 0, humans: 0, votes: [], latency_ms: null, task_id: "", rounds: [], spent_usdc: 0, ...first.refused };
    }
    let r = first.result;
    const rounds = [r.task_id];
    let spent = r.price_usdc - r.refund_usdc;

    const cap = o.maxHumans ?? humans;
    const step = o.escalateBy ?? 2;
    while (r.status === "low_confidence" && r.humans < cap) {
      const add = Math.min(step, cap - r.humans);
      const cost = Math.round(add * perHuman * 1e6) / 1e6;
      if (o.maxBudget !== undefined && spent + cost > o.maxBudget + 1e-9) break;
      const next = await this.round("/v1/consensus", { extends: r.task_id, humans: add, budget: cost, deadline, quality_threshold: threshold, task: o.task }, deadline);
      if ("refused" in next) break;
      r = next.result;
      rounds.push(r.task_id);
      spent += r.price_usdc - r.refund_usdc;
    }
    return this.shape(r, rounds, spent);
  }
}

/** Verify a Scrappy webhook: header `x-scrappy-signature: t=<ms>,v1=<hex>`; rejects anything older than `toleranceMs`. */
export async function verifyWebhook(secret: string, rawBody: string, header: string, toleranceMs = 5 * 60_000, now = Date.now()) {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const t = Number(parts.t);
  if (!Number.isFinite(t) || Math.abs(now - t) > toleranceMs || !parts.v1) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${rawBody}`)));
  const hex = [...mac].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (hex.length !== parts.v1.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ parts.v1.charCodeAt(i);
  return diff === 0;
}
