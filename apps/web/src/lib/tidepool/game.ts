import type { KeyPairSigner } from "@solana/kit";
import { BTN_A, BTN_B, BTN_DOWN, BTN_LEFT, BTN_RIGHT, BTN_UP, type Console, Image } from "@/lib/console";
import { insertCartridge, shortId } from "./cartridge";
import * as chain from "./chain";

/**
 * TIDEPOOL: a handheld game where the fish is the live SOL price and your net is a real
 * Orca liquidity position. Every button that changes something sends a real devnet transaction.
 * The main screens never use DeFi words; TRUE VIEW shows the real numbers.
 */

export const SCREEN_W = 160;
export const SCREEN_H = 144;
const HATCH_SOL = 0.2;
const POLL_FRAMES = 30 * 8;
// 0.25 SOL: enough to cast the net and pay fees
const FED = BigInt(250_000_000);

type Scene = "boot" | "food" | "net" | "tide" | "menu" | "true";

export interface GameEvents {
  onTx?: (label: string, signature: string) => void;
  onSlot?: (address: string) => void;
}

// colours (default palette indices)
const INK = 0, NAVY = 1, TEAL = 3, BLUE = 5, SKY = 6, WHITE = 7, PINK = 8, ORANGE = 9, GOLD = 10, MINT = 11, CORN = 12, GREY = 13, SAND = 15;

const MENU = ["COLLECT COINS", "RECAST THE NET", "TRUE VIEW", "PULL THE NET IN", "BACK"] as const;

export class Tidepool {
  private scene: Scene = "boot";
  private busy: string | null = null;
  private error: string | null = null;
  private note: string | null = null;
  private signer?: KeyPairSigner;
  private balance = BigInt(0);
  private pool?: chain.Pool;
  private creature?: chain.Creature;
  private food: chain.Food = { sol: 0, usdc: 0 };
  private polling = false;
  private fishY = 72;
  private netCenter = 0; // price
  private netHalf = 0.08; // fraction of price
  private menuIdx = 0;
  private t = 0;
  private readonly glyphs = new Image(160, 6);

  constructor(private readonly con: Console, private readonly events: GameEvents = {}) {
    const img = con.banks.images[0]!;
    img.load(0, 0, [
      "000aa000",
      "00aaaa00",
      "0aa7aaa9",
      "aaaaaa99",
      "0aaaaaa9",
      "00aaaa00",
      "000aa000",
      "00000000",
    ]);
    img.load(8, 0, [
      "000aa000",
      "00aaaa00",
      "0aa7aa99",
      "aaaaaa90",
      "0aaaaa99",
      "00aaaa00",
      "000aa000",
      "00000000",
    ]);
    const s = con.banks.sounds;
    s[0]!.set("c3 e3", "p", "4", "n", 2); // select
    s[1]!.set("g3 c4 e4 g4", "s", "5", "n n n f", 3); // coin / success
    s[2]!.set("c2 a1 f1", "n", "6", "f", 6); // splash
    s[3]!.set("c2 c1", "s", "6", "n f", 8); // error
    s[10]!.set("c1 g0 a0 e0 f0 c0 f0 g0", "t", "4", "n", 30);
    s[11]!.set("e3 r g3 r a3 g3 e3 r f3 r a3 r g3 f3 e3 r", "t", "2", "n", 15);
    con.banks.musics[0]!.set([], [], [10], [11]);
  }

  // ---- async chain actions --------------------------------------------------

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
      .finally(() => {
        this.busy = null;
      });
  }

  private tx(label: string, sig: string): void {
    this.events.onTx?.(label, sig);
  }

  private boot(): void {
    this.run("READING CARTRIDGE", async () => {
      const { signer } = await insertCartridge();
      this.signer = signer;
      this.events.onSlot?.(signer.address);
      this.balance = await chain.withRetry(() => chain.solBalance(signer.address));
      this.pool = await chain.withRetry(() => chain.pickPool());
      this.netCenter = this.pool.price;
      await this.loadCreature();
      if (this.creature) {
        this.scene = "tide";
        await this.poll();
      } else {
        this.scene = this.balance < FED ? "food" : "net";
      }
      this.con.playm(0, true);
    });
  }

  private async loadCreature(): Promise<void> {
    const list = await chain.creatures(this.signer!.address);
    this.creature = list.find((c) => c.liquidity > BigInt(0)) ?? list[0];
  }

  private async poll(): Promise<void> {
    if (!this.pool || !this.signer) return;
    this.pool = await chain.readPool(this.pool.address);
    if (this.creature) this.food = await chain.foodInBowl(this.signer, this.creature, this.pool.solIsA);
    this.balance = await chain.solBalance(this.signer.address);
  }

  private getFood(): void {
    this.run("FETCHING STARTER FOOD", async () => {
      const res = await fetch("/api/tidepool/food", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ to: this.signer!.address }),
      });
      const body = (await res.json()) as { signature?: string; error?: string };
      if (!res.ok || !body.signature) throw new Error(body.error ?? "no food today");
      this.tx("starter food", body.signature);
      for (let i = 0; i < 40 && this.balance < FED; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        this.balance = await chain.withRetry(() => chain.solBalance(this.signer!.address));
      }
      if (this.balance < FED) throw new Error("food is still on its way, try again");
      this.con.play(0, 1);
      this.scene = "net";
    });
  }

  private cast(): void {
    const pool = this.pool!;
    const low = this.netCenter * (1 - this.netHalf);
    const high = this.netCenter * (1 + this.netHalf);
    this.run("CASTING THE NET", async () => {
      if (this.balance < BigInt(Math.round((HATCH_SOL + 0.03) * 1e9))) throw new Error("not enough food to cast");
      const h = await chain.hatch(this.signer!, pool, HATCH_SOL, { low, high });
      this.tx("trade half for USDC", h.swapSig);
      this.tx("cast the net (open position)", h.openSig);
      this.con.play(0, 2);
      await this.loadCreature();
      await this.poll();
      this.scene = "tide";
      this.note = "SPLASH! THE NET IS IN THE WATER";
    });
  }

  private collect(): void {
    const c = this.creature;
    if (!c) return;
    this.run("COLLECTING COINS", async () => {
      const sig = await chain.eat(this.signer!, c);
      this.tx("collect coins (harvest fees)", sig);
      this.con.play(0, 1);
      await this.poll();
      this.note = "COINS COLLECTED";
    });
  }

  private pullIn(thenCast: boolean): void {
    const c = this.creature;
    if (!c) return;
    this.run("PULLING THE NET IN", async () => {
      const sig = await chain.release(this.signer!, c);
      this.tx("pull the net in (close position)", sig);
      this.creature = undefined;
      this.food = { sol: 0, usdc: 0 };
      await this.poll();
      this.netCenter = this.pool!.price;
      this.scene = thenCast ? "net" : this.balance < FED ? "food" : "net";
      this.note = "THE NET IS BACK ON THE BOAT";
    });
  }

  // ---- update -----------------------------------------------------------------

  update(): void {
    this.t++;
    const inp = this.con.input;
    const a = inp.btnp(BTN_A);
    const b = inp.btnp(BTN_B);

    if (this.error) {
      if (a || b) this.error = null;
      return;
    }
    if (this.busy) return;
    if (this.note && (a || b)) {
      this.note = null;
      return;
    }

    if (this.scene !== "boot" && this.t % POLL_FRAMES === 0 && !this.polling) {
      this.polling = true;
      this.poll()
        .catch(() => {})
        .finally(() => (this.polling = false));
    }

    switch (this.scene) {
      case "boot":
        if (a) {
          this.con.play(0, 0);
          this.boot();
        }
        break;
      case "food":
        if (a) this.getFood();
        break;
      case "net": {
        const p = this.pool!.price;
        const step = p * 0.004;
        if (inp.btnp(BTN_UP, 6, 2)) this.netCenter = Math.min(p * 1.3, this.netCenter + step);
        if (inp.btnp(BTN_DOWN, 6, 2)) this.netCenter = Math.max(p * 0.7, this.netCenter - step);
        if (inp.btnp(BTN_RIGHT, 6, 2)) this.netHalf = Math.min(0.3, +(this.netHalf + 0.01).toFixed(2));
        if (inp.btnp(BTN_LEFT, 6, 2)) this.netHalf = Math.max(0.02, +(this.netHalf - 0.01).toFixed(2));
        if (a) this.cast();
        if (b && this.creature) this.scene = "tide";
        break;
      }
      case "tide":
        if (a) this.collect();
        if (b) {
          this.menuIdx = 0;
          this.scene = "menu";
          this.con.play(0, 0);
        }
        break;
      case "menu":
        if (inp.btnp(BTN_UP)) this.menuIdx = (this.menuIdx + MENU.length - 1) % MENU.length;
        if (inp.btnp(BTN_DOWN)) this.menuIdx = (this.menuIdx + 1) % MENU.length;
        if (b) this.scene = "tide";
        if (a) {
          this.con.play(0, 0);
          const item = MENU[this.menuIdx];
          this.scene = "tide";
          if (item === "COLLECT COINS") this.collect();
          else if (item === "RECAST THE NET") this.pullIn(true);
          else if (item === "TRUE VIEW") this.scene = "true";
          else if (item === "PULL THE NET IN") this.pullIn(false);
        }
        break;
      case "true":
        if (a || b) this.scene = "tide";
        break;
    }
  }

  // ---- draw -------------------------------------------------------------------

  private get s() {
    return this.con.screen;
  }

  /** Text scaled up by `k`, for titles. */
  private big(x: number, y: number, str: string, col: number, k: number): void {
    const g = this.glyphs;
    g.cls(0);
    g.text(0, 0, str, 1);
    for (let j = 0; j < 6; j++)
      for (let i = 0; i < str.length * 4; i++) if (g.get(i, j)) this.s.rect(x + i * k, y + j * k, k, k, col);
  }

  private center(y: number, str: string, col: number, shadow = true): void {
    const x = Math.floor((SCREEN_W - str.length * 4) / 2);
    if (shadow) this.s.text(x + 1, y + 1, str, INK);
    this.s.text(x, y, str, col);
  }

  private water(): void {
    const s = this.s;
    const bands = [SKY, CORN, BLUE, NAVY];
    for (let i = 0; i < bands.length; i++) s.rect(0, 12 + i * 30, SCREEN_W, 30, bands[i]!);
    s.rect(0, 0, SCREEN_W, 12, SKY);
    for (let x = 0; x < SCREEN_W; x++) {
      const y = 11 + Math.round(Math.sin((x + this.t) / 6) * 1.5);
      s.pset(x, y, WHITE);
    }
    for (let i = 0; i < 10; i++) {
      const bx = (i * 37 + 11) % SCREEN_W;
      const by = SCREEN_H - 14 - ((this.t / 2 + i * 23) % 110);
      s.pset(bx + Math.round(Math.sin((this.t + i * 9) / 8)), by, SKY);
    }
    s.rect(0, SCREEN_H - 10, SCREEN_W, 10, SAND);
    for (let x = 3; x < SCREEN_W; x += 11) s.pset(x, SCREEN_H - 7 + (x % 3), ORANGE);
  }

  /** Map a price to a y inside the water, for a view window [lo, hi]. */
  private yOf(price: number, lo: number, hi: number): number {
    const top = 18;
    const bottom = SCREEN_H - 16;
    return Math.round(bottom - ((price - lo) / (hi - lo)) * (bottom - top));
  }

  private drawNet(y1: number, y2: number, caught: boolean): void {
    const s = this.s;
    const top = Math.min(y1, y2);
    const h = Math.abs(y2 - y1);
    const col = caught ? MINT : WHITE;
    for (let y = top; y <= top + h; y += 4) for (let x = 24; x < 136; x += 4) s.pset(x + ((y / 4) % 2) * 2, y, col);
    s.line(22, top, 138, top, col);
    s.line(22, top + h, 138, top + h, col);
    // floats on the rope
    for (let x = 30; x < 136; x += 20) s.circ(x, top, 1, ORANGE);
  }

  private drawFish(y: number, glow: boolean): void {
    const x = 70 + Math.round(Math.sin(this.t / 20) * 30);
    const flip = Math.cos(this.t / 20) < 0;
    const frame = Math.floor(this.t / 8) % 2;
    if (glow) this.s.circb(x + 4, y + 3, 7 + (this.t % 20 < 10 ? 1 : 0), GOLD);
    this.s.blt(x, y - 3, this.con.banks.images[0]!, frame * 8, 0, flip ? -8 : 8, 8, 0);
  }

  private hud(left: string, right: string): void {
    this.s.rect(0, 0, SCREEN_W, 9, INK);
    this.s.text(3, 2, left, WHITE);
    this.s.text(SCREEN_W - 3 - right.length * 4, 2, right, GOLD);
  }

  private box(lines: string[], col: number, fill = INK): void {
    const w = Math.min(SCREEN_W - 12, Math.max(...lines.map((l) => l.length)) * 4 + 12);
    const h = lines.length * 8 + 8;
    const x = Math.floor((SCREEN_W - w) / 2);
    const y = Math.floor((SCREEN_H - h) / 2);
    this.s.rect(x, y, w, h, fill);
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

  private coinsValue(): number {
    const price = this.pool?.price ?? 0;
    return this.food.usdc + this.food.sol * price;
  }

  draw(): void {
    const s = this.s;
    s.cls(NAVY);
    switch (this.scene) {
      case "boot": {
        this.water();
        this.big(33, 36, "TIDEPOOL", INK, 3);
        this.big(32, 35, "TIDEPOOL", GOLD, 3);
        this.center(62, "CATCH THE FISH. KEEP THE COINS.", WHITE);
        this.drawFish(84, false);
        if (this.t % 30 < 20) this.center(108, "PRESS A", WHITE);
        break;
      }
      case "food": {
        this.water();
        this.hud(this.signer ? shortId(this.signer.address) : "", "NO FOOD");
        this.box(["YOUR BOAT HAS NO FOOD", "TO CAST A NET.", "", "A: GET STARTER FOOD", "(FREE TEST FOOD)"], WHITE);
        break;
      }
      case "net": {
        this.water();
        const p = this.pool!.price;
        const lo = p * 0.66;
        const hi = p * 1.34;
        const nLo = this.netCenter * (1 - this.netHalf);
        const nHi = this.netCenter * (1 + this.netHalf);
        const y1 = this.yOf(nHi, lo, hi);
        const y2 = this.yOf(nLo, lo, hi);
        const caught = p >= nLo && p <= nHi;
        this.drawNet(y1, y2, caught);
        this.fishY += (this.yOf(p, lo, hi) - this.fishY) * 0.2;
        this.drawFish(Math.round(this.fishY), caught);
        this.hud("CAST YOUR NET", `SIZE ${Math.round(this.netHalf * 200)}`);
        const tip = this.netHalf >= 0.15 ? "BIG NET: CATCHES OFTEN, SMALL COINS" : this.netHalf <= 0.05 ? "TINY NET: BIG COINS, FISH SLIPS OUT" : "MEDIUM NET: A BIT OF BOTH";
        s.rect(0, SCREEN_H - 22, SCREEN_W, 22, INK);
        s.text(3, SCREEN_H - 20, tip, caught ? MINT : PINK);
        s.text(3, SCREEN_H - 12, caught ? "UP/DN MOVE <> SIZE  A CAST" : "FISH IS OUTSIDE! MOVE THE NET", caught ? GREY : PINK);
        break;
      }
      case "tide":
      case "menu":
      case "true": {
        this.water();
        const p = this.pool?.price ?? 0;
        const c = this.creature;
        if (c) {
          const span = Math.max(c.upperPrice - c.lowerPrice, p * 0.05);
          const lo = Math.min(c.lowerPrice, p) - span * 0.6;
          const hi = Math.max(c.upperPrice, p) + span * 0.6;
          const caught = p >= c.lowerPrice && p <= c.upperPrice;
          this.drawNet(this.yOf(c.upperPrice, lo, hi), this.yOf(c.lowerPrice, lo, hi), caught);
          this.fishY += (this.yOf(p, lo, hi) - this.fishY) * 0.15;
          this.drawFish(Math.round(this.fishY), caught);
          const coins = this.coinsValue();
          // one rising coin per tenth of a cent in the bowl, capped, so a fuller bowl looks fuller
          const n = Math.min(12, Math.floor(coins * 1000));
          for (let i = 0; i < n; i++) {
            const cy = SCREEN_H - 12 - ((this.t + i * 17) % 80);
            s.circ(30 + ((i * 29) % 100), cy, 1, GOLD);
          }
          this.hud(caught ? "FISH IN THE NET" : "FISH GOT AWAY", `COINS $${coins.toFixed(4)}`);
          s.rect(0, SCREEN_H - 12, SCREEN_W, 12, INK);
          s.text(3, SCREEN_H - 9, caught ? "A COLLECT  B MENU" : "B MENU: RECAST THE NET", caught ? GREY : PINK);
        } else {
          this.hud("NO NET IN THE WATER", "");
        }
        if (this.scene === "menu") {
          const w = 92;
          const x = SCREEN_W - w - 6;
          s.rect(x, 14, w, MENU.length * 9 + 8, INK);
          s.rectb(x, 14, w, MENU.length * 9 + 8, WHITE);
          MENU.forEach((m, i) => {
            const sel = i === this.menuIdx;
            if (sel) s.tri(x + 4, 19 + i * 9, x + 4, 23 + i * 9, x + 7, 21 + i * 9, GOLD);
            s.text(x + 10, 19 + i * 9, m, sel ? GOLD : WHITE);
          });
        }
        if (this.scene === "true" && c && this.pool) {
          const inRange = p >= c.lowerPrice && p <= c.upperPrice;
          s.rect(4, 12, SCREEN_W - 8, SCREEN_H - 20, INK);
          s.rectb(4, 12, SCREEN_W - 8, SCREEN_H - 20, TEAL);
          const lines: [string, number][] = [
            ["TRUE VIEW (ORCA, DEVNET)", TEAL],
            ["FISH = SOL PRICE", GREY],
            [`  ${p.toFixed(4)} USDC`, WHITE],
            ["NET = YOUR PRICE RANGE", GREY],
            [`  ${c.lowerPrice.toFixed(3)} - ${c.upperPrice.toFixed(3)}`, WHITE],
            [`IN RANGE: ${inRange ? "YES, EARNING FEES" : "NO, NOT EARNING"}`, inRange ? MINT : PINK],
            [`LIQUIDITY ${c.liquidity.toString()}`, WHITE],
            ["COINS = FEES OWED", GREY],
            [`  ${this.food.sol.toFixed(6)} SOL ${this.food.usdc.toFixed(4)} USDC`, WHITE],
            [`POOL FEE ${(this.pool.feeRate / 10000).toFixed(2)}%`, WHITE],
            [`NET ID ${shortId(c.mint)}`, WHITE],
            ["A/B BACK", GREY],
          ];
          lines.forEach(([l, col], i) => s.text(9, 17 + i * 9, l, col));
        }
        break;
      }
    }

    if (this.note && !this.busy && !this.error) this.box([...this.wrap(this.note), "", "A: OK"], GOLD);
    if (this.busy) {
      const dots = ".".repeat(1 + (Math.floor(this.t / 8) % 3));
      this.box([this.busy + dots, "", "SIGNING ON SOLANA"], WHITE);
    }
    if (this.error) this.box(["UH OH", ...this.wrap(this.error), "", "A: OK"], PINK);
  }
}
