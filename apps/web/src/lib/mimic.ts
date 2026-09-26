// Mimic: everyone hears the same clip and copies it into the mic. The phone sends its pitch line;
// the server scores it against the clip's pitch line (0-100, any key or octave). A clip is either a
// Scrappy Tune (a melody generated from a seed, so it never runs out) or a sound a player uploaded.
// KEEP IN SYNC with the API copy (SOlana india/apps/api/src/mimic.ts).

export const MIMIC_ROUNDS = 3; // three clips per battle
export const FRAME_MS = 50; // one pitch sample every 50 ms
export const RECORD_MS = 4_000; // how long the phone listens
export const MAX_FRAMES = RECORD_MS / FRAME_MS;
export const CLIP_MAX_FRAMES = 12_000 / FRAME_MS; // uploaded sounds can run up to 12 s

export type Note = { semi: number; ms: number }; // semitones relative to the melody's root

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

// singable steps: mostly small intervals, the odd leap
const STEPS = [-2, -2, -1, 1, 2, 2, 3, 4, -3, 5, -4, 7];

/** A Scrappy Tune: 4 to 6 notes, within about an octave, 2 to 3 seconds long. Same seed, same tune. */
export function melody(seed: string): Note[] {
  const rand = rng(fnv(`tune:${seed}`));
  const count = 4 + Math.floor(rand() * 3);
  const notes: Note[] = [];
  let semi = 0;
  for (let i = 0; i < count; i++) {
    if (i > 0) {
      let step = STEPS[Math.floor(rand() * STEPS.length)];
      if (semi + step > 9 || semi + step < -3) step = -step;
      semi += step;
    }
    notes.push({ semi, ms: 320 + Math.round(rand() * 5) * 60 });
  }
  return notes;
}

/** The melody as a pitch line: one semitone value per 50 ms frame. */
export function melodyFrames(notes: Note[]): number[] {
  const out: number[] = [];
  for (const n of notes) for (let t = 0; t < n.ms; t += FRAME_MS) out.push(n.semi);
  return out;
}

/**
 * Pitch line format: comma-separated frames, each a quarter-semitone integer (semitones x 4,
 * relative to A4) or "x" for silence. Returns null when it isn't a plausible recording.
 */
export function parseContour(text: string, maxFrames = MAX_FRAMES): (number | null)[] | null {
  if (text.length > 2000) return null;
  const parts = text.split(",");
  if (parts.length < 4 || parts.length > maxFrames) return null;
  const out: (number | null)[] = [];
  for (const p of parts) {
    if (p === "x") {
      out.push(null);
      continue;
    }
    if (!/^-?\d{1,3}$/.test(p)) return null;
    const q = Number(p) / 4;
    if (q < -48 || q > 36) return null; // A0..A7: outside any voice or whistle
    out.push(q);
  }
  return out;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * 0-100: how well a pitch line matches the melody. Key and octave don't matter (the line is shifted to
 * the melody's key first); the shape does. Time is matched with dynamic time warping, so singing a
 * little early or late is fine; missing whole notes, or too little sound, costs points.
 */
export function scoreContour(target: number[], text: string): number | null {
  const frames = parseContour(text);
  if (!frames || !target.length) return null;
  const voiced = frames.filter((f): f is number => f !== null);
  if (voiced.length < 6) return 0;
  const shift = median(voiced) - median(target);
  const sung = voiced.map((v) => v - shift);

  // DTW between the melody and the sung line, cost = pitch error in semitones (capped)
  const n = target.length;
  const m = sung.length;
  const INF = 1e9;
  let prev = new Float64Array(m + 1).fill(INF);
  let prevLen = new Float64Array(m + 1).fill(0);
  prev[0] = 0;
  for (let i = 1; i <= n; i++) {
    const cur = new Float64Array(m + 1).fill(INF);
    const curLen = new Float64Array(m + 1).fill(0);
    for (let j = 1; j <= m; j++) {
      const c = Math.min(Math.abs(target[i - 1] - sung[j - 1]), 6);
      let best = prev[j - 1];
      let len = prevLen[j - 1];
      if (prev[j] < best) [best, len] = [prev[j], prevLen[j]];
      if (cur[j - 1] < best) [best, len] = [cur[j - 1], curLen[j - 1]];
      cur[j] = best + c;
      curLen[j] = len + 1;
    }
    prev = cur;
    prevLen = curLen;
  }
  const avgErr = prev[m] / Math.max(1, prevLen[m]);
  const pitch = Math.max(0, 100 - avgErr * 36);
  // sang for roughly as long as the melody lasts
  const ratio = voiced.length / n;
  // rhythm: much longer or shorter than the sound loses points (a slow moo is not a quick meow)
  const length = Math.min(1, Math.max(0.35, 1 - Math.max(0, Math.abs(Math.log2(ratio)) - 0.15) * 0.75));
  return Math.round(pitch * length);
}

/** Scrappy Bot sings it back: a random key, slightly off-pitch, a little early or late. */
export function botContour(target: number[], rand: () => number = Math.random): string {
  const key = -12 + Math.round(rand() * 14); // somewhere around a comfortable voice
  const skill = 0.35 + rand() * 0.6; // semitones of wobble
  const lead = Math.floor(rand() * 4);
  const out: string[] = Array.from({ length: lead }, () => "x");
  for (const t of target) {
    if (rand() < 0.05) {
      out.push("x");
      continue;
    }
    const wobble = (rand() + rand() + rand() - 1.5) * skill * 1.6;
    out.push(String(Math.round((t + key + wobble) * 4)));
  }
  return out.slice(0, MAX_FRAMES).join(",");
}

// ---------------- animal calls ----------------
// Built-in, synthesized by the app (no recordings): each call is a few pitch glides.
export type Glide = { from: number; to: number; ms: number; wobble?: number } | { gap: number };
export type Animal = { key: string; name: string; call: string; wave: "sine" | "triangle" | "sawtooth" | "square"; root: number; glides: Glide[] };

export const ANIMALS: Animal[] = [
  { key: "cat", name: "Cat", call: "Meow", wave: "sawtooth", root: 660, glides: [{ from: 0, to: 5, ms: 250 }, { from: 5, to: -3, ms: 500 }] },
  { key: "dog", name: "Dog", call: "Woof woof", wave: "square", root: 300, glides: [{ from: 3, to: -4, ms: 200 }, { gap: 160 }, { from: 3, to: -4, ms: 220 }] },
  { key: "cow", name: "Cow", call: "Moo", wave: "sawtooth", root: 160, glides: [{ from: 0, to: 2, ms: 300 }, { from: 2, to: -4, ms: 900 }] },
  { key: "owl", name: "Owl", call: "Hoo hoo", wave: "sine", root: 420, glides: [{ from: 0, to: 0, ms: 320 }, { gap: 140 }, { from: -3, to: -4, ms: 560 }] },
  { key: "rooster", name: "Rooster", call: "Cock-a-doodle-doo", wave: "sawtooth", root: 520, glides: [{ from: 0, to: 4, ms: 180 }, { from: 4, to: 4, ms: 150 }, { from: 5, to: 7, ms: 260 }, { from: 7, to: 0, ms: 600 }] },
  { key: "wolf", name: "Wolf", call: "Awoooo", wave: "triangle", root: 300, glides: [{ from: -5, to: 7, ms: 700 }, { from: 7, to: 7, ms: 500, wobble: 0.4 }, { from: 7, to: -1, ms: 700 }] },
  { key: "duck", name: "Duck", call: "Quack quack", wave: "square", root: 480, glides: [{ from: 3, to: 0, ms: 220 }, { gap: 110 }, { from: 3, to: 0, ms: 240 }] },
  { key: "sheep", name: "Sheep", call: "Baa", wave: "sawtooth", root: 400, glides: [{ from: 2, to: 1, ms: 800, wobble: 0.6 }] },
  { key: "bird", name: "Bird", call: "Tweet tweet", wave: "sine", root: 1400, glides: [{ from: 0, to: 4, ms: 130 }, { from: 4, to: 0, ms: 130 }, { gap: 90 }, { from: 0, to: 4, ms: 130 }, { from: 4, to: 0, ms: 130 }] },
  { key: "lion", name: "Lion", call: "Roar", wave: "sawtooth", root: 140, glides: [{ from: 0, to: 3, ms: 350 }, { from: 3, to: -5, ms: 800, wobble: 0.3 }] },
];
export const animalByKey = (key: string) => ANIMALS.find((a) => a.key === key) ?? null;

/** An animal call as a pitch line (semitones relative to its root, voiced frames only). */
export function animalFrames(a: Animal): number[] {
  const out: number[] = [];
  for (const g of a.glides) {
    if ("gap" in g) continue;
    const steps = Math.max(1, Math.round(g.ms / FRAME_MS));
    for (let i = 0; i < steps; i++) out.push(g.from + ((g.to - g.from) * i) / Math.max(1, steps - 1) + (g.wobble ? (i % 2 ? g.wobble : -g.wobble) : 0));
  }
  return out;
}
export const animalMs = (a: Animal) => a.glides.reduce((s, g) => s + ("gap" in g ? g.gap : g.ms), 0);

/** An uploaded clip's pitch line (from the uploader's phone): voiced frames only, semitones. */
export function framesFromContour(text: string): number[] | null {
  const frames = parseContour(text, CLIP_MAX_FRAMES);
  if (!frames) return null;
  const voiced = frames.filter((f): f is number => f !== null);
  return voiced.length >= 6 ? voiced : null;
}
