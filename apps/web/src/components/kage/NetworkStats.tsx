"use client";

import { useEffect, useState } from "react";
import { getStats, pct, secs, usd, type NetworkStats as Stats } from "@/lib/api";

/** Live network numbers, straight from the Kage API. Nothing estimated; zero is shown as zero. */
export function NetworkStats({ poll = 10_000, dense = false }: { poll?: number; dense?: boolean }) {
  const [s, setS] = useState<Stats | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    const pull = () => getStats().then((d) => alive && (setS(d), setError(false))).catch(() => alive && setError(true));
    pull();
    const t = window.setInterval(pull, poll);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [poll]);

  if (error) return <p className="rounded-[22px] bg-ground-deep p-6 text-ink-soft">The live network isn&apos;t reachable from here right now.</p>;
  if (!s) return <div aria-busy="true" className="h-36 animate-pulse rounded-[22px] bg-ground-deep" />;

  const tiles: [string, string][] = [
    ["Human answers", s.human_answers.toLocaleString()],
    ["Paid by agents", usd(s.agent_spend_usdc)],
    ["Median time to consensus", secs(s.median_latency_ms)],
    ["Average agreement", pct(s.avg_agreement)],
    ["Humans online now", `${s.workers_online} of ${s.workers}`],
    ["Paid out to humans", usd(s.paid_to_humans_usdc)],
  ];
  return (
    <dl className={`grid gap-2 ${dense ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2 lg:grid-cols-3"}`}>
      {tiles.map(([k, v]) => (
        <div key={k} className="rounded-[20px] bg-ground-deep p-5">
          <dt className="text-[14px] text-ink-soft">{k}</dt>
          <dd className="mt-2 font-display text-[clamp(1.6rem,3.4vw,2.4rem)] font-bold leading-none tabular-nums">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
