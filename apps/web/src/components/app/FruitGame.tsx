"use client";

import { useEffect, useRef, useState } from "react";
import { type Fruit, FRUIT_MS, fruitSchedule, GRAVITY, POINTS } from "@/lib/fruit";

const LOOKS = [
  { body: "#ff6b7a", rim: "#3fae5a" }, // watermelon
  { body: "#ff9f40", rim: "#e07b1f" }, // orange
  { body: "#ffd94a", rim: "#e0b400" }, // lemon
  { body: "#9ccf5b", rim: "#6aa33a" }, // kiwi
  { body: "#ff5a5f", rim: "#d93a40" }, // apple
];

type Piece = { x: number; y: number; vx: number; vy: number; r: number; color: string; born: number; half?: 1 | -1; angle: number };

/**
 * Fruit Slash: 20 seconds of swiping. Every player in this battle round gets the same fruit (seeded by
 * battle id + round). The slice log (fruit id + time) is what gets locked in; the server re-scores it.
 */
export function FruitGame({ battleId, round, busy, onDone }: { battleId: string; round: number; busy: boolean; onDone: (log: string) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<"ready" | "count" | "play" | "done">("ready");
  const [count, setCount] = useState(3);
  const [score, setScore] = useState(0);
  const [left, setLeft] = useState(FRUIT_MS / 1000);
  const log = useRef<{ id: number; ms: number }[]>([]);

  // 3-2-1
  useEffect(() => {
    if (phase !== "count") return;
    if (count === 0) {
      setPhase("play");
      return;
    }
    const t = window.setTimeout(() => setCount((c) => c - 1), 700);
    return () => window.clearTimeout(t);
  }, [phase, count]);

  // the game loop
  useEffect(() => {
    if (phase !== "play") return;
    const el = canvas.current!;
    const ctx = el.getContext("2d")!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = el.clientWidth;
    const H = el.clientHeight;
    el.width = W * dpr;
    el.height = H * dpr;
    ctx.scale(dpr, dpr);
    const R = Math.max(22, W * 0.075);
    const schedule: Fruit[] = fruitSchedule(battleId, round);
    const sliced = new Set<number>();
    const pieces: Piece[] = [];
    const trail: { x: number; y: number; at: number }[] = [];
    let flash = 0;
    let points = 0;
    const start = performance.now();
    let raf = 0;
    let last: { x: number; y: number } | null = null;

    const pos = (f: Fruit, ms: number) => {
      const s = (ms - f.t) / 1000;
      const h = f.vy * s - 0.5 * GRAVITY * s * s; // screen heights above the bottom
      return { x: (f.x0 + f.vx * s) * W, y: H + R - h * (H + R) * 0.92 };
    };

    const cut = (x0: number, y0: number, x1: number, y1: number) => {
      const ms = performance.now() - start;
      if (ms > FRUIT_MS) return;
      for (const f of schedule) {
        if (sliced.has(f.id) || ms < f.t || ms > f.t + f.life) continue;
        const p = pos(f, ms);
        // distance from the fruit centre to the swipe segment
        const dx = x1 - x0;
        const dy = y1 - y0;
        const len2 = dx * dx + dy * dy || 1;
        const k = Math.max(0, Math.min(1, ((p.x - x0) * dx + (p.y - y0) * dy) / len2));
        const cx = x0 + k * dx - p.x;
        const cy = y0 + k * dy - p.y;
        if (cx * cx + cy * cy > R * R) continue;
        sliced.add(f.id);
        log.current.push({ id: f.id, ms: Math.round(ms) });
        points = Math.max(0, points + POINTS[f.kind]);
        setScore(points);
        const now = performance.now();
        if (f.kind === "bomb") {
          flash = now;
          if ("vibrate" in navigator) navigator.vibrate?.(180);
        } else {
          const color = f.kind === "gold" ? "#ffcc33" : LOOKS[f.look].body;
          const ang = Math.atan2(dy, dx);
          for (const half of [1, -1] as const) {
            pieces.push({ x: p.x, y: p.y, vx: Math.cos(ang + half * 1.4) * 90, vy: -60, r: R, color, born: now, half, angle: ang });
          }
          for (let i = 0; i < 9; i++) {
            const a = Math.random() * Math.PI * 2;
            pieces.push({ x: p.x, y: p.y, vx: Math.cos(a) * (80 + Math.random() * 140), vy: Math.sin(a) * (80 + Math.random() * 140) - 60, r: 3 + Math.random() * 4, color, born: now, angle: 0 });
          }
          if ("vibrate" in navigator) navigator.vibrate?.(12);
        }
      }
    };

    const onDown = (e: PointerEvent) => {
      el.setPointerCapture(e.pointerId);
      const b = el.getBoundingClientRect();
      last = { x: e.clientX - b.left, y: e.clientY - b.top };
    };
    const onMove = (e: PointerEvent) => {
      if (!last) return;
      const b = el.getBoundingClientRect();
      const cur = { x: e.clientX - b.left, y: e.clientY - b.top };
      cut(last.x, last.y, cur.x, cur.y);
      trail.push({ ...cur, at: performance.now() });
      last = cur;
    };
    const onUp = () => (last = null);
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);

    const drawFruit = (f: Fruit, x: number, y: number, ms: number) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(((ms - f.t) / 1000) * (f.vx > 0 ? 1 : -1));
      if (f.kind === "bomb") {
        ctx.fillStyle = "#2c2c2e";
        ctx.beginPath();
        ctx.arc(0, 0, R, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#8e8e93";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(R * 0.4, -R * 0.8);
        ctx.quadraticCurveTo(R * 0.8, -R * 1.3, R * 1.1, -R * 1.1);
        ctx.stroke();
        ctx.fillStyle = Math.floor(ms / 90) % 2 ? "#ffcc33" : "#ff7a59";
        ctx.beginPath();
        ctx.arc(R * 1.1, -R * 1.1, R * 0.18, 0, Math.PI * 2);
        ctx.fill();
        // grumpy eyes
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2.5;
        ctx.lineCap = "round";
        for (const sx of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(sx * R * 0.5, -R * 0.2);
          ctx.lineTo(sx * R * 0.15, -R * 0.05);
          ctx.stroke();
        }
      } else {
        const look = f.kind === "gold" ? { body: "#ffcc33", rim: "#e0a800" } : LOOKS[f.look];
        ctx.fillStyle = look.rim;
        ctx.beginPath();
        ctx.arc(0, 0, R, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = look.body;
        ctx.beginPath();
        ctx.arc(0, 0, R * 0.86, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.55)";
        ctx.beginPath();
        ctx.ellipse(-R * 0.35, -R * 0.4, R * 0.22, R * 0.13, -0.6, 0, Math.PI * 2);
        ctx.fill();
        // leaf
        ctx.fillStyle = "#3fae5a";
        ctx.beginPath();
        ctx.ellipse(R * 0.15, -R * 0.95, R * 0.28, R * 0.12, -0.5, 0, Math.PI * 2);
        ctx.fill();
        // kawaii face
        ctx.fillStyle = "#1d1d1f";
        for (const sx of [-1, 1]) {
          ctx.beginPath();
          ctx.arc(sx * R * 0.3, R * 0.02, R * 0.1, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.strokeStyle = "#1d1d1f";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, R * 0.18, R * 0.14, 0.15 * Math.PI, 0.85 * Math.PI);
        ctx.stroke();
        ctx.fillStyle = "rgba(255,120,150,0.55)";
        for (const sx of [-1, 1]) {
          ctx.beginPath();
          ctx.ellipse(sx * R * 0.55, R * 0.25, R * 0.14, R * 0.08, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        if (f.kind === "gold") {
          ctx.fillStyle = "#ffffff";
          ctx.font = `bold ${Math.round(R * 0.5)}px sans-serif`;
          ctx.textAlign = "center";
          ctx.fillText("x3", 0, R * 0.78);
        }
      }
      ctx.restore();
    };

    const frame = () => {
      const now = performance.now();
      const ms = now - start;
      ctx.clearRect(0, 0, W, H);
      for (const f of schedule) {
        if (sliced.has(f.id) || ms < f.t || ms > f.t + f.life) continue;
        const p = pos(f, ms);
        drawFruit(f, p.x, p.y, ms);
      }
      // halves and juice
      for (let i = pieces.length - 1; i >= 0; i--) {
        const pc = pieces[i];
        const age = (now - pc.born) / 1000;
        if (age > 1.2) {
          pieces.splice(i, 1);
          continue;
        }
        const x = pc.x + pc.vx * age;
        const y = pc.y + pc.vy * age + 0.5 * 900 * age * age;
        ctx.globalAlpha = Math.max(0, 1 - age / 1.2);
        ctx.fillStyle = pc.color;
        ctx.beginPath();
        if (pc.half) ctx.arc(x, y, pc.r, pc.angle + (pc.half > 0 ? 0 : Math.PI), pc.angle + (pc.half > 0 ? Math.PI : Math.PI * 2));
        else ctx.arc(x, y, pc.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      // blade trail
      while (trail.length && now - trail[0].at > 140) trail.shift();
      if (trail.length > 1) {
        ctx.strokeStyle = "rgba(0,122,255,0.8)";
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(trail[0].x, trail[0].y);
        for (const t of trail) ctx.lineTo(t.x, t.y);
        ctx.stroke();
      }
      if (flash && now - flash < 250) {
        ctx.fillStyle = `rgba(255,90,90,${0.35 * (1 - (now - flash) / 250)})`;
        ctx.fillRect(0, 0, W, H);
      }
      setLeft(Math.max(0, Math.ceil((FRUIT_MS - ms) / 1000)));
      if (ms >= FRUIT_MS) {
        setPhase("done");
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
    };
  }, [phase, battleId, round]);

  // time's up: lock in the slice log
  useEffect(() => {
    if (phase !== "done") return;
    const text = log.current.length ? log.current.map((s) => `${s.id}.${Math.floor(s.ms / 10)}`).join(",") : "-";
    onDone(text);
    // onDone is the arena's lock-in; it only needs to run once per finished round
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  return (
    <div className="mt-4">
      <div className="relative mx-auto aspect-[3/4] w-full max-w-[420px] overflow-hidden rounded-[24px] bg-[linear-gradient(180deg,#dbeeff,#f5f9ff)]">
        <canvas ref={canvas} className="absolute inset-0 h-full w-full touch-none select-none" aria-label="Swipe across the fruit to slice it. Avoid the bombs." />
        <div className="pointer-events-none absolute inset-x-4 top-3 flex items-center justify-between font-display text-[22px] font-bold tabular-nums">
          <span>{score} pts</span>
          <span className={left <= 5 && phase === "play" ? "text-[#c2410c]" : ""}>{left}s</span>
        </div>
        {phase === "ready" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="font-display text-[26px] font-bold">Round {round}: slice!</p>
            <p className="text-[15px] text-ink-soft">Swipe through fruit for points. Golden fruit is worth 3. Bombs cost 3. You have 20 seconds.</p>
            <button type="button" disabled={busy} onClick={() => setPhase("count")} className="mt-2 min-h-12 rounded-[14px] bg-[#007aff] px-6 text-[16px] font-semibold text-white transition-colors hover:bg-[#0060cc] disabled:opacity-60">
              Start slicing
            </button>
          </div>
        )}
        {phase === "count" && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center font-display text-[88px] font-bold text-[#007aff]">{count || "Go!"}</div>
        )}
        {phase === "done" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/70 text-center">
            <p className="font-display text-[34px] font-bold">{score} points</p>
            <p className="text-[15px] text-ink-soft">{busy ? "Locking in your round..." : "Locked in. Waiting for your opponent's round."}</p>
          </div>
        )}
      </div>
    </div>
  );
}
