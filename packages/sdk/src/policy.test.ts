import { describe, expect, test } from "bun:test";
import { applyPolicy, type AskOptions, type HumanAnswer } from "./index";

// A scripted sequence of human answers stands in for the network; the policy logic is what's under test.
function scripted(answers: Array<[string, number]>) {
  const calls: AskOptions[] = [];
  let i = 0;
  const ask = async (o: AskOptions): Promise<HumanAnswer> => {
    calls.push(o);
    const [answer, confidence] = answers[i++];
    return { job_id: `j${i}`, answer, confidence, human_id: `h${i}`, latency_ms: 5000 };
  };
  return { ask, calls };
}

const q: AskOptions = { task: "Which is correct?", options: ["A", "B"] };

describe("confidence policy", () => {
  test("high confidence is accepted from one human", async () => {
    const { ask, calls } = scripted([["A", 0.95]]);
    const r = await applyPolicy(ask, q);
    expect(r.decision).toBe("accepted");
    expect(calls.length).toBe(1);
  });

  test("medium confidence asks a second human; agreement boosts confidence", async () => {
    const { ask } = scripted([["A", 0.8], ["a", 0.75]]);
    const r = await applyPolicy(ask, q);
    expect(r.decision).toBe("consensus");
    expect(r.confidence).toBeCloseTo(1 - 0.2 * 0.25);
  });

  test("disagreement escalates to an expert with high accuracy", async () => {
    const { ask, calls } = scripted([["A", 0.8], ["B", 0.85], ["B", 0.97]]);
    const r = await applyPolicy(ask, q);
    expect(r.decision).toBe("escalated");
    expect(r.answer).toBe("B");
    expect(calls[2].minAccuracy).toBe(0.95);
  });

  test("low confidence goes straight to an expert", async () => {
    const { ask, calls } = scripted([["A", 0.5], ["A", 0.99]]);
    const r = await applyPolicy(ask, q);
    expect(r.decision).toBe("escalated");
    expect(calls.length).toBe(2);
  });
});
