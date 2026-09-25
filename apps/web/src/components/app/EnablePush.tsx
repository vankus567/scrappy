"use client";

import { useState } from "react";
import { enablePush, pushSupported } from "@/lib/push";
import { usePet } from "@/lib/pet-store";

/** One line: turn on task notifications for this device. Hidden where push isn't possible. */
export function EnablePush({ className = "" }: { className?: string }) {
  const { pet } = usePet();
  const [state, setState] = useState<"idle" | "busy" | "on" | string>("idle");
  if (!pet?.workerToken || !pushSupported() || state === "on") return null;
  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 rounded-[16px] bg-field px-4 py-3 text-[14px] ${className}`}>
      <span className="text-ink-soft">{state !== "idle" && state !== "busy" ? state : "Get a buzz the moment an agent needs you."}</span>
      <button
        type="button"
        disabled={state === "busy"}
        onClick={async () => {
          setState("busy");
          try {
            await enablePush(pet.workerToken!);
            setState("on");
          } catch (e) {
            setState(e instanceof Error ? e.message : "Could not turn on notifications.");
          }
        }}
        className="scrappy-focus rounded-[10px] px-3 py-1.5 font-semibold text-leaf transition-colors hover:bg-field-hover"
      >
        {state === "busy" ? "Turning on…" : "Notify me"}
      </button>
    </div>
  );
}
