"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, Lightning, PawPrint, Trophy, Wallet } from "@phosphor-icons/react";
import { MorphNav } from "@/components/MorphNav";
import { Wordmark } from "@/components/kage/Wordmark";
import { WalletButton } from "@/components/wallet/WalletButton";
import { useWalletLink } from "@/components/wallet/WalletLink";
import { RadialNav } from "./RadialNav";

const TABS = [
  { href: "/app", label: "Home", Icon: House },
  { href: "/app/tasks", label: "Tasks", Icon: Lightning },
  { href: "/app/profile", label: "Kage", Icon: PawPrint },
  { href: "/app/wallet", label: "Wallet", Icon: Wallet },
  { href: "/app/ranks", label: "Ranks", Icon: Trophy },
];

export function AppNav() {
  const path = usePathname();
  const isActive = (href: string) => (href === "/app" ? path === "/app" : path.startsWith(href));
  return (
    <>
      {/* desktop: morphing header with the wallet on the right */}
      <MorphNav
        className="hidden md:flex"
        links={TABS.map((t) => ({ href: t.href, label: t.label, icon: t.Icon, active: isActive(t.href) }))}
        right={<WalletButton />}
      />

      {/* mobile: slim top bar (brand + wallet), radial tabs at the bottom */}
      <header className="sticky top-0 z-30 flex items-center justify-between bg-ground/95 px-4 pb-2 pt-[calc(10px+env(safe-area-inset-top))] md:hidden">
        <Link href="/app" aria-label="Kage home" className="kage-focus rounded pb-1.5"><Wordmark className="text-[22px]" /></Link>
        <WalletButton compact />
      </header>
      <RadialNav items={TABS.map((t) => ({ ...t, active: isActive(t.href) }))} />

      <LinkBanner />
    </>
  );
}

/** Wallet linking feedback that must not be missed: errors and a wallet that differs from the payout wallet. */
function LinkBanner() {
  const { status, mismatch } = useWalletLink();
  if (status.state === "error") {
    return <p role="alert" className="mx-auto mt-3 max-w-[1400px] px-4 text-[14px] text-[#ffb4a3] sm:px-8">{status.message}</p>;
  }
  if (mismatch) {
    return (
      <p role="status" className="mx-auto mt-3 max-w-[1400px] px-4 text-[14px] text-ink-soft sm:px-8">
        The connected wallet isn&apos;t this Kage&apos;s payout wallet. Earnings still go to the payout wallet shown in the header.
      </p>
    );
  }
  return null;
}
