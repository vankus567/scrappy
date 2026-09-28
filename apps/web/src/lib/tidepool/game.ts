import type { TransactionSigner } from "@solana/kit";
import { BTN_A, BTN_B, BTN_DOWN, BTN_LEFT, BTN_RIGHT, BTN_UP, type Console, Image } from "@/lib/console";
import * as chain from "./chain";
import { type MapPool, mapPools, nextPin } from "./pools";

const shortId = (a: string) => `${a.slice(0, 4)}..${a.slice(-4)}`;
import { type Candle, candles as fetchCandles, lastPrice, PRICE_SOURCE } from "./prices";

/**
 * TIDEPOOL v2. You pick a pool and a creature, set a price range on a live SOL chart,
 * and play a timed round: your creature walks on the real price and gets hurt whenever
 * the price leaves your range. Casting saves a "disk": a real Orca position on devnet
 * with the same range shape around the devnet pool price. Coins are that position's real fees.
 *
 * Honesty rules: the chart and the round use the real SOL price (Coinbase); the disk lives on
 * devnet, whose pool price barely moves. Every screen that could blur the two says which is which.
 */

export const SCREEN_W = 160;
export const SCREEN_H = 144;
const FPS = 30;
const HATCH_SOL = 0.2;
const ROUND_SECONDS = 90;
const TICK_FRAMES = FPS * 2; // live price every 2 s
const FEE_FRAMES = FPS * 10; // fees every 10 s
const FED = BigInt(250_000_000);

type Scene = "boot" | "insert" | "card" | "map" | "pick" | "range" | "round" | "results" | "disk";

export interface GameEvents {
  onTx?: (label: string, signature: string) => void;
  /** The player pressed A with no cartridge: the host opens its wallet picker. */
  onConnect?: () => void;
  /** EJECT: the host disconnects the wallet. */
  onEject?: () => void;
}

// palette indices
const INK = 0, NAVY = 1, PLUM = 2, TEAL = 3, BLUE = 5, SKY = 6, WHITE = 7, PINK = 8, GOLD = 10, MINT = 11, CORN = 12, GREY = 13, SAND = 15;

interface Creature {
  name: string;
  half: number; // range half-width as a fraction of price
  safety: number; // 1..5, shown as bars
  reward: number;
  sx: number; // sprite x in bank 0
  blurb: string;
}

const CREATURES: Creature[] = [
  { name: "SHELLY", half: 0.03, safety: 5, reward: 1, sx: 0, blurb: "SLOW TURTLE. WIDE NET." },
  { name: "FINN", half: 0.012, safety: 3, reward: 3, sx: 24, blurb: "QUICK FISH. MEDIUM NET." },
  { name: "ZIP", half: 0.004, safety: 1, reward: 5, sx: 48, blurb: "WILD EEL. TINY NET." },
];

const SPRITES: Record<number, string[][]> = {
  0: [
    ["000003333000", "0000333bb300", "00033bb33b30", "0ff3b33bb3b3", "f1f33bb33b33", "0ff333333330", "000f0000f000", "00ff000ff000"],
    ["000003333000", "0000333bb300", "00033bb33b30", "0ff3b33bb3b3", "f1f33bb33b33", "0ff333333330", "0000f0000f00", "000ff000ff00"],
  ],
  24: [
    ["000000000000", "000aaaa00000", "00aaaaaa00a0", "0a71aaaaa9a0", "0aaaaaaaa9a0", "00aaaaaa0099", "000aaaa00000", "000000000000"],
    ["000000000000", "000aaaa00000", "00aaaaaa0a00", "0a71aaaaa9a0", "0aaaaaaaa9a0", "00aaaaaa09a0", "000aaaa00000", "000000000000"],
  ],
  48: [
    ["000000000000", "088000000000", "871880008880", "888888088088", "022228882002", "000022200000", "000000000000", "000000000000"],
    ["000000000000", "088000008880", "871880088088", "888888880002", "022222200000", "000000000000", "000000000000", "000000000000"],
  ],
};

const CARD_MENU = ["NEW ROUND", "MY DISK", "TEST SOL", "EJECT"] as const;
const DISK_MENU = ["COLLECT COINS", "RELEASE DISK", "BACK"] as const;

export class Tidepool {
  private scene: Scene = "boot";
  private busy: string | null = null;
  private error: string | null = null;
  private note: string | null = null;
  private t = 0;

  private signer?: TransactionSigner;
  private balance = BigInt(0);
  private pins: MapPool[] = [];
  private pinIdx = 0;
  private rebalances = 0;
  private disk?: chain.Creature;
  private diskPool?: chain.Pool;
  private food: chain.Food = { sol: 0, usdc: 0 };

  private hist: Candle[] = [];
  private ticks: number[] = [];
  private live = 0;
  private feedOk = true;

  private menuIdx = 0;
  private pick = 1;
  private offset = 0; // range centre relative to live price, as a fraction

  private roundFrames = 0;
  private hp = 100;
  private inFrames = 0;
  private scoredFrames = 0;
  private hurtFlash = 0;
  private lastRange: { low: number; high: number } = { low: 0, high: 0 };

  private readonly glyphs = new Image(160, 6);

  constructor(private readonly con: Console, private readonly events: GameEvents = {}) {
    const img = con.banks.images[0]!;
    for (const [sx, frames] of Object.entries(SPRITES)) frames.forEach((rows, f) => img.load(Number(sx) + f * 12, 0, rows));
    const s = con.banks.sounds;
    s[0]!.set("c3 e3", "p", "4", "n", 2); // move
    s[1]!.set("g3 c4 e4 g4", "s", "5", "n n n f", 3); // success
    s[2]!.set("c2 a1 f1", "n", "6", "f", 6); // splash
    s[3]!.set("c2 c1", "s", "6", "n f", 8); // error
    s[4]!.set("f1", "n", "5", "f", 3); // hurt
    s[5]!.set("c3 g3 c4 e4 g4 c4", "p", "5", "n", 4); // round end fanfare
    s[10]!.set("c1 g0 a0 e0 f0 c0 f0 g0", "t", "4", "n", 30);
    s[11]!.set("e3 r g3 r a3 g3 e3 r f3 r a3 r g3 f3 e3 r", "t", "2", "n", 15);
    s[12]!.set("c2 c2 g1 g1 a1 a1 e1 e1", "t", "5", "n", 12);
    s[13]!.set("e3 g3 a3 c4 a3 g3 e3 d3", "s", "3", "n", 12);
    con.banks.musics[0]!.set([], [], [10], [11]);
    con.banks.musics[1]!.set([], [], [12], [13]);
  }

  // ---- async ------------------------------------------------------------------

  private run(label: string, fn: () => Promise<void>): void {
    if (this.busy) return;
    this.busy = label;
    this.error = null;
    fn()
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        this.error = msg.replace(/\s+/g, " ").slice(0, 120).toUpperCase();
        this.con.play(0, 3);
      })
      .finally(() => (this.busy = null));
  }

  private bg(fn: () => Promise<void>): void {
    fn().catch(() => {});
  }

  private get pin(): MapPool | undefined {
    return this.pins[this.pinIdx];
  }

  /** The host calls this when the player's wallet connects (or with undefined when it disconnects). */
  setSigner(signer: TransactionSigner | undefined): void {
    if (signer?.address === this.signer?.address) return;
    this.signer = signer;
    this.disk = undefined;
    this.food = { sol: 0, usdc: 0 };
    if (!signer) {
      this.scene = "boot";
      this.con.stopAll();
      return;
    }
    if (this.scene === "boot" || this.scene === "insert") this.boot();
  }

  private boot(): void {
    if (!this.signer) {
      this.scene = "insert";
      this.events.onConnect?.();
      return;
    }
    const signer = this.signer;
    this.run("READING CARTRIDGE", async () => {
      this.balance = await chain.withRetry(() => chain.solBalance(signer.address));
      await this.loadDisk();
      this.hist = await fetchCandles(50);
      this.live = this.hist[this.hist.length - 1]?.c ?? 0;
      this.ticks = this.hist.map((c) => c.c);
      this.scene = "card";
      this.menuIdx = 0;
      this.con.playm(0, true);
    });
  }

  private async loadDisk(): Promise<void> {
    const list = await chain.creatures(this.signer!.address);
    this.disk = list.find((c) => c.liquidity > BigInt(0)) ?? list[0];
    this.diskPool = this.disk ? await chain.readPool(this.disk.pool) : undefined;
    if (this.disk && this.diskPool) this.food = await chain.foodInBowl(this.signer!, this.disk, this.diskPool.solIsA);
  }

  private openMap(): void {
    this.run("CHARTING THE SEA", async () => {
      this.balance = await chain.withRetry(() => chain.solBalance(this.signer!.address));
      if (this.balance < FED) throw new Error("you need 0.25 test SOL. pick TEST SOL on the card");
      this.pins = await mapPools();
      this.pinIdx = 0;
      this.scene = "map";
    });
  }

  private cast(): void {
    const pool = this.pin!;
    const cr = CREATURES[this.pick]!;
    const offset = this.offset;
    this.run("CASTING YOUR DISK", async () => {
      if (this.balance < BigInt(Math.round((HATCH_SOL + 0.03) * 1e9))) throw new Error("not enough food to cast");
      // Same range shape around the devnet pool price: centre offset and half-width carry over.
      const fresh = await chain.readPool(pool.address);
      const c = fresh.price * (1 + offset);
      const h = await chain.hatch(this.signer!, fresh, HATCH_SOL, { low: c * (1 - cr.half), high: c * (1 + cr.half) });
      this.events.onTx?.("trade half for USDC", h.swapSig);
      this.events.onTx?.("save disk (open Orca position)", h.openSig);
      this.con.play(0, 2);
      this.balance = await chain.solBalance(this.signer!.address);
      await this.loadDisk();
      this.startRound();
    });
  }

  private startRound(): void {
    const cr = CREATURES[this.pick]!;
    const centre = this.live * (1 + this.offset);
    this.lastRange = { low: centre * (1 - cr.half), high: centre * (1 + cr.half) };
    this.roundFrames = ROUND_SECONDS * FPS;
    this.hp = 100;
    this.inFrames = 0;
    this.scoredFrames = 0;
    this.rebalances = 0;
    this.scene = "round";
    this.con.playm(1, true);
  }

  private endRound(): void {
    this.scene = "results";
    this.con.stopAll();
    this.con.play(0, 5);
    this.bg(async () => {
      if (this.disk && this.diskPool) this.food = await chain.foodInBowl(this.signer!, this.disk, this.diskPool.solIsA);
    });
  }

  private collect(): void {
    const d = this.disk;
    if (!d) return;
    this.run("COLLECTING COINS", async () => {
      const sig = await chain.eat(this.signer!, d);
      this.events.onTx?.("collect coins (harvest fees)", sig);
      this.con.play(0, 1);
      await this.loadDisk();
      this.note = "COINS COLLECTED";
    });
  }

  private release(): void {
    const d = this.disk;
    if (!d) return;
    this.run("RELEASING THE DISK", async () => {
      const sig = await chain.release(this.signer!, d);
      this.events.onTx?.("release disk (close position)", sig);
      this.disk = undefined;
      this.food = { sol: 0, usdc: 0 };
      this.balance = await chain.solBalance(this.signer!.address);
      await this.loadDisk();
      this.scene = "card";
      this.note = "DISK RELEASED. FOOD BACK IN THE BOAT";
    });
  }

  /**
   * REBALANCE mid-round: pull the disk in and re-cast it centred on where the price is now.
   * Two real transactions (close, then swap+open); the round clock pauses while they sign.
   */
  private rebalance(): void {
    const d = this.disk;
    const pool = this.pin;
    if (!d || !pool) return;
    const cr = CREATURES[this.pick]!;
    this.run("RE-CASTING THE NET", async () => {
      const closeSig = await chain.release(this.signer!, d);
      this.events.onTx?.("rebalance: close old position", closeSig);
      const fresh = await chain.readPool(pool.address);
      const h = await chain.hatch(this.signer!, fresh, HATCH_SOL, { low: fresh.price * (1 - cr.half), high: fresh.price * (1 + cr.half) });
      this.events.onTx?.("rebalance: trade half", h.swapSig);
      this.events.onTx?.("rebalance: open new position", h.openSig);
      await this.loadDisk();
      this.offset = 0;
      this.lastRange = { low: this.live * (1 - cr.half), high: this.live * (1 + cr.half) };
      this.rebalances++;
      this.con.play(0, 2);
    });
  }

  // ---- update -------------------------------------------------------------------

  update(): void {
    this.t++;
    const inp = this.con.input;
    const a = inp.btnp(BTN_A);
    const b = inp.btnp(BTN_B);
    const up = inp.btnp(BTN_UP, 8, 2);
    const down = inp.btnp(BTN_DOWN, 8, 2);
    const left = inp.btnp(BTN_LEFT);
    const right = inp.btnp(BTN_RIGHT);

    // the live price keeps flowing on every screen after boot
    if (this.scene !== "boot" && this.t % TICK_FRAMES === 0) {
      this.bg(async () => {
        try {
          this.live = await lastPrice();
          this.feedOk = true;
          this.ticks.push(this.live);
          if (this.ticks.length > 120) this.ticks.shift();
        } catch {
          this.feedOk = false;
        }
      });
    }
    if (this.scene === "round" && this.t % FEE_FRAMES === 0 && this.disk && this.diskPool) {
      this.bg(async () => {
        this.food = await chain.foodInBowl(this.signer!, this.disk!, this.diskPool!.solIsA);
      });
    }

    if (this.scene === "round") {
      if (this.error) {
        if (a || b) this.error = null;
        return;
      }
      if (this.busy) return; // clock pauses while the wallet signs
      if (a) {
        this.rebalance();
        return;
      }
      this.updateRound(b);
      return;
    }
    if (this.error) {
      if (a || b) this.error = null;
      return;
    }
    if (this.busy) return;
    if (this.note) {
      if (a || b) this.note = null;
      return;
    }

    const blip = () => this.con.play(0, 0);
    switch (this.scene) {
      case "boot":
      case "insert":
        if (a) {
          blip();
          this.boot();
        }
        break;
      case "card":
        if (up) { this.menuIdx = (this.menuIdx + CARD_MENU.length - 1) % CARD_MENU.length; blip(); }
        if (down) { this.menuIdx = (this.menuIdx + 1) % CARD_MENU.length; blip(); }
        if (a) {
          blip();
          const item = CARD_MENU[this.menuIdx];
          if (item === "NEW ROUND") this.openMap();
          else if (item === "MY DISK") {
            if (this.disk) { this.scene = "disk"; this.menuIdx = 0; }
            else this.note = "NO DISK YET. PLAY A NEW ROUND TO SAVE ONE";
          } else if (item === "TEST SOL") {
            this.note = "SET YOUR WALLET TO DEVNET, THEN GET FREE TEST SOL AT FAUCET.SOLANA.COM";
          } else if (item === "EJECT") this.events.onEject?.();
        }
        break;
      case "map": {
        const dir = up ? "UP" : down ? "DOWN" : left ? "LEFT" : right ? "RIGHT" : null;
        if (dir) { this.pinIdx = nextPin(this.pins, this.pinIdx, dir); blip(); }
        if (a) { blip(); this.scene = "pick"; }
        if (b) { this.scene = "card"; this.menuIdx = 0; }
        break;
      }
      case "pick":
        if (left) { this.pick = (this.pick + 2) % 3; blip(); }
        if (right) { this.pick = (this.pick + 1) % 3; blip(); }
        if (a) { blip(); this.offset = 0; this.scene = "range"; }
        if (b) this.scene = "map";
        break;
      case "range":
        if (up) { this.offset = Math.min(0.05, this.offset + 0.001); blip(); }
        if (down) { this.offset = Math.max(-0.05, this.offset - 0.001); blip(); }
        if (a) this.cast();
        if (b) this.scene = "pick";
        break;
      case "results":
        if (a) this.collect();
        if (b) { this.scene = "card"; this.menuIdx = 0; this.con.playm(0, true); }
        break;
      case "disk":
        if (up) { this.menuIdx = (this.menuIdx + DISK_MENU.length - 1) % DISK_MENU.length; blip(); }
        if (down) { this.menuIdx = (this.menuIdx + 1) % DISK_MENU.length; blip(); }
        if (b) { this.scene = "card"; this.menuIdx = 1; }
        if (a) {
          blip();
          const item = DISK_MENU[this.menuIdx];
          if (item === "COLLECT COINS") this.collect();
          else if (item === "RELEASE DISK") this.release();
          else { this.scene = "card"; this.menuIdx = 1; }
        }
        break;
    }
  }

  private updateRound(giveUp: boolean): void {
    if (giveUp) {
      this.endRound();
      return;
    }
    if (!this.feedOk) return; // no price, no scoring: never score on a guess
    this.roundFrames--;
    this.scoredFrames++;
    const inside = this.live >= this.lastRange.low && this.live <= this.lastRange.high;
    if (inside) this.inFrames++;
    else if (this.t % 15 === 0) {
      this.hp = Math.max(0, this.hp - 3);
      this.hurtFlash = 6;
      this.con.play(1, 4);
    }
    if (this.hurtFlash > 0) this.hurtFlash--;
    if (this.roundFrames <= 0 || this.hp <= 0) this.endRound();
  }

  // ---- drawing helpers ----------------------------------------------------------

  private get s() {
    return this.con.screen;
  }

  private big(x: number, y: number, str: string, col: number, k: number): void {
    const g = this.glyphs;
    g.cls(0);
    g.text(0, 0, str, 1);
    for (let j = 0; j < 6; j++)
      for (let i = 0; i < str.length * 4; i++) if (g.get(i, j)) this.s.rect(x + i * k, y + j * k, k, k, col);
  }

  private bigCenter(y: number, str: string, col: number, k: number): void {
    const x = Math.floor((SCREEN_W - str.length * 4 * k) / 2);
    this.big(x + 1, y + 1, str, INK, k);
    this.big(x, y, str, col, k);
  }

  private center(y: number, str: string, col: number): void {
    const x = Math.floor((SCREEN_W - str.length * 4) / 2);
    this.s.text(x + 1, y + 1, str, INK);
    this.s.text(x, y, str, col);
  }

  private sprite(x: number, y: number, sx: number, k = 1, flip = false): void {
    const frame = Math.floor(this.t / 8) % 2;
    const bank = this.con.banks.images[0]!;
    if (k === 1) {
      this.s.blt(x, y, bank, sx + frame * 12, 0, flip ? -12 : 12, 8, 0);
      return;
    }
    for (let j = 0; j < 8; j++)
      for (let i = 0; i < 12; i++) {
        const c = bank.get(sx + frame * 12 + (flip ? 11 - i : i), j);
        if (c) this.s.rect(x + i * k, y + j * k, k, k, c);
      }
  }

  private hud(left: string, right: string, rightCol = GOLD): void {
    this.s.rect(0, 0, SCREEN_W, 9, INK);
    this.s.text(3, 2, left, WHITE);
    this.s.text(SCREEN_W - 3 - right.length * 4, 2, right, rightCol);
  }

  private foot(text: string, col = GREY): void {
    this.s.rect(0, SCREEN_H - 9, SCREEN_W, 9, INK);
    this.s.text(3, SCREEN_H - 7, text, col);
  }

  private box(lines: string[], col: number): void {
    const w = Math.min(SCREEN_W - 10, Math.max(...lines.map((l) => l.length)) * 4 + 12);
    const h = lines.length * 8 + 8;
    const x = Math.floor((SCREEN_W - w) / 2);
    const y = Math.floor((SCREEN_H - h) / 2);
    this.s.rect(x, y, w, h, INK);
    this.s.rectb(x, y, w, h, col);
    lines.forEach((l, i) => this.s.text(x + Math.floor((w - l.length * 4) / 2), y + 5 + i * 8, l, col));
  }

  private wrap(msg: string, width = 34): string[] {
    const out: string[] = [];
    let line = "";
    for (const word of msg.split(" ")) {
      if ((line + " " + word).trim().length > width) {
        out.push(line.trim());
        line = word;
      } else line += " " + word;
    }
    if (line.trim()) out.push(line.trim());
    return out.slice(0, 8);
  }

  private sea(): void {
    const s = this.s;
    [SKY, CORN, BLUE, NAVY].forEach((c, i) => s.rect(0, 9 + i * 32, SCREEN_W, 32, c));
    for (let x = 0; x < SCREEN_W; x++) s.pset(x, 20 + Math.round(Math.sin((x + this.t) / 7) * 1.5), WHITE);
    for (let i = 0; i < 8; i++) {
      const bx = (i * 41 + 13) % SCREEN_W;
      const by = SCREEN_H - 20 - ((this.t / 2 + i * 29) % 100);
      s.pset(bx + Math.round(Math.sin((this.t + i * 9) / 8)), by, SKY);
    }
  }

  private bars(x: number, y: number, n: number, col: number): void {
    for (let i = 0; i < 5; i++) this.s.rect(x + i * 5, y, 4, 4, i < n ? col : PLUM);
  }

  /**
   * Price chart in a box: candles for history or a line for live ticks, the range as a
   * shaded band, the live price as a tag on the right edge. Returns the price->y mapper.
   */
  private chart(x: number, y: number, w: number, h: number, mode: "candles" | "line", range: { low: number; high: number } | null, inside: boolean): (p: number) => number {
    const s = this.s;
    s.rect(x, y, w, h, NAVY);
    const plotW = w - 26;
    const vals: number[] = mode === "candles" ? this.hist.flatMap((c) => [c.h, c.l]) : this.ticks.slice(-Math.floor(plotW / 2));
    if (this.live) vals.push(this.live);
    if (range) vals.push(range.low, range.high);
    let lo = Math.min(...vals);
    let hi = Math.max(...vals);
    const pad = (hi - lo) * 0.12 || this.live * 0.002;
    lo -= pad;
    hi += pad;
    const py = (p: number) => Math.round(y + h - 1 - ((p - lo) / (hi - lo)) * (h - 1));

    for (let i = 1; i <= 3; i++) {
      const gy = y + Math.round((h * i) / 4);
      for (let gx = x; gx < x + plotW; gx += 3) s.pset(gx, gy, PLUM);
    }

    if (range) {
      const ry1 = py(range.high);
      const ry2 = py(range.low);
      for (let yy = ry1; yy <= ry2; yy++) for (let xx = x + ((yy + this.t) % 2); xx < x + plotW; xx += 2) s.pset(xx, yy, inside ? TEAL : PLUM);
      s.line(x, ry1, x + plotW, ry1, inside ? MINT : PINK);
      s.line(x, ry2, x + plotW, ry2, inside ? MINT : PINK);
    }

    if (mode === "candles") {
      const n = Math.min(this.hist.length, Math.floor(plotW / 3));
      this.hist.slice(-n).forEach((c, i) => {
        const cx = x + 1 + i * 3;
        const col = c.c >= c.o ? MINT : PINK;
        s.line(cx, py(c.h), cx, py(c.l), col);
        const top = py(Math.max(c.o, c.c));
        const bot = py(Math.min(c.o, c.c));
        s.rect(cx, top, 2, Math.max(1, bot - top + 1), col);
      });
    } else {
      const pts = this.ticks.slice(-Math.floor(plotW / 2));
      for (let i = 1; i < pts.length; i++) s.line(x + (i - 1) * 2, py(pts[i - 1]!), x + i * 2, py(pts[i]!), WHITE);
    }

    if (this.live) {
      const ly = py(this.live);
      for (let gx = x; gx < x + plotW; gx += 2) s.pset(gx, ly, GOLD);
      s.rect(x + plotW + 1, ly - 3, 25, 7, GOLD);
      s.text(x + plotW + 2, ly - 2, this.live.toFixed(2).slice(0, 6), INK);
    }
    s.text(x + plotW + 2, y + 1, hi.toFixed(1).slice(0, 6), GREY);
    s.text(x + plotW + 2, y + h - 6, lo.toFixed(1).slice(0, 6), GREY);
    return py;
  }

  private coins(): number {
    return this.food.usdc + this.food.sol * (this.diskPool?.price ?? 0);
  }

  // ---- screens --------------------------------------------------------------------

  draw(): void {
    const s = this.s;
    s.cls(NAVY);
    switch (this.scene) {
      case "boot": {
        this.sea();
        this.bigCenter(30, "TIDEPOOL", GOLD, 3);
        this.center(56, "KEEP THE PRICE IN YOUR NET", WHITE);
        CREATURES.forEach((c, i) => this.sprite(26 + i * 40, 78 + (i === 1 ? -4 : 0), c.sx, 2, i === 2));
        if (this.t % 30 < 20) this.center(112, "PRESS A", WHITE);
        s.rect(0, SCREEN_H - 8, SCREEN_W, 8, SAND);
        break;
      }
      case "card": {
        this.sea();
        this.hud("SAVE CARD", this.signer ? shortId(this.signer.address) : "");
        s.rect(10, 16, 140, 50, INK);
        s.rectb(10, 16, 140, 50, GOLD);
        this.sprite(16, 28, CREATURES[this.pick]!.sx, 2);
        const food = Number(this.balance) / 1e9;
        s.text(50, 22, `FOOD   ${food.toFixed(2)}`, food >= 0.25 ? WHITE : PINK);
        s.text(50, 32, `DISK   ${this.disk ? shortId(this.disk.mint) : "NONE"}`, WHITE);
        s.text(50, 42, `COINS  $${this.coins().toFixed(4)}`, GOLD);
        s.text(50, 52, `SOL    ${this.live ? this.live.toFixed(2) : "--"}`, this.feedOk ? MINT : PINK);
        CARD_MENU.forEach((m, i) => {
          const sel = i === this.menuIdx;
          const y = 76 + i * 12;
          if (sel) s.rect(28, y - 3, 104, 11, TEAL);
          s.text(36, y, m, sel ? WHITE : GREY);
          if (sel) s.tri(30, y - 1, 30, y + 5, 33, y + 2, GOLD);
        });
        this.foot("UP/DN CHOOSE   A OK");
        break;
      }
      case "insert": {
        this.sea();
        this.bigCenter(28, "INSERT", GOLD, 2);
        this.bigCenter(44, "CARTRIDGE", GOLD, 2);
        // a cartridge sliding into a slot
        const cy = 66 + Math.round(Math.abs(Math.sin(this.t / 12)) * 6);
        s.rect(64, cy, 32, 26, GREY);
        s.rect(68, cy + 4, 24, 12, NAVY);
        s.text(70, cy + 7, "SOL", GOLD);
        for (let i = 0; i < 6; i++) s.rect(66 + i * 5, cy + 22, 3, 4, GOLD);
        s.rect(56, 96, 48, 4, INK);
        this.center(108, "APPROVE IN YOUR WALLET", WHITE);
        this.center(118, "(SET IT TO DEVNET)", GREY);
        this.foot("A TRY AGAIN");
        break;
      }
      case "map": {
        s.cls(NAVY);
        this.hud("WORLD MAP", `${this.pinIdx + 1}/${this.pins.length}`);
        // chart area: x = safety, y = heat
        const mx = 16, my = 14, mw = 138, mh = 78;
        s.rect(mx, my, mw, mh, INK);
        // three risk zones, left to right
        s.rect(mx, my, mw * 0.3, mh, PLUM);
        s.rect(mx + mw * 0.3, my, mw * 0.4, mh, 5);
        s.rect(mx + mw * 0.7, my, mw * 0.3, mh, TEAL);
        for (let gx = mx; gx < mx + mw; gx += 4) s.pset(gx, my + mh / 2, NAVY);
        s.text(mx + 2, my + mh + 2, "RISKY", PINK);
        s.text(mx + mw - 18, my + mh + 2, "SAFE", MINT);
        s.text(2, my + 1, "HOT", GOLD);
        s.text(2, my + mh - 6, "CALM", GREY);
        this.pins.forEach((p, i) => {
          const px = mx + 3 + Math.round((p.safety / 100) * (mw - 6));
          const py = my + 3 + Math.round(((100 - p.heat) / 100) * (mh - 6)) + (i % 3) - 1;
          const col = p.safety >= 70 ? MINT : p.safety >= 30 ? GOLD : PINK;
          if (i === this.pinIdx) {
            s.circb(px, py, 4 + (this.t % 20 < 10 ? 1 : 0), WHITE);
            s.circ(px, py, 2, col);
          } else s.circ(px, py, 1, col);
        });
        const p = this.pin;
        if (p) {
          s.rect(0, 102, SCREEN_W, 33, INK);
          s.text(4, 105, p.label, GOLD);
          s.text(60, 105, `FEE ${(p.feeRate / 10000).toFixed(2)}%`, WHITE);
          s.text(4, 114, `TVL $${p.tvl < 1000 ? p.tvl.toFixed(2) : Math.round(p.tvl)}`, WHITE);
          s.text(72, 114, `24H VOL $${p.vol24 < 1000 ? p.vol24.toFixed(1) : Math.round(p.vol24)}`, WHITE);
          s.text(4, 123, "SAFETY", GREY);
          this.bars(32, 124, Math.max(1, Math.round(p.safety / 20)), MINT);
          s.text(64, 123, "HEAT", GREY);
          this.bars(84, 124, Math.max(0, Math.round(p.heat / 20)), GOLD);
        }
        this.foot("ORCA DEVNET  DPAD MOVE  A GO");
        break;
      }
      case "pick": {
        this.sea();
        this.hud("PICK YOUR CREATURE", `${this.pick + 1}/3`);
        const c = CREATURES[this.pick]!;
        s.tri(10, 44, 16, 38, 16, 50, this.t % 30 < 15 ? GOLD : WHITE);
        s.tri(150, 44, 144, 38, 144, 50, this.t % 30 < 15 ? GOLD : WHITE);
        this.sprite(56, 26 + Math.round(Math.sin(this.t / 10) * 2), c.sx, 4, this.pick === 2);
        this.bigCenter(64, c.name, GOLD, 2);
        this.center(80, c.blurb, WHITE);
        s.text(34, 94, "SAFETY", GREY);
        this.bars(76, 95, c.safety, MINT);
        s.text(34, 104, "REWARD", GREY);
        this.bars(76, 105, c.reward, GOLD);
        s.text(34, 116, `NET SIZE +-${(c.half * 100).toFixed(1)}%`, GREY);
        this.foot("< > CHANGE   A CHOOSE   B BACK");
        break;
      }
      case "range": {
        const c = CREATURES[this.pick]!;
        const centre = this.live * (1 + this.offset);
        const range = { low: centre * (1 - c.half), high: centre * (1 + c.half) };
        const inside = this.live >= range.low && this.live <= range.high;
        this.hud("SET YOUR NET", c.name);
        const py = this.chart(2, 11, 156, 104, "candles", range, inside);
        this.sprite(104, py(this.live) - 9, c.sx);
        s.text(4, 118, `NET ${range.low.toFixed(2)} - ${range.high.toFixed(2)}`, inside ? MINT : PINK);
        s.text(4, 126, `${PRICE_SOURCE}, 1 MIN CANDLES`, GREY);
        this.foot("UP/DN MOVE NET  A CAST  B BACK");
        break;
      }
      case "round": {
        const c = CREATURES[this.pick]!;
        const inside = this.live >= this.lastRange.low && this.live <= this.lastRange.high;
        const secs = Math.ceil(this.roundFrames / FPS);
        this.hud(`TIME ${secs}`, `COINS $${this.coins().toFixed(4)}`);
        const py = this.chart(2, 11, 156, 100, "line", this.lastRange, inside);
        const cy = py(this.live) - 9;
        if (!(this.hurtFlash > 0 && this.hurtFlash % 2 === 0)) this.sprite(112, cy, c.sx);
        if (!inside && this.t % 20 < 12) this.center(Math.max(14, cy - 8), "OUCH! OUT OF THE NET", PINK);
        s.text(4, 114, "HP", WHITE);
        s.rect(16, 114, 60, 5, PLUM);
        s.rect(16, 114, Math.round(this.hp * 0.6), 5, this.hp > 40 ? MINT : PINK);
        const pct = this.scoredFrames ? Math.round((this.inFrames / this.scoredFrames) * 100) : 100;
        s.text(84, 114, `IN NET ${pct}%`, inside ? MINT : PINK);
        s.text(4, 124, this.feedOk ? `LIVE ${PRICE_SOURCE}` : "PRICE FEED LOST: PAUSED", this.feedOk ? GREY : PINK);
        this.foot(`A REBALANCE (${this.rebalances})   B END ROUND`);
        break;
      }
      case "results": {
        this.sea();
        this.hud("ROUND OVER", CREATURES[this.pick]!.name);
        const pct = this.scoredFrames ? Math.round((this.inFrames / this.scoredFrames) * 100) : 0;
        const grade = pct >= 90 ? "S" : pct >= 70 ? "A" : pct >= 45 ? "B" : "C";
        s.rect(8, 14, 144, 104, INK);
        s.rectb(8, 14, 144, 104, GOLD);
        this.big(20, 22, grade, grade === "S" || grade === "A" ? GOLD : WHITE, 5);
        s.text(52, 24, `IN THE NET  ${pct}%`, WHITE);
        s.text(52, 34, `TIME  ${Math.round(this.scoredFrames / FPS)}S`, WHITE);
        s.text(52, 44, `HP LEFT  ${this.hp}`, this.hp > 40 ? MINT : PINK);
        s.text(52, 54, `REBALANCES  ${this.rebalances}`, WHITE);
        s.text(14, 62, "YOUR DISK (DEVNET ORCA)", GREY);
        s.text(14, 72, this.disk ? `ID ${shortId(this.disk.mint)}` : "NO DISK", WHITE);
        s.text(14, 82, `COINS WAITING $${this.coins().toFixed(4)}`, GOLD);
        s.text(14, 96, "ROUND SCORED ON LIVE SOL PRICE.", GREY);
        s.text(14, 104, "COINS ARE THE DISK'S REAL FEES.", GREY);
        this.foot("A COLLECT COINS   B DONE");
        break;
      }
      case "disk": {
        this.sea();
        this.hud("MY DISK", "DEVNET");
        const d = this.disk;
        const p = this.diskPool;
        s.rect(6, 14, 148, 76, INK);
        s.rectb(6, 14, 148, 76, TEAL);
        if (d && p) {
          const inside = p.price >= d.lowerPrice && p.price <= d.upperPrice;
          const rows: [string, number][] = [
            ["TRUE VIEW: ORCA WHIRLPOOL", TEAL],
            [`POOL PRICE ${p.price.toFixed(4)}`, WHITE],
            [`RANGE ${d.lowerPrice.toFixed(3)}-${d.upperPrice.toFixed(3)}`, WHITE],
            [inside ? "IN RANGE: EARNING FEES" : "OUT OF RANGE: NO FEES", inside ? MINT : PINK],
            [`FEES ${this.food.sol.toFixed(6)} SOL`, WHITE],
            [`     ${this.food.usdc.toFixed(4)} USDC`, WHITE],
            [`POSITION ${shortId(d.mint)}`, GREY],
          ];
          rows.forEach(([l, col], i) => s.text(11, 19 + i * 10, l, col));
        }
        DISK_MENU.forEach((m, i) => {
          const sel = i === this.menuIdx;
          const y = 98 + i * 11;
          if (sel) s.rect(28, y - 3, 104, 10, TEAL);
          s.text(36, y, m, sel ? WHITE : GREY);
        });
        break;
      }
    }

    if (this.note && !this.busy && !this.error) this.box([...this.wrap(this.note), "", "A: OK"], GOLD);
    if (this.busy) this.box([this.busy + ".".repeat(1 + (Math.floor(this.t / 8) % 3)), "", "SIGNING ON SOLANA"], WHITE);
    if (this.error) this.box(["UH OH", ...this.wrap(this.error), "", "A: OK"], PINK);
  }
}
