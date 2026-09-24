"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, Briefcase, Trophy, Wallet } from "@phosphor-icons/react";

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
      {/* desktop: top bar */}
      <header className="sticky top-0 z-20 hidden bg-ground/90 backdrop-blur-sm md:block">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between px-8">
          <Link href="/" className="font-display text-[22px] font-medium tracking-tight">scrappy</Link>
          <nav className="flex items-center gap-1">
            {TABS.map(({ href, label }) => {
              const active = href === "/app" ? path === "/app" : path.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-[12px] px-4 py-2 text-[15px] transition-colors ${active ? "bg-leaf font-semibold text-on-leaf" : "text-ink-soft hover:text-ink"}`}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      {/* mobile: bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-edge bg-ground/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm md:hidden">
        <ul className="mx-auto grid max-w-md grid-cols-4">
          {TABS.map(({ href, label, Icon }) => {
            const active = href === "/app" ? path === "/app" : path.startsWith(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-[64px] flex-col items-center justify-center gap-1 text-[12px] ${active ? "font-semibold text-ink" : "text-ink-soft"}`}
                >
                  <span className={`grid size-11 place-items-center rounded-[16px] transition-colors ${active ? "bg-leaf text-on-leaf" : "bg-ground-deep"}`}>
                    <Icon size={22} weight={active ? "fill" : "bold"} />
                  </span>
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
