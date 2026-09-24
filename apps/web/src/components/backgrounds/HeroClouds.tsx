"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

// WebGL shader clouds (RewampUI "pixel-cloud-background", three.js). Client only.
const PixelCloud = dynamic(() => import("./PixelCloud"), { ssr: false });

/**
 * Candy-sky pixel clouds behind the hero. The CSS gradient underneath is the
 * fallback when WebGL is unavailable, so the hero never renders empty.
 * Under reduced motion the clouds hold still.
 */
export function HeroClouds() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    setReduce(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_bottom,#a9d1ff,#ddeeff)]">
      <PixelCloud
        cloudColor="#f7fbff"
        skyTopColor="#a9d1ff"
        skyBottomColor="#ddeeff"
        speed={reduce ? 0 : 1}
        count={6}
        pixelSize={6}
        className="h-full w-full"
      />
    </div>
  );
}
