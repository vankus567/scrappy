"use client";

import { usePet } from "@/lib/pet-store";
import { Hatch } from "./Hatch";
import { Home } from "./Home";

export function PetGate() {
  const { ready, pet } = usePet();
  if (!ready) {
    return <div aria-busy="true" className="aspect-[4/3] w-full animate-pulse rounded-[28px] bg-ground-deep md:w-3/5" />;
  }
  return pet ? <Home /> : <Hatch />;
}
