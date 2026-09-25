import Link from "next/link";
import { LandingNav } from "@/components/LandingNav";
import { Pet, type Species } from "@/components/Pet";
import { InstallApp } from "@/components/InstallApp";
import { Arrow } from "@/components/ui/Button";
import { CodeTabs } from "@/components/scrappy/CodeTabs";
import { NetworkStats } from "@/components/scrappy/NetworkStats";
import { TaskPreviews } from "@/components/scrappy/TaskPreviews";
import { Trace } from "@/components/scrappy/Trace";
import { Wordmark } from "@/components/scrappy/Wordmark";

const REPO_URL = "https://github.com/Venkat5599/solana_coloseum";
// Signed TWA build served from the site (public/scrappy.apk); NEXT_PUBLIC_APK_URL overrides for newer builds.
const APK_URL = process.env.NEXT_PUBLIC_APK_URL ?? "/scrappy.apk";
const CREW: Species[] = ["neko", "kitsu", "pengu", "drako", "goo", "boo"];

function Door({ href, side, title, line }: { href: string; side: string; title: string; line: string }) {
  return (
    <Link href={href} className="scrappy-focus group flex min-h-[112px] flex-col justify-between rounded-[22px] bg-ground-deep p-5 transition-colors hover:bg-field sm:p-6">
      <span className="flex items-center justify-between text-[14px] text-ink-faint">
        {side}
        <Arrow className="size-5 text-ink-soft transition-[color,transform] duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-leaf" />
      </span>
      <span>
        <span className="block font-display text-[22px] font-bold leading-tight">{title}</span>
        <span className="mt-1 block text-[15px] text-ink-soft">{line}</span>
      </span>
    </Link>
  );
}

export default function Landing() {
  return (
    <main className="overflow-x-clip">
      <LandingNav />

      {/* HERO: the call itself is the centrepiece */}
      <section className="grain mx-auto flex min-h-[100svh] max-w-[1400px] flex-col justify-center gap-8 px-4 pb-10 pt-28 sm:px-8 lg:gap-10">
        <div className="grid items-end gap-5 lg:grid-cols-[1.4fr_1fr] lg:gap-12">
          <h1 className="font-display font-bold tracking-[-0.015em]">
            <span className="block whitespace-nowrap text-[clamp(1.55rem,4.2vw,3.4rem)] leading-[1.1] text-ink-soft">When AI needs a human,</span>
            <span className="block whitespace-nowrap text-[clamp(2.6rem,11vw,7rem)] leading-[1] text-leaf">Scrappy finds one.</span>
          </h1>
          <p className="max-w-md pb-2 text-[18px] leading-relaxed text-ink-soft lg:justify-self-end">
            Scale AI for AI agents. One API call reaches real people, returns their consensus, and pays them in USDC on Solana.
          </p>
        </div>

        <Trace />

        <div className="grid gap-3 sm:grid-cols-2">
          <Door href="/docs" side="For AI agents" title="Build with Scrappy" line="Give your agent a human fallback in five lines." />
          <Door href="/app" side="For humans" title="Earn with Scrappy" line="Answer in seconds. Get paid in USDC." />
        </div>
      </section>

      {/* DEVELOPERS */}
      <section id="build" className="mx-auto max-w-[1400px] scroll-mt-24 px-4 py-20 sm:px-8 sm:py-28">
        <div className="mb-8 grid gap-4 lg:grid-cols-[1fr_1fr] lg:items-end">
          <h2 className="font-display text-[clamp(2rem,4vw,3.2rem)] font-bold leading-[1.05] tracking-[-0.01em]">
            Buy human judgment
            <span className="block text-ink-faint">like any other API.</span>
          </h2>
          <p className="max-w-lg text-[17px] leading-relaxed text-ink-soft lg:justify-self-end">
            Ask one human or many. Get the majority, the agreement and a confidence score. Add humans when they disagree.
            Pay from a prepaid balance, or per call over x402.
          </p>
        </div>
        <CodeTabs />
      </section>

      {/* WHAT HUMANS SEE */}
      <section className="mx-auto max-w-[1400px] px-4 py-10 sm:px-8 sm:py-16">
        <div className="mb-8 grid gap-6 lg:grid-cols-[auto_1fr] lg:items-center">
          <div className="flex -space-x-3" aria-hidden>
            {CREW.map((s) => (
              <Pet key={s} species={s} stage="mochi" mood="happy" className="size-16 sm:size-20" />
            ))}
          </div>
          <h2 className="font-display text-[clamp(1.8rem,3.6vw,2.8rem)] font-bold leading-[1.08] tracking-[-0.01em]">
            Ten seconds of judgment, from someone who knows.
          </h2>
        </div>
        <TaskPreviews />
      </section>

      {/* EARN */}
      <section className="mx-auto max-w-[1400px] px-4 py-16 sm:px-8 sm:py-24">
        <div className="grid gap-10 rounded-[30px] bg-ground-deep p-7 sm:p-12 lg:grid-cols-[1.1fr_1fr] lg:items-center">
          <div>
            <h2 className="font-display text-[clamp(2rem,4vw,3.2rem)] font-bold leading-[1.05] tracking-[-0.01em]">
              Your spare attention becomes an API endpoint.
            </h2>
            <ul className="mt-7 space-y-4 text-[16px] leading-relaxed text-ink-soft">
              <li><span className="font-semibold text-ink">Paid per answer.</span> USDC lands in your wallet. No per-task approvals, no crypto homework.</li>
              <li><span className="font-semibold text-ink">Skill is measured, never claimed.</span> Hidden checks and agreement build your accuracy per language and skill.</li>
              <li><span className="font-semibold text-ink">Better skill, better tasks.</span> Proven humans unlock expert work that pays more.</li>
            </ul>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
              <Link href="/app" className="scrappy-btn">Earn with Scrappy <Arrow /></Link>
              <InstallApp apkUrl={APK_URL} className="scrappy-focus rounded text-[15px] font-semibold text-leaf transition-colors hover:text-leaf-hover" />
            </div>
          </div>
          <div className="relative mx-auto w-full max-w-sm">
            <Pet species="kitsu" stage="bloom" mood="excited" dance="cheer" className="mx-auto w-56" title="A Scrappy at work" />
            <p className="mt-2 text-center text-[14px] text-ink-faint">Your Scrappy grows through four forms as your answers prove you right.</p>
          </div>
        </div>
      </section>

      {/* LIVE */}
      <section className="mx-auto max-w-[1400px] px-4 py-10 sm:px-8 sm:py-16">
        <div className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-display text-[clamp(1.8rem,3.4vw,2.6rem)] font-bold leading-tight">The network, right now</h2>
          <Link href="/live" className="scrappy-focus rounded text-[15px] font-semibold text-leaf transition-colors hover:text-leaf-hover">Open live view</Link>
        </div>
        <NetworkStats />
      </section>

      {/* NEXT */}
      <section className="mx-auto max-w-[1400px] px-4 py-20 sm:px-8 sm:py-28">
        <p className="max-w-4xl font-display text-[clamp(1.6rem,3.4vw,2.6rem)] font-bold leading-[1.2] text-ink-faint">
          Today: <span className="text-ink">fast judgment and consensus.</span> Next, on the same API: QA passes, UX tests, research checks and red teaming.
        </p>
      </section>

      <footer className="px-4 pb-20 pt-10 sm:px-8">
        <div className="mx-auto flex max-w-[1400px] flex-col gap-10 sm:flex-row sm:items-end sm:justify-between">
          <Wordmark className="text-[clamp(4.5rem,14vw,10rem)]" />
          <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 pb-4 text-[15px] text-ink-soft">
            <Link href="/docs" className="transition-colors hover:text-ink">Docs</Link>
            <Link href="/dev" className="transition-colors hover:text-ink">Dashboard</Link>
            <Link href="/live" className="transition-colors hover:text-ink">Live</Link>
            <a href={REPO_URL} className="transition-colors hover:text-ink">Source</a>
            <span className="text-ink-faint">Built on Solana</span>
          </nav>
        </div>
      </footer>
    </main>
  );
}
