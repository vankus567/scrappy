import { PALETTE, SPRITES } from "@/lib/tidepool/sprites";

const hex = (c: number) => `#${c.toString(16).padStart(6, "0")}`;

/** Merge a sprite's pixels into one SVG path per colour, joining horizontal runs. */
function pathsByColour(rows: string[]): Map<number, string> {
  const out = new Map<number, string>();
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const c = parseInt(row[x]!, 16);
      let run = 1;
      while (x + run < row.length && parseInt(row[x + run]!, 16) === c) run++;
      if (c) out.set(c, `${out.get(c) ?? ""}M${x} ${y}h${run}v1h-${run}z`);
      x += run;
    }
  });
  return out;
}

type Who = "shelly" | "finn" | "zip" | "jelly";
const SX: Record<Who, number> = { shelly: 0, finn: 24, zip: 48, jelly: 72 };

/** One TIDEPOOL creature, drawn from the game's own pixel rows as crisp SVG. */
export function Critter({ who, frame = 0, flip = false, className, title }: { who: Who; frame?: 0 | 1; flip?: boolean; className?: string; title?: string }) {
  const rows = SPRITES[SX[who]]![frame]!;
  const w = rows[0]!.length;
  const h = rows.length;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={className}
      shapeRendering="crispEdges"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      style={flip ? { transform: "scaleX(-1)" } : undefined}
    >
      {/* one path per colour: a handful of shapes per sprite instead of one rect per pixel */}
      {[...pathsByColour(rows)].map(([c, d]) => (
        <path key={c} d={d} fill={hex(PALETTE[c]!)} />
      ))}
    </svg>
  );
}

/** A pearl: the thing you catch in the game. */
function Pearl({ gold = false, className }: { gold?: boolean; className?: string }) {
  const body = gold ? hex(PALETTE[10]!) : hex(PALETTE[7]!);
  const shine = gold ? hex(PALETTE[7]!) : hex(PALETTE[6]!);
  return (
    <svg viewBox="0 0 5 5" className={className} shapeRendering="crispEdges" aria-hidden>
      <rect x="1" y="0" width="3" height="5" fill={body} />
      <rect x="0" y="1" width="5" height="3" fill={body} />
      <rect x="1" y="1" width="1" height="1" fill={shine} />
    </svg>
  );
}

type Spot = { who: Who | "pearl" | "gold"; top: string; left: string; size: number; rot: number; dur: number; delay: number; flip?: boolean; frame?: 0 | 1 };

// The game's cast drifting around the centred hero. Visible by default; the float only moves what is already on screen.
const SPOTS: Spot[] = [
  { who: "shelly", top: "7%", left: "4%", size: 132, rot: -6, dur: 6.5, delay: 0 },
  { who: "gold", top: "10%", left: "20%", size: 26, rot: 0, dur: 4.2, delay: 0.6 },
  { who: "finn", top: "30%", left: "12%", size: 118, rot: 5, dur: 5.2, delay: 0.8, frame: 1 },
  { who: "jelly", top: "55%", left: "3%", size: 84, rot: -4, dur: 7, delay: 0.3 },
  { who: "pearl", top: "44%", left: "22%", size: 18, rot: 0, dur: 4.6, delay: 1.4 },
  { who: "zip", top: "77%", left: "13%", size: 124, rot: 6, dur: 5.8, delay: 1.2, frame: 1 },
  { who: "zip", top: "6%", left: "80%", size: 128, rot: 6, dur: 6.2, delay: 0.4, flip: true },
  { who: "pearl", top: "18%", left: "72%", size: 20, rot: 0, dur: 4.8, delay: 1.5 },
  { who: "jelly", top: "31%", left: "88%", size: 76, rot: 5, dur: 5.5, delay: 1 },
  { who: "shelly", top: "52%", left: "82%", size: 140, rot: 4, dur: 6.8, delay: 0.2, flip: true, frame: 1 },
  { who: "gold", top: "70%", left: "74%", size: 24, rot: 0, dur: 5, delay: 0.6 },
  { who: "finn", top: "79%", left: "85%", size: 112, rot: -6, dur: 5.1, delay: 0.9, flip: true },
];

export function SeaCast() {
  return (
    <>
      <div aria-hidden className="pointer-events-none absolute inset-0 hidden lg:block">
        {SPOTS.map((p, i) => (
          <div
            key={i}
            className="hero-pet absolute"
            style={{ top: p.top, left: p.left, width: p.size, rotate: `${p.rot}deg`, animationDuration: `${p.dur}s`, animationDelay: `${p.delay}s`, willChange: "transform" }}
          >
            {p.who === "pearl" || p.who === "gold" ? <Pearl gold={p.who === "gold"} className="w-full" /> : <Critter who={p.who} frame={p.frame} flip={p.flip} className="w-full" />}
          </div>
        ))}
      </div>
      <div aria-hidden className="mb-4 flex items-end justify-center gap-4 lg:hidden">
        {(["shelly", "finn", "zip"] as const).map((w, i) => (
          <div key={w} className="hero-pet w-20" style={{ animationDelay: `${i * 0.3}s` }}>
            <Critter who={w} className="w-full" />
          </div>
        ))}
      </div>
    </>
  );
}
