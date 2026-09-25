"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useEffect, useRef, useState } from "react";
import { addressUrl } from "@/lib/api";
import { usePet } from "@/lib/pet-store";
import { useWalletLink } from "./WalletLink";

const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

/** Header wallet control: Connect when unlinked; the payout address with a small menu once linked. */
export function WalletButton({ compact = false }: { compact?: boolean }) {
  const { pet } = usePet();
  const { connected, disconnect, wallet } = useWallet();
  const { start, status } = useWalletLink();
  const [menu, setMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setMenu(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [menu]);

  if (!pet) return null;

  if (!pet.workerToken || !pet.wallet) {
    return (
      <button
        type="button"
        onClick={() => start("join")}
        disabled={status.state === "working"}
        className={`scrappy-focus shrink-0 rounded-[14px] bg-leaf font-semibold text-on-leaf transition-colors hover:bg-leaf-hover disabled:opacity-60 ${compact ? "h-10 px-3.5 text-[14px]" : "h-11 px-5 text-[15px]"}`}
      >
        {status.state === "working" ? "Check your wallet…" : "Connect wallet"}
      </button>
    );
  }

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={menu}
        onClick={() => setMenu((m) => !m)}
        className={`scrappy-focus flex items-center gap-2 rounded-[14px] bg-field font-semibold transition-colors hover:bg-field-hover ${compact ? "h-10 px-3 text-[14px]" : "h-11 px-4 text-[15px]"}`}
      >
        {wallet?.adapter.icon && connected ? (
          // wallet icons are data URIs supplied by the wallet itself
          // eslint-disable-next-line @next/next/no-img-element
          <img src={wallet.adapter.icon} alt="" className="size-5 rounded-[4px]" />
        ) : (
          <span aria-hidden className="size-2 rounded-full bg-leaf" />
        )}
        <span className="font-mono text-[13px]">{short(pet.wallet)}</span>
      </button>
      {menu && (
        <div role="menu" className="absolute right-0 top-[calc(100%+8px)] z-50 w-64 rounded-[18px] bg-ground-deep p-2 ring-1 ring-edge">
          <p className="px-3 pb-2 pt-1 text-[12.5px] text-ink-faint">Payout wallet{connected && wallet ? ` · ${wallet.adapter.name}` : ""}</p>
          <button
            role="menuitem"
            type="button"
            onClick={() => navigator.clipboard.writeText(pet.wallet!).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1400); })}
            className="scrappy-focus w-full rounded-[12px] px-3 py-2.5 text-left text-[14px] font-semibold hover:bg-field"
          >
            {copied ? "Copied" : "Copy address"}
          </button>
          <a role="menuitem" href={addressUrl(pet.wallet)} target="_blank" rel="noreferrer" className="scrappy-focus block rounded-[12px] px-3 py-2.5 text-[14px] font-semibold hover:bg-field">
            View on Solana Explorer
          </a>
          {connected && (
            <button role="menuitem" type="button" onClick={() => { disconnect().catch(() => {}); setMenu(false); }} className="scrappy-focus w-full rounded-[12px] px-3 py-2.5 text-left text-[14px] font-semibold text-ink-soft hover:bg-field">
              Disconnect wallet app
            </button>
          )}
        </div>
      )}
    </div>
  );
}
