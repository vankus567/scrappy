"use client";

import { useState } from "react";
import { ArrowsClockwise, Microphone } from "@phosphor-icons/react";
import { uploadClip } from "@/lib/api";
import { blobToBase64, record } from "@/lib/voice";
import { PitchLine } from "./MimicRecorder";

// Short famous lines for players to perform in their own voice. Only the text is shown; no film audio.
const LINES: { quote: string; movie: string }[] = [
  { quote: "Kitne aadmi the?", movie: "Sholay" },
  { quote: "Mogambo khush hua!", movie: "Mr. India" },
  { quote: "Mere paas maa hai.", movie: "Deewaar" },
  { quote: "Picture abhi baaki hai, mere dost.", movie: "Om Shanti Om" },
  { quote: "How's the josh?", movie: "Uri" },
  { quote: "Thaggedhe le!", movie: "Pushpa" },
  { quote: "Main apni favourite hoon.", movie: "Jab We Met" },
  { quote: "Don ko pakadna mushkil hi nahi, namumkin hai.", movie: "Don" },
  { quote: "Rishte mein toh hum tumhare baap lagte hain.", movie: "Shahenshah" },
  { quote: "Bade bade deshon mein aisi chhoti chhoti baatein hoti rehti hain.", movie: "Dilwale Dulhania Le Jayenge" },
  { quote: "Ek baar jo maine commitment kar di, uske baad toh main khud ki bhi nahi sunta.", movie: "Wanted" },
  { quote: "En vazhi thani vazhi.", movie: "Padayappa" },
  { quote: "I'll be back.", movie: "The Terminator" },
  { quote: "Why so serious?", movie: "The Dark Knight" },
  { quote: "May the Force be with you.", movie: "Star Wars" },
  { quote: "You shall not pass!", movie: "The Lord of the Rings" },
  { quote: "To infinity and beyond!", movie: "Toy Story" },
  { quote: "I am Groot.", movie: "Guardians of the Galaxy" },
  { quote: "Houston, we have a problem.", movie: "Apollo 13" },
  { quote: "Just keep swimming.", movie: "Finding Nemo" },
  { quote: "Hasta la vista, baby.", movie: "Terminator 2" },
  { quote: "I'm the king of the world!", movie: "Titanic" },
];
const ANIMAL_IDEAS = ["a cat asking for food", "a sleepy dog", "an angry goose", "a happy dolphin", "a monkey laughing", "a cow saying good morning", "a tiny lion roaring"];

type Kind = "dialogue" | "animal" | "sound";
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

/**
 * Add a sound to the Mimic library: perform a famous line in your own voice, do an animal impression,
 * or record any sound you made up (up to 8 seconds). Its pitch line is worked out on this phone.
 */
export function ClipUpload({ token }: { token: string }) {
  const [kind, setKind] = useState<Kind>("dialogue");
  const [line, setLine] = useState(() => pick(LINES));
  const [idea, setIdea] = useState(() => pick(ANIMAL_IDEAS));
  const [title, setTitle] = useState("");
  const [phase, setPhase] = useState<"idle" | "rec" | "ready" | "sending" | "done">("idle");
  const [live, setLive] = useState<(number | null)[]>([]);
  const [take, setTake] = useState<{ blob: Blob; contour: string; durationMs: number } | null>(null);
  const [error, setError] = useState("");

  const reset = (k: Kind) => {
    setKind(k);
    setTake(null);
    setLive([]);
    setPhase("idle");
    setError("");
  };

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

  const name = kind === "dialogue" ? line.quote : title.trim();
  const send = async () => {
    if (!take || name.length < 2) return;
    setPhase("sending");
    setError("");
    try {
      await uploadClip(token, {
        title: name,
        mime: take.blob.type || "audio/webm",
        audio: await blobToBase64(take.blob),
        contour: take.contour,
        duration_ms: take.durationMs,
        category: kind,
        ...(kind === "dialogue" && { quote: line.quote, movie: line.movie }),
      });
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't upload.");
      setPhase("ready");
    }
  };

  const tab = (k: Kind, label: string) => (
    <button key={k} type="button" aria-pressed={kind === k} onClick={() => reset(k)} className={`min-h-11 flex-1 rounded-[14px] px-2 text-[15px] font-semibold transition-colors ${kind === k ? "bg-[#007aff] text-white" : "bg-field hover:bg-field-hover"}`}>
      {label}
    </button>
  );

  return (
    <section className="rounded-[28px] bg-ground-deep p-6 sm:p-8">
      <h2 className="font-display text-[24px] font-bold">Add a sound</h2>
      <p className="mt-1 text-ink-soft">Your recording shows up in other players' battles. Up to 8 seconds, in your own voice.</p>

      <div className="mt-4 flex gap-2">
        {tab("dialogue", "Famous line")}
        {tab("animal", "Animal impression")}
        {tab("sound", "Any sound")}
      </div>

      {phase === "done" ? (
        <div className="mt-4">
          <p className="font-semibold text-[#15803d]">Added! It'll show up in battles.</p>
          <button type="button" onClick={() => { setLine(pick(LINES)); setIdea(pick(ANIMAL_IDEAS)); setTitle(""); reset(kind); }} className="mt-2 font-semibold text-[#007aff]">
            Add another
          </button>
        </div>
      ) : (
        <>
          <div className="mt-4 rounded-[20px] bg-field p-4">
            {kind === "dialogue" && (
              <>
                <p className="text-[13px] font-semibold text-ink-soft">Say it your way</p>
                <p className="mt-1 font-display text-[22px] font-bold leading-snug">"{line.quote}"</p>
                <p className="text-[14px] text-ink-soft">{line.movie}</p>
                <button type="button" onClick={() => { setLine(pick(LINES.filter((l) => l !== line))); setTake(null); setLive([]); setPhase("idle"); }} className="mt-2 flex items-center gap-1.5 text-[14px] font-semibold text-[#007aff]">
                  <ArrowsClockwise size={16} weight="bold" /> Another line
                </button>
              </>
            )}
            {kind === "animal" && (
              <>
                <p className="text-[13px] font-semibold text-ink-soft">Idea</p>
                <p className="mt-1 font-display text-[20px] font-bold">Do {idea}</p>
                <button type="button" onClick={() => setIdea(pick(ANIMAL_IDEAS.filter((i) => i !== idea)))} className="mt-2 flex items-center gap-1.5 text-[14px] font-semibold text-[#007aff]">
                  <ArrowsClockwise size={16} weight="bold" /> Another idea
                </button>
              </>
            )}
            {kind === "sound" && <p className="text-[15px] text-ink-soft">A catchphrase you made up, a jingle, a funny voice. Only upload sounds you made.</p>}
            <div className="mt-3 rounded-[14px] bg-white p-2">
              <PitchLine target={[]} sung={live} />
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="button" onClick={rec} disabled={phase === "rec" || phase === "sending"} className="flex min-h-12 items-center gap-2 rounded-[14px] bg-field px-5 font-semibold transition-colors hover:bg-field-hover disabled:opacity-50">
              <Microphone size={20} weight="fill" /> {phase === "rec" ? "Recording 8s..." : take ? "Record again" : "Record"}
            </button>
            {take && kind !== "dialogue" && (
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === "animal" ? "e.g. Hungry cat" : "Name it"} maxLength={60} className="h-12 min-w-0 flex-1 rounded-[14px] bg-field px-4 outline-none ring-[#007aff] focus-visible:ring-2" />
            )}
            {take && (
              <button type="button" onClick={send} disabled={phase === "sending" || name.length < 2} className="min-h-12 rounded-[14px] bg-[#007aff] px-5 font-semibold text-white disabled:opacity-50">
                {phase === "sending" ? "Uploading..." : "Add to library"}
              </button>
            )}
          </div>
        </>
      )}
      {error && <p role="alert" className="mt-3 text-[15px] text-[#c2410c]">{error}</p>}
    </section>
  );
}
