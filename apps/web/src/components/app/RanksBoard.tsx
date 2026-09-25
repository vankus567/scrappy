"use client";

import { useEffect, useState } from "react";
import { Pet, SPECIES, type Species } from "@/components/Pet";
import { getLeaderboard } from "@/lib/api";
import { usePet } from "@/lib/pet-store";

type Entry = { rank: number; pet_name: string | null; species: string | null; city: string | null; tasks_done: number; earned_usdc: number; you: boolean };

export function RanksBoard() {
  const { pet } = usePet();
  const [scope, setScope] = useState<"world" | "city">("world");
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState(false);
  const city = pet?.city?.trim();

  useEffect(() => {
    let alive = true;
    getLeaderboard(scope === "city" && city ? city : undefined, pet?.workerToken)
      .then((d) => alive && (setEntries(d.entries), setError(false)))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [scope, city, pet?.workerToken]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-[clamp(1.8rem,3vw,2.4rem)] font-bold">Ranks</h1>
        <div className="flex gap-1 rounded-full bg-ground-deep p-1">
          {(["world", "city"] as const).map((s) => (
            <button
              key={s}
              type="button"
              disabled={s === "city" && !city}
              onClick={() => setScope(s)}
              aria-pressed={scope === s}
              className={`rounded-full px-4 py-2 text-[14px] font-semibold disabled:opacity-40 ${scope === s ? "bg-leaf text-on-leaf" : "text-ink-soft"}`}
            >
              {s === "world" ? "Everyone" : city ?? "Your city"}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-[28px] bg-ground-deep p-3 sm:p-5">
        {error && <p className="p-6 text-ink-soft">Can&apos;t reach Kage right now.</p>}
        {!error && entries === null && <div aria-busy="true" className="h-40 animate-pulse rounded-[20px] bg-field" />}
        {!error && entries?.length === 0 && (
          <p className="p-6 text-ink-soft">No ranks yet. The first paid answer puts someone on the board.</p>
        )}
        {!error && !!entries?.length && (
          <ol className="divide-y divide-edge">
            {entries.map((e) => {
              const species = (e.species && e.species in SPECIES ? e.species : "mochi") as Species;
              const mine = e.you;
              return (
                <li key={e.rank} className={`flex items-center gap-4 rounded-[16px] px-3 py-3 ${mine ? "bg-field" : ""}`}>
                  <span className="w-8 text-center font-display text-[20px] font-bold tabular-nums">{e.rank}</span>
                  <Pet species={species} stage="mochi" mood={e.rank === 1 ? "excited" : "happy"} className="size-12 shrink-0" title={e.pet_name ?? "pet"} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{e.pet_name ?? "Unnamed pet"}{mine && " (you)"}</p>
                    <p className="truncate text-[13px] text-ink-soft">{e.city || "Somewhere"} · {e.tasks_done} tasks</p>
                  </div>
                  <span className="font-display text-[18px] font-bold tabular-nums">${e.earned_usdc.toFixed(2)}</span>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
