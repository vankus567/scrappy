"use client";

import { useEffect, useId, useRef, useState } from "react";

export type PetMood = "happy" | "curious" | "focused" | "hungry" | "dead";
/** Evolution forms, unlocked by real work (see stageFor in pet-store). */
export type PetStage = "sprout" | "mochi" | "bloom" | "blossom";
export type Species = "mochi" | "neko" | "bun" | "kumo" | "pip";

export const SPECIES: Record<Species, { name: string; blurb: string; light: string; mid: string; dark: string; belly: [string, string] }> = {
  mochi: { name: "Mochi", blurb: "Coral dumpling", light: "#ffb89c", mid: "#ff7a59", dark: "#e0553a", belly: ["#fff4ea", "#ffd3b8"] },
  neko: { name: "Neko", blurb: "Peach kitten", light: "#ffd2a8", mid: "#ffa66b", dark: "#e57f45", belly: ["#fff8ef", "#ffe0c4"] },
  bun: { name: "Bun", blurb: "Mint bunny", light: "#c8f5e2", mid: "#7fd9b5", dark: "#4fb08c", belly: ["#f7fffb", "#d6f5e8"] },
  kumo: { name: "Kumo", blurb: "Cloud puff", light: "#eaf3ff", mid: "#b9d6ff", dark: "#86b0ea", belly: ["#ffffff", "#e6f0ff"] },
  pip: { name: "Pip", blurb: "Sunny chick", light: "#fff0a8", mid: "#ffd35c", dark: "#e8ad2c", belly: ["#fffdf2", "#ffeeb8"] },
};

type PetProps = {
  mood?: PetMood;
  stage?: PetStage;
  species?: Species;
  watchPointer?: boolean;
  className?: string;
  title?: string;
};

const STONE = { light: "#e2dfe8", mid: "#c3c0cc", dark: "#9d99a8" };

/**
 * Mochi: a squishy chibi dumpling. Big sparkly eyes, glossy body, blush, leaf sprout.
 * Each evolution adds a detail. Always visible; motion only animates what is on screen.
 */
export function Pet({ mood = "happy", stage = "mochi", species = "mochi", watchPointer = false, className, title = "Mochi, a Scrappy pet" }: PetProps) {
  const ref = useRef<SVGSVGElement>(null);
  const uid = useId().replace(/:/g, "");
  const [look, setLook] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!watchPointer) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const box = ref.current?.getBoundingClientRect();
        if (!box) return;
        const dx = e.clientX - (box.left + box.width / 2);
        const dy = e.clientY - (box.top + box.height * 0.5);
        const d = Math.hypot(dx, dy) || 1;
        const reach = Math.min(1, d / 400);
        setLook({ x: (dx / d) * 5 * reach, y: (dy / d) * 4 * reach });
      });
    };
    window.addEventListener("pointermove", onMove);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
    };
  }, [watchPointer]);

  const dead = mood === "dead";
  const sp = SPECIES[species] ?? SPECIES.mochi;
  const c = dead ? STONE : sp;
  const sprouty = species === "mochi";
  const g = (n: string) => `${n}-${uid}`;
  const baby = stage === "sprout";
  const hasArms = stage === "bloom" || stage === "blossom";
  // babies are squatter and rounder
  const bodyT = baby ? "translate(12 30) scale(0.9 0.86)" : undefined;

  return (
    <svg ref={ref} viewBox="0 0 240 240" role="img" aria-label={title} className={className}>
      <defs>
        <radialGradient id={g("body")} cx="36%" cy="28%" r="78%">
          <stop offset="0%" stopColor={c.light} />
          <stop offset="55%" stopColor={c.mid} />
          <stop offset="100%" stopColor={c.dark} />
        </radialGradient>
        <radialGradient id={g("belly")} cx="45%" cy="30%" r="75%">
          <stop offset="0%" stopColor={dead ? "#f1eff4" : sp.belly[0]} />
          <stop offset="100%" stopColor={dead ? "#d6d3dc" : sp.belly[1]} />
        </radialGradient>
        <radialGradient id={g("eye")} cx="45%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#3b3160" />
          <stop offset="70%" stopColor="#16122b" />
        </radialGradient>
        <linearGradient id={g("leaf")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={dead ? "#b5b3bc" : "#9be27a"} />
          <stop offset="100%" stopColor={dead ? "#8a8794" : "#4fa35a"} />
        </linearGradient>
        <radialGradient id={g("petal")} cx="50%" cy="80%" r="80%">
          <stop offset="0%" stopColor="#fff0f6" />
          <stop offset="100%" stopColor="#ff9ec4" />
        </radialGradient>
        <filter id={g("soft")} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>

      <ellipse cx="120" cy="223" rx={baby ? 56 : 66} ry="7" fill="var(--pet-ink)" opacity="0.12" />

      <g className={dead ? undefined : "pet-body"}>
        <g transform={bodyT}>
          {/* feet */}
          <ellipse cx="92" cy="211" rx="17" ry="10" fill={c.dark} />
          <ellipse cx="148" cy="211" rx="17" ry="10" fill={c.dark} />

          {/* arms (bloom and up) */}
          {hasArms && (
            <>
              <ellipse cx="38" cy="160" rx="13" ry="18" fill={c.mid} transform="rotate(28 38 160)" />
              <ellipse cx="202" cy="160" rx="13" ry="18" fill={c.mid} transform="rotate(-28 202 160)" />
            </>
          )}

          {/* species head features (behind the body) */}
          {species === "neko" && (
            <g fill={c.mid}>
              <path d="M52 92L60 34l44 32z" /><path d="M188 92l-8-58-44 32z" />
              <path d="M64 78l5-30 22 18z" fill="#ffb0b8" /><path d="M176 78l-5-30-22 18z" fill="#ffb0b8" />
            </g>
          )}
          {species === "bun" && (
            <g className={dead ? undefined : "pet-sprout"}>
              <ellipse cx="88" cy="40" rx="17" ry="44" fill={c.mid} transform="rotate(-14 88 40)" />
              <ellipse cx="152" cy="40" rx="17" ry="44" fill={c.mid} transform="rotate(14 152 40)" />
              <ellipse cx="88" cy="42" rx="8" ry="30" fill="#ffc7d6" transform="rotate(-14 88 42)" />
              <ellipse cx="152" cy="42" rx="8" ry="30" fill="#ffc7d6" transform="rotate(14 152 42)" />
            </g>
          )}
          {species === "kumo" && (
            <g fill={c.light}>
              <circle cx="84" cy="66" r="24" /><circle cx="120" cy="52" r="28" /><circle cx="156" cy="66" r="24" />
            </g>
          )}

          {/* body: a chibi dumpling */}
          <path d="M120 52c56 0 90 42 90 94 0 46-36 72-90 72s-90-26-90-72c0-52 34-94 90-94z" fill={`url(#${g("body")})`} />
          <ellipse cx="120" cy="176" rx="46" ry="32" fill={`url(#${g("belly")})`} />
          {/* gloss */}
          <ellipse cx="84" cy="86" rx="24" ry="12" fill="#fff" opacity="0.5" transform="rotate(-30 84 86)" filter={`url(#${g("soft")})`} />
          <ellipse cx="76" cy="90" rx="7" ry="4.5" fill="#fff" opacity="0.9" transform="rotate(-30 76 90)" />
        </g>

        {/* sprout and crown */}
        <g className={dead ? undefined : "pet-sprout"} transform={baby ? "translate(0 26)" : undefined}>
          {sprouty && (
            <>
              <path d="M121 56c0-12 1-20 4-28" stroke={dead ? "#8a8794" : "#3f8a48"} strokeWidth="5" strokeLinecap="round" fill="none" />
              <path d="M125 30c11-16 34-18 42-10-6 16-28 22-42 10z" fill={`url(#${g("leaf")})`} />
              {!baby && <path d="M123 34c-9-14-28-16-34-8 6 13 21 17 34 8z" fill={`url(#${g("leaf")})`} />}
            </>
          )}
          {species === "pip" && (
            <g fill={c.dark}>
              <path d="M120 58c-4-16 0-28 10-34-2 10 0 20-4 34z" /><path d="M116 58c-10-12-10-24-4-32 2 10 6 18 8 32z" />
            </g>
          )}
          {stage === "bloom" && <circle cx={sprouty ? 125 : 150} cy={sprouty ? 24 : 58} r="9" fill={`url(#${g("petal")})`} />}
          {stage === "blossom" && (
            <g transform={sprouty ? "translate(125 20)" : "translate(152 56) scale(0.8)"}>
              {[0, 72, 144, 216, 288].map((a) => (
                <ellipse key={a} cx="0" cy="-11" rx="8" ry="12" fill={`url(#${g("petal")})`} transform={`rotate(${a})`} />
              ))}
              <circle r="7" fill="#ffd66b" />
            </g>
          )}
        </g>

        <g transform={bodyT}>
          {/* face */}
          {dead ? (
            <g stroke="var(--pet-ink)" strokeWidth="6" strokeLinecap="round">
              <path d="M82 118l16 16M98 118l-16 16" />
              <path d="M142 118l16 16M158 118l-16 16" />
            </g>
          ) : mood === "happy" ? (
            <g stroke="#1d1836" strokeWidth="6.5" strokeLinecap="round" fill="none">
              <path d="M79 130c7-12 22-12 29 0" />
              <path d="M132 130c7-12 22-12 29 0" />
            </g>
          ) : (
            [92, 148].map((cx) => (
              <g key={cx} className="pet-eye">
                <ellipse cx={cx} cy="124" rx="17" ry={mood === "focused" ? 15 : 20} fill={`url(#${g("eye")})`} />
                <circle cx={cx + 5 + look.x} cy={115 + look.y} r="6.5" fill="#fff" />
                <circle cx={cx - 6 + look.x * 0.6} cy={132 + look.y * 0.6} r="3" fill="#fff" opacity="0.85" />
                <path d={`M${cx - 10} ${136} q10 6 20 0`} stroke="#6e5fb8" strokeOpacity="0.5" strokeWidth="2.5" fill="none" strokeLinecap="round" />
              </g>
            ))
          )}

          {/* blush with little lines */}
          {!dead && (
            <g>
              <ellipse cx="64" cy="150" rx="14" ry="8" fill="#ff8fa3" opacity="0.65" filter={`url(#${g("soft")})`} />
              <ellipse cx="176" cy="150" rx="14" ry="8" fill="#ff8fa3" opacity="0.65" filter={`url(#${g("soft")})`} />
              <g stroke="#ff6f86" strokeWidth="2.5" strokeLinecap="round" opacity="0.8">
                <path d="M57 150l4-5M64 151l4-5M71 150l4-5" />
                <path d="M169 150l4-5M176 151l4-5M183 150l4-5" />
              </g>
            </g>
          )}

          {/* mouth */}
          {dead ? (
            <path d="M110 160h20" stroke="var(--pet-ink)" strokeWidth="5" strokeLinecap="round" />
          ) : mood === "hungry" ? (
            <ellipse cx="120" cy="158" rx="8" ry="10" fill="#1d1836" />
          ) : mood === "focused" ? (
            <path d="M113 156q7 4 14 0" stroke="#1d1836" strokeWidth="5" strokeLinecap="round" fill="none" />
          ) : species === "pip" ? (
            <path d="M110 148l10 12 10-12z" fill="#ff9a3c" stroke="#e07a1f" strokeWidth="2" strokeLinejoin="round" />
          ) : (
            <g>
              <path d="M104 150q8 12 16 0q8 12 16 0" stroke="#1d1836" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              {mood === "happy" && <ellipse cx="120" cy="157" rx="6" ry="4" fill="#ff6f86" />}
            </g>
          )}

          {mood === "hungry" && <path d="M188 92c6 10 8 15 8 18a8 8 0 01-16 0c0-3 2-8 8-18z" fill="#8fd0f5" />}
        </g>
      </g>

      {/* floating heart when happy */}
      {mood === "happy" && (
        <path className="pet-heart" d="M200 60c-4-8-16-6-16 3 0 7 10 12 16 17 6-5 16-10 16-17 0-9-12-11-16-3z" fill="#ff7a93" />
      )}
    </svg>
  );
}
