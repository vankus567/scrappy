import { afterEach, describe, expect, setSystemTime, test } from "bun:test";
import { base58 } from "@scure/base";
import type { MiddlewareHandler } from "hono";
import { createApp } from "./app";
import { createAuth } from "./auth";
import { openDb } from "./db";
import { ANIMALS, animalFrames, botContour, melody, melodyFrames, scoreContour } from "./mimic";
import { ROUND_MS } from "./mimicBattles";
import { createProofStore } from "./proofs";
import { createTaskService } from "./tasks";

const sing = (target: number[], key = 0, wobble = 0) => target.map((s, i) => String(Math.round((s + key + (i % 2 ? wobble : -wobble)) * 4))).join(",");

describe("mimic scoring", () => {
  const target = melodyFrames(melody("abc"));
  test("a perfect copy scores 100 in any key or octave; the shape matters", () => {
    expect(scoreContour(target, sing(target, 0))).toBe(100);
    expect(scoreContour(target, sing(target, -12))).toBe(100);
    expect(scoreContour(target, sing(target, 5, 0.5))!).toBeGreaterThan(80);
    expect(scoreContour(target, target.map(() => "-20").join(","))!).toBeLessThan(45);
    expect(scoreContour(target, "x,x,x,x,x,x")).toBe(0);
  });
  test("junk is rejected, not scored", () => {
    expect(scoreContour(target, "999,1,2,3")).toBeNull();
    expect(scoreContour(target, "a,b,c,d")).toBeNull();
    expect(scoreContour(target, Array(200).fill("1").join(","))).toBeNull();
  });
  test("the same seed gives the same tune; the bot sings it back decently", () => {
    expect(melody("abc")).toEqual(melody("abc"));
    expect(melody("abc")).not.toEqual(melody("abd"));
    const scores = Array.from({ length: 10 }, () => scoreContour(target, botContour(target))!);
    expect(Math.min(...scores)).toBeGreaterThan(50);
  });
});

const wallets = Array.from({ length: 5 }, (_, i) => base58.encode(new Uint8Array(32).fill(i + 31)));
const passThrough: MiddlewareHandler = async (_c, next) => next();
const pings: { to: string; title: string }[] = [];

function setup() {
  pings.length = 0;
  const db = openDb(":memory:");
  const tmp = `${process.env.TEMP ?? "/tmp"}/scrappy-mimic-test`;
  const app = createApp({
    db, tasks: createTaskService(db), auth: createAuth(db), paywall: passThrough,
    proofs: createProofStore(db, `${tmp}/proofs`), workerPush: (to, m) => pings.push({ to, title: m.title }),
  });
  process.env.CLIP_DIR = `${tmp}/clips`;
  const req = async (method: string, path: string, body?: unknown, token?: string) => {
    const res = await app.request(path, {
      method,
      headers: { "content-type": "application/json", ...(token && { authorization: `Bearer ${token}` }) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
  const player = async (i: number, name: string) => {
    const r = await req("POST", "/v1/workers", { wallet: wallets[i], languages: ["en"], pet_name: name, species: "kumo" });
    return r.body.worker_token as string;
  };
  return { db, req, player };
}

let clock = Date.UTC(2026, 9, 3);
const tick = (ms: number) => setSystemTime(new Date((clock += ms)));
afterEach(() => setSystemTime());

describe("animal calls", () => {
  test("every built-in call has a pitch line, and copying it scores well", () => {
    for (const a of ANIMALS) {
      const f = animalFrames(a);
      expect(f.length).toBeGreaterThan(5);
      expect(scoreContour(f, sing(f, -7))!).toBeGreaterThan(90);
    }
    const meow = animalFrames(ANIMALS.find((a) => a.key === "cat")!);
    const moo = animalFrames(ANIMALS.find((a) => a.key === "cow")!);
    expect(scoreContour(meow, sing(moo))!).toBeLessThan(70); // a moo is not a meow
  });
});

describe("mimic battles API", () => {
  test("3 players + a bot seat, three clips, scores hidden until each round closes, best total wins", async () => {
    tick(0);
    const s = setup();
    const [ana, ben, cai] = [await s.player(0, "Ana"), await s.player(1, "Ben"), await s.player(2, "Cai")];
    const lobby = await s.req("POST", "/v1/mimic", { players: 4 }, ana);
    expect(lobby.body).toMatchObject({ status: "open", max_players: 4, you: 0, players: [{ name: "Ana" }] });
    const id = lobby.body.id;
    expect((await s.req("POST", `/v1/mimic/${id}/start`, {}, ana)).body.error).toContain("at least 2");
    await s.req("POST", `/v1/mimic/${id}/join`, undefined, ben);
    await s.req("POST", `/v1/mimic/${id}/join`, undefined, cai);
    expect((await s.req("POST", `/v1/mimic/${id}/start`, {}, ben)).status).toBe(404); // only the host starts
    const started = await s.req("POST", `/v1/mimic/${id}/start`, { fill_with_bots: true }, ana);
    expect(started.body).toMatchObject({ status: "active", round: 1 });
    expect(started.body.players.map((p: any) => [p.name, p.bot])).toEqual([["Ana", false], ["Ben", false], ["Cai", false], ["Scrappy Bot", true]]);
    expect(started.body.players[3].submitted).toBe(true); // the bot sang already

    const quality = { [ana]: 0, [ben]: 1.5, [cai]: 3 } as Record<string, number>;
    for (let round = 1; round <= 3; round++) {
      const v = (await s.req("GET", `/v1/mimic/${id}`, undefined, ana)).body;
      expect(v.round).toBe(round);
      const target: number[] = v.clips[round - 1].frames;
      for (const t of [ana, ben, cai]) {
        const r = await s.req("POST", `/v1/mimic/${id}/submit`, { round, contour: sing(target, 3, quality[t]) }, t);
        expect(r.status).toBe(200);
        if (t === ana && round === 1) {
          expect(r.body.results).toHaveLength(0); // round still open: nobody's score shows yet
          expect(r.body.your_entry).toBe(100);
          expect((await s.req("POST", `/v1/mimic/${id}/submit`, { round, contour: sing(target) }, ana)).status).toBe(409); // one entry
        }
      }
    }
    const end = (await s.req("GET", `/v1/mimic/${id}`, undefined, ben)).body;
    expect(end.status).toBe("done");
    expect(end.results).toHaveLength(3);
    const byName = Object.fromEntries(end.players.map((p: any) => [p.name, p]));
    expect(byName.Ana.total).toBeGreaterThanOrEqual(290);
    expect(byName.Ana.winner).toBe(true);
    expect(byName.Ben.total).toBeLessThan(300);
    expect(pings.some((p) => p.title === "You won the Mimic battle!")).toBe(true);
    const board = (await s.req("GET", "/v1/mimic/leaderboard")).body.entries;
    expect(board[0]).toMatchObject({ pet_name: "Ana", wins: 1 });
    expect(board.every((e: any) => !String(e.pet_name).startsWith("Scrappy Bot"))).toBe(true);
  });

  test("quick match pairs two players; a no-show scores 0 when the round times out", async () => {
    tick(0);
    const s = setup();
    const a = await s.player(0, "Ana");
    const b = await s.player(1, "Ben");
    const q1 = await s.req("POST", "/v1/mimic/quick", undefined, a);
    expect(q1.body.status).toBe("open");
    const q2 = await s.req("POST", "/v1/mimic/quick", undefined, b);
    expect(q2.body).toMatchObject({ id: q1.body.id, status: "active", round: 1 }); // full: starts itself
    for (let round = 1; round <= 3; round++) {
      const v = (await s.req("GET", `/v1/mimic/${q1.body.id}`, undefined, a)).body;
      await s.req("POST", `/v1/mimic/${q1.body.id}/submit`, { round, contour: sing(v.clips[round - 1].frames) }, a);
      tick(ROUND_MS + 1_000);
    }
    const end = (await s.req("GET", `/v1/mimic/${q1.body.id}`, undefined, b)).body;
    expect(end.status).toBe("done");
    expect(end.players.find((p: any) => p.name === "Ben")).toMatchObject({ total: 0, winner: false });
    expect(end.players.find((p: any) => p.name === "Ana")).toMatchObject({ winner: true });
  });

  test("players can upload a sound to the library; three reports hide it", async () => {
    tick(0);
    const s = setup();
    const a = await s.player(0, "Ana");
    const audio = Buffer.alloc(4_000, 3).toString("base64");
    const target = melodyFrames(melody("upload"));
    const up = await s.req("POST", "/v1/clips", { title: "My meow", mime: "audio/webm", audio, contour: sing(target), duration_ms: 2400 }, a);
    expect(up.status).toBe(201);
    expect(up.body).toMatchObject({ kind: "upload", title: "My meow", category: "sound", by: "Ana", audio_url: `/v1/clips/${up.body.id}/audio` });
    const line = await s.req("POST", "/v1/clips", { title: "Kitne aadmi the?", mime: "audio/webm", audio, contour: sing(target), duration_ms: 1800, category: "dialogue", quote: "Kitne aadmi the?", movie: "Sholay" }, a);
    expect(line.body).toMatchObject({ category: "dialogue", quote: "Kitne aadmi the?", movie: "Sholay" });
    expect((await s.req("GET", "/v1/clips/animal:wolf")).body).toMatchObject({ kind: "animal", title: "Wolf: Awoooo" });
    expect((await s.req("POST", "/v1/clips", { title: "bad", mime: "image/png", audio, contour: sing(target), duration_ms: 2400 }, a)).status).toBe(400);
    for (let i = 0; i < 3; i++) await s.req("POST", `/v1/clips/${up.body.id}/report`);
    expect((await s.req("GET", `/v1/clips/${up.body.id}`)).body.hidden).toBe(true);
  });
});
