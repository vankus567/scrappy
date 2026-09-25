"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Pet } from "@/components/Pet";
import { getHistory, pct, secs, type History } from "@/lib/api";
import { LANGUAGES, skillLabel, STAGES, stageFor, stageName, usePet } from "@/lib/pet-store";
import { JoinPanel } from "./JoinPanel";
import { useWorker } from "./useWorker";

/** The worker's Scrappy: identity, measured skill (never self-declared), forms earned by real tasks, and history. */
export function ProfilePanel() {
  const { pet } = usePet();
  const { token, profile } = useWorker();
  const [history, setHistory] = useState<History | null>(null);

  useEffect(() => {
    if (token) getHistory(token).then(setHistory).catch(() => {});
  }, [token, profile?.tasks_done]);

  if (!pet) return null;
  const { current, next } = stageFor(pet);

  return (
    <div className="mx-auto grid max-w-5xl gap-4 lg:grid-cols-[1fr_1.25fr] lg:gap-5">
      <section className="rounded-[28px] bg-ground-deep p-6 sm:p-8">
        <Pet species={pet.species} stage={current.id} mood="happy" watchPointer className="mx-auto w-44" title={pet.name} />
        <h1 className="mt-3 text-center font-display text-[32px] font-bold leading-tight">{pet.name}</h1>
        <p className="text-center text-[14px] text-ink-soft">
          {stageName(pet.species, current.id)}
          {next ? ` · next form at ${next.jobs} tasks` : " · fully grown"}
        </p>

        <ol className="mt-6 grid grid-cols-4 gap-2" aria-label="Forms">
          {STAGES.map((st, i) => {
            const reached = i <= STAGES.indexOf(current);
            return (
              <li key={st.id} className="text-center">
                <div className={reached ? "" : "opacity-30 grayscale"}>
                  <Pet species={pet.species} stage={st.id} mood={reached ? "happy" : "focused"} className="mx-auto w-full max-w-[72px]" title={stageName(pet.species, st.id)} />
                </div>
                <p className="mt-1 text-[12px] text-ink-faint">{st.jobs === 0 ? "Start" : `${st.jobs} tasks`}</p>
              </li>
            );
          })}
        </ol>

        <dl className="mt-6 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-[14px] bg-field py-3"><dt className="text-[12px] text-ink-soft">Tasks</dt><dd className="font-display text-[20px] font-bold tabular-nums">{profile?.tasks_done ?? pet.jobsDone}</dd></div>
          <div className="rounded-[14px] bg-field py-3"><dt className="text-[12px] text-ink-soft">Accuracy</dt><dd className="font-display text-[20px] font-bold tabular-nums">{pct(profile?.accuracy)}</dd></div>
          <div className="rounded-[14px] bg-field py-3"><dt className="text-[12px] text-ink-soft">Avg answer</dt><dd className="font-display text-[20px] font-bold tabular-nums">{secs(profile?.avg_response_ms)}</dd></div>
        </dl>
        <p className="mt-5 text-[13px] leading-relaxed text-ink-faint">
          Languages: {pet.languages.map((l) => LANGUAGES.find((x) => x.id === l)?.label ?? l).join(", ")}
        </p>
      </section>

      <div className="space-y-4">
        <section className="rounded-[28px] bg-ground-deep p-6 sm:p-8">
          <h2 className="font-display text-[24px] font-bold">Skills</h2>
          <p className="mt-1 text-[14px] text-ink-soft">Measured from hidden checks and agreement with other humans. Higher skill unlocks better-paid and expert tasks.</p>
          {profile?.skills.length ? (
            <ul className="mt-5 space-y-4">
              {profile.skills.map((s) => (
                <li key={s.skill}>
                  <div className="flex items-baseline justify-between gap-3 text-[15px]">
                    <span className="font-semibold">{skillLabel(s.skill)}</span>
                    <span className="tabular-nums"><span className="font-bold">{pct(s.accuracy)}</span> <span className="text-[13px] text-ink-faint">· {s.samples} checks</span></span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-field">
                    <div className="h-full rounded-full bg-leaf" style={{ width: `${s.accuracy * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-5 text-ink-soft">{token ? "No checks yet. Your first tasks measure your skill per language." : "Connect a wallet to start building skill."}</p>
          )}
        </section>

        {!token && <JoinPanel compact />}

        {!!history?.answers.length && (
          <section className="rounded-[28px] bg-ground-deep p-6 sm:p-8">
            <h2 className="font-display text-[24px] font-bold">Recent answers</h2>
            <ul className="mt-4 divide-y divide-edge">
              {history.answers.slice(0, 12).map((a, i) => (
                <li key={i} className="flex items-start justify-between gap-4 py-3 text-[14px]">
                  <div className="min-w-0">
                    <p className="truncate">{a.prompt}</p>
                    <p className="text-ink-faint">
                      You said <span className="text-ink-soft">{a.answer}</span>
                      {a.matched_consensus === true && " · matched the majority"}
                      {a.matched_consensus === false && " · the majority disagreed"}
                      {a.qualification && " · check"}
                    </p>
                  </div>
                  <span className={`shrink-0 font-semibold tabular-nums ${a.earned_usdc ? "money" : "text-ink-faint"}`}>
                    {a.earned_usdc ? `+$${a.earned_usdc.toFixed(2)}` : "–"}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <Link href="/app/settings" className="scrappy-focus inline-block rounded px-1 text-[14px] font-semibold text-leaf transition-colors hover:text-leaf-hover">
          Settings: name, languages, notifications
        </Link>
      </div>
    </div>
  );
}
