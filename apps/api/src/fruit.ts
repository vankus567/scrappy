// Fruit Slash: the fruit pattern for a round is derived from the battle id + round, so both players
// (and the server) get the exact same fruit and bombs. The phone sends its slice log; the server
// replays it against this pattern and computes the score. KEEP IN SYNC with the web app's copy
// (scrappy-classic/apps/web/src/lib/fruit.ts): same numbers, same order of random draws.

export const FRUIT_MS = 20_000; // one round of slicing
export const FRUIT_ROUNDS = 3; // best of 3
export const GRAVITY = 1.4; // screen heights per second^2
const SLACK_MS = 150; // network/frame tolerance on the visible window

export type Fruit = { id: number; t: number; kind: "fruit" | "gold" | "bomb"; x0: number; vx: number; vy: number; life: number; look: number };

/** 32-bit FNV-1a: a stable seed from text. */
function fnv(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** mulberry32: tiny deterministic PRNG. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Every fruit and bomb thrown in a round: when it appears, where, how fast, and how long it's on screen. */
export function fruitSchedule(battleId: string, round: number): Fruit[] {
  const rand = rng(fnv(`${battleId}:${round}`));
  const out: Fruit[] = [];
  let t = 600;
  let id = 0;
  while (t < FRUIT_MS - 1500) {
    const burst = rand() < 0.25 ? 2 : 1;
    for (let k = 0; k < burst; k++) {
      const r = rand();
      const kind = r < 0.14 ? "bomb" : r < 0.22 ? "gold" : "fruit";
      const vy = 1.25 + rand() * 0.35; // heights per second, upward
      out.push({
        id: id++,
        t: Math.round(t + k * 120),
        kind,
        x0: 0.15 + rand() * 0.7,
        vx: (rand() - 0.5) * 0.25,
        vy,
        life: Math.round(((2 * vy) / GRAVITY) * 1000),
        look: Math.floor(rand() * 5),
      });
    }
    t += 450 + rand() * 450;
  }
  return out;
}

export const POINTS = { fruit: 1, gold: 3, bomb: -3 } as const;

/** Slice log format: "id.cs,id.cs,..." (cs = centiseconds since the round started), or "-" for no slices. */
export function parseSlices(log: string): { id: number; ms: number }[] | null {
  if (log === "-") return [];
  if (log.length > 2000) return null;
  const out: { id: number; ms: number }[] = [];
  for (const part of log.split(",")) {
    const m = /^(\d{1,3})\.(\d{1,4})$/.exec(part);
    if (!m) return null;
    out.push({ id: Number(m[1]), ms: Number(m[2]) * 10 });
  }
  return out;
}

/**
 * Score a slice log against the round's pattern. Returns null when the log is impossible:
 * unknown fruit, the same fruit twice, slices out of order, or slicing a fruit when it wasn't on screen.
 */
export function scoreSlices(schedule: Fruit[], log: string): number | null {
  const slices = parseSlices(log);
  if (!slices) return null;
  const byId = new Map(schedule.map((f) => [f.id, f]));
  const seen = new Set<number>();
  let last = -1;
  let points = 0;
  for (const s of slices) {
    const f = byId.get(s.id);
    if (!f || seen.has(s.id) || s.ms < last) return null;
    if (s.ms < f.t - SLACK_MS || s.ms > f.t + f.life + SLACK_MS || s.ms > FRUIT_MS + SLACK_MS) return null;
    seen.add(s.id);
    last = s.ms;
    points += POINTS[f.kind];
  }
  return Math.max(0, points);
}

/** Scrappy Bot's round: slices most fruit at a natural moment, sometimes clips a bomb. */
export function botSlices(schedule: Fruit[], rand: () => number = Math.random): string {
  const picks = schedule
    .filter((f) => (f.kind === "bomb" ? rand() < 0.06 : rand() < 0.72))
    .map((f) => ({ id: f.id, ms: Math.min(FRUIT_MS, f.t + Math.round(f.life * (0.3 + rand() * 0.4))) }))
    .sort((x, y) => x.ms - y.ms);
  return picks.length ? picks.map((p) => `${p.id}.${Math.floor(p.ms / 10)}`).join(",") : "-";
}
