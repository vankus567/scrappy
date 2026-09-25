"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

/**
 * Local Kage identity: the pet, its name and languages (real user input) plus the device token.
 * Earnings, tasks, accuracy and ranks always come from the Kage API; nothing here is invented.
 */
export type Language =
  | "hi" | "en" | "ta" | "mr" | "bn" | "te" | "kn" | "gu" | "ml" | "pa" | "or" | "ur" | "as"
  | "es" | "pt" | "fr" | "de" | "it" | "ar" | "zh" | "ja" | "ko" | "id" | "vi" | "th" | "fil" | "tr" | "ru" | "sw" | "fa" | "nl";

export type LanguageInfo = { id: Language; label: string; native: string; group: "india" | "world" };

export const LANGUAGES: LanguageInfo[] = [
  { id: "hi", label: "Hindi", native: "हिन्दी", group: "india" },
  { id: "en", label: "English", native: "English", group: "india" },
  { id: "ta", label: "Tamil", native: "தமிழ்", group: "india" },
  { id: "mr", label: "Marathi", native: "मराठी", group: "india" },
  { id: "bn", label: "Bengali", native: "বাংলা", group: "india" },
  { id: "te", label: "Telugu", native: "తెలుగు", group: "india" },
  { id: "kn", label: "Kannada", native: "ಕನ್ನಡ", group: "india" },
  { id: "gu", label: "Gujarati", native: "ગુજરાતી", group: "india" },
  { id: "ml", label: "Malayalam", native: "മലയാളം", group: "india" },
  { id: "pa", label: "Punjabi", native: "ਪੰਜਾਬੀ", group: "india" },
  { id: "or", label: "Odia", native: "ଓଡ଼ିଆ", group: "india" },
  { id: "ur", label: "Urdu", native: "اردو", group: "india" },
  { id: "as", label: "Assamese", native: "অসমীয়া", group: "india" },
  { id: "es", label: "Spanish", native: "Español", group: "world" },
  { id: "pt", label: "Portuguese", native: "Português", group: "world" },
  { id: "fr", label: "French", native: "Français", group: "world" },
  { id: "de", label: "German", native: "Deutsch", group: "world" },
  { id: "it", label: "Italian", native: "Italiano", group: "world" },
  { id: "ar", label: "Arabic", native: "العربية", group: "world" },
  { id: "zh", label: "Mandarin", native: "中文", group: "world" },
  { id: "ja", label: "Japanese", native: "日本語", group: "world" },
  { id: "ko", label: "Korean", native: "한국어", group: "world" },
  { id: "id", label: "Indonesian", native: "Bahasa Indonesia", group: "world" },
  { id: "vi", label: "Vietnamese", native: "Tiếng Việt", group: "world" },
  { id: "th", label: "Thai", native: "ไทย", group: "world" },
  { id: "fil", label: "Filipino", native: "Filipino", group: "world" },
  { id: "tr", label: "Turkish", native: "Türkçe", group: "world" },
  { id: "ru", label: "Russian", native: "Русский", group: "world" },
  { id: "sw", label: "Swahili", native: "Kiswahili", group: "world" },
  { id: "fa", label: "Persian", native: "فارسی", group: "world" },
  { id: "nl", label: "Dutch", native: "Nederlands", group: "world" },
];

export type PetRecord = {
  species?: import("@/components/Pet").Species;
  /** device token from the Kage API, issued when the owner connects a payout wallet */
  workerToken?: string;
  /** the Solana wallet that receives USDC */
  wallet?: string;
  /** lifetime earnings from the API, in USDC */
  earnedUsdc?: number;
  name: string;
  languages: Language[];
  city: string;
  college: string;
  bornAt: number;
  earnedPaise: number;
  jobsDone: number;
};

const KEY = "kage.pet.v1";

type Store = {
  ready: boolean;
  pet: PetRecord | null;
  hatch: (p: Omit<PetRecord, "bornAt" | "earnedPaise" | "jobsDone">) => void;
  release: () => void;
  update: (patch: Partial<PetRecord>) => void;
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
    // hydrate from localStorage after mount (server render has no storage)
    // eslint-disable-next-line react-hooks/set-state-in-effect
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

  const update = useCallback((patch: Partial<PetRecord>) => {
    setPet((p) => {
      if (!p) return p;
      const next = { ...p, ...patch };
      write(next);
      return next;
    });
  }, []);

  const value = useMemo(() => ({ ready, pet, hatch, release, update }), [ready, pet, hatch, release, update]);
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

/** Each species has its own four-form evolution line. */
export const EVOLUTION: Record<import("@/components/Pet").Species, [string, string, string, string]> = {
  mochi: ["Sprout", "Mochi", "Bloom", "Blossom"],
  neko: ["Kitten", "Neko", "Twin-tail", "Moon Neko"],
  bun: ["Bunlet", "Bun", "Clover Bun", "Moon Hare"],
  kumo: ["Wisp", "Kumo", "Nimbus", "Stormcloud"],
  pip: ["Egglet", "Pip", "Wingling", "Skylark"],
  zap: ["Spark", "Zap", "Twin Volt", "Thunderking"],
  kitsu: ["Kit", "Kitsu", "Two-tail", "Five-tail"],
  pengu: ["Fluffchick", "Pengu", "Captain", "Emperor"],
  drako: ["Hatchling", "Drako", "Wyvern", "Sky Drake"],
  goo: ["Drop", "Goo", "Jelly", "Royal Goo"],
  ember: ["Cinder", "Ember", "Blaze", "Inferno"],
  boo: ["Glim", "Boo", "Phantom", "Spectre King"],
};

export function stageName(species: import("@/components/Pet").Species | undefined, stage: PetStage) {
  const idx = STAGES.findIndex((s) => s.id === stage);
  return EVOLUTION[species ?? "mochi"][Math.max(0, idx)];
}

/** "te:translation" -> "Telugu · translation" */
export function skillLabel(key: string) {
  const [lang, skill] = key.split(":");
  const l = LANGUAGES.find((x) => x.id === lang)?.label ?? lang.toUpperCase();
  return skill && skill !== "general" ? `${l} · ${skill.replace(/[-_]/g, " ")}` : l;
}
