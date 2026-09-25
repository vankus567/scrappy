import { describe, expect, test } from "bun:test";
import { Scrappy, verifyWebhook } from "./index";

// A scripted Scrappy API stands in for the network; the SDK's escalation logic is what's under test.
function scriptedApi(rounds: Array<{ status: string; answer?: string; agreement?: number; humans: number } | "refuse">) {
  const posts: any[] = [];
  let i = 0;
  const f = (async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      posts.push(body);
      const r = rounds[i++];
      if (r === "refuse") return Response.json({ status: "insufficient_capacity", available: 1, required: body.humans }, { status: 409 });
      return Response.json({ task_id: `t${i}` }, { status: 201 });
    }
    const id = String(url).match(/tasks\/(t\d+)/)![1];
    const r = rounds[Number(id.slice(1)) - 1] as any;
    const price = posts[Number(id.slice(1)) - 1].budget ?? 0.15;
    return Response.json({ task_id: id, votes: [], latency_ms: 8000, confidence: 0.8, price_usdc: price, refund_usdc: 0, ...r });
  }) as typeof fetch;
  return { scrappy: new Scrappy({ apiKey: "scrappy_sk_test", baseUrl: "http://scrappy.test", fetch: f }), posts };
}

describe("scrappy.consensus", () => {
  test("clear agreement returns after one round", async () => {
    const { scrappy, posts } = scriptedApi([{ status: "completed", answer: "vulnerable", agreement: 1, humans: 3 }]);
    const r = await scrappy.consensus({ task: "Is this code vulnerable?", humans: 3, budget: 0.3, deadline: 20 });
    expect(r).toMatchObject({ status: "completed", answer: "vulnerable", agreement: 1, humans: 3, spent_usdc: 0.3 });
    expect(posts).toHaveLength(1);
  });

  test("67% agreement escalates with 2 more humans, extending the same task", async () => {
    const { scrappy, posts } = scriptedApi([
      { status: "low_confidence", answer: "B", agreement: 0.667, humans: 3 },
      { status: "completed", answer: "B", agreement: 0.8, humans: 5 },
    ]);
    const r = await scrappy.consensus({ task: "Which translation is natural?", options: ["A", "B"], humans: 3, budget: 0.15, maxHumans: 5 });
    expect(r).toMatchObject({ status: "completed", agreement: 0.8, humans: 5, rounds: ["t1", "t2"] });
    expect(posts[1]).toMatchObject({ extends: "t1", humans: 2, budget: 0.1 });
  });

  test("maxBudget stops escalation", async () => {
    const { scrappy, posts } = scriptedApi([{ status: "low_confidence", answer: "B", agreement: 0.667, humans: 3 }]);
    const r = await scrappy.consensus({ task: "x?", humans: 3, budget: 0.15, maxHumans: 7, maxBudget: 0.2 });
    expect(r.status).toBe("low_confidence");
    expect(posts).toHaveLength(1);
  });

  test("insufficient capacity is a result, not an exception", async () => {
    const { scrappy } = scriptedApi(["refuse"]);
    const r = await scrappy.consensus({ task: "Telugu check?", humans: 3, language: "te" });
    expect(r).toMatchObject({ status: "insufficient_capacity", available: 1, required: 3, answer: null, spent_usdc: 0 });
  });
});

describe("webhooks", () => {
  test("valid signatures verify; tampered or stale ones do not", async () => {
    const secret = "whsec_test";
    const body = '{"type":"task.finished"}';
    const t = Date.now();
    const mac = new Bun.CryptoHasher("sha256", secret).update(`${t}.${body}`).digest("hex");
    expect(await verifyWebhook(secret, body, `t=${t},v1=${mac}`)).toBe(true);
    expect(await verifyWebhook(secret, body + " ", `t=${t},v1=${mac}`)).toBe(false);
    expect(await verifyWebhook(secret, body, `t=${t - 10 * 60_000},v1=${mac}`)).toBe(false);
  });
});
