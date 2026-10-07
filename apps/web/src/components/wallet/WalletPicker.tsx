"use client";

import { WalletReadyState, type WalletName } from "@solana/wallet-adapter-base";
import { useWallet } from "@solana/wallet-adapter-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { createContext, useCallback, useContext, useEffect, useState } from "react";

type Ctx = { open: () => void };
export interface PickerCopy {
  title: string;
  body: string;
}
const DEFAULT_COPY: PickerCopy = {
  title: "Connect a wallet",
  body: "This is where your pet's winnings land. You sign once to prove it's yours; battles never ask for approval.",
};
const PickerCtx = createContext<Ctx>({ open: () => {} });
export const useWalletPicker = () => useContext(PickerCtx);

/** Scrappy's wallet picker: a bottom sheet on phones, a centred panel on desktop. Replaces the stock adapter modal. */
export function WalletPickerProvider({ children, copy = DEFAULT_COPY }: { children: React.ReactNode; copy?: PickerCopy }) {
  const [isOpen, setOpen] = useState(false);
  const open = useCallback(() => setOpen(true), []);
  return (
    <PickerCtx.Provider value={{ open }}>
      {children}
      <Sheet open={isOpen} onClose={() => setOpen(false)} copy={copy} />
    </PickerCtx.Provider>
  );
}

function Sheet({ open, onClose, copy }: { open: boolean; onClose: () => void; copy: PickerCopy }) {
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
            <h2 id="wallet-title" className="font-display text-[26px] font-bold">{copy.title}</h2>
            <p className="mt-1 text-[15px] text-ink-soft">{copy.body}</p>

            {ready.length ? (
              <ul className="mt-5 space-y-2">
                {ready.map((w) => (
                  <li key={w.adapter.name}>
                    <button
                      type="button"
                      disabled={connecting}
                      onClick={() => choose(w.adapter.name)}
                      className="scrappy-focus flex min-h-14 w-full items-center gap-3 rounded-[16px] bg-field px-4 text-left font-semibold transition-colors hover:bg-field-hover disabled:opacity-60"
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
                <a className="font-semibold text-leaf hover:text-leaf-hover" href="https://solflare.com/download" target="_blank" rel="noreferrer">Solflare</a>, or open Scrappy inside your wallet app. You can also paste an address instead.
              </div>
            )}
            <InWalletLinks />
            <button type="button" onClick={onClose} className="scrappy-focus mt-4 w-full rounded-[14px] py-3 text-[15px] font-semibold text-ink-soft hover:text-ink">
              Not now
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

/**
 * On a phone, the most reliable connection is to open this page inside the wallet's own browser,
 * where the wallet is injected directly and no app-to-app handshake is needed.
 */
function InWalletLinks() {
  // The sheet only renders after a tap, so reading the browser here never meets server HTML.
  if (typeof window === "undefined" || !/android|iphone|ipad/i.test(navigator.userAgent)) return null;
  const url = encodeURIComponent(window.location.href);
  const ref = encodeURIComponent(window.location.origin);
  const links = [
    { name: "Phantom", href: `https://phantom.app/ul/browse/${url}?ref=${ref}` },
    { name: "Solflare", href: `https://solflare.com/ul/v1/browse/${url}?ref=${ref}` },
  ];
  return (
    <div className="mt-4 text-[14px] text-ink-soft">
      Not connecting? Open this page inside your wallet app instead:{" "}
      {links.map((l, i) => (
        <span key={l.name}>
          {i > 0 && " · "}
          <a className="font-semibold text-leaf hover:text-leaf-hover" href={l.href}>
            {l.name}
          </a>
        </span>
      ))}
      . In Backpack, open its browser tab and paste this page&apos;s address.
    </div>
  );
}
