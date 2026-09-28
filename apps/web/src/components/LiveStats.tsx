"use client";

import { useEffect, useState } from "react";
import { API_URL } from "@/lib/api";

type Stats = { human_answers: number; agent_spend_usdc: number; median_latency_ms: number | null; workers: number };

export function LiveStats() {
  const [s, setS] = useState<Stats | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    const pull = () =>
      fetch(`${API_URL}/v1/stats`)
        .then((r) => r.json())
        .then((d) => alive && (setS(d), setError(false)))
        .catch(() => alive && setError(true));
    pull();
    const t = window.setInterval(pull, 5000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, []);

  const tiles: [string, string][] = s
    ? [
        ["Human answers", s.human_answers.toLocaleString()],
        ["Paid by agents", `$${s.agent_spend_usdc.toFixed(2)}`],
        ["Median time to a human", s.median_latency_ms == null ? "No answers yet" : `${(s.median_latency_ms / 1000).toFixed(1)} s`],
        ["Workers", s.workers.toLocaleString()],
      ]
    : [];

  return (
    <section className="mt-10">
      {error && <p className="rounded-[24px] bg-ground-deep p-6 text-ink-soft">Can&rsquo;t reach the Human API right now.</p>}
      {!error && !s && <div aria-busy="true" className="h-48 animate-pulse rounded-[28px] bg-ground-deep" />}
      {!error && s && (
        <dl className="grid gap-4 sm:grid-cols-2">
          {tiles.map(([k, v]) => (
            <div key={k} className="rounded-[24px] bg-ground-deep p-6">
              <dt className="text-[15px] text-ink-soft">{k}</dt>
              <dd className="mt-2 font-display text-[clamp(2rem,4vw,2.8rem)] font-bold tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
