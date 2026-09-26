"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { HandFist, MagicWand, ShieldCheck } from "@phosphor-icons/react";
import { GlossButton } from "@/components/GlossButton";
import { Pet, type PetDance, type PetMood, type Species } from "@/components/Pet";
import { type BattlePet, type BattleView, commitMove, getBattle, joinBattle, type Move, type Play, quickMatch, revealMove } from "@/lib/api";
import { commitHash, ELEMENT_INFO, loadLocked, MOVE_INFO, newSalt, saveLocked } from "@/lib/battle";
import { usePet } from "@/lib/pet-store";

const MOVE_ICON = { attack: HandFist, guard: ShieldCheck, trick: MagicWand } as const;
const playLabel = (p: Play) => (p === null ? "no move" : p === "locked" ? "hid its move" : MOVE_INFO[p].label);

/** One battle: accept, pick moves round by round (commit-reveal), watch the pets fight, see who won. */
export function BattleArena({ id }: { id: string }) {
  const { pet } = usePet();
  const router = useRouter();
  const token = pet?.workerId;
  const [b, setB] = useState<BattleView | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<{ winner: "a" | "b" | null; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const seenRounds = useRef<number | null>(null);
  const revealing = useRef<string | null>(null);
  const flashTimer = useRef<number | undefined>(undefined);

  const load = useCallback(async () => {
    try {
      setB(await getBattle(id, token));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Can't load this battle.");
    }
  }, [id, token]);

  useEffect(() => {
    load();
    const t = window.setInterval(load, 1500);
    return () => window.clearInterval(t);
  }, [load]);

  // a round just closed: flash who won it, shake the loser, buzz the phone
  useEffect(() => {
    if (!b) return;
    const n = b.rounds.length;
    if (seenRounds.current === null) {
      seenRounds.current = n;
      return;
    }
    if (n > seenRounds.current) {
      seenRounds.current = n;
      const r = b.rounds[n - 1];
      const winnerName = r.winner ? (r.winner === "a" ? b.a?.name : b.b?.name) : null;
      const how = r.by === "element" ? "element advantage" : r.by === "timeout" ? "the other didn't move in time" : r.by === "tie" ? "" : "";
      setFlash({ winner: r.winner, text: winnerName ? `${winnerName} takes round ${r.round}${how ? ` (${how})` : ""}` : `Round ${r.round} is a tie` });
      if ("vibrate" in navigator) navigator.vibrate?.(r.winner === b.you ? [40, 30, 40] : 120);
      // the battle refreshes every 1.5 s, so the timer lives in a ref, not in this effect's cleanup
      window.clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(() => setFlash(null), 1800);
    }
  }, [b]);
  useEffect(() => () => window.clearTimeout(flashTimer.current), []);

  // both locked in: reveal automatically from the move saved on this phone
  useEffect(() => {
    if (!b || !token || b.turn?.next !== "reveal") return;
    const tag = `${b.id}:${b.round}`;
    if (revealing.current === tag) return;
    const saved = loadLocked(b.id, b.round);
    if (!saved) {
      setError("This phone doesn't have your locked-in move for this round. Open the battle on the phone you used.");
      return;
    }
    revealing.current = tag;
    revealMove(b.id, token, b.round, saved.move, saved.salt)
      .then(setB)
      .catch((err) => {
        revealing.current = null;
        setError(err instanceof Error ? err.message : "Could not reveal your move.");
      });
  }, [b, token]);

  const lockIn = async (move: Move) => {
    if (!b || !token) return;
    setBusy(true);
    setError("");
    try {
      const salt = newSalt();
      if (!saveLocked(b.id, b.round, move, salt)) throw new Error("This browser can't save your move. Turn off private mode and try again.");
      setB(await commitMove(b.id, token, b.round, await commitHash(move, salt)));
      if ("vibrate" in navigator) navigator.vibrate?.(30);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not lock in your move.");
    } finally {
      setBusy(false);
    }
  };

  const accept = async () => {
    if (!token) return;
    setBusy(true);
    setError("");
    try {
      setB(await joinBattle(id, token));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join.");
    } finally {
      setBusy(false);
    }
  };

  const again = async () => {
    if (!token) return;
    setBusy(true);
    try {
      router.push(`/app/battle/${(await quickMatch(token)).id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start a battle.");
      setBusy(false);
    }
  };

  const share = async () => {
    const url = `${window.location.origin}/app/battle/${id}`;
    const text = `${b?.a?.name ?? "My pet"} challenges your pet on Scrappy`;
    try {
      if (navigator.share) await navigator.share({ title: "Scrappy battle", text, url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
      }
    } catch {}
  };

  if (!b) {
    return <div className="rounded-[28px] bg-ground-deep p-8 text-ink-soft">{error || "Loading battle..."}</div>;
  }

  const mine: "a" | "b" = b.you ?? "a";
  const theirs: "a" | "b" = mine === "a" ? "b" : "a";
  const left = b[mine];
  const right = b[theirs];
  const done = b.status === "done";
  const moodFor = (side: "a" | "b"): { mood: PetMood; dance: PetDance } => {
    if (done) return b.winner === side ? { mood: "excited", dance: "cheer" } : b.winner === "draw" ? { mood: "happy", dance: "sway" } : { mood: "sad", dance: "none" };
    if (flash) return flash.winner === side ? { mood: "excited", dance: "hop" } : flash.winner ? { mood: "surprised", dance: "dizzy" } : { mood: "curious", dance: "shake" };
    return { mood: "focused", dance: "bounce" };
  };

  const headline =
    b.status === "open" ? (b.you === "a" ? "Waiting for a challenger" : `${b.a?.name ?? "A pet"} challenges you`)
    : b.status === "cancelled" ? "This challenge expired"
    : done ? (b.winner === "draw" ? "It's a draw" : b.you ? (b.winner === b.you ? "You won!" : "You lost") : `${b[b.winner as "a" | "b"]?.name} won`)
    : flash ? flash.text
    : `Round ${b.round} of 5`;

  const deadline = b.round_deadline ? Math.max(0, new Date(b.round_deadline).getTime() - Date.now()) : null;

  return (
    <div className="space-y-5">
      <section className="rounded-[28px] bg-ground-deep p-6 sm:p-10">
        <p className="text-center font-display text-[clamp(1.6rem,3.2vw,2.4rem)] font-bold leading-tight" aria-live="polite">{headline}</p>

        <div className="mt-6 grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-6">
          <Fighter p={left} {...moodFor(mine)} you={!!b.you} face={b.you ? pet?.face : undefined} />
          <p className="font-display text-[clamp(2.4rem,7vw,4.4rem)] font-bold tabular-nums tracking-wide">
            {b.score[mine]}<span className="px-2 text-ink-faint sm:px-4">:</span>{b.score[theirs]}
          </p>
          <Fighter p={right} {...moodFor(theirs)} mirrored />
        </div>

        {/* open challenge */}
        {b.status === "open" && (
          <div className="mx-auto mt-8 max-w-md text-center">
            {b.you === "a" ? (
              <>
                <p className="text-ink-soft">Send this link to a friend. The battle starts when they accept.{b.stake_food ? ` Stake: ${b.stake_food} food each.` : ""}</p>
                <div className="mt-4">
                  <GlossButton type="button" onClick={share}>{copied ? "Link copied" : "Share challenge"}</GlossButton>
                </div>
              </>
            ) : token ? (
              <>
                <p className="text-ink-soft">{b.stake_food ? `Winner takes ${b.stake_food * 2} food.` : "Friendly battle, no stake."}</p>
                <div className="mt-4">
                  <GlossButton type="button" onClick={accept} disabled={busy}>{busy ? "Joining..." : "Accept challenge"}</GlossButton>
                </div>
              </>
            ) : (
              <>
                <p className="text-ink-soft">Hatch a pet and connect your wallet to accept.</p>
                <div className="mt-4"><GlossButton href="/app">Get my pet</GlossButton></div>
              </>
            )}
          </div>
        )}

        {/* your turn */}
        {b.status === "active" && b.turn && (
          <div className="mx-auto mt-8 max-w-xl">
            {b.turn.next === "lock" ? (
              <>
                <p className="text-center text-ink-soft">Pick a move. It stays secret until you both lock in.</p>
                <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
                  {(["attack", "guard", "trick"] as Move[]).map((m) => {
                    const Icon = MOVE_ICON[m];
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => lockIn(m)}
                        disabled={busy}
                        className="flex min-h-24 flex-col items-center justify-center gap-1 rounded-[20px] bg-field px-2 py-3 transition-colors hover:bg-field-hover active:scale-[0.98] disabled:opacity-60"
                      >
                        <Icon size={30} weight="duotone" className="text-[#007aff]" />
                        <span className="font-display text-[18px] font-bold">{MOVE_INFO[m].label}</span>
                        <span className="text-[13px] text-ink-soft">{MOVE_INFO[m].beats}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <p className="text-center text-ink-soft">
                {b.turn.next === "wait_lock" && `Locked in. Waiting for ${right?.name ?? "your opponent"} to pick.`}
                {b.turn.next === "reveal" && "Both locked in. Revealing..."}
                {b.turn.next === "wait_reveal" && `Waiting for ${right?.name ?? "your opponent"} to reveal.`}
              </p>
            )}
            {deadline !== null && (
              <p className="mt-3 text-center text-[14px] text-ink-faint">
                Round closes in {deadline > 3_600_000 ? `${Math.round(deadline / 3_600_000)} h` : `${Math.max(1, Math.round(deadline / 60_000))} min`}. You can close the app and come back.
              </p>
            )}
          </div>
        )}

        {b.status === "active" && !b.you && <p className="mt-8 text-center text-ink-soft">Battle in progress.</p>}

        {done && (
          <div className="mx-auto mt-8 max-w-md text-center">
            <p className="text-ink-soft">
              {b.stake_food
                ? b.winner === "draw" ? `Stakes returned: ${b.stake_food} food each.` : `${b[b.winner as "a" | "b"]?.name} takes ${b.stake_food * 2} food.`
                : "Friendly battle."}
            </p>
            {b.you && (
              <div className="mt-4 flex flex-wrap items-center justify-center gap-4">
                <GlossButton type="button" onClick={again} disabled={busy}>Battle again</GlossButton>
                <Link href="/app/battle" className="font-semibold text-ink-soft hover:text-ink">All battles</Link>
              </div>
            )}
          </div>
        )}

        {error && <p role="alert" className="mt-4 text-center text-[15px] text-[#c2410c]">{error}</p>}
      </section>

      {b.rounds.length > 0 && (
        <section className="rounded-[28px] bg-ground-deep p-6 sm:p-8">
          <h2 className="font-display text-[22px] font-bold">Rounds</h2>
          <ol className="mt-3 divide-y divide-edge">
            {b.rounds.map((r) => (
              <li key={r.round} className="grid grid-cols-[auto_1fr_auto] items-center gap-4 py-3">
                <span className="font-display text-[18px] font-bold tabular-nums text-ink-faint">{r.round}</span>
                <span className="text-[15px]">
                  {left?.name}: <strong>{playLabel(r[mine])}</strong> · {right?.name}: <strong>{playLabel(r[theirs])}</strong>
                  {r.by === "element" ? " · element decided it" : ""}
                </span>
                <span className="font-semibold">{r.winner === null ? "Tie" : r.winner === mine ? (b.you ? "You" : left?.name) : right?.name}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

function Fighter({ p, mood, dance, mirrored, you, face }: { p: BattlePet | null; mood: PetMood; dance: PetDance; mirrored?: boolean; you?: boolean; face?: string }) {
  if (!p) {
    return (
      <div className="flex flex-col items-center text-center">
        <div className="grid aspect-square w-full max-w-[220px] place-items-center font-display text-[48px] font-bold text-ink-faint">?</div>
        <p className="mt-1 font-semibold text-ink-soft">Waiting...</p>
      </div>
    );
  }
  const el = ELEMENT_INFO[p.element];
  return (
    <div className="flex flex-col items-center text-center">
      <div className={`w-full max-w-[220px] ${mirrored ? "-scale-x-100" : ""}`}>
        <Pet species={p.species as Species} face={face} mood={mood} dance={dance} className="w-full" title={p.name} />
      </div>
      <p className="mt-1 font-display text-[clamp(1rem,2.2vw,1.35rem)] font-bold">{p.name}{you ? " (you)" : ""}</p>
      <p className="text-[13px] text-ink-soft">{el.label}</p>
    </div>
  );
}
