"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Pet, type PetDance, type PetMood } from "@/components/Pet";
import { LinkButton } from "@/components/ui/Button";
import { pct, secs } from "@/lib/api";
import { skillLabel, stageFor, stageName, usePet } from "@/lib/pet-store";
import { EnablePush } from "./EnablePush";
import { JoinPanel } from "./JoinPanel";
import { useWorker } from "./useWorker";

const TRICKS: { mood: PetMood; dance: PetDance }[] = [
  { mood: "excited", dance: "bounce" }, { mood: "love", dance: "wiggle" }, { mood: "wink", dance: "wave" },
  { mood: "happy", dance: "hop" }, { mood: "excited", dance: "spin" }, { mood: "happy", dance: "cheer" },
  { mood: "excited", dance: "twirl" }, { mood: "wink", dance: "peek" },
];

export function Home() {
  const { pet } = usePet();
  const { token, profile, offline } = useWorker();
  const [trick, setTrick] = useState<{ mood: PetMood; dance: PetDance } | null>(null);
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  if (!pet) return null;

  const { current } = stageFor(pet);
  const play = () => {
    setTrick(TRICKS[Math.floor(Math.random() * TRICKS.length)]);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setTrick(null), 2400);
  };
  const available = profile?.available_tasks ?? 0;
  const checks = profile?.qualification_checks ?? 0;
  const headline = checks
    ? `${checks} quick ${checks === 1 ? "check" : "checks"} to unlock paid tasks`
    : available ? `${available} ${available === 1 ? "task" : "tasks"} for you` : "No tasks this minute";

  return (
    <div className="mx-auto grid max-w-5xl gap-4 lg:grid-cols-[1.35fr_1fr] lg:gap-5">
      {/* earnings + work: the reason to open the app */}
      <section className="rounded-[28px] bg-ground-deep p-6 sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[15px] text-ink-soft">Earned today</p>
            <p className="money mt-1 font-display text-[clamp(3rem,9vw,4.4rem)] font-bold leading-none tabular-nums">
              ${(profile?.earnings.today_usdc ?? 0).toFixed(2)}
            </p>
            <p className="mt-2 text-[14px] text-ink-faint">
              ${(profile?.earnings.week_usdc ?? 0).toFixed(2)} this week · ${(profile?.earnings.total_usdc ?? pet.earnedUsdc ?? 0).toFixed(2)} all time
            </p>
          </div>
          <button type="button" onClick={play} aria-label={`Play with ${pet.name}`} className="scrappy-focus -mr-2 -mt-2 w-24 shrink-0 rounded-[20px] sm:w-28">
            <Pet species={pet.species} stage={current.id} mood={trick?.mood ?? (available ? "excited" : "happy")} dance={trick?.dance ?? "none"} watchPointer />
          </button>
        </div>

        <div className="mt-8 rounded-[20px] bg-field p-5">
          {!token ? (
            <p className="text-ink-soft">Connect a payout wallet below and tasks start reaching you.</p>
          ) : offline ? (
            <p className="text-ink-soft">Can&apos;t reach Scrappy right now. We&apos;ll keep trying.</p>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="font-display text-[26px] font-bold leading-tight">{headline}</p>
                <p className="mt-1 text-[14px] text-ink-soft">
                  {checks ? "Known-answer questions that measure your skill per language." : available ? "First to claim a seat answers it." : "Agents call in bursts. Keep notifications on."}
                </p>
              </div>
              <LinkButton href="/app/tasks">{checks ? "Start checks" : available ? "Start a task" : "Open tasks"}</LinkButton>
            </div>
          )}
        </div>
        {token && profile && !profile.push && <EnablePush className="mt-3" />}
      </section>

      {/* identity + reputation */}
      <section className="rounded-[28px] bg-ground-deep p-6 sm:p-8">
        <p className="text-[15px] text-ink-soft">Your Scrappy</p>
        <h1 className="mt-1 font-display text-[30px] font-bold leading-tight">{pet.name}</h1>
        <p className="text-[14px] text-ink-faint">{stageName(pet.species, current.id)} · Lv {profile?.level ?? 1} · {pet.languages.length} {pet.languages.length === 1 ? "language" : "languages"}</p>

        <dl className="mt-6 grid grid-cols-3 gap-3">
          <Stat label="Accuracy" value={profile?.accuracy != null ? pct(profile.accuracy) : "–"} hint={profile && profile.accuracy == null ? `${Math.max(0, 3 - profile.checks)} checks to go` : undefined} />
          <Stat label="Tasks" value={String(profile?.tasks_done ?? pet.jobsDone)} />
          <Stat label="Avg answer" value={secs(profile?.avg_response_ms)} />
        </dl>

        {!!profile?.skills.length && (
          <ul className="mt-6 space-y-3">
            {profile.skills.slice(0, 3).map((s) => (
              <li key={s.skill}>
                <div className="flex justify-between text-[14px]">
                  <span>{skillLabel(s.skill)}</span>
                  <span className="font-semibold tabular-nums">{pct(s.accuracy)}</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-field">
                  <div className="h-full rounded-full bg-leaf" style={{ width: `${s.accuracy * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
        <Link href="/app/profile" className="scrappy-focus mt-6 inline-block rounded text-[14px] font-semibold text-leaf transition-colors hover:text-leaf-hover">
          Skills and history
        </Link>
      </section>

      {!token && (
        <div className="lg:col-span-2">
          <JoinPanel />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-[16px] bg-field px-3 py-3">
      <dt className="text-[12.5px] text-ink-soft">{label}</dt>
      <dd className="mt-1 font-display text-[22px] font-bold leading-none tabular-nums">{value}</dd>
      {hint && <dd className="mt-1 text-[11.5px] text-ink-faint">{hint}</dd>}
    </div>
  );
}

