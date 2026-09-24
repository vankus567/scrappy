"use client";

import dynamic from "next/dynamic";

export const AgentOrbClient = dynamic(() => import("./AgentOrb"), {
  ssr: false,
  loading: () => <div aria-hidden className="agent-orb size-full" />,
});
