import { AudioOut } from "./audio";
import { type Banks, type Cart, emptyBanks, loadBanks } from "./cart";
import {
  BTN_A, BTN_B, BTN_DOWN, BTN_LEFT, BTN_RIGHT, BTN_UP, BTN_X, BTN_Y, DEFAULT_PALETTE, NUM_CHANNELS,
} from "./consts";
import { Image } from "./image";
import { Input } from "./input";
import type { Music, Sound } from "./sound";
import type { Tilemap } from "./tilemap";

export interface ConsoleOptions {
  width: number;
  height: number;
  fps?: number;
  palette?: readonly number[];
}

export interface CartHooks {
  init?: () => void;
  update?: () => void;
  draw?: () => void;
}

/** Events the console reports to whoever hosts it (the player page, the editor, a wallet bridge). */
export interface ConsoleEvents {
  onScore?: (score: number) => void;
  onError?: (err: Error) => void;
}

/**
 * The machine: a screen, three image banks, eight tilemaps, 64 sounds, 8 musics,
 * four sound channels and eight buttons, ticking at a fixed frame rate.
 */
export class Console {
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly screen: Image;
  readonly banks: Banks = emptyBanks();
  readonly input = new Input();
  readonly audio = new AudioOut();
  readonly canvas: HTMLCanvasElement;
  frameCount = 0;
  events: ConsoleEvents = {};

  private readonly ctx2d: CanvasRenderingContext2D;
  private readonly frame: ImageData;
  private readonly rgba: Uint32Array; // palette as little-endian ABGR words
  private readonly hex: string[]; // same palette as CSS colors, for overlay text
  private readonly off: HTMLCanvasElement;
  private readonly offCtx: CanvasRenderingContext2D;
  private raf = 0;
  private detach: (() => void)[] = [];
  private hooks: CartHooks = {};
  private crashed = false;

  constructor(host: HTMLElement, opts: ConsoleOptions) {
    this.width = Math.floor(opts.width);
    this.height = Math.floor(opts.height);
    this.fps = opts.fps ?? 30;
    this.screen = new Image(this.width, this.height);
    const pal = opts.palette ?? DEFAULT_PALETTE;
    this.rgba = new Uint32Array(pal.map((c) => 0xff000000 | ((c & 0xff) << 16) | (c & 0xff00) | ((c >> 16) & 0xff)));
    this.hex = pal.map((c) => `#${(c & 0xffffff).toString(16).padStart(6, "0")}`);

    this.canvas = document.createElement("canvas");
    // Backing store is 3x the buffer: the pixel blit stays nearest-neighbor but
    // overlay text gets real subpixel resolution to be smooth and readable.
    this.canvas.width = this.width * 3;
    this.canvas.height = this.height * 3;
    this.canvas.style.imageRendering = "pixelated";
    this.canvas.style.display = "block";
    this.canvas.tabIndex = 0;
    host.appendChild(this.canvas);
    const c2d = this.canvas.getContext("2d");
    if (!c2d) throw new Error("2D canvas not available");
    this.ctx2d = c2d;
    this.off = document.createElement("canvas");
    this.off.width = this.width;
    this.off.height = this.height;
    const oc = this.off.getContext("2d");
    if (!oc) throw new Error("2D canvas not available");
    this.offCtx = oc;
    this.frame = oc.createImageData(this.width, this.height);

    this.detach.push(this.input.attach(window));
    const unlock = () => this.audio.unlock();
    window.addEventListener("keydown", unlock);
    window.addEventListener("pointerdown", unlock);
    this.detach.push(() => {
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("pointerdown", unlock);
    });

    const onMove = (e: PointerEvent) => {
      const r = this.canvas.getBoundingClientRect();
      this.input.mouseX = Math.floor(((e.clientX - r.left) / r.width) * this.width);
      this.input.mouseY = Math.floor(((e.clientY - r.top) / r.height) * this.height);
      this.input.mouseDown = e.buttons !== 0;
    };
    this.canvas.addEventListener("pointermove", onMove);
    this.canvas.addEventListener("pointerdown", onMove);
    this.canvas.addEventListener("pointerup", onMove);

    this.fitTo(host);
  }

  /** Scale the canvas by the largest whole number that fits the host, so pixels stay square and crisp. */
  private fitTo(host: HTMLElement): void {
    const fit = () => {
      const s = Math.max(1, Math.floor(Math.min(host.clientWidth / this.width, host.clientHeight / this.height)));
      this.canvas.style.width = `${this.width * s}px`;
      this.canvas.style.height = `${this.height * s}px`;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(host);
    this.detach.push(() => ro.disconnect());
  }

  loadCart(cart: Cart): void {
    loadBanks(cart, this.banks);
  }

  run(hooks: CartHooks): void {
    this.hooks = hooks;
    this.guard(() => hooks.init?.());
    const step = 1000 / this.fps;
    let last = performance.now();
    let acc = 0;
    const tick = (now: number) => {
      this.raf = requestAnimationFrame(tick);
      acc += Math.min(now - last, 250); // after a background tab, do not fast-forward seconds of game
      last = now;
      let updates = 0;
      while (acc >= step && updates < 4) {
        this.input.update();
        this.guard(() => this.hooks.update?.());
        this.frameCount++;
        acc -= step;
        updates++;
      }
      if (updates > 0) {
        this.guard(() => this.hooks.draw?.());
        this.present();
      }
    };
    this.raf = requestAnimationFrame(tick);
  }

  private guard(fn: () => void): void {
    if (this.crashed) return;
    try {
      fn();
    } catch (e) {
      this.crashed = true;
      const err = e instanceof Error ? e : new Error(String(e));
      this.showError(err);
      this.events.onError?.(err);
    }
  }

  /** A crashed cart shows its error on screen instead of freezing silently. */
  private showError(err: Error): void {
    const s = this.screen;
    s.camera();
    s.clip();
    s.pal();
    s.cls(1);
    s.text(4, 4, "CART CRASHED", 8);
    const msg = err.message.slice(0, 400);
    const perLine = Math.floor((this.width - 8) / 4);
    let y = 14;
    for (let i = 0; i < msg.length && y < this.height - 6; i += perLine, y += 7) s.text(4, y, msg.slice(i, i + perLine), 7);
    this.present();
  }

  private textFont = "";

  private present(): void {
    const px = this.screen.data;
    const out = new Uint32Array(this.frame.data.buffer);
    for (let i = 0; i < px.length; i++) out[i] = this.rgba[px[i]!]!;
    this.offCtx.putImageData(this.frame, 0, 0);
    const g = this.ctx2d;
    g.imageSmoothingEnabled = false;
    g.drawImage(this.off, 0, 0, this.canvas.width, this.canvas.height);

    // Crisp text overlay: draw queued lines at full canvas resolution.
    const lines = this.screen.overlay;
    if (lines.length) {
      if (!this.textFont) {
        const fam = getComputedStyle(document.documentElement).getPropertyValue("--font-switzer").trim();
        this.textFont = fam || "system-ui, sans-serif";
      }
      const k = this.canvas.width / this.width;
      g.textBaseline = "top";
      for (const l of lines) {
        const pt = Math.round(l.size * 1.15 * k);
        g.font = `600 ${pt}px ${this.textFont}`;
        g.fillStyle = this.hex[l.col & 15] ?? "#fff";
        g.textAlign = l.align;
        g.fillText(l.s, l.x * k, l.y * k);
      }
      g.textAlign = "left";
      lines.length = 0;
    }
  }

  stopAll(): void {
    for (const ch of this.audio.mixer.channels) ch.stop();
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    this.stopAll();
    this.audio.close();
    for (const d of this.detach) d();
    this.canvas.remove();
  }

  // ---- the API a cart sees -------------------------------------------------

  private imageArg(img: number | Image): Image {
    const r = typeof img === "number" ? this.banks.images[img] : img;
    if (!r) throw new Error(`no image bank ${String(img)}`);
    return r;
  }

  private tilemapArg(tm: number | Tilemap): Tilemap {
    const r = typeof tm === "number" ? this.banks.tilemaps[tm] : tm;
    if (!r) throw new Error(`no tilemap ${String(tm)}`);
    return r;
  }

  play(ch: number, snd: number | number[], loop = false): void {
    const channel = this.audio.mixer.channels[ch];
    if (!channel) throw new Error(`no channel ${ch} (0..${NUM_CHANNELS - 1})`);
    const ids = Array.isArray(snd) ? snd : [snd];
    const sounds = ids.map((i) => {
      const s = this.banks.sounds[i];
      if (!s) throw new Error(`no sound ${i}`);
      return s;
    });
    channel.play(sounds, ids, loop);
  }

  playm(msc: number, loop = false): void {
    const m = this.banks.musics[msc];
    if (!m) throw new Error(`no music ${msc}`);
    m.seqs.forEach((seq, ch) => {
      if (seq.length) this.play(ch, seq, loop);
      else this.audio.mixer.channels[ch]?.stop();
    });
  }

  /**
   * Everything a cart can call, as a flat object of globals.
   * Names follow Pyxel so its docs and examples carry over.
   */
  api(): Record<string, unknown> {
    const s = this.screen;
    return {
      W: this.width,
      H: this.height,
      LEFT: BTN_LEFT, RIGHT: BTN_RIGHT, UP: BTN_UP, DOWN: BTN_DOWN, A: BTN_A, B: BTN_B, X: BTN_X, Y: BTN_Y,
      cls: (c: number) => s.cls(c),
      pset: (x: number, y: number, c: number) => s.pset(x, y, c),
      pget: (x: number, y: number) => s.pget(x, y),
      line: (x1: number, y1: number, x2: number, y2: number, c: number) => s.line(x1, y1, x2, y2, c),
      rect: (x: number, y: number, w: number, h: number, c: number) => s.rect(x, y, w, h, c),
      rectb: (x: number, y: number, w: number, h: number, c: number) => s.rectb(x, y, w, h, c),
      circ: (x: number, y: number, r: number, c: number) => s.circ(x, y, r, c),
      circb: (x: number, y: number, r: number, c: number) => s.circb(x, y, r, c),
      tri: (x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, c: number) => s.tri(x1, y1, x2, y2, x3, y3, c),
      trib: (x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, c: number) => s.trib(x1, y1, x2, y2, x3, y3, c),
      fill: (x: number, y: number, c: number) => s.fill(x, y, c),
      text: (x: number, y: number, str: unknown, c: number) => s.text(x, y, String(str), c),
      text2: (x: number, y: number, str: unknown, c: number, size?: number, align?: "left" | "center" | "right") => s.text2(x, y, String(str), c, size, align),
      blt: (x: number, y: number, img: number | Image, u: number, v: number, w: number, h: number, colkey?: number) =>
        s.blt(x, y, this.imageArg(img), u, v, w, h, colkey),
      bltm: (x: number, y: number, tm: number | Tilemap, u: number, v: number, w: number, h: number, colkey?: number) =>
        s.bltm(x, y, this.tilemapArg(tm), u, v, w, h, colkey),
      clip: (x?: number, y?: number, w?: number, h?: number) => s.clip(x, y, w, h),
      camera: (x?: number, y?: number) => s.camera(x, y),
      pal: (a?: number, b?: number) => s.pal(a, b),
      image: (i: number) => this.imageArg(i),
      tilemap: (i: number) => this.tilemapArg(i),
      sound: (i: number): Sound => {
        const r = this.banks.sounds[i];
        if (!r) throw new Error(`no sound ${i}`);
        return r;
      },
      music: (i: number): Music => {
        const r = this.banks.musics[i];
        if (!r) throw new Error(`no music ${i}`);
        return r;
      },
      play: (ch: number, snd: number | number[], loop?: boolean) => this.play(ch, snd, loop),
      playm: (m: number, loop?: boolean) => this.playm(m, loop),
      stop: (ch?: number) => (ch === undefined ? this.stopAll() : this.audio.mixer.channels[ch]?.stop()),
      play_pos: (ch: number) => this.audio.mixer.channels[ch]?.position() ?? null,
      btn: (b: number) => this.input.btn(b),
      btnp: (b: number, hold?: number, repeat?: number) => this.input.btnp(b, hold, repeat),
      btnr: (b: number) => this.input.btnr(b),
      mouse: () => ({ x: this.input.mouseX, y: this.input.mouseY, down: this.input.mouseDown }),
      frame: () => this.frameCount,
      rnd: (a = 1, b?: number) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a)),
      rndi: (a: number, b: number) => Math.floor(a + Math.random() * (Math.floor(b) - Math.floor(a) + 1)),
      clamp: (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v)),
      submit_score: (n: number) => {
        if (Number.isFinite(n)) this.events.onScore?.(Math.floor(n));
      },
    };
  }
}

/**
 * Compile a cart's code against the API. The code declares update()/draw()/init() as plain functions;
 * we hand them back as hooks. Call this only inside a sandboxed iframe: cart code is untrusted.
 */
export function compileCart(code: string, api: Record<string, unknown>): CartHooks {
  const names = Object.keys(api);
  const body = `"use strict";\n${code}\n;return {
    init: typeof init === "function" ? init : undefined,
    update: typeof update === "function" ? update : undefined,
    draw: typeof draw === "function" ? draw : undefined,
  };`;
  // eslint-disable-next-line no-new-func
  const factory = new Function(...names, body) as (...args: unknown[]) => CartHooks;
  return factory(...names.map((n) => api[n]));
}

export function bootCart(host: HTMLElement, cart: Cart, events: ConsoleEvents = {}): Console {
  const con = new Console(host, { width: cart.width, height: cart.height, fps: cart.fps });
  con.events = events;
  con.loadCart(cart);
  let hooks: CartHooks;
  try {
    hooks = compileCart(cart.code, con.api());
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    hooks = { draw: () => { throw err; } };
  }
  con.run(hooks);
  return con;
}
