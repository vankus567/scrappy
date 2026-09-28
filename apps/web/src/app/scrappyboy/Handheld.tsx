"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { Connection, SystemProgram, Transaction } from "@solana/web3.js";
import { useEffect, useRef, useState } from "react";
import { useWalletPicker } from "@/components/wallet/WalletPicker";
import { Console, type Input } from "@/lib/console";
import type { ScrappyBoy } from "@/lib/scrappyboy/game";
import type { SessionWallet } from "@/lib/scrappyboy/session";
import { Shell } from "./Shell";
import styles from "./handheld.module.css";

const explorer = (sig: string) =>
  sig.startsWith("main:") ? `https://solscan.io/tx/${sig.slice(5)}` : `https://explorer.solana.com/tx/${sig}?cluster=devnet`;

/**
 * Share a run: the results screen scaled up crisp (nearest-neighbour) into a square card,
 * plus a challenge link that carries the score. Phone share sheet first, X as the fallback.
 */
async function shareRun(screen: HTMLCanvasElement, run: { score: number; best: number; creature: string; level: number; combo: number }) {
  const url = `${window.location.origin}/scrappyboy?beat=${run.score}`;
  const text = `I scored ${run.score} on SCRAPPY BOY riding the live SOL price with ${run.creature} (level ${run.level}, combo ${run.combo}). Beat me:`;
  const card = document.createElement("canvas");
  card.width = 1080;
  card.height = 1080;
  const g = card.getContext("2d")!;
  g.fillStyle = "#0e091c";
  g.fillRect(0, 0, 1080, 1080);
  g.imageSmoothingEnabled = false;
  const k = 6; // 160x144 -> 960x864
  g.drawImage(screen, (1080 - 160 * k) / 2, 40, 160 * k, 144 * k);
  g.fillStyle = "#e6fbf6";
  g.font = "600 40px system-ui, sans-serif";
  g.textAlign = "center";
  g.fillText(`Beat ${run.score} at scrappypet.vercel.app/scrappyboy`, 540, 1010);
  const blob: Blob | null = await new Promise((r) => card.toBlob(r, "image/png"));
  const file = blob ? new File([blob], "scrappyboy-run.png", { type: "image/png" }) : null;
  try {
    if (file && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], text: `${text} ${url}`, title: "SCRAPPY BOY" });
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
  const screenRef = useRef<HTMLDivElement>(null); // the shell's viewport hosts the canvases
  const conRef = useRef<Console | null>(null);
  const inputRef = useRef<Input | null>(null);
  const gameRef = useRef<ScrappyBoy | null>(null);
  const sessionRef = useRef<SessionWallet | null>(null);
  const [txs, setTxs] = useState<TxRow[]>([]);
  const [playKey, setPlayKey] = useState<string>();
  const [ready, setReady] = useState(false);
  const { publicKey, sendTransaction, disconnect } = useWallet();
  const picker = useWalletPicker();
  const pickerRef = useRef(picker);
  const disconnectRef = useRef(disconnect);
  useEffect(() => {
    pickerRef.current = picker;
    disconnectRef.current = disconnect;
  }, [picker, disconnect]);

  useEffect(() => {
    const host = screenRef.current;
    if (!host) return;
    let con: Console | null = null;
    let dead = false;
    // The Orca SDK ships wasm that must only load in the browser, so the game module is imported here.
    void Promise.all([import("@/lib/scrappyboy/game"), import("@/lib/scrappyboy/session")]).then(
      ([{ SCREEN_H, SCREEN_W, ScrappyBoy }, { SessionWallet }]) => {
        if (dead) return;
        con = new Console(host, { width: SCREEN_W, height: SCREEN_H, fps: 30 });
        conRef.current = con;
        inputRef.current = con.input;
        const session = SessionWallet.load();
        sessionRef.current = session;
        setPlayKey(session.address);
        const game = new ScrappyBoy(con, {
          onTx: (label, sig) => setTxs((t) => [{ label, sig }, ...t].slice(0, 8)),
          onConnect: () => pickerRef.current.open(),
          onEject: () => void disconnectRef.current(),
          onShare: (run) => void shareRun(con!.canvas, run),
        });
        game.setChallenge(Number(new URLSearchParams(window.location.search).get("beat")));
        gameRef.current = game;
        con.run({ update: () => game.update(), draw: () => game.draw() });
        (window as unknown as { __dbg: object }).__dbg = { con, game };
        // MEME DASH draws to its own canvas, stacked on top of the game canvas in the viewport.
        host.appendChild(game.meme.canvas);
        const show = setInterval(() => {
          game.meme.canvas.style.display = game.meme.active ? "block" : "none";
        }, 150);
        setReady(true);
        return () => clearInterval(show);
      },
    );
    return () => {
      dead = true;
      con?.destroy();
      conRef.current = null;
      gameRef.current = null;
      sessionRef.current = null;
    };
  }, []);

  // The play key signs every game move on-device, so nothing pops a wallet mid-play.
  useEffect(() => {
    if (!ready) return;
    const session = sessionRef.current;
    if (!session) return;
    void session.kitSigner().then((s) => gameRef.current?.setSigner(s));
  }, [ready]);

  // MEME DASH runs on the play key too. The connected wallet only shows up to feed the coin slot.
  useEffect(() => {
    if (!ready) return;
    const session = sessionRef.current;
    if (!session) return;
    // Same-origin RPC proxy: the public mainnet endpoint 403s browser origins.
    const mainnet = new Connection(`${window.location.origin}/api/rpc`);
    const bank = publicKey && sendTransaction ? { key: publicKey, send: sendTransaction } : null;
    gameRef.current?.setMemeWallet({
      address: session.address,
      send: (b64) => session.send(mainnet, b64),
      tokenBalance: (mint) => session.tokenBalance(mainnet, mint),
      solBalance: () => session.solBalance(mainnet),
      // Insert coin: the only signature the real wallet ever does, one transfer into the play key.
      topUp: bank
        ? async (lamports) => {
            const tx = new Transaction().add(SystemProgram.transfer({ fromPubkey: bank.key, toPubkey: session.keypair.publicKey, lamports }));
            tx.feePayer = bank.key;
            tx.recentBlockhash = (await mainnet.getLatestBlockhash()).blockhash;
            return bank.send(tx, mainnet);
          }
        : undefined,
      // Cash out: the play key sweeps everything back to the real wallet, no popup needed.
      sweep: bank ? () => session.sweep(mainnet, bank.key) : undefined,
      connect: () => pickerRef.current.open(),
      onTx: (label, sig) => setTxs((t) => [{ label: `${label} (mainnet)`, sig: `main:${sig}` }, ...t].slice(0, 8)),
    });
  }, [ready, publicKey, sendTransaction]);

  return (
    <main className={styles.room}>
      <Shell input={inputRef} wordmark="SCRAPPY BOY">
        <div ref={screenRef} />
      </Shell>

      <section className={styles.log} aria-live="polite">
        {playKey && (
          <p className={styles.slot2}>
            Playing as{" "}
            <a href={`https://explorer.solana.com/address/${playKey}?cluster=devnet`} target="_blank" rel="noreferrer">
              {playKey.slice(0, 4)}…{playKey.slice(-4)}
            </a>
            , this device&apos;s play key. Every move below signed on-device: no popups.
          </p>
        )}
        {txs.map((t) => (
          <a key={t.sig} className={styles.tx} href={explorer(t.sig)} target="_blank" rel="noreferrer">
            <span>{t.label}</span>
            <span className={styles.sig}>{t.sig.replace("main:", "").slice(0, 8)}…</span>
          </a>
        ))}
      </section>
    </main>
  );
}
