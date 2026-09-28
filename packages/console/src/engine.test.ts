import { describe, expect, test } from "bun:test";
import { emptyBanks, loadBanks, parseCart, saveBanks } from "./cart";
import { compileCart } from "./console";
import { Image } from "./image";
import { Input } from "./input";
import { Sound, parseNotes } from "./sound";
import { Channel, Mixer, noteFreq } from "./synth";
import { Tilemap } from "./tilemap";

const rows = (img: Image) =>
  Array.from({ length: img.height }, (_, y) =>
    Array.from({ length: img.width }, (_, x) => img.get(x, y).toString(16)).join(""));

describe("Image", () => {
  test("rect, rectb and clip", () => {
    const img = new Image(6, 4);
    img.rectb(0, 0, 6, 4, 1);
    img.rect(2, 1, 2, 2, 2);
    expect(rows(img)).toEqual(["111111", "102201", "102201", "111111"]);
    img.cls(0);
    img.clip(1, 1, 2, 2);
    img.rect(0, 0, 6, 4, 3);
    expect(rows(img)).toEqual(["000000", "033000", "033000", "000000"]);
  });

  test("camera shifts and pal remaps", () => {
    const img = new Image(4, 1);
    img.camera(-1, 0);
    img.pal(5, 9);
    img.pset(0, 0, 5);
    expect(rows(img)).toEqual(["0900"]);
    expect(img.pget(0, 0)).toBe(9);
  });

  test("line hits both endpoints", () => {
    const img = new Image(5, 5);
    img.line(0, 0, 4, 4, 7);
    for (let i = 0; i < 5; i++) expect(img.get(i, i)).toBe(7);
  });

  test("circ is symmetric and filled", () => {
    const img = new Image(9, 9);
    img.circ(4, 4, 3, 1);
    const r = rows(img);
    expect(r[4]).toBe("011111110");
    expect(r).toEqual([...r].reverse());
    expect(img.get(4, 4)).toBe(1);
  });

  test("fill floods only the connected region", () => {
    const img = new Image(5, 3);
    img.line(2, 0, 2, 2, 1);
    img.fill(0, 0, 4);
    expect(rows(img)).toEqual(["44100", "44100", "44100"]);
  });

  test("blt with colkey and flip", () => {
    const bank = new Image(8, 8);
    bank.load(0, 0, ["12", "30"]);
    const dst = new Image(2, 2);
    dst.cls(9);
    dst.blt(0, 0, bank, 0, 0, -2, 2, 0);
    expect(rows(dst)).toEqual(["21", "93"]);
  });

  test("bltm draws tiles from the bank", () => {
    const bank = new Image(16, 8);
    bank.rect(8, 0, 8, 8, 6);
    const tm = new Tilemap(4, 4, bank);
    tm.pset(1, 0, [1, 0]);
    const dst = new Image(16, 8);
    dst.bltm(0, 0, tm, 0, 0, 16, 8);
    expect(dst.get(0, 0)).toBe(0);
    expect(dst.get(8, 0)).toBe(6);
    expect(dst.get(15, 7)).toBe(6);
  });

  test("text renders the 4x6 font", () => {
    const img = new Image(4, 6);
    img.text(0, 0, "A", 7);
    expect(rows(img)).toEqual(["0700", "7070", "7770", "7070", "7070", "0000"]);
  });
});

describe("Sound", () => {
  test("parses Pyxel note syntax", () => {
    expect(parseNotes("c0 a2 b4 r c#1 e-1")).toEqual([0, 33, 59, -1, 13, 15]);
    expect(() => parseNotes("h2")).toThrow();
  });

  test("a2 is 440 Hz", () => {
    expect(noteFreq(33)).toBeCloseTo(440);
    expect(noteFreq(45)).toBeCloseTo(880);
  });

  test("short tone/volume strings repeat their last value", () => {
    const s = new Sound().set("c3e3g3", "p", "5", "n", 10);
    expect(s.toneAt(2)).toBe(2);
    expect(s.volumeAt(2)).toBe(5);
  });

  test("channel plays for speed/120 s per note, then stops", () => {
    const rate = 12000;
    const s = new Sound().set("a2a2", "s", "7", "n", 60); // 2 notes x 0.5 s
    const ch = new Channel();
    ch.play([s], [0], false);
    const buf = new Float32Array(rate); // 1 s
    ch.mix(buf, rate);
    expect(buf.some((v) => v !== 0)).toBe(true);
    expect(ch.playing).toBe(false);
  });

  test("looping channel keeps playing", () => {
    const s = new Sound().set("c2", "t", "7", "n", 1);
    const m = new Mixer();
    m.channels[0]!.play([s], [0], true);
    m.render(new Float32Array(48000), 48000);
    expect(m.channels[0]!.playing).toBe(true);
  });
});

describe("Input", () => {
  test("btnp fires once, then repeats after hold", () => {
    const inp = new Input();
    inp.setTouch(4, true);
    const hits: boolean[] = [];
    for (let f = 0; f < 8; f++) {
      inp.update();
      hits.push(inp.btnp(4, 3, 2));
    }
    // press on frame 0, first repeat `hold` frames later (frame 3), then every 2 frames
    expect(hits).toEqual([true, false, false, true, false, true, false, true]);
    inp.setTouch(4, false);
    inp.update();
    expect(inp.btnr(4)).toBe(true);
    expect(inp.btn(4)).toBe(false);
  });
});

describe("Cart", () => {
  test("banks round-trip through JSON", () => {
    const a = emptyBanks();
    a.images[0]!.load(0, 0, ["0123", "4567", "89ab", "cdef"]);
    a.tilemaps[2]!.image = a.images[1]!;
    a.tilemaps[2]!.pset(3, 4, [5, 6]);
    a.sounds[7]!.set("c3 e3 g3", "tsp", "765", "nsv", 12);
    a.musics[1]!.set([7], [], [7, 7]);
    const json = JSON.stringify({ v: 1, title: "t", author: "", width: 128, height: 128, fps: 30, code: "", ...saveBanks(a) });
    const cart = parseCart(json);
    expect(Object.keys(cart.images!)).toEqual(["0"]);

    const b = emptyBanks();
    loadBanks(cart, b);
    expect(b.images[0]!.get(3, 3)).toBe(15);
    expect(b.images[0]!.get(1, 0)).toBe(1);
    expect(b.tilemaps[2]!.pget(3, 4)).toEqual([5, 6]);
    expect(b.tilemaps[2]!.image).toBe(b.images[1]!);
    expect(b.sounds[7]!.notes).toEqual(a.sounds[7]!.notes);
    expect(b.sounds[7]!.speed).toBe(12);
    expect(b.musics[1]!.seqs).toEqual([[7], [], [7, 7], []]);
  });

  test("rejects bad carts", () => {
    expect(() => parseCart('{"v":2,"code":""}')).toThrow("version");
    expect(() => parseCart('{"v":1,"code":"","width":999}')).toThrow("16..256");
  });

  test("compileCart exposes the API as globals and returns hooks", () => {
    const calls: number[] = [];
    const hooks = compileCart("let n = 0; function update() { n = add(n, 2); } function draw() { out(n); }", {
      add: (a: number, b: number) => a + b,
      out: (v: number) => calls.push(v),
    });
    hooks.update!();
    hooks.update!();
    hooks.draw!();
    expect(calls).toEqual([4]);
    expect(hooks.init).toBeUndefined();
  });
});
