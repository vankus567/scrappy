"use client";

import { useState } from "react";
import { GlossButton } from "@/components/GlossButton";
import { Pet } from "@/components/Pet";
import { registerWorker } from "@/lib/api";
import { stageFor, usePet } from "@/lib/pet-store";
import { useWorkerSync } from "./useWorkerSync";

const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function WalletPanel() {
  const { pet, update } = usePet();
  const [address, setAddress] = useState(pet?.payoutAddress ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useWorkerSync();

  if (!pet) return null;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!SOLANA_ADDRESS.test(address.trim())) return setError("That doesn't look like a Solana address.");
    setBusy(true);
    setError("");
    try {
      const w = await registerWorker(address.trim(), pet.languages);
      update({ workerId: w.worker_id, payoutAddress: address.trim(), jobsDone: w.jobs_done, earnedUsdc: w.owed_usdc });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reach Scrappy. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
      <section className="rounded-[28px] bg-ground-deep p-6 sm:p-8">
        <p className="text-[14px] font-semibold text-ink-soft">Earned by {pet.name}</p>
        <p className="mt-1 font-display text-[clamp(2.6rem,6vw,3.6rem)] font-bold leading-none tabular-nums">
          ${(pet.earnedUsdc ?? 0).toFixed(2)}
        </p>
        <p className="mt-2 text-ink-soft">
          {pet.jobsDone} {pet.jobsDone === 1 ? "job" : "jobs"} done. Earnings are paid in USDC to your payout wallet.
        </p>
        <Pet species={pet.species} stage={stageFor(pet).current.id} mood="happy" dance="none" className="mt-4 w-32" title={pet.name} />
      </section>

      <form onSubmit={save} className="space-y-4 rounded-[28px] bg-ground-deep p-6 sm:p-8" noValidate>
        <h2 className="font-display text-[26px] font-bold">Payout wallet</h2>
        <p className="text-ink-soft">
          Paste your Solana wallet address (Phantom, Solflare, Seed Vault). This registers you to receive jobs in your languages and
          is where your pay goes.
        </p>
        <div className="space-y-2">
          <label htmlFor="payout" className="block text-[15px] font-medium">Solana address</label>
          <input
            id="payout"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            className="h-12 w-full rounded-[14px] bg-field px-4 font-mono text-[14px] text-ink outline-none ring-leaf focus-visible:ring-2"
          />
        </div>
        {error && <p role="alert" className="text-[15px] text-[#ffb4a3]">{error}</p>}
        {pet.workerId && !error && <p className="text-[14px] text-[#9fe3b8]">Registered. Jobs in your languages will reach {pet.name}.</p>}
        <GlossButton type="submit" disabled={busy}>{pet.workerId ? "Update wallet" : "Start receiving jobs"}</GlossButton>
      </form>
    </div>
  );
}
