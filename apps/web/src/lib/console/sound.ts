import { NUM_CHANNELS } from "./consts";

const NOTE_NAMES: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
const TONE_CODES: Record<string, number> = { t: 0, s: 1, p: 2, n: 3 };
const EFFECT_CODES: Record<string, number> = { n: 0, s: 1, v: 2, f: 3, h: 4, q: 5 };

/** Parse Pyxel note syntax: "c3 e3 g3 r a#2 b-2". Rest = -1. Spaces are ignored. */
export function parseNotes(src: string): number[] {
  const s = src.replace(/\s+/g, "").toLowerCase();
  const out: number[] = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i]!;
    if (ch === "r") {
      out.push(-1);
      i++;
      continue;
    }
    const base = NOTE_NAMES[ch];
    if (base === undefined) throw new Error(`bad note '${ch}' at ${i} in "${src}"`);
    i++;
    let note = base;
    if (s[i] === "#") { note++; i++; }
    else if (s[i] === "-") { note--; i++; }
    const oct = Number(s[i]);
    if (!Number.isInteger(oct) || oct < 0 || oct > 4) throw new Error(`bad octave at ${i} in "${src}"`);
    i++;
    out.push(Math.max(0, Math.min(59, oct * 12 + note)));
  }
  return out;
}

function parseCodes(src: string, table: Record<string, number>, what: string): number[] {
  return [...src.replace(/\s+/g, "").toLowerCase()].map((c) => {
    const v = table[c];
    if (v === undefined) throw new Error(`bad ${what} '${c}' in "${src}"`);
    return v;
  });
}

function parseVolumes(src: string): number[] {
  return [...src.replace(/\s+/g, "")].map((c) => {
    const v = Number(c);
    if (!Number.isInteger(v) || v < 0 || v > 7) throw new Error(`bad volume '${c}' in "${src}"`);
    return v;
  });
}

/**
 * One sound effect or melody line. tones/volumes/effects shorter than notes repeat their last value,
 * so set("c3e3g3", "p", "6", "n", 20) is valid.
 */
export class Sound {
  notes: number[] = [];
  tones: number[] = [0];
  volumes: number[] = [7];
  effects: number[] = [0];
  speed = 30;
  /** The strings this sound was set from, kept so a cartridge can save and re-edit it. */
  source = { notes: "", tones: "", volumes: "", effects: "" };

  set(notes: string, tones: string, volumes: string, effects: string, speed: number): this {
    this.source = { notes, tones, volumes, effects };
    this.notes = parseNotes(notes);
    this.tones = tones ? parseCodes(tones, TONE_CODES, "tone") : [0];
    this.volumes = volumes ? parseVolumes(volumes) : [7];
    this.effects = effects ? parseCodes(effects, EFFECT_CODES, "effect") : [0];
    this.speed = Math.max(1, Math.floor(speed));
    return this;
  }

  toneAt(i: number): number { return this.tones[Math.min(i, this.tones.length - 1)] ?? 0; }
  volumeAt(i: number): number { return this.volumes[Math.min(i, this.volumes.length - 1)] ?? 7; }
  effectAt(i: number): number { return this.effects[Math.min(i, this.effects.length - 1)] ?? 0; }
}

/** Four parallel lists of sound indices, one per channel. */
export class Music {
  seqs: number[][] = Array.from({ length: NUM_CHANNELS }, () => []);

  set(...seqs: number[][]): this {
    this.seqs = Array.from({ length: NUM_CHANNELS }, (_, i) => [...(seqs[i] ?? [])]);
    return this;
  }
}
