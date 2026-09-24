"use client";

import { Pet } from "@/components/Pet";
import { stageFor, usePet } from "@/lib/pet-store";

export function JobsWaiting() {
  const { pet } = usePet();
  const stage = pet ? stageFor(pet).current.id : "mochi";
  const name = pet?.name ?? "Your pet";
  return (
    <div className="grid items-center gap-8 rounded-[28px] bg-ground-deep p-8 md:grid-cols-[260px_1fr] md:p-12">
      <Pet species={pet?.species} stage={stage} mood="curious" dance="wave" watchPointer className="mx-auto w-48 md:w-full" title={`${name} waiting for jobs`} />
      <div>
        <h1 className="font-display text-[clamp(1.8rem,3vw,2.4rem)] font-bold leading-[1.1]">Agents will ask here</h1>
        <p className="mt-3 text-ink-soft">
          When an AI agent needs a human, the job lands on this screen and {name} buzzes. Most jobs take about 20 seconds and pay in dollars within seconds. Paid jobs open when the first agents go live.
        </p>
      </div>
    </div>
  );
}
