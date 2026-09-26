"use client";

import { useState } from "react";
import { Microphone, Play } from "@phosphor-icons/react";
import { API_URL, type ClipView } from "@/lib/api";
import { scoreContour } from "@/lib/mimic";
import { playAnimal, playTune, playUrl, record } from "@/lib/voice";

/** The clip's pitch line (grey) and yours (blue), lined up in the same key so the shapes compare. */
export function PitchLine({ target, sung }: { target: number[]; sung: (number | null)[] }) {
  const W = 320;
  const H = 110;
  const voiced = sung.filter((s): s is number => s !== null);
  const med = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    return s.length ? s[s.length >> 1] : 0;
  };
  const shift = voiced.length ? med(voiced) - med(target) : 0;
  const all = [...target, ...voiced.map((v) => v - shift)];
  const lo = Math.min(...all, -1) - 1;
  const hi = Math.max(...all, 1) + 1;
  const y = (v: number) => H - 8 - ((v - lo) / (hi - lo)) * (H - 16);
  const n = Math.max(target.length, sung.length, 1);
  const x = (i: number) => 8 + (i / Math.max(1, n - 1)) * (W - 16);
  const path = (vals: (number | null)[], off = 0) => {
    let d = "";
    let pen = false;
    vals.forEach((v, i) => {
      if (v === null) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)} ${y(v - off).toFixed(1)} `;
      pen = true;
    });
    return d;
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Your pitch line compared with the clip">
      <path d={path(target)} fill="none" stroke="#c7c9d1" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <path d={path(sung, shift)} fill="none" stroke="#007aff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function playClip(clip: ClipView) {
  if (clip.kind === "tune") return playTune(clip.notes);
  if (clip.kind === "animal") return playAnimal(clip.animal);
  return playUrl(`${API_URL}${clip.audio_url}`);
}

/** What kind of sound this is, and who made it. */
export function clipLabel(clip: ClipView) {
  if (clip.kind === "tune") return "Scrappy Tune";
  if (clip.kind === "animal") return "Animal call";
  const by = clip.by ? ` by ${clip.by}` : "";
  return clip.category === "dialogue" ? `Famous line, performed${by}` : clip.category === "animal" ? `Animal impression${by}` : `Player sound${by}`;
}

/**
 * One round: listen (as often as you like), sing it back, see how close you got, retry until you're
 * happy, then lock it in. Only the pitch line is sent; the server re-scores it.
 */
export function MimicRecorder({ clip, busy, onLock }: { clip: ClipView; busy: boolean; onLock: (contour: string) => void }) {
  const [phase, setPhase] = useState<"idle" | "playing" | "count" | "rec" | "review">("idle");
  const [count, setCount] = useState(3);
  const [live, setLive] = useState<(number | null)[]>([]);
  const [take, setTake] = useState<{ contour: string; score: number } | null>(null);
  const [error, setError] = useState("");

  const listen = async () => {
    setError("");
    setPhase("playing");
    try {
      await playClip(clip);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't play the clip.");
    }
    setPhase(take ? "review" : "idle");
  };

  const sing = async () => {
    setError("");
    setLive([]);
    setPhase("count");
    for (let c = 3; c > 0; c--) {
      setCount(c);
      await new Promise((r) => window.setTimeout(r, 600));
    }
    setPhase("rec");
    try {
      const rec = await record((f) => setLive(f));
      setLive(rec.frames);
      setTake({ contour: rec.contour, score: scoreContour(clip.frames, rec.contour) ?? 0 });
      setPhase("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't record.");
      setPhase(take ? "review" : "idle");
    }
  };

  return (
    <div className="mt-4 space-y-4">
      <div className="rounded-[20px] bg-field p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-ink-soft">{clipLabel(clip)}</p>
            <p className="font-display text-[20px] font-bold leading-snug">{clip.kind === "upload" && clip.quote ? `"${clip.quote}"` : clip.title}</p>
            {clip.kind === "upload" && clip.movie && <p className="text-[13px] text-ink-soft">{clip.movie}</p>}
          </div>
          <button
            type="button"
            onClick={listen}
            disabled={phase === "playing" || phase === "rec" || phase === "count"}
            className="flex min-h-12 shrink-0 items-center gap-2 rounded-[14px] bg-white px-4 font-semibold text-[#007aff] disabled:opacity-50"
          >
            <Play size={18} weight="fill" /> {phase === "playing" ? "Playing..." : "Listen"}
          </button>
        </div>
        <div className="mt-3 rounded-[14px] bg-white p-2">
          <PitchLine target={clip.frames} sung={live} />
        </div>
        <p className="mt-2 text-center text-[13px] text-ink-soft">
          Grey is the clip. Blue is you. Any key works: match the shape and the rhythm.
        </p>
      </div>

      {phase === "count" && <p className="text-center font-display text-[56px] font-bold text-[#007aff]">{count}</p>}
      {phase === "rec" && (
        <p className="flex items-center justify-center gap-2 text-center font-display text-[22px] font-bold text-[#c2410c]">
          <Microphone size={24} weight="fill" /> Sing it now!
        </p>
      )}

      {phase === "review" && take && (
        <div className="text-center">
          <p className="text-[14px] font-semibold text-ink-soft">This take</p>
          <p className="font-display text-[48px] font-bold leading-none tabular-nums">{take.score}</p>
          <p className="mt-1 text-[14px] text-ink-soft">{take.score >= 85 ? "Spot on!" : take.score >= 60 ? "Close! Try again or lock it in." : "Listen again and match the ups and downs."}</p>
        </div>
      )}

      {error && <p role="alert" className="text-center text-[15px] text-[#c2410c]">{error}</p>}

      <div className="flex flex-wrap items-center justify-center gap-3">
        {(phase === "idle" || phase === "review" || phase === "playing") && (
          <button
            type="button"
            onClick={sing}
            disabled={phase === "playing" || busy}
            className={`flex min-h-12 items-center gap-2 rounded-[14px] px-6 text-[16px] font-semibold transition-colors disabled:opacity-50 ${take ? "bg-field hover:bg-field-hover" : "bg-[#007aff] text-white hover:bg-[#0060cc]"}`}
          >
            <Microphone size={20} weight="fill" /> {take ? "Try again" : "Record (4s)"}
          </button>
        )}
        {phase === "review" && take && (
          <button type="button" onClick={() => onLock(take.contour)} disabled={busy} className="min-h-12 rounded-[14px] bg-[#007aff] px-6 text-[16px] font-semibold text-white transition-colors hover:bg-[#0060cc] disabled:opacity-60">
            {busy ? "Locking in..." : `Lock in ${take.score}`}
          </button>
        )}
      </div>
    </div>
  );
}
