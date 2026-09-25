"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { base58 } from "@scure/base";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { SPECIES, type Species } from "@/components/Pet";
import { ApiError, registerWorker, signInWorker } from "@/lib/api";
import { LANGUAGES, usePet, type Language } from "@/lib/pet-store";
import { useWalletPicker } from "./WalletPicker";

type Intent = "join" | "signin";
type Status = { state: "idle" | "working" | "error"; message?: string };
type Ctx = { start: (intent: Intent) => void; status: Status; mismatch: boolean };
const LinkCtx = createContext<Ctx>({ start: () => {}, status: { state: "idle" }, mismatch: false });
export const useWalletLink = () => useContext(LinkCtx);

/** Must match apps/api/src/auth.ts signInMessage. */
const message = (wallet: string, nonce: string, issuedAt: string) => `Kage sign-in\nwallet: ${wallet}\nnonce: ${nonce}\nissued: ${issuedAt}`;

/**
 * Turns "wallet connected" into "signed in to Kage". Only acts after the person taps Connect (never on silent
 * auto-connect): a new wallet registers; a wallet that already has a Kage signs one message to prove it.
 */
export function WalletLinkProvider({ children }: { children: React.ReactNode }) {
  const { publicKey, connected, signMessage, disconnect } = useWallet();
  const { pet, hatch, update } = usePet();
  const { open } = useWalletPicker();
  const intent = useRef<Intent | null>(null);
  const [status, setStatus] = useState<Status>({ state: "idle" });
  const [attempt, setAttempt] = useState(0);

  const start = useCallback(
    (i: Intent) => {
      intent.current = i;
      setStatus({ state: "idle" });
      setAttempt((n) => n + 1); // already connected: the effect below links right away
      if (!connected) open();
    },
    [connected, open],
  );

  const signIn = useCallback(
    async (address: string) => {
      if (!signMessage) throw new Error("This wallet can't sign messages. Try Phantom, Solflare or Seed Vault.");
      const nonce = base58.encode(crypto.getRandomValues(new Uint8Array(16)));
      const issuedAt = new Date().toISOString();
      const sig = await signMessage(new TextEncoder().encode(message(address, nonce, issuedAt)));
      return signInWorker({ wallet: address, nonce, issued_at: issuedAt, signature: base58.encode(sig) });
    },
    [signMessage],
  );

  useEffect(() => {
    const i = intent.current;
    if (!connected || !publicKey || !i) return;
    intent.current = null;
    const address = publicKey.toBase58();
    let alive = true;
    (async () => {
      setStatus({ state: "working", message: "Check your wallet" });
      try {
        if (pet && !pet.workerToken) {
          try {
            const r = await registerWorker({ wallet: address, languages: pet.languages, pet_name: pet.name, species: pet.species, city: pet.city || undefined });
            update({ workerToken: r.worker_token, wallet: address });
          } catch (err) {
            if (!(err instanceof ApiError && err.status === 409)) throw err;
            const r = await signIn(address);
            update({ workerToken: r.worker_token, wallet: address });
          }
        } else if (!pet) {
          const r = await signIn(address);
          const species = (r.profile.species && r.profile.species in SPECIES ? r.profile.species : "mochi") as Species;
          const languages = r.profile.languages.filter((l): l is Language => LANGUAGES.some((x) => x.id === l));
          hatch({ species, name: r.profile.pet_name ?? "Kage", languages, city: r.profile.city ?? "", college: "" });
          update({ workerToken: r.worker_token, wallet: address });
        }
        if (alive) setStatus({ state: "idle" });
        if ("Notification" in window && Notification.permission === "default") Notification.requestPermission().catch(() => {});
      } catch (err) {
        const msg = err instanceof ApiError && err.status === 401 && i === "signin"
          ? "No Kage for this wallet yet. Create one first."
          : err instanceof Error ? err.message : "Could not connect.";
        if (alive) setStatus({ state: "error", message: msg });
        if (i === "signin") disconnect().catch(() => {});
      }
    })();
    return () => {
      alive = false;
    };
  }, [attempt, connected, publicKey, pet, hatch, update, signIn, disconnect]);

  const mismatch = !!(connected && publicKey && pet?.wallet && pet.workerToken && publicKey.toBase58() !== pet.wallet);
  return <LinkCtx.Provider value={{ start, status, mismatch }}>{children}</LinkCtx.Provider>;
}
