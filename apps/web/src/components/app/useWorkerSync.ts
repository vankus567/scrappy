"use client";

import { useEffect } from "react";
import { getWorker } from "@/lib/api";
import { usePet } from "@/lib/pet-store";

/** Keeps the pet's jobs and earnings in sync with the Human API (the source of truth). */
export function useWorkerSync(intervalMs = 15_000) {
  const { pet, update } = usePet();
  const workerId = pet?.workerId;

  useEffect(() => {
    if (!workerId) return;
    let alive = true;
    const pull = async () => {
      try {
        const w = await getWorker(workerId);
        if (alive) update({ jobsDone: w.jobs_done, earnedUsdc: w.owed_usdc });
      } catch {
        /* API offline: keep last known values */
      }
    };
    pull();
    const t = window.setInterval(pull, intervalMs);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [workerId, intervalMs, update]);
}
