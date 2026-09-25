"use client";

import { useState } from "react";
import { Egg } from "@/components/Egg";
import { Button } from "@/components/ui/Button";
import { LanguagePicker } from "./LanguagePicker";
import { ReturningSignIn } from "./ReturningSignIn";
import { Pet, SPECIES, type Species } from "@/components/Pet";
import { EVOLUTION, usePet, type Language } from "@/lib/pet-store";

const ALL = Object.keys(SPECIES) as Species[];

export function Hatch() {
  const { hatch } = usePet();
  const [step, setStep] = useState<"pick" | "details">("pick");
  const [species, setSpecies] = useState<Species>("mochi");
  const [name, setName] = useState("");
  const [langs, setLangs] = useState<Language[]>([]);
  const [city, setCity] = useState("");
  const [college, setCollege] = useState("");
  const [cracking, setCracking] = useState(false);
  const [error, setError] = useState("");
  const sp = SPECIES[species];


  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError(`Give your ${sp.name} a name.`);
    if (langs.length === 0) return setError("Pick at least one language you can check.");
    setError("");
    setCracking(true);
    setTimeout(() => hatch({ species, name: name.trim(), languages: langs, city: city.trim(), college: college.trim() }), 900);
  };

  // ---------- Step 1: choose your first companion ----------
  if (step === "pick") {
    return (
      <div className="space-y-6 pb-28">
        <div>
          <p className="text-[14px] font-semibold text-ink-soft">Step 1 of 2</p>
          <h1 className="mt-1 font-display text-[clamp(2rem,4vw,2.9rem)] font-bold leading-[1.08]">Choose your Scrappy</h1>
          <p className="mt-2 text-ink-soft">Your Scrappy is your identity on the network. It grows through four forms as your answers prove you right.</p>
          <ReturningSignIn />
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {ALL.map((id) => {
            const on = species === id;
            return (
              <button
                type="button"
                key={id}
                onClick={() => setSpecies(id)}
                aria-pressed={on}
                className={`rounded-[24px] bg-ground-deep p-4 text-left transition-[box-shadow,transform] active:scale-[0.98] ${on ? "ring-4 ring-leaf" : "ring-0 hover:ring-2 hover:ring-edge"}`}
              >
                <Pet
                  species={id}
                  stage="mochi"
                  mood={on ? "excited" : "curious"}
                  dance={on ? "bounce" : "none"}
                  className="mx-auto w-full max-w-[140px]"
                  title={SPECIES[id].name}
                />
                <p className="mt-2 font-display text-[20px] font-bold leading-tight">{SPECIES[id].name}</p>
                <p className="text-[14px] text-ink-soft">{SPECIES[id].blurb}</p>
                <p className="mt-2 text-[12px] leading-snug text-ink-faint">{EVOLUTION[id].join(" → ")}</p>
              </button>
            );
          })}
        </div>

        {/* choose bar: stays reachable while scrolling the grid */}
        <div className="fixed inset-x-0 bottom-[calc(96px+env(safe-area-inset-bottom))] z-20 flex justify-center px-4 md:bottom-6">
          <div className="flex items-center gap-3 rounded-[20px] bg-ground-deep py-2 pl-2 pr-2 ring-1 ring-edge">
            <Pet species={species} stage="mochi" mood="happy" className="size-12" title={sp.name} />
            <Button type="button" onClick={() => setStep("details")} arrow>
              Choose {sp.name}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ---------- Step 2: name it and hatch ----------
  return (
    <div className="grid gap-8 md:grid-cols-[1fr_1.1fr] md:items-center md:gap-12">
      <div className="flex flex-col items-center gap-4 rounded-[28px] bg-ground-deep py-10 md:py-16">
        <div className="relative w-[55%] max-w-[260px]">
          <Egg cracking={cracking} className="w-full" />
          <Pet
            species={species}
            stage="sprout"
            mood="excited"
            dance={cracking ? "bounce" : "none"}
            className={`absolute inset-x-[18%] bottom-[8%] w-[64%] transition-opacity duration-500 ${cracking ? "opacity-100" : "opacity-0"}`}
            title={`Baby ${sp.name}`}
          />
        </div>
        <p className="text-[15px] text-ink-soft">
          Your Scrappy: <span className="font-bold text-ink">{sp.name}</span>, the {sp.blurb.toLowerCase()}.{" "}
          <button type="button" onClick={() => setStep("pick")} className="font-semibold text-leaf transition-colors hover:text-leaf-hover">
            Change
          </button>
        </p>
      </div>

      <form onSubmit={submit} className="space-y-7 rounded-[28px] bg-ground-deep p-6 sm:p-8" noValidate>
        <div>
          <p className="text-[14px] font-semibold text-ink-soft">Step 2 of 2</p>
          <h1 className="mt-1 font-display text-[clamp(2rem,4vw,2.8rem)] font-bold leading-[1.1]">Name your {sp.name}</h1>
          <p className="mt-2 text-ink-soft">Then pick the languages you can judge. Tasks come in these.</p>
        </div>

        <div className="space-y-2">
          <label htmlFor="pet-name" className="block text-[15px] font-medium">Name</label>
          <input
            id="pet-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
            autoComplete="off"
            className="h-12 w-full rounded-[14px] bg-field px-4 text-[16px] text-ink outline-none ring-leaf focus-visible:ring-2"
          />
        </div>

        <fieldset className="space-y-3">
          <legend className="text-[15px] font-medium">Languages you can check</legend>
          <LanguagePicker value={langs} onChange={setLangs} />
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor="city" className="block text-[15px] font-medium">
              City <span className="font-normal text-ink-soft">(optional)</span>
            </label>
            <input id="city" value={city} onChange={(e) => setCity(e.target.value)} className="h-12 w-full rounded-[14px] bg-field px-4 text-[16px] outline-none ring-leaf focus-visible:ring-2" />
          </div>
          <div className="space-y-2">
            <label htmlFor="college" className="block text-[15px] font-medium">
              College <span className="font-normal text-ink-soft">(optional)</span>
            </label>
            <input id="college" value={college} onChange={(e) => setCollege(e.target.value)} className="h-12 w-full rounded-[14px] bg-field px-4 text-[16px] outline-none ring-leaf focus-visible:ring-2" />
          </div>
        </div>

        {error && <p role="alert" className="text-[15px] text-[#ffb4a3]">{error}</p>}

        <div className="space-y-2">
          <Button type="submit" disabled={cracking}>Hatch {sp.name}</Button>
          <p className="text-[13px] text-ink-faint">Next you connect the wallet that gets paid.</p>
        </div>
      </form>
    </div>
  );
}
