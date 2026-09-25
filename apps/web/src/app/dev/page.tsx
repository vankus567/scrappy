import Link from "next/link";
import { DevDashboard } from "@/components/dev/DevDashboard";
import { Wordmark } from "@/components/kage/Wordmark";

export const metadata = { title: "Kage dashboard" };

export default function Dev() {
  return (
    <main className="mx-auto min-h-[100dvh] max-w-[1200px] px-4 py-8 sm:px-8">
      <Link href="/" aria-label="Kage home" className="kage-focus mb-10 inline-block rounded pb-3"><Wordmark /></Link>
      <DevDashboard />
    </main>
  );
}
