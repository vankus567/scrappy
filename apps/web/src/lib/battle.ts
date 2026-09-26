// Phone side of commit-reveal: the move is hashed with a random salt and only the hash is sent.
// The move + salt are kept on this phone until both players have locked in, then revealed.
import type { Element, Game, Move } from "./api";

/** Same function as the API (apps/api/src/battle.ts): hex sha256 of "move:salt". */
export async function commitHash(move: string, salt: string) {
  const data = new TextEncoder().encode(`${move}:${salt}`) as Uint8Array<ArrayBuffer>;
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  return [...bytes].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export const newSalt = () => [...crypto.getRandomValues(new Uint8Array(16))].map((x) => x.toString(16).padStart(2, "0")).join("");

const key = (battleId: string, round: number) => `scrappy.battle.${battleId}.${round}`;

export function saveLocked(battleId: string, round: number, move: string, salt: string) {
  try {
    localStorage.setItem(key(battleId, round), JSON.stringify({ move, salt }));
    return true;
  } catch {
    return false;
  }
}

export function loadLocked(battleId: string, round: number): { move: string; salt: string } | null {
  try {
    const raw = localStorage.getItem(key(battleId, round));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export const MOVE_INFO: Record<Move, { label: string; beats: string }> = {
  attack: { label: "Attack", beats: "beats Trick" },
  guard: { label: "Guard", beats: "beats Attack" },
  trick: { label: "Trick", beats: "beats Guard" },
};

export const GAME_INFO: Record<Game, { name: string; blurb: string; how: string }> = {
  duel: { name: "Pet Duel", blurb: "Attack, guard or trick", how: "Attack beats Trick, Trick beats Guard, Guard beats Attack. Same move: your pet's element decides. First to 3." },
  penalty: { name: "Penalty Shootout", blurb: "Shoot and dive", how: "Each round pick where you shoot and where your keeper dives. A shot scores unless their keeper guesses it. Most goals in 5 wins." },
  cards: { name: "Card Clash", blurb: "Play 1 to 5, each once", how: "Play one card a round, each card once. Higher card wins, but a 1 upsets a 5. First to 3." },
  towers: { name: "Tower Rush", blurb: "Push lanes, topple the king", how: "Split your energy between the left and right lanes. The bigger push hits their tower; past a fallen tower it hits the king. King down wins." },
  squad: { name: "Squad Deathmatch", blurb: "Move, aim, wipe their squad", how: "Move your squad of 4 and aim at a zone. Aim where they went and one of theirs is out. The zone closes: you can't hold the same spot twice. Wipe all 4 to win." },
  fruit: { name: "Fruit Slash", blurb: "20s swipe duel, same fruit", how: "20 seconds of slicing. You both get the same fruit. Golden fruit is worth 3, bombs cost 3. Higher score takes the round, best of 3." },
};

export const TOWER_HP = 6;
export const KING_HP = 8;
export const energyFor = (round: number) => 2 + round;

export const ELEMENT_INFO: Record<Element, { label: string; beats: string }> = {
  blaze: { label: "Blaze", beats: "burns Spirit" },
  tide: { label: "Tide", beats: "puts out Blaze" },
  spirit: { label: "Spirit", beats: "haunts Tide" },
};
