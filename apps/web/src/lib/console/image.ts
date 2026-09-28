import { FONT_DATA, FONT_HEIGHT, FONT_MIN_CODE, FONT_WIDTH, NUM_COLORS, TILE_SIZE } from "./consts";
import type { Tilemap } from "./tilemap";

/**
 * An indexed-color bitmap: one byte per pixel, values 0..15.
 * The screen and the three image banks are all Images, so every draw call works on either.
 * Camera, clip and palette remap apply to draws INTO this image.
 */
export class Image {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;

  private camX = 0;
  private camY = 0;
  private clipX0 = 0;
  private clipY0 = 0;
  private clipX1: number;
  private clipY1: number;
  private readonly palMap = new Uint8Array(NUM_COLORS);

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.data = new Uint8Array(width * height);
    this.clipX1 = width;
    this.clipY1 = height;
    this.pal();
  }

  // ---- draw state ---------------------------------------------------------

  camera(x = 0, y = 0): void {
    this.camX = Math.floor(x);
    this.camY = Math.floor(y);
  }

  clip(x?: number, y?: number, w?: number, h?: number): void {
    if (x === undefined || y === undefined || w === undefined || h === undefined) {
      this.clipX0 = 0;
      this.clipY0 = 0;
      this.clipX1 = this.width;
      this.clipY1 = this.height;
      return;
    }
    this.clipX0 = Math.max(0, Math.floor(x));
    this.clipY0 = Math.max(0, Math.floor(y));
    this.clipX1 = Math.min(this.width, Math.floor(x + w));
    this.clipY1 = Math.min(this.height, Math.floor(y + h));
  }

  /** pal() resets; pal(a, b) makes every later draw of color a use color b. */
  pal(from?: number, to?: number): void {
    if (from === undefined || to === undefined) {
      for (let i = 0; i < NUM_COLORS; i++) this.palMap[i] = i;
      return;
    }
    this.palMap[from & 15] = to & 15;
  }

  // ---- raw pixel access (no camera/clip/pal) ------------------------------

  get(x: number, y: number): number {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return 0;
    return this.data[y * this.width + x]!;
  }

  set(x: number, y: number, col: number): void {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    this.data[y * this.width + x] = col & 15;
  }

  /** Load rows of hex digits, e.g. ["0110", "1ff1"], at (x, y). */
  load(x: number, y: number, rows: readonly string[]): void {
    for (let j = 0; j < rows.length; j++) {
      const row = rows[j]!;
      for (let i = 0; i < row.length; i++) {
        const v = parseInt(row[i]!, 16);
        if (!Number.isNaN(v)) this.set(x + i, y + j, v);
      }
    }
  }

  // ---- primitives ---------------------------------------------------------

  /** Plot in camera space with clip and palette. Everything funnels through here. */
  private plot(x: number, y: number, col: number): void {
    x -= this.camX;
    y -= this.camY;
    if (x < this.clipX0 || y < this.clipY0 || x >= this.clipX1 || y >= this.clipY1) return;
    this.data[y * this.width + x] = this.palMap[col & 15]!;
  }

  private hspan(x0: number, x1: number, y: number, col: number): void {
    if (x1 < x0) [x0, x1] = [x1, x0];
    for (let x = x0; x <= x1; x++) this.plot(x, y, col);
  }

  cls(col: number): void {
    const c = this.palMap[col & 15]!;
    for (let y = this.clipY0; y < this.clipY1; y++) {
      this.data.fill(c, y * this.width + this.clipX0, y * this.width + this.clipX1);
    }
  }

  pget(x: number, y: number): number {
    return this.get(x - this.camX, y - this.camY);
  }

  pset(x: number, y: number, col: number): void {
    this.plot(Math.floor(x), Math.floor(y), col);
  }

  line(x1: number, y1: number, x2: number, y2: number, col: number): void {
    let x0 = Math.floor(x1);
    let y0 = Math.floor(y1);
    const xe = Math.floor(x2);
    const ye = Math.floor(y2);
    const dx = Math.abs(xe - x0);
    const dy = -Math.abs(ye - y0);
    const sx = x0 < xe ? 1 : -1;
    const sy = y0 < ye ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.plot(x0, y0, col);
      if (x0 === xe && y0 === ye) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  rect(x: number, y: number, w: number, h: number, col: number): void {
    x = Math.floor(x);
    y = Math.floor(y);
    w = Math.floor(w);
    h = Math.floor(h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.plot(x + i, y + j, col);
  }

  rectb(x: number, y: number, w: number, h: number, col: number): void {
    x = Math.floor(x);
    y = Math.floor(y);
    w = Math.floor(w);
    h = Math.floor(h);
    if (w <= 0 || h <= 0) return;
    this.hspan(x, x + w - 1, y, col);
    this.hspan(x, x + w - 1, y + h - 1, col);
    for (let j = 1; j < h - 1; j++) {
      this.plot(x, y + j, col);
      this.plot(x + w - 1, y + j, col);
    }
  }

  /** Midpoint circle. filled=true draws spans, false draws the outline. */
  private circle(cx: number, cy: number, r: number, col: number, filled: boolean): void {
    cx = Math.floor(cx);
    cy = Math.floor(cy);
    r = Math.floor(r);
    if (r < 0) return;
    let x = r;
    let y = 0;
    let err = 1 - r;
    while (x >= y) {
      if (filled) {
        this.hspan(cx - x, cx + x, cy + y, col);
        this.hspan(cx - x, cx + x, cy - y, col);
        this.hspan(cx - y, cx + y, cy + x, col);
        this.hspan(cx - y, cx + y, cy - x, col);
      } else {
        this.plot(cx + x, cy + y, col); this.plot(cx - x, cy + y, col);
        this.plot(cx + x, cy - y, col); this.plot(cx - x, cy - y, col);
        this.plot(cx + y, cy + x, col); this.plot(cx - y, cy + x, col);
        this.plot(cx + y, cy - x, col); this.plot(cx - y, cy - x, col);
      }
      y++;
      if (err < 0) {
        err += 2 * y + 1;
      } else {
        x--;
        err += 2 * (y - x) + 1;
      }
    }
  }

  circ(x: number, y: number, r: number, col: number): void {
    this.circle(x, y, r, col, true);
  }

  circb(x: number, y: number, r: number, col: number): void {
    this.circle(x, y, r, col, false);
  }

  tri(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, col: number): void {
    const pts = [
      [Math.floor(x1), Math.floor(y1)],
      [Math.floor(x2), Math.floor(y2)],
      [Math.floor(x3), Math.floor(y3)],
    ] as [number, number][];
    pts.sort((a, b) => a[1] - b[1]);
    const [[ax, ay], [bx, by], [cx, cy]] = pts as [[number, number], [number, number], [number, number]];
    const edge = (y: number, px: number, py: number, qx: number, qy: number) =>
      qy === py ? px : px + ((qx - px) * (y - py)) / (qy - py);
    for (let y = ay; y <= cy; y++) {
      const xl = edge(y, ax, ay, cx, cy);
      const xr = y < by ? edge(y, ax, ay, bx, by) : edge(y, bx, by, cx, cy);
      this.hspan(Math.round(xl), Math.round(xr), y, col);
    }
  }

  trib(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, col: number): void {
    this.line(x1, y1, x2, y2, col);
    this.line(x2, y2, x3, y3, col);
    this.line(x3, y3, x1, y1, col);
  }

  /** 4-way flood fill of the region under (x, y). */
  fill(x: number, y: number, col: number): void {
    const sx = Math.floor(x) - this.camX;
    const sy = Math.floor(y) - this.camY;
    if (sx < this.clipX0 || sy < this.clipY0 || sx >= this.clipX1 || sy >= this.clipY1) return;
    const target = this.data[sy * this.width + sx]!;
    const c = this.palMap[col & 15]!;
    if (target === c) return;
    const stack = [sx, sy];
    while (stack.length) {
      const py = stack.pop()!;
      const px = stack.pop()!;
      if (px < this.clipX0 || py < this.clipY0 || px >= this.clipX1 || py >= this.clipY1) continue;
      const i = py * this.width + px;
      if (this.data[i] !== target) continue;
      this.data[i] = c;
      stack.push(px + 1, py, px - 1, py, px, py + 1, px, py - 1);
    }
  }

  /**
   * Copy a region of `src` here. Negative w or h flips horizontally or vertically.
   * Pixels equal to colkey (a source color) are skipped.
   */
  blt(x: number, y: number, src: Image, u: number, v: number, w: number, h: number, colkey?: number): void {
    x = Math.floor(x);
    y = Math.floor(y);
    u = Math.floor(u);
    v = Math.floor(v);
    const flipX = w < 0;
    const flipY = h < 0;
    const aw = Math.abs(Math.floor(w));
    const ah = Math.abs(Math.floor(h));
    for (let j = 0; j < ah; j++) {
      const sv = v + (flipY ? ah - 1 - j : j);
      for (let i = 0; i < aw; i++) {
        const c = src.get(u + (flipX ? aw - 1 - i : i), sv);
        if (c !== colkey) this.plot(x + i, y + j, c);
      }
    }
  }

  /** Draw a region of a tilemap. u, v, w, h are in tilemap pixels (tile = 8px). */
  bltm(x: number, y: number, tm: Tilemap, u: number, v: number, w: number, h: number, colkey?: number): void {
    x = Math.floor(x);
    y = Math.floor(y);
    u = Math.floor(u);
    v = Math.floor(v);
    const flipX = w < 0;
    const flipY = h < 0;
    const aw = Math.abs(Math.floor(w));
    const ah = Math.abs(Math.floor(h));
    const img = tm.image;
    for (let j = 0; j < ah; j++) {
      const py = v + (flipY ? ah - 1 - j : j);
      const ty = Math.floor(py / TILE_SIZE);
      for (let i = 0; i < aw; i++) {
        const px = u + (flipX ? aw - 1 - i : i);
        const [tu, tv] = tm.pget(Math.floor(px / TILE_SIZE), ty);
        const c = img.get(tu * TILE_SIZE + (px % TILE_SIZE), tv * TILE_SIZE + (py % TILE_SIZE));
        if (c !== colkey) this.plot(x + i, y + j, c);
      }
    }
  }

  /** Draw text with the built-in 4x6 font. "\n" starts a new line. */
  text(x: number, y: number, s: string, col: number): void {
    x = Math.floor(x);
    y = Math.floor(y);
    let cx = x;
    for (const ch of s) {
      if (ch === "\n") {
        cx = x;
        y += FONT_HEIGHT;
        continue;
      }
      const glyph = FONT_DATA[ch.charCodeAt(0) - FONT_MIN_CODE];
      if (glyph !== undefined) {
        for (let row = 0; row < FONT_HEIGHT; row++) {
          const bits = (glyph >> ((FONT_HEIGHT - 1 - row) * 4)) & 0xf;
          for (let bit = 0; bit < FONT_WIDTH; bit++) {
            if (bits & (0x8 >> bit)) this.plot(cx + bit, y + row, col);
          }
        }
      }
      cx += FONT_WIDTH;
    }
  }

  private textCanvas: HTMLCanvasElement | null = null;
  private textFont = "";

  /**
   * Smooth, readable text: renders the loaded pixel font (VT323) through a
   * scratch canvas and stamps the lit pixels into the buffer as `col`.
   * The 4x6 font stays for anything that wants it; text2 is for words a
   * player actually has to read.
   */
  text2(x: number, y: number, s: string, col: number, size = 10, align: "left" | "center" | "right" = "left"): void {
    if (typeof document === "undefined") return this.text(x, y, s, col);
    if (!this.textCanvas) this.textCanvas = document.createElement("canvas");
    if (!this.textFont) {
      const fam = getComputedStyle(document.documentElement).getPropertyValue("--font-vt323").trim();
      this.textFont = fam || "VT323, monospace";
    }
    const c = this.textCanvas;
    const g = c.getContext("2d", { willReadFrequently: true });
    if (!g) return this.text(x, y, s, col);
    // VT323 is a compact face: render larger so it stays crisp in the small buffer.
    const pt = Math.round(size * 1.35);
    g.font = `${pt}px ${this.textFont}`;
    const w = Math.max(1, Math.ceil(g.measureText(s).width) + 2);
    const h = Math.ceil(pt * 1.2);
    if (c.width < w) c.width = w;
    if (c.height < h) c.height = h;
    g.clearRect(0, 0, w, h);
    g.font = `${pt}px ${this.textFont}`;
    g.textBaseline = "top";
    g.fillStyle = "#fff";
    g.fillText(s, 1, 0);
    const px = g.getImageData(0, 0, w, h).data;
    let ox = Math.floor(x);
    if (align === "center") ox -= Math.floor(w / 2);
    else if (align === "right") ox -= w;
    const oy = Math.floor(y);
    for (let j = 0; j < h; j++) {
      const row = j * w * 4;
      for (let i = 0; i < w; i++) {
        if (px[row + i * 4 + 3]! > 140) this.plot(ox + i, oy + j, col);
      }
    }
  }
}
