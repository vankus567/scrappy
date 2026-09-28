import { BTN_A, BTN_B, BTN_DOWN, BTN_LEFT, BTN_RIGHT, BTN_UP, BTN_X, type Input } from "@/lib/console";

/**
 * MEME DASH: meme-coin trading made as simple as two buttons.
 *   Pick a coin (big official logo, big UP/DOWN) -> watch live 1-minute candles -> A BUY, B SELL.
 *   Every buy gets an automatic SAFETY NET (sell at -8%) and TREASURE line (sell at +15%).
 * Every button press is a real Jupiter swap on Solana mainnet, signed on-device by the play key
 * (this device's session wallet). The player's real wallet only shows up to load the coin slot.
 * There is no practice money and nothing is simulated.
 * Data: Jupiter (verified tokens, official logos, prices) and GeckoTerminal (1-minute candles).
 */

export const MEME_W = 640;
export const MEME_H = 576;
const SOL_MINT = "So11111111111111111111111111111111111111112";
const SKR_MINT = "SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3";
const DEV_USDC_MINT = "BRjpCHtyQLNCo8gqRUr8jtdAj5AjPYQaoqbvcZiHok1k";
/** Everything Jupiter says is hot today, minus money that isn't a meme. */
const EXCLUDE = new Set(["SOL", "WSOL", "USDC", "USDT", "USD1", "PYUSD", "CBBTC", "WBTC", "ZEC", "PAXG", "JITOSOL", "JUP", "MSOL", "BSOL", "EURC", "LST"]);
const MAX_COINS = 30;
/** Coin sizes a player can pick with UP/DN. SKR pays in the Seeker token.
    Above $10 (or SKR) asks for one extra A. */
const STAKES: { usd?: number; skr?: number }[] = [{ usd: 1 }, { usd: 5 }, { usd: 10 }, { usd: 25 }, { usd: 50 }, { skr: 100 }];
const SKR_DECIMALS = 6;
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
  tokens: bigint; // raw token units the buy was quoted to deliver
}

export interface MemeWallet {
  /** Mainnet: sign and send a Jupiter swap (base64 v0 transaction) with the play key. Returns the signature. */
  send?: (swapTxBase64: string) => Promise<string>;
  /** Mainnet: the play key's real balance of a token in raw units, so a sell swaps all of it. */
  tokenBalance?: (mint: string) => Promise<bigint>;
  /** Mainnet: the play key's real SOL balance in lamports. */
  solBalance?: () => Promise<bigint>;
  /** The one wallet popup in the game: move lamports of SOL from the real wallet into the coin slot. */
  topUp?: (lamports: bigint) => Promise<string>;
  /** The play key sends everything back to the real wallet. No popup. */
  sweep?: () => Promise<string>;
  /** Ask the player to connect a wallet so the coin slot can be loaded. */
  connect?: () => void;
  /** Devnet mode: swaps route through the Orca devnet SOL/devUSDC pool instead of Jupiter. */
  devnet?: boolean;
  /** Devnet swap: input mint + raw amount -> signature + tokens out. */
  devSwap?: (inputMint: string, inputAmount: bigint) => Promise<{ sig: string; out: bigint }>;
  address?: string;
  onTx?: (label: string, sig: string) => void;
}

type Scene = "loading" | "pick" | "chart" | "result";

/** Daylight palette: lavender screen, white panels, ink text, purple accent. */
const C = {
  bg: "#f4f1ff",
  panel: "#ffffff",
  ink: "#0e091c",
  dim: "#4a35c4",
  up: "#1e7a34",
  down: "#c41a1a",
  gold: "#d4a017",
  real: "#6e54ff",
  edge: "#0e091c",
};

/** The console's own typefaces, resolved from the CSS vars once the page loads. */
const FONTS = { title: "", body: "" };
export function fontFam(kind: "title" | "body"): string {
  if (!FONTS.body && typeof document !== "undefined") {
    const cs = getComputedStyle(document.documentElement);
    FONTS.title = cs.getPropertyValue("--font-pressstart").trim() || '"Press Start 2P", monospace';
    FONTS.body = cs.getPropertyValue("--font-switzer").trim() || "system-ui, sans-serif";
  }
  return kind === "title" ? FONTS.title || "monospace" : FONTS.body || "system-ui, sans-serif";
}

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

export const fmtPrice = (p: number) => (p >= 1 ? p.toFixed(3) : p >= 0.01 ? p.toFixed(4) : p.toPrecision(3));
export const fmtUsd = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(n).toFixed(2)}`;

/** USD stake -> lamports to spend, from the live SOL price. 0 when the feed is down. */
export const lamportsForUsd = (usd: number, solUsd: number): bigint =>
  solUsd > 0 ? BigInt(Math.floor((usd / solUsd) * 1e9)) : BigInt(0);

/** Where an open trade resolves on its own: the safety net below, the treasure line above. */
export const autoSellAt = (pct: number): string | null => (pct <= STOP ? "SAFETY NET CAUGHT YOU" : pct >= TAKE ? "TREASURE FOUND" : null);

export class MemeDash {
  readonly canvas: HTMLCanvasElement;
  private readonly g: CanvasRenderingContext2D;
  active = false;
  private scene: Scene = "loading";
  private coins: Coin[] = [];
  private idx = 0;
  private candles: Candle[] = [];
  private stakeIdx = 0;
  private confirmBig = false;
  private pos: Position | null = null;
  private result: { text: string; pnl: number; pct: number; why: string } | null = null;
  private busy: string | null = null;
  private error: string | null = null;
  private t = 0;
  private lastPoll = 0;
  private lastCandles = 0;
  private sol = 0; // SOL price in USD, for real-mode sizing
  private coinBal: bigint | null = null; // play key SOL balance, refreshed with the price poll
  private lastBal = 0;
  private devnet = false;

  constructor(private readonly input: Input, private wallet: MemeWallet, private readonly onExit: () => void) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = MEME_W;
    this.canvas.height = MEME_H;
    this.g = this.canvas.getContext("2d")!;
  }

  setWallet(w: MemeWallet): void {
    this.wallet = w;
    if (w.devnet !== undefined && w.devnet !== this.devnet) {
      this.devnet = w.devnet;
      this.coins = []; // roster differs per network: reload
      this.idx = 0;
      this.pos = null;
    } else if (w.devnet !== undefined) this.devnet = w.devnet;
  }

  open(): void {
    this.active = true;
    this.error = null;
    this.devnet = !!this.wallet.devnet;
    if (this.coins.length === 0) void this.loadCoins();
    else this.scene = this.pos ? "chart" : "pick";
  }

  private get coin(): Coin | undefined {
    return this.coins[this.idx];
  }

  /** SKR stakes are mainnet-only; devnet shows the dollar sizes. */
  private get stakes() {
    return this.devnet ? STAKES.slice(0, -1) : STAKES;
  }

  // ---- data ------------------------------------------------------------------------

  private async loadCoins(): Promise<void> {
    this.scene = "loading";
    if (this.devnet) {
      // Devnet is one honest coin: devUSDC on the Orca devnet pool.
      this.coins = [{ mint: DEV_USDC_MINT, symbol: "USDC", name: "devnet dollar", icon: null, decimals: 6, price: 1, change24h: 0 }];
      this.scene = "pick";
      this.idx = 0;
      return;
    }
    try {
      type Tok = { id: string; symbol: string; name: string; icon?: string; decimals: number; isVerified?: boolean; liquidity?: number; organicScoreLabel?: string };
      // Two live feeds: Jupiter's most-traded today + GeckoTerminal's trending
      // Solana pools (the degen FOMO). No hand-picked list.
      const [hot, trend] = await Promise.all([
        json<Tok[]>("https://lite-api.jup.ag/tokens/v2/toptraded/24h"),
        json<{ data?: { relationships?: { base_token?: { data?: { id?: string } } } }[] }>(
          "https://api.geckoterminal.com/api/v2/networks/solana/trending_pools?page=1",
          { headers: { Accept: "application/json" } },
        ).catch(() => null),
      ]);
      const trendMints = (trend?.data ?? [])
        .map((p) => p.relationships?.base_token?.data?.id ?? "")
        .filter((id) => id.startsWith("solana_"))
        .map((id) => id.slice(7))
        .slice(0, 14);
      const trendToks = (
        await Promise.all(
          trendMints.map(async (mint) => {
            try {
              const l = await json<Tok[]>(`https://lite-api.jup.ag/tokens/v2/search?query=${mint}`);
              return l.find((t) => t.id === mint);
            } catch {
              return undefined;
            }
          }),
        )
      ).filter((t): t is Tok => !!t);
      const seen = new Set<string>();
      const found: Coin[] = [];
      const skr = hot.find((t) => t.id === SKR_MINT);
      const ordered = [
        skr ?? { id: SKR_MINT, symbol: "SKR", name: "Seeker", decimals: 6, isVerified: true, liquidity: 1e9 } as Tok,
        ...hot,
        ...trendToks,
      ];
      for (const t of ordered) {
        if (found.length >= MAX_COINS) break;
        const sym = t.symbol.toUpperCase();
        if (seen.has(t.id) || seen.has(sym) || EXCLUDE.has(sym) || /^(nvda|tsla|aapl|spy|qqq|mstr|crcl|coin|amzn|meta|googl|nflx|hood|pltr|amd|orcl|avgo|arm|intc|msft|dxyz|gme|voo)x$/i.test(sym)) continue;
        if (t.isVerified === false || (t.liquidity ?? 0) < 25000) continue;
        seen.add(sym);
        seen.add(t.id);
        found.push({ mint: t.id, symbol: sym, name: t.name, icon: t.icon ? await loadImage(`/api/icon?u=${encodeURIComponent(t.icon)}`) : null, decimals: t.decimals, price: 0, change24h: 0 });
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
    // A wallet prompt that never resolves must not hang the screen forever.
    const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new Error("taking too long - check your wallet and try again")), 90_000));
    Promise.race([fn(), timeout])
      .catch((e: unknown) => (this.error = (e as Error).message ?? String(e)))
      .finally(() => (this.busy = null));
  }

  /** One real Jupiter swap on mainnet. Returns the signature and the quoted output in raw units. */
  private async jupSwap(inputMint: string, outputMint: string, amount: bigint): Promise<{ sig: string; out: bigint }> {
    if (!this.wallet.send || !this.wallet.address) throw new Error("no play key on this device");
    const quote = await json<Record<string, unknown>>(
      `https://lite-api.jup.ag/swap/v1/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=150`,
    );
    const swap = await json<{ swapTransaction: string }>("https://lite-api.jup.ag/swap/v1/swap", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ quoteResponse: quote, userPublicKey: this.wallet.address, dynamicComputeUnitLimit: true, prioritizationFeeLamports: "auto" }),
    });
    const sig = await this.wallet.send(swap.swapTransaction);
    return { sig, out: BigInt((quote.outAmount as string | undefined) ?? 0) };
  }

  private buy(): void {
    const c = this.coin;
    if (!c || this.pos) return;
    const stake = this.stakes[this.stakeIdx]!;
    const entry = this.live(c);
    if (!entry) return;
    this.run("BUYING", async () => {
      if (!this.sol) await this.pollPrices();
      const payingSkr = !!stake.skr;
      const lamports = payingSkr ? BigInt(0) : lamportsForUsd(stake.usd!, this.sol);
      const need = payingSkr ? BigInt(3_000_000) : lamports + BigInt(2_000_000); // SKR buys still need fee SOL
      let bal = this.wallet.solBalance ? await this.wallet.solBalance() : null;
      if (bal !== null && bal < need) {
        // Empty coin slot: the real wallet signs one top-up, the swap itself signs silently.
        if (!this.wallet.topUp) {
          this.wallet.connect?.();
          throw new Error("empty coin slot - pick a wallet to load a coin");
        }
        this.busy = "INSERTING COIN";
        const sig = await this.wallet.topUp(need + BigInt(2_000_000));
        this.wallet.onTx?.("insert coin", sig);
        this.busy = "BUYING";
        bal = await this.wallet.solBalance!();
        if (bal === null || bal < need) throw new Error("the coin has not landed yet - press A again in a few seconds");
      }
      if (this.devnet) {
        if (!this.wallet.devSwap) throw new Error("devnet swaps are not wired on this build");
        const { sig, out } = await this.wallet.devSwap(SOL_MINT, lamports);
        this.wallet.onTx?.(`buy USDC ($${stake.usd} devnet)`, sig);
        this.pos = { coin: c, entry, usd: stake.usd!, tokens: out };
        this.coinBal = null;
        return;
      }
      if (payingSkr) {
        const amount = BigInt(stake.skr!) * BigInt(10 ** SKR_DECIMALS);
        const held = this.wallet.tokenBalance ? await this.wallet.tokenBalance(SKR_MINT) : BigInt(0);
        if (held < amount) throw new Error(`need ${stake.skr} SKR in the play key - top up SKR first`);
        const { sig, out } = await this.jupSwap(SKR_MINT, c.mint, amount);
        this.wallet.onTx?.(`buy ${c.symbol} (${stake.skr} SKR)`, sig);
        const skrUsd = this.coins.find((x) => x.mint === SKR_MINT)?.price ?? 0;
        this.pos = { coin: c, entry, usd: stake.skr! * skrUsd || 1, tokens: out };
      } else {
        const { sig, out } = await this.jupSwap(SOL_MINT, c.mint, lamports);
        this.wallet.onTx?.(`buy ${c.symbol} ($${stake.usd})`, sig);
        this.pos = { coin: c, entry, usd: stake.usd!, tokens: out };
      }
      this.coinBal = null;
    });
  }

  /** Everything in the coin slot goes back to the player's wallet. The play key signs it itself. */
  private cashOut(): void {
    this.run("CASHING OUT", async () => {
      if (!this.wallet.sweep) {
        this.wallet.connect?.();
        throw new Error("connect a wallet to cash out to");
      }
      const sig = await this.wallet.sweep();
      this.wallet.onTx?.("cash out", sig);
      this.coinBal = BigInt(0);
    });
  }

  private sell(why: string): void {
    const p = this.pos;
    if (!p) return;
    this.run("SELLING", async () => {
      // Sell the balance the wallet actually holds, not the quote estimate.
      const held = this.wallet.tokenBalance ? await this.wallet.tokenBalance(p.coin.mint) : p.tokens;
      if (held <= BigInt(0)) throw new Error(`no ${p.coin.symbol} in the coin purse yet - wait a few seconds and press A again`);
      const before = this.wallet.solBalance ? await this.wallet.solBalance() : null;
      const { sig } = this.devnet
        ? await this.wallet.devSwap!(DEV_USDC_MINT, held)
        : await this.jupSwap(p.coin.mint, SOL_MINT, held);
      this.wallet.onTx?.(`sell ${p.coin.symbol}`, sig);
      // The result is the SOL that really landed (minus fees), priced in USD - not an estimate.
      let usdOut: number | null = null;
      if (before !== null && this.wallet.solBalance && this.sol) {
        for (let i = 0; i < 12; i++) {
          await new Promise((r) => setTimeout(r, 1500));
          const after = await this.wallet.solBalance();
          if (after !== before) {
            usdOut = (Number(after - before) / 1e9) * this.sol;
            break;
          }
        }
      }
      const usd = usdOut ?? p.usd * (this.live(p.coin) / p.entry); // live-price estimate if the read lags
      const pnl = usd - p.usd;
      this.result = { text: pnl >= 0 ? "NICE CATCH!" : "OUCH!", pnl, pct: usd / p.usd - 1, why };
      this.pos = null;
      this.scene = "result";
      this.coinBal = null;
    });
  }

  // ---- loop --------------------------------------------------------------------------

  update(): void {
    this.t++;
    const inp = this.input;
    const a = inp.btnp(BTN_A);
    const b = inp.btnp(BTN_B);
    const x = inp.btnp(BTN_X);
    const up = inp.btnp(BTN_UP);
    const down = inp.btnp(BTN_DOWN);
    const left = inp.btnp(BTN_LEFT);
    const right = inp.btnp(BTN_RIGHT);

    const now = performance.now();
    if (this.scene !== "loading" && now - this.lastPoll > 4000) {
      this.lastPoll = now;
      void this.pollPrices().catch(() => {});
    }
    if (this.scene !== "loading" && now - this.lastBal > 5000) {
      this.lastBal = now;
      void this.wallet.solBalance?.()
        .then((v) => (this.coinBal = v))
        .catch(() => {});
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
      const reason = autoSellAt(this.live(this.pos.coin) / this.pos.entry - 1);
      if (reason) this.sell(reason);
    }

    switch (this.scene) {
      case "pick":
        if (left || up) this.idx = (this.idx + this.coins.length - 1) % this.coins.length;
        if (right || down) this.idx = (this.idx + 1) % this.coins.length;
        if (x) this.cashOut();
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
          if (up) {
            this.stakeIdx = Math.min(this.stakes.length - 1, this.stakeIdx + 1);
            this.confirmBig = false;
          }
          if (down) {
            this.stakeIdx = Math.max(0, this.stakeIdx - 1);
            this.confirmBig = false;
          }
          if (a) {
            const stake = this.stakes[this.stakeIdx]!;
            const big = (stake.usd ?? 0) > 10 || !!stake.skr;
            if (big && !this.confirmBig) this.confirmBig = true;
            else {
              this.confirmBig = false;
              this.buy();
            }
          }
          if (b) {
            this.confirmBig = false;
            this.scene = "pick";
          }
        } else {
          if (b || a) this.sell("YOU SOLD");
        }
        break;
      case "result":
        if (a) this.scene = "chart";
        if (b) this.scene = "pick";
        break;
    }
  }

  private onExitNow(): void {
    this.active = false;
    this.onExit();
  }

  // ---- draw --------------------------------------------------------------------------

  private text(s: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = "left", weight = 800, kind: "title" | "body" = "body"): void {
    const g = this.g;
    g.font = kind === "title" ? `${size}px ${fontFam("title")}` : `${weight} ${size}px ${fontFam("body")}`;
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
    g.fillStyle = "#ddd7fe";
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
    this.pill(MEME_W - 230, 13, 216, 44, this.devnet ? C.down : C.real);
    this.text(this.devnet ? "DEVNET" : "MAINNET", MEME_W - 122, 35, 21, C.bg, "center");
  }

  /** Error text broken into short readable lines instead of one long clipped line. */
  private wrapError(msg: string): void {
    const words = msg.split(" ");
    const lines: string[] = [];
    let line = "";
    for (const w of words) {
      if ((line + " " + w).trim().length > 30) {
        if (line) lines.push(line.trim());
        line = w;
      } else line += " " + w;
    }
    if (line.trim()) lines.push(line.trim());
    lines.slice(0, 3).forEach((l, i) => this.text(l, MEME_W / 2, MEME_H / 2 - 14 + i * 30, 22, C.ink, "center", 600));
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
    // price scale on the right: four gridlines with real prices
    g.font = `24px ${fontFam("body")}`;
    g.textAlign = "right";
    g.textBaseline = "middle";
    for (let i = 0; i <= 4; i++) {
      const p = lo + ((hi - lo) * i) / 4;
      const yy = py(p);
      g.strokeStyle = "rgba(74,53,196,0.18)";
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x + 8, yy);
      g.lineTo(x + w - 112, yy);
      g.stroke();
      g.fillStyle = C.dim;
      g.fillText(fmtPrice(p), x + w - 8, yy);
    }
    // Colour wash under the close line so the chart reads as a sea, not a grid.
    if (cs.length > 1) {
      const grad = g.createLinearGradient(0, y, 0, y + h);
      grad.addColorStop(0, "rgba(110,84,255,0.35)");
      grad.addColorStop(0.7, "rgba(255,140,180,0.12)");
      grad.addColorStop(1, "rgba(255,140,180,0)");
      g.beginPath();
      g.moveTo(x + 12, py(cs[0]!.c));
      cs.forEach((c, i) => g.lineTo(x + 12 + i * ((w - 120) / Math.max(cs.length - 1, 1)), py(c.c)));
      g.lineTo(x + w - 108, y + h);
      g.lineTo(x + 12, y + h);
      g.closePath();
      g.fillStyle = grad;
      g.fill();
    }
    const cw = (w - 120) / Math.max(cs.length, 1);
    cs.forEach((c, i) => {
      const cx = x + 12 + i * cw + cw / 2;
      const upc = c.c >= c.o;
      const col = upc ? "#23a04a" : "#e0344b";
      g.strokeStyle = g.fillStyle = col;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(cx, py(c.h));
      g.lineTo(cx, py(c.l));
      g.stroke();
      const top = py(Math.max(c.o, c.c));
      const bodyH = Math.max(2, py(Math.min(c.o, c.c)) - top);
      g.globalAlpha = 0.25;
      g.fillRect(cx - cw * 0.46, top, cw * 0.92, bodyH);
      g.globalAlpha = 1;
      g.fillRect(cx - cw * 0.34, top, cw * 0.68, bodyH);
    });
    const line = (p: number, color: string, label: string) => {
      const yy = py(p);
      g.strokeStyle = color;
      g.lineWidth = 3;
      g.setLineDash([10, 8]);
      g.beginPath();
      g.moveTo(x + 8, yy);
      g.lineTo(x + w - 108, yy);
      g.stroke();
      g.setLineDash([]);
      this.pill(x + w - 104, yy - 17, 96, 34, color);
      this.text(label, x + w - 56, yy, 17, C.bg, "center");
    };
    if (pos) {
      line(pos.entry * (1 + TAKE), C.up, "TREASURE");
      line(pos.entry * (1 + STOP), C.down, "SAFETY");
      line(pos.entry, C.gold, "YOU BUY");
    }
    if (live) {
      // live price: a dashed line across the chart and a tag on the scale
      const yy = py(live);
      const last = cs[cs.length - 1];
      const tagCol = !last || live >= last.o ? C.up : C.down;
      g.strokeStyle = tagCol;
      g.lineWidth = 1.5;
      g.setLineDash([4, 5]);
      g.beginPath();
      g.moveTo(x + 8, yy);
      g.lineTo(x + w - 112, yy);
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = C.ink;
      g.beginPath();
      g.arc(x + w - 122, yy, 6 + (this.t % 30 < 15 ? 2 : 0), 0, Math.PI * 2);
      g.fill();
      this.pill(x + w - 104, yy - 16, 96, 32, tagCol);
      this.text(fmtPrice(live), x + w - 56, yy, 17, C.bg, "center");
    }
    return py;
  }

  draw(): void {
    const g = this.g;
    g.fillStyle = C.bg;
    g.fillRect(0, 0, MEME_W, MEME_H);
    this.text("MEME DASH", 24, 36, 20, C.gold, "left", 400, "title");
    this.modeTag();

    if (this.scene === "loading") {
      this.text("Finding the coins...", MEME_W / 2, MEME_H / 2, 34, C.ink, "center");
    }

    const c = this.coin;
    if (this.scene === "pick" && c) {
      const bob = Math.sin(this.t / 10) * 6;
      this.logo(c, MEME_W / 2, 190 + bob, 96);
      this.text("‹", 70, 190, 90, C.dim, "center", 400);
      this.text("›", MEME_W - 70, 190, 90, C.dim, "center", 400);
      this.text(`$${c.symbol}`, MEME_W / 2, 324, 34, C.ink, "center", 400, "title");
      const upc = c.change24h >= 0;
      this.pill(MEME_W / 2 - 170, 356, 340, 64, upc ? C.up : C.down);
      this.text(`${upc ? "▲ UP" : "▼ DOWN"} ${Math.abs(c.change24h).toFixed(1)}% TODAY`, MEME_W / 2, 388, 28, C.bg, "center");
      this.text(`$${fmtPrice(c.price)}`, MEME_W / 2, 452, 30, C.dim, "center", 600);
      if (this.idx >= 1 && this.idx <= 3) {
        this.pill(MEME_W - 150, 96, 118, 38, C.gold);
        this.text(`FOMO #${this.idx}`, MEME_W - 91, 115, 19, C.ink, "center", 800);
      }
      this.text("Your play key signs every trade", MEME_W / 2, 494, 23, C.real, "center", 600);
      const slot = this.coinBal === null ? "COIN SLOT ..." : `COIN SLOT ${(Number(this.coinBal) / 1e9).toFixed(3)} SOL - ALL IT CAN SPEND`;
      this.text(slot, MEME_W / 2, 520, 20, this.coinBal === BigInt(0) ? C.down : C.dim, "center", 600);
      this.text("◀ ▶ coins  A pick  X cash out  B back", MEME_W / 2, 550, 21, C.dim, "center", 600);
    }

    if ((this.scene === "chart" || this.scene === "result") && c) {
      this.logo(c, 46, 98, 30);
      this.text(`$${c.symbol}`, 86, 88, 20, C.ink, "left", 400, "title");
      const live = this.live(c);
      this.text(`$${fmtPrice(live)}`, 86, 118, 22, C.dim, "left", 600);
      this.chart(20, 142, MEME_W - 40, 250);
      const pos = this.pos;
      if (pos) {
        const pct = live / pos.entry - 1;
        const pnl = pos.usd * pct;
        this.face(88, 470, 46, pnl);
        this.text(`${pnl >= 0 ? "+" : ""}${fmtUsd(pnl)}`, 152, 452, 48, pnl >= 0 ? C.up : C.down);
        this.text(`${pct >= 0 ? "+" : ""}${(pct * 100).toFixed(1)}% on your ${fmtUsd(pos.usd)}`, 152, 494, 24, C.dim, "left", 600);
        this.pill(MEME_W - 258, 428, 238, 84, C.down);
        this.text("A / B  SELL", MEME_W - 139, 470, 34, C.ink, "center");
        this.text("Safety net sells at -8%. Treasure sells at +15%.", MEME_W / 2, 546, 20, C.dim, "center", 600);
      } else if (this.scene === "chart") {
        this.text("How much?", 24, 434, 24, C.dim, "left", 600);
        this.stakes.forEach((s, i) => {
          const sel = i === this.stakeIdx;
          const px = 20 + i * 72;
          this.pill(px, 450, 66, 58, sel ? C.gold : C.panel);
          if (s.skr) {
            this.text(`${s.skr}`, px + 33, 472, 24, sel ? C.bg : C.ink, "center");
            this.text("SKR", px + 33, 496, 14, sel ? C.bg : C.dim, "center", 700);
          } else {
            this.text(`$${s.usd}`, px + 33, 479, 26, sel ? C.bg : C.ink, "center");
          }
        });
        const stake = this.stakes[this.stakeIdx]!;
        if (this.confirmBig) {
          this.pill(MEME_W - 182, 432, 158, 84, C.down);
          this.text("SURE?", MEME_W - 103, 462, 30, C.bg, "center");
          this.text("A yes", MEME_W - 103, 494, 20, C.bg, "center", 600);
        } else {
          this.pill(MEME_W - 182, 432, 158, 84, C.up);
          this.text("A  BUY", MEME_W - 103, 474, 36, C.bg, "center");
        }
        this.text("▲▼ amount   A buy   B coins", MEME_W / 2, 546, 20, C.dim, "center", 600);
      }
    }

    if (this.scene === "result" && this.result) {
      const r = this.result;
      g.fillStyle = "rgba(244,241,255,0.9)";
      g.fillRect(0, 0, MEME_W, MEME_H);
      this.face(MEME_W / 2, 170, 76, r.pnl);
      this.text(r.why, MEME_W / 2, 284, 30, C.dim, "center", 700);
      this.text(r.text, MEME_W / 2, 336, 34, C.ink, "center", 400, "title");
      this.text(`${r.pnl >= 0 ? "+" : ""}${fmtUsd(r.pnl)}  (${r.pct >= 0 ? "+" : ""}${(r.pct * 100).toFixed(1)}%)`, MEME_W / 2, 402, 42, r.pnl >= 0 ? C.up : C.down, "center");
      this.text("A trade again   B pick a coin", MEME_W / 2, 484, 24, C.dim, "center", 600);
    }

    if (this.busy) {
      g.fillStyle = "rgba(244,241,255,0.88)";
      g.fillRect(0, 0, MEME_W, MEME_H);
      this.text(this.busy + ".".repeat(1 + (Math.floor(this.t / 10) % 3)), MEME_W / 2, MEME_H / 2 - 20, 34, C.ink, "center");
      if (this.busy.includes("COIN")) this.text("Approve the top-up in your wallet", MEME_W / 2, MEME_H / 2 + 30, 24, C.dim, "center", 600);
    }
    if (this.error) {
      g.fillStyle = "rgba(244,241,255,0.94)";
      g.fillRect(0, 0, MEME_W, MEME_H);
      this.text("Uh oh", MEME_W / 2, MEME_H / 2 - 60, 30, C.down, "center", 400, "title");
      this.wrapError(this.error);
      this.text("A: OK", MEME_W / 2, MEME_H / 2 + 62, 24, C.dim, "center", 600);
    }
  }
}
