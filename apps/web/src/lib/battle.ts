// Phone side of commit-reveal: the move is hashed with a random salt and only the hash is sent.
// The move + salt are kept on this phone until both players have locked in, then revealed.
import type { Element, Move } from "./api";

/** Same function as the API (apps/api/src/battle.ts): hex sha256 of "move:salt". */
export async function commitHash(move: Move, salt: string) {
  const data = new TextEncoder().encode(`${move}:${salt}`) as Uint8Array<ArrayBuffer>;
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  return [...bytes].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export const newSalt = () => [...crypto.getRandomValues(new Uint8Array(16))].map((x) => x.toString(16).padStart(2, "0")).join("");

const key = (battleId: string, round: number) => `scrappy.battle.${battleId}.${round}`;

export function saveLocked(battleId: string, round: number, move: Move, salt: string) {
  try {
    localStorage.setItem(key(battleId, round), JSON.stringify({ move, salt }));
    return true;
  } catch {
    return false;
  }
}

export function loadLocked(battleId: string, round: number): { move: Move; salt: string } | null {
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

export const ELEMENT_INFO: Record<Element, { label: string; beats: string }> = {
  blaze: { label: "Blaze", beats: "burns Spirit" },
  tide: { label: "Tide", beats: "puts out Blaze" },
  spirit: { label: "Spirit", beats: "haunts Tide" },
};
