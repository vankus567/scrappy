"use client";

import { Pet, type PetMood } from "./Pet";

export type RoomLight = "morning" | "afternoon" | "dusk" | "night";

const LIGHT: Record<RoomLight, { sky: string; glow: string; wall: string }> = {
  morning: { sky: "#cfe6d8", glow: "#fff4d6", wall: "var(--ground)" },
  afternoon: { sky: "#e9d8b8", glow: "#ffe1b0", wall: "var(--ground)" },
  dusk: { sky: "#9fa99a", glow: "#c9cdbf", wall: "color-mix(in oklab, var(--ground) 82%, #7f8a78)" },
  night: { sky: "#2a3326", glow: "#4b5645", wall: "var(--night-raise)" },
};

type RoomProps = {
  mood: PetMood;
  light: RoomLight;
  /** 0..1, how full the bowl is */
  food: number;
  className?: string;
};

/**
 * The pet's room: wall, window (its light is the mood), floor, bowl.
 * Depth comes from tone, not shadows. Everything renders without JS.
 */
export function Room({ mood, light, food, className }: RoomProps) {
  const l = LIGHT[light];
  const fill = Math.max(0, Math.min(1, food));

  return (
    <div
      className={`relative isolate overflow-hidden rounded-[28px] ${className ?? ""}`}
      style={{ background: l.wall }}
    >
      {/* window */}
      <svg viewBox="0 0 120 110" aria-hidden className="absolute left-[8%] top-[9%] w-[26%] max-w-[150px]">
        <rect x="4" y="4" width="112" height="102" rx="18" fill="var(--ground-deep)" />
        <rect x="12" y="12" width="96" height="86" rx="12" fill={l.sky} />
        <circle cx="82" cy="36" r="12" fill={l.glow} />
        <path d="M60 12v86M12 55h96" stroke="var(--ground-deep)" strokeWidth="6" />
      </svg>

      {/* floor */}
      <div className="absolute inset-x-0 bottom-0 h-[30%] bg-ground-deep" />

      {/* bowl */}
      <svg viewBox="0 0 100 56" role="img" aria-label={`Food bowl ${Math.round(fill * 100)}% full`} className="absolute bottom-[12%] right-[9%] w-[20%] max-w-[120px]">
        <defs>
          <clipPath id="bowl-inside">
            <path d="M10 18h80c0 20-18 32-40 32S10 38 10 18z" />
          </clipPath>
        </defs>
        <path d="M10 18h80c0 20-18 32-40 32S10 38 10 18z" fill="#c9d3bc" />
        <g clipPath="url(#bowl-inside)">
          <rect x="0" y={50 - 32 * fill} width="100" height="40" fill="#e9b25b" />
          {fill > 0.05 && (
            <g fill="#d99a3f">
              <circle cx="32" cy={52 - 32 * fill} r="4" />
              <circle cx="50" cy={50 - 32 * fill} r="4.5" />
              <circle cx="67" cy={52 - 32 * fill} r="4" />
            </g>
          )}
        </g>
        <rect x="6" y="14" width="88" height="7" rx="3.5" fill="#b3c0a4" />
      </svg>

      {/* the pet */}
      <div className="relative mx-auto flex h-full w-[58%] max-w-[340px] items-end pb-[6%]">
        <Pet mood={mood} watchPointer className="w-full" />
      </div>
    </div>
  );
}
