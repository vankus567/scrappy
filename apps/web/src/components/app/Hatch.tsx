"use client";

import { useState } from "react";
import { Egg } from "@/components/Egg";
import { GlossButton } from "@/components/GlossButton";
import { Pet, SPECIES, type Species } from "@/components/Pet";
import { LANGUAGES, usePet, type Language } from "@/lib/pet-store";

export function Hatch() {
  const { hatch } = usePet();
  const [species, setSpecies] = useState<Species>("mochi");
  const [name, setName] = useState("");
  const [langs, setLangs] = useState<Language[]>([]);
  const [city, setCity] = useState("");
  const [college, setCollege] = useState("");
  const [cracking, setCracking] = useState(false);
  const [error, setError] = useState("");

  const toggle = (id: Language) =>
    setLangs((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError("Give your pet a name.");
    if (langs.length === 0) return setError("Pick at least one language you can check.");
    setError("");
    setCracking(true);
    setTimeout(() => hatch({ species, name: name.trim(), languages: langs, city: city.trim(), college: college.trim() }), 900);
  };

  return (
    <div className="grid gap-8 md:grid-cols-[1fr_1.1fr] md:items-center md:gap-12">
      <div className="flex justify-center rounded-[28px] bg-ground-deep py-10 md:py-16">
        <div className="relative w-[55%] max-w-[260px]">
          <Egg cracking={cracking} className="w-full" />
          <Pet species={species} stage="sprout" mood="curious" className={`absolute inset-x-[18%] bottom-[8%] w-[64%] transition-opacity duration-500 ${cracking ? "opacity-100" : "opacity-0"}`} title={`Baby ${SPECIES[species].name}`} />
        </div>
      </div>

      <form onSubmit={submit} className="space-y-7 rounded-[28px] bg-ground-deep p-6 sm:p-8" noValidate>
        <div>
          <h1 className="font-display tracking-[-0.005em] text-[clamp(2rem,4vw,2.8rem)] font-bold leading-[1.1]">Something is hatching.</h1>
          <p className="mt-2 text-[16px] text-ink-soft">Name it, and tell it which languages you can check.</p>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-[15px] font-medium">Pick your buddy</legend>
          <div className="grid grid-cols-5 gap-2 sm:gap-2.5">
            {(Object.keys(SPECIES) as Species[]).map((id) => {
              const on = species === id;
              return (
                <button
                  type="button"
                  key={id}
                  onClick={() => setSpecies(id)}
                  aria-pressed={on}
                  aria-label={`${SPECIES[id].name}, ${SPECIES[id].blurb}`}
                  className={`rounded-[18px] px-1 pb-2 pt-1 transition-colors active:scale-[0.97] ${on ? "bg-leaf text-on-leaf" : "bg-field hover:bg-field-hover"}`}
                >
                  <Pet species={id} stage="mochi" mood={on ? "happy" : "curious"} className="mx-auto w-full max-w-[84px]" title={SPECIES[id].name} />
                  <span className="block text-[13px] font-semibold">{SPECIES[id].name}</span>
                </button>
              );
            })}
          </div>
          <p className="text-[13px] text-ink-soft">{SPECIES[species].name}, the {SPECIES[species].blurb.toLowerCase()}.</p>
        </fieldset>

        <div className="space-y-2">
          <label htmlFor="pet-name" className="block text-[15px] font-medium">Pet name</label>
          <input
            id="pet-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
            autoComplete="off"
            className="h-12 w-full rounded-[14px] bg-field px-4 text-[16px] text-ink outline-none ring-leaf focus-visible:ring-2"
          />
        </div>

        <fieldset className="space-y-2">
          <legend className="text-[15px] font-medium">Languages you can check</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {LANGUAGES.map((l) => {
              const on = langs.includes(l.id);
              return (
                <button
                  type="button"
                  key={l.id}
                  onClick={() => toggle(l.id)}
                  aria-pressed={on}
                  className={`min-h-[52px] rounded-[14px] px-3 py-2 text-left transition-colors active:scale-[0.98] ${on ? "bg-leaf text-on-leaf" : "bg-field text-ink hover:bg-field-hover"}`}
                >
                  <span lang={l.id} className="block text-[16px]">{l.native}</span>
                  {l.native !== l.label && (
                    <span className={`block text-[12px] ${on ? "opacity-80" : "text-ink-soft"}`}>{l.label}</span>
                  )}
                </button>
              );
            })}
          </div>
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
          <GlossButton type="submit" disabled={cracking}>Hatch</GlossButton>
          <p className="text-[13px] text-ink-faint">Saved on this device for now. Wallet sign-in comes with paid jobs.</p>
        </div>
      </form>
    </div>
  );
}
