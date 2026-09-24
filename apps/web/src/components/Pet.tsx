"use client";

import { useEffect, useId, useRef, useState } from "react";

export type PetMood = "happy" | "curious" | "focused" | "hungry" | "dead";

type PetProps = {
  mood?: PetMood;
  /** Eyes follow the pointer (off under reduced motion). */
  watchPointer?: boolean;
  className?: string;
  title?: string;
  /** Body colour override, used for friends' pets on the map. */
  tint?: { light: string; mid: string; dark: string };
};

const CORAL = { light: "#ff9a6b", mid: "#ef6a3d", dark: "#b8441f" };
const STONE = { light: "#d6d0c7", mid: "#b9b2a8", dark: "#8c857b" };

/**
 * Mochi: a soft, glossy dumpling with a leaf sprout. Shaded with gradients so it reads
 * as a squishy 3D toy. Always visible; motion only animates what is already on screen.
 */
export function Pet({ mood = "happy", watchPointer = false, className, title = "Mochi, a Scrappy pet", tint }: PetProps) {
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
        const dy = e.clientY - (box.top + box.height * 0.45);
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
  const hungry = mood === "hungry";
  const c = dead ? STONE : tint ?? CORAL;
  const g = (n: string) => `${n}-${uid}`;

  return (
    <svg ref={ref} viewBox="0 0 240 240" role="img" aria-label={title} className={className}>
      <defs>
        <radialGradient id={g("body")} cx="38%" cy="30%" r="75%">
          <stop offset="0%" stopColor={c.light} />
          <stop offset="55%" stopColor={c.mid} />
          <stop offset="100%" stopColor={c.dark} />
        </radialGradient>
        <radialGradient id={g("belly")} cx="45%" cy="35%" r="70%">
          <stop offset="0%" stopColor={dead ? "#ece8e1" : "#fff1e2"} />
          <stop offset="100%" stopColor={dead ? "#cfc9c0" : "#ffcfa6"} />
        </radialGradient>
        <radialGradient id={g("eye")} cx="40%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#3a2a22" />
          <stop offset="100%" stopColor="#120c09" />
        </radialGradient>
        <linearGradient id={g("leafA")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={dead ? "#a3a394" : "#8fcf6f"} />
          <stop offset="100%" stopColor={dead ? "#7d7d70" : "#4f8a3e"} />
        </linearGradient>
        <filter id={g("soft")} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>

      {/* ground contact shadow */}
      <ellipse cx="122" cy="222" rx="66" ry="7" fill="var(--pet-ink)" opacity="0.14" />

      <g className={dead ? undefined : "pet-body"}>
        {/* feet */}
        <ellipse cx="92" cy="211" rx="18" ry="10" fill={c.dark} />
        <ellipse cx="148" cy="211" rx="18" ry="10" fill={c.dark} />

        {/* body */}
        <path d="M120 56c53 0 86 41 86 90 0 45-35 71-86 71s-86-26-86-71c0-49 33-90 86-90z" fill={`url(#${g("body")})`} />
        {/* belly */}
        <ellipse cx="120" cy="170" rx="47" ry="35" fill={`url(#${g("belly")})`} />
        {/* specular highlights: the gloss */}
        <ellipse cx="86" cy="92" rx="22" ry="11" fill="#fff" opacity="0.45" transform="rotate(-28 86 92)" filter={`url(#${g("soft")})`} />
        <ellipse cx="78" cy="96" rx="6" ry="4" fill="#fff" opacity="0.8" transform="rotate(-28 78 96)" />

        {/* sprout */}
        <g className={dead ? undefined : "pet-sprout"}>
          <path d="M121 58c0-12 1-20 4-28" stroke={dead ? "#6f6f62" : "#3e6b35"} strokeWidth="5" strokeLinecap="round" fill="none" />
          <path d="M125 32c10-15 32-17 40-10-6 15-26 21-40 10z" fill={`url(#${g("leafA")})`} />
          <path d="M123 36c-8-13-26-15-32-8 6 12 20 16 32 8z" fill={`url(#${g("leafA")})`} />
        </g>

        {/* face */}
        {dead ? (
          <g stroke="var(--pet-ink)" strokeWidth="6" strokeLinecap="round">
            <path d="M84 118l16 16M100 118l-16 16" />
            <path d="M140 118l16 16M156 118l-16 16" />
          </g>
        ) : mood === "happy" ? (
          <g stroke="#1b1511" strokeWidth="6" strokeLinecap="round" fill="none">
            <path d="M81 128c6-10 19-10 25 0" />
            <path d="M136 128c6-10 19-10 25 0" />
          </g>
        ) : (
          <g>
            {[93, 149].map((cx) => (
              <g key={cx} className="pet-eye">
                <ellipse cx={cx} cy="124" rx="15" ry={mood === "focused" ? 13 : 17} fill={`url(#${g("eye")})`} />
                <circle cx={cx + 4 + look.x} cy={117 + look.y} r="5.5" fill="#fff" />
                <circle cx={cx - 5 + look.x * 0.6} cy={131 + look.y * 0.6} r="2.5" fill="#fff" opacity="0.7" />
              </g>
            ))}
          </g>
        )}

        {/* cheeks */}
        {!dead && (
          <>
            <ellipse cx="70" cy="148" rx="12" ry="7" fill="#ff8e7a" opacity="0.7" filter={`url(#${g("soft")})`} />
            <ellipse cx="170" cy="148" rx="12" ry="7" fill="#ff8e7a" opacity="0.7" filter={`url(#${g("soft")})`} />
          </>
        )}

        {/* mouth */}
        {dead ? (
          <path d="M110 158h20" stroke="var(--pet-ink)" strokeWidth="5" strokeLinecap="round" />
        ) : hungry ? (
          <ellipse cx="121" cy="157" rx="8" ry="10" fill="#1b1511" />
        ) : mood === "focused" ? (
          <path d="M112 156h18" stroke="#1b1511" strokeWidth="5" strokeLinecap="round" />
        ) : (
          <g>
            <path d="M106 150c7 11 23 11 30 0" stroke="#1b1511" strokeWidth="5" strokeLinecap="round" fill="none" />
            <path d="M113 155c4 4 12 4 16 0" stroke="#e8645a" strokeWidth="4" strokeLinecap="round" fill="none" />
          </g>
        )}

        {hungry && <path d="M186 96c6 10 8 15 8 18a8 8 0 01-16 0c0-3 2-8 8-18z" fill="#8fc7e8" />}
      </g>
    </svg>
  );
}
