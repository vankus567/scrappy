"use client";

import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { BTN_A, BTN_B, BTN_DOWN, BTN_LEFT, BTN_RIGHT, BTN_UP, BTN_X, BTN_Y, type Input } from "@/lib/console";
import styles from "./shell.module.css";

/**
 * The SCRAPPY BOY console: moulded plastic around a fixed pixel screen, in the
 * PIXMON tradition. Pure DOM and CSS; the canvases (game + MEME DASH) live in
 * the viewport, and every plastic button writes straight into the game's Input.
 */

const LADDER = [3, 2, 1] as const;

/** Integer scale first, continuous only when even 1x will not fit: pixel art deserves whole pixels. */
function useFitScale(stageRef: RefObject<HTMLElement | null>, boxRef: RefObject<HTMLElement | null>): number {
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const stage = stageRef.current;
    const box = boxRef.current;
    if (!stage || !box) return;
    const measure = () => {
      const bw = box.offsetWidth;
      const bh = box.offsetHeight;
      if (!bw || !bh) return;
      const avail = stage.getBoundingClientRect();
      const pad = avail.width < 520 ? 8 : 32;
      const sw = avail.width - pad;
      const sh = avail.height - pad;
      const fitted = LADDER.find((n) => bw * n <= sw && bh * n <= sh);
      setScale(fitted ?? Math.min(sw / bw, sh / bh));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    observer.observe(box);
    if ("fonts" in document) void document.fonts.ready.then(measure);
    window.visualViewport?.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.visualViewport?.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
      window.removeEventListener("resize", measure);
    };
  }, [stageRef, boxRef]);
  return scale;
}

type InputRef = RefObject<Input | null>;

function useHold(input: InputRef, btn: number) {
  return {
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      input.current?.setTouch(btn, true);
    },
    onPointerUp: () => input.current?.setTouch(btn, false),
    onPointerCancel: () => input.current?.setTouch(btn, false),
    onLostPointerCapture: () => input.current?.setTouch(btn, false),
  };
}

/** Solana's mark, stamped into the shell where PIXMON stamps Monad's. */
function SolMark() {
  return (
    <span className={styles.mark} aria-hidden="true">
      <svg viewBox="0 0 100 100" fill="none">
        <path d="M14 30l12-12h60l-12 12z" fill="#DDD7FE" />
        <path d="M14 56l12-12h60l-12 12z" fill="#DDD7FE" />
        <path d="M14 82l12-12h60l-12 12z" fill="#DDD7FE" />
      </svg>
    </span>
  );
}

export function Shell({ input, children, wordmark }: { input: InputRef; children: ReactNode; wordmark: string }) {
  const stage = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const scale = useFitScale(stage, box);

  const up = useHold(input, BTN_UP);
  const down = useHold(input, BTN_DOWN);
  const left = useHold(input, BTN_LEFT);
  const right = useHold(input, BTN_RIGHT);
  const a = useHold(input, BTN_A);
  const b = useHold(input, BTN_B);
  const select = useHold(input, BTN_X);
  const start = useHold(input, BTN_Y);

  return (
    <div className={styles.stage} ref={stage}>
      <div className={styles.console} ref={box} style={{ transform: `translate(-50%, -50%) scale(${scale})` }}>
        <div className={styles.lid}>
          <i className={`${styles.screw} ${styles.tl}`} />
          <i className={`${styles.screw} ${styles.tr}`} />
          <i className={`${styles.screw} ${styles.bl}`} />
          <i className={`${styles.screw} ${styles.br}`} />
          <div className={styles.bezel}>
            <div className={styles.viewport}>{children}</div>
          </div>
        </div>

        <div className={styles.hinge}>
          <i className={styles.cap} />
          <i className={styles.bar} />
          <i className={styles.cap} />
        </div>

        <div className={styles.base}>
          <i className={`${styles.screw} ${styles.bl}`} />
          <i className={`${styles.screw} ${styles.br}`} />

          <div className={styles.toprow}>
            <div className={styles.badge}>
              <SolMark />
              <span className={styles.wordmark}>{wordmark}</span>
            </div>
            <i className={styles.led} aria-hidden="true" />
          </div>

          <div className={styles.deck}>
            <div className={styles.dpadWell}>
              <div className={styles.dpad}>
                <i className={styles.v} />
                <i className={styles.h} />
                <i className={styles.c} />
                <div className={styles.dpadHit}>
                  <span />
                  <button type="button" aria-label="Up" {...up} />
                  <span />
                  <button type="button" aria-label="Left" {...left} />
                  <span />
                  <button type="button" aria-label="Right" {...right} />
                  <span />
                  <button type="button" aria-label="Down" {...down} />
                  <span />
                </div>
              </div>
            </div>
            <div className={styles.mid}>
              <div className={styles.speaker} aria-hidden="true">
                {Array.from({ length: 15 }, (_, i) => (
                  <i key={i} />
                ))}
              </div>
              <div className={styles.startsel}>
                <button type="button" aria-label="Select, cash out" {...select} />
                <button type="button" aria-label="Start" {...start} />
              </div>
            </div>
            <div className={styles.abWell}>
              <button type="button" aria-label="B, back" {...b}>
                B
              </button>
              <button type="button" aria-label="A, confirm" {...a}>
                A
              </button>
            </div>
          </div>

          <p className={styles.keyhint}>
            <span>
              <b>Z</b> a button
            </span>
            <span>
              <b>X</b> b button
            </span>
            <span>
              <b>C</b> select
            </span>
            <span>
              <b>V</b> start
            </span>
            <span>
              <b>Arrows</b> d-pad
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
