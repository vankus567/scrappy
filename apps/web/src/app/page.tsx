import { Critter, SeaCast } from "@/components/SeaCast";
import { LandingNav } from "@/components/LandingNav";
import { GlossButton } from "@/components/GlossButton";
import { HeroClouds } from "@/components/backgrounds/HeroClouds";
import { AgentOrbClient } from "@/components/AgentOrbClient";

const REPO_URL = "https://github.com/Venkat5599/solana_coloseum";

function Arrow() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="size-4 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5">
      <path d="M4.5 11.5l7-7M6 4.5h5.5V10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

function PrimaryLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <GlossButton href={href}>
      {children}
      <Arrow />
    </GlossButton>
  );
}

export default function Home() {
  return (
    <main>
      <LandingNav />
      {/* HERO: owns the first screen */}
      <section className="grain relative flex min-h-[100svh] flex-col overflow-hidden px-4 pt-20 sm:px-8">
        <HeroClouds />


        <SeaCast />
        <div className="relative mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center pb-20 pt-6 text-center">
          <h1 className="font-display text-balance text-[clamp(2.5rem,6vw,4.9rem)] font-bold leading-[1.04] tracking-[-0.01em]">
            Crypto is hard.
            <span className="block text-[#007aff]">So we made it a game.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-[18px] font-semibold leading-relaxed text-navy-text">
            TIDEPOOL is a pocket arcade game where every move is real Solana. Ride the live SOL price, keep it in your net, then cast a real one from your own wallet and collect real fees.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3">
            <PrimaryLink href="/tidepool">Play TIDEPOOL</PrimaryLink>
            <GlossButton href="/scrappy.apk" download>
              Download the Android app
              <Arrow />
            </GlossButton>
            <span className="-mt-1 text-[13px] font-semibold text-navy-text">APK · 1 MB</span>
            <span className="text-[14px] font-semibold text-navy-text">Free to play. Connect your wallet on devnet.</span>
          </div>
          <figure className="mt-10 w-full max-w-md rounded-2xl bg-ground-deep px-5 py-4 text-left shadow-[0_6px_16px_-8px_rgba(29,29,31,0.5)]">
            <figcaption className="text-[12px] text-ink-faint">How a round goes</figcaption>
            <p className="mt-1.5 text-[15px] leading-snug">Your creature rides the live SOL price</p>
            <p className="mt-2 text-[17px] leading-snug text-ink">Steer the net. Catch pearls. Dodge jellyfish.</p>
            <p className="mt-3 text-[13px] text-ink-soft">Combos up to x8 · levels speed up · WHALE WAVE on big moves</p>
          </figure>
          <div className="mt-3 flex w-full max-w-md items-end gap-3 text-left">
            <Critter who="finn" className="hero-pet w-20 shrink-0" title="Finn the fish" />
            <p className="relative mb-6 rounded-2xl rounded-bl-md bg-white px-4 py-3 text-[15px] font-semibold leading-snug text-navy-text shadow-[0_4px_12px_-8px_rgba(29,29,31,0.45)]">
              Psst! Keeping the price in your net is exactly what liquidity providers do. You just learned it.
            </p>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS: play, cast, collect */}
      <section id="how" className="px-4 py-24 sm:px-8 sm:py-32">
        <div className="mx-auto max-w-6xl">
          <h2 className="font-display tracking-[-0.005em] text-[clamp(2rem,4vw,3.4rem)] font-bold leading-[1.04] tracking-[-0.015em]">
            Play first. Then do it for real.
          </h2>
          <p className="mt-4 max-w-lg text-[17px] leading-relaxed text-ink-soft">
            Every button in the game is a real Solana action underneath. You never read a manual; you just play.
          </p>
          <div className="mt-16 grid gap-10 sm:grid-cols-3 sm:gap-6">
            {[
              { who: "finn" as const, bg: "bg-white", t: "Play", d: "An endless arcade round on the live SOL price. Keep your creature inside the net, build combos, chase your best score." },
              { who: "shelly" as const, bg: "bg-white", t: "Cast a real net", d: "Pick a real Orca pool on the world map and cast. Your own wallet signs; the net is a real liquidity position you own." },
              { who: "zip" as const, bg: "bg-white", t: "Collect", d: "While the price stays in your net it earns real fees. Press A to collect them straight into your wallet." },
            ].map((s) => (
              <div key={s.t} className={`rounded-3xl p-6 pb-8 ${s.bg}`}>
                <Critter who={s.who} className="mx-auto w-40" title={s.who} />
                <h3 className="mt-4 font-display tracking-[-0.005em] text-2xl font-bold">{s.t}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* THE STAKES: inset night island */}
      <section id="stakes" className="px-3 sm:px-6">
        <div className="mx-auto grid max-w-6xl items-center gap-10 overflow-hidden rounded-[28px] bg-night px-6 py-16 text-on-night sm:px-12 lg:grid-cols-2 lg:py-20">
          <div>
            <h2 className="font-display tracking-[-0.005em] text-[clamp(2rem,4.4vw,3.6rem)] font-bold leading-[1.02] tracking-[-0.015em]">
              Nothing on screen is fake.
            </h2>
            <p className="mt-5 max-w-md text-[16px] leading-relaxed text-on-night-soft">
              The chart is the live SOL price. Nets are real Orca positions. Coins are real fees. Every move
              links to Solana Explorer, and points are just points: we never turn your score into a bet.
            </p>
          </div>
          <figure className="mx-auto w-full max-w-sm rounded-2xl bg-night-raise p-6 ring-1 ring-white/5">
            <figcaption className="text-[12px] text-on-night-soft">After a run</figcaption>
            <Critter who="shelly" frame={1} className="hero-pet mx-auto mt-2 w-36" title="Shelly the turtle" />
            <p className="mt-3 text-center font-display tracking-[-0.005em] text-2xl">1,240 points · combo x8</p>
            <p className="mt-1 text-center text-[14px] text-on-night-soft">Price in the net 86% · then one tap to cast it for real</p>
          </figure>
        </div>
      </section>

      {/* PLAY WITH FRIENDS */}
      <section id="ai-teams" className="scroll-mt-6 px-3 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto grid max-w-6xl gap-12 rounded-[28px] bg-white px-6 py-14 sm:px-12 lg:grid-cols-[1.2fr_1fr] lg:items-center [&>*]:min-w-0">
          <div>
            <AgentOrbClient size={112} tone="light" className="-ml-3 mb-4" />
            <h2 className="font-display tracking-[-0.005em] text-[clamp(2rem,3.4vw,2.7rem)] font-bold leading-[1.06] tracking-[-0.015em]">
              Beat your friends'<br className="hidden sm:block" /> best score.
            </h2>
            <dl className="mt-8 space-y-5 text-[15px]">
              <div>
                <dt className="font-bold">Challenge links</dt>
                <dd className="mt-1 text-ink-soft">Share your run as a card. Friends who open it see your score to beat, live in their round.</dd>
              </div>
              <div>
                <dt className="font-bold">A handheld in your pocket</dt>
                <dd className="mt-1 text-ink-soft">Plays on the web and as an Android app for Solana Seeker, with a d-pad, A and B.</dd>
              </div>
              <div>
                <dt className="font-bold">More cartridges coming</dt>
                <dd className="mt-1 text-ink-soft">Liquidity is cartridge one. Staking and trading are next, each one a hard thing made playable.</dd>
              </div>
            </dl>
            <div className="mt-9">
              <PrimaryLink href="/tidepool">Start a round</PrimaryLink>
            </div>
          </div>

          <pre style={{ fontVariantLigatures: "none", fontWeight: 400 }} className="overflow-x-auto rounded-2xl bg-ground-deep p-6 font-mono text-[13px] leading-relaxed text-ink ring-1 ring-edge">
{`What each button really does

  A  cast net   open an Orca position
  A  collect    harvest fees to wallet
  B  recentre   close + reopen at price
  B  pull in    close position, funds back

Signed by your wallet. Solana devnet.`}
          </pre>
        </div>
      </section>

      <footer className="bg-ground-deep px-4 py-10 sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 text-center text-[14px] text-ink-soft">
          <p>
            <span className="font-display tracking-[-0.005em] text-[18px] text-ink">scrappypet</span> · home of TIDEPOOL · built on Solana
          </p>
          <a href={REPO_URL} className="transition-colors hover:text-ink">Source on GitHub</a>
        </div>
      </footer>
    </main>
  );
}
