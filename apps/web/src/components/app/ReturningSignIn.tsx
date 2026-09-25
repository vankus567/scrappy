"use client";

import { useWalletLink } from "@/components/wallet/WalletLink";

/** New device, same Scrappy: connect the wallet, sign once, and your Scrappy comes back. */
export function ReturningSignIn() {
  const { start, status } = useWalletLink();
  return (
    <div className="mt-3 text-[14px]">
      <button
        type="button"
        onClick={() => start("signin")}
        disabled={status.state === "working"}
        className="scrappy-focus rounded font-semibold text-leaf transition-colors hover:text-leaf-hover disabled:opacity-60"
      >
        {status.state === "working" ? "Check your wallet…" : "Already have a Scrappy? Sign in with your wallet"}
      </button>
      {status.state === "error" && <p role="alert" className="mt-2 text-[#ffb4a3]">{status.message}</p>}
    </div>
  );
}
