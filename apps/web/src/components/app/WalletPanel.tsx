"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { base58 } from "@scure/base";
import { useEffect, useRef, useState } from "react";
import { GlossButton } from "@/components/GlossButton";
import { Pet } from "@/components/Pet";
import { useWalletPicker } from "@/components/wallet/WalletPicker";
import { ApiError, registerWorker, signInMessage, signInWorker } from "@/lib/api";
import { stageFor, usePet } from "@/lib/pet-store";
import { useWorkerSync } from "./useWorkerSync";

const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

export function WalletPanel() {
  const { pet, update } = usePet();
  const { publicKey, connected, signMessage, disconnect, wallet } = useWallet();
  const { open } = useWalletPicker();
  const [address, setAddress] = useState(pet?.payoutAddress ?? "");
  const [pasting, setPasting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const wantsLink = useRef(false);
  useWorkerSync();

  // Register (or sign in) with the given address. Signing only happens for a wallet that already has a Scrappy.
  const link = async (addr: string, canSign: boolean) => {
    if (!pet) return;
    setBusy(true);
    setError("");
    try {
      let token: string;
      try {
        token = (await registerWorker(addr, pet.languages, { pet_name: pet.name, species: pet.species, city: pet.city || undefined })).worker_id;
      } catch (err) {
        if (!(err instanceof ApiError && err.code === "wallet_registered") || !canSign || !signMessage) throw err;
        const nonce = base58.encode(crypto.getRandomValues(new Uint8Array(16)));
        const issuedAt = new Date().toISOString();
        const sig = await signMessage(new TextEncoder().encode(signInMessage(addr, nonce, issuedAt)));
        token = await signInWorker(addr, nonce, issuedAt, base58.encode(sig));
      }
      if ("Notification" in window && Notification.permission === "default") Notification.requestPermission().catch(() => {});
      update({ workerId: token, payoutAddress: addr });
      setPasting(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reach Scrappy. Try again.");
    } finally {
      setBusy(false);
    }
  };

  // After the person picks a wallet, link it once.
  useEffect(() => {
    if (!wantsLink.current || !connected || !publicKey) return;
    wantsLink.current = false;
    link(publicKey.toBase58(), true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, publicKey]);

  if (!pet) return null;

  const connect = () => {
    setError("");
    wantsLink.current = true;
    if (connected && publicKey) {
      wantsLink.current = false;
      link(publicKey.toBase58(), true);
    } else open();
  };

  const savePasted = (e: React.FormEvent) => {
    e.preventDefault();
    if (!SOLANA_ADDRESS.test(address.trim())) return setError("That doesn't look like a Solana address.");
    link(address.trim(), false);
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
      <section className="rounded-[28px] bg-ground-deep p-6 sm:p-8">
        <p className="text-[14px] font-semibold text-ink-soft">{pet.name}'s record</p>
        <p className="mt-1 font-display text-[clamp(2.6rem,6vw,3.6rem)] font-bold leading-none tabular-nums">
          {pet.jobsDone} {pet.jobsDone === 1 ? "win" : "wins"}
        </p>
        <p className="mt-2 text-ink-soft">Your wallet is {pet.name}'s home on Solana. It's how friends challenge you and how battles are recorded.</p>
        <div className="app-bob mt-4 w-32">
          <Pet species={pet.species} stage={stageFor(pet).current.id} mood="happy" dance="none" className="w-full" title={pet.name} />
        </div>
      </section>

      <section className="space-y-4 rounded-[28px] bg-ground-deep p-6 sm:p-8">
        <h2 className="font-display text-[26px] font-bold">Wallet</h2>
        <p className="text-ink-soft">
          Connect Phantom, Solflare, Backpack or Seed Vault. It signs you in so {pet.name} can battle.
          Scrappy never asks your wallet to approve payments.
        </p>

        {pet.payoutAddress && (
          <p className="rounded-[14px] bg-field px-4 py-3 text-[15px]">
            Connected <span className="font-mono font-semibold">{short(pet.payoutAddress)}</span>
            {connected && wallet && <span className="text-ink-soft"> · {wallet.adapter.name}</span>}
          </p>
        )}

        {error && <p role="alert" className="text-[15px] font-semibold text-[#c2410c]">{error}</p>}
        {pet.workerId && !error && !busy && <p className="text-[15px] font-semibold text-[#15803d]">Connected. {pet.name} is ready to battle.</p>}

        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <GlossButton type="button" onClick={connect} disabled={busy}>
            {busy ? "Check your wallet" : pet.workerId ? "Reconnect wallet" : "Connect wallet"}
          </GlossButton>
          {connected ? (
            <button type="button" onClick={() => disconnect()} className="text-[15px] font-semibold text-ink-soft transition-colors hover:text-ink">
              Disconnect
            </button>
          ) : (
            <button type="button" onClick={() => setPasting((p) => !p)} className="text-[15px] font-semibold text-[#007aff] transition-colors hover:text-[#0060cc]">
              {pasting ? "Cancel" : "Paste an address instead"}
            </button>
          )}
        </div>

        {pasting && (
          <form onSubmit={savePasted} className="space-y-2" noValidate>
            <label htmlFor="payout" className="block text-[15px] font-medium">Solana address</label>
            <div className="flex gap-2">
              <input
                id="payout"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                spellCheck={false}
                autoComplete="off"
                className="h-12 min-w-0 flex-1 rounded-[14px] bg-field px-4 font-mono text-[14px] text-ink outline-none ring-[#007aff] focus-visible:ring-2"
              />
              <button type="submit" disabled={busy} className="h-12 shrink-0 rounded-[14px] bg-[#007aff] px-5 font-semibold text-white transition-colors hover:bg-[#0060cc] disabled:opacity-60">
                Save
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
