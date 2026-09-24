"use client";

import { Heart, CalendarBlank, Briefcase } from "@phosphor-icons/react";
import { Pet } from "@/components/Pet";
import { formatRupees, JOBS_LIVE, usePet } from "@/lib/pet-store";
import { JourneyMap } from "./JourneyMap";

export function Home() {
  const { pet } = usePet();
  if (!pet) return null;
  const days = Math.max(0, Math.floor((Date.now() - pet.bornAt) / 86_400_000));
  // Hunger only ticks once paid jobs are live; until then the bowl is honestly full.
  const bowl = 100;

  return (
    <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr] lg:items-start lg:gap-8">
      {/* header card: pet + its numbers */}
      <section className="min-w-0 space-y-5">
        <div className="relative overflow-hidden rounded-[28px] bg-ground-deep p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-2 text-[22px] font-semibold tabular-nums">
              <Heart size={26} weight="fill" className="text-[#e9964b]" /> {bowl}%
            </p>
            <p className="rounded-[12px] bg-ground px-3 py-1.5 text-[14px] font-medium tabular-nums">
              {formatRupees(pet.earnedPaise)} earned
            </p>
          </div>

          <div className="mt-2 grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] items-center gap-3">
            <Pet mood="happy" watchPointer className="w-full max-w-[260px]" />
            <div className="space-y-4">
              <h1 className="font-display text-[clamp(1.9rem,6vw,2.6rem)] font-medium leading-[1.1]">{pet.name}</h1>
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
            </div>
          </div>
        </div>

        <div className="rounded-[24px] bg-ground-deep p-5 sm:p-6">
          <h2 className="font-display text-[22px] font-medium">
            {JOBS_LIVE ? "Jobs are open" : `${pet.name} is waiting for work`}
          </h2>
          <p className="mt-1.5 text-[15px] leading-relaxed text-ink-soft">
            {JOBS_LIVE
              ? `Answer a few and ${pet.name} eats.`
              : `Paid jobs from AI teams open soon. Until then the bowl stays full, so ${pet.name} will not get hungry.`}
          </p>
        </div>
      </section>

      {/* the journey */}
      <section className="mx-auto w-full min-w-0 max-w-[440px]">
        <JourneyMap pet={pet} />
      </section>
    </div>
  );
}
