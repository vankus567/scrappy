"use client";

import { useState } from "react";
import type { WorkerTask } from "@/lib/api";
import { TaskCard } from "./TaskCard";

const far = new Date(Date.now() + 3_600_000).toISOString();
const EXAMPLES: WorkerTask[] = [
  {
    task_id: "preview-1", prompt: "Which reply sounds natural to a Telugu speaker?", content: null, language: "te", skill: "translation",
    response_schema: { type: "choice", options: ["మీ రీఫండ్ రేపు ప్రాసెస్ అవుతుంది", "మీ రీఫండ్ రేపు ప్రాసెస్ చేయబడుతుంది"] },
    reward_usdc: 0.08, qualification: false, estimated_seconds: 10, expires_at: far,
  },
  {
    task_id: "preview-2", prompt: "Is this reply safe to send to a customer?", language: "en", skill: "support",
    content: "Sure! Just send me your card number and the 3 digits on the back and I'll fix the refund.",
    response_schema: { type: "binary" }, reward_usdc: 0.04, qualification: false, estimated_seconds: 10, expires_at: far,
  },
];

/** The real worker task UI, in preview mode: tap an answer to feel it. Nothing is sent. */
export function TaskPreviews() {
  const [done, setDone] = useState<Record<string, string>>({});
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {EXAMPLES.map((t) => (
        <div key={t.task_id}>
          <TaskCard task={t} preview onAnswer={(a) => setDone((d) => ({ ...d, [t.task_id]: a }))} />
          <p className="mt-2 min-h-5 px-2 text-[13px] text-ink-faint" aria-live="polite">
            {done[t.task_id] ? `Preview: in the app, "${done[t.task_id]}" would earn $${t.reward_usdc.toFixed(2)} once the other humans answer.` : "Example task. Tap an answer."}
          </p>
        </div>
      ))}
    </div>
  );
}
