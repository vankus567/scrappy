import { Pet } from "@/components/Pet";
import { HeroPets } from "@/components/HeroPets";
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


        <HeroPets />
        <div className="relative mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center pb-20 pt-6 text-center">
          <h1 className="font-display text-balance text-[clamp(2.5rem,6vw,4.9rem)] font-bold leading-[1.04] tracking-[-0.01em]">
            Hear it. Copy it.
            <span className="block text-[#007aff]">Win the voice battle.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-[18px] font-semibold leading-relaxed text-navy-text">
            A sound plays, you copy it into your mic, and the closest copy wins. Battle up to 3 friends, with your pet on Solana.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3">
            <PrimaryLink href="/app">Hatch a pet</PrimaryLink>
            <GlossButton href="/scrappy.apk" download>
              Download the Android app
              <Arrow />
            </GlossButton>
            <span className="-mt-1 text-[13px] font-semibold text-navy-text">APK · 1 MB</span>
            <span className="text-[14px] font-semibold text-navy-text">Free to play on the web and Android.</span>
          </div>
          <figure className="mt-10 w-full max-w-md rounded-2xl bg-ground-deep px-5 py-4 text-left shadow-[0_6px_16px_-8px_rgba(29,29,31,0.5)]">
            <figcaption className="text-[12px] text-ink-faint">Example round</figcaption>
            <p className="mt-1.5 text-[15px] leading-snug">Scrappy Tune: Sleepy Cat</p>
            <p className="mt-2 text-[17px] leading-snug text-ink">Hum it back. Match the ups and downs.</p>
            <p className="mt-3 text-[13px] text-ink-soft">4 players · 3 sounds · about 2 minutes</p>
          </figure>
          <div className="mt-3 flex w-full max-w-md items-end gap-3 text-left">
            <Pet species="goo" mood="curious" dance="wave" className="w-20 shrink-0" title="A little pet asking you for help" />
            <p className="relative mb-6 rounded-2xl rounded-bl-md bg-white px-4 py-3 text-[15px] font-semibold leading-snug text-navy-text shadow-[0_4px_12px_-8px_rgba(29,29,31,0.45)]">
              Psst! I just heard a sound. Bet you can copy it better than your friends.
            </p>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS: one day in Mochi's life */}
      <section id="how" className="px-4 py-24 sm:px-8 sm:py-32">
        <div className="mx-auto max-w-6xl">
          <h2 className="font-display tracking-[-0.005em] text-[clamp(2rem,4vw,3.4rem)] font-bold leading-[1.04] tracking-[-0.015em]">
            Every battle is three sounds.
          </h2>
          <p className="mt-4 max-w-lg text-[17px] leading-relaxed text-ink-soft">
            Listen, copy it, and see who got closest. Any key works: it's the shape and the rhythm that count.
          </p>
          <div className="mt-16 grid gap-10 sm:grid-cols-3 sm:gap-6">
            {[
              { mood: "curious" as const, bg: "bg-white", t: "Listen", d: "A sound plays: a Scrappy Tune or a clip another player recorded. Everyone in the battle hears the same one." },
              { mood: "focused" as const, bg: "bg-white", t: "Copy it", d: "Hum, sing or whistle it back. Your pitch line draws over the sound's as you go. Retry until you like it." },
              { mood: "happy" as const, bg: "bg-white", t: "Win", d: "Closest copy after three sounds wins. Every win helps Mochi grow into its next form." },
            ].map((s) => (
              <div key={s.t} className={`rounded-3xl p-6 pb-8 ${s.bg}`}>
                <Pet mood={s.mood} className="mx-auto w-40" title={`Mochi, ${s.mood}`} />
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
              Come last, and everyone hears it.
            </h2>
            <p className="mt-5 max-w-md text-[16px] leading-relaxed text-on-night-soft">
              Scores show after every sound, for everyone in the battle. Come last and your pet sulks until the
              rematch. Put your real pet's face on your Scrappy and it's their reputation on the line too.
            </p>
          </div>
          <figure className="mx-auto w-full max-w-sm rounded-2xl bg-night-raise p-6 ring-1 ring-white/5">
            <figcaption className="text-[12px] text-on-night-soft">Example result</figcaption>
            <Pet mood="dead" className="mx-auto mt-2 w-36" title="Mochi, knocked out" />
            <p className="mt-3 text-center font-display tracking-[-0.005em] text-2xl">Mochi came last</p>
            <p className="mt-1 text-center text-[14px] text-on-night-soft">212 points · beaten by Luna's 99 on "Rocket Ride"</p>
          </figure>
        </div>
      </section>

      {/* PLAY WITH FRIENDS */}
      <section id="ai-teams" className="scroll-mt-6 px-3 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto grid max-w-6xl gap-12 rounded-[28px] bg-white px-6 py-14 sm:px-12 lg:grid-cols-[1.2fr_1fr] lg:items-center [&>*]:min-w-0">
          <div>
            <AgentOrbClient size={112} tone="light" className="-ml-3 mb-4" />
            <h2 className="font-display tracking-[-0.005em] text-[clamp(2rem,3.4vw,2.7rem)] font-bold leading-[1.06] tracking-[-0.015em]">
              Battle your friends,<br className="hidden sm:block" /> up to four at once.
            </h2>
            <dl className="mt-8 space-y-5 text-[15px]">
              <div>
                <dt className="font-bold">2 to 4 players</dt>
                <dd className="mt-1 text-ink-soft">Share a link. Empty seats go to Scrappy Bot, so there's always someone to beat.</dd>
              </div>
              <div>
                <dt className="font-bold">Any voice works</dt>
                <dd className="mt-1 text-ink-soft">Sing high or low, in any key. Scrappy compares the shape and the rhythm, not how deep your voice is.</dd>
              </div>
              <div>
                <dt className="font-bold">Add your own sounds</dt>
                <dd className="mt-1 text-ink-soft">Record a funny voice or a catchphrase you made up, and it shows up in other players' battles.</dd>
              </div>
            </dl>
            <div className="mt-9">
              <PrimaryLink href="/app/battle">Start a battle</PrimaryLink>
            </div>
          </div>

          <pre style={{ fontVariantLigatures: "none", fontWeight: 400 }} className="overflow-x-auto rounded-2xl bg-ground-deep p-6 font-mono text-[13px] leading-relaxed text-ink ring-1 ring-edge">
{`Example scoreboard
Round 3 of 3 · "Rocket Ride"

  Luna          96
  You           91
  Bruno         78
  Scrappy Bot   74

Totals after 3 sounds
  You          274   winner
  Luna         268
  Bruno        231
  Scrappy Bot  219`}
          </pre>
        </div>
      </section>

      <footer className="bg-ground-deep px-4 py-10 sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 text-center text-[14px] text-ink-soft">
          <p>
            <span className="font-display tracking-[-0.005em] text-[18px] text-ink">scrappy</span> · built on Solana
          </p>
          <a href={REPO_URL} className="transition-colors hover:text-ink">Source on GitHub</a>
        </div>
      </footer>
    </main>
  );
}
