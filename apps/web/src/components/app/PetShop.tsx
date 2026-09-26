"use client";

import { useCallback, useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Connection, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { GlossButton } from "@/components/GlossButton";
import { Pet, SPECIES, type Species } from "@/components/Pet";
import { useWalletPicker } from "@/components/wallet/WalletPicker";
import { buyPet, equipPet, getShop, type ShopView } from "@/lib/api";
import { usePet } from "@/lib/pet-store";

const RPC = { devnet: "https://api.devnet.solana.com", mainnet: "https://api.mainnet-beta.solana.com" } as const;
const TIER_LABEL = { common: "Common", rare: "Rare", legendary: "Legendary" } as const;

/** Unlock more pets with SOL, then pick which one you battle with. Payments are checked on-chain by the server. */
export function PetShop() {
  const { pet, update } = usePet();
  const token = pet?.workerId;
  const { publicKey, connected, sendTransaction } = useWallet();
  const { open } = useWalletPicker();
  const [shop, setShop] = useState<ShopView | null>(null);
  const [busy, setBusy] = useState<string>("");
  const [note, setNote] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setShop(await getShop(token));
    } catch (e) {
      setNote({ kind: "err", text: e instanceof Error ? e.message : "Couldn't open the shop." });
    }
  }, [token]);
  useEffect(() => {
    load();
  }, [load]);

  const buy = async (species: string, priceSol: number) => {
    if (!token || !shop?.pay_to) return;
    if (!connected || !publicKey) {
      open();
      return;
    }
    if (pet?.payoutAddress && publicKey.toBase58() !== pet.payoutAddress) {
      setNote({ kind: "err", text: "Pay from the wallet you signed in with." });
      return;
    }
    setBusy(species);
    setNote(null);
    try {
      const connection = new Connection(RPC[shop.network], "confirmed");
      const tx = new Transaction().add(
        SystemProgram.transfer({ fromPubkey: publicKey, toPubkey: new PublicKey(shop.pay_to), lamports: Math.round(priceSol * 1e9) }),
      );
      const sig = await sendTransaction(tx, connection);
      setNote({ kind: "ok", text: "Payment sent. Checking it on Solana..." });
      await connection.confirmTransaction(sig, "confirmed");
      // the server re-checks the payment on-chain; retry briefly while it propagates
      let res: ShopView | null = null;
      for (let i = 0; i < 5 && !res; i++) {
        try {
          res = await buyPet(token, species, sig);
        } catch (e) {
          if (i === 4 || !(e instanceof Error) || !/not found yet/.test(e.message)) throw e;
          await new Promise((r) => window.setTimeout(r, 1500));
        }
      }
      setShop(res);
      setNote({ kind: "ok", text: `${SPECIES[species as Species]?.name ?? "Pet"} unlocked!` });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "The payment didn't go through.";
      setNote({ kind: "err", text: /insufficient|0x1|debit/i.test(msg) ? `Not enough SOL. Get free devnet SOL at faucet.solana.com.` : msg });
    } finally {
      setBusy("");
    }
  };

  const equip = async (species: string) => {
    if (!token) return;
    setBusy(species);
    setNote(null);
    try {
      setShop(await equipPet(token, species));
      update({ species: species as Species });
      setNote({ kind: "ok", text: `${SPECIES[species as Species]?.name ?? "Your pet"} is your battle pet now.` });
    } catch (e) {
      setNote({ kind: "err", text: e instanceof Error ? e.message : "Couldn't switch pets." });
    } finally {
      setBusy("");
    }
  };

  if (!token) {
    return (
      <div className="rounded-[28px] bg-ground-deep p-8 text-center">
        <h1 className="font-display text-[clamp(1.8rem,3vw,2.4rem)] font-bold">Pet shop</h1>
        <p className="mt-2 text-ink-soft">Connect your wallet to unlock more pets.</p>
        <div className="mt-5"><GlossButton href="/app/wallet">Connect wallet</GlossButton></div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[28px] bg-ground-deep p-6 sm:p-8">
        <h1 className="font-display text-[clamp(1.8rem,3vw,2.4rem)] font-bold">Pet shop</h1>
        <p className="mt-1 text-ink-soft">
          Unlock new pets with SOL, then pick who battles for you.
          {shop?.network === "devnet" && " Testing on devnet: prices are in free test SOL (faucet.solana.com)."}
        </p>
        {note && <p role={note.kind === "err" ? "alert" : "status"} className={`mt-3 text-[15px] font-semibold ${note.kind === "err" ? "text-[#c2410c]" : "text-[#15803d]"}`}>{note.text}</p>}
      </section>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {(shop?.pets ?? []).map((p) => {
          const equipped = shop?.equipped === p.species;
          return (
            <li key={p.species} className={`flex flex-col items-center rounded-[24px] bg-ground-deep p-4 text-center ${equipped ? "ring-2 ring-[#007aff]" : ""}`}>
              <Pet species={p.species as Species} face={equipped ? pet?.face : undefined} mood={p.owned ? "happy" : "curious"} dance={equipped ? "bounce" : "none"} className="w-full max-w-[130px]" title={p.name} />
              <p className="mt-1 font-display text-[18px] font-bold">{p.name}</p>
              <p className="text-[13px] text-ink-soft">{TIER_LABEL[p.tier]}</p>
              <div className="mt-3 w-full">
                {equipped ? (
                  <p className="min-h-11 py-2.5 text-[15px] font-semibold text-[#15803d]">Battling</p>
                ) : p.owned ? (
                  <button type="button" onClick={() => equip(p.species)} disabled={!!busy} className="min-h-11 w-full rounded-[14px] bg-field font-semibold transition-colors hover:bg-field-hover disabled:opacity-50">
                    {busy === p.species ? "Switching..." : "Use this pet"}
                  </button>
                ) : (
                  <button type="button" onClick={() => buy(p.species, p.price_sol)} disabled={!!busy || !shop?.pay_to} className="min-h-11 w-full rounded-[14px] bg-[#007aff] font-semibold text-white transition-colors hover:bg-[#0060cc] disabled:opacity-50">
                    {busy === p.species ? "Paying..." : `${p.price_sol} SOL`}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
