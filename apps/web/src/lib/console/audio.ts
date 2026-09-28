import { Mixer } from "./synth";

const BUFFER = 1024; // ~21 ms at 48 kHz

/**
 * Web Audio output for the Mixer. Browsers only allow audio after a user gesture,
 * so the context is created lazily by unlock(), which the console calls on the first key or tap.
 * ScriptProcessorNode is deprecated but is the one path that works on every browser a Seeker ships,
 * with no worklet file to host. Swap for an AudioWorklet when that matters.
 */
export class AudioOut {
  readonly mixer = new Mixer();
  private ctx: AudioContext | null = null;
  muted = false;

  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    const node = ctx.createScriptProcessor(BUFFER, 0, 1);
    node.onaudioprocess = (e) => {
      const out = e.outputBuffer.getChannelData(0);
      this.mixer.render(out, ctx.sampleRate);
      if (this.muted) out.fill(0);
    };
    node.connect(ctx.destination);
    this.ctx = ctx;
  }

  close(): void {
    void this.ctx?.close();
    this.ctx = null;
  }
}
