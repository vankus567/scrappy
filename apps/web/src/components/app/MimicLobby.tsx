"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { GlossButton } from "@/components/GlossButton";
import { Pet } from "@/components/Pet";
import { createMimic, getMimics, type MimicView, quickMimic } from "@/lib/api";
import { stageFor, usePet } from "@/lib/pet-store";
import { ClipUpload } from "./ClipUpload";
import { FacePicker } from "./FacePicker";
import { TurnAlerts } from "./TurnAlerts";

/** Mimic home: quick match, a lobby for up to 4 friends, your battles, and adding sounds to the library. */
export function MimicLobby() {
  const { pet, update } = usePet();
  const router = useRouter();
  const token = pet?.workerId;
  const [data, setData] = useState<{ battles: MimicView[]; record: { wins: number; played: number } } | null>(null);
  const [players, setPlayers] = useState(2);
  const [busy, setBusy] = useState<"" | "quick" | "friend">("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const d = await getMimics(token);
      setData(d);
      if (pet && pet.jobsDone !== d.record.wins) update({ jobsDone: d.record.wins }); // the pet evolves from wins
    } catch (err) {
      setError(err instanceof Error ? err.message : "Can't reach Scrappy right now.");
    }
  }, [token, pet, update]);

  useEffect(() => {
    load();
    const t = window.setInterval(load, 5000);
    return () => window.clearInterval(t);
  }, [load]);

  const go = async (kind: "quick" | "friend") => {
    if (!token) return;
    setBusy(kind);
    setError("");
    try {
      const b = kind === "quick" ? await quickMimic(token) : await createMimic(token, players);
      router.push(`/app/battle/${b.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start a battle.");
      setBusy("");
    }
  };

  const name = pet?.name ?? "Your pet";
  const stage = pet ? stageFor(pet).current.id : "mochi";

  if (!token) {
    return (
      <div className="grid items-center gap-8 rounded-[28px] bg-ground-deep p-8 md:grid-cols-[260px_1fr] md:p-12">
        <Pet species={pet?.species} face={pet?.face} stage={stage} mood="curious" dance="wave" className="mx-auto w-48 md:w-full" title={name} />
        <div>
          <h1 className="font-display text-[clamp(1.8rem,3vw,2.4rem)] font-bold leading-[1.1]">One step before battles</h1>
          <p className="mt-3 text-ink-soft">Connect your wallet so your pet has a home on Solana. It takes ten seconds.</p>
          <div className="mt-6"><GlossButton href="/app/wallet">Connect wallet</GlossButton></div>
        </div>
      </div>
    );
  }

  const yourTurn = data?.battles.filter((v) => v.status === "active" && !v.players.find((p) => p.seat === v.you)?.submitted) ?? [];
  const others = data?.battles.filter((v) => !yourTurn.includes(v)) ?? [];

  return (
    <div className="space-y-5">
      <section className="grid items-center gap-8 rounded-[28px] bg-ground-deep p-8 md:grid-cols-[260px_1fr] md:p-12">
        <Pet species={pet?.species} face={pet?.face} stage={stage} mood="excited" dance="hop" watchPointer className="mx-auto w-48 md:w-full" title={name} />
        <div>
          <h1 className="font-display text-[clamp(1.8rem,3vw,2.6rem)] font-bold leading-[1.1]">Mimic</h1>
          <p className="mt-2 text-ink-soft">Hear a sound, copy it into your mic. Closest copy wins. 2 to 4 players, three sounds a battle.</p>
          <p className="mt-1 text-[14px] text-ink-faint">{data ? `${data.record.wins} wins in ${data.record.played} battles` : "Loading your record..."}</p>

          <div className="mt-6">
            <GlossButton type="button" onClick={() => go("quick")} disabled={!!busy}>{busy === "quick" ? "Finding players..." : "Quick match"}</GlossButton>
          </div>

          <div className="mt-6 rounded-[20px] bg-field p-4">
            <p className="font-semibold">Battle your friends</p>
            <p className="mt-0.5 text-[14px] text-ink-soft">Pick how many play, share the link. Empty seats can go to practice bots.</p>
            <div className="mt-3 flex gap-2">
              {[2, 3, 4].map((n) => (
                <button key={n} type="button" aria-pressed={players === n} onClick={() => setPlayers(n)} className={`min-h-11 flex-1 rounded-[14px] text-[15px] font-semibold transition-colors ${players === n ? "bg-leaf text-on-leaf" : "bg-ground-deep hover:bg-field-hover"}`}>
                  {n} players
                </button>
              ))}
            </div>
            <button type="button" onClick={() => go("friend")} disabled={!!busy} className="mt-3 min-h-12 w-full rounded-[14px] bg-[#007aff] px-5 text-[15px] font-semibold text-white transition-colors hover:bg-[#0060cc] disabled:opacity-60 sm:w-auto">
              {busy === "friend" ? "Creating..." : "Create battle"}
            </button>
          </div>
          {error && <p role="alert" className="mt-3 text-[15px] text-[#c2410c]">{error}</p>}
          <div className="mt-4"><FacePicker /></div>
          <div className="mt-3"><TurnAlerts token={token} /></div>
        </div>
      </section>

      {yourTurn.length > 0 && (
        <section className="rounded-[28px] bg-ground-deep p-6 sm:p-8">
          <h2 className="font-display text-[24px] font-bold">Your turn to sing</h2>
          <List items={yourTurn} />
        </section>
      )}
      {others.length > 0 && (
        <section className="rounded-[28px] bg-ground-deep p-6 sm:p-8">
          <h2 className="font-display text-[24px] font-bold">Your battles</h2>
          <List items={others} />
        </section>
      )}
      <ClipUpload token={token} />
    </div>
  );
}

function List({ items }: { items: MimicView[] }) {
  return (
    <ol className="mt-4 divide-y divide-edge">
      {items.map((v) => {
        const me = v.players.find((p) => p.seat === v.you);
        const others = v.players.filter((p) => p.seat !== v.you).map((p) => p.name);
        const status =
          v.status === "open" ? `Lobby · ${v.players.length}/${v.max_players}`
          : v.status === "active" ? (me?.submitted ? `Round ${v.round}: waiting for others` : `Round ${v.round}: your turn`)
          : v.status === "done" ? (me?.winner ? `Won · ${me.total} pts` : `Lost · ${me?.total ?? 0} pts`)
          : "Expired";
        return (
          <li key={v.id}>
            <Link href={`/app/battle/${v.id}`} className="flex items-center justify-between gap-4 py-3">
              <span className="min-w-0">
                <span className="block truncate font-semibold">vs {others.length ? others.join(", ") : "waiting for players"}</span>
                <span className="block text-[14px] text-ink-soft">{status}</span>
              </span>
              <span className="text-[14px] font-semibold text-[#007aff]">Open</span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
