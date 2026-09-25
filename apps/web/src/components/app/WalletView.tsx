"use client";

import { useEffect, useState } from "react";
import { getHistory, txUrl, type History } from "@/lib/api";
import { usePet } from "@/lib/pet-store";
import { Arrow } from "@/components/ui/Button";
import { JoinPanel } from "./JoinPanel";
import { useWorker } from "./useWorker";

const short = (s: string) => `${s.slice(0, 4)}…${s.slice(-4)}`;

/** Money in plain terms. Every payout links to its Solana transaction for anyone who wants to check. */
export function WalletView() {
  const { pet } = usePet();
  const { token, profile } = useWorker();
  const [history, setHistory] = useState<History | null>(null);

  useEffect(() => {
    if (token) getHistory(token).then(setHistory).catch(() => {});
  }, [token, profile?.earnings.paid_usdc]);

  if (!pet) return null;
  if (!token) return <div className="mx-auto max-w-2xl"><JoinPanel /></div>;
  const e = profile?.earnings;
  const hold = profile?.payout_held ?? false;

  return (
    <div className="mx-auto grid max-w-5xl gap-4 lg:grid-cols-2 lg:gap-5">
      <section className="rounded-[28px] bg-ground-deep p-6 sm:p-8">
        <p className="text-[15px] text-ink-soft">Waiting to be paid</p>
        <p className="money mt-1 font-display text-[clamp(3rem,8vw,4.2rem)] font-bold leading-none tabular-nums">${(e?.owed_usdc ?? 0).toFixed(2)}</p>
        <p className="mt-3 text-[14px] text-ink-soft">
          {hold
            ? `New accounts are paid after a 48-hour check, from ${new Date(profile!.payout_hold_until).toLocaleString()}.`
            : "Paid in USDC to your wallet in the next payout run once it reaches $0.10."}
        </p>
        <dl className="mt-7 grid grid-cols-3 gap-2">
          {[["Today", e?.today_usdc], ["This week", e?.week_usdc], ["All time", e?.total_usdc]].map(([k, v]) => (
            <div key={k as string} className="rounded-[14px] bg-field px-3 py-3">
              <dt className="text-[12.5px] text-ink-soft">{k}</dt>
              <dd className="mt-1 font-display text-[20px] font-bold tabular-nums">${((v as number) ?? 0).toFixed(2)}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-6 text-[14px] text-ink-faint">
          Paid to <span className="font-mono text-ink-soft">{pet.wallet ? short(pet.wallet) : "your wallet"}</span>
        </p>
      </section>

      <section className="rounded-[28px] bg-ground-deep p-6 sm:p-8">
        <h2 className="font-display text-[24px] font-bold">Payouts</h2>
        {history?.payouts.length ? (
          <ul className="mt-4 divide-y divide-edge">
            {history.payouts.map((p) => (
              <li key={p.tx_sig} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="money font-display text-[20px] font-bold tabular-nums">+${p.amount_usdc.toFixed(2)}</p>
                  <p className="text-[13px] text-ink-faint">{new Date(p.at).toLocaleString()}</p>
                </div>
                <a href={txUrl(p.tx_sig)} target="_blank" rel="noreferrer" className="kage-btn !min-h-10 !bg-field !px-3 !text-[14px] !text-ink hover:!bg-field-hover">
                  Receipt <Arrow />
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-ink-soft">No payouts yet. Your first one appears here with its on-chain receipt.</p>
        )}
      </section>
    </div>
  );
}
