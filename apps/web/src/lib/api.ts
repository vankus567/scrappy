// Client for the Scrappy Human API (apps/api). Worker-side calls only; agents pay via x402.
export const API_URL = process.env.NEXT_PUBLIC_SCRAPPY_API ?? "http://localhost:8787";

export type WorkerStats = { worker_id: string; languages: string[]; jobs_done: number; owed_usdc: number };
export type WorkerJob = {
  job_id: string;
  task: string;
  content: string | null;
  options: string[] | null;
  language: string;
  pays_usdc: number;
  answer_within_ms: number;
};

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(typeof body.error === "string" ? body.error : `API error ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function registerWorker(wallet: string, languages: string[], profile: { pet_name?: string; species?: string; city?: string } = {}) {
  return j<{ worker_id: string; jobs_done: number; owed_usdc: number }>(
    await fetch(`${API_URL}/v1/workers`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ wallet, languages, ...profile }),
    }),
  );
}

export async function getWorker(id: string) {
  return j<WorkerStats>(await fetch(`${API_URL}/v1/workers/${id}`));
}

/** Next job for this worker, or null when none is waiting. */
export async function nextJob(workerId: string): Promise<WorkerJob | null> {
  const res = await fetch(`${API_URL}/v1/workers/${workerId}/next`);
  if (res.status === 204) return null;
  return j<WorkerJob>(res);
}

export async function submitAnswer(jobId: string, workerId: string, answer: string, confidence: number) {
  return j<{ ok: true; earned_usdc: number }>(
    await fetch(`${API_URL}/v1/jobs/${jobId}/answer`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ worker_id: workerId, answer, confidence }),
    }),
  );
}

export const formatUsd = (n: number) => `$${n.toFixed(n < 1 ? 2 : 2)}`;
