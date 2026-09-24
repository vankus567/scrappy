"use client";

import { Check } from "@phosphor-icons/react";
import { Pet } from "@/components/Pet";
import { stageFor, type PetRecord } from "@/lib/pet-store";

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
        {/* a sky: stars and fluffy clouds */}
        <g fill="#f5f5f7">
          {[[40, 40], [300, 70], [180, 20], [60, 330], [310, 260], [150, 500], [30, 200], [290, 480]].map(([x, y], i) => (
            <path key={i} d={`M${x} ${y - 6}l2 4 4 2-4 2-2 4-2-4-4-2 4-2z`} opacity="0.8" />
          ))}
        </g>
        <g fill="#2c2c2e">
          {[[70, 60, 1], [270, 180, 0.8], [60, 250, 0.9], [260, 350, 1], [90, 430, 0.8]].map(([x, y, s], i) => (
            <g key={i} transform={`translate(${x} ${y}) scale(${s})`}>
              <circle cx="0" cy="0" r="18" /><circle cx="20" cy="-8" r="22" /><circle cx="42" cy="0" r="17" /><rect x="-10" y="0" width="62" height="16" rx="8" />
            </g>
          ))}
        </g>
        {/* the road */}
        <path d={PATH} fill="none" stroke="#3a3a3c" strokeWidth="22" strokeLinecap="round" />
        <path d={PATH} fill="none" stroke="#007aff" strokeWidth="6" strokeLinecap="round" strokeDasharray="1 14" opacity="0.9" />

        {/* paw prints near completed goals */}
        {ms.filter((m) => m.done).map((m, i) => (
          <g key={i} fill="#5aa9ff" opacity="0.7" transform={`translate(${m.x + 26} ${m.y - 22}) rotate(-20)`}>
            <ellipse cx="0" cy="6" rx="5" ry="4" />
            <circle cx="-5" cy="-1" r="2" /><circle cx="0" cy="-3" r="2" /><circle cx="5" cy="-1" r="2" />
          </g>
        ))}

        {/* milestone bubbles */}
        {ms.map((m) => {
          const w = m.label.length * 7.2 + 26;
          return (
            <g key={m.label} transform={`translate(${m.x} ${m.y})`}>
              <circle r="11" fill={m.done ? "#007aff" : "#2c2c2e"} stroke={m.done ? "#cfe4ff" : "#48484a"} strokeWidth="3" />
              <g transform={`translate(${m.x > 200 ? -w - 16 : 16} -16)`}>
                <rect width={w} height="30" rx="12" fill={m.done ? "#007aff" : "#2c2c2e"} />
                <text x={w / 2} y="15" textAnchor="middle" dominantBaseline="central" fontSize="13" fontWeight="600" fill={m.done ? "#ffffff" : "#aaaaaa"}>
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
        <Pet mood="curious" stage={stageFor(pet).current.id} species={pet.species} className="w-full" title={`${pet.name} on the map`} />
      </div>

      {nextIdx !== -1 && (
        <p className="flex items-center gap-2 px-6 pb-5 text-[14px] text-on-night-soft">
          <Check size={16} weight="bold" className="text-[#5aa9ff]" />
          {ms.filter((m) => m.done).length} of {ms.length} goals. Next: <span className="font-medium text-on-night">{ms[nextIdx].label}</span>
        </p>
      )}
    </div>
  );
}
