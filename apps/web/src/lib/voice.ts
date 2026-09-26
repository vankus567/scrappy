// Phone-side audio for Mimic: play a clip, listen to the mic, and turn your voice into a pitch line
// (one value every 50 ms). Plain signal processing (autocorrelation), nothing leaves the phone but
// the pitch line itself.
import { FRAME_MS, type Note, RECORD_MS } from "./mimic";

let shared: AudioContext | null = null;
export const audioCtx = () => {
  if (!shared) shared = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  if (shared.state === "suspended") void shared.resume();
  return shared;
};

/** Play a Scrappy Tune with a soft, cute synth voice. Resolves when it finishes. */
export function playTune(notes: Note[]): Promise<void> {
  const ctx = audioCtx();
  let t = ctx.currentTime + 0.05;
  const root = 523.25; // C5
  for (const n of notes) {
    const f = root * 2 ** (n.semi / 12);
    const osc = ctx.createOscillator();
    const vib = ctx.createOscillator();
    const vibGain = ctx.createGain();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = f;
    vib.frequency.value = 5.5;
    vibGain.gain.value = f * 0.012;
    vib.connect(vibGain).connect(osc.frequency);
    const d = n.ms / 1000;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.28, t + 0.03);
    gain.gain.setValueAtTime(0.28, t + d * 0.75);
    gain.gain.linearRampToValueAtTime(0, t + d * 0.97);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    vib.start(t);
    osc.stop(t + d);
    vib.stop(t + d);
    t += d;
  }
  return new Promise((res) => window.setTimeout(res, (t - ctx.currentTime) * 1000 + 50));
}

/** Play an uploaded clip. Resolves when it ends. */
export function playUrl(url: string): Promise<void> {
  return new Promise((res, rej) => {
    const a = new Audio(url);
    a.onended = () => res();
    a.onerror = () => rej(new Error("Couldn't play this clip."));
    a.play().catch(rej);
  });
}

/** Autocorrelation pitch detection. Returns Hz, or null for silence / noise. */
export function detectPitch(buf: Float32Array, sampleRate: number): number | null {
  let rms = 0;
  for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / buf.length);
  if (rms < 0.012) return null;
  const minLag = Math.floor(sampleRate / 1100);
  const maxLag = Math.floor(sampleRate / 70);
  let best = -1;
  let bestCorr = 0;
  const corr = new Float32Array(maxLag + 2);
  for (let lag = minLag; lag <= maxLag + 1; lag++) {
    let c = 0;
    for (let i = 0; i + lag < buf.length; i++) c += buf[i] * buf[i + lag];
    corr[lag] = c;
    if (lag <= maxLag && c > bestCorr) {
      bestCorr = c;
      best = lag;
    }
  }
  let energy = 0;
  for (let i = 0; i < buf.length; i++) energy += buf[i] * buf[i];
  if (best < 0 || bestCorr / energy < 0.3) return null; // not periodic enough to be a voice
  // parabolic interpolation around the peak for a finer estimate
  const a = corr[best - 1] ?? 0;
  const b = corr[best];
  const c = corr[best + 1] ?? 0;
  const shift = (a - c) / (2 * (a - 2 * b + c) || 1);
  return sampleRate / (best + (Number.isFinite(shift) ? shift : 0));
}

const toQuarterSemis = (hz: number) => Math.round(12 * Math.log2(hz / 440) * 4);

export type Recording = { contour: string; frames: (number | null)[]; blob: Blob | null; durationMs: number };

/**
 * Listen to the mic for `ms`, sampling pitch every 50 ms. Calls onFrame live so the pitch line draws as
 * you sing. With keepAudio, also records the sound itself (for uploading a clip).
 */
export async function record(onFrame: (frames: (number | null)[]) => void, opts: { ms?: number; keepAudio?: boolean } = {}): Promise<Recording> {
  const ms = opts.ms ?? RECORD_MS;
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
  } catch {
    throw new Error("Microphone is blocked. Allow the mic for Scrappy in your browser settings.");
  }
  const ctx = audioCtx();
  const src = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  src.connect(analyser);
  const buf = new Float32Array(analyser.fftSize);
  const frames: (number | null)[] = [];
  let rec: MediaRecorder | null = null;
  const chunks: Blob[] = [];
  if (opts.keepAudio && "MediaRecorder" in window) {
    rec = new MediaRecorder(stream);
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.start();
  }
  const started = performance.now();
  await new Promise<void>((done) => {
    const t = window.setInterval(() => {
      analyser.getFloatTimeDomainData(buf);
      const hz = detectPitch(buf, ctx.sampleRate);
      frames.push(hz ? toQuarterSemis(hz) / 4 : null);
      onFrame([...frames]);
      if (performance.now() - started >= ms || frames.length >= ms / FRAME_MS) {
        window.clearInterval(t);
        done();
      }
    }, FRAME_MS);
  });
  const blob = await new Promise<Blob | null>((res) => {
    if (!rec) return res(null);
    rec.onstop = () => res(new Blob(chunks, { type: rec!.mimeType || "audio/webm" }));
    rec.stop();
  });
  src.disconnect();
  stream.getTracks().forEach((tr) => tr.stop());
  // trim leading/trailing silence, keep the middle as sung
  let a = 0;
  let z = frames.length - 1;
  while (a < frames.length && frames[a] === null) a++;
  while (z > a && frames[z] === null) z--;
  const kept = a <= z ? frames.slice(Math.max(0, a - 1), z + 2) : frames.slice(0, 4);
  const contour = kept.map((f) => (f === null ? "x" : String(Math.round(f * 4)))).join(",");
  return { contour, frames: kept, blob, durationMs: performance.now() - started };
}

export const blobToBase64 = (b: Blob) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(new Error("Couldn't read the recording."));
    r.readAsDataURL(b);
  });
