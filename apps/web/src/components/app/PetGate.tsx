"use client";

import { usePet } from "@/lib/pet-store";
import { Hatch } from "./Hatch";

/** Every /app route needs a Scrappy: loading skeleton, then Hatch for new people, then the page. */
export function PetGate({ children }: { children: React.ReactNode }) {
  const { ready, pet } = usePet();
  if (!ready) return <div aria-busy="true" className="aspect-[4/3] w-full animate-pulse rounded-[28px] bg-ground-deep md:w-3/5" />;
  return pet ? <>{children}</> : <Hatch />;
}
