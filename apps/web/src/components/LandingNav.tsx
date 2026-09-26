"use client";

import { UsersThree, GithubLogo, ArrowUpRight } from "@phosphor-icons/react";
import { MorphNav } from "./MorphNav";

export function LandingNav() {
  return (
    <MorphNav
      floating
      links={[
        { href: "#ai-teams", label: "Play with friends", icon: UsersThree },
        { href: "https://github.com/Venkat5599/solana_coloseum", label: "GitHub", icon: GithubLogo },
      ]}
      cta={{ href: "/app", label: "Hatch a pet", icon: ArrowUpRight }}
    />
  );
}
