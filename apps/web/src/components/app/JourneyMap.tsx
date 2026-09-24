"use client";

import { Check } from "@phosphor-icons/react";
import { Pet } from "@/components/Pet";
import type { PetRecord } from "@/lib/pet-store";

type Milestone = { label: string; done: boolean; x: number; y: number };

/** Real goals computed from the pet record. Nothing here is invented progress. */
function milestones(pet: PetRecord): Milestone[] {
  const ageDays = (Date.now() - pet.bornAt) / 86_400_000;
  return [
    { label: "Hatched", done: true, x: 70, y: 470 },
    { label: "First job", done: pet.jobsDone >= 1, x: 250, y: 400 },
    { label: "10 jobs", done: pet.jobsDone >= 10, x: 110, y: 300 },
    { label: "First ₹100", done: pet.earnedPaise >= 10_000, x: 270, y: 215 },
    { label: "7 days alive", done: ageDays >= 7, x: 120, y: 120 },
    { label: "Invite a friend", done: false, x: 255, y: 45 },
  ];
}

const PATH = "M70 470 C 160 470, 250 450, 250 400 S 110 360, 110 300 S 270 270, 270 215 S 120 170, 120 120 S 255 90, 255 45";

export function JourneyMap({ pet }: { pet: PetRecord }) {
  const ms = milestones(pet);
  const nextIdx = ms.findIndex((m) => !m.done);
  const here = ms[Math.max(0, (nextIdx === -1 ? ms.length : nextIdx) - 1)];

  return (
    <div className="relative overflow-hidden rounded-[28px] bg-night text-on-night">
      <svg viewBox="0 0 340 520" className="block h-auto w-full" role="img" aria-label={`${pet.name}'s journey. Next goal: ${ms[nextIdx]?.label ?? "all done"}`}>
        {/* city blocks */}
        <g fill="#1a2117">
          {[
            [16, 20, 90, 70], [130, 10, 80, 60], [230, 90, 90, 60], [20, 150, 70, 90], [170, 140, 60, 50],
            [200, 300, 110, 70], [20, 380, 90, 50], [140, 460, 110, 50], [290, 420, 40, 80], [30, 240, 50, 40],
          ].map(([x, y, w, h], i) => (
            <rect key={i} x={x} y={y} width={w} height={h} rx="10" />
          ))}
        </g>
        {/* the road */}
        <path d={PATH} fill="none" stroke="#2b3526" strokeWidth="22" strokeLinecap="round" />
        <path d={PATH} fill="none" stroke="#e9b25b" strokeWidth="6" strokeLinecap="round" strokeDasharray="1 14" opacity="0.9" />

        {/* paw prints near completed goals */}
        {ms.filter((m) => m.done).map((m, i) => (
          <g key={i} fill="#e9b25b" opacity="0.55" transform={`translate(${m.x + 26} ${m.y - 22}) rotate(-20)`}>
            <ellipse cx="0" cy="6" rx="5" ry="4" />
            <circle cx="-5" cy="-1" r="2" /><circle cx="0" cy="-3" r="2" /><circle cx="5" cy="-1" r="2" />
          </g>
        ))}

        {/* milestone bubbles */}
        {ms.map((m) => {
          const w = m.label.length * 7.2 + 26;
          return (
            <g key={m.label} transform={`translate(${m.x} ${m.y})`}>
              <circle r="11" fill={m.done ? "#e9b25b" : "#2b3526"} stroke={m.done ? "#fff3d6" : "#44513e"} strokeWidth="3" />
              <g transform={`translate(${m.x > 200 ? -w - 16 : 16} -16)`}>
                <rect width={w} height="30" rx="12" fill={m.done ? "#e9b25b" : "#232b1f"} />
                <text x={w / 2} y="15" textAnchor="middle" dominantBaseline="central" fontSize="13" fontWeight="600" fill={m.done ? "#2a1d0a" : "#b8c2ab"}>
                  {m.label}
                </text>
              </g>
            </g>
          );
        })}
      </svg>

      {/* the pet stands at its latest reached goal */}
      <div
        className="pointer-events-none absolute w-[18%]"
        style={{ left: `${(here.x / 340) * 100}%`, top: `${(here.y / 520) * 100}%`, transform: "translate(-50%, -92%)" }}
      >
        <Pet mood="curious" className="w-full" title={`${pet.name} on the map`} />
      </div>

      {nextIdx !== -1 && (
        <p className="flex items-center gap-2 px-6 pb-5 text-[14px] text-on-night-soft">
          <Check size={16} weight="bold" className="text-[#e9b25b]" />
          {ms.filter((m) => m.done).length} of {ms.length} goals. Next: <span className="font-medium text-on-night">{ms[nextIdx].label}</span>
        </p>
      )}
    </div>
  );
}
