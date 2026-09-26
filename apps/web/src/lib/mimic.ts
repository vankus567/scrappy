// Mimic: everyone hears the same clip and copies it into the mic. The phone sends its pitch line;
// the server scores it against the clip's pitch line (0-100, any key or octave). A clip is either a
// Scrappy Tune (a melody generated from a seed, so it never runs out) or a sound a player uploaded.
// KEEP IN SYNC with the API copy (SOlana india/apps/api/src/mimic.ts).

export const MIMIC_ROUNDS = 3; // three clips per battle
export const FRAME_MS = 50; // one pitch sample every 50 ms
export const RECORD_MS = 4_000; // how long the phone listens
export const MAX_FRAMES = RECORD_MS / FRAME_MS;

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
export function parseContour(text: string): (number | null)[] | null {
  if (text.length > 2000) return null;
  const parts = text.split(",");
  if (parts.length < 4 || parts.length > MAX_FRAMES) return null;
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
  const length = ratio < 1 ? 0.55 + 0.45 * ratio : ratio > 1.7 ? Math.max(0.6, 1 - (ratio - 1.7) * 0.4) : 1;
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

/** An uploaded clip's pitch line (from the uploader's phone): voiced frames only, semitones. */
export function framesFromContour(text: string): number[] | null {
  const frames = parseContour(text);
  if (!frames) return null;
  const voiced = frames.filter((f): f is number => f !== null);
  return voiced.length >= 6 ? voiced : null;
}
