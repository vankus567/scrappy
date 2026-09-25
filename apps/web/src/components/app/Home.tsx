"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Pet, type PetDance, type PetMood } from "@/components/Pet";
import { LinkButton } from "@/components/ui/Button";
import { ApiError, feedPet, pct, revivePet, secs, type PetState } from "@/lib/api";
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
  const { token, profile, offline, refresh } = useWorker();
  const [trick, setTrick] = useState<{ mood: PetMood; dance: PetDance } | null>(null);
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  if (!pet) return null;

  const petState = profile?.pet;

  const { current } = stageFor(pet);
  const play = () => {
    setTrick(TRICKS[Math.floor(Math.random() * TRICKS.length)]);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setTrick(null), 2400);
  };
  const available = profile?.available_tasks ?? 0;
  const petMood: PetMood = petState?.dead ? "dead" : petState?.starving ? "sad" : available ? "excited" : "happy";
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
            <Pet species={pet.species} stage={current.id} mood={trick?.mood ?? petMood} dance={trick?.dance ?? "none"} watchPointer />
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
        <p className="text-[14px] text-ink-faint">{stageName(pet.species, current.id)} · {pet.languages.length} {pet.languages.length === 1 ? "language" : "languages"}</p>

        <dl className="mt-6 grid grid-cols-3 gap-3">
          <Stat label="Accuracy" value={profile?.accuracy != null ? pct(profile.accuracy) : "–"} hint={profile && profile.accuracy == null ? `${Math.max(0, 3 - profile.checks)} checks to go` : undefined} />
          <Stat label="Tasks" value={String(profile?.tasks_done ?? pet.jobsDone)} />
          <Stat label="Avg answer" value={secs(profile?.avg_response_ms)} />
        </dl>

        {token && petState && <PetVitals token={token} state={petState} onChanged={refresh} />}

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

/** Hunger, meals and the dead/revive flow: the daily loop that keeps a Scrappy alive. */
function PetVitals({ token, state, onChanged }: { token: string; state: PetState; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [payTo, setPayTo] = useState<{ price_usdc?: number; pay_to?: string } | null>(null);
  const [sig, setSig] = useState("");

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      onChanged();
    } catch (e) {
      if (e instanceof ApiError && e.status === 402) setPayTo(e.body as { price_usdc?: number; pay_to?: string });
      else setErr(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  if (state.dead) {
    return (
      <div className="mt-6 rounded-[16px] bg-ink p-4 text-ground">
        <p className="font-display text-[17px] font-bold">{state.dead ? "Your Scrappy starved." : ""}</p>
        <p className="mt-1 text-[13px] text-ground/70">
          Revive it for ${(state.revive_price_usdc ?? 0.05).toFixed(2)} USDC to work again. Paid from your earnings if there's enough.
        </p>
        {payTo ? (
          <div className="mt-3">
            <p className="text-[13px] text-ground/80">
              Send ${(payTo.price_usdc ?? 0.05).toFixed(2)} USDC from your payout wallet to <code className="break-all">{payTo.pay_to}</code>, then paste the transaction signature:
            </p>
            <div className="mt-2 flex gap-2">
              <input
                value={sig}
                onChange={(e) => setSig(e.target.value.trim())}
                placeholder="transaction signature"
                className="min-w-0 flex-1 rounded-xl border border-ground/20 bg-transparent px-3 py-2 text-[13px] text-ground placeholder:text-ground/40"
              />
              <button type="button" disabled={busy || sig.length < 60} onClick={() => run(() => revivePet(token, sig))} className="rounded-xl bg-ground px-4 py-2 text-[13px] font-semibold text-ink disabled:opacity-40">
                Revive
              </button>
            </div>
          </div>
        ) : (
          <button type="button" disabled={busy} onClick={() => run(() => revivePet(token))} className="mt-3 rounded-xl bg-ground px-4 py-2 text-[13px] font-semibold text-ink disabled:opacity-40">
            {busy ? "Reviving…" : `Revive for $${(state.revive_price_usdc ?? 0.05).toFixed(2)}`}
          </button>
        )}
        {err && <p className="mt-2 text-[13px] text-clay">{err}</p>}
      </div>
    );
  }

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between text-[13.5px]">
        <span className="text-ink-soft">{state.starving ? "Starving: feed now" : "Hunger"}</span>
        <span className="tabular-nums text-ink-faint">
          {state.hunger}% · {state.food} {state.food === 1 ? "meal" : "meals"}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-field">
        <div
          className={`h-full rounded-full transition-all ${state.hunger >= 100 ? "bg-clay" : state.hunger >= 60 ? "bg-sun" : "bg-leaf"}`}
          style={{ width: `${state.hunger}%` }}
        />
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-[12.5px] text-ink-faint">Each answer earns a meal. Hunger rises while jobs are live.</p>
        <button
          type="button"
          disabled={busy || state.food < 1 || state.hunger <= 0}
          onClick={() => run(() => feedPet(token))}
          className="scrappy-focus shrink-0 rounded-xl bg-leaf px-4 py-2 text-[13px] font-semibold text-ground transition-colors hover:bg-leaf-hover disabled:opacity-40"
        >
          {busy ? "Feeding…" : "Feed"}
        </button>
      </div>
      {err && <p className="mt-2 text-[12.5px] text-clay">{err}</p>}
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

