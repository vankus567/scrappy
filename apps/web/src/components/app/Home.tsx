"use client";

import { Heart, CalendarBlank, Briefcase } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { Pet, type PetDance, type PetMood } from "@/components/Pet";

const TRICKS: { mood: PetMood; dance: PetDance }[] = [
  { mood: "excited", dance: "bounce" },
  { mood: "love", dance: "wiggle" },
  { mood: "wink", dance: "wave" },
  { mood: "happy", dance: "hop" },
  { mood: "surprised", dance: "march" },
  { mood: "excited", dance: "spin" },
  { mood: "happy", dance: "cheer" },
  { mood: "surprised", dance: "dizzy" },
  { mood: "love", dance: "shake" },
  { mood: "excited", dance: "twirl" },
  { mood: "wink", dance: "peek" },
  { mood: "sleepy", dance: "sway" },
];

// Small things the pet does on its own while you look at it.
const IDLES: { mood: PetMood; dance: PetDance }[] = [
  { mood: "curious", dance: "peek" },
  { mood: "happy", dance: "wave" },
  { mood: "wink", dance: "none" },
  { mood: "sleepy", dance: "sway" },
  { mood: "curious", dance: "none" },
  { mood: "happy", dance: "wiggle" },
];
import { JOBS_LIVE, STAGES, stageFor, stageName, usePet } from "@/lib/pet-store";
import { JourneyMap } from "./JourneyMap";

export function Home() {
  const { pet } = usePet();
  const [trick, setTrick] = useState<{ mood: PetMood; dance: PetDance } | null>(null);
  const busy = useRef(false);

  // idle life: every 7-12 s the pet does something small on its own
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let t = 0;
    const tick = () => {
      t = window.setTimeout(() => {
        if (!busy.current) {
          setTrick(IDLES[Math.floor(Math.random() * IDLES.length)]);
          window.setTimeout(() => { if (!busy.current) setTrick(null); }, 1800);
        }
        tick();
      }, 7000 + Math.random() * 5000);
    };
    tick();
    return () => window.clearTimeout(t);
  }, []);

  if (!pet) return null;
  const play = () => {
    busy.current = true;
    setTrick(TRICKS[Math.floor(Math.random() * TRICKS.length)]);
    window.setTimeout(() => { busy.current = false; setTrick(null); }, 2600);
  };
  const days = Math.max(0, Math.floor((Date.now() - pet.bornAt) / 86_400_000));
  // Hunger only ticks once paid jobs are live; until then the bowl is honestly full.
  const bowl = 100;
  const { current, next } = stageFor(pet);

  return (
    <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr] lg:items-start lg:gap-8">
      {/* header card: pet + its numbers */}
      <section className="min-w-0 space-y-5">
        <div className="relative overflow-hidden rounded-[28px] bg-ground-deep p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-2 text-[22px] font-semibold tabular-nums">
              <Heart size={26} weight="fill" className="text-[#ff7a59]" /> {bowl}%
            </p>
            <p className="rounded-[12px] bg-leaf px-3 py-1.5 text-[14px] font-bold tabular-nums text-on-leaf">
              ${(pet.earnedUsdc ?? 0).toFixed(2)} earned
            </p>
          </div>

          <div className="mt-2 grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] items-center gap-3">
            <button type="button" onClick={play} aria-label={`Play with ${pet.name}`} className="group relative rounded-[24px] outline-none focus-visible:ring-2 focus-visible:ring-leaf">
              <Pet mood={trick?.mood ?? "happy"} dance={trick?.dance ?? "none"} stage={current.id} species={pet.species} watchPointer className="w-full max-w-[260px]" />
              <span className="mt-1 block text-center text-[13px] font-medium text-ink-faint">Tap {pet.name} to play</span>
            </button>
            <div className="space-y-4">
              <h1 className="font-display tracking-[-0.005em] text-[clamp(1.9rem,6vw,2.6rem)] font-bold leading-[1.1]">{pet.name}</h1>
              <dl className="space-y-3 text-[15px]">
                <div className="flex items-center gap-2.5">
                  <CalendarBlank size={20} className="text-ink-soft" />
                  <dt className="sr-only">Age</dt>
                  <dd><span className="font-semibold tabular-nums">{days}</span> {days === 1 ? "day" : "days"} old</dd>
                </div>
                <div className="flex items-center gap-2.5">
                  <Briefcase size={20} className="text-ink-soft" />
                  <dt className="sr-only">Jobs done</dt>
                  <dd><span className="font-semibold tabular-nums">{pet.jobsDone}</span> {pet.jobsDone === 1 ? "job" : "jobs"} done</dd>
                </div>
              </dl>
              <p className="text-[14px] text-ink-soft">
                <span className="font-semibold text-ink">{stageName(pet.species, current.id)}</span>
                {next ? `, evolves at ${next.jobs} jobs${next.days ? ` and ${next.days} days` : ""}` : ", fully grown"}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-[24px] bg-ground-deep p-5 sm:p-6">
          <h2 className="font-display tracking-[-0.005em] text-[22px] font-bold">
            {JOBS_LIVE ? "Jobs are open" : `${pet.name} is waiting for work`}
          </h2>
          <p className="mt-1.5 text-[15px] leading-relaxed text-ink-soft">
            {JOBS_LIVE
              ? `Answer a few and ${pet.name} eats.`
              : `Paid jobs from AI teams open soon. Until then the bowl stays full, so ${pet.name} will not get hungry.`}
          </p>
        </div>
        <div className="rounded-[24px] bg-ground-deep p-5 sm:p-6">
          <h2 className="font-display tracking-[-0.005em] text-[22px] font-bold">Forms</h2>
          <ol className="mt-4 grid grid-cols-4 gap-2">
            {STAGES.map((st) => {
              const reached = STAGES.indexOf(st) <= STAGES.indexOf(current);
              return (
                <li key={st.id} className="text-center">
                  <div className={reached ? "" : "opacity-35 grayscale"}>
                    <Pet mood={reached ? "happy" : "focused"} stage={st.id} species={pet.species} className="mx-auto w-full max-w-[96px]" title={stageName(pet.species, st.id)} />
                  </div>
                  <p className={`mt-1 text-[13px] ${reached ? "font-semibold" : "text-ink-soft"}`}>{stageName(pet.species, st.id)}</p>
                  <p className="text-[12px] text-ink-faint">{st.jobs === 0 ? "Start" : `${st.jobs} jobs`}</p>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      {/* the journey */}
      <section className="mx-auto w-full min-w-0 max-w-[440px]">
        <JourneyMap pet={pet} />
      </section>
    </div>
  );
}
