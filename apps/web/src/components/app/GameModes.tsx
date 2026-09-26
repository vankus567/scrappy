"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { ArrowLeft, ArrowRight, ArrowUp, Cards, CastleTurret, HandFist, HandPalm, MagicWand, ShieldCheck, SoccerBall, Sword } from "@phosphor-icons/react";
import type { BattleView, Game, Move, Play, RoundResult } from "@/lib/api";
import { energyFor, KING_HP, MOVE_INFO, TOWER_HP } from "@/lib/battle";

export const GAME_ICON = { duel: Sword, penalty: SoccerBall, cards: Cards, towers: CastleTurret } as const;
const MOVE_ICON = { attack: HandFist, guard: ShieldCheck, trick: MagicWand } as const;
const DIRS = ["left", "center", "right"] as const;
const DIR_LABEL = { left: "Left", center: "Middle", right: "Right" } as const;
const DIR_ICON = { left: ArrowLeft, center: ArrowUp, right: ArrowRight } as const;

const shown = (p: Play): p is string => !!p && p !== "locked";

/** One line of round history, e.g. "Shot left, dove right" or "Card 4". */
export function playLabel(game: Game, p: Play): string {
  if (p === null) return "no move";
  if (p === "locked") return "hid its move";
  if (game === "duel") return MOVE_INFO[p as Move]?.label ?? p;
  if (game === "penalty") {
    const [s, d] = p.split(":") as (keyof typeof DIR_LABEL)[];
    return `shot ${DIR_LABEL[s]?.toLowerCase()}, dove ${DIR_LABEL[d]?.toLowerCase()}`;
  }
  if (game === "cards") return `card ${p}`;
  const [l, r] = p.split(",");
  return `${l} left, ${r} right`;
}

/** The word that pops at the clash. */
export function clashWord(game: Game, r: RoundResult): string {
  if (r.by === "timeout" || (r.a === null && r.b === null)) return "ZZZ...";
  if (game === "penalty") {
    const g = r.detail ?? {};
    if (g.a_goal && g.b_goal) return "GOAL GOAL!";
    if (!g.a_goal && !g.b_goal) return "SAVED!";
    return "GOAL!";
  }
  if (game === "cards") return r.by === "upset" ? "UPSET!" : r.by === "tie" ? "SNAP!" : "HIGH CARD!";
  if (game === "towers") return r.by === "tie" ? "STANDOFF!" : "CHARGE!";
  if (r.by === "tie") return "CLANG!";
  if (r.by === "element") return "SUPER EFFECTIVE!";
  const win = r.winner === "a" ? r.a : r.b;
  return win === "attack" ? "POW!" : win === "guard" ? "BLOCKED!" : "GOTCHA!";
}

/** What floats above a pet when its move is revealed. */
export function BubbleContent({ game, play }: { game: Game; play: Play | "ready" }) {
  if (play === "ready") return <span className="text-[14px] font-bold">Ready!</span>;
  if (play === null) return <span className="text-[14px] font-bold text-ink-faint">zzz</span>;
  if (play === "locked") return <span className="text-[14px] font-bold text-ink-faint">?</span>;
  if (game === "duel") {
    const Icon = MOVE_ICON[play as Move];
    return Icon ? <Icon size={24} weight="fill" /> : null;
  }
  if (game === "penalty") {
    const [s, d] = play.split(":") as (keyof typeof DIR_ICON)[];
    const S = DIR_ICON[s];
    const D = DIR_ICON[d];
    return (
      <span className="flex items-center gap-1.5 text-[13px] font-bold">
        <SoccerBall size={16} weight="fill" />{S && <S size={16} weight="bold" />}
        <HandPalm size={16} weight="fill" className="ml-1" />{D && <D size={16} weight="bold" />}
      </span>
    );
  }
  if (game === "cards") return <span className="font-display text-[20px] font-bold tabular-nums">{play}</span>;
  const [l, r] = play.split(",");
  return <span className="text-[13px] font-bold tabular-nums">{l} · {r}</span>;
}

/** Under each pet: hearts (duel, cards), goals (penalty) or castle health (towers). */
export function Meter({ b, side, lagging, reduce }: { b: BattleView; side: "a" | "b"; lagging: boolean; reduce: boolean }) {
  const other = side === "a" ? "b" : "a";
  if (b.game === "penalty") {
    // one ball per round: filled = your goal, empty = missed or saved
    const goals = b.rounds.map((r) => !!(side === "a" ? r.detail?.a_goal : r.detail?.b_goal));
    const shownGoals = lagging ? goals.slice(0, -1) : goals;
    return (
      <div className="mt-1 flex gap-1" aria-label={`${shownGoals.filter(Boolean).length} goals`}>
        {Array.from({ length: 5 }, (_, i) => (
          <SoccerBall key={i} size={18} weight={shownGoals[i] ? "fill" : "regular"} className={i < shownGoals.length ? (shownGoals[i] ? "text-[#15803d]" : "text-ink-faint") : "text-[#d1d1d6]"} />
        ))}
      </div>
    );
  }
  if (b.game === "towers") {
    const hp = b.state?.hp?.[side] ?? { left: TOWER_HP, right: TOWER_HP, king: KING_HP };
    const bars: [string, number, number][] = [["L", hp.left, TOWER_HP], ["K", hp.king, KING_HP], ["R", hp.right, TOWER_HP]];
    return (
      <div className="mt-1 flex w-full max-w-[180px] items-end justify-center gap-1.5" aria-label={`Towers: left ${hp.left}, king ${hp.king}, right ${hp.right}`}>
        {bars.map(([label, v, max]) => (
          <div key={label} className="flex flex-1 flex-col items-center">
            <div className="h-2 w-full overflow-hidden rounded-full bg-[#e5e5ea]">
              <motion.div className="h-full rounded-full bg-[#007aff]" animate={{ width: `${(v / max) * 100}%` }} transition={{ duration: reduce ? 0 : 0.5 }} />
            </div>
            <span className="mt-0.5 text-[11px] font-semibold tabular-nums text-ink-soft">{label} {v}</span>
          </div>
        ))}
      </div>
    );
  }
  const lost = b.score[other];
  const n = Math.max(0, 3 - lost + (lagging ? 1 : 0));
  return <Hearts n={Math.min(3, n)} reduce={reduce} />;
}

function Hearts({ n, reduce }: { n: number; reduce: boolean }) {
  return (
    <div className="mt-1 flex gap-1" aria-label={`${n} of 3 hearts left`}>
      {Array.from({ length: 3 }, (_, i) => {
        const full = i < n;
        return (
          <motion.svg key={i} viewBox="0 0 24 22" className="h-5 w-5" animate={reduce ? undefined : { scale: full ? 1 : [1, 1.5, 1] }} transition={{ duration: 0.45 }}>
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

/** The score shown between the pets. Tower Rush shows castle HP totals. */
export function centerScore(b: BattleView, mine: "a" | "b") {
  const theirs = mine === "a" ? "b" : "a";
  return [b.score[mine], b.score[theirs]] as const;
}

// ---------------- move pickers ----------------

const tile = "flex min-h-24 flex-col items-center justify-center gap-1 rounded-[20px] bg-field px-2 py-3 transition-colors hover:bg-field-hover active:scale-[0.98] disabled:opacity-40";
const choice = (on: boolean) => `min-h-12 flex-1 rounded-[14px] px-2 text-[15px] font-semibold transition-colors ${on ? "bg-[#007aff] text-white" : "bg-field hover:bg-field-hover"}`;
const lockBtn = "mt-4 min-h-12 w-full rounded-[14px] bg-[#007aff] px-5 text-[16px] font-semibold text-white transition-colors hover:bg-[#0060cc] disabled:opacity-50";

export function MovePicker({ b, mine, busy, onLock }: { b: BattleView; mine: "a" | "b"; busy: boolean; onLock: (move: string) => void }) {
  if (b.game === "penalty") return <PenaltyPicker busy={busy} onLock={onLock} />;
  if (b.game === "cards") return <CardPicker used={b.state?.used?.[mine] ?? []} busy={busy} onLock={onLock} />;
  if (b.game === "towers") return <TowerPicker round={b.round} busy={busy} onLock={onLock} />;
  return (
    <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
      {(["attack", "guard", "trick"] as Move[]).map((m) => {
        const Icon = MOVE_ICON[m];
        return (
          <button key={m} type="button" onClick={() => onLock(m)} disabled={busy} className={tile}>
            <Icon size={30} weight="duotone" className="text-[#007aff]" />
            <span className="font-display text-[18px] font-bold">{MOVE_INFO[m].label}</span>
            <span className="text-[13px] text-ink-soft">{MOVE_INFO[m].beats}</span>
          </button>
        );
      })}
    </div>
  );
}

function PenaltyPicker({ busy, onLock }: { busy: boolean; onLock: (m: string) => void }) {
  const [shoot, setShoot] = useState<(typeof DIRS)[number] | null>(null);
  const [dive, setDive] = useState<(typeof DIRS)[number] | null>(null);
  return (
    <div className="mt-4 space-y-3">
      <div>
        <p className="mb-1.5 flex items-center gap-1.5 text-[15px] font-semibold"><SoccerBall size={18} weight="fill" className="text-[#007aff]" /> Shoot</p>
        <div className="flex gap-2">
          {DIRS.map((d) => <button key={d} type="button" aria-label={`Shoot ${DIR_LABEL[d].toLowerCase()}`} aria-pressed={shoot === d} onClick={() => setShoot(d)} className={choice(shoot === d)}>{DIR_LABEL[d]}</button>)}
        </div>
      </div>
      <div>
        <p className="mb-1.5 flex items-center gap-1.5 text-[15px] font-semibold"><HandPalm size={18} weight="fill" className="text-[#007aff]" /> Your keeper dives</p>
        <div className="flex gap-2">
          {DIRS.map((d) => <button key={d} type="button" aria-label={`Dive ${DIR_LABEL[d].toLowerCase()}`} aria-pressed={dive === d} onClick={() => setDive(d)} className={choice(dive === d)}>{DIR_LABEL[d]}</button>)}
        </div>
      </div>
      <button type="button" disabled={busy || !shoot || !dive} onClick={() => shoot && dive && onLock(`${shoot}:${dive}`)} className={lockBtn}>
        {shoot && dive ? "Take the kick" : "Pick a shot and a dive"}
      </button>
    </div>
  );
}

function CardPicker({ used, busy, onLock }: { used: string[]; busy: boolean; onLock: (m: string) => void }) {
  return (
    <div className="mt-4 flex justify-center gap-2 sm:gap-3">
      {["1", "2", "3", "4", "5"].map((c) => {
        const gone = used.includes(c);
        return (
          <button
            key={c}
            type="button"
            disabled={busy || gone}
            onClick={() => onLock(c)}
            aria-label={gone ? `Card ${c}, already played` : `Play card ${c}`}
            className={`relative flex aspect-[5/7] w-[18%] max-w-[88px] flex-col items-center justify-center rounded-[14px] border-2 transition-colors disabled:cursor-not-allowed ${gone ? "border-[#e5e5ea] bg-[#f2f2f7] text-ink-faint" : "border-[#b9dcff] bg-white text-[#007aff] hover:bg-field active:scale-[0.97]"}`}
          >
            <span className="font-display text-[clamp(1.6rem,6vw,2.4rem)] font-bold leading-none tabular-nums">{c}</span>
            {c === "1" && !gone && <span className="mt-1 text-[10px] font-semibold text-ink-soft">beats 5</span>}
          </button>
        );
      })}
    </div>
  );
}

function TowerPicker({ round, busy, onLock }: { round: number; busy: boolean; onLock: (m: string) => void }) {
  const energy = energyFor(round);
  const [l, setL] = useState(Math.ceil(energy / 2));
  const [r, setR] = useState(Math.floor(energy / 2));
  const left = energy - l - r;
  const Step = ({ label, v, set }: { label: string; v: number; set: (n: number) => void }) => (
    <div className="flex flex-1 flex-col items-center rounded-[18px] bg-field p-3">
      <p className="text-[14px] font-semibold text-ink-soft">{label} lane</p>
      <p className="font-display text-[34px] font-bold leading-tight tabular-nums">{v}</p>
      <div className="mt-1 flex gap-2">
        <button type="button" aria-label={`Fewer pets ${label}`} onClick={() => set(Math.max(0, v - 1))} disabled={v === 0} className="grid size-11 place-items-center rounded-full bg-white text-[22px] font-bold disabled:opacity-40">−</button>
        <button type="button" aria-label={`More pets ${label}`} onClick={() => set(v + 1)} disabled={left === 0} className="grid size-11 place-items-center rounded-full bg-white text-[22px] font-bold text-[#007aff] disabled:opacity-40">+</button>
      </div>
    </div>
  );
  return (
    <div className="mt-4">
      <p className="text-center text-[15px] font-semibold">{energy} energy this round{left > 0 ? ` · ${left} unused` : ""}</p>
      <div className="mt-2 flex gap-2 sm:gap-3">
        <Step label="Left" v={l} set={setL} />
        <Step label="Right" v={r} set={setR} />
      </div>
      <button type="button" disabled={busy} onClick={() => onLock(`${l},${r}`)} className={lockBtn}>Send the pets</button>
    </div>
  );
}
