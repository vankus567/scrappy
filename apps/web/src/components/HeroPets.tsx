import { Pet, type PetDance, type PetMood, type PetStage, type Species } from "./Pet";

type Spot = { species: Species; mood: PetMood; stage: PetStage; dance?: PetDance; top: string; left: string; size: number; rot: number; dur: number; delay: number };

// Scattered around both sides of the centred hero, like floating toys. Visible by default;
// the float only moves pets that are already on screen.
const LEFT: Spot[] = [
  { species: "kumo", mood: "happy", stage: "mochi", top: "6%", left: "3%", size: 120, rot: -10, dur: 6.5, delay: 0 },
  { species: "zap", mood: "excited", stage: "blossom", dance: "wiggle", top: "30%", left: "13%", size: 104, rot: 8, dur: 5.2, delay: 0.8 },
  { species: "neko", mood: "wink", stage: "bloom", top: "54%", left: "2%", size: 132, rot: -6, dur: 7, delay: 0.3 },
  { species: "pip", mood: "curious", stage: "sprout", top: "76%", left: "15%", size: 92, rot: 12, dur: 5.8, delay: 1.2 },
  { species: "goo", mood: "love", stage: "mochi", top: "12%", left: "19%", size: 70, rot: 14, dur: 4.6, delay: 0.5 },
  { species: "ember", mood: "excited", stage: "blossom", top: "32%", left: "1%", size: 76, rot: -8, dur: 5.4, delay: 1.1 },
];
const RIGHT: Spot[] = [
  { species: "bun", mood: "love", stage: "blossom", dance: "sway", top: "5%", left: "82%", size: 124, rot: 9, dur: 6.2, delay: 0.4 },
  { species: "kitsu", mood: "happy", stage: "blossom", top: "31%", left: "72%", size: 112, rot: -8, dur: 5.5, delay: 1 },
  { species: "pengu", mood: "excited", stage: "blossom", dance: "wave", top: "55%", left: "85%", size: 128, rot: 7, dur: 6.8, delay: 0.2 },
  { species: "drako", mood: "curious", stage: "bloom", top: "78%", left: "71%", size: 100, rot: -12, dur: 5.1, delay: 0.9 },
  { species: "mochi", mood: "happy", stage: "blossom", top: "16%", left: "68%", size: 72, rot: -14, dur: 4.8, delay: 1.5 },
  { species: "boo", mood: "wink", stage: "bloom", top: "33%", left: "89%", size: 80, rot: 10, dur: 5, delay: 0.6 },
];

export function HeroPets() {
  return (
    <>
      {/* desktop: pets float around both sides */}
      <div aria-hidden className="pointer-events-none absolute inset-0 hidden lg:block">
        {[...LEFT, ...RIGHT].map((p, i) => (
          <div
            key={i}
            className="hero-pet absolute"
            style={{ top: p.top, left: p.left, width: p.size, rotate: `${p.rot}deg`, animationDuration: `${p.dur}s`, animationDelay: `${p.delay}s` }}
          >
            <Pet species={p.species} mood={p.mood} stage={p.stage} dance={p.dance} className="w-full" title="" />
          </div>
        ))}
      </div>
      {/* mobile: a row of friends above the headline */}
      <div aria-hidden className="mb-4 flex justify-center -space-x-3 lg:hidden">
        {(["kumo", "neko", "mochi", "bun", "pengu"] as Species[]).map((s, i) => (
          <div key={s} className="hero-pet w-16" style={{ animationDelay: `${i * 0.3}s` }}>
            <Pet species={s} mood={i === 2 ? "excited" : "happy"} stage="mochi" className="w-full" title="" />
          </div>
        ))}
      </div>
    </>
  );
}
