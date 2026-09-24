"use client";

/** Speckled egg with a sprout peeking out. Wobbles gently; cracks when `cracking`. */
export function Egg({ cracking = false, className }: { cracking?: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 200 220" role="img" aria-label="An egg, about to hatch" className={`${cracking ? "egg-crack" : "egg-wobble"} ${className ?? ""}`}>
      <ellipse cx="102" cy="206" rx="58" ry="6" fill="var(--pet-ink)" opacity="0.12" />
      <path d="M100 18c40 0 70 62 70 108 0 44-30 76-70 76s-70-32-70-76c0-46 30-108 70-108z" fill="#f6efe2" />
      <path d="M146 64c14 22 24 44 24 62 0 44-30 76-70 76 30-12 50-40 50-78 0-22-2-42-4-60z" fill="#e7dcc8" />
      <g fill="#ef9a73">
        <circle cx="74" cy="92" r="7" />
        <circle cx="120" cy="70" r="5" />
        <circle cx="128" cy="140" r="8" />
        <circle cx="82" cy="160" r="5" />
      </g>
      <path d="M68 58c10-10 22-16 32-16" stroke="#fff" strokeOpacity="0.8" strokeWidth="6" strokeLinecap="round" fill="none" />
      {cracking && (
        <path d="M40 118l18-10 14 12 16-14 14 12 16-12 14 10 18-8 12 10" stroke="var(--pet-ink)" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" fill="none" />
      )}
    </svg>
  );
}
