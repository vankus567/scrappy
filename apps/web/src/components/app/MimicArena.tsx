"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check } from "@phosphor-icons/react";
import { GlossButton } from "@/components/GlossButton";
import { Pet, type Species } from "@/components/Pet";
import { getMimic, joinMimic, leaveMimic, type MimicPlayer, type MimicView, quickMimic, startMimic, submitMimic } from "@/lib/api";
import { usePet } from "@/lib/pet-store";
import { MimicRecorder } from "./MimicRecorder";

/** One Mimic battle: gather 2-4 players, three clips, everyone copies each clip, best total wins. */
export function MimicArena({ id }: { id: string }) {
  const { pet } = usePet();
  const router = useRouter();
  const token = pet?.workerId;
  const [b, setB] = useState<MimicView | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [announce, setAnnounce] = useState<string | null>(null);
  const seen = useRef<number | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const load = useCallback(async () => {
    try {
      setB(await getMimic(id, token));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Can't load this battle.");
    }
  }, [id, token]);

  useEffect(() => {
    load();
    const t = window.setInterval(load, 2000);
    return () => window.clearInterval(t);
  }, [load]);

  // a round just closed: say who nailed it
  useEffect(() => {
    if (!b) return;
    const n = b.results.length;
    if (seen.current === null) {
      seen.current = n;
      return;
    }
    if (n <= seen.current) return;
    seen.current = n;
    const last = b.results[n - 1];
    const top = [...last.scores].sort((x, y) => y.score - x.score)[0];
    const who = b.players.find((p) => p.seat === top?.seat);
    setAnnounce(who ? `${who.seat === b.you ? "You" : who.name} nailed round ${last.round} (${top.score})` : `Round ${last.round} done`);
    if ("vibrate" in navigator) navigator.vibrate?.(top?.seat === b.you ? [30, 40, 60] : 80);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setAnnounce(null), 2600);
  }, [b]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const act = async (f: () => Promise<MimicView>) => {
    setBusy(true);
    setError("");
    try {
      setB(await f());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  // quick match, host waiting alone: Scrappy Bot takes the empty seat after 10 seconds
  const isHost = !!b && b.you !== null && b.you === b.host;
  const waitingQuick = !!b && b.status === "open" && b.mode === "quick" && isHost && b.players.length < b.max_players;
  const [botIn, setBotIn] = useState<number | null>(null);
  useEffect(() => {
    if (!waitingQuick) {
      setBotIn(null);
      return;
    }
    setBotIn(10);
    const t = window.setInterval(() => setBotIn((s) => (s === null ? null : Math.max(0, s - 1))), 1000);
    return () => window.clearInterval(t);
  }, [waitingQuick]);
  useEffect(() => {
    if (botIn === 0 && waitingQuick && token && !busy) void act(() => startMimic(id, token, true));
    // act is stable enough for this one-shot trigger
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botIn, waitingQuick, token, busy, id]);

  const share = async () => {
    const url = `${window.location.origin}/app/battle/${id}`;
    try {
      if (navigator.share) await navigator.share({ title: "Scrappy Mimic", text: `${pet?.name ?? "My pet"} challenges you to a Mimic battle`, url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
      }
    } catch {}
  };

  if (!b) return <div className="rounded-[28px] bg-ground-deep p-8 text-ink-soft">{error || "Loading battle..."}</div>;

  const me = b.players.find((p) => p.seat === b.you);
  const clip = b.status === "active" ? b.clips[b.round - 1] : null;
  const winners = b.players.filter((p) => p.winner);
  const headline =
    b.status === "open" ? `Mimic lobby · ${b.players.length}/${b.max_players} players`
    : b.status === "cancelled" ? "This battle expired"
    : b.status === "done" ? (me?.winner ? (winners.length > 1 ? "You tied for the win!" : "You won!") : `${winners.map((w) => w.name).join(" & ")} won`)
    : announce ?? `Round ${b.round} of ${b.rounds_total}`;

  return (
    <div className="space-y-5">
      <section className="rounded-[28px] bg-ground-deep p-6 sm:p-10">
        <p className="text-center font-display text-[clamp(1.5rem,3.2vw,2.3rem)] font-bold leading-tight" aria-live="polite">{headline}</p>

        <ol className={`mt-6 grid gap-3 ${b.max_players > 2 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2"}`}>
          {Array.from({ length: b.max_players }, (_, seat) => {
            const p = b.players.find((x) => x.seat === seat);
            return <Seat key={seat} p={p} you={p?.seat === b.you} face={p?.seat === b.you ? pet?.face : undefined} status={b.status} />;
          })}
        </ol>

        {/* lobby */}
        {b.status === "open" && (
          <div className="mx-auto mt-8 max-w-md text-center">
            {isHost ? (
              <>
                <p className="text-ink-soft">
                  {b.mode === "quick"
                    ? botIn !== null && botIn > 0 ? `Looking for players... Scrappy Bot fills in ${botIn}s.` : "Calling Scrappy Bot..."
                    : "Share the link. Start when your friends are in, or fill empty seats with Scrappy Bots."}
                </p>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                  {b.mode === "friend" && <GlossButton type="button" onClick={share}>{copied ? "Link copied" : "Invite friends"}</GlossButton>}
                  {b.players.length >= 2 && (
                    <button type="button" disabled={busy} onClick={() => token && act(() => startMimic(id, token, false))} className="min-h-12 rounded-[14px] bg-[#007aff] px-5 font-semibold text-white disabled:opacity-60">
                      Start with {b.players.length}
                    </button>
                  )}
                  <button type="button" disabled={busy} onClick={() => token && act(() => startMimic(id, token, true))} className="min-h-12 rounded-[14px] bg-field px-5 font-semibold transition-colors hover:bg-field-hover disabled:opacity-60">
                    Fill with Scrappy Bots
                  </button>
                </div>
                <button type="button" onClick={async () => { if (token) { await leaveMimic(id, token).catch(() => {}); router.push("/app/battle"); } }} className="mt-4 text-[14px] font-semibold text-ink-soft hover:text-ink">
                  Cancel battle
                </button>
              </>
            ) : me ? (
              <p className="text-ink-soft">You're in. Waiting for the host to start.</p>
            ) : token ? (
              <GlossButton type="button" onClick={() => act(() => joinMimic(id, token))} disabled={busy || b.players.length >= b.max_players}>
                {b.players.length >= b.max_players ? "Battle is full" : "Join the battle"}
              </GlossButton>
            ) : (
              <>
                <p className="text-ink-soft">Hatch a pet and connect your wallet to join.</p>
                <div className="mt-4"><GlossButton href="/app">Get my pet</GlossButton></div>
              </>
            )}
          </div>
        )}

        {/* your round */}
        {b.status === "active" && me && clip && (
          me.submitted ? (
            <p className="mx-auto mt-8 max-w-md text-center text-ink-soft">
              Locked in{b.your_entry !== null ? ` at ${b.your_entry}` : ""}. Waiting for {b.players.filter((p) => !p.submitted).length} more
              {b.players.filter((p) => !p.submitted).length === 1 ? " player" : " players"}. Scores show when everyone's in.
            </p>
          ) : (
            <div className="mx-auto mt-6 max-w-xl">
              <MimicRecorder key={`${id}-${b.round}`} clip={clip} busy={busy} onLock={(contour) => token && act(() => submitMimic(id, token, b.round, contour))} />
            </div>
          )
        )}
        {b.status === "active" && !me && <p className="mt-8 text-center text-ink-soft">Battle in progress.</p>}

        {b.status === "done" && me && (
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <GlossButton type="button" disabled={busy} onClick={async () => token && router.push(`/app/battle/${(await quickMimic(token)).id}`)}>Battle again</GlossButton>
            <Link href="/app/battle" className="font-semibold text-ink-soft hover:text-ink">All battles</Link>
          </div>
        )}
        {error && <p role="alert" className="mt-4 text-center text-[15px] text-[#c2410c]">{error}</p>}
      </section>

      {b.results.length > 0 && (
        <section className="rounded-[28px] bg-ground-deep p-6 sm:p-8">
          <h2 className="font-display text-[22px] font-bold">Scores</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-[15px]">
              <thead>
                <tr className="text-ink-soft">
                  <th className="py-2 pr-3 font-semibold">Pet</th>
                  {b.results.map((r) => <th key={r.round} className="px-2 py-2 text-right font-semibold">{b.clips[r.round - 1]?.title ?? `Clip ${r.round}`}</th>)}
                  <th className="py-2 pl-3 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-edge">
                {[...b.players].sort((x, y) => y.total - x.total).map((p) => (
                  <tr key={p.seat} className={p.seat === b.you ? "font-semibold" : ""}>
                    <td className="py-2 pr-3">{p.name}{p.seat === b.you ? " (you)" : ""}</td>
                    {b.results.map((r) => <td key={r.round} className="px-2 py-2 text-right tabular-nums">{r.scores.find((s) => s.seat === p.seat)?.score ?? 0}</td>)}
                    <td className="py-2 pl-3 text-right font-display text-[18px] font-bold tabular-nums">{p.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function Seat({ p, you, face, status }: { p?: MimicPlayer; you: boolean; face?: string; status: MimicView["status"] }) {
  if (!p) {
    return (
      <li className="flex flex-col items-center rounded-[20px] bg-field p-3 text-center">
        <div className="grid aspect-square w-full max-w-[120px] place-items-center font-display text-[40px] font-bold text-ink-faint">?</div>
        <p className="mt-1 text-[14px] font-semibold text-ink-soft">Open seat</p>
      </li>
    );
  }
  const mood = status === "done" ? (p.winner ? "excited" : "sad") : p.submitted ? "happy" : "focused";
  const dance = status === "done" ? (p.winner ? "cheer" : "none") : status === "active" && !p.submitted ? "bounce" : "none";
  return (
    <li className={`flex flex-col items-center rounded-[20px] p-3 text-center ${you ? "bg-field" : ""}`}>
      <div className="w-full max-w-[120px]">
        <Pet species={p.species as Species} face={face} mood={mood} dance={dance} className="w-full" title={p.name} />
      </div>
      <p className="mt-1 truncate font-display text-[16px] font-bold">{p.name}{you ? " (you)" : ""}</p>
      <p className="flex items-center gap-1 text-[13px] text-ink-soft">
        {status === "active" ? (p.submitted ? <><Check size={14} weight="bold" className="text-[#15803d]" /> Sang</> : "Singing...") : status === "done" ? `${p.total} pts` : p.bot ? "Bot" : "Ready"}
      </p>
    </li>
  );
}
