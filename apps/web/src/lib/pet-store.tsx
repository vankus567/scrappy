"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

/**
 * Local pet state. Everything here is real user input or real elapsed time.
 * Earnings, jobs and ranks come from the API once it is live; until then they are
 * honestly zero / empty, never invented.
 */
export type Language = "hi" | "ta" | "mr" | "bn" | "te" | "kn" | "gu" | "en";

export const LANGUAGES: { id: Language; label: string; native: string }[] = [
  { id: "hi", label: "Hindi", native: "हिन्दी" },
  { id: "en", label: "English", native: "English" },
  { id: "ta", label: "Tamil", native: "தமிழ்" },
  { id: "mr", label: "Marathi", native: "मराठी" },
  { id: "bn", label: "Bengali", native: "বাংলা" },
  { id: "te", label: "Telugu", native: "తెలుగు" },
  { id: "kn", label: "Kannada", native: "ಕನ್ನಡ" },
  { id: "gu", label: "Gujarati", native: "ગુજરાતી" },
];

export type PetRecord = {
  species?: import("@/components/Pet").Species;
  name: string;
  languages: Language[];
  city: string;
  college: string;
  bornAt: number;
  earnedPaise: number;
  jobsDone: number;
};

/** Paid jobs are not live until the API ships. While false, hunger does not tick. */
export const JOBS_LIVE = process.env.NEXT_PUBLIC_JOBS_LIVE === "true";

const KEY = "scrappy.pet.v1";

type Store = {
  ready: boolean;
  pet: PetRecord | null;
  hatch: (p: Omit<PetRecord, "bornAt" | "earnedPaise" | "jobsDone">) => void;
  release: () => void;
};

const Ctx = createContext<Store | null>(null);

function read(): PetRecord | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PetRecord) : null;
  } catch {
    return null;
  }
}

function write(p: PetRecord | null) {
  try {
    if (p) localStorage.setItem(KEY, JSON.stringify(p));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage blocked: state still works for this session */
  }
}

export function PetProvider({ children }: { children: React.ReactNode }) {
  const [pet, setPet] = useState<PetRecord | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setPet(read());
    setReady(true);
  }, []);

  const hatch = useCallback<Store["hatch"]>((p) => {
    const next: PetRecord = { ...p, bornAt: Date.now(), earnedPaise: 0, jobsDone: 0 };
    write(next);
    setPet(next);
  }, []);

  const release = useCallback(() => {
    write(null);
    setPet(null);
  }, []);

  const value = useMemo(() => ({ ready, pet, hatch, release }), [ready, pet, hatch, release]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePet() {
  const s = useContext(Ctx);
  if (!s) throw new Error("usePet must be used inside PetProvider");
  return s;
}

export function formatRupees(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function ageLabel(bornAt: number, now = Date.now()) {
  const days = Math.floor((now - bornAt) / 86_400_000);
  if (days < 1) return "Hatched today";
  return days === 1 ? "1 day old" : `${days} days old`;
}

import type { PetStage } from "@/components/Pet";

export const STAGES: { id: PetStage; name: string; jobs: number; days: number }[] = [
  { id: "sprout", name: "Sprout", jobs: 0, days: 0 },
  { id: "mochi", name: "Buddy", jobs: 10, days: 0 },
  { id: "bloom", name: "Bloom", jobs: 50, days: 3 },
  { id: "blossom", name: "Blossom", jobs: 200, days: 14 },
];

/** Evolution is earned: only real jobs and real days alive count. */
export function stageFor(pet: PetRecord, now = Date.now()) {
  const days = (now - pet.bornAt) / 86_400_000;
  let i = 0;
  STAGES.forEach((st, idx) => { if (pet.jobsDone >= st.jobs && days >= st.days) i = idx; });
  return { current: STAGES[i], next: STAGES[i + 1] ?? null };
}
