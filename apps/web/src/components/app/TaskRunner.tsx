"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Pet } from "@/components/Pet";
import { TaskCard } from "@/components/scrappy/TaskCard";
import { ApiError, nextTask, respond, type WorkerTask } from "@/lib/api";
import { stageFor, usePet } from "@/lib/pet-store";
import { EnablePush } from "./EnablePush";
import { JoinPanel } from "./JoinPanel";

type Outcome = { earned: number; qualification: boolean; correct?: boolean } | null;

/** Claim → answer → reward → next. Polls every 3 s while idle; the API decides who gets a seat. */
export function TaskRunner() {
  const { pet, update } = usePet();
  const token = pet?.workerToken;
  const [task, setTask] = useState<WorkerTask | null>(null);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [offline, setOffline] = useState(false);
  const notified = useRef<string | null>(null);

  const poll = useCallback(async () => {
    if (!token) return;
    try {
      const t = await nextTask(token);
      setOffline(false);
      if (t) {
        setTask(t);
        setError("");
        if (notified.current !== t.task_id) {
          notified.current = t.task_id;
          navigator.vibrate?.(120);
        }
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) update({ workerToken: undefined });
      else setOffline(true);
    }
  }, [token, update]);

  useEffect(() => {
    if (!token || task || outcome) return;
    // async: state is set after the request resolves
    // eslint-disable-next-line react-hooks/set-state-in-effect
    poll();
    const t = window.setInterval(poll, 3000);
    return () => window.clearInterval(t);
  }, [token, task, outcome, poll]);

  // the claim expires: drop the card so a fresh one can come
  useEffect(() => {
    if (!task) return;
    const ms = Date.parse(task.expires_at) - Date.now();
    const t = window.setTimeout(() => {
      setTask(null);
      setError("");
    }, Math.max(0, ms) + 500);
    return () => window.clearTimeout(t);
  }, [task]);

  if (!pet) return null;
  if (!token) return <JoinPanel title="Connect a wallet to get tasks" />;
  const stage = stageFor(pet).current.id;

  const answer = async (value: string, confidence: number) => {
    if (!task) return;
    setBusy(true);
    setError("");
    try {
      const r = await respond(token, task.task_id, value, confidence);
      update({ jobsDone: pet.jobsDone + 1, earnedUsdc: (pet.earnedUsdc ?? 0) + r.earned_usdc });
      setTask(null);
      setOutcome({ earned: r.earned_usdc, qualification: r.qualification, correct: r.correct });
      window.setTimeout(() => setOutcome(null), 2200);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not send your answer.";
      setError(msg);
      if (err instanceof ApiError && (err.status === 410 || err.status === 409)) window.setTimeout(() => setTask(null), 1600);
    } finally {
      setBusy(false);
    }
  };

  if (outcome) {
    return (
      <Stage pet={pet} stage={stage} mood={outcome.qualification && outcome.correct === false ? "sad" : "excited"} dance={outcome.qualification && outcome.correct === false ? "none" : "cheer"}>
        {outcome.qualification ? (
          <>
            <p className="text-[15px] text-ink-soft">Qualification check</p>
            <p className="mt-1 font-display text-[clamp(2.2rem,6vw,3.2rem)] font-bold leading-none">{outcome.correct ? "Correct" : "Not quite"}</p>
            <p className="mt-3 text-ink-soft">Logged to your accuracy. Paid tasks open after a few checks.</p>
          </>
        ) : (
          <>
            <p className="text-[15px] text-ink-soft">Answer accepted</p>
            <p className="reward-pop money mt-1 font-display text-[clamp(3rem,8vw,4.4rem)] font-bold leading-none tabular-nums">+${outcome.earned.toFixed(2)}</p>
            <p className="mt-3 text-ink-soft">USDC, paid to your wallet with your next payout.</p>
          </>
        )}
      </Stage>
    );
  }

  if (task) {
    return (
      <div className="mx-auto max-w-2xl">
        <TaskCard key={task.task_id} task={task} onAnswer={answer} busy={busy} error={error} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-3">
      <Stage pet={pet} stage={stage} mood="curious" dance="peek">
        <h1 className="font-display text-[clamp(1.7rem,4vw,2.3rem)] font-bold leading-tight">
          {offline ? "Can't reach Scrappy" : `${pet.name} is listening for agents`}
        </h1>
        <p className="mt-2 text-ink-soft">
          {offline ? "We'll keep trying every few seconds." : "When an agent needs a human in your languages, the task appears here."}
        </p>
      </Stage>
      <EnablePush />
    </div>
  );
}

function Stage({ pet, stage, mood, dance, children }: {
  pet: NonNullable<ReturnType<typeof usePet>["pet"]>;
  stage: ReturnType<typeof stageFor>["current"]["id"];
  mood: "curious" | "excited" | "sad";
  dance: "peek" | "cheer" | "none";
  children: React.ReactNode;
}) {
  return (
    <section className="mx-auto grid max-w-2xl items-center gap-6 rounded-[28px] bg-ground-deep p-7 sm:grid-cols-[180px_1fr] sm:p-10" aria-live="polite">
      <Pet species={pet.species} stage={stage} mood={mood} dance={dance} watchPointer className="mx-auto w-40 sm:w-full" title={pet.name} />
      <div>{children}</div>
    </section>
  );
}
