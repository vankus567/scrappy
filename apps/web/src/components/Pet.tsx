"use client";

import { useEffect, useId, useRef, useState } from "react";

export type PetMood = "happy" | "curious" | "focused" | "hungry" | "dead";
/** Evolution forms, unlocked by real work (see stageFor in pet-store). */
export type PetStage = "sprout" | "mochi" | "bloom" | "blossom";
export type Species = "mochi" | "neko" | "bun" | "kumo" | "pip" | "zap" | "kitsu" | "pengu" | "drako" | "goo";

type SpeciesDef = {
  name: string;
  blurb: string;
  light: string;
  mid: string;
  dark: string;
  belly: [string, string];
  /** detail colour: sprout, ear insides, spikes, tail tips */
  detail: string;
  mouth?: "cat" | "beak";
  feet?: boolean;
};

/** Original chibi designs in the site palette (snow, silver, graphite, sky, Apple blue). */
export const SPECIES: Record<Species, SpeciesDef> = {
  mochi: { name: "Mochi", blurb: "Snow dumpling", light: "#ffffff", mid: "#eef0f5", dark: "#c7c9d1", belly: ["#ffffff", "#f1f3f8"], detail: "#007aff" },
  neko: { name: "Neko", blurb: "Graphite kitten", light: "#6e6e73", mid: "#48484a", dark: "#2c2c2e", belly: ["#ffffff", "#e5e5ea"], detail: "#ff9fb4" },
  bun: { name: "Bun", blurb: "Silver bunny", light: "#f2f2f7", mid: "#d1d1d6", dark: "#aeaeb2", belly: ["#ffffff", "#f2f2f7"], detail: "#7cc0ff" },
  kumo: { name: "Kumo", blurb: "Cloud puff", light: "#dcefff", mid: "#9fd0ff", dark: "#5aa9ff", belly: ["#ffffff", "#e6f3ff"], detail: "#ffffff" },
  pip: { name: "Pip", blurb: "Sky chick", light: "#cfe7ff", mid: "#7cc0ff", dark: "#3d9bff", belly: ["#ffffff", "#e6f3ff"], detail: "#3d9bff", mouth: "beak" },
  zap: { name: "Zap", blurb: "Spark critter", light: "#5aa9ff", mid: "#0a84ff", dark: "#0060cc", belly: ["#ffffff", "#dbeeff"], detail: "#ffffff" },
  kitsu: { name: "Kitsu", blurb: "Spirit fox", light: "#ffffff", mid: "#f2f2f7", dark: "#c7c7cc", belly: ["#ffffff", "#ffffff"], detail: "#007aff" },
  pengu: { name: "Pengu", blurb: "Little penguin", light: "#48484a", mid: "#2c2c2e", dark: "#1d1d1f", belly: ["#ffffff", "#e5e5ea"], detail: "#ffb14a", mouth: "beak" },
  drako: { name: "Drako", blurb: "Baby dragon", light: "#e5e5ea", mid: "#aeaeb2", dark: "#8e8e93", belly: ["#ffffff", "#e5e5ea"], detail: "#007aff" },
  goo: { name: "Goo", blurb: "Jelly drop", light: "#cfe9ff", mid: "#7cc0ff", dark: "#3d9bff", belly: ["#ffffff", "#ffffff"], detail: "#ffffff", feet: false },
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
const BODY = "M120 52c56 0 90 42 90 94 0 46-36 72-90 72s-90-26-90-72c0-52 34-94 90-94z";
const DROP = "M120 34c30 34 90 62 90 112 0 46-36 72-90 72s-90-26-90-72c0-50 60-78 90-112z";

/**
 * A squishy chibi creature. Big sparkly eyes, glossy body, blush, one signature detail per species.
 * Each evolution adds arms and a bud/flower. Always visible; motion only animates what is on screen.
 */
export function Pet({ mood = "happy", stage = "mochi", species = "mochi", watchPointer = false, className, title = "A Scrappy pet" }: PetProps) {
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
  const detail = dead ? "#9d99a8" : sp.detail;
  const g = (n: string) => `${n}-${uid}`;
  const baby = stage === "sprout";
  const hasArms = stage === "bloom" || stage === "blossom" || species === "pengu";
  const bodyT = baby ? "translate(12 30) scale(0.9 0.86)" : undefined;
  const isGoo = species === "goo";
  const darkBody = species === "neko" || species === "pengu";
  const faceInk = darkBody && !dead ? "#1d1d1f" : "#1d1836";
  const crownOnSprout = species === "mochi";

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
          <stop offset="0%" stopColor={darkBody ? "#2b5f9e" : "#3b3160"} />
          <stop offset="70%" stopColor="#101226" />
        </radialGradient>
        <linearGradient id={g("leaf")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={dead ? "#b5b3bc" : "#7cc0ff"} />
          <stop offset="100%" stopColor={dead ? "#8a8794" : "#007aff"} />
        </linearGradient>
        <radialGradient id={g("petal")} cx="50%" cy="80%" r="80%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#ff9ec4" />
        </radialGradient>
        <filter id={g("soft")} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>

      <ellipse cx="120" cy="223" rx={baby ? 56 : 66} ry="7" fill="#1d1d1f" opacity="0.12" />

      <g className={dead ? undefined : "pet-body"}>
        <g transform={bodyT}>
          {/* tails, behind everything */}
          {species === "zap" && (
            <path d="M196 170l26-30-16-4 22-34-40 26 14 6-28 28z" fill={detail} stroke={c.dark} strokeWidth="4" strokeLinejoin="round" />
          )}
          {species === "kitsu" && (
            <g className={dead ? undefined : "pet-sprout"}>
              <path d="M186 186c30-6 46-40 36-70-6 18-22 26-36 26 4 16 4 30 0 44z" fill={c.mid} stroke={c.dark} strokeWidth="3" />
              <path d="M222 116c-4 12-12 20-22 24 8-10 14-22 16-38 4 4 6 9 6 14z" fill={detail} />
            </g>
          )}
          {species === "drako" && (
            <g fill={dead ? "#c3c0cc" : "#d1d1d6"} stroke={c.dark} strokeWidth="3" strokeLinejoin="round">
              <path d="M40 130c-24-12-34-34-30-50 12 10 26 12 40 14z" />
              <path d="M200 130c24-12 34-34 30-50-12 10-26 12-40 14z" />
            </g>
          )}

          {/* feet */}
          {sp.feet !== false && (
            <>
              <ellipse cx="92" cy="211" rx="17" ry="10" fill={species === "pengu" ? detail : c.dark} />
              <ellipse cx="148" cy="211" rx="17" ry="10" fill={species === "pengu" ? detail : c.dark} />
            </>
          )}

          {/* arms / flippers */}
          {hasArms && (
            <>
              <ellipse cx="38" cy="160" rx="13" ry="20" fill={c.mid} transform="rotate(28 38 160)" />
              <ellipse cx="202" cy="160" rx="13" ry="20" fill={c.mid} transform="rotate(-28 202 160)" />
            </>
          )}

          {/* head features behind the body */}
          {(species === "neko" || species === "kitsu" || species === "zap") && (
            <g fill={c.mid}>
              {species === "kitsu" ? (
                <>
                  <path d="M50 96L56 22l52 42z" /><path d="M190 96l-6-74-52 42z" />
                  <path d="M62 80l3-40 26 22z" fill={detail} /><path d="M178 80l-3-40-26 22z" fill={detail} />
                </>
              ) : species === "zap" ? (
                <>
                  <ellipse cx="72" cy="56" rx="16" ry="32" transform="rotate(-24 72 56)" />
                  <ellipse cx="168" cy="56" rx="16" ry="32" transform="rotate(24 168 56)" />
                  <ellipse cx="66" cy="38" rx="9" ry="12" fill={detail} transform="rotate(-24 66 38)" />
                  <ellipse cx="174" cy="38" rx="9" ry="12" fill={detail} transform="rotate(24 174 38)" />
                </>
              ) : (
                <>
                  <path d="M52 92L60 34l44 32z" /><path d="M188 92l-8-58-44 32z" />
                  <path d="M64 78l5-30 22 18z" fill={detail} /><path d="M176 78l-5-30-22 18z" fill={detail} />
                </>
              )}
            </g>
          )}
          {species === "bun" && (
            <g className={dead ? undefined : "pet-sprout"}>
              <ellipse cx="88" cy="40" rx="17" ry="44" fill={c.mid} transform="rotate(-14 88 40)" />
              <ellipse cx="152" cy="40" rx="17" ry="44" fill={c.mid} transform="rotate(14 152 40)" />
              <ellipse cx="88" cy="42" rx="8" ry="30" fill={detail} transform="rotate(-14 88 42)" />
              <ellipse cx="152" cy="42" rx="8" ry="30" fill={detail} transform="rotate(14 152 42)" />
            </g>
          )}
          {species === "kumo" && (
            <g fill={c.light}>
              <circle cx="84" cy="66" r="24" /><circle cx="120" cy="52" r="28" /><circle cx="156" cy="66" r="24" />
            </g>
          )}
          {species === "drako" && (
            <g fill={detail}>
              <path d="M96 60l10-22 10 20z" /><path d="M114 54l10-26 10 24z" /><path d="M134 60l10-22 10 20z" />
            </g>
          )}

          {/* body */}
          <path d={isGoo ? DROP : BODY} fill={`url(#${g("body")})`} opacity={isGoo && !dead ? 0.92 : 1} />
          {species === "pengu" ? (
            <path d="M120 84c34 0 56 28 56 64 0 38-24 60-56 60s-56-22-56-60c0-36 22-64 56-64z" fill={`url(#${g("belly")})`} />
          ) : !isGoo ? (
            <ellipse cx="120" cy="176" rx="46" ry="32" fill={`url(#${g("belly")})`} />
          ) : null}
          {/* gloss */}
          <ellipse cx="84" cy="92" rx="24" ry="12" fill="#fff" opacity={isGoo ? 0.7 : 0.5} transform="rotate(-30 84 92)" filter={`url(#${g("soft")})`} />
          <ellipse cx="76" cy="96" rx="7" ry="4.5" fill="#fff" opacity="0.9" transform="rotate(-30 76 96)" />
          {isGoo && <ellipse cx="160" cy="190" rx="10" ry="5" fill="#fff" opacity="0.5" />}
        </g>

        {/* sprout (mochi) / tuft (pip) and the evolution crown */}
        <g className={dead ? undefined : "pet-sprout"} transform={baby ? "translate(0 26)" : undefined}>
          {species === "mochi" && (
            <>
              <path d="M121 56c0-12 1-20 4-28" stroke={dead ? "#8a8794" : "#0a6de6"} strokeWidth="5" strokeLinecap="round" fill="none" />
              <path d="M125 30c11-16 34-18 42-10-6 16-28 22-42 10z" fill={`url(#${g("leaf")})`} />
              {!baby && <path d="M123 34c-9-14-28-16-34-8 6 13 21 17 34 8z" fill={`url(#${g("leaf")})`} />}
            </>
          )}
          {species === "pip" && (
            <g fill={c.dark}>
              <path d="M120 58c-4-16 0-28 10-34-2 10 0 20-4 34z" /><path d="M116 58c-10-12-10-24-4-32 2 10 6 18 8 32z" />
            </g>
          )}
          {species === "goo" && <circle cx="120" cy="34" r="6" fill={c.light} />}
          {stage === "bloom" && <circle cx={crownOnSprout ? 125 : 150} cy={crownOnSprout ? 24 : 60} r="9" fill={`url(#${g("petal")})`} />}
          {stage === "blossom" && (
            <g transform={crownOnSprout ? "translate(125 20)" : "translate(152 58) scale(0.8)"}>
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
            <g stroke="#1d1d1f" strokeWidth="6" strokeLinecap="round">
              <path d="M82 118l16 16M98 118l-16 16" />
              <path d="M142 118l16 16M158 118l-16 16" />
            </g>
          ) : mood === "happy" ? (
            <g stroke={faceInk} strokeWidth="6.5" strokeLinecap="round" fill="none">
              <path d="M79 130c7-12 22-12 29 0" />
              <path d="M132 130c7-12 22-12 29 0" />
            </g>
          ) : (
            [92, 148].map((cx) => (
              <g key={cx} className="pet-eye">
                <ellipse cx={cx} cy="124" rx="17" ry={mood === "focused" ? 15 : 20} fill={`url(#${g("eye")})`} />
                <circle cx={cx + 5 + look.x} cy={115 + look.y} r="6.5" fill="#fff" />
                <circle cx={cx - 6 + look.x * 0.6} cy={132 + look.y * 0.6} r="3" fill="#fff" opacity="0.85" />
                <path d={`M${cx - 10} 136 q10 6 20 0`} stroke="#7cc0ff" strokeOpacity="0.6" strokeWidth="2.5" fill="none" strokeLinecap="round" />
              </g>
            ))
          )}

          {/* blush */}
          {!dead && (
            <g>
              <ellipse cx="64" cy="150" rx="14" ry="8" fill="#ff8fa3" opacity="0.6" filter={`url(#${g("soft")})`} />
              <ellipse cx="176" cy="150" rx="14" ry="8" fill="#ff8fa3" opacity="0.6" filter={`url(#${g("soft")})`} />
              <g stroke="#ff6f86" strokeWidth="2.5" strokeLinecap="round" opacity="0.75">
                <path d="M57 150l4-5M64 151l4-5M71 150l4-5" />
                <path d="M169 150l4-5M176 151l4-5M183 150l4-5" />
              </g>
            </g>
          )}

          {/* mouth */}
          {dead ? (
            <path d="M110 160h20" stroke="#1d1d1f" strokeWidth="5" strokeLinecap="round" />
          ) : sp.mouth === "beak" ? (
            <path d="M110 148l10 12 10-12z" fill="#ffb14a" stroke="#e08a1f" strokeWidth="2" strokeLinejoin="round" />
          ) : mood === "hungry" ? (
            <ellipse cx="120" cy="158" rx="8" ry="10" fill="#1d1836" />
          ) : mood === "focused" ? (
            <path d="M113 156q7 4 14 0" stroke="#1d1836" strokeWidth="5" strokeLinecap="round" fill="none" />
          ) : (
            <g>
              <path d="M104 150q8 12 16 0q8 12 16 0" stroke="#1d1836" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              {mood === "happy" && <ellipse cx="120" cy="157" rx="6" ry="4" fill="#ff6f86" />}
            </g>
          )}

          {mood === "hungry" && <path d="M188 92c6 10 8 15 8 18a8 8 0 01-16 0c0-3 2-8 8-18z" fill="#7cc0ff" />}
        </g>
      </g>

      {mood === "happy" && (
        <path className="pet-heart" d="M200 60c-4-8-16-6-16 3 0 7 10 12 16 17 6-5 16-10 16-17 0-9-12-11-16-3z" fill="#ff7a93" />
      )}
    </svg>
  );
}
