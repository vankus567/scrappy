"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { GlossButton } from "@/components/GlossButton";
import { Pet } from "@/components/Pet";
import { nextJob, submitAnswer, type WorkerJob } from "@/lib/api";
import { stageFor, usePet } from "@/lib/pet-store";
import { useWorkerSync } from "./useWorkerSync";

type Reward = { earned: number } | null;

export function JobsWaiting() {
  const { pet, update } = usePet();
  const [job, setJob] = useState<WorkerJob | null>(null);
  const [answer, setAnswer] = useState("");
  const [confidence, setConfidence] = useState(80);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reward, setReward] = useState<Reward>(null);
  const [offline, setOffline] = useState(false);
  useWorkerSync();

  const workerId = pet?.workerId;
  const stage = pet ? stageFor(pet).current.id : "mochi";
  const name = pet?.name ?? "Your pet";

  const poll = useCallback(async () => {
    if (!workerId) return;
    try {
      const next = await nextJob(workerId);
      setOffline(false);
      if (next) {
        setJob(next);
        setAnswer("");
        setConfidence(80);
        if ("vibrate" in navigator) navigator.vibrate?.(120);
      }
    } catch {
      setOffline(true);
    }
  }, [workerId]);

  // look for work every 3 s while no job is open
  useEffect(() => {
    if (!workerId || job || reward) return;
    poll();
    const t = window.setInterval(poll, 3000);
    return () => window.clearInterval(t);
  }, [workerId, job, reward, poll]);

  const submit = async () => {
    if (!job || !workerId || !answer.trim()) return;
    setBusy(true);
    setError("");
    try {
      const r = await submitAnswer(job.job_id, workerId, answer.trim(), confidence);
      update({ jobsDone: (pet?.jobsDone ?? 0) + 1, earnedUsdc: (pet?.earnedUsdc ?? 0) + r.earned_usdc });
      setJob(null);
      setReward({ earned: r.earned_usdc });
      window.setTimeout(() => setReward(null), 2800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send your answer.");
    } finally {
      setBusy(false);
    }
  };

  // not registered yet
  if (!workerId) {
    return (
      <Shell pet={pet} stage={stage} mood="curious" dance="wave" name={name}>
        <h1 className="font-display text-[clamp(1.8rem,3vw,2.4rem)] font-bold leading-[1.1]">One step before jobs</h1>
        <p className="mt-3 text-ink-soft">Add your Solana payout wallet so agents can pay you. It takes ten seconds.</p>
        <div className="mt-6">
          <GlossButton href="/app/wallet">Add payout wallet</GlossButton>
        </div>
      </Shell>
    );
  }

  // reward moment
  if (reward) {
    return (
      <Shell pet={pet} stage={stage} mood="excited" dance="cheer" name={name}>
        <p className="text-[14px] font-semibold text-ink-soft">Answer accepted</p>
        <p className="reward-pop mt-1 font-display text-[clamp(2.6rem,6vw,3.8rem)] font-bold leading-none text-[#9fe3b8]">
          +${reward.earned.toFixed(2)}
        </p>
        <p className="mt-3 text-ink-soft">{name} ate. Earned to your payout wallet.</p>
      </Shell>
    );
  }

  // a job is open
  if (job) {
    const choices = job.options ?? [];
    return (
      <div className="grid gap-5 lg:grid-cols-[320px_1fr] lg:items-start">
        <div className="rounded-[28px] bg-ground-deep p-6">
          <Pet species={pet?.species} stage={stage} mood="focused" dance="none" watchPointer className="mx-auto w-44" title={`${name} found a job`} />
          <p className="mt-2 text-center font-semibold">{name} found a job</p>
          <p className="text-center text-[14px] text-ink-soft">Pays ${job.pays_usdc.toFixed(2)} · answer within 60 seconds</p>
        </div>

        <section className="space-y-6 rounded-[28px] bg-ground-deep p-6 sm:p-8">
          <p className="text-[14px] font-semibold text-ink-faint">From an AI agent · {job.language}</p>
          <h1 className="font-display text-[clamp(1.6rem,3vw,2.2rem)] font-bold leading-[1.15]">{job.task}</h1>
          {job.content && (
            <p lang={job.language} className="rounded-[18px] bg-field p-4 text-[18px] leading-relaxed">{job.content}</p>
          )}

          {choices.length ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {choices.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  aria-pressed={answer === opt}
                  onClick={() => setAnswer(opt)}
                  className={`min-h-14 rounded-[16px] px-4 py-3 text-left text-[16px] font-semibold transition-colors active:scale-[0.99] ${answer === opt ? "bg-leaf text-on-leaf" : "bg-field hover:bg-field-hover"}`}
                >
                  {opt}
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              <label htmlFor="ans" className="block text-[15px] font-medium">Your answer</label>
              <textarea id="ans" value={answer} onChange={(e) => setAnswer(e.target.value)} rows={3} className="w-full rounded-[14px] bg-field p-4 text-[16px] outline-none ring-leaf focus-visible:ring-2" />
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="conf" className="flex items-baseline justify-between text-[15px] font-medium">
              How sure are you? <span className="font-display text-[22px] font-bold tabular-nums">{confidence}%</span>
            </label>
            <input id="conf" type="range" min={0} max={100} step={5} value={confidence} onChange={(e) => setConfidence(Number(e.target.value))} className="w-full accent-[#007aff]" />
          </div>

          {error && <p role="alert" className="text-[15px] text-[#ffb4a3]">{error}</p>}
          <GlossButton type="button" onClick={submit} disabled={busy || !answer.trim()}>Send answer</GlossButton>
        </section>
      </div>
    );
  }

  // waiting for work
  return (
    <Shell pet={pet} stage={stage} mood="curious" dance="peek" name={name}>
      <h1 className="font-display text-[clamp(1.8rem,3vw,2.4rem)] font-bold leading-[1.1]">
        {offline ? "Can't reach Scrappy right now" : `${name} is looking for work`}
      </h1>
      <p className="mt-3 text-ink-soft">
        {offline
          ? "The Human API is offline. We'll keep trying."
          : `When an AI agent needs a human in ${pet?.languages.length ?? 0} of your languages, the job appears here and your phone buzzes.`}
      </p>
      <p className="mt-4 text-[14px] text-ink-faint">
        Payout wallet set · <Link href="/app/wallet" className="underline underline-offset-4">change</Link>
      </p>
    </Shell>
  );
}

function Shell({ pet, stage, mood, dance, name, children }: {
  pet: ReturnType<typeof usePet>["pet"];
  stage: ReturnType<typeof stageFor>["current"]["id"];
  mood: "curious" | "excited" | "happy";
  dance: "wave" | "cheer" | "peek";
  name: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid items-center gap-8 rounded-[28px] bg-ground-deep p-8 md:grid-cols-[260px_1fr] md:p-12">
      <Pet species={pet?.species} stage={stage} mood={mood} dance={dance} watchPointer className="mx-auto w-48 md:w-full" title={name} />
      <div>{children}</div>
    </div>
  );
}
