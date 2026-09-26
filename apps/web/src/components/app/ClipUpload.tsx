"use client";

import { useState } from "react";
import { Microphone } from "@phosphor-icons/react";
import { uploadClip } from "@/lib/api";
import { blobToBase64, record } from "@/lib/voice";
import { PitchLine } from "./MimicRecorder";

/**
 * Add a sound to the Mimic library: record up to 8 seconds (a funny voice, a catchphrase you made up,
 * a tune). Its pitch line is worked out on this phone and uploaded with it.
 */
export function ClipUpload({ token }: { token: string }) {
  const [title, setTitle] = useState("");
  const [phase, setPhase] = useState<"idle" | "rec" | "ready" | "sending" | "done">("idle");
  const [live, setLive] = useState<(number | null)[]>([]);
  const [take, setTake] = useState<{ blob: Blob; contour: string; durationMs: number } | null>(null);
  const [error, setError] = useState("");

  const rec = async () => {
    setError("");
    setLive([]);
    setPhase("rec");
    try {
      const r = await record((f) => setLive(f), { ms: 8_000, keepAudio: true });
      if (!r.blob) throw new Error("This browser can't save recordings.");
      setTake({ blob: r.blob, contour: r.contour, durationMs: r.durationMs });
      setPhase("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't record.");
      setPhase("idle");
    }
  };

  const send = async () => {
    if (!take || title.trim().length < 2) return;
    setPhase("sending");
    setError("");
    try {
      await uploadClip(token, { title: title.trim(), mime: take.blob.type || "audio/webm", audio: await blobToBase64(take.blob), contour: take.contour, duration_ms: take.durationMs });
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't upload.");
      setPhase("ready");
    }
  };

  return (
    <section className="rounded-[28px] bg-ground-deep p-6 sm:p-8">
      <h2 className="font-display text-[24px] font-bold">Add a sound</h2>
      <p className="mt-1 text-ink-soft">Record your own funny voice, catchphrase or tune (up to 8s). Other players get it in their battles. Only upload sounds you made.</p>
      {phase === "done" ? (
        <p className="mt-4 font-semibold text-[#15803d]">Added! It'll show up in battles.</p>
      ) : (
        <>
          <div className="mt-4 rounded-[14px] bg-field p-2">
            <PitchLine target={[]} sung={live} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="button" onClick={rec} disabled={phase === "rec" || phase === "sending"} className="flex min-h-12 items-center gap-2 rounded-[14px] bg-field px-5 font-semibold transition-colors hover:bg-field-hover disabled:opacity-50">
              <Microphone size={20} weight="fill" /> {phase === "rec" ? "Recording 8s..." : take ? "Record again" : "Record"}
            </button>
            {take && (
              <>
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Name it" maxLength={60} className="h-12 min-w-0 flex-1 rounded-[14px] bg-field px-4 outline-none ring-[#007aff] focus-visible:ring-2" />
                <button type="button" onClick={send} disabled={phase === "sending" || title.trim().length < 2} className="min-h-12 rounded-[14px] bg-[#007aff] px-5 font-semibold text-white disabled:opacity-50">
                  {phase === "sending" ? "Uploading..." : "Add to library"}
                </button>
              </>
            )}
          </div>
        </>
      )}
      {error && <p role="alert" className="mt-3 text-[15px] text-[#c2410c]">{error}</p>}
    </section>
  );
}
