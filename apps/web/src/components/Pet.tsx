"use client";

import { useEffect, useId, useRef, useState } from "react";

export type PetMood =
  | "happy" | "curious" | "focused" | "hungry" | "dead"
  | "excited" | "love" | "sleepy" | "surprised" | "wink" | "sad";
export type PetDance = "none" | "bounce" | "wiggle" | "hop" | "wave" | "march";
/** Evolution forms, unlocked by real work (see stageFor in pet-store). */
export type PetStage = "sprout" | "mochi" | "bloom" | "blossom";
export type Species = "mochi" | "neko" | "bun" | "kumo" | "pip" | "zap" | "kitsu" | "pengu" | "drako" | "goo" | "ember" | "boo";

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
  ember: { name: "Ember", blurb: "Fire salamander", light: "#ffb49a", mid: "#ff7a59", dark: "#e0553a", belly: ["#fff4ea", "#ffd9c2"], detail: "#ffc83d" },
  boo: { name: "Boo", blurb: "Little ghost", light: "#ffffff", mid: "#eef1fb", dark: "#c3c9e0", belly: ["#ffffff", "#ffffff"], detail: "#7cc0ff", feet: false },
  goo: { name: "Goo", blurb: "Jelly drop", light: "#cfe9ff", mid: "#7cc0ff", dark: "#3d9bff", belly: ["#ffffff", "#ffffff"], detail: "#ffffff", feet: false },
};

type PetProps = {
  mood?: PetMood;
  stage?: PetStage;
  species?: Species;
  dance?: PetDance;
  watchPointer?: boolean;
  className?: string;
  title?: string;
};

const STONE = { light: "#e2dfe8", mid: "#c3c0cc", dark: "#9d99a8" };
const BODY = "M120 52c56 0 90 42 90 94 0 46-36 72-90 72s-90-26-90-72c0-52 34-94 90-94z";
const GHOST = "M120 52c56 0 90 42 90 94v64c-10 8-20 8-30 0s-20-8-30 0-20 8-30 0-20-8-30 0-20 8-30 0-20-8-30 0v-64c0-52 34-94 90-94z";
const DROP = "M120 34c30 34 90 62 90 112 0 46-36 72-90 72s-90-26-90-72c0-50 60-78 90-112z";

/**
 * A squishy chibi creature. Big sparkly eyes, glossy body, blush, one signature detail per species.
 * Each evolution adds arms and a bud/flower. Always visible; motion only animates what is on screen.
 */
export function Pet({ mood = "happy", stage = "mochi", species = "mochi", dance = "none", watchPointer = false, className, title = "A Scrappy pet" }: PetProps) {
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
  const bigArms = stage === "bloom" || stage === "blossom" || species === "pengu";
  const bodyT = baby ? "translate(12 30) scale(0.9 0.86)" : undefined;
  const isGoo = species === "goo";
  const isBoo = species === "boo";
  const darkBody = species === "neko" || species === "pengu";
  const faceInk = darkBody && !dead ? "#1d1d1f" : "#1d1836";
  const crownOnSprout = species === "mochi";

  return (
    <svg ref={ref} viewBox="0 0 240 240" overflow="visible" role="img" aria-label={title} className={className}>
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

      <ellipse cx="120" cy="229" rx={baby ? 56 : 66} ry="6" fill="#1d1d1f" opacity="0.12" />

      <g className={dead || dance === "none" ? undefined : `pet-dance-${dance}`}>
      <g className={dead ? undefined : isBoo ? "pet-body pet-ghost" : "pet-body"}>
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

          {species === "ember" && (
            <g>
              <path d="M186 192c26 0 40-16 42-36" fill="none" stroke={c.mid} strokeWidth="16" strokeLinecap="round" />
              {!dead && (
                <g className="pet-flame">
                  <path d="M228 158c-14-6-18-22-10-38 2 10 8 14 14 14-4-12 0-24 10-30-2 14 8 22 6 36-2 12-10 20-20 18z" fill="#ffc83d" />
                  <path d="M228 152c-6-4-8-12-4-20 2 6 6 8 10 8-2 6 0 12-6 12z" fill="#fff3c4" />
                </g>
              )}
            </g>
          )}
          {/* species evolution, back layer */}
          {!dead && species === "neko" && (stage === "bloom" || stage === "blossom") && (
            <g fill="none" stroke={c.mid} strokeWidth="12" strokeLinecap="round">
              <path d="M188 196c26-2 38-24 30-46" /><path d="M52 196c-26-2-38-24-30-46" />
            </g>
          )}
          {!dead && species === "zap" && (stage === "bloom" || stage === "blossom") && (
            <path d="M44 170l-26-30 16-4-22-34 40 26-14 6 28 28z" fill={detail} stroke={c.dark} strokeWidth="4" strokeLinejoin="round" />
          )}
          {!dead && species === "kitsu" && stage === "bloom" && (
            <path d="M54 186c-30-6-46-40-36-70 6 18 22 26 36 26-4 16-4 30 0 44z" fill={c.mid} stroke={c.dark} strokeWidth="3" />
          )}
          {!dead && species === "kitsu" && stage === "blossom" && (
            <g>
              {[-60, -30, 30, 60].map((a) => (
                <path key={a} d="M120 190c-8-40 0-80 14-110 4 30 0 70-14 110z" fill={c.mid} stroke={c.dark} strokeWidth="3" transform={`rotate(${a} 120 190)`} />
              ))}
            </g>
          )}
          {!dead && (species === "pip" || species === "drako") && (stage === "bloom" || stage === "blossom") && (
            <g fill={species === "pip" ? c.light : "#d1d1d6"} stroke={c.dark} strokeWidth="3" strokeLinejoin="round">
              <path d="M40 140c-30-14-40-44-32-64 14 14 30 18 48 20z" />
              <path d="M200 140c30-14 40-44 32-64-14 14-30 18-48 20z" />
            </g>
          )}

          {/* feet */}

          {/* arms / flippers */}

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
          <path d={isGoo ? DROP : isBoo ? GHOST : BODY} fill={`url(#${g("body")})`} opacity={(isGoo || isBoo) && !dead ? 0.9 : 1} />
          {species === "pengu" ? (
            <path d="M120 84c34 0 56 28 56 64 0 38-24 60-56 60s-56-22-56-60c0-36 22-64 56-64z" fill={`url(#${g("belly")})`} />
          ) : !isGoo && !isBoo ? (
            <ellipse cx="120" cy="176" rx="46" ry="32" fill={`url(#${g("belly")})`} />
          ) : null}
          {/* gloss */}
          <ellipse cx="84" cy="92" rx="24" ry="12" fill="#fff" opacity={isGoo ? 0.7 : 0.5} transform="rotate(-30 84 92)" filter={`url(#${g("soft")})`} />
          <ellipse cx="76" cy="96" rx="7" ry="4.5" fill="#fff" opacity="0.9" transform="rotate(-30 76 96)" />
          {isGoo && <ellipse cx="160" cy="190" rx="10" ry="5" fill="#fff" opacity="0.5" />}
          {/* species evolution, front layer */}
          {!dead && species === "neko" && stage === "blossom" && (
            <path d="M126 70a16 16 0 1 0 0 28 12 12 0 1 1 0-28z" fill="#ffd66b" />
          )}
          {!dead && species === "bun" && stage === "bloom" && (
            <g fill="#7cc0ff">{[[146, 58], [158, 58], [152, 48]].map(([x, y]) => <circle key={x + "-" + y} cx={x} cy={y} r="7" />)}</g>
          )}
          {!dead && species === "bun" && stage === "blossom" && (
            <g><path d="M92 6a14 14 0 1 0 0 24 10 10 0 1 1 0-24z" fill="#ffd66b" /><path d="M160 22l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill="#ffd66b" /></g>
          )}
          {!dead && species === "kumo" && (stage === "bloom" || stage === "blossom") && (
            <g fill="#7cc0ff">
              <path d="M52 200c4 7 6 11 6 13a6 6 0 01-12 0c0-2 2-6 6-13z" /><path d="M190 196c4 7 6 11 6 13a6 6 0 01-12 0c0-2 2-6 6-13z" />
            </g>
          )}
          {!dead && species === "kumo" && stage === "blossom" && (
            <path d="M124 76l-14 18h10l-6 16 16-20h-10l6-14z" fill="#ffd66b" />
          )}
          {!dead && species === "pip" && stage === "sprout" && (
            <path d="M84 70l10-10 10 10 10-10 10 10 10-10 10 10 10-10 6 8c-8-22-26-34-46-34s-40 12-46 34z" fill="#fffaf0" stroke="#d1d1d6" strokeWidth="2" />
          )}
          {!dead && species === "pip" && stage === "blossom" && (
            <g fill="#007aff">{[-16, 0, 16].map((a) => <ellipse key={a} cx="120" cy="30" rx="6" ry="20" transform={`rotate(${a} 120 56)`} />)}</g>
          )}
          {!dead && species === "zap" && stage === "blossom" && (
            <g fill="#ffd66b">{[96, 120, 144].map((x) => <path key={x} d={`M${x + 2} 30l-8 14h6l-4 12 10-16h-6l4-10z`} />)}</g>
          )}
          {!dead && species === "pengu" && (stage === "bloom" || stage === "blossom") && (
            <g fill="#007aff"><rect x="64" y="166" width="112" height="14" rx="7" /><rect x="140" y="170" width="14" height="34" rx="7" /></g>
          )}
          {!dead && species === "pengu" && stage === "sprout" && (
            <g fill="#8e8e93">{[106, 120, 134].map((x) => <circle key={x} cx={x} cy="56" r="8" />)}</g>
          )}
          {!dead && (species === "pengu" || species === "goo") && stage === "blossom" && (
            <path d="M92 50l8-26 20 16 20-16 8 26z" fill="#ffd66b" stroke="#e0a800" strokeWidth="2" strokeLinejoin="round" />
          )}
          {!dead && species === "drako" && stage === "sprout" && (
            <path d="M40 176l14 10 14-10 14 10 14-10 14 10 14-10 14 10 14-10 14 10 14-10 14 10 14-10v50H40z" fill="#fffaf0" stroke="#d1d1d6" strokeWidth="2" />
          )}
          {!dead && species === "drako" && stage === "blossom" && (
            <g fill="#f5f5f7" stroke="#8e8e93" strokeWidth="2"><path d="M86 64c-10-14-8-30 2-40 0 14 6 24 14 30z" /><path d="M154 64c10-14 8-30-2-40 0 14-6 24-14 30z" /></g>
          )}
          {!dead && species === "goo" && (stage === "bloom" || stage === "blossom") && (
            <g fill="#fff" opacity="0.55"><circle cx="150" cy="176" r="8" /><circle cx="94" cy="190" r="5" /><circle cx="162" cy="150" r="4" /></g>
          )}

          {!dead && species === "ember" && (stage === "bloom" || stage === "blossom") && (
            <g className="pet-flame">
              {(stage === "blossom" ? [100, 120, 140] : [120]).map((x) => (
                <path key={x} d={`M${x} 58c-10-6-12-18-6-28 2 6 6 9 10 9-2-8 2-16 8-20-2 10 6 16 4 26-2 8-8 14-16 13z`} fill="#ffc83d" />
              ))}
            </g>
          )}
          {!dead && species === "boo" && (stage === "bloom" || stage === "blossom") && (
            <g className="pet-orbit" fill="#7cc0ff" opacity="0.8">
              <circle cx="30" cy="96" r="9" /><circle cx="214" cy="110" r="7" /><circle cx="200" cy="54" r="5" />
            </g>
          )}
          {!dead && species === "boo" && stage === "blossom" && (
            <path d="M92 50l8-26 20 16 20-16 8 26z" fill="#ffd66b" stroke="#e0a800" strokeWidth="2" strokeLinejoin="round" />
          )}

          {/* limbs in front of the body */}
          {sp.feet !== false &&
            ([
              ["pet-leg-l", 92],
              ["pet-leg-r", 148],
            ] as const).map(([cls, x]) => (
              <g key={cls} className={dead ? undefined : cls}>
                <rect x={x - 11} y="198" width="22" height="24" rx="11" fill={c.mid} />
                <ellipse cx={x} cy="222" rx="16" ry="8" fill={species === "pengu" ? detail : c.dark} />
                <ellipse cx={x - 5} cy="219" rx="5" ry="2.5" fill="#fff" opacity="0.35" />
              </g>
            ))}
          <g className={dead ? undefined : "pet-arm-l"}>
            <ellipse cx="46" cy="164" rx={bigArms ? 13 : 10} ry={bigArms ? 21 : 15} fill={c.mid} stroke={c.dark} strokeOpacity="0.25" strokeWidth="2" transform="rotate(28 46 164)" />
            <ellipse cx="40" cy="178" rx="5" ry="3" fill="#fff" opacity="0.3" />
          </g>
          <g className={dead ? undefined : "pet-arm-r"}>
            <ellipse cx="194" cy="164" rx={bigArms ? 13 : 10} ry={bigArms ? 21 : 15} fill={c.mid} stroke={c.dark} strokeOpacity="0.25" strokeWidth="2" transform="rotate(-28 194 164)" />
            <ellipse cx="200" cy="178" rx="5" ry="3" fill="#fff" opacity="0.3" />
          </g>
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
          {stage === "bloom" && crownOnSprout && <circle cx={crownOnSprout ? 125 : 150} cy={crownOnSprout ? 24 : 60} r="9" fill={`url(#${g("petal")})`} />}
          {stage === "blossom" && crownOnSprout && (
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
          ) : mood === "excited" ? (
            <g fill="#ffcc33" stroke="#e0a800" strokeWidth="2" strokeLinejoin="round">
              {[92, 148].map((x) => (
                <path key={x} d={`M${x} 106l5.5 11.5 12.5 1.8-9 8.8 2.1 12.4L${x} 134.6l-11.1 5.9 2.1-12.4-9-8.8 12.5-1.8z`} />
              ))}
            </g>
          ) : mood === "love" ? (
            <g fill="#ff5c86">
              {[92, 148].map((x) => (
                <path key={x} d={`M${x} 138c-14-9-20-16-20-23 0-7 5-11 10-11 4 0 8 2 10 6 2-4 6-6 10-6 5 0 10 4 10 11 0 7-6 14-20 23z`} />
              ))}
            </g>
          ) : mood === "sleepy" ? (
            <g>
              <g stroke={faceInk} strokeWidth="6" strokeLinecap="round" fill="none">
                <path d="M80 126c7 6 20 6 26 0" />
                <path d="M134 126c7 6 20 6 26 0" />
              </g>
              <text x="186" y="74" fontSize="26" fontWeight="700" fill="#7cc0ff" fontFamily="var(--font-pally), sans-serif">z</text>
              <text x="204" y="54" fontSize="18" fontWeight="700" fill="#7cc0ff" fontFamily="var(--font-pally), sans-serif">z</text>
            </g>
          ) : mood === "surprised" ? (
            <g>
              {[92, 148].map((x) => (
                <g key={x}>
                  <circle cx={x} cy="124" r="11" fill={`url(#${g("eye")})`} />
                  <circle cx={x + 3} cy="120" r="3.5" fill="#fff" />
                </g>
              ))}
            </g>
          ) : mood === "wink" ? (
            <g>
              <path d="M79 128c7-10 22-10 29 0" stroke={faceInk} strokeWidth="6.5" strokeLinecap="round" fill="none" />
              <ellipse cx="148" cy="124" rx="17" ry="20" fill={`url(#${g("eye")})`} />
              <circle cx="153" cy="115" r="6.5" fill="#fff" />
              <circle cx="142" cy="132" r="3" fill="#fff" opacity="0.85" />
            </g>
          ) : mood === "sad" ? (
            <g>
              {[92, 148].map((x, i) => (
                <g key={x}>
                  <ellipse cx={x} cy="128" rx="15" ry="16" fill={`url(#${g("eye")})`} />
                  <circle cx={x + 4} cy="122" r="5" fill="#fff" />
                  <path d={i === 0 ? "M76 104l26 8" : "M164 104l-26 8"} stroke={faceInk} strokeWidth="4.5" strokeLinecap="round" />
                </g>
              ))}
              <path d="M78 146c4 7 6 11 6 13a6 6 0 01-12 0c0-2 2-6 6-13z" fill="#7cc0ff" />
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
          ) : mood === "excited" || mood === "love" ? (
            <g>
              <path d="M104 148q16 22 32 0z" fill="#1d1836" />
              <ellipse cx="120" cy="158" rx="8" ry="4.5" fill="#ff6f86" />
            </g>
          ) : mood === "surprised" || mood === "sleepy" ? (
            <ellipse cx="120" cy="156" rx={mood === "surprised" ? 8 : 5} ry={mood === "surprised" ? 10 : 5} fill="#1d1836" />
          ) : mood === "sad" ? (
            <path d="M108 160q12-10 24 0" stroke="#1d1836" strokeWidth="5" strokeLinecap="round" fill="none" />
          ) : mood === "hungry" ? (
            <ellipse cx="120" cy="158" rx="8" ry="10" fill="#1d1836" />
          ) : mood === "focused" ? (
            <path d="M113 156q7 4 14 0" stroke="#1d1836" strokeWidth="5" strokeLinecap="round" fill="none" />
          ) : (
            <g>
              <path d="M104 150q8 12 16 0q8 12 16 0" stroke="#1d1836" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              {(mood === "happy" || mood === "wink") && <ellipse cx="120" cy="157" rx="6" ry="4" fill="#ff6f86" />}
            </g>
          )}

          {mood === "hungry" && <path d="M188 92c6 10 8 15 8 18a8 8 0 01-16 0c0-3 2-8 8-18z" fill="#7cc0ff" />}
        </g>
      </g>

      </g>
      {mood === "happy" && (
        <path className="pet-heart" d="M200 60c-4-8-16-6-16 3 0 7 10 12 16 17 6-5 16-10 16-17 0-9-12-11-16-3z" fill="#ff7a93" />
      )}
    </svg>
  );
}
