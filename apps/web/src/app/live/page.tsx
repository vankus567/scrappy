import { LiveStats } from "@/components/LiveStats";

export const metadata = { title: "Scrappy live" };

export default function Live() {
  return (
    <main className="mx-auto min-h-[100dvh] max-w-5xl px-4 py-16 sm:px-8">
      <h1 className="font-display text-[clamp(2.2rem,5vw,3.6rem)] font-bold leading-[1.05]">Humans answering AI, live</h1>
      <p className="mt-3 max-w-xl text-ink-soft">Every number comes straight from the Human API. Nothing here is estimated.</p>
      <LiveStats />
    </main>
  );
}
