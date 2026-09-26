"use client";

import { useEffect, useState } from "react";
import { enablePush, pushGranted, pushSupported } from "@/lib/push";

/** One tap to get a buzz when it's your turn in a battle, so async battles keep moving. */
export function TurnAlerts({ token }: { token: string }) {
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    setSupported(pushSupported());
    setOn(pushGranted());
  }, []);

  if (!supported) return null;

  const turnOn = async () => {
    setBusy(true);
    setError("");
    try {
      await enablePush(token);
      setOn(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't turn on notifications.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-[20px] bg-field p-4">
      <p className="font-semibold">{on ? "You'll get a buzz when it's your turn" : "Get a buzz when it's your turn"}</p>
      <p className="text-[14px] text-ink-soft">
        {on ? "Close the app anytime; battles wait for you." : "Friends can move while you're away. We'll tell you when they did."}
      </p>
      {!on && (
        <button type="button" onClick={turnOn} disabled={busy} className="mt-2 text-[15px] font-semibold text-[#007aff] disabled:opacity-60">
          {busy ? "Turning on..." : "Turn on notifications"}
        </button>
      )}
      {error && <p role="alert" className="mt-1 text-[14px] text-[#c2410c]">{error}</p>}
    </div>
  );
}
