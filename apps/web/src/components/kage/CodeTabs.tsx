"use client";

import { useState } from "react";

const TABS = {
  SDK: `import { Kage } from "@kage/sdk";

const kage = new Kage({ apiKey: process.env.KAGE_API_KEY });

const r = await kage.consensus({
  task: "Does this change let one user act as another?",
  content: diff,
  skill: "security",
  humans: 3,
  budget: 0.30,   // USDC for all three
  deadline: 20,   // seconds
  maxHumans: 5,   // add 2 more if they disagree
});

if (r.answer === "yes") cancelDeploy();`,
  MCP: `// git clone https://github.com/Venkat5599/solana_coloseum && bun install
// then in claude_desktop_config.json, .cursor/mcp.json, ...
{
  "mcpServers": {
    "kage": {
      "command": "bun",
      "args": ["<repo>/apps/mcp/src/index.ts"],
      "env": { "KAGE_API_KEY": "kage_sk_..." }
    }
  }
}

// Tools your agent gets:
//   kage_ask_human       one human, one judgment
//   kage_consensus       n humans, majority + agreement
//   kage_find_capacity   who is online right now (free)`,
  REST: `curl https://kageai.me/v1/consensus \\
  -H "authorization: Bearer $KAGE_API_KEY" \\
  -H "content-type: application/json" \\
  -d '{
    "task": "Which Telugu reply sounds natural?",
    "options": ["A", "B"],
    "language": "te",
    "humans": 3,
    "budget": 0.30,
    "deadline": 20
  }'
# => 201 { "task_id": "...", "poll": "/v1/tasks/...?wait=20" }

# No API key? Omit it: the call answers 402 and your agent
# pays per task in USDC over x402 on Solana.`,
} as const;

const RESPONSE = `{
  "status": "completed",
  "answer": "yes",
  "agreement": 1.0,
  "confidence": 0.86,
  "humans": 3,
  "votes": [{ "answer": "yes", "humans": 3 }],
  "latency_ms": 6300,
  "price_usdc": 0.3
}`;

const CAPACITY = `{
  "status": "insufficient_capacity",
  "reason": "Not enough qualified humans are online",
  "available": 1,
  "required": 3
}`;

export function CodeTabs() {
  const [tab, setTab] = useState<keyof typeof TABS>("SDK");
  const [out, setOut] = useState<"result" | "capacity">("result");
  return (
    <div className="grid gap-3 lg:grid-cols-[1.35fr_1fr]">
      <div className="min-w-0 rounded-[22px] bg-ground-deep">
        <div role="tablist" aria-label="Integration" className="flex gap-1 p-2">
          {(Object.keys(TABS) as (keyof typeof TABS)[]).map((k) => (
            <button
              key={k}
              role="tab"
              type="button"
              id={`tab-${k}`}
              aria-selected={tab === k}
              aria-controls="code-panel"
              onClick={() => setTab(k)}
              className={`kage-focus rounded-[12px] px-3.5 py-2 text-[14px] font-semibold transition-colors ${tab === k ? "bg-field text-ink" : "text-ink-faint hover:text-ink-soft"}`}
            >
              {k}
            </button>
          ))}
        </div>
        <pre id="code-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="overflow-x-auto px-5 pb-5 font-mono text-[13px] leading-relaxed text-ink-soft">
          {TABS[tab]}
        </pre>
      </div>
      <div className="min-w-0 rounded-[22px] bg-ground-deep">
        <div className="flex gap-1 p-2" role="tablist" aria-label="Response">
          {([["result", "Result"], ["capacity", "Nobody available"]] as const).map(([k, label]) => (
            <button
              key={k}
              role="tab"
              type="button"
              aria-selected={out === k}
              onClick={() => setOut(k)}
              className={`kage-focus rounded-[12px] px-3.5 py-2 text-[14px] font-semibold transition-colors ${out === k ? "bg-field text-ink" : "text-ink-faint hover:text-ink-soft"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <pre className="overflow-x-auto px-5 pb-5 font-mono text-[13px] leading-relaxed text-ink-soft">{out === "result" ? RESPONSE : CAPACITY}</pre>
        <p className="px-5 pb-5 text-[13px] leading-relaxed text-ink-faint">
          {out === "result"
            ? "Majority answer, how many agreed, and how sure the proven humans were."
            : "Kage never hangs and never fakes it. You get this before paying, then decide: retry, raise the reward, or stop."}
        </p>
      </div>
    </div>
  );
}
