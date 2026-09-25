import Link from "next/link";
import { DevDashboard } from "@/components/dev/DevDashboard";
import { Wordmark } from "@/components/scrappy/Wordmark";

export const metadata = { title: "Scrappy dashboard" };

export default function Dev() {
  return (
    <main className="mx-auto min-h-[100dvh] max-w-[1200px] px-4 py-8 sm:px-8">
      <Link href="/" aria-label="Scrappy home" className="scrappy-focus mb-10 inline-block rounded pb-3"><Wordmark /></Link>
      <DevDashboard />
    </main>
  );
}
