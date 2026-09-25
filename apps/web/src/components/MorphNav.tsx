"use client";

import Link from "next/link";
import { useState } from "react";
import { motion, useMotionValueEvent, useReducedMotion, useScroll } from "motion/react";
import type { Icon } from "@phosphor-icons/react";
import { Wordmark } from "./kage/Wordmark";

export type MorphLink = { href: string; label: string; icon: Icon; active?: boolean };

type Props = {
  links: MorphLink[];
  cta?: { href: string; label: string; icon: Icon };
  className?: string;
  /** Float over the page (landing) instead of taking layout space. */
  floating?: boolean;
  /** Custom right-hand control (e.g. the wallet button); replaces cta. */
  right?: React.ReactNode;
};

const SPRING = { type: "spring", stiffness: 300, damping: 28, mass: 0.8 } as const;

/**
 * Morphing header, adapted from RewampUI "hero-morph-navbar": a full bar at the top of the
 * page that springs into a floating icon pill once the page scrolls. Scroll state comes from
 * Motion's useScroll (no window scroll listener). Always rendered and visible.
 */
export function MorphNav({ links, cta, className, floating = false, right }: Props) {
  const { scrollY } = useScroll();
  const reduce = useReducedMotion();
  const [scrolled, setScrolled] = useState(false);
  useMotionValueEvent(scrollY, "change", (y) => setScrolled(y > 40));

  return (
    <div className={`${floating ? "fixed inset-x-0" : "sticky"} top-0 z-30 flex justify-center px-4 pt-3 sm:px-8 ${className ?? ""}`}>
      <motion.nav
        layout={!reduce}
        transition={SPRING}
        aria-label="Main"
        className={`flex items-center justify-between gap-3 border transition-colors duration-300 ${
          scrolled
            ? "h-14 w-full max-w-[420px] rounded-full border-edge bg-ground-deep/90 px-2.5 backdrop-blur-xl"
            : "h-16 w-full max-w-[1400px] rounded-[22px] border-transparent bg-ground-deep px-5"
        }`}
      >
        <Link href="/" className="flex shrink-0 items-center gap-2 pl-1" aria-label="Kage home">
          <motion.span layout={!reduce} transition={SPRING} className="block pb-1">
            <Wordmark className={scrolled ? "text-[20px]" : "text-[24px]"} />
          </motion.span>
        </Link>

        <ul className={`items-center ${scrolled ? "flex gap-1" : "hidden gap-2 sm:flex"}`}>
          {links.map(({ href, label, icon: I, active }) => (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                title={label}
                className={`relative flex items-center justify-center transition-colors ${
                  scrolled ? "size-10 rounded-full" : "rounded-[12px] px-3.5 py-2 text-[15px]"
                } ${active ? "font-semibold text-on-leaf" : "text-ink-soft hover:text-ink"}`}
              >
                {active && (
                  <motion.span
                    layoutId="morph-nav-active"
                    transition={SPRING}
                    className={`absolute inset-0 bg-leaf ${scrolled ? "rounded-full" : "rounded-[12px]"}`}
                  />
                )}
                <span className="relative flex items-center gap-2">
                  {scrolled ? <I size={20} weight={active ? "fill" : "bold"} /> : label}
                </span>
                {scrolled && <span className="sr-only">{label}</span>}
              </Link>
            </li>
          ))}
        </ul>

        {right}
        {!right && cta && (
          <Link
            href={cta.href}
            className={`group flex shrink-0 items-center justify-center gap-2 bg-leaf font-semibold text-on-leaf transition-colors hover:bg-leaf-hover ${
              scrolled ? "size-10 rounded-full" : "h-11 rounded-[14px] px-5 text-[15px]"
            }`}
            title={cta.label}
          >
            {!scrolled && <span>{cta.label}</span>}
            <cta.icon size={18} weight="bold" className="transition-transform group-hover:translate-x-0.5" />
            {scrolled && <span className="sr-only">{cta.label}</span>}
          </Link>
        )}
      </motion.nav>
    </div>
  );
}
