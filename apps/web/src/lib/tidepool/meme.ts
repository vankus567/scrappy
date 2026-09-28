import { BTN_A, BTN_B, BTN_DOWN, BTN_LEFT, BTN_RIGHT, BTN_UP, type Input } from "@/lib/console";

/**
 * MEME DASH: meme-coin trading made as simple as two buttons.
 *   Pick a coin (big official logo, big UP/DOWN) -> watch live 1-minute candles -> A BUY, B SELL.
 *   Every buy gets an automatic SAFETY NET (sell at -8%) and TREASURE line (sell at +15%).
 * PRACTICE (default): live prices, practice money kept on this device, no transactions, clearly labelled.
 * REAL: Jupiter swaps on Solana mainnet, max $10, signed and sent by the player's own wallet.
 * Data: Jupiter (verified tokens, official logos, prices) and GeckoTerminal (1-minute candles).
 */

export const MEME_W = 640;
export const MEME_H = 576;
const SOL_MINT = "So11111111111111111111111111111111111111112";
const SYMBOLS = ["BONK", "WIF", "POPCAT", "MEW", "BOME", "PNUT"];
const STAKES = [1, 5, 10];
const STOP = -0.08;
const TAKE = 0.15;

interface Coin {
  mint: string;
  symbol: string;
  name: string;
  icon: HTMLImageElement | null;
  decimals: number;
  price: number;
  change24h: number;
  pool?: string;
}
interface Candle {
  o: number;
  h: number;
  l: number;
  c: number;
}
interface Position {
  coin: Coin;
  entry: number;
  usd: number;
  real: boolean;
  tokens: number; // raw token units for real mode
}

export interface MemeWallet {
  /** Mainnet: sign and send a Jupiter swap (base64 v0 transaction) with the player's wallet. Returns the signature. */
  send?: (swapTxBase64: string) => Promise<string>;
  address?: string;
  onTx?: (label: string, sig: string) => void;
}

type Scene = "loading" | "pick" | "chart" | "result";

const C = {
  bg: "#0d1b2a",
  panel: "#13263b",
  ink: "#f4f7fb",
  dim: "#8ea3b8",
  up: "#3ddc97",
  down: "#ff5a6e",
  gold: "#ffd166",
  practice: "#7cc7ff",
  real: "#ffb347",
};

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { cache: "no-store", ...init });
  if (!r.ok) throw new Error(`${new URL(url).host} ${r.status}`);
  return (await r.json()) as T;
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((res) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = src;
  });
}

const fmtPrice = (p: number) => (p >= 1 ? p.toFixed(3) : p >= 0.01 ? p.toFixed(4) : p.toPrecision(3));
const fmtUsd = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(n).toFixed(2)}`;

export class MemeDash {
  readonly canvas: HTMLCanvasElement;
  private readonly g: CanvasRenderingContext2D;
  active = false;
  private scene: Scene = "loading";
  private coins: Coin[] = [];
  private idx = 0;
  private candles: Candle[] = [];
  private stakeIdx = 0;
  private real = false;
  private pos: Position | null = null;
  private result: { text: string; pnl: number; pct: number; why: string } | null = null;
  private practice = 100;
  private busy: string | null = null;
  private error: string | null = null;
  private t = 0;
  private lastPoll = 0;
  private lastCandles = 0;
  private sol = 0; // SOL price in USD, for real-mode sizing

  constructor(private readonly input: Input, private wallet: MemeWallet, private readonly onExit: () => void) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = MEME_W;
    this.canvas.height = MEME_H;
    this.g = this.canvas.getContext("2d")!;
    try {
      this.practice = Number(localStorage.getItem("memedash.practice") ?? 100) || 100;
    } catch {
      /* private mode */
    }
  }

  setWallet(w: MemeWallet): void {
    this.wallet = w;
  }

  open(): void {
    this.active = true;
    this.error = null;
    if (this.coins.length === 0) void this.loadCoins();
    else this.scene = this.pos ? "chart" : "pick";
  }

  private savePractice(): void {
    try {
      localStorage.setItem("memedash.practice", this.practice.toFixed(2));
    } catch {
      /* private mode */
    }
  }

  private get coin(): Coin | undefined {
    return this.coins[this.idx];
  }

  // ---- data ------------------------------------------------------------------------

  private async loadCoins(): Promise<void> {
    this.scene = "loading";
    try {
      const found: Coin[] = [];
      for (const sym of SYMBOLS) {
        const list = await json<{ id: string; symbol: string; name: string; icon?: string; decimals: number; isVerified?: boolean; liquidity?: number }[]>(
          `https://lite-api.jup.ag/tokens/v2/search?query=${sym}`,
        );
        const best = list
          .filter((t) => t.symbol.toUpperCase() === sym && t.isVerified !== false)
          .sort((a, b) => (b.liquidity ?? 0) - (a.liquidity ?? 0))[0];
        if (!best) continue;
        found.push({ mint: best.id, symbol: sym, name: best.name, icon: best.icon ? await loadImage(best.icon) : null, decimals: best.decimals, price: 0, change24h: 0 });
      }
      if (found.length === 0) throw new Error("no coins found right now");
      this.coins = found;
      await this.pollPrices();
      this.scene = "pick";
    } catch (e) {
      this.error = (e as Error).message;
    }
  }

  private async pollPrices(): Promise<void> {
    const ids = [...this.coins.map((c) => c.mint), SOL_MINT].join(",");
    const p = await json<Record<string, { usdPrice: number; priceChange24h?: number }>>(`https://lite-api.jup.ag/price/v3?ids=${ids}`);
    for (const c of this.coins) {
      const q = p[c.mint];
      if (q) {
        c.price = q.usdPrice;
        c.change24h = q.priceChange24h ?? 0;
      }
    }
    this.sol = p[SOL_MINT]?.usdPrice ?? this.sol;
  }

  private async loadCandles(c: Coin): Promise<void> {
    if (!c.pool) {
      const pools = await json<{ data: { attributes: { address: string } }[] }>(`https://api.geckoterminal.com/api/v2/networks/solana/tokens/${c.mint}/pools?page=1`);
      c.pool = pools.data[0]?.attributes.address;
      if (!c.pool) throw new Error("no chart for this coin");
    }
    const r = await json<{ data: { attributes: { ohlcv_list: number[][] } } }>(
      `https://api.geckoterminal.com/api/v2/networks/solana/pools/${c.pool}/ohlcv/minute?aggregate=1&limit=48&token=${c.mint}`,
    );
    this.candles = r.data.attributes.ohlcv_list.map(([, o, h, l, cl]) => ({ o: o!, h: h!, l: l!, c: cl! })).reverse();
  }

  private live(c: Coin): number {
    return c.price || this.candles[this.candles.length - 1]?.c || 0;
  }

  // ---- trading -----------------------------------------------------------------------

  private run(label: string, fn: () => Promise<void>): void {
    if (this.busy) return;
    this.busy = label;
    this.error = null;
    fn()
      .catch((e: unknown) => (this.error = (e as Error).message ?? String(e)))
      .finally(() => (this.busy = null));
  }

  private async jupSwap(inputMint: string, outputMint: string, amount: bigint): Promise<string> {
    if (!this.wallet.send || !this.wallet.address) throw new Error("connect a wallet on mainnet for REAL mode");
    const quote = await json<Record<string, unknown>>(
      `https://lite-api.jup.ag/swap/v1/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=150`,
    );
    const swap = await json<{ swapTransaction: string }>("https://lite-api.jup.ag/swap/v1/swap", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ quoteResponse: quote, userPublicKey: this.wallet.address, dynamicComputeUnitLimit: true, prioritizationFeeLamports: "auto" }),
    });
    return this.wallet.send(swap.swapTransaction);
  }

  private buy(): void {
    const c = this.coin;
    if (!c || this.pos) return;
    const usd = STAKES[this.stakeIdx]!;
    const entry = this.live(c);
    if (!entry) return;
    if (!this.real) {
      if (this.practice < usd) {
        this.error = "out of practice money. hold A+B on the coin screen to refill";
        return;
      }
      this.practice -= usd;
      this.savePractice();
      this.pos = { coin: c, entry, usd, real: false, tokens: 0 };
      return;
    }
    this.run("BUYING WITH YOUR WALLET", async () => {
      if (!this.sol) await this.pollPrices();
      const lamports = BigInt(Math.floor((usd / this.sol) * 1e9));
      const sig = await this.jupSwap(SOL_MINT, c.mint, lamports);
      this.wallet.onTx?.(`buy ${c.symbol} ($${usd})`, sig);
      this.pos = { coin: c, entry, usd, real: true, tokens: Math.floor((usd / entry) * 10 ** c.decimals * 0.985) };
    });
  }

  private sell(why: string): void {
    const p = this.pos;
    if (!p) return;
    const now = this.live(p.coin);
    const pct = now / p.entry - 1;
    const pnl = p.usd * pct;
    const finish = () => {
      this.result = { text: pnl >= 0 ? "NICE CATCH!" : "OUCH!", pnl, pct, why };
      this.pos = null;
      this.scene = "result";
    };
    if (!p.real) {
      this.practice += p.usd + pnl;
      this.savePractice();
      finish();
      return;
    }
    this.run("SELLING WITH YOUR WALLET", async () => {
      const sig = await this.jupSwap(p.coin.mint, SOL_MINT, BigInt(p.tokens));
      this.wallet.onTx?.(`sell ${p.coin.symbol}`, sig);
      finish();
    });
  }

  // ---- loop --------------------------------------------------------------------------

  update(): void {
    this.t++;
    const inp = this.input;
    const a = inp.btnp(BTN_A);
    const b = inp.btnp(BTN_B);
    const up = inp.btnp(BTN_UP);
    const down = inp.btnp(BTN_DOWN);
    const left = inp.btnp(BTN_LEFT);
    const right = inp.btnp(BTN_RIGHT);

    const now = performance.now();
    if (this.scene !== "loading" && now - this.lastPoll > 4000) {
      this.lastPoll = now;
      void this.pollPrices().catch(() => {});
    }
    if (this.scene === "chart" && this.coin && now - this.lastCandles > 30000) {
      this.lastCandles = now;
      void this.loadCandles(this.coin).catch(() => {});
    }

    if (this.error) {
      if (a || b) {
        this.error = null;
        if (this.scene === "loading" && this.coins.length === 0) this.onExitNow();
      }
      return;
    }
    if (this.busy) return;

    // the safety net and the treasure line sell on their own: nobody has to watch the chart
    if (this.pos && !this.busy) {
      const pct = this.live(this.pos.coin) / this.pos.entry - 1;
      if (pct <= STOP) this.sell("SAFETY NET CAUGHT YOU");
      else if (pct >= TAKE) this.sell("TREASURE FOUND");
    }

    switch (this.scene) {
      case "pick":
        if (left) this.idx = (this.idx + this.coins.length - 1) % this.coins.length;
        if (right) this.idx = (this.idx + 1) % this.coins.length;
        if (up || down) this.real = !this.real;
        if (a && this.coin) {
          this.candles = [];
          this.lastCandles = performance.now();
          const c = this.coin;
          this.run("LOADING THE CHART", () => this.loadCandles(c));
          this.scene = "chart";
        }
        if (b) this.onExitNow();
        break;
      case "chart":
        if (!this.pos) {
          if (up) this.stakeIdx = Math.min(STAKES.length - 1, this.stakeIdx + 1);
          if (down) this.stakeIdx = Math.max(0, this.stakeIdx - 1);
          if (a) this.buy();
          if (b) this.scene = "pick";
        } else {
          if (b || a) this.sell("YOU SOLD");
        }
        break;
      case "result":
        if (a) this.scene = "chart";
        if (b) this.scene = "pick";
        break;
    }
    if (this.scene === "pick" && inp.btnp(BTN_A) === false && inp.btn(BTN_A) && inp.btn(BTN_B)) {
      this.practice = 100; // hold A+B on the coin screen to refill practice money
      this.savePractice();
    }
  }

  private onExitNow(): void {
    this.active = false;
    this.onExit();
  }

  // ---- draw --------------------------------------------------------------------------

  private text(s: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = "left", weight = 800): void {
    const g = this.g;
    g.font = `${weight} ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    g.textAlign = align;
    g.textBaseline = "middle";
    g.fillStyle = color;
    g.fillText(s, x, y);
  }

  private pill(x: number, y: number, w: number, h: number, fill: string): void {
    const g = this.g;
    g.fillStyle = fill;
    g.beginPath();
    g.roundRect(x, y, w, h, h / 2);
    g.fill();
  }

  private logo(c: Coin, cx: number, cy: number, r: number): void {
    const g = this.g;
    g.save();
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.closePath();
    g.fillStyle = "#223a55";
    g.fill();
    g.clip();
    if (c.icon) g.drawImage(c.icon, cx - r, cy - r, r * 2, r * 2);
    else this.text(c.symbol.slice(0, 1), cx, cy, r, C.ink, "center");
    g.restore();
  }

  /** A pixel-style face: happy when winning, sad when losing. Big, readable at a glance. */
  private face(cx: number, cy: number, r: number, mood: number): void {
    const g = this.g;
    g.fillStyle = mood >= 0 ? C.up : C.down;
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = C.bg;
    g.beginPath();
    g.arc(cx - r * 0.35, cy - r * 0.2, r * 0.12, 0, Math.PI * 2);
    g.arc(cx + r * 0.35, cy - r * 0.2, r * 0.12, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = C.bg;
    g.lineWidth = r * 0.12;
    g.lineCap = "round";
    g.beginPath();
    if (mood >= 0) g.arc(cx, cy + r * 0.05, r * 0.45, 0.15 * Math.PI, 0.85 * Math.PI);
    else g.arc(cx, cy + r * 0.6, r * 0.4, 1.2 * Math.PI, 1.8 * Math.PI);
    g.stroke();
  }

  private modeTag(): void {
    const label = this.real ? "REAL · MAINNET" : "PRACTICE MONEY";
    this.pill(MEME_W - 214, 16, 198, 36, this.real ? C.real : C.practice);
    this.text(label, MEME_W - 115, 34, 17, C.bg, "center");
  }

  private chart(x: number, y: number, w: number, h: number): (p: number) => number {
    const g = this.g;
    const cs = this.candles;
    const pos = this.pos;
    const live = this.coin ? this.live(this.coin) : 0;
    const vals = cs.flatMap((c) => [c.h, c.l]);
    if (live) vals.push(live);
    if (pos) vals.push(pos.entry * (1 + STOP), pos.entry * (1 + TAKE));
    let lo = Math.min(...vals);
    let hi = Math.max(...vals);
    const pad = (hi - lo) * 0.08 || live * 0.01;
    lo -= pad;
    hi += pad;
    const py = (p: number) => y + h - ((p - lo) / (hi - lo)) * h;
    g.fillStyle = C.panel;
    g.beginPath();
    g.roundRect(x, y - 8, w, h + 16, 18);
    g.fill();
    const cw = (w - 80) / Math.max(cs.length, 1);
    cs.forEach((c, i) => {
      const cx = x + 12 + i * cw + cw / 2;
      const upc = c.c >= c.o;
      g.strokeStyle = g.fillStyle = upc ? C.up : C.down;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(cx, py(c.h));
      g.lineTo(cx, py(c.l));
      g.stroke();
      const top = py(Math.max(c.o, c.c));
      g.fillRect(cx - cw * 0.34, top, cw * 0.68, Math.max(2, py(Math.min(c.o, c.c)) - top));
    });
    const line = (p: number, color: string, label: string) => {
      const yy = py(p);
      g.strokeStyle = color;
      g.lineWidth = 3;
      g.setLineDash([10, 8]);
      g.beginPath();
      g.moveTo(x + 8, yy);
      g.lineTo(x + w - 76, yy);
      g.stroke();
      g.setLineDash([]);
      this.pill(x + w - 74, yy - 14, 70, 28, color);
      this.text(label, x + w - 39, yy, 14, C.bg, "center");
    };
    if (pos) {
      line(pos.entry * (1 + TAKE), C.up, "TREASURE");
      line(pos.entry * (1 + STOP), C.down, "SAFETY");
      line(pos.entry, C.gold, "YOU BUY");
    }
    if (live) {
      const yy = py(live);
      g.fillStyle = C.ink;
      g.beginPath();
      g.arc(x + w - 84, yy, 7 + (this.t % 30 < 15 ? 2 : 0), 0, Math.PI * 2);
      g.fill();
    }
    return py;
  }

  draw(): void {
    const g = this.g;
    g.fillStyle = C.bg;
    g.fillRect(0, 0, MEME_W, MEME_H);
    this.text("MEME DASH", 24, 34, 26, C.gold);
    this.modeTag();

    if (this.scene === "loading") {
      this.text("Finding the coins...", MEME_W / 2, MEME_H / 2, 30, C.ink, "center");
    }

    const c = this.coin;
    if (this.scene === "pick" && c) {
      const bob = Math.sin(this.t / 10) * 6;
      this.logo(c, MEME_W / 2, 190 + bob, 96);
      this.text("‹", 70, 190, 90, C.dim, "center", 400);
      this.text("›", MEME_W - 70, 190, 90, C.dim, "center", 400);
      this.text(`$${c.symbol}`, MEME_W / 2, 322, 46, C.ink, "center");
      const upc = c.change24h >= 0;
      this.pill(MEME_W / 2 - 150, 352, 300, 56, upc ? C.up : C.down);
      this.text(`${upc ? "▲ UP" : "▼ DOWN"} ${Math.abs(c.change24h).toFixed(1)}% TODAY`, MEME_W / 2, 380, 24, C.bg, "center");
      this.text(`$${fmtPrice(c.price)}`, MEME_W / 2, 440, 26, C.dim, "center", 600);
      this.text(this.real ? "Real trades from your wallet, max $10" : `Practice money: ${fmtUsd(this.practice)}`, MEME_W / 2, 482, 20, this.real ? C.real : C.practice, "center", 600);
      this.text("◀ ▶ coins   ▲▼ practice/real   A pick   B back", MEME_W / 2, 540, 18, C.dim, "center", 600);
    }

    if ((this.scene === "chart" || this.scene === "result") && c) {
      this.logo(c, 44, 96, 26);
      this.text(`$${c.symbol}`, 82, 88, 26, C.ink);
      const live = this.live(c);
      this.text(`$${fmtPrice(live)}`, 82, 114, 18, C.dim, "left", 600);
      this.chart(20, 142, MEME_W - 40, 250);
      const pos = this.pos;
      if (pos) {
        const pct = live / pos.entry - 1;
        const pnl = pos.usd * pct;
        this.face(84, 468, 42, pnl);
        this.text(`${pnl >= 0 ? "+" : ""}${fmtUsd(pnl)}`, 146, 452, 40, pnl >= 0 ? C.up : C.down);
        this.text(`${pct >= 0 ? "+" : ""}${(pct * 100).toFixed(1)}% on your ${fmtUsd(pos.usd)}`, 146, 490, 20, C.dim, "left", 600);
        this.pill(MEME_W - 250, 432, 230, 72, C.down);
        this.text("A / B  SELL", MEME_W - 135, 468, 28, C.ink, "center");
        this.text("Safety net sells at -8%. Treasure sells at +15%.", MEME_W / 2, 546, 17, C.dim, "center", 600);
      } else if (this.scene === "chart") {
        this.text("How much?", 24, 432, 20, C.dim, "left", 600);
        STAKES.forEach((s, i) => {
          const sel = i === this.stakeIdx;
          this.pill(24 + i * 92, 450, 82, 48, sel ? C.gold : C.panel);
          this.text(`$${s}`, 65 + i * 92, 474, 24, sel ? C.bg : C.ink, "center");
        });
        this.pill(MEME_W - 270, 436, 250, 76, C.up);
        this.text("A  BUY", MEME_W - 145, 474, 34, C.bg, "center");
        this.text("▲▼ amount   A buy   B coins", MEME_W / 2, 546, 17, C.dim, "center", 600);
      }
    }

    if (this.scene === "result" && this.result) {
      const r = this.result;
      g.fillStyle = "rgba(9,18,28,0.88)";
      g.fillRect(0, 0, MEME_W, MEME_H);
      this.face(MEME_W / 2, 170, 70, r.pnl);
      this.text(r.why, MEME_W / 2, 280, 26, C.dim, "center", 700);
      this.text(r.text, MEME_W / 2, 330, 48, C.ink, "center");
      this.text(`${r.pnl >= 0 ? "+" : ""}${fmtUsd(r.pnl)}  (${r.pct >= 0 ? "+" : ""}${(r.pct * 100).toFixed(1)}%)`, MEME_W / 2, 392, 36, r.pnl >= 0 ? C.up : C.down, "center");
      this.text("A trade again   B pick a coin", MEME_W / 2, 480, 20, C.dim, "center", 600);
    }

    if (this.busy) {
      g.fillStyle = "rgba(9,18,28,0.85)";
      g.fillRect(0, 0, MEME_W, MEME_H);
      this.text(this.busy + ".".repeat(1 + (Math.floor(this.t / 10) % 3)), MEME_W / 2, MEME_H / 2 - 16, 28, C.ink, "center");
      if (this.busy.includes("WALLET")) this.text("Approve it in your wallet", MEME_W / 2, MEME_H / 2 + 26, 20, C.dim, "center", 600);
    }
    if (this.error) {
      g.fillStyle = "rgba(9,18,28,0.92)";
      g.fillRect(0, 0, MEME_W, MEME_H);
      this.text("Uh oh", MEME_W / 2, MEME_H / 2 - 50, 36, C.down, "center");
      this.text(this.error.slice(0, 60), MEME_W / 2, MEME_H / 2, 20, C.ink, "center", 600);
      this.text("A: OK", MEME_W / 2, MEME_H / 2 + 50, 20, C.dim, "center", 600);
    }
  }
}
