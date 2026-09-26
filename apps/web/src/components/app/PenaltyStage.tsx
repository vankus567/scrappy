"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Pet, type PetDance, type PetMood, type Species } from "@/components/Pet";
import type { BattlePet, BattleView, Play, RoundResult } from "@/lib/api";
import { ELEMENT_INFO } from "@/lib/battle";
import { Meter } from "./GameModes";

type Dir = "left" | "center" | "right";
type Kick = { shooter: "a" | "b"; shoot: Dir | null; dive: Dir | null; goal: boolean };
type Beat = { kick: Kick; step: "runup" | "fly" | "result"; which: 1 | 2 } | null;

// positions in % of the pitch box
const SHOT: Record<Dir, { x: number; y: number }> = { left: { x: 29, y: 31 }, center: { x: 50, y: 28 }, right: { x: 71, y: 31 } };
const DIVE_X: Record<Dir, number> = { left: 32, center: 50, right: 68 };
const DIVE_TILT: Record<Dir, number> = { left: -32, center: 0, right: 32 };

const parse = (p: Play): { shoot: Dir; dive: Dir } | null => {
  if (!p || p === "locked") return null;
  const [s, d] = p.split(":");
  return { shoot: s as Dir, dive: d as Dir };
};

/**
 * Penalty Shootout on a real pitch: goal, net, penalty spot. Each round is two kicks: you shoot while
 * they keep goal, then they shoot while you keep. The ball flies to the chosen side, the keeper dives,
 * and the net ripples on a goal or the ball is palmed away on a save.
 */
export function PenaltyStage({ b, mine, face, onAnnounce }: { b: BattleView; mine: "a" | "b"; face?: string; onAnnounce: (text: string | null) => void }) {
  const theirs: "a" | "b" = mine === "a" ? "b" : "a";
  const reduce = useReducedMotion();
  const [beat, setBeat] = useState<Beat>(null);
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
    const r: RoundResult = b.rounds[n - 1];
    const pa = parse(r.a);
    const pb = parse(r.b);
    const goal = (side: "a" | "b") => !!(side === "a" ? r.detail?.a_goal : r.detail?.b_goal);
    const kickOf = (shooter: "a" | "b"): Kick => {
      const s = shooter === "a" ? pa : pb;
      const k = shooter === "a" ? pb : pa;
      return { shooter, shoot: s?.shoot ?? null, dive: k?.dive ?? null, goal: goal(shooter) };
    };
    const first = kickOf(mine);
    const second = kickOf(theirs);
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
    const at = (ms: number, f: () => void) => timers.current.push(window.setTimeout(f, reduce ? Math.min(ms, 50) : ms));
    const name = (side: "a" | "b") => b[side]?.name ?? "Pet";
    const say = (k: Kick) => (k.shoot === null ? `${name(k.shooter)} didn't kick` : k.goal ? `${name(k.shooter)} scores!` : "Saved!");
    const buzz = (k: Kick) => "vibrate" in navigator && navigator.vibrate?.(k.goal ? (k.shooter === mine ? [30, 40, 60] : 140) : 40);
    setBeat({ kick: first, step: "runup", which: 1 });
    onAnnounce(`Round ${r.round}: your kick`);
    at(450, () => setBeat({ kick: first, step: "fly", which: 1 }));
    at(1050, () => {
      setBeat({ kick: first, step: "result", which: 1 });
      onAnnounce(say(first));
      buzz(first);
    });
    at(2100, () => {
      setBeat({ kick: second, step: "runup", which: 2 });
      onAnnounce(`Round ${r.round}: their kick`);
    });
    at(2550, () => setBeat({ kick: second, step: "fly", which: 2 }));
    at(3150, () => {
      setBeat({ kick: second, step: "result", which: 2 });
      onAnnounce(say(second));
      buzz(second);
    });
    at(4300, () => {
      setBeat(null);
      onAnnounce(null);
    });
  }, [b, mine, theirs, reduce, onAnnounce]);

  // who stands where: idle = you at the spot, them in goal
  const shooter = beat ? beat.kick.shooter : mine;
  const keeper = shooter === mine ? theirs : mine;
  const shooterPet = b[shooter];
  const keeperPet = b[keeper];
  const faceFor = (side: "a" | "b") => (side === mine ? face : undefined);
  const done = b.status === "done";

  const kick = beat?.kick;
  const flying = beat && beat.step !== "runup";
  const ball = !beat || beat.step === "runup" || !kick?.shoot
    ? { x: 50, y: 78, scale: 1 }
    : beat.step === "fly"
      ? { ...SHOT[kick.shoot], scale: 0.62 }
      : kick.goal
        ? { x: SHOT[kick.shoot].x, y: SHOT[kick.shoot].y - 4, scale: 0.55 } // in the net
        : { x: kick.shoot === "left" ? 8 : kick.shoot === "right" ? 92 : 50, y: kick.shoot === "center" ? 8 : 22, scale: 0.5 }; // palmed away
  const diveTo = flying && kick?.dive ? kick.dive : null;

  const keeperLook: { mood: PetMood; dance: PetDance } =
    beat?.step === "result" ? (kick?.goal ? { mood: "sad", dance: "none" } : { mood: "excited", dance: "none" }) : { mood: "focused", dance: "none" };
  const shooterLook: { mood: PetMood; dance: PetDance } =
    beat?.step === "result" ? (kick?.goal ? { mood: "excited", dance: "cheer" } : { mood: "surprised", dance: "none" }) : { mood: "focused", dance: beat ? "none" : "bounce" };
  const idleLook = (side: "a" | "b"): { mood: PetMood; dance: PetDance } =>
    done ? (b.winner === side ? { mood: "excited", dance: "cheer" } : b.winner === "draw" ? { mood: "happy", dance: "sway" } : { mood: "sad", dance: "none" }) : { mood: "focused", dance: "bounce" };

  return (
    <div className="mt-5">
      <div className="relative mx-auto aspect-[6/5] w-full max-w-[560px] overflow-hidden rounded-[24px]">
        <Pitch netShake={!!(beat?.step === "result" && kick?.goal)} reduce={!!reduce} />

        {/* keeper on the goal line */}
        <motion.div
          className="absolute w-[24%]"
          style={{ left: "50%", top: "25%", translateX: "-50%" }}
          animate={
            reduce
              ? {}
              : diveTo
                ? { left: `${DIVE_X[diveTo]}%`, rotate: DIVE_TILT[diveTo], y: diveTo === "center" ? -10 : 6 }
                : { left: "50%", rotate: 0, y: 0 }
          }
          transition={{ type: "spring", stiffness: 260, damping: 18 }}
        >
          <Pet species={keeperPet?.species as Species} face={faceFor(keeper)} {...(beat ? keeperLook : idleLook(keeper))} className="w-full" title={`${keeperPet?.name ?? "Keeper"} in goal`} />
        </motion.div>

        {/* the ball */}
        <motion.div
          className="absolute z-10 w-[7%]"
          style={{ translateX: "-50%", translateY: "-50%" }}
          initial={false}
          animate={{ left: `${ball.x}%`, top: `${ball.y}%`, scale: ball.scale, rotate: flying ? 540 : 0 }}
          transition={reduce ? { duration: 0 } : { duration: beat?.step === "fly" ? 0.5 : 0.35, ease: beat?.step === "fly" ? [0.2, 0.7, 0.3, 1] : "easeOut" }}
        >
          <Ball />
        </motion.div>

        {/* shooter behind the ball */}
        <motion.div
          className="absolute w-[22%]"
          style={{ left: "50%", top: "66%", translateX: "-50%" }}
          animate={reduce ? {} : beat?.step === "runup" ? { y: [-14, 0], x: [0, 6] } : { y: 0, x: 0 }}
          transition={{ duration: 0.4 }}
        >
          <Pet species={shooterPet?.species as Species} face={faceFor(shooter)} {...(beat ? shooterLook : idleLook(shooter))} className="w-full" title={`${shooterPet?.name ?? "Shooter"} taking the kick`} />
        </motion.div>

        <AnimatePresence>
          {beat?.step === "result" && (
            <motion.p
              key={`${beat.which}-${kick?.goal}`}
              className="absolute left-1/2 top-[52%] z-20 rounded-full bg-white px-5 py-2 font-display text-[clamp(1.4rem,5vw,2.2rem)] font-bold shadow-[0_2px_6px_rgba(0,90,200,0.18)]"
              style={{ translateX: "-50%" }}
              initial={{ scale: reduce ? 1 : 0.3 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 16 }}
            >
              {kick?.shoot === null ? "No kick" : kick?.goal ? "GOAL!" : "SAVED!"}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* scoreboard: goals per side */}
      <div className="mx-auto mt-4 grid max-w-[560px] grid-cols-[1fr_auto_1fr] items-center gap-3">
        <Side p={b[mine]} you={!!b.you} b={b} side={mine} reduce={!!reduce} />
        <p className="font-display text-[clamp(1.8rem,5vw,2.8rem)] font-bold tabular-nums">
          {b.score[mine]}<span className="px-2 text-ink-faint">:</span>{b.score[theirs]}
        </p>
        <Side p={b[theirs]} b={b} side={theirs} reduce={!!reduce} />
      </div>
    </div>
  );
}

function Side({ p, you, b, side, reduce }: { p: BattlePet | null; you?: boolean; b: BattleView; side: "a" | "b"; reduce: boolean }) {
  return (
    <div className="flex flex-col items-center text-center">
      <p className="font-display text-[clamp(1rem,2.2vw,1.3rem)] font-bold leading-tight">{p ? `${p.name}${you ? " (you)" : ""}` : "Waiting..."}</p>
      {p && <p className="text-[13px] text-ink-soft">{ELEMENT_INFO[p.element].label}</p>}
      {p && <Meter b={b} side={side} lagging={false} reduce={reduce} />}
    </div>
  );
}

function Ball() {
  return (
    <svg viewBox="0 0 40 40" className="w-full" aria-hidden>
      <circle cx="20" cy="20" r="18" fill="#ffffff" stroke="#1d1d1f" strokeWidth="2" />
      <path d="M20 11l7 5-3 8h-8l-3-8z" fill="#1d1d1f" />
      <path d="M20 11V3M27 16l7-3M24 24l5 7M16 24l-5 7M13 16l-7-3" stroke="#1d1d1f" strokeWidth="2" strokeLinecap="round" />
      <ellipse cx="14" cy="12" rx="4" ry="2.5" fill="#fff" opacity="0.7" transform="rotate(-30 14 12)" />
    </svg>
  );
}

/** The pitch: stand, goal frame with a real net, mowing stripes, box lines and the penalty spot. */
function Pitch({ netShake, reduce }: { netShake: boolean; reduce: boolean }) {
  const netLines: React.ReactNode[] = [];
  // net: back plane (smaller, higher) joined to the frame, giving depth
  for (let i = 0; i <= 12; i++) {
    const fx = 70 + (220 * i) / 12;
    const bx = 88 + (184 * i) / 12;
    netLines.push(<line key={`v${i}`} x1={fx} y1={60} x2={bx} y2={78} />, <line key={`vb${i}`} x1={bx} y1={78} x2={bx} y2={150} />);
  }
  for (let j = 0; j <= 7; j++) {
    const y = 78 + (72 * j) / 7;
    netLines.push(<line key={`h${j}`} x1={88} y1={y} x2={272} y2={y} />);
  }
  for (let j = 0; j <= 7; j++) {
    const y = 78 + (72 * j) / 7;
    const fy = 60 + (90 * j) / 7;
    netLines.push(<line key={`sl${j}`} x1={70} y1={fy} x2={88} y2={y} />, <line key={`sr${j}`} x1={290} y1={fy} x2={272} y2={y} />);
  }
  return (
    <svg viewBox="0 0 360 300" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
      <defs>
        <linearGradient id="pen-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#bfe0ff" />
          <stop offset="1" stopColor="#e9f4ff" />
        </linearGradient>
      </defs>
      <rect width="360" height="150" fill="url(#pen-sky)" />
      {/* crowd band */}
      <rect y="96" width="360" height="54" fill="#d6e8fb" />
      {Array.from({ length: 30 }, (_, i) => (
        <circle key={i} cx={6 + i * 12.2} cy={112 + (i % 3) * 9} r="4.5" fill={["#9fd0ff", "#ffd66b", "#ff9fb4", "#c7c9d1"][i % 4]} opacity="0.8" />
      ))}
      {/* grass with mowing stripes */}
      {Array.from({ length: 6 }, (_, i) => (
        <rect key={i} y={150 + i * 25} width="360" height="25" fill={i % 2 ? "#5dbb63" : "#6cc870"} />
      ))}
      {/* box lines + spot */}
      <g stroke="#ffffff" strokeWidth="3" fill="none" opacity="0.9">
        <path d="M30 150 L10 300 M330 150 L350 300" />
        <path d="M95 150 L80 210 L280 210 L265 150" />
      </g>
      <ellipse cx="180" cy="240" rx="6" ry="3" fill="#ffffff" />
      {/* net behind the frame */}
      <motion.g
        stroke="#ffffff"
        strokeWidth="1.2"
        opacity="0.85"
        animate={netShake && !reduce ? { y: [0, -3, 2, -1, 0], x: [0, 1.5, -1.5, 0.5, 0] } : { y: 0, x: 0 }}
        transition={{ duration: 0.6 }}
      >
        {netLines}
      </motion.g>
      {/* frame */}
      <g stroke="#ffffff" strokeWidth="6" strokeLinecap="round" fill="none">
        <path d="M70 152 L70 60 L290 60 L290 152" />
      </g>
      <g stroke="#c7c9d1" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.8">
        <path d="M73 152 L73 63 L287 63 L287 152" />
      </g>
    </svg>
  );
}
