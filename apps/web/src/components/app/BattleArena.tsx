"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { GlossButton } from "@/components/GlossButton";
import { type BattleView, commitMove, getBattle, joinBattle, type Move, type Play, quickMatch, revealMove } from "@/lib/api";
import { commitHash, GAME_INFO, loadLocked, newSalt, saveLocked } from "@/lib/battle";
import { usePet } from "@/lib/pet-store";
import { BattleStage } from "./BattleStage";
import { MovePicker, playLabel } from "./GameModes";


/** One battle: accept, pick moves round by round (commit-reveal), watch the pets fight, see who won. */
export function BattleArena({ id }: { id: string }) {
  const { pet } = usePet();
  const router = useRouter();
  const token = pet?.workerId;
  const [b, setB] = useState<BattleView | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [announce, setAnnounce] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const revealing = useRef<string | null>(null);

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

  const lockIn = async (move: string) => {
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
      router.push(`/app/battle/${(await quickMatch(token, b?.game ?? "duel")).id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start a battle.");
      setBusy(false);
    }
  };

  const share = async () => {
    const url = `${window.location.origin}/app/battle/${id}`;
    const text = `${b?.a?.name ?? "My pet"} challenges your pet to ${GAME_INFO[b?.game ?? "duel"].name} on Scrappy`;
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

  const headline =
    b.status === "open" ? (b.you === "a" ? "Waiting for a challenger" : `${b.a?.name ?? "A pet"} challenges you`)
    : b.status === "cancelled" ? "This challenge expired"
    : done ? (b.winner === "draw" ? "It's a draw" : b.you ? (b.winner === b.you ? "You won!" : "You lost") : `${b[b.winner as "a" | "b"]?.name} won`)
    : announce ? announce
    : `${GAME_INFO[b.game].name} · round ${b.round} of 5`;

  const deadline = b.round_deadline ? Math.max(0, new Date(b.round_deadline).getTime() - Date.now()) : null;

  return (
    <div className="space-y-5">
      <section className="rounded-[28px] bg-ground-deep p-6 sm:p-10">
        <p className="text-center font-display text-[clamp(1.6rem,3.2vw,2.4rem)] font-bold leading-tight" aria-live="polite">{headline}</p>

        <BattleStage b={b} mine={mine} face={b.you ? pet?.face : undefined} onAnnounce={setAnnounce} />

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
                <p className="text-center text-ink-soft">{GAME_INFO[b.game].how} Your move stays secret until you both lock in.</p>
                <MovePicker b={b} mine={mine} busy={busy} onLock={lockIn} />
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
                  {left?.name}: <strong>{playLabel(b.game, r[mine])}</strong> · {right?.name}: <strong>{playLabel(b.game, r[theirs])}</strong>
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

