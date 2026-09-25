"use client";

import { WalletReadyState, type WalletName } from "@solana/wallet-adapter-base";
import { useWallet } from "@solana/wallet-adapter-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { createContext, useCallback, useContext, useEffect, useState } from "react";

type Ctx = { open: () => void };
const PickerCtx = createContext<Ctx>({ open: () => {} });
export const useWalletPicker = () => useContext(PickerCtx);

/** Kage's wallet picker: a bottom sheet on phones, a centred panel on desktop. Replaces the stock adapter modal. */
export function WalletPickerProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const open = useCallback(() => setOpen(true), []);
  return (
    <PickerCtx.Provider value={{ open }}>
      {children}
      <Sheet open={isOpen} onClose={() => setOpen(false)} />
    </PickerCtx.Provider>
  );
}

function Sheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { wallets, select, connecting } = useWallet();
  const reduce = useReducedMotion();
  const [picked, setPicked] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const ready = wallets.filter((w) => w.readyState === WalletReadyState.Installed || w.readyState === WalletReadyState.Loadable);

  const choose = (name: WalletName) => {
    setPicked(name);
    select(name); // autoConnect connects once selected
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-labelledby="wallet-title">
          <motion.button
            aria-label="Close"
            className="absolute inset-0 bg-black/55"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="relative w-full max-w-md rounded-t-[28px] bg-ground-deep p-6 pb-[calc(24px+env(safe-area-inset-bottom))] ring-1 ring-edge sm:rounded-[28px]"
            initial={reduce ? { opacity: 0 } : { y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { y: 40, opacity: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 36 }}
          >
            <h2 id="wallet-title" className="font-display text-[26px] font-bold">Connect a wallet</h2>
            <p className="mt-1 text-[15px] text-ink-soft">This is where your USDC lands. You sign once to prove it&apos;s yours; tasks never ask for approval.</p>

            {ready.length ? (
              <ul className="mt-5 space-y-2">
                {ready.map((w) => (
                  <li key={w.adapter.name}>
                    <button
                      type="button"
                      disabled={connecting}
                      onClick={() => choose(w.adapter.name)}
                      className="kage-focus flex min-h-14 w-full items-center gap-3 rounded-[16px] bg-field px-4 text-left font-semibold transition-colors hover:bg-field-hover disabled:opacity-60"
                    >
                      {/* wallet icons are data URIs supplied by the wallet itself */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={w.adapter.icon} alt="" className="size-7 rounded-[6px]" />
                      <span className="flex-1">{w.adapter.name}</span>
                      <span className="text-[13px] font-medium text-ink-faint">
                        {connecting && picked === w.adapter.name ? "Opening…" : w.readyState === WalletReadyState.Installed ? "Detected" : "Mobile"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-5 rounded-[16px] bg-field p-4 text-[15px] text-ink-soft">
                No wallet found in this browser. Install{" "}
                <a className="font-semibold text-leaf hover:text-leaf-hover" href="https://phantom.com/download" target="_blank" rel="noreferrer">Phantom</a> or{" "}
                <a className="font-semibold text-leaf hover:text-leaf-hover" href="https://solflare.com/download" target="_blank" rel="noreferrer">Solflare</a>, or open Kage inside your wallet app. You can also paste an address instead.
              </div>
            )}
            <button type="button" onClick={onClose} className="kage-focus mt-4 w-full rounded-[14px] py-3 text-[15px] font-semibold text-ink-soft hover:text-ink">
              Not now
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
