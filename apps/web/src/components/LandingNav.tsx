"use client";

import { Robot, GithubLogo, ArrowUpRight } from "@phosphor-icons/react";
import { MorphNav } from "./MorphNav";

export function LandingNav() {
  return (
    <MorphNav
      floating
      links={[
        { href: "#ai-teams", label: "For AI teams", icon: Robot },
        { href: "https://github.com/Venkat5599/solana_coloseum", label: "GitHub", icon: GithubLogo },
      ]}
      cta={{ href: "/app", label: "Hatch a pet", icon: ArrowUpRight }}
    />
  );
}
