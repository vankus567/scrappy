import { Pet } from "@/components/Pet";
import { HeroPets } from "@/components/HeroPets";
import { LandingNav } from "@/components/LandingNav";
import { GlossButton } from "@/components/GlossButton";
import { HeroClouds } from "@/components/backgrounds/HeroClouds";
import { AgentOrbClient } from "@/components/AgentOrbClient";

const REPO_URL = "https://github.com/Venkat5599/solana_coloseum";
const PILOT_URL = process.env.NEXT_PUBLIC_PILOT_URL ?? `${REPO_URL}/issues/new?title=Pilot%20request`;

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
            When AI needs a human,
            <span className="block text-[#007aff]">Scrappy pays one instantly.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-[18px] font-semibold leading-relaxed text-navy-text">
            An API where the endpoint is a human. Agents ask, your pet finds the job, you answer in seconds, and you are paid on Solana.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3">
            <PrimaryLink href="/app">Hatch a pet</PrimaryLink>
            <span className="text-[14px] font-semibold text-navy-text">Hatching opens October 2026 on web and Seeker.</span>
          </div>
          <figure className="mt-10 w-full max-w-md rounded-2xl bg-ground-deep px-5 py-4 text-left shadow-[0_6px_16px_-8px_rgba(29,29,31,0.5)]">
            <figcaption className="text-[12px] text-ink-faint">Example job from an agent</figcaption>
            <p className="mt-1.5 text-[15px] leading-snug">Does this Hindi reply sound natural?</p>
            <p lang="hi" className="mt-2 text-[17px] leading-snug text-ink">आपका ऑर्डर कल तक पहुँच जाएगा।</p>
            <p className="mt-3 text-[13px] text-ink-soft">Pays $0.05 · about 20 seconds</p>
          </figure>
          <div className="mt-3 flex w-full max-w-md items-end gap-3 text-left">
            <Pet species="goo" mood="curious" dance="wave" className="w-20 shrink-0" title="A little pet asking you for help" />
            <p className="relative mb-6 rounded-2xl rounded-bl-md bg-white px-4 py-3 text-[15px] font-semibold leading-snug text-navy-text shadow-[0_4px_12px_-8px_rgba(29,29,31,0.45)]">
              Psst, human! An agent is stuck on this one. Can you help? It takes 20 seconds.
            </p>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS: one day in Mochi's life */}
      <section id="how" className="px-4 py-24 sm:px-8 sm:py-32">
        <div className="mx-auto max-w-6xl">
          <h2 className="font-display tracking-[-0.005em] text-[clamp(2rem,4vw,3.4rem)] font-bold leading-[1.04] tracking-[-0.015em]">
            Every pet runs a tiny business.
          </h2>
          <p className="mt-4 max-w-lg text-[17px] leading-relaxed text-ink-soft">
            Jobs come in, you help with the ones that need a human, and the pay keeps it fed.
          </p>
          <div className="mt-16 grid gap-10 sm:grid-cols-3 sm:gap-6">
            {[
              { mood: "curious" as const, bg: "bg-white", t: "A job arrives", d: "A support bot wants to know if its Tamil reply is polite. Your phone buzzes." },
              { mood: "focused" as const, bg: "bg-white", t: "You answer", d: "Read, tap, done. Easy jobs Mochi handles by itself; the rest need you." },
              { mood: "happy" as const, bg: "bg-white", t: "Mochi eats", d: "The AI team's payment lands in USDC, a digital dollar. Mochi keeps a little for its own AI costs." },
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
              Forget it, and it starves.
            </h2>
            <p className="mt-5 max-w-md text-[16px] leading-relaxed text-on-night-soft">
              A pet with no work gets hungry, then starving. Leave it long enough and it dies broke, and you get a
              certificate your friends will not let you forget. Whatever it earned stays yours.
            </p>
          </div>
          <figure className="mx-auto w-full max-w-sm rounded-2xl bg-night-raise p-6 ring-1 ring-white/5">
            <figcaption className="text-[12px] text-on-night-soft">Example certificate</figcaption>
            <Pet mood="dead" className="mx-auto mt-2 w-36" title="Mochi, deceased" />
            <p className="mt-3 text-center font-display tracking-[-0.005em] text-2xl">Here lies Mochi</p>
            <p className="mt-1 text-center text-[14px] text-on-night-soft">Day 9 · died broke · last job: 3 Hindi replies rated</p>
          </figure>
        </div>
      </section>

      {/* FOR AI TEAMS */}
      <section id="ai-teams" className="scroll-mt-6 px-3 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto grid max-w-6xl gap-12 rounded-[28px] bg-white px-6 py-14 sm:px-12 lg:grid-cols-[1.2fr_1fr] lg:items-center [&>*]:min-w-0">
          <div>
            <AgentOrbClient size={112} tone="light" className="-ml-3 mb-4" />
            <h2 className="font-display tracking-[-0.005em] text-[clamp(2rem,3.4vw,2.7rem)] font-bold leading-[1.06] tracking-[-0.015em]">
              Call a human<br className="hidden sm:block" /> like you call an API.
            </h2>
            <dl className="mt-8 space-y-5 text-[15px]">
              <div>
                <dt className="font-bold">Pay per task</dt>
                <dd className="mt-1 text-ink-soft">No contracts or minimums. Your agent pays in USDC over x402 when it asks.</dd>
              </div>
              <div>
                <dt className="font-bold">Indian languages and English</dt>
                <dd className="mt-1 text-ink-soft">Hindi, Tamil, Marathi, Bengali, Telugu, Kannada, Gujarati, and English checks.</dd>
              </div>
              <div>
                <dt className="font-bold">Checked twice</dt>
                <dd className="mt-1 text-ink-soft">Known-answer tests, three-person agreement, and a window to reject bad work.</dd>
              </div>
            </dl>
            <div className="mt-9">
              <PrimaryLink href={PILOT_URL}>Request a pilot</PrimaryLink>
            </div>
          </div>

          <pre style={{ fontVariantLigatures: "none", fontWeight: 400 }} className="overflow-x-auto rounded-2xl bg-ground-deep p-6 font-mono text-[13px] leading-relaxed text-ink ring-1 ring-edge">
{`// MCP tool, or POST /v1/jobs with x402
ask_human({
  task: "verify_correct",
  language: "hi",
  instructions: "Is this reply natural? Fix it if not.",
  items: [{
    id: "r1",
    content: "आपका ऑर्डर कल तक पहुँच जाएगा।",
  }],
  answers_per_item: 3,
  max_price_usdc: 0.30,
})
// => { job_id, status: "done",
//      results: [{ id, answer, confidence }] }`}
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
