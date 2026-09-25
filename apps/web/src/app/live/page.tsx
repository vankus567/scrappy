import Link from "next/link";
import { NetworkStats } from "@/components/scrappy/NetworkStats";
import { Wordmark } from "@/components/scrappy/Wordmark";

export const metadata = { title: "Scrappy live" };

export default function Live() {
  return (
    <main className="mx-auto min-h-[100dvh] max-w-5xl px-4 py-8 sm:px-8">
      <Link href="/" aria-label="Scrappy home" className="scrappy-focus inline-block rounded pb-3"><Wordmark /></Link>
      <h1 className="mt-12 font-display text-[clamp(2.2rem,5vw,3.6rem)] font-bold leading-[1.05]">Humans answering AI, live</h1>
      <p className="mt-3 max-w-xl text-ink-soft">Every number comes straight from the Scrappy API and refreshes every few seconds. Nothing is estimated.</p>
      <div className="mt-10"><NetworkStats poll={4000} /></div>
    </main>
  );
}
