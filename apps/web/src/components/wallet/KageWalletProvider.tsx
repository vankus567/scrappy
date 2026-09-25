"use client";

import { WalletProvider } from "@solana/wallet-adapter-react";
import { useEffect } from "react";
import { WalletPickerProvider } from "./WalletPicker";

let mwaRegistered = false;

/**
 * Solana wallet adapter for the whole app. Wallet Standard wallets (Phantom, Solflare, Backpack, ...) register
 * themselves; on Android and Seeker we also register Mobile Wallet Adapter (Seed Vault and installed wallet apps).
 * The wallet is only used to prove a payout address and sign in: Kage never asks it to approve per-task transactions.
 */
export function KageWalletProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (mwaRegistered || !/android/i.test(navigator.userAgent)) return;
    mwaRegistered = true;
    import("@solana-mobile/wallet-standard-mobile").then((m) =>
      m.registerMwa({
        appIdentity: { name: "Kage", uri: window.location.origin, icon: "/icon-192.png" },
        authorizationCache: m.createDefaultAuthorizationCache(),
        chains: ["solana:mainnet", "solana:devnet"],
        chainSelector: m.createDefaultChainSelector(),
        onWalletNotFound: m.createDefaultWalletNotFoundHandler(),
      }),
    );
  }, []);

  return (
    <WalletProvider wallets={[]} autoConnect localStorageKey="kage.wallet">
      <WalletPickerProvider>{children}</WalletPickerProvider>
    </WalletProvider>
  );
}
