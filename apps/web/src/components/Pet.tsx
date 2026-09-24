"use client";

import { useEffect, useRef, useState } from "react";

export type PetMood = "happy" | "curious" | "focused" | "hungry" | "dead";

type PetProps = {
  mood?: PetMood;
  /** Eyes follow the pointer (desktop only, off under reduced motion). */
  watchPointer?: boolean;
  className?: string;
  title?: string;
};

/**
 * Mochi: a dumpling-shaped pet with a leaf sprout. Pure SVG, no raster art.
 * Every part is visible by default; motion only animates what is already on screen.
 */
export function Pet({ mood = "happy", watchPointer = false, className, title = "Mochi, a Scrappy pet" }: PetProps) {
  const ref = useRef<SVGSVGElement>(null);
  const [look, setLook] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!watchPointer) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const onMove = (e: PointerEvent) => {
      const box = ref.current?.getBoundingClientRect();
      if (!box) return;
      const dx = e.clientX - (box.left + box.width / 2);
      const dy = e.clientY - (box.top + box.height * 0.45);
      const d = Math.hypot(dx, dy) || 1;
      const reach = Math.min(1, d / 400);
      setLook({ x: (dx / d) * 5 * reach, y: (dy / d) * 4 * reach });
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [watchPointer]);

  const dead = mood === "dead";
  const hungry = mood === "hungry";
  const body = dead ? "#b9b2a8" : "var(--pet)";
  const shade = dead ? "#948d83" : "var(--pet-shade)";
  const belly = dead ? "#d8d3cb" : "var(--pet-belly)";

  return (
    <svg ref={ref} viewBox="0 0 240 240" role="img" aria-label={title} className={className}>
      {/* ground shadow: tight and directional */}
      <ellipse cx="124" cy="222" rx="70" ry="7" fill="var(--pet-ink)" opacity="0.13" />

      <g className={dead ? undefined : "pet-body"}>
        {/* feet */}
        <ellipse cx="92" cy="212" rx="17" ry="9" fill={shade} />
        <ellipse cx="148" cy="212" rx="17" ry="9" fill={shade} />

        {/* body */}
        <path
          d="M120 58c52 0 84 40 84 88 0 44-34 70-84 70s-84-26-84-70c0-48 32-88 84-88z"
          fill={body}
        />
        {/* right-side shade for form */}
        <path d="M176 84c20 18 28 40 28 62 0 44-34 70-84 70 38-10 64-40 64-80 0-20-3-37-8-52z" fill={shade} opacity="0.55" />
        {/* belly */}
        <ellipse cx="118" cy="170" rx="46" ry="34" fill={belly} />
        {/* top-lip light */}
        <path d="M78 86c12-12 28-18 44-18" stroke="#fff" strokeOpacity="0.45" strokeWidth="6" strokeLinecap="round" fill="none" />

        {/* sprout */}
        <g className={dead ? undefined : "pet-sprout"}>
          <path d="M121 60c0-12 1-20 4-28" stroke="#3e6b35" strokeWidth="5" strokeLinecap="round" fill="none" />
          <path d="M125 34c10-14 30-16 38-10-6 14-24 20-38 10z" fill={dead ? "#8a8a7a" : "#5f9b4c"} />
          <path d="M123 38c-8-12-24-14-30-8 6 11 19 15 30 8z" fill={dead ? "#9a9a8a" : "#7fb865"} />
        </g>

        {/* face */}
        {dead ? (
          <g stroke="var(--pet-ink)" strokeWidth="6" strokeLinecap="round">
            <path d="M84 116l16 16M100 116l-16 16" />
            <path d="M140 116l16 16M156 116l-16 16" />
          </g>
        ) : mood === "happy" ? (
          <g stroke="var(--pet-ink)" strokeWidth="6" strokeLinecap="round" fill="none">
            <path d="M82 126c5-9 17-9 22 0" />
            <path d="M138 126c5-9 17-9 22 0" />
          </g>
        ) : (
          <g>
            <g className="pet-eye">
              <ellipse cx="93" cy="124" rx="13" ry={mood === "focused" ? 11 : 14} fill="#fff" />
              <circle cx={93 + look.x} cy={125 + look.y} r="7" fill="var(--pet-ink)" />
              <circle cx={96 + look.x} cy={121 + look.y} r="2.4" fill="#fff" />
            </g>
            <g className="pet-eye">
              <ellipse cx="149" cy="124" rx="13" ry={mood === "focused" ? 11 : 14} fill="#fff" />
              <circle cx={149 + look.x} cy={125 + look.y} r="7" fill="var(--pet-ink)" />
              <circle cx={152 + look.x} cy={121 + look.y} r="2.4" fill="#fff" />
            </g>
          </g>
        )}

        {/* cheeks */}
        {!dead && (
          <>
            <ellipse cx="74" cy="146" rx="10" ry="6" fill="var(--pet-cheek)" opacity="0.8" />
            <ellipse cx="168" cy="146" rx="10" ry="6" fill="var(--pet-cheek)" opacity="0.8" />
          </>
        )}

        {/* mouth */}
        {dead ? (
          <path d="M110 156h20" stroke="var(--pet-ink)" strokeWidth="5" strokeLinecap="round" />
        ) : hungry ? (
          <ellipse cx="121" cy="156" rx="8" ry="10" fill="var(--pet-ink)" />
        ) : mood === "focused" ? (
          <path d="M112 154h18" stroke="var(--pet-ink)" strokeWidth="5" strokeLinecap="round" />
        ) : (
          <path d="M108 150c6 9 20 9 26 0" stroke="var(--pet-ink)" strokeWidth="5" strokeLinecap="round" fill="none" />
        )}

        {/* hungry sweat drop */}
        {hungry && <path d="M184 96c6 10 8 15 8 18a8 8 0 01-16 0c0-3 2-8 8-18z" fill="#8fc7e8" />}
      </g>
    </svg>
  );
}
