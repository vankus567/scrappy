"use client";

import { useState } from "react";
import { ApiError, registerWorker } from "@/lib/api";
import { usePet } from "@/lib/pet-store";
import { Button } from "@/components/ui/Button";
import { useWalletLink } from "@/components/wallet/WalletLink";

const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/**
 * Link a payout wallet. Primary: connect a wallet app through the Solana wallet adapter (new wallet registers;
 * an existing Scrappy signs in with one signature). Fallback: paste an address (register only).
 */
export function JoinPanel({ title = "Connect your payout wallet", compact = false }: { title?: string; compact?: boolean }) {
  const { pet, update } = usePet();
  const { start, status } = useWalletLink();
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!pet) return null;

  const withAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    const a = address.trim();
    if (!SOLANA_ADDRESS.test(a)) return setError("That doesn't look like a Solana address.");
    setBusy(true);
    setError("");
    try {
      const r = await registerWorker({ wallet: a, languages: pet.languages, pet_name: pet.name, species: pet.species, city: pet.city || undefined });
      update({ workerToken: r.worker_token, wallet: a });
      if ("Notification" in window && Notification.permission === "default") Notification.requestPermission().catch(() => {});
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 409
          ? "This wallet already has a Scrappy. Use Connect wallet above to sign in with it."
          : err instanceof Error ? err.message : "Could not reach Scrappy.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={`rounded-[26px] bg-ground-deep ${compact ? "p-5" : "p-6 sm:p-8"}`}>
      <h2 className="font-display text-[clamp(1.5rem,3vw,2rem)] font-bold leading-tight">{title}</h2>
      <p className="mt-2 max-w-md text-ink-soft">Agents pay in USDC. It lands in this wallet. You never approve anything per task.</p>

      <Button type="button" className="mt-5" arrow onClick={() => start("join")} disabled={status.state === "working"}>
        {status.state === "working" ? "Check your wallet…" : "Connect wallet"}
      </Button>
      {status.state === "error" && <p role="alert" className="mt-3 text-[15px] text-[#ffb4a3]">{status.message}</p>}

      <form onSubmit={withAddress} className="mt-6 space-y-2" noValidate>
        <label htmlFor="payout" className="block text-[14px] text-ink-soft">No wallet app on this device? Paste a Solana address</label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="payout"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            className="h-12 min-w-0 flex-1 rounded-[14px] bg-field px-4 font-mono text-[14px] outline-none focus-visible:ring-2 focus-visible:ring-leaf"
          />
          <button type="submit" disabled={busy} className="scrappy-focus h-12 shrink-0 rounded-[14px] bg-field px-5 font-semibold transition-colors hover:bg-field-hover disabled:opacity-60">
            {busy ? "Saving…" : "Use this address"}
          </button>
        </div>
      </form>
      {error && <p role="alert" className="mt-3 text-[15px] text-[#ffb4a3]">{error}</p>}
    </section>
  );
}
