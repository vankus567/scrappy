"use client";

import Link from "next/link";
import { Room } from "@/components/Room";
import { ageLabel, formatRupees, JOBS_LIVE, usePet } from "@/lib/pet-store";

export function Home() {
  const { pet } = usePet();
  if (!pet) return null;
  const langCount = pet.languages.length;

  return (
    <div className="grid gap-5 md:grid-cols-[1.25fr_1fr] md:gap-8">
      <section className="min-w-0">
        <div className="mb-3 flex items-baseline justify-between gap-4">
          <h1 className="font-display text-[clamp(1.9rem,3.4vw,2.6rem)] font-medium leading-[1.1]">{pet.name}</h1>
          <p className="text-right text-[15px] text-ink-soft">
            Earned <span className="font-medium tabular-nums text-ink">{formatRupees(pet.earnedPaise)}</span>
          </p>
        </div>
        <Room mood="happy" light="morning" food={1} className="aspect-[4/3.4] w-full md:aspect-[4/3]" />
        <p className="mt-3 text-[14px] text-ink-soft">
          {ageLabel(pet.bornAt)}, bowl full{pet.city ? `, ${pet.city}` : ""}
        </p>
      </section>

      <section className="min-w-0 space-y-4 md:pt-14">
        <div className="rounded-[24px] bg-ground-deep p-6">
          {JOBS_LIVE ? (
            <>
              <h2 className="font-display text-2xl font-medium">Jobs are open</h2>
              <p className="mt-2 text-[15px] text-ink-soft">Answer a few and {pet.name} eats.</p>
              <Link href="/app/jobs" className="mt-5 inline-flex h-12 items-center rounded-[14px] bg-leaf px-6 font-medium text-on-leaf hover:bg-leaf-hover">
                See jobs
              </Link>
            </>
          ) : (
            <>
              <h2 className="font-display text-2xl font-medium">{pet.name} is waiting for work</h2>
              <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
                Paid jobs from AI teams open soon. Until then the bowl stays full, so {pet.name} will not get hungry.
              </p>
            </>
          )}
        </div>
        <dl className="grid grid-cols-2 gap-3">
          <div className="rounded-[20px] bg-ground-deep p-5">
            <dt className="text-[13px] text-ink-soft">Jobs done</dt>
            <dd className="mt-1 text-2xl font-medium tabular-nums">{pet.jobsDone}</dd>
          </div>
          <div className="rounded-[20px] bg-ground-deep p-5">
            <dt className="text-[13px] text-ink-soft">Checks in</dt>
            <dd className="mt-1 text-2xl font-medium tabular-nums">
              {langCount} <span className="text-[15px] font-normal text-ink-soft">{langCount === 1 ? "language" : "languages"}</span>
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
