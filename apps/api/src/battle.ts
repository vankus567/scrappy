// Scrappy Battles rules engine. Pure functions, no I/O: the API, the tests and (later) the Solana
// program all follow these exact rules.
//
// A battle is up to 5 rounds. Each round both players secretly pick attack / guard / trick.
//   attack beats trick, trick beats guard, guard beats attack.
// Same move: the pet whose element counters the other's wins the round; same element is a tie.
// First to 3 round wins takes the battle. After 5 rounds, more round wins takes it; equal is a draw.

export const MOVES = ["attack", "guard", "trick"] as const;
export type Move = (typeof MOVES)[number];

export const ROUNDS = 5;
export const WINS_NEEDED = 3;

export const ELEMENTS = ["blaze", "tide", "spirit"] as const;
export type Element = (typeof ELEMENTS)[number];

/** Every Scrappy species belongs to one element (4 each). */
export const SPECIES_ELEMENT: Record<string, Element> = {
  ember: "blaze", drako: "blaze", zap: "blaze", bun: "blaze",
  kumo: "tide", goo: "tide", pip: "tide", pengu: "tide",
  boo: "spirit", kitsu: "spirit", neko: "spirit", mochi: "spirit",
};

export const elementOf = (species: string | null | undefined): Element => SPECIES_ELEMENT[species ?? ""] ?? "spirit";

/** tide puts out blaze, blaze burns spirit, spirit haunts tide. */
const COUNTERS: Record<Element, Element> = { tide: "blaze", blaze: "spirit", spirit: "tide" };
const BEATS: Record<Move, Move> = { attack: "trick", trick: "guard", guard: "attack" };

export const isMove = (m: unknown): m is Move => typeof m === "string" && (MOVES as readonly string[]).includes(m);

export type Side = "a" | "b";
/** A played move, "locked" (locked in but never revealed before time ran out), or null (never showed up). */
export type Play = Move | "locked" | null;
export type RoundResult = {
  round: number;
  a: Play;
  b: Play;
  winner: Side | null; // null = tie
  by: "move" | "element" | "timeout" | "tie";
};

/**
 * Who wins one round.
 * - Showing up beats not showing up: a locked-in or revealed move beats nothing.
 * - Refusing to reveal loses: a revealed move beats one that stayed locked (you can't hide a bad move).
 * - Neither showed up, or both stayed locked: tie.
 */
export function resolveRound(round: number, a: Play, b: Play, aEl: Element, bEl: Element): RoundResult {
  if ((!a && !b) || (a === "locked" && b === "locked")) return { round, a, b, winner: null, by: "tie" };
  if (!a) return { round, a, b, winner: "b", by: "timeout" };
  if (!b) return { round, a, b, winner: "a", by: "timeout" };
  if (a === "locked") return { round, a, b, winner: "b", by: "timeout" };
  if (b === "locked") return { round, a, b, winner: "a", by: "timeout" };
  if (BEATS[a] === b) return { round, a, b, winner: "a", by: "move" };
  if (BEATS[b] === a) return { round, a, b, winner: "b", by: "move" };
  if (COUNTERS[aEl] === bEl) return { round, a, b, winner: "a", by: "element" };
  if (COUNTERS[bEl] === aEl) return { round, a, b, winner: "b", by: "element" };
  return { round, a, b, winner: null, by: "tie" };
}

export type BattleScore = { a: number; b: number; rounds: RoundResult[]; done: boolean; winner: Side | "draw" | null };

/** Score a battle from the rounds resolved so far. Stops counting once someone has 3 wins. */
export function score(moves: { a: Play; b: Play }[], aEl: Element, bEl: Element): BattleScore {
  const rounds: RoundResult[] = [];
  let a = 0;
  let b = 0;
  for (const [i, m] of moves.entries()) {
    if (i >= ROUNDS || a >= WINS_NEEDED || b >= WINS_NEEDED) break;
    const r = resolveRound(i + 1, m.a, m.b, aEl, bEl);
    rounds.push(r);
    if (r.winner === "a") a++;
    if (r.winner === "b") b++;
  }
  const decided = a >= WINS_NEEDED || b >= WINS_NEEDED;
  const done = decided || rounds.length >= ROUNDS;
  const winner = !done ? null : a > b ? "a" : b > a ? "b" : "draw";
  return { a, b, rounds, done, winner };
}

// ---- commit-reveal: a move is locked in as sha256(move:salt) before either side reveals ----

/** Hex sha256 of "move:salt". The same function runs on the phone, the server and (later) on-chain. */
export async function commitHash(move: string, salt: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${move}:${salt}`)));
  return [...bytes].map((x) => x.toString(16).padStart(2, "0")).join("");
}

/** A reveal is valid only if it matches the hash committed earlier. */
export async function verifyReveal(hash: string, move: unknown, salt: unknown) {
  if (typeof move !== "string" || move.length < 1 || move.length > 32 || typeof salt !== "string" || salt.length < 16 || salt.length > 128) return false;
  return (await commitHash(move, salt)) === hash.toLowerCase();
}
