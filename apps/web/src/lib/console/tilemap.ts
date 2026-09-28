import type { Image } from "./image";

/**
 * A grid of tile references. Each cell points at an 8x8 tile (tu, tv) in `image`.
 * Stored as two parallel byte arrays so a 256x256 map is 128 KB.
 */
export class Tilemap {
  readonly width: number;
  readonly height: number;
  image: Image;
  private readonly tu: Uint8Array;
  private readonly tv: Uint8Array;

  constructor(width: number, height: number, image: Image) {
    this.width = width;
    this.height = height;
    this.image = image;
    this.tu = new Uint8Array(width * height);
    this.tv = new Uint8Array(width * height);
  }

  pget(x: number, y: number): [number, number] {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return [0, 0];
    const i = y * this.width + x;
    return [this.tu[i]!, this.tv[i]!];
  }

  pset(x: number, y: number, tile: readonly [number, number]): void {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const i = y * this.width + x;
    this.tu[i] = tile[0];
    this.tv[i] = tile[1];
  }

  /** Raw arrays, for saving a cartridge. */
  raw(): { tu: Uint8Array; tv: Uint8Array } {
    return { tu: this.tu, tv: this.tv };
  }
}
