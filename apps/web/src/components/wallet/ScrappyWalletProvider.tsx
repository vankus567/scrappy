"use client";

import { WalletProvider } from "@solana/wallet-adapter-react";
import type { WalletError } from "@solana/wallet-adapter-base";
import { useCallback, useEffect } from "react";
import { type PickerCopy, WalletPickerProvider } from "./WalletPicker";

let mwaRegistered = false;

/** The console announces wallet failures on the page instead of only in the dev console. */
export const WALLET_ERROR_EVENT = "scrappy:wallet-error";

/**
 * Solana wallet adapter for the whole app. Wallet Standard wallets (Phantom, Solflare, Backpack, ...) register
 * themselves; on Android and Seeker we also register Mobile Wallet Adapter (Seed Vault and installed wallet apps).
 * The wallet only tops up the play key; every game move after that is signed on-device.
 */
export function ScrappyWalletProvider({ children, copy }: { children: React.ReactNode; copy?: PickerCopy }) {
  useEffect(() => {
    if (mwaRegistered || !/android/i.test(navigator.userAgent)) return;
    mwaRegistered = true;
    // Ask the phone wallet for the cluster this page actually plays on. Offering both lets the
    // default selector pick mainnet, and a mainnet-authorized wallet then hangs on devnet top-ups.
    const devnet = new URLSearchParams(window.location.search).get("net") === "devnet";
    const chain = devnet ? "solana:devnet" : "solana:mainnet";
    import("@solana-mobile/wallet-standard-mobile").then((m) => {
      const base = m.createDefaultAuthorizationCache();
      // A remembered authorization for the other cluster is not reused: it would carry the wrong chain.
      const authorizationCache: typeof base = {
        ...base,
        get: async () => {
          const cached = await base.get();
          return cached && (cached as { chain?: string }).chain === chain ? cached : undefined;
        },
      };
      m.registerMwa({
        appIdentity: { name: "Scrappy", uri: window.location.origin, icon: "/icon-192.png" },
        authorizationCache,
        chains: [chain],
        chainSelector: m.createDefaultChainSelector(),
        onWalletNotFound: m.createDefaultWalletNotFoundHandler(),
      });
    });
  }, []);

  // Without this the adapter swallows connect failures and the player only sees a spinner end.
  const onError = useCallback((e: WalletError) => {
    const msg = e.message || e.name || "the wallet refused the request";
    window.dispatchEvent(new CustomEvent(WALLET_ERROR_EVENT, { detail: msg }));
  }, []);

  return (
    <WalletProvider wallets={[]} autoConnect localStorageKey="scrappy.wallet" onError={onError}>
      <WalletPickerProvider copy={copy}>{children}</WalletPickerProvider>
    </WalletProvider>
  );
}
