"use client";

import { BookOpen, ChartLineUp, SquaresFour, ArrowUpRight } from "@phosphor-icons/react";
import { MorphNav } from "./MorphNav";

export function LandingNav() {
  return (
    <MorphNav
      floating
      links={[
        { href: "/docs", label: "Docs", icon: BookOpen },
        { href: "/live", label: "Live", icon: ChartLineUp },
        { href: "/dev", label: "Dashboard", icon: SquaresFour },
      ]}
      cta={{ href: "/app", label: "Earn with Scrappy", icon: ArrowUpRight }}
    />
  );
}
