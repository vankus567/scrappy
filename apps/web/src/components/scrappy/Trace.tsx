"use client";

import { useEffect, useState } from "react";
import { Pet, type Species } from "@/components/Pet";
import { Wordmark } from "./Wordmark";

const HUMANS: { species: Species; vote: string; at: string }[] = [
  { species: "neko", vote: "yes", at: "2.9 s" },
  { species: "kitsu", vote: "yes", at: "4.1 s" },
  { species: "pengu", vote: "yes", at: "6.3 s" },
];
const LAST = 6; // 0 ask · 1 route · 2-4 humans · 5 consensus · 6 continue + pay
const PAY = (0.3 / 3) * 0.8;

/**
 * One Scrappy call, end to end. Server-rendered at the final step, so every node is visible without JS;
 * on the client it replays the call step by step. Motion changes tone only, never visibility.
 */
export function Trace() {
  const [step, setStep] = useState(LAST);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let s = LAST;
    let t = 0;
    const run = () => {
      s = s >= LAST ? 0 : s + 1;
      setStep(s);
      t = window.setTimeout(run, s === LAST ? 3600 : s === 0 ? 1100 : 900);
    };
    t = window.setTimeout(run, 2200);
    return () => window.clearTimeout(t);
  }, []);

  const lit = (n: number) => step >= n;
  const on = (n: number) => String(step === n || (n === LAST && step === LAST));

  return (
    <figure className="w-full" aria-label="Example Scrappy call: an AI coding agent asks three humans before deploying">
      <div className="grid items-stretch gap-3 lg:grid-cols-[1.25fr_auto_0.9fr_auto_1.15fr_auto_1.1fr] lg:gap-0">
        {/* agent */}
        <div className="trace-node rounded-[22px] border border-transparent bg-ground-deep p-5" data-lit={on(0)}>
          <p className="text-[13px] text-ink-faint">AI coding agent</p>
          <p className="mt-2 text-[15px] leading-snug">Changed an auth check. Before deploying: does this let one user act as another?</p>
          <pre className="mt-3 overflow-x-auto rounded-[12px] bg-field px-3 py-2.5 font-mono text-[12px] leading-relaxed text-ink-soft">
{`scrappy.consensus({
  humans: 3,
  budget: 0.30,
  deadline: 20,
})`}
          </pre>
        </div>

        <Wire lit={lit(1)} flowing={step === 1} />

        {/* scrappy */}
        <div className="trace-node flex flex-col justify-center rounded-[22px] border border-transparent bg-ground-deep p-5" data-lit={on(1)}>
          <Wordmark className="text-[26px]" />
          <p className="mt-5 text-[14px] leading-snug text-ink-soft">Finds 3 online humans with proven security skill. Each answers alone.</p>
        </div>

        <Wire lit={lit(2)} flowing={step >= 2 && step <= 4} />

        {/* humans */}
        <ul className="grid gap-2">
          {HUMANS.map((h, i) => {
            const answered = lit(2 + i);
            return (
              <li key={h.species} className="trace-node flex items-center gap-3 rounded-[18px] border border-transparent bg-ground-deep py-2 pl-2 pr-4" data-lit={on(2 + i)}>
                <Pet species={h.species} stage="mochi" mood={answered ? "focused" : "curious"} className="size-12 shrink-0" title={`Human ${i + 1}`} />
                <span className="text-[14px] text-ink-soft">Human {i + 1}</span>
                <span className={`ml-auto font-display text-[18px] font-bold transition-colors duration-300 ${answered ? "text-ink" : "text-ink-faint"}`}>
                  {answered ? h.vote : "reading"}
                </span>
                <span className="w-11 text-right text-[12px] tabular-nums text-ink-faint">{answered ? h.at : ""}</span>
              </li>
            );
          })}
        </ul>

        <Wire lit={lit(5)} flowing={step === 5} />

        {/* consensus → agent continues → humans paid */}
        <div className="trace-node flex flex-col rounded-[22px] border border-transparent bg-ground-deep p-5" data-lit={on(5)}>
          <p className="text-[13px] text-ink-faint">Returned to the agent</p>
          <pre className="mt-2 font-mono text-[12.5px] leading-relaxed text-ink-soft">
{`{ "answer": "yes",
  "agreement": 1.0,
  "humans": 3 }`}
          </pre>
          <p className={`mt-3 font-display text-[19px] font-bold leading-tight transition-colors duration-300 ${lit(6) ? "text-ink" : "text-ink-faint"}`}>
            Deploy cancelled.
          </p>
          <p className={`mt-auto pt-3 text-[14px] transition-colors duration-300 ${lit(6) ? "money" : "text-ink-faint"}`}>
            +${PAY.toFixed(2)} USDC to each human
          </p>
        </div>
      </div>
      <figcaption className="mt-3 text-[13px] text-ink-faint">Example call, in the exact shape the API returns. Live network numbers are further down.</figcaption>
    </figure>
  );
}

function Wire({ lit, flowing }: { lit: boolean; flowing: boolean }) {
  return (
    <div className="flex items-center justify-center py-0.5 lg:px-1.5 lg:py-0" aria-hidden>
      <svg viewBox="0 0 40 16" className="h-4 w-10 rotate-90 lg:rotate-0">
        <path d="M2 8h30" className={`trace-wire ${flowing ? "trace-pulse" : ""}`} data-lit={String(lit)} strokeWidth="2" strokeLinecap="round" fill="none" />
        <path d="M28 3.5 34 8l-6 4.5" className="trace-wire" data-lit={String(lit)} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
    </div>
  );
}
