"use client";

import { UsersThree, GithubLogo, ArrowUpRight } from "@phosphor-icons/react";
import { MorphNav } from "./MorphNav";

export function LandingNav() {
  return (
    <MorphNav
      floating
      links={[
        { href: "#how", label: "How it works", icon: UsersThree },
        { href: "https://github.com/Venkat5599/solana_coloseum", label: "GitHub", icon: GithubLogo },
      ]}
      cta={{ href: "/tidepool", label: "Play now", icon: ArrowUpRight }}
    />
  );
}
