import type { TransactionSigner } from "@solana/kit";
import { BTN_A, BTN_B, BTN_DOWN, BTN_LEFT, BTN_RIGHT, BTN_UP, type Console, Image } from "@/lib/console";
import * as chain from "./chain";
import { type MapPool, mapPools, nextPin } from "./pools";
import { lastPrice, PRICE_SOURCE } from "./prices";

/**
 * TIDEPOOL. An endless arcade round on the REAL live SOL price: your creature rides the price line,
 * you steer the net to keep it inside, catch pearls, dodge jellyfish, build combos. Points are points,
 * never money. After a good run you can put a real net (an Orca liquidity position on devnet, signed by
 * your own wallet) into the sea: the same skill, now earning real fees.
 */

export const SCREEN_W = 160;
export const SCREEN_H = 144;
const FPS = 30;
const HATCH_SOL = 0.2;
const FED = BigInt(250_000_000);
const PX_PER_FRAME = 0.5; // the price line scrolls ~15 px/s: about 9 s of real price on screen
const CREATURE_X = 100;
const LEVEL_FRAMES = FPS * 20;

type Scene = "boot" | "insert" | "card" | "pick" | "round" | "results" | "map" | "range" | "disk";

export interface GameEvents {
  onTx?: (label: string, signature: string) => void;
  onConnect?: () => void;
  onEject?: () => void;
  /** SHARE on the results screen: the host builds the image and opens the share sheet. */
  onShare?: (run: { score: number; best: number; creature: string; level: number; combo: number }) => void;
}

// palette indices
const INK = 0, NAVY = 1, PLUM = 2, TEAL = 3, BROWN = 4, BLUE = 5, SKY = 6, WHITE = 7, PINK = 8, ORANGE = 9, GOLD = 10, MINT = 11, CORN = 12, GREY = 13, ROSE = 14, SAND = 15;

interface Creature {
  name: string;
  net: number; // net half-height in pixels
  mult: number; // score multiplier
  magnet: number; // pearl catch slack in pixels
  sx: number;
  blurb: string;
}

const CREATURES: Creature[] = [
  { name: "SHELLY", net: 22, mult: 1, magnet: 2, sx: 0, blurb: "BIG NET. STEADY. X1 POINTS" },
  { name: "FINN", net: 16, mult: 2, magnet: 6, sx: 24, blurb: "PEARL MAGNET. X2 POINTS" },
  { name: "ZIP", net: 11, mult: 3, magnet: 2, sx: 48, blurb: "TINY NET. WILD. X3 POINTS" },
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
  // jellyfish, two frames, 8x8 at x=72
  72: [
    ["00eeee00", "0eeeeee0", "ee7ee7ee", "eeeeeeee", "0e0e0e00", "0e0e0e00", "e00e00e0", "0000e000"],
    ["00eeee00", "0eeeeee0", "ee7ee7ee", "eeeeeeee", "00e0e0e0", "0e0e0e00", "0e00e00e", "000e0000"],
  ],
};

const CARD_MENU = ["PLAY NOW", "REAL NET", "TEST SOL", "EJECT"] as const;
const DISK_MENU = ["COLLECT COINS", "RECENTRE NET", "PULL NET IN", "BACK"] as const;

interface Thing {
  x: number;
  y: number;
  kind: "pearl" | "gold" | "jelly";
  phase: number;
}
interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  col: number;
}
interface Popup {
  x: number;
  y: number;
  text: string;
  life: number;
  col: number;
}

const loadBest = (): number => {
  try {
    return Number(localStorage.getItem("tidepool.best") ?? 0) || 0;
  } catch {
    return 0;
  }
};
const saveBest = (n: number) => {
  try {
    localStorage.setItem("tidepool.best", String(n));
  } catch {
    /* private mode: best lives for this session only */
  }
};

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
  private disk?: chain.Creature;
  private diskPool?: chain.Pool;
  private food: chain.Food = { sol: 0, usdc: 0 };

  // live price
  private live = 0;
  private shown = 0;
  private feedOk = false;
  private samples: { f: number; p: number }[] = [];

  private menuIdx = 0;
  private pick = 1;
  private offset = 0;

  // round
  private trail: number[] = []; // one price per pixel column, newest last
  private scroll = 0;
  private lo = 0;
  private hi = 0;
  private netY = 72;
  private hp = 100;
  private score = 0;
  private best = 0;
  private beat = 0; // a friend's score from a challenge link
  private beatDone = false;
  private streak = 0;
  private newBest = false;
  private combo = 0;
  private maxCombo = 0;
  private pearls = 0;
  private level = 1;
  private roundF = 0;
  private insideF = 0;
  private things: Thing[] = [];
  private sparks: Spark[] = [];
  private pops: Popup[] = [];
  private shake = 0;
  private whaleF = 0;
  private banner: { text: string; life: number; col: number } | null = null;

  private readonly glyphs = new Image(160, 6);

  constructor(private readonly con: Console, private readonly events: GameEvents = {}) {
    const img = con.banks.images[0]!;
    for (const [sx, frames] of Object.entries(SPRITES)) {
      const w = frames[0]![0]!.length;
      frames.forEach((rows, f) => img.load(Number(sx) + f * w, 0, rows));
    }
    const s = con.banks.sounds;
    s[0]!.set("c3 e3", "p", "4", "n", 2); // move
    s[1]!.set("g3 c4 e4 g4", "s", "5", "n n n f", 3); // success
    s[2]!.set("c2 a1 f1", "n", "6", "f", 6); // splash
    s[3]!.set("c2 c1", "s", "6", "n f", 8); // error
    s[4]!.set("c1 c1", "n", "7", "f", 4); // hurt
    s[5]!.set("c3 g3 c4 e4 g4 c4", "p", "5", "n", 4); // fanfare
    s[6]!.set("c4 g3 c4 g4", "s", "6", "n n n f", 3); // level up
    s[7]!.set("g2 c3 g3 c4 g4", "t", "6", "v", 5); // whale
    // pearl notes climb a scale as the combo grows: the core feedback loop
    ["c3", "d3", "e3", "g3", "a3", "c4", "d4", "e4"].forEach((n, i) => s[20 + i]!.set(`${n} ${n}`, "p", "5 3", "n f", 2));
    s[10]!.set("c2 c2 g1 g1 a1 a1 e1 e1", "t", "5", "n", 10);
    s[11]!.set("e3 g3 a3 c4 a3 g3 e3 d3 e3 g3 c4 d4 e4 d4 c4 a3", "s", "3", "n", 10);
    s[12]!.set("c1 g0 a0 e0 f0 c0 f0 g0", "t", "4", "n", 30);
    s[13]!.set("e3 r g3 r a3 g3 e3 r f3 r a3 r g3 f3 e3 r", "t", "2", "n", 15);
    con.banks.musics[0]!.set([], [], [12], [13]);
    con.banks.musics[1]!.set([], [], [10], [11]);
    this.best = loadBest();
    this.streak = readStreak().count;
  }

  // ---- async ---------------------------------------------------------------------

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

  /** A score to beat, from a friend's challenge link (?beat=1240). */
  setChallenge(score: number): void {
    this.beat = Number.isFinite(score) && score > 0 ? Math.floor(score) : 0;
  }

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
      this.live = await lastPrice();
      this.shown = this.live;
      this.feedOk = true;
      this.balance = await chain.withRetry(() => chain.solBalance(signer.address));
      await this.loadDisk();
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
      if (this.balance < FED) throw new Error("a real net needs 0.25 test sol. pick TEST SOL on the card");
      this.pins = await mapPools();
      this.pinIdx = 0;
      this.scene = "map";
    });
  }

  private cast(): void {
    const pool = this.pin!;
    const half = [0.03, 0.012, 0.004][this.pick]!;
    const offset = this.offset;
    this.run("CASTING YOUR REAL NET", async () => {
      const fresh = await chain.readPool(pool.address);
      const c = fresh.price * (1 + offset);
      const h = await chain.hatch(this.signer!, fresh, HATCH_SOL, { low: c * (1 - half), high: c * (1 + half) });
      this.events.onTx?.("trade half for USDC", h.swapSig);
      this.events.onTx?.("cast real net (open Orca position)", h.openSig);
      this.con.play(0, 2);
      this.balance = await chain.solBalance(this.signer!.address);
      await this.loadDisk();
      this.scene = "disk";
      this.menuIdx = 0;
      this.note = "YOUR REAL NET IS IN THE WATER. COINS IT CATCHES ARE REAL FEES";
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
      this.note = "COINS SENT TO YOUR WALLET";
    });
  }

  private recentre(): void {
    const d = this.disk;
    const p = this.diskPool;
    if (!d || !p) return;
    const width = d.upperPrice / d.lowerPrice;
    this.run("RECENTRING THE NET", async () => {
      const closeSig = await chain.release(this.signer!, d);
      this.events.onTx?.("recentre: close old position", closeSig);
      const fresh = await chain.readPool(p.address);
      const half = (Math.sqrt(width) - 1) / (Math.sqrt(width) + 1) + 0.0001;
      const h = await chain.hatch(this.signer!, fresh, HATCH_SOL, { low: fresh.price * (1 - half), high: fresh.price * (1 + half) });
      this.events.onTx?.("recentre: trade half", h.swapSig);
      this.events.onTx?.("recentre: open new position", h.openSig);
      await this.loadDisk();
      this.con.play(0, 2);
      this.note = "NET RECENTRED ON THE PRICE";
    });
  }

  private release(): void {
    const d = this.disk;
    if (!d) return;
    this.run("PULLING THE NET IN", async () => {
      const sig = await chain.release(this.signer!, d);
      this.events.onTx?.("pull net in (close position)", sig);
      this.disk = undefined;
      this.food = { sol: 0, usdc: 0 };
      this.balance = await chain.solBalance(this.signer!.address);
      await this.loadDisk();
      this.scene = "card";
      this.note = "NET BACK ON THE BOAT. FUNDS BACK IN YOUR WALLET";
    });
  }

  private get pin(): MapPool | undefined {
    return this.pins[this.pinIdx];
  }

  // ---- the round -------------------------------------------------------------------

  private startRound(): void {
    this.trail = Array(Math.ceil(SCREEN_W / 1)).fill(this.shown || this.live);
    this.scroll = 0;
    this.lo = this.shown * 0.9996;
    this.hi = this.shown * 1.0004;
    this.netY = 72;
    this.hp = 100;
    this.score = 0;
    this.newBest = false;
    this.combo = 0;
    this.maxCombo = 0;
    this.pearls = 0;
    this.level = 1;
    this.roundF = 0;
    this.insideF = 0;
    this.things = [];
    this.sparks = [];
    this.pops = [];
    this.whaleF = 0;
    this.banner = { text: "KEEP ME IN THE NET!", life: 60, col: WHITE };
    this.scene = "round";
    this.con.playm(1, true);
  }

  private py(p: number): number {
    const top = 14;
    const bot = SCREEN_H - 14;
    return Math.round(bot - ((p - this.lo) / (this.hi - this.lo)) * (bot - top));
  }

  private burst(x: number, y: number, col: number, n = 8): void {
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n + Math.random();
      const v = 0.8 + Math.random() * 1.4;
      this.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 14 + Math.floor(Math.random() * 8), col });
    }
  }

  private pop(x: number, y: number, text: string, col: number): void {
    this.pops.push({ x, y, text, life: 24, col });
  }

  private get mult(): number {
    const c = CREATURES[this.pick]!;
    const whale = this.whaleF > 0 ? 2 : 1;
    return c.mult * whale * Math.min(8, 1 + Math.floor(this.combo / 10));
  }

  private netHalf(): number {
    return Math.max(7, CREATURES[this.pick]!.net - (this.level - 1) * 2);
  }

  private updateRound(): void {
    const inp = this.con.input;
    if (!this.feedOk) return; // never play on a guessed price
    this.roundF++;

    // price display eases toward the latest real tick
    this.shown += (this.live - this.shown) * 0.12;
    this.scroll += PX_PER_FRAME;
    while (this.scroll >= 1) {
      this.scroll -= 1;
      this.trail.push(this.shown);
      if (this.trail.length > SCREEN_W) this.trail.shift();
    }
    // zoom the window to recent movement so real micro-moves are visible, but never flatter than 0.06%
    const recent = this.trail.slice(-120);
    const mn = Math.min(...recent);
    const mx = Math.max(...recent);
    const minSpan = this.shown * 0.0006;
    const span = Math.max(mx - mn, minSpan) * 1.6;
    const mid = (mn + mx) / 2;
    this.lo += (mid - span / 2 - this.lo) * 0.05;
    this.hi += (mid + span / 2 - this.hi) * 0.05;

    // steer the net
    const speed = inp.btn(BTN_A) ? 3.2 : 1.9; // hold A to swim faster
    if (inp.btn(BTN_UP)) this.netY -= speed;
    if (inp.btn(BTN_DOWN)) this.netY += speed;
    this.netY = Math.max(16, Math.min(SCREEN_H - 16, this.netY));

    const h = this.netHalf();
    const cy = this.py(this.shown);
    const inside = Math.abs(cy - this.netY) <= h;
    if (inside) {
      this.insideF++;
      if (this.roundF % 15 === 0) {
        this.combo++;
        this.maxCombo = Math.max(this.maxCombo, this.combo);
        this.score += this.mult;
        if (this.combo % 10 === 0) {
          this.pop(CREATURE_X, cy - 12, `COMBO X${Math.min(8, 1 + this.combo / 10)}`, GOLD);
          this.con.play(1, 6);
        }
      }
    } else {
      if (this.combo >= 10) this.pop(CREATURE_X, cy - 12, "COMBO LOST", PINK);
      this.combo = 0;
      if (this.roundF % 10 === 0) {
        this.hp -= 2;
        this.shake = 4;
        this.con.play(1, 4);
      }
    }

    // spawns
    const pearlEvery = Math.max(18, 38 - this.level * 3);
    const jellyEvery = Math.max(40, 110 - this.level * 12);
    if (this.roundF % pearlEvery === 0) {
      const gold = Math.random() < 0.06;
      this.things.push({ x: SCREEN_W + 4, y: Math.max(18, Math.min(SCREEN_H - 18, cy + (Math.random() - 0.5) * 70)), kind: gold ? "gold" : "pearl", phase: Math.random() * 6 });
    }
    if (this.roundF > FPS * 4 && this.roundF % jellyEvery === 0) {
      this.things.push({ x: SCREEN_W + 4, y: 20 + Math.random() * (SCREEN_H - 40), kind: "jelly", phase: Math.random() * 6 });
    }

    const magnet = CREATURES[this.pick]!.magnet;
    for (const th of this.things) {
      th.x -= th.kind === "jelly" ? 0.9 + this.level * 0.08 : 1.3;
      th.phase += 0.1;
      const ty = th.y + (th.kind === "jelly" ? Math.sin(th.phase) * 6 : Math.sin(th.phase) * 1.5);
      if (th.x <= CREATURE_X + 6 && th.x >= CREATURE_X - 2) {
        const inNet = Math.abs(ty - this.netY) <= h + (th.kind === "jelly" ? 0 : magnet);
        if (inNet && th.kind !== "jelly") {
          const worth = (th.kind === "gold" ? 25 : 5) * this.mult;
          this.score += worth;
          this.pearls++;
          this.burst(th.x, ty, th.kind === "gold" ? GOLD : WHITE, th.kind === "gold" ? 14 : 8);
          this.pop(th.x, ty - 6, `+${worth}`, th.kind === "gold" ? GOLD : WHITE);
          this.con.play(2, 20 + Math.min(7, Math.floor(this.combo / 3)));
          th.x = -99;
        } else if (inNet && th.kind === "jelly") {
          this.hp -= 15;
          this.combo = 0;
          this.shake = 10;
          this.burst(th.x, ty, ROSE, 12);
          this.pop(th.x, ty - 6, "ZAP!", PINK);
          this.con.play(1, 4);
          th.x = -99;
        }
      }
    }
    this.things = this.things.filter((th) => th.x > -12);

    // WHALE WAVE: a real sharp move in the last ~5 s doubles points for 5 s
    const past = this.samples.find((s) => s.f >= this.t - FPS * 5);
    if (past && this.whaleF === 0 && Math.abs(this.live - past.p) / past.p > 0.0008) {
      this.whaleF = FPS * 5;
      this.banner = { text: "WHALE WAVE! X2", life: 50, col: GOLD };
      this.shake = 6;
      this.con.play(3, 7);
    }
    if (this.whaleF > 0) this.whaleF--;

    // levels
    if (this.roundF % LEVEL_FRAMES === 0) {
      this.level++;
      this.banner = { text: `LEVEL ${this.level}! NET SHRINKS`, life: 50, col: MINT };
      this.con.play(3, 6);
    }

    for (const sp of this.sparks) {
      sp.x += sp.vx;
      sp.y += sp.vy;
      sp.vy += 0.08;
      sp.life--;
    }
    this.sparks = this.sparks.filter((sp) => sp.life > 0);
    for (const p of this.pops) {
      p.y -= 0.5;
      p.life--;
    }
    this.pops = this.pops.filter((p) => p.life > 0);
    if (this.banner && --this.banner.life <= 0) this.banner = null;
    if (this.shake > 0) this.shake--;

    if (this.beat && !this.beatDone && this.score > this.beat) {
      this.beatDone = true;
      this.banner = { text: `YOU BEAT !`, life: 70, col: GOLD };
      this.burst(CREATURE_X, this.py(this.shown), GOLD, 20);
      this.con.play(3, 5);
    }
    if (this.hp <= 0) this.endRound();
  }

  private endRound(): void {
    this.hp = Math.max(0, this.hp);
    this.scene = "results";
    this.menuIdx = 0;
    this.con.stopAll();
    this.con.play(0, 5);
    if (this.score > this.best) {
      this.best = this.score;
      this.newBest = true;
      saveBest(this.best);
    }
    this.streak = bumpStreak();
  }

  // ---- update ----------------------------------------------------------------------

  update(): void {
    this.t++;
    const inp = this.con.input;
    const a = inp.btnp(BTN_A);
    const b = inp.btnp(BTN_B);
    const up = inp.btnp(BTN_UP, 8, 2);
    const down = inp.btnp(BTN_DOWN, 8, 2);
    const left = inp.btnp(BTN_LEFT);
    const right = inp.btnp(BTN_RIGHT);

    // a real price tick every second on every screen after boot
    if (this.scene !== "boot" && this.scene !== "insert" && this.t % FPS === 0) {
      this.bg(async () => {
        try {
          this.live = await lastPrice();
          this.feedOk = true;
          this.samples.push({ f: this.t, p: this.live });
          if (this.samples.length > 30) this.samples.shift();
        } catch {
          this.feedOk = false;
        }
      });
    }

    if (this.scene === "round") {
      if (b) {
        this.endRound();
        return;
      }
      this.updateRound();
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
          if (item === "PLAY NOW") this.scene = "pick";
          else if (item === "REAL NET") {
            if (this.disk) { this.scene = "disk"; this.menuIdx = 0; }
            else this.openMap();
          } else if (item === "TEST SOL") this.note = "SET YOUR WALLET TO DEVNET, THEN GET FREE TEST SOL AT FAUCET.SOLANA.COM";
          else if (item === "EJECT") this.events.onEject?.();
        }
        break;
      case "pick":
        if (left) { this.pick = (this.pick + 2) % 3; blip(); }
        if (right) { this.pick = (this.pick + 1) % 3; blip(); }
        if (a) { blip(); this.startRound(); }
        if (b) { this.scene = "card"; this.menuIdx = 0; }
        break;
      case "results":
        if (a) { blip(); this.startRound(); }
        if (up) { blip(); this.events.onShare?.({ score: this.score, best: this.best, creature: CREATURES[this.pick]!.name, level: this.level, combo: this.maxCombo }); }
        if (right) { blip(); if (this.disk) { this.scene = "disk"; this.menuIdx = 0; } else this.openMap(); }
        if (b) { this.scene = "card"; this.menuIdx = 0; this.con.playm(0, true); }
        break;
      case "map": {
        const dir = up ? "UP" : down ? "DOWN" : left ? "LEFT" : right ? "RIGHT" : null;
        if (dir) { this.pinIdx = nextPin(this.pins, this.pinIdx, dir); blip(); }
        if (a) { blip(); this.offset = 0; this.scene = "range"; }
        if (b) { this.scene = "card"; this.menuIdx = 0; }
        break;
      }
      case "range":
        if (left) { this.pick = (this.pick + 2) % 3; blip(); }
        if (right) { this.pick = (this.pick + 1) % 3; blip(); }
        if (up) { this.offset = Math.min(0.05, this.offset + 0.002); blip(); }
        if (down) { this.offset = Math.max(-0.05, this.offset - 0.002); blip(); }
        if (a) this.cast();
        if (b) this.scene = "map";
        break;
      case "disk":
        if (up) { this.menuIdx = (this.menuIdx + DISK_MENU.length - 1) % DISK_MENU.length; blip(); }
        if (down) { this.menuIdx = (this.menuIdx + 1) % DISK_MENU.length; blip(); }
        if (b) { this.scene = "card"; this.menuIdx = 1; }
        if (a) {
          blip();
          const item = DISK_MENU[this.menuIdx];
          if (item === "COLLECT COINS") this.collect();
          else if (item === "RECENTRE NET") this.recentre();
          else if (item === "PULL NET IN") this.release();
          else { this.scene = "card"; this.menuIdx = 1; }
        }
        break;
    }
  }

  // ---- drawing helpers ------------------------------------------------------------

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

  private outlined(x: number, y: number, str: string, col: number): void {
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) this.s.text(x + dx, y + dy, str, INK);
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

  private coins(): number {
    return this.food.usdc + this.food.sol * (this.diskPool?.price ?? 0);
  }

  // ---- screens --------------------------------------------------------------------

  private drawRound(): void {
    const s = this.s;
    const c = CREATURES[this.pick]!;
    const sx = this.shake ? Math.round((Math.random() - 0.5) * this.shake) : 0;
    const sy = this.shake ? Math.round((Math.random() - 0.5) * this.shake) : 0;
    s.camera(sx, sy);

    // deep water with light shafts that drift
    s.rect(-4, -4, SCREEN_W + 8, SCREEN_H + 8, NAVY);
    for (let i = 0; i < 4; i++) {
      const lx = ((i * 53 - this.roundF * 0.3) % 200) + 20;
      for (let y = 10; y < SCREEN_H; y += 4) s.pset(Math.round(lx + y * 0.35), y, PLUM);
    }
    // seabed
    for (let x = -4; x < SCREEN_W + 4; x++) {
      const by = SCREEN_H - 6 + Math.round(Math.sin((x + this.roundF * PX_PER_FRAME) / 9) * 1.5);
      s.line(x, by, x, SCREEN_H + 4, SAND);
    }

    const h = this.netHalf();
    const cy = this.py(this.shown);
    const inside = Math.abs(cy - this.netY) <= h;
    const whale = this.whaleF > 0;

    // the net: a lit band across the whole sea
    const top = Math.round(this.netY - h);
    const bot = Math.round(this.netY + h);
    for (let y = top; y <= bot; y += 3) for (let x = ((y / 3) % 2) * 2; x < SCREEN_W; x += 4) s.pset(x, y, inside ? TEAL : BLUE);
    s.line(0, top, SCREEN_W, top, inside ? (whale ? GOLD : MINT) : PINK);
    s.line(0, bot, SCREEN_W, bot, inside ? (whale ? GOLD : MINT) : PINK);
    for (let x = 6 - (Math.floor(this.roundF / 2) % 16); x < SCREEN_W; x += 16) s.circ(x, top, 1, ORANGE);

    // the real price line
    const n = this.trail.length;
    for (let i = 1; i < n; i++) {
      const x0 = CREATURE_X + 5 - (n - i);
      if (x0 < -2) continue;
      s.line(x0, this.py(this.trail[i - 1]!), x0 + 1, this.py(this.trail[i]!), i > n - 40 ? WHITE : GREY);
    }

    // pearls and jellyfish
    const bank = this.con.banks.images[0]!;
    for (const th of this.things) {
      const ty = Math.round(th.y + (th.kind === "jelly" ? Math.sin(th.phase) * 6 : Math.sin(th.phase) * 1.5));
      if (th.kind === "jelly") s.blt(Math.round(th.x) - 4, ty - 4, bank, 72 + (Math.floor(this.t / 10) % 2) * 8, 0, 8, 8, 0);
      else if (th.kind === "gold") {
        s.circ(Math.round(th.x), ty, 3, GOLD);
        s.pset(Math.round(th.x) - 1, ty - 1, WHITE);
        if (this.t % 10 < 5) s.pset(Math.round(th.x) + 4, ty - 4, WHITE);
      } else {
        s.circ(Math.round(th.x), ty, 2, WHITE);
        s.pset(Math.round(th.x) - 1, ty - 1, SKY);
      }
    }

    // creature rides the price
    const flash = this.shake > 0 && this.t % 2 === 0;
    if (!flash) this.sprite(CREATURE_X - 6, cy - 4, c.sx);
    if (!inside && this.t % 16 < 10) this.outlined(CREATURE_X - 14, cy - 13, "HELP!", PINK);

    for (const sp of this.sparks) s.pset(Math.round(sp.x), Math.round(sp.y), sp.col);
    for (const p of this.pops) this.outlined(Math.round(p.x - p.text.length * 2), Math.round(p.y), p.text, p.col);

    s.camera();

    // HUD
    s.rect(0, 0, SCREEN_W, 10, INK);
    s.text(3, 2, `${this.score}`, WHITE);
    const m = `X${this.mult}`;
    s.text(40, 2, m, this.whaleF > 0 ? GOLD : this.combo >= 10 ? MINT : GREY);
    s.rect(60, 3, 40, 4, PLUM);
    s.rect(60, 3, Math.round(Math.max(0, this.hp) * 0.4), 4, this.hp > 35 ? MINT : PINK);
    s.text(106, 2, this.beat && !this.beatDone ? `/` : `LV${this.level}`, this.beat && !this.beatDone ? ORANGE : CORN);
    s.text(SCREEN_W - 3 - `$${this.live.toFixed(2)}`.length * 4, 2, `$${this.live.toFixed(2)}`, GOLD);

    if (this.banner) {
      const w = this.banner.text.length * 4 + 10;
      const x = Math.floor((SCREEN_W - w) / 2);
      s.rect(x, 22, w, 11, INK);
      s.rectb(x, 22, w, 11, this.banner.col);
      s.text(x + 5, 25, this.banner.text, this.banner.col);
    }
    if (!this.feedOk) this.box(["WAITING FOR THE", "LIVE PRICE..."], PINK);
    s.rect(0, SCREEN_H - 7, SCREEN_W, 7, INK);
    s.text(3, SCREEN_H - 6, "LIVE SOL PRICE  UP/DN STEER  HOLD A", GREY);
  }

  draw(): void {
    const s = this.s;
    s.cls(NAVY);
    switch (this.scene) {
      case "boot": {
        this.sea();
        this.bigCenter(26, "TIDEPOOL", GOLD, 3);
        this.center(50, "KEEP THE PRICE IN YOUR NET", WHITE);
        CREATURES.forEach((c, i) => this.sprite(26 + i * 40, 70 + Math.round(Math.sin((this.t + i * 20) / 10) * 3), c.sx, 2, i === 2));
        if (this.t % 30 < 20) this.center(104, "PRESS A", WHITE);
        if (this.beat) this.center(116, `A FRIEND SCORED . BEAT IT!`, this.t % 30 < 20 ? GOLD : ORANGE);
        else if (this.best) this.center(116, `BEST `, GOLD);
        s.rect(0, SCREEN_H - 8, SCREEN_W, 8, SAND);
        break;
      }
      case "insert": {
        this.sea();
        this.bigCenter(26, "INSERT", GOLD, 2);
        this.bigCenter(42, "CARTRIDGE", GOLD, 2);
        const cy = 64 + Math.round(Math.abs(Math.sin(this.t / 12)) * 6);
        s.rect(64, cy, 32, 26, GREY);
        s.rect(68, cy + 4, 24, 12, NAVY);
        s.text(70, cy + 7, "SOL", GOLD);
        for (let i = 0; i < 6; i++) s.rect(66 + i * 5, cy + 22, 3, 4, GOLD);
        s.rect(56, 94, 48, 4, INK);
        this.center(106, "CONNECT YOUR WALLET", WHITE);
        this.center(116, "(SET IT TO DEVNET)", GREY);
        this.foot("A TRY AGAIN");
        break;
      }
      case "card": {
        this.sea();
        this.hud("SAVE CARD", this.signer ? shortId(this.signer.address) : "");
        s.rect(10, 15, 140, 52, INK);
        s.rectb(10, 15, 140, 52, GOLD);
        this.sprite(16, 28, CREATURES[this.pick]!.sx, 2);
        const food = Number(this.balance) / 1e9;
        s.text(50, 20, `BEST   `, GOLD);
        s.text(110, 20, `D`, this.streak > 1 ? ORANGE : GREY);
        s.text(50, 30, `SOL    $${this.live ? this.live.toFixed(2) : "--"}`, this.feedOk ? MINT : PINK);
        s.text(50, 40, `WALLET ${food.toFixed(2)} SOL`, WHITE);
        s.text(50, 50, `NET    ${this.disk ? "IN WATER" : "ON BOAT"}`, this.disk ? MINT : GREY);
        CARD_MENU.forEach((mi, i) => {
          const sel = i === this.menuIdx;
          const y = 76 + i * 12;
          if (sel) s.rect(28, y - 3, 104, 11, TEAL);
          s.text(36, y, mi === "REAL NET" && this.disk ? "MY REAL NET" : mi, sel ? WHITE : GREY);
          if (sel) s.tri(30, y - 1, 30, y + 5, 33, y + 2, GOLD);
        });
        this.foot("UP/DN CHOOSE   A OK");
        break;
      }
      case "pick": {
        this.sea();
        this.hud("PICK YOUR CREATURE", `${this.pick + 1}/3`);
        const c = CREATURES[this.pick]!;
        const blink = this.t % 30 < 15 ? GOLD : WHITE;
        s.tri(10, 44, 16, 38, 16, 50, blink);
        s.tri(150, 44, 144, 38, 144, 50, blink);
        this.sprite(56, 24 + Math.round(Math.sin(this.t / 10) * 2), c.sx, 4, this.pick === 2);
        this.bigCenter(62, c.name, GOLD, 2);
        this.center(78, c.blurb, WHITE);
        s.text(30, 92, "NET SIZE", GREY);
        this.bars(76, 93, Math.round(c.net / 5), MINT);
        s.text(30, 102, "POINTS", GREY);
        this.bars(76, 103, c.mult + (c.mult === 3 ? 2 : c.mult === 2 ? 1 : 0), GOLD);
        s.text(30, 112, "MAGNET", GREY);
        this.bars(76, 113, Math.round(c.magnet / 1.5), SKY);
        this.foot("< > CHANGE   A PLAY   B BACK");
        break;
      }
      case "round":
        this.drawRound();
        break;
      case "results": {
        this.sea();
        this.hud("WIPED OUT!", CREATURES[this.pick]!.name);
        s.rect(8, 14, 144, 108, INK);
        s.rectb(8, 14, 144, 108, this.newBest ? GOLD : TEAL);
        this.bigCenter(20, `${this.score}`, this.newBest ? GOLD : WHITE, 3);
        if (this.newBest && this.t % 20 < 14) this.center(42, "NEW BEST!", GOLD);
        else this.center(42, `BEST ${this.best}`, GREY);
        const secs = Math.round(this.roundF / FPS);
        const pct = this.roundF ? Math.round((this.insideF / this.roundF) * 100) : 0;
        s.text(16, 54, `SURVIVED ${secs}S`, WHITE);
        s.text(88, 54, `LEVEL ${this.level}`, WHITE);
        s.text(16, 63, `MAX COMBO ${this.maxCombo}`, MINT);
        s.text(88, 63, `PEARLS ${this.pearls}`, WHITE);
        s.text(16, 72, `PRICE IN NET ${pct}%`, pct >= 70 ? MINT : PINK);
        s.line(16, 82, 144, 82, PLUM);
        s.text(16, 87, "THAT WAS LIQUIDITY PROVIDING:", GREY);
        s.text(16, 95, "KEEP PRICE IN RANGE, EARN FEES.", GREY);
        s.text(16, 106, "> PUT A REAL NET HERE", this.t % 30 < 20 ? GOLD : ORANGE);
        this.foot("A AGAIN ^ SHARE > REAL NET B MENU");
        break;
      }
      case "map": {
        this.hud("WORLD MAP", `${this.pinIdx + 1}/${this.pins.length}`);
        const mx = 16, my = 14, mw = 138, mh = 78;
        s.rect(mx, my, mw, mh, INK);
        s.rect(mx, my, mw * 0.3, mh, PLUM);
        s.rect(mx + mw * 0.3, my, mw * 0.4, mh, BLUE);
        s.rect(mx + mw * 0.7, my, mw * 0.3, mh, TEAL);
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
        this.foot("REAL ORCA DEVNET POOLS  A GO");
        break;
      }
      case "range": {
        this.sea();
        const c = CREATURES[this.pick]!;
        const half = [0.03, 0.012, 0.004][this.pick]!;
        this.hud("YOUR REAL NET", this.pin?.label ?? "");
        this.sprite(20, 22, c.sx, 3, this.pick === 2);
        s.text(66, 24, c.name, GOLD);
        s.text(66, 34, `NET +-${(half * 100).toFixed(1)}%`, WHITE);
        s.text(66, 44, `SHIFT ${(this.offset * 100).toFixed(1)}%`, WHITE);
        s.rect(8, 60, 144, 50, INK);
        s.rectb(8, 60, 144, 50, TEAL);
        s.text(14, 65, "COSTS 0.2 TEST SOL. HALF IS", GREY);
        s.text(14, 73, "SWAPPED, THEN A REAL ORCA", GREY);
        s.text(14, 81, "POSITION OPENS IN YOUR WALLET.", GREY);
        s.text(14, 93, "WIDER NET = SAFER, SMALLER FEES", WHITE);
        s.text(14, 101, "TINY NET = MORE FEES, MORE RISK", WHITE);
        this.foot("<> CREATURE UP/DN SHIFT A CAST");
        break;
      }
      case "disk": {
        this.sea();
        this.hud("MY REAL NET", "DEVNET");
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
            [`COINS $${this.coins().toFixed(4)}`, GOLD],
            [`${this.food.sol.toFixed(6)} SOL ${this.food.usdc.toFixed(4)} USD`, GREY],
            [`POSITION ${shortId(d.mint)}`, GREY],
          ];
          rows.forEach(([l, col], i) => s.text(11, 19 + i * 10, l, col));
        }
        DISK_MENU.forEach((mi, i) => {
          const sel = i === this.menuIdx;
          const y = 96 + i * 10;
          if (sel) s.rect(28, y - 2, 104, 9, TEAL);
          s.text(36, y, mi, sel ? WHITE : GREY);
        });
        break;
      }
    }

    if (this.note && !this.busy && !this.error) this.box([...this.wrap(this.note), "", "A: OK"], GOLD);
    if (this.busy) this.box([this.busy + ".".repeat(1 + (Math.floor(this.t / 8) % 3)), "", "APPROVE IN YOUR WALLET"], WHITE);
    if (this.error) this.box(["UH OH", ...this.wrap(this.error), "", "A: OK"], PINK);
  }
}

const shortId = (a: string) => `${a.slice(0, 4)}..${a.slice(-4)}`;

/** Days-in-a-row streak, stored on this device. */
function readStreak(): { day: string; count: number } {
  try {
    const v = JSON.parse(localStorage.getItem("tidepool.streak") ?? "null") as { day: string; count: number } | null;
    if (!v) return { day: "", count: 0 };
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    return v.day === today || v.day === yesterday ? v : { day: "", count: 0 };
  } catch {
    return { day: "", count: 0 };
  }
}

function bumpStreak(): number {
  const today = new Date().toISOString().slice(0, 10);
  const cur = readStreak();
  const next = cur.day === today ? cur : { day: today, count: cur.count + 1 };
  try {
    localStorage.setItem("tidepool.streak", JSON.stringify(next));
  } catch {
    /* private mode */
  }
  return next.count;
}
