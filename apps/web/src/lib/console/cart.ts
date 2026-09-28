import { IMAGE_SIZE, NUM_IMAGES, NUM_MUSICS, NUM_SOUNDS, NUM_TILEMAPS, TILEMAP_SIZE } from "./consts";
import { Image } from "./image";
import { Music, Sound } from "./sound";
import { Tilemap } from "./tilemap";

/**
 * A cartridge: code + assets in one JSON document.
 * Empty banks are omitted, so a small game is a few KB.
 */
export interface Cart {
  v: 1;
  title: string;
  author: string;
  width: number;
  height: number;
  fps: number;
  /** JavaScript. Defines update() and draw(), optionally init(). Runs with the console API as globals. */
  code: string;
  images?: Record<string, string>; // bank index -> base64 of 4-bit packed pixels
  tilemaps?: Record<string, { image: number; tu: string; tv: string }>;
  sounds?: Record<string, { notes: string; tones: string; volumes: string; effects: string; speed: number }>;
  musics?: Record<string, number[][]>;
}

export interface Banks {
  images: Image[];
  tilemaps: Tilemap[];
  sounds: Sound[];
  musics: Music[];
}

export function emptyBanks(): Banks {
  const images = Array.from({ length: NUM_IMAGES }, () => new Image(IMAGE_SIZE, IMAGE_SIZE));
  return {
    images,
    tilemaps: Array.from({ length: NUM_TILEMAPS }, () => new Tilemap(TILEMAP_SIZE, TILEMAP_SIZE, images[0]!)),
    sounds: Array.from({ length: NUM_SOUNDS }, () => new Sound()),
    musics: Array.from({ length: NUM_MUSICS }, () => new Music()),
  };
}

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function pack4(px: Uint8Array): Uint8Array {
  const out = new Uint8Array(Math.ceil(px.length / 2));
  for (let i = 0; i < px.length; i += 2) out[i >> 1] = ((px[i]! & 15) << 4) | ((px[i + 1] ?? 0) & 15);
  return out;
}

function unpack4(packed: Uint8Array, into: Uint8Array): void {
  for (let i = 0; i < into.length; i++) {
    const b = packed[i >> 1] ?? 0;
    into[i] = i & 1 ? b & 15 : b >> 4;
  }
}

const isEmpty = (a: Uint8Array) => a.every((v) => v === 0);

export function saveBanks(banks: Banks): Pick<Cart, "images" | "tilemaps" | "sounds" | "musics"> {
  const images: Cart["images"] = {};
  banks.images.forEach((img, i) => {
    if (!isEmpty(img.data)) images[i] = toBase64(pack4(img.data));
  });
  const tilemaps: Cart["tilemaps"] = {};
  banks.tilemaps.forEach((tm, i) => {
    const { tu, tv } = tm.raw();
    if (isEmpty(tu) && isEmpty(tv)) return;
    tilemaps[i] = { image: Math.max(0, banks.images.indexOf(tm.image)), tu: toBase64(tu), tv: toBase64(tv) };
  });
  const sounds: Cart["sounds"] = {};
  banks.sounds.forEach((s, i) => {
    if (s.notes.length) sounds[i] = { ...s.source, speed: s.speed };
  });
  const musics: Cart["musics"] = {};
  banks.musics.forEach((m, i) => {
    if (m.seqs.some((q) => q.length)) musics[i] = m.seqs.map((q) => [...q]);
  });
  return { images, tilemaps, sounds, musics };
}

export function loadBanks(cart: Cart, banks: Banks): void {
  for (const [k, b64] of Object.entries(cart.images ?? {})) {
    const img = banks.images[Number(k)];
    if (img) unpack4(fromBase64(b64), img.data);
  }
  for (const [k, t] of Object.entries(cart.tilemaps ?? {})) {
    const tm = banks.tilemaps[Number(k)];
    if (!tm) continue;
    tm.image = banks.images[t.image] ?? banks.images[0]!;
    const raw = tm.raw();
    raw.tu.set(fromBase64(t.tu).subarray(0, raw.tu.length));
    raw.tv.set(fromBase64(t.tv).subarray(0, raw.tv.length));
  }
  for (const [k, s] of Object.entries(cart.sounds ?? {})) {
    banks.sounds[Number(k)]?.set(s.notes, s.tones, s.volumes, s.effects, s.speed);
  }
  for (const [k, seqs] of Object.entries(cart.musics ?? {})) {
    banks.musics[Number(k)]?.set(...seqs);
  }
}

/** Throws with a readable message if the JSON is not a playable cart. */
export function parseCart(json: string): Cart {
  const c = JSON.parse(json) as Partial<Cart>;
  if (c.v !== 1) throw new Error("unsupported cart version");
  if (typeof c.code !== "string") throw new Error("cart has no code");
  const w = Number(c.width ?? 128);
  const h = Number(c.height ?? 128);
  if (!(w >= 16 && w <= 256 && h >= 16 && h <= 256)) throw new Error("screen must be 16..256 px");
  return {
    v: 1,
    title: String(c.title ?? "untitled"),
    author: String(c.author ?? ""),
    width: w,
    height: h,
    fps: Math.min(60, Math.max(1, Number(c.fps ?? 30))),
    code: c.code,
    images: c.images,
    tilemaps: c.tilemaps,
    sounds: c.sounds,
    musics: c.musics,
  };
}
