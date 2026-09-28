import {
  EFFECT_FADEOUT, EFFECT_HALF_FADEOUT, EFFECT_QUARTER_FADEOUT, EFFECT_SLIDE, EFFECT_VIBRATO,
  NUM_CHANNELS, SOUND_TICKS_PER_SEC, TONE_NOISE, TONE_PULSE, TONE_SQUARE, TONE_TRIANGLE,
} from "./consts";
import type { Sound } from "./sound";

const CHANNEL_GAIN = 0.12;
const VIBRATO_HZ = 6;
const VIBRATO_DEPTH = 0.015; // fraction of the frequency

/** Note 33 (a2) = 440 Hz, same tuning as Pyxel. */
export function noteFreq(note: number): number {
  return 440 * Math.pow(2, (note - 33) / 12);
}

/** Playback state for one channel. Pure data plus a sample generator; no Web Audio here, so it tests in Bun. */
export class Channel {
  private queue: Sound[] = [];
  private queueIds: number[] = [];
  private loop = false;
  private soundIdx = 0;
  private noteIdx = 0;
  private samplesIntoNote = 0;
  private phase = 0;
  private lfsr = 0x7fff;
  private noiseOut = 0;
  private prevFreq = 0;
  playing = false;

  play(sounds: Sound[], ids: number[], loop: boolean): void {
    this.queue = sounds;
    this.queueIds = ids;
    this.loop = loop;
    this.soundIdx = 0;
    this.noteIdx = 0;
    this.samplesIntoNote = 0;
    this.playing = sounds.length > 0;
  }

  stop(): void {
    this.playing = false;
  }

  /** [sound id, note index] currently playing, or null. */
  position(): [number, number] | null {
    return this.playing ? [this.queueIds[this.soundIdx] ?? 0, this.noteIdx] : null;
  }

  /** Advance to the next note; returns false when the channel has finished. */
  private advance(): boolean {
    this.noteIdx++;
    this.samplesIntoNote = 0;
    while (true) {
      const snd = this.queue[this.soundIdx];
      if (snd && this.noteIdx < snd.notes.length) return true;
      this.noteIdx = 0;
      this.soundIdx++;
      if (this.soundIdx >= this.queue.length) {
        if (!this.loop) { this.playing = false; return false; }
        this.soundIdx = 0;
        // Guard: a looping queue of empty sounds would spin forever.
        if (this.queue.every((s) => s.notes.length === 0)) { this.playing = false; return false; }
      }
    }
  }

  /** Add this channel's output into `out` (mono) at `rate` Hz. */
  mix(out: Float32Array, rate: number): void {
    for (let i = 0; i < out.length; i++) {
      if (!this.playing) return;
      let snd = this.queue[this.soundIdx];
      if (!snd || snd.notes.length === 0) {
        if (!this.advance()) return;
        snd = this.queue[this.soundIdx]!;
      }
      const noteLen = Math.max(1, Math.round((snd.speed / SOUND_TICKS_PER_SEC) * rate));
      const note = snd.notes[this.noteIdx]!;
      const t = this.samplesIntoNote / noteLen; // 0..1 through the note

      if (note >= 0) {
        const effect = snd.effectAt(this.noteIdx);
        let freq = noteFreq(note);
        if (effect === EFFECT_SLIDE && this.prevFreq > 0) freq = this.prevFreq + (freq - this.prevFreq) * t;
        if (effect === EFFECT_VIBRATO) {
          const secs = this.samplesIntoNote / rate;
          freq *= 1 + VIBRATO_DEPTH * Math.sin(2 * Math.PI * VIBRATO_HZ * secs);
        }
        let vol = snd.volumeAt(this.noteIdx) / 7;
        if (effect === EFFECT_FADEOUT) vol *= 1 - t;
        else if (effect === EFFECT_HALF_FADEOUT) vol *= t < 0.5 ? 1 : 1 - (t - 0.5) * 2;
        else if (effect === EFFECT_QUARTER_FADEOUT) vol *= t < 0.75 ? 1 : 1 - (t - 0.75) * 4;

        const prevPhase = this.phase;
        this.phase = (this.phase + freq / rate) % 1;
        const tone = snd.toneAt(this.noteIdx);
        let s: number;
        if (tone === TONE_TRIANGLE) s = 1 - 4 * Math.abs(this.phase - 0.5);
        else if (tone === TONE_SQUARE) s = this.phase < 0.5 ? 1 : -1;
        else if (tone === TONE_PULSE) s = this.phase < 0.25 ? 1 : -1;
        else if (tone === TONE_NOISE) {
          // Step a 15-bit LFSR once per oscillator cycle, NES style.
          if (this.phase < prevPhase) {
            const bit = (this.lfsr ^ (this.lfsr >> 1)) & 1;
            this.lfsr = (this.lfsr >> 1) | (bit << 14);
            this.noiseOut = this.lfsr & 1 ? 1 : -1;
          }
          s = this.noiseOut;
        } else s = 0;

        // 2 ms attack/release ramps stop clicks at note edges.
        const edge = Math.min(1, this.samplesIntoNote / (rate * 0.002), (noteLen - this.samplesIntoNote) / (rate * 0.002));
        out[i]! += s * vol * edge * CHANNEL_GAIN;
      }

      this.samplesIntoNote++;
      if (this.samplesIntoNote >= noteLen) {
        if (note >= 0) this.prevFreq = noteFreq(note);
        this.advance();
      }
    }
  }
}

export class Mixer {
  readonly channels: Channel[] = Array.from({ length: NUM_CHANNELS }, () => new Channel());

  render(out: Float32Array, rate: number): void {
    out.fill(0);
    for (const ch of this.channels) ch.mix(out, rate);
  }
}
