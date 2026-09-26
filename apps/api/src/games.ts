// Scrappy Battles game modes. Pure functions, no I/O.
// Every mode is simultaneous and secret: each round both players lock in one move (commit), then
// reveal. A move is a short string; each game validates and scores it. Missing moves are `null`,
// locked-but-never-revealed moves are "locked" (see battle.ts Play).
import { type Element, type Play as DuelPlay, resolveRound, score as duelScore, type Side } from "./battle";

export const GAMES = ["duel", "penalty", "cards", "towers"] as const;
export type Game = (typeof GAMES)[number];
export const isGame = (g: unknown): g is Game => typeof g === "string" && (GAMES as readonly string[]).includes(g);

export const GAME_ROUNDS = 5;

/** A revealed move string, "locked" (hid its move), or null (didn't show up). */
export type Play = string | "locked" | null;
export type Pair = { a: Play; b: Play };

export type GameRound = {
  round: number;
  a: Play;
  b: Play;
  winner: Side | null;
  by: string; // why: "move" | "element" | "timeout" | "tie" | "goal" | "save" | "higher" | "upset" | "push" ...
  detail?: Record<string, unknown>;
};
export type GameScore = {
  a: number;
  b: number;
  rounds: GameRound[];
  done: boolean;
  winner: Side | "draw" | null;
  state?: Record<string, unknown>;
};

const revealed = (p: Play): p is string => typeof p === "string" && p !== "locked";

// ---------------- penalty shootout ----------------
// move = "<shoot>:<dive>", each left | center | right. Your shot scores unless their keeper dives the same way.
const DIRS = ["left", "center", "right"] as const;
const parsePenalty = (m: string) => {
  const [shoot, dive] = m.split(":");
  return (DIRS as readonly string[]).includes(shoot) && (DIRS as readonly string[]).includes(dive) ? { shoot, dive } : null;
};

function penalty(pairs: Pair[]): GameScore {
  let a = 0;
  let b = 0;
  const rounds: GameRound[] = [];
  for (const [i, p] of pairs.slice(0, GAME_ROUNDS).entries()) {
    const pa = revealed(p.a) ? parsePenalty(p.a) : null;
    const pb = revealed(p.b) ? parsePenalty(p.b) : null;
    const aGoal = !!pa && pa.shoot !== pb?.dive;
    const bGoal = !!pb && pb.shoot !== pa?.dive;
    a += aGoal ? 1 : 0;
    b += bGoal ? 1 : 0;
    rounds.push({
      round: i + 1, a: p.a, b: p.b,
      winner: aGoal === bGoal ? null : aGoal ? "a" : "b",
      by: aGoal && bGoal ? "both_score" : !aGoal && !bGoal ? "both_saved" : "goal",
      detail: { a_goal: aGoal, b_goal: bGoal },
    });
  }
  // decided early once the trailing side can't catch up with the kicks left
  const left = GAME_ROUNDS - rounds.length;
  const done = rounds.length >= GAME_ROUNDS || a > b + left || b > a + left;
  return { a, b, rounds, done, winner: !done ? null : a > b ? "a" : b > a ? "b" : "draw" };
}

// ---------------- card clash ----------------
// move = "1".."5". Each card once per battle. Higher wins the round, except 1 beats 5. First to 3.
const CARDS = ["1", "2", "3", "4", "5"];

function cards(pairs: Pair[]): GameScore {
  let a = 0;
  let b = 0;
  const rounds: GameRound[] = [];
  const used = { a: [] as string[], b: [] as string[] };
  for (const [i, p] of pairs.slice(0, GAME_ROUNDS).entries()) {
    if (a >= 3 || b >= 3) break;
    const ca = revealed(p.a) ? Number(p.a) : null;
    const cb = revealed(p.b) ? Number(p.b) : null;
    if (ca) used.a.push(String(ca));
    if (cb) used.b.push(String(cb));
    let winner: Side | null = null;
    let by = "tie";
    if (!ca && !cb) by = "tie";
    else if (!ca) [winner, by] = ["b", "timeout"];
    else if (!cb) [winner, by] = ["a", "timeout"];
    else if (ca === 1 && cb === 5) [winner, by] = ["a", "upset"];
    else if (cb === 1 && ca === 5) [winner, by] = ["b", "upset"];
    else if (ca !== cb) [winner, by] = [ca > cb ? "a" : "b", "higher"];
    if (winner === "a") a++;
    if (winner === "b") b++;
    rounds.push({ round: i + 1, a: p.a, b: p.b, winner, by });
  }
  const done = a >= 3 || b >= 3 || rounds.length >= GAME_ROUNDS;
  return { a, b, rounds, done, winner: !done ? null : a > b ? "a" : b > a ? "b" : "draw", state: { used } };
}

// ---------------- tower rush ----------------
// Each side: left tower, right tower (6 HP each), king (8 HP). Each round you get energy (2 + round)
// and split it between lanes: move = "<left>,<right>". In each lane the bigger push wins; the
// difference hits the enemy tower in that lane, and damage past a fallen tower hits the king.
// King down = instant win. After 5 rounds, more total HP left wins.
export const TOWER_HP = 6;
export const KING_HP = 8;
export const energyFor = (round: number) => 2 + round;
const parseTowers = (m: string) => {
  const mm = /^(\d{1,2}),(\d{1,2})$/.exec(m);
  return mm ? { l: Number(mm[1]), r: Number(mm[2]) } : null;
};

type Castle = { left: number; right: number; king: number };
function towers(pairs: Pair[]): GameScore {
  const hp: Record<Side, Castle> = { a: { left: TOWER_HP, right: TOWER_HP, king: KING_HP }, b: { left: TOWER_HP, right: TOWER_HP, king: KING_HP } };
  const rounds: GameRound[] = [];
  const hit = (c: Castle, lane: "left" | "right", dmg: number) => {
    const onTower = Math.min(c[lane], dmg);
    c[lane] -= onTower;
    c.king = Math.max(0, c.king - (dmg - onTower));
  };
  let winner: Side | "draw" | null = null;
  for (const [i, p] of pairs.slice(0, GAME_ROUNDS).entries()) {
    const ta = (revealed(p.a) && parseTowers(p.a)) || { l: 0, r: 0 };
    const tb = (revealed(p.b) && parseTowers(p.b)) || { l: 0, r: 0 };
    const dmg = { a: 0, b: 0 }; // damage dealt BY a / BY b
    for (const [lane, xa, xb] of [["left", ta.l, tb.l], ["right", ta.r, tb.r]] as const) {
      if (xa > xb) {
        hit(hp.b, lane, xa - xb);
        dmg.a += xa - xb;
      } else if (xb > xa) {
        hit(hp.a, lane, xb - xa);
        dmg.b += xb - xa;
      }
    }
    rounds.push({
      round: i + 1, a: p.a, b: p.b,
      winner: dmg.a === dmg.b ? null : dmg.a > dmg.b ? "a" : "b",
      by: dmg.a === dmg.b ? "tie" : "push",
      detail: { dealt_a: dmg.a, dealt_b: dmg.b },
    });
    if (hp.a.king === 0 || hp.b.king === 0) {
      winner = hp.a.king === 0 && hp.b.king === 0 ? "draw" : hp.a.king === 0 ? "b" : "a";
      break;
    }
  }
  const total = (c: Castle) => c.left + c.right + c.king;
  const done = winner !== null || rounds.length >= GAME_ROUNDS;
  if (done && winner === null) winner = total(hp.a) > total(hp.b) ? "a" : total(hp.b) > total(hp.a) ? "b" : "draw";
  return { a: total(hp.a), b: total(hp.b), rounds, done, winner: done ? winner : null, state: { hp } };
}

// ---------------- shared ----------------

/**
 * Is this revealed move legal for this game, side and round, given that side's earlier revealed moves?
 * (Card reuse and tower energy can only be checked at reveal, because the commit hides the move.)
 */
export function validMove(game: Game, move: string, round: number, earlier: Play[]): boolean {
  switch (game) {
    case "duel":
      return move === "attack" || move === "guard" || move === "trick";
    case "penalty":
      return parsePenalty(move) !== null;
    case "cards":
      return CARDS.includes(move) && !earlier.includes(move);
    case "towers": {
      const t = parseTowers(move);
      return !!t && t.l + t.r <= energyFor(round);
    }
  }
}

export function scoreGame(game: Game, pairs: Pair[], aEl: Element, bEl: Element): GameScore {
  switch (game) {
    case "duel": {
      const s = duelScore(pairs as { a: DuelPlay; b: DuelPlay }[], aEl, bEl);
      return { ...s, rounds: s.rounds as GameRound[] };
    }
    case "penalty":
      return penalty(pairs);
    case "cards":
      return cards(pairs);
    case "towers":
      return towers(pairs);
  }
}

export { resolveRound };

// ---------------- Scrappy Bot ----------------
// The computer opponent picks its move when a round opens, from what it could legally know:
// its own earlier moves and the opponent's REVEALED earlier moves. Never the current move.
const pick = <T>(xs: readonly T[], rand: () => number) => xs[Math.floor(rand() * xs.length)];

export function botMove(game: Game, round: number, mine: Play[], theirs: Play[], rand: () => number = Math.random): string {
  const seen = theirs.filter(revealed);
  switch (game) {
    case "duel": {
      // half the time counter the move they play most, otherwise surprise them
      const counts = { attack: 0, guard: 0, trick: 0 } as Record<string, number>;
      for (const m of seen) if (m in counts) counts[m]++;
      const fav = Object.entries(counts).sort((x, y) => y[1] - x[1])[0];
      const counter: Record<string, string> = { attack: "guard", guard: "trick", trick: "attack" };
      return fav[1] > 0 && rand() < 0.5 ? counter[fav[0]] : pick(["attack", "guard", "trick"], rand);
    }
    case "penalty":
      return `${pick(DIRS, rand)}:${pick(DIRS, rand)}`;
    case "cards": {
      const left = CARDS.filter((c) => !mine.includes(c));
      return pick(left.length ? left : CARDS, rand);
    }
    case "towers": {
      // spend all energy, leaning on one lane so pushes actually break through
      const e = energyFor(round);
      const heavy = Math.ceil(e * (0.6 + rand() * 0.4));
      return rand() < 0.5 ? `${heavy},${e - heavy}` : `${e - heavy},${heavy}`;
    }
  }
}
