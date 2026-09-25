"use client";

import { LANGUAGES, type Language } from "@/lib/pet-store";

/** Languages a person can judge, grouped India / World, shown in their own script. */
export function LanguagePicker({ value, onChange }: { value: Language[]; onChange: (v: Language[]) => void }) {
  const toggle = (id: Language) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <div className="space-y-3">
      {(["india", "world"] as const).map((grp) => (
        <div key={grp} className="space-y-2">
          <p className="text-[13px] font-semibold text-ink-soft">{grp === "india" ? "India" : "World"}</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {LANGUAGES.filter((l) => l.group === grp).map((l) => {
              const on = value.includes(l.id);
              return (
                <button
                  type="button"
                  key={l.id}
                  onClick={() => toggle(l.id)}
                  aria-pressed={on}
                  className={`scrappy-focus min-h-[52px] rounded-[14px] px-3 py-2 text-left transition-colors ${on ? "bg-leaf text-on-leaf" : "bg-field text-ink hover:bg-field-hover"}`}
                >
                  <span lang={l.id} className="block text-[16px] leading-tight">{l.native}</span>
                  {l.native !== l.label && <span className={`block text-[12px] ${on ? "opacity-80" : "text-ink-soft"}`}>{l.label}</span>}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
