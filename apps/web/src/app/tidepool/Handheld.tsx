"use client";

import { useEffect, useRef, useState } from "react";
import { BTN_A, BTN_B, BTN_DOWN, BTN_LEFT, BTN_RIGHT, BTN_UP, Console } from "@/lib/console";

import styles from "./handheld.module.css";

const explorer = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;

interface TxRow {
  label: string;
  sig: string;
}

export function Handheld() {
  const screenRef = useRef<HTMLDivElement>(null);
  const conRef = useRef<Console | null>(null);
  const [txs, setTxs] = useState<TxRow[]>([]);
  const [slot, setSlot] = useState<string | null>(null);

  useEffect(() => {
    const host = screenRef.current;
    if (!host) return;
    let con: Console | null = null;
    let dead = false;
    // The Orca SDK ships wasm that must only load in the browser, so the game module is imported here.
    void import("@/lib/tidepool/game").then(({ SCREEN_H, SCREEN_W, Tidepool }) => {
      if (dead) return;
      con = new Console(host, { width: SCREEN_W, height: SCREEN_H, fps: 30 });
      conRef.current = con;
      const game = new Tidepool(con, {
        onTx: (label, sig) => setTxs((t) => [{ label, sig }, ...t].slice(0, 6)),
        onSlot: setSlot,
      });
      con.run({ update: () => game.update(), draw: () => game.draw() });
    });
    return () => {
      dead = true;
      con?.destroy();
      conRef.current = null;
    };
  }, []);

  /** Pointer handlers for an on-device button. Releasing anywhere lets go. */
  const hold = (btn: number) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as Element).setPointerCapture?.(e.pointerId);
      conRef.current?.audio.unlock();
      conRef.current?.input.setTouch(btn, true);
    },
    onPointerUp: () => conRef.current?.input.setTouch(btn, false),
    onPointerCancel: () => conRef.current?.input.setTouch(btn, false),
    onLostPointerCapture: () => conRef.current?.input.setTouch(btn, false),
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });

  return (
    <main className={styles.room}>
      <div className={styles.device}>
        <div className={styles.bezel}>
          <div ref={screenRef} className={styles.screen} />
        </div>
        <div className={styles.brand}>TIDEPOOL</div>

        <div className={styles.controls}>
          <div className={styles.dpad} aria-label="direction pad">
            <button aria-label="up" className={`${styles.arm} ${styles.up}`} {...hold(BTN_UP)} />
            <button aria-label="left" className={`${styles.arm} ${styles.left}`} {...hold(BTN_LEFT)} />
            <span className={styles.hub} />
            <button aria-label="right" className={`${styles.arm} ${styles.right}`} {...hold(BTN_RIGHT)} />
            <button aria-label="down" className={`${styles.arm} ${styles.down}`} {...hold(BTN_DOWN)} />
          </div>
          <div className={styles.face}>
            <button aria-label="B" className={`${styles.round} ${styles.b}`} {...hold(BTN_B)}>B</button>
            <button aria-label="A" className={`${styles.round} ${styles.a}`} {...hold(BTN_A)}>A</button>
          </div>
        </div>
        <p className={styles.keys}>Arrows move. Z is A, X is B.</p>
      </div>

      <section className={styles.log} aria-live="polite">
        {slot && (
          <p className={styles.slot}>
            Save slot <a href={`https://explorer.solana.com/address/${slot}?cluster=devnet`} target="_blank" rel="noreferrer">{slot.slice(0, 4)}…{slot.slice(-4)}</a> on Solana devnet
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
