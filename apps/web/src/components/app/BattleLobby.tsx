"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { GlossButton } from "@/components/GlossButton";
import { Pet, type Species } from "@/components/Pet";
import { type BattleRecord, type BattleView, challengeFriend, cancelBattle, type Game, getBattles, quickMatch } from "@/lib/api";
import { ELEMENT_INFO, GAME_INFO } from "@/lib/battle";
import { stageFor, usePet } from "@/lib/pet-store";
import { FacePicker } from "./FacePicker";
import { TurnAlerts } from "./TurnAlerts";
import { GAME_ICON } from "./GameModes";

/** Battle home: your record, quick match, challenge a friend, and every battle waiting on you. */
export function BattleLobby() {
  const { pet, update } = usePet();
  const router = useRouter();
  const token = pet?.workerId;
  const [data, setData] = useState<{ battles: BattleView[]; record: BattleRecord; food: number } | null>(null);
  const [stake, setStake] = useState(0);
  const [game, setGame] = useState<Game>("duel");
  const [busy, setBusy] = useState<"" | "quick" | "friend">("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const d = await getBattles(token);
      setData(d);
      // the pet evolves from battle wins
      if (pet && pet.jobsDone !== d.record.wins) update({ jobsDone: d.record.wins });
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
      const b = kind === "quick" ? await quickMatch(token, game) : await challengeFriend(token, stake, game);
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
          <div className="mt-6">
            <GlossButton href="/app/wallet">Connect wallet</GlossButton>
          </div>
        </div>
      </div>
    );
  }

  const element = pet?.species ? elementLabel(pet.species) : null;
  const waiting = data?.battles.filter((b) => b.turn?.next === "lock" || b.turn?.next === "reveal") ?? [];
  const others = data?.battles.filter((b) => !waiting.includes(b)) ?? [];

  return (
    <div className="space-y-5">
      <section className="grid items-center gap-8 rounded-[28px] bg-ground-deep p-8 md:grid-cols-[260px_1fr] md:p-12">
        <Pet species={pet?.species} face={pet?.face} stage={stage} mood="excited" dance="hop" watchPointer className="mx-auto w-48 md:w-full" title={name} />
        <div>
          <h1 className="font-display text-[clamp(1.8rem,3vw,2.6rem)] font-bold leading-[1.1]">{name} is ready to fight</h1>
          <p className="mt-2 text-ink-soft">
            {element ? `${element.label} pet: ${element.beats}. ` : ""}
            {data ? `${data.record.wins} wins · ${data.record.losses} losses · ${data.record.draws} draws · ${data.food} food` : "Loading your record..."}
          </p>

          <fieldset className="mt-6">
            <legend className="font-semibold">Pick a battle</legend>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(Object.keys(GAME_INFO) as Game[]).map((g) => {
                const Icon = GAME_ICON[g];
                const on = game === g;
                return (
                  <button
                    key={g}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setGame(g)}
                    className={`flex min-h-24 flex-col items-center justify-center gap-1 rounded-[18px] px-2 py-3 text-center transition-colors ${on ? "bg-[#007aff] text-white" : "bg-field hover:bg-field-hover"}`}
                  >
                    <Icon size={28} weight={on ? "fill" : "duotone"} className={on ? "text-white" : "text-[#007aff]"} />
                    <span className="font-display text-[16px] font-bold leading-tight">{GAME_INFO[g].name}</span>
                    <span className={`text-[12px] leading-snug ${on ? "text-white/85" : "text-ink-soft"}`}>{GAME_INFO[g].blurb}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <GlossButton type="button" onClick={() => go("quick")} disabled={!!busy}>
              {busy === "quick" ? "Finding a pet..." : "Quick match"}
            </GlossButton>
          </div>

          <div className="mt-6 rounded-[20px] bg-field p-4">
            <p className="font-semibold">Challenge a friend</p>
            <p className="mt-0.5 text-[14px] text-ink-soft">Send them a link. Stake food if you're brave: the winner takes it all.</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {[0, 1, 2, 3].map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={stake === n}
                  onClick={() => setStake(n)}
                  disabled={!!data && n > data.food}
                  className={`min-h-11 rounded-[14px] px-4 text-[15px] font-semibold transition-colors disabled:opacity-40 ${stake === n ? "bg-leaf text-on-leaf" : "bg-ground-deep hover:bg-field-hover"}`}
                >
                  {n === 0 ? "No stake" : `${n} food`}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => go("friend")}
              disabled={!!busy}
              className="mt-3 min-h-12 w-full rounded-[14px] bg-[#007aff] px-5 text-[15px] font-semibold text-white transition-colors hover:bg-[#0060cc] disabled:opacity-60 sm:w-auto"
            >
              {busy === "friend" ? "Creating..." : "Create challenge"}
            </button>
          </div>
          {error && <p role="alert" className="mt-3 text-[15px] text-[#c2410c]">{error}</p>}
          <div className="mt-4">
            <FacePicker />
          </div>
          <div className="mt-3">
            <TurnAlerts token={token} />
          </div>
        </div>
      </section>

      {waiting.length > 0 && (
        <section className="rounded-[28px] bg-ground-deep p-6 sm:p-8">
          <h2 className="font-display text-[24px] font-bold">Your move</h2>
          <BattleList items={waiting} face={pet?.face} />
        </section>
      )}

      {others.length > 0 && (
        <section className="rounded-[28px] bg-ground-deep p-6 sm:p-8">
          <h2 className="font-display text-[24px] font-bold">Your battles</h2>
          <BattleList items={others} face={pet?.face} onCancel={async (id) => { await cancelBattle(id, token).catch(() => {}); load(); }} />
        </section>
      )}
    </div>
  );
}

function elementLabel(species: string) {
  const map: Record<string, keyof typeof ELEMENT_INFO> = {
    ember: "blaze", drako: "blaze", zap: "blaze", bun: "blaze",
    kumo: "tide", goo: "tide", pip: "tide", pengu: "tide",
    boo: "spirit", kitsu: "spirit", neko: "spirit", mochi: "spirit",
  };
  return ELEMENT_INFO[map[species] ?? "spirit"];
}

function BattleList({ items, onCancel, face }: { items: BattleView[]; onCancel?: (id: string) => void; face?: string }) {
  return (
    <ol className="mt-4 divide-y divide-edge">
      {items.map((b) => {
        const me = b.you === "b" ? b.b : b.a;
        const them = b.you === "b" ? b.a : b.b;
        const myScore = b.you === "b" ? b.score.b : b.score.a;
        const theirScore = b.you === "b" ? b.score.a : b.score.b;
        const result =
          b.status === "done" ? (b.winner === "draw" ? "Draw" : b.winner === b.you ? "Won" : "Lost")
          : b.status === "open" ? "Waiting for an opponent"
          : b.status === "cancelled" ? "Expired"
          : b.turn?.next === "lock" ? `Round ${b.round}: pick your move`
          : b.turn?.next === "reveal" ? `Round ${b.round}: reveal`
          : `Round ${b.round}: their turn`;
        return (
          <li key={b.id} className="flex items-center gap-4 py-3">
            <div className="flex -space-x-3">
              <Pet species={me?.species as Species} face={face} dance="none" className="h-12 w-12" title={me?.name ?? "You"} />
              {them ? <Pet species={them.species as Species} dance="none" className="h-12 w-12" title={them.name} /> : null}
            </div>
            <Link href={`/app/battle/${b.id}`} className="min-w-0 flex-1">
              <p className="truncate font-semibold">{me?.name ?? "You"} vs {them?.name ?? "?"}</p>
              <p className="text-[13px] font-semibold text-[#007aff]">{GAME_INFO[b.game ?? "duel"].name}</p>
              <p className="text-[14px] text-ink-soft">
                {result}
                {b.status !== "open" ? ` · ${myScore}-${theirScore}` : ""}
                {b.stake_food ? ` · ${b.stake_food} food each` : ""}
              </p>
            </Link>
            {b.status === "open" && onCancel && (
              <button type="button" onClick={() => onCancel(b.id)} className="text-[14px] font-semibold text-ink-soft hover:text-ink">
                Cancel
              </button>
            )}
          </li>
        );
      })}
    </ol>
  );
}
