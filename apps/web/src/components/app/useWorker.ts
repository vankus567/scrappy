"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, getMe, type WorkerProfile } from "@/lib/api";
import { usePet } from "@/lib/pet-store";

/** The worker's live profile from the Scrappy API (the source of truth for tasks, accuracy and earnings). */
export function useWorker(intervalMs = 15_000) {
  const { pet, update } = usePet();
  const token = pet?.workerToken;
  const [profile, setProfile] = useState<WorkerProfile | null>(null);
  const [offline, setOffline] = useState(false);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const p = await getMe(token);
      setProfile(p);
      setOffline(false);
      update({ jobsDone: p.tasks_done, earnedUsdc: p.earnings.total_usdc });
    } catch (err) {
      // a revoked token (signed in on another device) sends the owner back to sign in
      if (err instanceof ApiError && err.status === 401) update({ workerToken: undefined });
      else setOffline(true);
    }
  }, [token, update]);

  useEffect(() => {
    if (!token) return;
    // async: state is set after the request resolves
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    const t = window.setInterval(refresh, intervalMs);
    return () => window.clearInterval(t);
  }, [token, intervalMs, refresh]);

  return { token, profile, offline, refresh };
}
