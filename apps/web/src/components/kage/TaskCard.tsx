"use client";

import { useEffect, useState } from "react";
import type { WorkerTask } from "@/lib/api";
import { LANGUAGES } from "@/lib/pet-store";
import { Button } from "@/components/ui/Button";

const langName = (id: string) => LANGUAGES.find((l) => l.id === id)?.label ?? id.toUpperCase();

/**
 * The one task surface a human ever sees: the question, the material, and the fastest possible answer control.
 * Binary and choice answers submit on tap; rating on tap; text with a send button. Confidence is one quiet control.
 */
export function TaskCard({
  task,
  onAnswer,
  busy = false,
  error,
  preview = false,
}: {
  task: WorkerTask;
  onAnswer: (answer: string, confidence: number) => void;
  busy?: boolean;
  error?: string;
  /** Landing page preview: same UI, labelled, nothing is sent. */
  preview?: boolean;
}) {
  const [confidence, setConfidence] = useState(80);
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const left = useCountdown(task.expires_at, preview);
  const s = task.response_schema;

  const choose = (a: string) => {
    if (busy) return;
    setPicked(a);
    onAnswer(a, confidence);
  };

  const choices: { value: string; label: string }[] =
    s.type === "binary" ? [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]
    : s.type === "choice" ? s.options.map((o) => ({ value: o, label: o }))
    : [];

  return (
    <article className="rounded-[26px] bg-ground-deep p-5 sm:p-7" aria-busy={busy}>
      <header className="flex items-baseline justify-between gap-4 text-[14px]">
        <p className="text-ink-soft">
          {task.qualification ? "Qualification check" : "From an AI agent"} · {langName(task.language)}
          {task.skill !== "general" && ` · ${task.skill}`}
        </p>
        <p className="shrink-0 font-semibold tabular-nums">
          {task.qualification ? <span className="text-ink-soft">unpaid</span> : <span className="money">${task.reward_usdc.toFixed(2)}</span>}
          <span className="text-ink-faint"> · about {task.estimated_seconds} sec</span>
        </p>
      </header>

      {!preview && (
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-field" aria-hidden>
          <div className="countdown h-full rounded-full bg-leaf transition-[width] duration-1000 ease-linear" style={{ width: `${left.fraction * 100}%` }} />
        </div>
      )}

      <h2 className="mt-5 font-display text-[clamp(1.45rem,3.2vw,2rem)] font-bold leading-[1.15]">{task.prompt}</h2>
      {task.content && (
        <pre
          lang={task.language}
          className={`mt-4 max-h-72 overflow-auto whitespace-pre-wrap rounded-[16px] bg-field p-4 text-[16px] leading-relaxed ${/[{};=]/.test(task.content) ? "font-mono text-[13.5px]" : "font-sans"}`}
        >
          {task.content}
        </pre>
      )}

      <div className="mt-6">
        {choices.length > 0 && (
          <div className={`grid gap-2.5 ${s.type === "binary" ? "grid-cols-2" : "sm:grid-cols-2"}`}>
            {choices.map((c) => (
              <button
                key={c.value}
                type="button"
                disabled={busy}
                onClick={() => choose(c.value)}
                aria-pressed={picked === c.value}
                className={`kage-focus min-h-14 rounded-[16px] px-4 py-3 text-[17px] font-semibold transition-colors disabled:opacity-60 ${
                  picked === c.value ? "bg-leaf text-on-leaf" : "bg-field hover:bg-field-hover"
                } ${s.type === "binary" ? "text-center" : "text-left"}`}
              >
                {c.label}
              </button>
            ))}
          </div>
        )}

        {s.type === "rating" && (
          <div className="flex gap-2" role="group" aria-label={`Rate 1 to ${s.scale}`}>
            {Array.from({ length: s.scale }, (_, i) => String(i + 1)).map((n) => (
              <button
                key={n}
                type="button"
                disabled={busy}
                onClick={() => choose(n)}
                aria-pressed={picked === n}
                className={`kage-focus min-h-14 flex-1 rounded-[14px] text-[18px] font-bold tabular-nums transition-colors ${picked === n ? "bg-leaf text-on-leaf" : "bg-field hover:bg-field-hover"}`}
              >
                {n}
              </button>
            ))}
          </div>
        )}

        {s.type === "text" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (text.trim()) onAnswer(text.trim(), confidence);
            }}
            className="space-y-3"
          >
            <label htmlFor={`ans-${task.task_id}`} className="sr-only">Your answer</label>
            <textarea
              id={`ans-${task.task_id}`}
              value={text}
              maxLength={s.max_length}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              className="w-full rounded-[14px] bg-field p-4 text-[16px] outline-none focus-visible:ring-2 focus-visible:ring-leaf"
            />
            <Button type="submit" disabled={busy || !text.trim()} arrow>Send</Button>
          </form>
        )}
      </div>

      <div className="mt-5 flex items-center gap-3 text-[14px] text-ink-soft">
        <label htmlFor={`conf-${task.task_id}`} className="shrink-0">How sure?</label>
        <input
          id={`conf-${task.task_id}`}
          type="range"
          min={0}
          max={100}
          step={5}
          value={confidence}
          onChange={(e) => setConfidence(Number(e.target.value))}
          className="h-1.5 flex-1 accent-[#dfe8b8]"
        />
        <span className="w-11 text-right font-semibold tabular-nums text-ink">{confidence}%</span>
      </div>

      {error && <p role="alert" className="mt-4 text-[15px] text-[#ffb4a3]">{error}</p>}
      {!preview && !task.qualification && <p className="mt-4 text-[13px] text-ink-faint">{left.seconds}s left · other humans answer this independently</p>}
      {task.qualification && <p className="mt-4 text-[13px] text-ink-faint">Checks like this measure your accuracy per language. They unlock paid tasks.</p>}
    </article>
  );
}

function useCountdown(expiresAt: string, frozen: boolean) {
  const end = Date.parse(expiresAt);
  const [now, setNow] = useState(() => Date.now());
  const [total] = useState(() => Math.max(1, end - Date.now()));
  useEffect(() => {
    if (frozen) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [frozen]);
  const ms = Math.max(0, end - now);
  return { seconds: Math.ceil(ms / 1000), fraction: Math.min(1, ms / total) };
}
