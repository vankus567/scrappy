"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useEffect, useRef, useState } from "react";
import { useWalletPicker } from "@/components/wallet/WalletPicker";
import { Console } from "@/lib/console";
import type { Device3D } from "@/lib/tidepool/device3d";
import type { Tidepool } from "@/lib/tidepool/game";
import { walletSigner } from "@/lib/tidepool/wallet";
import styles from "./handheld.module.css";

const explorer = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;

/**
 * Share a run: the results screen scaled up crisp (nearest-neighbour) into a square card,
 * plus a challenge link that carries the score. Phone share sheet first, X as the fallback.
 */
async function shareRun(screen: HTMLCanvasElement, run: { score: number; best: number; creature: string; level: number; combo: number }) {
  const url = `${window.location.origin}/tidepool?beat=${run.score}`;
  const text = `I scored ${run.score} on TIDEPOOL riding the live SOL price with ${run.creature} (level ${run.level}, combo ${run.combo}). Beat me:`;
  const card = document.createElement("canvas");
  card.width = 1080;
  card.height = 1080;
  const g = card.getContext("2d")!;
  g.fillStyle = "#0b2a33";
  g.fillRect(0, 0, 1080, 1080);
  g.imageSmoothingEnabled = false;
  const k = 6; // 160x144 -> 960x864
  g.drawImage(screen, (1080 - 160 * k) / 2, 40, 160 * k, 144 * k);
  g.fillStyle = "#e6fbf6";
  g.font = "600 40px system-ui, sans-serif";
  g.textAlign = "center";
  g.fillText(`Beat ${run.score} at scrappypet.vercel.app/tidepool`, 540, 1010);
  const blob: Blob | null = await new Promise((r) => card.toBlob(r, "image/png"));
  const file = blob ? new File([blob], "tidepool-run.png", { type: "image/png" }) : null;
  try {
    if (file && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], text: `${text} ${url}`, title: "TIDEPOOL" });
      return;
    }
  } catch (e) {
    if ((e as Error)?.name === "AbortError") return; // the player closed the share sheet
    // share sheet unavailable or refused: fall through to X
  }
  window.open(`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, "_blank", "noopener");
}

interface TxRow {
  label: string;
  sig: string;
}

export function Handheld() {
  const screenRef = useRef<HTMLDivElement>(null); // off-screen host for the console canvas
  const stageRef = useRef<HTMLDivElement>(null); // the 3D handheld
  const conRef = useRef<Console | null>(null);
  const gameRef = useRef<Tidepool | null>(null);
  const [txs, setTxs] = useState<TxRow[]>([]);
  const [ready, setReady] = useState(false);
  const { publicKey, signTransaction, disconnect } = useWallet();
  const picker = useWalletPicker();
  const pickerRef = useRef(picker);
  pickerRef.current = picker;
  const disconnectRef = useRef(disconnect);
  disconnectRef.current = disconnect;

  useEffect(() => {
    const host = screenRef.current;
    if (!host) return;
    let con: Console | null = null;
    let dead = false;
    // The Orca SDK ships wasm that must only load in the browser, so the game module is imported here.
    let device: Device3D | null = null;
    void Promise.all([import("@/lib/tidepool/game"), import("@/lib/tidepool/device3d")]).then(([{ SCREEN_H, SCREEN_W, Tidepool }, { Device3D }]) => {
      if (dead || !stageRef.current) return;
      con = new Console(host, { width: SCREEN_W, height: SCREEN_H, fps: 30 });
      conRef.current = con;
      const game = new Tidepool(con, {
        onTx: (label, sig) => setTxs((t) => [{ label, sig }, ...t].slice(0, 8)),
        onConnect: () => pickerRef.current.open(),
        onEject: () => void disconnectRef.current(),
        onShare: (run) => void shareRun(con!.canvas, run),
      });
      game.setChallenge(Number(new URLSearchParams(window.location.search).get("beat")));
      gameRef.current = game;
      game.setHud3D(true);
      con.run({ update: () => game.update(), draw: () => game.draw() });
      device = new Device3D(stageRef.current, con, () => game.renderState());
      setReady(true);
    });
    return () => {
      dead = true;
      device?.destroy();
      con?.destroy();
      conRef.current = null;
      gameRef.current = null;
    };
  }, []);

  // The player's wallet is the cartridge: every transaction is approved there.
  useEffect(() => {
    if (!ready) return;
    const key = publicKey?.toBase58();
    gameRef.current?.setSigner(key && signTransaction ? walletSigner(key, signTransaction) : undefined);
  }, [ready, publicKey, signTransaction]);

  const player = publicKey?.toBase58();

  return (
    <main className={styles.room}>
      <div ref={stageRef} className={styles.stage} aria-label="TIDEPOOL handheld. Keyboard: arrows move, Z is A, X is B." />
      <div ref={screenRef} className={styles.offscreen} aria-hidden />

      <p className={styles.keys}>Tap the buttons on the device, or use the keyboard: arrows move, Z is A, X is B.</p>

      <section className={styles.log} aria-live="polite">
        {player && (
          <p className={styles.slot2}>
            Playing as{" "}
            <a href={`https://explorer.solana.com/address/${player}?cluster=devnet`} target="_blank" rel="noreferrer">
              {player.slice(0, 4)}…{player.slice(-4)}
            </a>{" "}
            on Solana devnet. Every move below was signed by your wallet.
          </p>
        )}
        {txs.map((t) => (
          <a key={t.sig} className={styles.tx} href={explorer(t.sig)} target="_blank" rel="noreferrer">
            <span>{t.label}</span>
            <span className={styles.sig}>{t.sig.slice(0, 8)}…</span>
          </a>
        ))}
      </section>
    </main>
  );
}
