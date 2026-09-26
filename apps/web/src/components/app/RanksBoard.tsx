"use client";

import { useEffect, useState } from "react";
import { Pet, SPECIES, type Species } from "@/components/Pet";
import { API_URL } from "@/lib/api";
import { usePet } from "@/lib/pet-store";

type Entry = { id: string; pet_name: string | null; species: string | null; city: string | null; wins: number; battles: number };

export function RanksBoard() {
  const { pet } = usePet();
  const [scope, setScope] = useState<"world" | "city">("world");
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState(false);
  const city = pet?.city?.trim();

  useEffect(() => {
    let alive = true;
    const q = scope === "city" && city ? `?city=${encodeURIComponent(city)}` : "";
    fetch(`${API_URL}/v1/battles/leaderboard${q}`, { headers: pet?.workerId ? { authorization: `Bearer ${pet.workerId}` } : {} })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d) => {
        if (!alive) return;
        const rows = (d.entries ?? []) as { rank: number; pet_name: string | null; species: string | null; city: string | null; wins: number; battles: number; you: boolean }[];
        setEntries(rows.map((r) => ({ id: r.you && pet?.workerId ? pet.workerId : `rank-${r.rank}`, pet_name: r.pet_name, species: r.species, city: r.city, wins: r.wins, battles: r.battles })));
        setError(false);
      })
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [scope, city]);

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
        {error && <p className="p-6 text-ink-soft">Can't reach Scrappy right now.</p>}
        {!error && entries === null && <div aria-busy="true" className="h-40 animate-pulse rounded-[20px] bg-field" />}
        {!error && entries?.length === 0 && (
          <p className="p-6 text-ink-soft">No ranks yet. Win a battle to be first on the board.</p>
        )}
        {!error && !!entries?.length && (
          <ol className="divide-y divide-edge">
            {entries.map((e, i) => {
              const species = (e.species && e.species in SPECIES ? e.species : "mochi") as Species;
              const mine = pet?.workerId === e.id;
              return (
                <li key={e.id} className={`flex items-center gap-4 rounded-[16px] px-3 py-3 ${mine ? "bg-field" : ""}`}>
                  <span className="w-8 text-center font-display text-[20px] font-bold tabular-nums">{i + 1}</span>
                  <Pet species={species} stage="mochi" mood={i === 0 ? "excited" : "happy"} className="size-12 shrink-0" title={e.pet_name ?? "pet"} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{e.pet_name ?? "Unnamed pet"}{mine && " (you)"}</p>
                    <p className="truncate text-[13px] text-ink-soft">{e.city || "Somewhere"} · {e.battles} {e.battles === 1 ? "battle" : "battles"}</p>
                  </div>
                  <span className="font-display text-[18px] font-bold tabular-nums">{e.wins} {e.wins === 1 ? "win" : "wins"}</span>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
