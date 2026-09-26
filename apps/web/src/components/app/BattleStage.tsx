"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { HandFist, MagicWand, ShieldCheck } from "@phosphor-icons/react";
import { Pet, type PetDance, type PetMood, type Species } from "@/components/Pet";
import type { BattlePet, BattleView, Move, Play, RoundResult } from "@/lib/api";
import { ELEMENT_INFO } from "@/lib/battle";

const MOVE_ICON = { attack: HandFist, guard: ShieldCheck, trick: MagicWand } as const;
const HEARTS = 3;

type Phase = "reveal" | "clash" | "hit";
type Fx = { r: RoundResult; phase: Phase };

/** The word that pops at the clash. Cute, loud, and it tells you why the round went that way. */
function clashWord(r: RoundResult): string {
  if (r.by === "timeout") return r.a === null || r.b === null ? "ZZZ..." : "TOO SLOW!";
  if (r.by === "tie") return "CLANG!";
  if (r.by === "element") return "SUPER EFFECTIVE!";
  const win = r.winner === "a" ? r.a : r.b;
  return win === "attack" ? "POW!" : win === "guard" ? "BLOCKED!" : "GOTCHA!";
}

/**
 * The fight: two pets face off with HP hearts. When a round closes it plays out in three beats:
 * moves pop up in bubbles, both pets dash in and clash with a word burst, then the loser is knocked
 * back and loses a heart while the winner hops. Everything is on screen before it moves.
 */
export function BattleStage({ b, mine, face, onAnnounce }: { b: BattleView; mine: "a" | "b"; face?: string; onAnnounce: (text: string | null) => void }) {
  const theirs: "a" | "b" = mine === "a" ? "b" : "a";
  const reduce = useReducedMotion();
  const [fx, setFx] = useState<Fx | null>(null);
  const seen = useRef<number | null>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach(window.clearTimeout), []);

  useEffect(() => {
    const n = b.rounds.length;
    if (seen.current === null) {
      seen.current = n;
      return;
    }
    if (n <= seen.current) return;
    seen.current = n;
    const r = b.rounds[n - 1];
    timers.current.forEach(window.clearTimeout);
    const at = (ms: number, f: () => void) => timers.current.push(window.setTimeout(f, reduce ? 0 : ms));
    setFx({ r, phase: "reveal" });
    at(550, () => {
      setFx({ r, phase: "clash" });
      if ("vibrate" in navigator) navigator.vibrate?.(r.winner === mine ? [30, 40, 60] : r.winner ? 160 : [20, 20, 20]);
    });
    at(1000, () => setFx({ r, phase: "hit" }));
    at(2400, () => setFx(null));
    const name = r.winner ? b[r.winner]?.name : null;
    onAnnounce(name ? `${name} takes round ${r.round}!` : `Round ${r.round}: a tie!`);
    at(2400, () => onAnnounce(null));
  }, [b, mine, reduce, onAnnounce]);

  const done = b.status === "done";
  const hearts = (side: "a" | "b") => Math.max(0, HEARTS - b.score[side === "a" ? "b" : "a"]);
  // during a round's animation, the heart is lost on the hit beat, not before
  const shownHearts = (side: "a" | "b") => {
    const h = hearts(side);
    return fx && fx.phase !== "hit" && fx.r.winner && fx.r.winner !== side ? h + 1 : h;
  };

  const look = (side: "a" | "b"): { mood: PetMood; dance: PetDance } => {
    if (fx?.phase === "hit" && fx.r.winner) return fx.r.winner === side ? { mood: "excited", dance: "hop" } : { mood: "surprised", dance: "dizzy" };
    if (fx?.phase === "clash") return { mood: "focused", dance: "none" };
    if (done) return b.winner === side ? { mood: "excited", dance: "cheer" } : b.winner === "draw" ? { mood: "happy", dance: "sway" } : { mood: "sad", dance: "none" };
    return { mood: "focused", dance: "bounce" };
  };

  const bubble = (side: "a" | "b"): Play | "ready" | undefined => {
    if (fx) return fx.r[side];
    if (b.status !== "active" || !b.turn) return undefined;
    const locked = side === mine ? b.turn.you_locked : b.turn.they_locked;
    return locked ? "ready" : undefined;
  };

  return (
    <div className="relative mt-6 grid grid-cols-[1fr_auto_1fr] items-end gap-1 sm:gap-6">
      <Fighter
        p={b[mine]} face={face} you={!!b.you} hearts={shownHearts(mine)} {...look(mine)} bubble={bubble(mine)}
        dir={1} fx={fx} side={mine} reduce={!!reduce}
      />
      <div className="relative flex min-w-[64px] flex-col items-center self-center">
        <p className="font-display text-[clamp(2rem,6vw,3.6rem)] font-bold tabular-nums tracking-wide">
          {b.score[mine]}<span className="px-1.5 text-ink-faint sm:px-3">:</span>{b.score[theirs]}
        </p>
        <AnimatePresence>
          {fx && fx.phase !== "reveal" && (
            <motion.div
              key={`burst-${fx.r.round}`}
              className="pointer-events-none absolute left-1/2 top-1/2 z-10"
              initial={{ scale: reduce ? 1 : 0.2, rotate: -12, x: "-50%", y: "-50%" }}
              animate={{ scale: 1, rotate: 0, x: "-50%", y: "-50%" }}
              exit={{ scale: 0.6, opacity: 0, x: "-50%", y: "-50%" }}
              transition={{ type: "spring", stiffness: 520, damping: 16 }}
            >
              <Burst word={clashWord(fx.r)} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <Fighter
        p={b[theirs]} hearts={shownHearts(theirs)} {...look(theirs)} bubble={bubble(theirs)}
        dir={-1} fx={fx} side={theirs} reduce={!!reduce} mirrored
      />
    </div>
  );
}

function Fighter({ p, face, you, hearts, mood, dance, bubble, dir, fx, side, reduce, mirrored }: {
  p: BattlePet | null; face?: string; you?: boolean; hearts: number; mood: PetMood; dance: PetDance;
  bubble: Play | "ready" | undefined; dir: 1 | -1; fx: Fx | null; side: "a" | "b"; reduce: boolean; mirrored?: boolean;
}) {
  if (!p) {
    return (
      <div className="flex flex-col items-center text-center">
        <div className="grid aspect-square w-full max-w-[220px] place-items-center font-display text-[48px] font-bold text-ink-faint">?</div>
        <p className="mt-1 font-semibold text-ink-soft">Waiting...</p>
      </div>
    );
  }
  const lost = fx?.phase === "hit" && fx.r.winner !== null && fx.r.winner !== side;
  const won = fx?.phase === "hit" && fx.r.winner === side;
  const motionFor = reduce
    ? {}
    : fx?.phase === "clash"
      ? { x: [0, 38 * dir, 22 * dir], transition: { duration: 0.42, times: [0, 0.7, 1] } }
      : lost
        ? { x: [22 * dir, -34 * dir, 0], rotate: [0, -16 * dir, 0], transition: { duration: 0.7 } }
        : won
          ? { x: [22 * dir, 0], y: [0, -22, 0], transition: { duration: 0.6 } }
          : { x: 0, y: 0, rotate: 0, transition: { duration: 0.3 } };

  return (
    <div className="relative flex flex-col items-center text-center">
      <div className="relative h-12 w-full">
        <AnimatePresence>
          {bubble !== undefined && (
            <motion.div
              key={`${bubble}`}
              className="absolute left-1/2 top-0 flex h-11 min-w-11 items-center justify-center gap-1 rounded-full bg-white px-3 text-[#007aff] shadow-[0_2px_6px_rgba(0,90,200,0.18)]"
              initial={{ scale: reduce ? 1 : 0.4, x: "-50%", y: reduce ? 0 : 8 }}
              animate={{ scale: 1, x: "-50%", y: 0 }}
              exit={{ scale: 0.4, opacity: 0, x: "-50%" }}
              transition={{ type: "spring", stiffness: 500, damping: 18 }}
            >
              <BubbleContent play={bubble} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <motion.div className="w-full max-w-[220px]" animate={motionFor}>
        <div className={mirrored ? "-scale-x-100" : ""}>
          <Pet species={p.species as Species} face={face} mood={mood} dance={dance} className="w-full" title={p.name} />
        </div>
      </motion.div>
      <Hearts n={hearts} reduce={reduce} />
      <p className="mt-1 font-display text-[clamp(1rem,2.2vw,1.35rem)] font-bold leading-tight">{p.name}{you ? " (you)" : ""}</p>
      <p className="text-[13px] text-ink-soft">{ELEMENT_INFO[p.element].label}</p>
    </div>
  );
}

function BubbleContent({ play }: { play: Play | "ready" }) {
  if (play === "ready") return <span className="text-[14px] font-bold">Ready!</span>;
  if (play === null) return <span className="text-[14px] font-bold text-ink-faint">zzz</span>;
  if (play === "locked") return <span className="text-[14px] font-bold text-ink-faint">?</span>;
  const Icon = MOVE_ICON[play as Move];
  return <Icon size={24} weight="fill" />;
}

function Hearts({ n, reduce }: { n: number; reduce: boolean }) {
  return (
    <div className="mt-1 flex gap-1" aria-label={`${n} of ${HEARTS} hearts left`}>
      {Array.from({ length: HEARTS }, (_, i) => {
        const full = i < n;
        return (
          <motion.svg
            key={i}
            viewBox="0 0 24 22"
            className="h-5 w-5"
            animate={reduce ? undefined : { scale: full ? 1 : [1, 1.5, 1], opacity: full ? 1 : [1, 1, 0.9] }}
            transition={{ duration: 0.45 }}
          >
            <path
              d="M12 21C6 16.5 1.5 12.6 1.5 7.6 1.5 4.3 4 1.8 7.1 1.8c2 0 3.8 1.1 4.9 2.8 1.1-1.7 2.9-2.8 4.9-2.8 3.1 0 5.6 2.5 5.6 5.8 0 5-4.5 8.9-10.5 13.4z"
              fill={full ? "#ff7a93" : "#e3e3e8"}
              stroke={full ? "#e8566f" : "#c7c7cc"}
              strokeWidth="1.5"
            />
            {full && <ellipse cx="7.5" cy="6.5" rx="2.2" ry="1.4" fill="#fff" opacity="0.6" transform="rotate(-30 7.5 6.5)" />}
          </motion.svg>
        );
      })}
    </div>
  );
}

/** A comic clash burst in the pets' own yellow, the word dead-centred in it. */
function Burst({ word }: { word: string }) {
  const long = word.length > 8;
  const pts = Array.from({ length: 24 }, (_, i) => {
    const a = (i / 24) * Math.PI * 2;
    const r = i % 2 ? 44 : 60;
    return `${(90 + Math.cos(a) * r * (long ? 1.45 : 1.15)).toFixed(1)},${(60 + Math.sin(a) * r * 0.82).toFixed(1)}`;
  }).join(" ");
  return (
    <svg viewBox="0 0 180 120" className={long ? "w-[190px] sm:w-[230px]" : "w-[140px] sm:w-[170px]"} aria-label={word} role="img">
      <polygon points={pts} fill="#ffcc33" stroke="#e0a800" strokeWidth="3" strokeLinejoin="round" />
      {(() => {
        // long words break onto two centred lines so nothing spills past the burst
        const lines = long && word.includes(" ") ? word.split(" ") : [word];
        const size = lines.length > 1 ? 20 : long ? 18 : 26;
        const lead = size * 1.05;
        return lines.map((line, i) => (
          <text
            key={line}
            x="90"
            y={60 + (i - (lines.length - 1) / 2) * lead}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={size}
            fontWeight="800"
            fill="#1d1d1f"
            fontFamily="var(--font-pally), sans-serif"
            letterSpacing="0.5"
          >
            {line}
          </text>
        ));
      })()}
    </svg>
  );
}
