"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, Briefcase, Trophy, Wallet } from "@phosphor-icons/react";
import { MorphNav } from "@/components/MorphNav";
import { RadialNav } from "./RadialNav";

const TABS = [
  { href: "/app", label: "Home", Icon: House },
  { href: "/app/jobs", label: "Jobs", Icon: Briefcase },
  { href: "/app/ranks", label: "Ranks", Icon: Trophy },
  { href: "/app/wallet", label: "Wallet", Icon: Wallet },
];

export function AppNav() {
  const path = usePathname();
  return (
    <>
      {/* desktop: morphing header */}
      <MorphNav
        className="hidden md:flex"
        links={TABS.map((t) => ({ href: t.href, label: t.label, icon: t.Icon, active: t.href === "/app" ? path === "/app" : path.startsWith(t.href) }))}
      />

      {/* mobile: radial nav */}
      <RadialNav items={TABS.map((t) => ({ ...t, active: t.href === "/app" ? path === "/app" : path.startsWith(t.href) }))} />
    </>
  );
}
