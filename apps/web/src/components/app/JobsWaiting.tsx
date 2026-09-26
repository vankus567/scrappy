"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { GlossButton } from "@/components/GlossButton";
import { Pet } from "@/components/Pet";
import { getHistory, nextJob, submitAnswer, type HistoryItem, type TaskKind, type WorkerJob } from "@/lib/api";
import { stageFor, usePet } from "@/lib/pet-store";
import { distanceM, type Fix, formatDistance, getFix, getRoughFix, nearbyEnabled, setNearbyEnabled, shrinkPhoto } from "@/lib/proof";
import { useWorkerSync } from "./useWorkerSync";

type Reward = { earned: number; agent: string | null } | null;

/** How each kind of task reads to the human doing it. */
const KIND_GUIDE: Record<TaskKind, { label: string; how: string }> = {
  judgment: { label: "Judgment", how: "" },
  call: { label: "Phone call", how: "Call, ask exactly this, and type what they said. Be polite and quick: most calls take under two minutes." },
  photo_check: { label: "Photo check", how: "Take one clear photo of exactly what the agent asked about, then say what you see. Don't guess." },
  price_check: { label: "Price check", how: "Photograph the price tag or the screen showing the price, then type the exact price." },
  visit: { label: "Visit", how: "Go to the place, check what the agent asked, and answer from there. Your location is checked when you send." },
};

const formatWindow = (ms: number) => (ms >= 90_000 ? `${Math.round(ms / 60_000)} min` : `${Math.max(1, Math.round(ms / 1000))} s`);

export function JobsWaiting() {
  const { pet, update } = usePet();
  const [job, setJob] = useState<WorkerJob | null>(null);
  const [answer, setAnswer] = useState("");
  const [confidence, setConfidence] = useState(80);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reward, setReward] = useState<Reward>(null);
  const [offline, setOffline] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [fix, setFix] = useState<Fix | null>(null);
  const [proofBusy, setProofBusy] = useState<"" | "photo" | "gps">("");
  const [nearby, setNearby] = useState(false);
  const near = useRef<{ lat: number; lng: number } | null>(null);
  const camera = useRef<HTMLInputElement>(null);
  useWorkerSync();

  // "tasks near me": refresh a rough position every 2 minutes so located tasks can find this phone
  useEffect(() => setNearby(nearbyEnabled()), []);
  useEffect(() => {
    if (!nearby) {
      near.current = null;
      return;
    }
    const refresh = () => getRoughFix().then((f) => {
      if (f) near.current = { lat: f.lat, lng: f.lng };
    });
    refresh();
    const t = window.setInterval(refresh, 120_000);
    return () => window.clearInterval(t);
  }, [nearby]);

  const toggleNearby = async () => {
    const on = !nearby;
    if (on) {
      const f = await getRoughFix();
      if (!f) {
        setError("Location is blocked. Allow it for Scrappy to get tasks near you.");
        return;
      }
      near.current = { lat: f.lat, lng: f.lng };
    }
    setError("");
    setNearbyEnabled(on);
    setNearby(on);
  };

  const workerId = pet?.workerId;
  const stage = pet ? stageFor(pet).current.id : "mochi";
  const name = pet?.name ?? "Your pet";

  const poll = useCallback(async () => {
    if (!workerId) return;
    try {
      const next = await nextJob(workerId, near.current);
      setOffline(false);
      if (next) {
        setJob(next);
        setAnswer("");
        setConfidence(80);
        setPhoto(null);
        setFix(null);
        setError("");
        if ("vibrate" in navigator) navigator.vibrate?.(120);
        if (document.hidden && "Notification" in window && Notification.permission === "granted") {
          new Notification(`${pet?.name ?? "Your pet"} found a job`, { body: `${next.task} · pays ${next.pays_usdc.toFixed(2)}`, tag: "scrappy-job" });
        }
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

  const takePhoto = async (file: File | undefined) => {
    if (!file) return;
    setProofBusy("photo");
    setError("");
    try {
      setPhoto(await shrinkPhoto(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that photo.");
    } finally {
      setProofBusy("");
    }
  };

  const checkLocation = async () => {
    setProofBusy("gps");
    setError("");
    try {
      setFix(await getFix());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not get your location.");
    } finally {
      setProofBusy("");
    }
  };

  const proofReady = !job || ((!job.proof.photo || !!photo) && (!job.proof.gps || !!fix));

  const submit = async () => {
    if (!job || !workerId || !answer.trim() || !proofReady) return;
    setBusy(true);
    setError("");
    try {
      // GPS is re-taken at send time so the fix is fresh and taken where the photo was
      const sendFix = job.proof.gps ? await getFix() : fix;
      if (sendFix) setFix(sendFix);
      const proof = photo || sendFix
        ? { ...(photo && { photo }), ...(sendFix && { lat: sendFix.lat, lng: sendFix.lng, accuracy_m: sendFix.accuracy_m, captured_at: sendFix.captured_at }) }
        : undefined;
      const r = await submitAnswer(job.job_id, workerId, answer.trim(), confidence, proof);
      update({ jobsDone: (pet?.jobsDone ?? 0) + 1, earnedUsdc: (pet?.earnedUsdc ?? 0) + r.earned_usdc });
      setJob(null);
      setReward({ earned: r.earned_usdc, agent: job.qualification ? null : job.agent?.name ?? "the agent" });
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
        <p className="reward-pop mt-1 font-display text-[clamp(2.6rem,6vw,3.8rem)] font-bold leading-none text-[#15803d]">
          +${reward.earned.toFixed(2)}
        </p>
        <p className="mt-3 text-ink-soft">
          {reward.agent ? `Sent to ${reward.agent}. ` : "Skill check done. "}
          {name} ate. Earned to your payout wallet.
        </p>
      </Shell>
    );
  }

  // a job is open
  if (job) {
    const choices = job.options ?? [];
    const guide = KIND_GUIDE[job.kind];
    return (
      <div className="grid gap-5 lg:grid-cols-[320px_1fr] lg:items-start">
        <div className="space-y-5 rounded-[28px] bg-ground-deep p-6">
          <div className="app-bob">
            <Pet species={pet?.species} stage={stage} mood="focused" dance="none" watchPointer className="mx-auto w-40" title={`${name} found a job`} />
          </div>
          <div className="rounded-[20px] bg-field p-4">
            <p className="text-[13px] font-semibold text-ink-faint">{job.qualification ? "Skill check from Scrappy" : "An AI agent is stuck"}</p>
            <p className="mt-0.5 font-display text-[20px] font-bold leading-tight">{job.qualification ? "Prove your skill" : job.agent?.name ?? "An AI agent"}</p>
            {job.agent?.reason && <p className="mt-1.5 text-[15px] leading-snug text-ink-soft">{job.agent.reason}</p>}
            {job.qualification && <p className="mt-1.5 text-[15px] leading-snug text-ink-soft">Unpaid. Right answers unlock paid work from agents.</p>}
          </div>
          <p className="text-center text-[15px] font-semibold">
            {job.qualification ? "Unpaid check" : `Pays $${job.pays_usdc.toFixed(2)}`} · {formatWindow(job.answer_within_ms)} to answer
          </p>
        </div>

        <section className="space-y-6 rounded-[28px] bg-ground-deep p-6 sm:p-8">
          <p className="text-[14px] font-semibold text-ink-faint">
            {guide.label}{job.city ? ` · ${job.city}` : ""} · {job.language}
          </p>
          <h1 className="font-display text-[clamp(1.6rem,3vw,2.2rem)] font-bold leading-[1.15]">{job.task}</h1>
          {job.content && (
            <p lang={job.language} className="rounded-[18px] bg-field p-4 text-[18px] leading-relaxed">{job.content}</p>
          )}
          {job.kind !== "judgment" && <p className="text-[15px] leading-relaxed text-ink-soft">{guide.how}</p>}
          {job.place && <PlaceCard place={job.place} fix={fix} />}
          {job.kind === "call" && job.phone && (
            <a
              href={`tel:${job.phone.replace(/[^\d+]/g, "")}`}
              className="flex min-h-14 items-center justify-between rounded-[18px] bg-[#007aff] px-5 text-white transition-colors hover:bg-[#0060cc]"
            >
              <span className="font-semibold">Call the shop</span>
              <span className="font-mono text-[16px] tabular-nums">{job.phone}</span>
            </a>
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

          {(job.proof.photo || job.proof.gps) && (
            <div className="space-y-4 rounded-[20px] bg-field p-4">
              <p className="text-[15px] font-semibold">Proof the agent needs</p>
              {job.proof.photo && (
                <div className="flex items-center gap-4">
                  <input ref={camera} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => takePhoto(e.target.files?.[0])} />
                  {photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photo} alt="Your proof photo" className="h-20 w-20 rounded-[14px] object-cover" />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px]">{photo ? "Photo ready" : "A clear photo of what you checked"}</p>
                    <button type="button" onClick={() => camera.current?.click()} disabled={proofBusy === "photo"} className="mt-1 text-[15px] font-semibold text-[#007aff] disabled:opacity-60">
                      {proofBusy === "photo" ? "Reading photo..." : photo ? "Retake" : "Open camera"}
                    </button>
                  </div>
                </div>
              )}
              {job.proof.gps && (
                <div>
                  <p className="text-[15px]">
                    {fix && job.place
                      ? `You are ${formatDistance(distanceM(fix, job.place))} away (GPS within ${fix.accuracy_m} m)`
                      : "Your location, checked against the place when you send"}
                  </p>
                  <button type="button" onClick={checkLocation} disabled={proofBusy === "gps"} className="mt-1 text-[15px] font-semibold text-[#007aff] disabled:opacity-60">
                    {proofBusy === "gps" ? "Finding you..." : fix ? "Check again" : "Check my location"}
                  </button>
                </div>
              )}
            </div>
          )}

          {error && <p role="alert" className="text-[15px] text-[#c2410c]">{error}</p>}
          <GlossButton type="button" onClick={submit} disabled={busy || !answer.trim() || !proofReady}>
            {busy ? "Sending..." : proofReady ? "Send answer" : job.proof.photo && !photo ? "Add a photo to send" : "Check your location to send"}
          </GlossButton>
        </section>
      </div>
    );
  }

  // waiting for work
  return (
    <div className="space-y-5">
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
      <button type="button" onClick={toggleNearby} aria-pressed={nearby} className="mt-5 flex w-full items-center justify-between gap-4 rounded-[18px] bg-field px-5 py-4 text-left transition-colors hover:bg-field-hover">
        <span>
          <span className="block font-semibold">{nearby ? "Getting tasks near you" : "Get tasks near you"}</span>
          <span className="block text-[14px] text-ink-soft">{nearby ? "Shelf checks, photos and visits around you. Tap to stop." : "Agents pay more for on-site checks. Your location is used only to match tasks."}</span>
        </span>
        <span className={`h-7 w-12 shrink-0 rounded-full p-1 transition-colors ${nearby ? "bg-[#007aff]" : "bg-ink-faint/40"}`}>
          <span className={`block h-5 w-5 rounded-full bg-white transition-transform ${nearby ? "translate-x-5" : ""}`} />
        </span>
      </button>
      {error && <p role="alert" className="mt-3 text-[15px] text-[#c2410c]">{error}</p>}
    </Shell>
    <RecentWork token={workerId} />
    </div>
  );
}

/** Where to go: name, distance from the phone, and a one-tap route in Maps. */
function PlaceCard({ place, fix }: { place: NonNullable<WorkerJob["place"]>; fix: Fix | null }) {
  const dist = fix ? distanceM(fix, place) : place.distance_m;
  const inside = fix ? distanceM(fix, place) <= place.radius_m + Math.min(fix.accuracy_m, 150) : null;
  return (
    <a
      href={`https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}`}
      target="_blank"
      rel="noreferrer"
      className="flex min-h-16 items-center justify-between gap-4 rounded-[18px] bg-[#007aff] px-5 py-3 text-white transition-colors hover:bg-[#0060cc]"
    >
      <span className="min-w-0">
        <span className="block truncate font-semibold">{place.name ?? "The place"}</span>
        <span className="block text-[14px] text-white/85">
          {inside === true ? "You're there" : `Be within ${formatDistance(place.radius_m)}`}
          {dist !== undefined && inside !== true ? ` · ${formatDistance(dist)} away` : ""}
        </span>
      </span>
      <span className="shrink-0 text-[15px] font-semibold">Directions</span>
    </a>
  );
}

/** Real history from the API: what you answered, which agent asked, and what it did with your answer. */
function RecentWork({ token }: { token: string }) {
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  useEffect(() => {
    let alive = true;
    getHistory(token).then((h) => alive && setItems(h)).catch(() => alive && setItems([]));
    return () => {
      alive = false;
    };
  }, [token]);
  if (!items?.length) return null;
  return (
    <section className="rounded-[28px] bg-ground-deep p-6 sm:p-8">
      <h2 className="font-display text-[24px] font-bold">Your recent work</h2>
      <ol className="mt-4 divide-y divide-edge">
        {items.slice(0, 8).map((h, i) => (
          <li key={i} className="grid gap-1 py-4 sm:grid-cols-[1fr_auto] sm:gap-6">
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-ink-faint">
                {h.qualification ? "Skill check" : h.agent ?? "AI agent"} · {KIND_GUIDE[h.kind]?.label ?? "Judgment"}
              </p>
              <p className="mt-0.5 truncate font-semibold">{h.prompt}</p>
              <p className="mt-0.5 text-[15px] text-ink-soft">You said: {h.answer}</p>
              {h.outcome && <p className="mt-1 text-[15px] font-semibold text-[#007aff]">What the agent did: {h.outcome}</p>}
            </div>
            <p className="font-display text-[18px] font-bold tabular-nums sm:text-right">{h.qualification ? "Check" : `+$${h.earned_usdc.toFixed(2)}`}</p>
          </li>
        ))}
      </ol>
    </section>
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
