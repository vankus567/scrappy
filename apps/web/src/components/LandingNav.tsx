"use client";

import { GameController, GithubLogo, ArrowUpRight } from "@phosphor-icons/react";
import { MorphNav } from "./MorphNav";

export function LandingNav() {
  return (
    <MorphNav
      floating
      links={[
        { href: "#how", label: "How it works", icon: GameController },
        { href: "https://github.com/vankus567/scrappy", label: "GitHub", icon: GithubLogo },
      ]}
      cta={{ href: "/scrappyboy?net=devnet", label: "Play now", icon: ArrowUpRight }}
    />
  );
}
