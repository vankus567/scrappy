"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { X, type Icon } from "@phosphor-icons/react";

type Item = { href: string; label: string; Icon: Icon; active: boolean };

/** Wider arc once 7+ tabs fan out, so neighboring buttons keep ~60px between edges. */
const radiusFor = (n: number) => (n > 6 ? 118 : 92);

/**
 * Mobile radial nav, adapted from RewampUI "circular-radial-navbar": a round button
 * at the bottom centre shows where you are; tap it and the tabs spring out in a half circle.
 */
export function RadialNav({ items }: { items: Item[] }) {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();
  const current = items.find((i) => i.active) ?? items[0];
  const step = 180 / (items.length - 1);
  const radius = radiusFor(items.length);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="md:hidden">
      <AnimatePresence>
        {open && (
          <motion.button
            aria-label="Close menu"
            className="fixed inset-0 z-30 bg-black/40 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
          />
        )}
      </AnimatePresence>

      <nav aria-label="Main" className="fixed bottom-[calc(20px+env(safe-area-inset-bottom))] left-1/2 z-40 -translate-x-1/2">
        <div className="relative flex items-center justify-center">
          <AnimatePresence>
            {open &&
              items.map((item, i) => {
                const angle = 180 + i * step;
                const x = radius * Math.cos((angle * Math.PI) / 180);
                const y = radius * Math.sin((angle * Math.PI) / 180);
                return (
                  <motion.div
                    key={item.href}
                    className="absolute"
                    initial={reduce ? { x, y, opacity: 0 } : { x: 0, y: 0, scale: 0, opacity: 0 }}
                    animate={{ x, y, scale: 1, opacity: 1 }}
                    exit={reduce ? { opacity: 0 } : { x: 0, y: 0, scale: 0, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 400, damping: 25, delay: i * 0.04 }}
                  >
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      aria-current={item.active ? "page" : undefined}
                      className={`flex size-14 flex-col items-center justify-center rounded-full border-2 text-[10px] font-semibold ${
                        item.active ? "border-leaf bg-leaf text-on-leaf" : "border-field bg-ground-deep text-ink"
                      }`}
                    >
                      <item.Icon size={20} weight={item.active ? "fill" : "bold"} />
                      {item.label}
                    </Link>
                  </motion.div>
                );
              })}
          </AnimatePresence>

          <motion.button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label={open ? "Close menu" : `Menu, on ${current.label}`}
            whileTap={{ scale: 0.94 }}
            className="relative z-10 grid size-16 place-items-center rounded-full border-4 border-ground bg-ink text-ground"
          >
            <motion.span animate={{ rotate: open ? 90 : 0 }} transition={{ type: "spring", stiffness: 300, damping: 20 }}>
              {open ? <X size={28} weight="bold" /> : <current.Icon size={28} weight="fill" />}
            </motion.span>
          </motion.button>
        </div>
      </nav>
    </div>
  );
}
