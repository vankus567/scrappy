import { wrapFetchWithPayment } from "@x402/fetch";
import { x402Client } from "@x402/core/client";
import { ExactSvmScheme } from "@x402/svm/exact/client";
import { createKeyPairSignerFromBytes } from "@solana/kit";
import { base58 } from "@scure/base";

export type AskOptions = {
  /** What the human should do, e.g. "Which answer is factually correct?" */
  task: string;
  /** Material to judge (text, a reply, a translation). */
  content?: string;
  /** Choices for the human, if any. */
  options?: string[];
  /** ISO language code of the task, default "en". */
  language?: string;
  /** Domain for skill routing, e.g. "crypto", "math", "support". Default "general". */
  domain?: string;
  /** Minimum proven accuracy the human needs (0-1). Default 0.8. */
  minAccuracy?: number;
  /** Seconds the agent can wait. Default 60. */
  deadline?: number;
};

export type HumanAnswer = {
  job_id: string;
  answer: string;
  /** 0-1, the human's own stated confidence */
  confidence: number;
  human_id: string;
  latency_ms: number;
};

export type PolicyResult = {
  answer: string;
  confidence: number;
  decision: "accepted" | "consensus" | "escalated";
  trail: HumanAnswer[];
};

export type Policy = { accept: number; secondOpinion: number; expertAccuracy: number };
export const DEFAULT_POLICY: Policy = { accept: 0.9, secondOpinion: 0.7, expertAccuracy: 0.95 };

type AskFn = (o: AskOptions) => Promise<HumanAnswer>;

/**
 * Confidence policy: >= accept -> take it. secondOpinion..accept -> ask a second human;
 * agreement is consensus (confidence boosted), disagreement escalates. < secondOpinion -> expert.
 * Pure over `ask`, so it is testable without payments.
 */
export async function applyPolicy(ask: AskFn, o: AskOptions, policy: Policy = DEFAULT_POLICY): Promise<PolicyResult> {
  const first = await ask(o);
  if (first.confidence >= policy.accept) return { answer: first.answer, confidence: first.confidence, decision: "accepted", trail: [first] };

  const expert = async (trail: HumanAnswer[]): Promise<PolicyResult> => {
    const e = await ask({ ...o, minAccuracy: Math.max(o.minAccuracy ?? 0, policy.expertAccuracy) });
    return { answer: e.answer, confidence: e.confidence, decision: "escalated", trail: [...trail, e] };
  };

  if (first.confidence < policy.secondOpinion) return expert([first]);

  const second = await ask(o);
  if (second.answer.trim().toLowerCase() === first.answer.trim().toLowerCase()) {
    // two independent humans agree: combined confidence 1 - (1-a)(1-b)
    const combined = 1 - (1 - first.confidence) * (1 - second.confidence);
    return { answer: first.answer, confidence: combined, decision: "consensus", trail: [first, second] };
  }
  return expert([first, second]);
}

export type HumanClientConfig = {
  /** Scrappy Human API base URL */
  apiUrl?: string;
  /** Agent wallet: 64-byte base58 secret key (private + public). Pays per call in USDC via x402. */
  secretKey: string;
};

/** Create a client. `human.ask()` pays one human; `human.askWithPolicy()` applies the confidence policy. */
export async function createHuman({ apiUrl = "https://api.scrappy.dev", secretKey }: HumanClientConfig) {
  const signer = await createKeyPairSignerFromBytes(base58.decode(secretKey));
  const client = new x402Client();
  client.register("solana:*", new ExactSvmScheme(signer));
  const pay = wrapFetchWithPayment(fetch, client);

  const ask: AskFn = async (o) => {
    const deadline = o.deadline ?? 60;
    const res = await pay(`${apiUrl}/v1/human/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        task: o.task,
        content: o.content,
        options: o.options,
        requirements: { language: o.language ?? "en", domain: o.domain ?? "general", max_latency: deadline, min_accuracy: o.minAccuracy ?? 0.8 },
      }),
    });
    if (res.status !== 200 && res.status !== 202) throw new Error(`Scrappy error ${res.status}: ${await res.text()}`);
    let body: any = await res.json();

    // still waiting: poll until a human answers or the deadline passes
    const until = Date.now() + deadline * 1000;
    while (body.status !== "answered" && Date.now() < until) {
      await new Promise((r) => setTimeout(r, 1000));
      body = await (await fetch(`${apiUrl}/v1/jobs/${body.job_id}`)).json();
    }
    if (body.status !== "answered") throw new Error(`No human answered within ${deadline}s (job ${body.job_id})`);
    return { job_id: body.job_id, answer: body.answer, confidence: body.confidence, human_id: body.human_id, latency_ms: body.latency_ms };
  };

  return {
    ask,
    askWithPolicy: (o: AskOptions, policy?: Policy) => applyPolicy(ask, o, policy),
    address: signer.address,
  };
}
