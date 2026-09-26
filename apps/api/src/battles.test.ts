import { afterEach, describe, expect, setSystemTime, test } from "bun:test";
import { base58 } from "@scure/base";
import type { MiddlewareHandler } from "hono";
import { createApp } from "./app";
import { createAuth } from "./auth";
import { commitHash, type Move } from "./battle";
import { ROUND_MS } from "./battles";
import { openDb } from "./db";
import { createProofStore } from "./proofs";
import { createTaskService } from "./tasks";

const wallets = Array.from({ length: 4 }, (_, i) => base58.encode(new Uint8Array(32).fill(i + 11)));
const passThrough: MiddlewareHandler = async (_c, next) => next();

const pings: { to: string; title: string; url: string }[] = [];
function setup() {
  pings.length = 0;
  const db = openDb(":memory:");
  const app = createApp({
    db, tasks: createTaskService(db), auth: createAuth(db), paywall: passThrough,
    proofs: createProofStore(db, `${process.env.TEMP ?? "/tmp"}/scrappy-battle-proofs`),
    workerPush: (to, m) => pings.push({ to, title: m.title, url: m.url }),
  });
  const req = async (method: string, path: string, body?: unknown, token?: string) => {
    const res = await app.request(path, {
      method,
      headers: { "content-type": "application/json", ...(token && { authorization: `Bearer ${token}` }) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
  const player = async (i: number, species: string, name: string, food = 5) => {
    const r = await req("POST", "/v1/workers", { wallet: wallets[i], languages: ["en"], pet_name: name, species });
    expect(r.status).toBe(201);
    db.query("UPDATE workers SET pet_food = ? WHERE wallet = ?").run(food, wallets[i]);
    return r.body.worker_token as string;
  };
  const food = (i: number) => (db.query("SELECT pet_food FROM workers WHERE wallet = ?").get(wallets[i]) as any).pet_food as number;
  return { db, req, player, food };
}

let clock = Date.UTC(2026, 9, 2);
const tick = (ms: number) => setSystemTime(new Date((clock += ms)));
afterEach(() => setSystemTime());

type S = ReturnType<typeof setup>;
async function playRound(s: S, id: string, round: number, a: [string, Move], b: [string, Move]) {
  const salts = [crypto.randomUUID(), crypto.randomUUID()];
  expect((await s.req("POST", `/v1/battles/${id}/commit`, { round, hash: await commitHash(a[1], salts[0]) }, a[0])).status).toBe(200);
  expect((await s.req("POST", `/v1/battles/${id}/commit`, { round, hash: await commitHash(b[1], salts[1]) }, b[0])).status).toBe(200);
  expect((await s.req("POST", `/v1/battles/${id}/reveal`, { round, move: a[1], salt: salts[0] }, a[0])).status).toBe(200);
  const r = await s.req("POST", `/v1/battles/${id}/reveal`, { round, move: b[1], salt: salts[1] }, b[0]);
  expect(r.status).toBe(200);
  return r.body;
}

describe("battles API", () => {
  test("friend challenge with a food stake: join, commit-reveal rounds, winner takes the pot", async () => {
    tick(0);
    const s = setup();
    const bruno = await s.player(0, "ember", "Bruno"); // blaze
    const luna = await s.player(1, "kumo", "Luna"); // tide: counters blaze

    const made = await s.req("POST", "/v1/battles", { stake_food: 2 }, bruno);
    expect(made.status).toBe(201);
    expect(made.body).toMatchObject({ status: "open", you: "a", a: { name: "Bruno", element: "blaze" }, stake_food: 2 });
    expect(s.food(0)).toBe(3); // stake held in escrow
    const id = made.body.id;

    expect((await s.req("POST", `/v1/battles/${id}/join`, undefined, bruno)).status).toBe(409); // not yourself
    const peek = await s.req("GET", `/v1/battles/${id}`); // the link works before joining
    expect(peek.body).toMatchObject({ status: "open", you: null });
    const joined = await s.req("POST", `/v1/battles/${id}/join`, undefined, luna);
    expect(joined.body).toMatchObject({ status: "active", you: "b", b: { name: "Luna", element: "tide" }, round: 1, turn: { next: "lock" } });
    expect(s.food(1)).toBe(3);
    const brunoId = (s.db.query("SELECT id FROM workers WHERE wallet = ?").get(wallets[0]) as any).id;
    const lunaId = (s.db.query("SELECT id FROM workers WHERE wallet = ?").get(wallets[1]) as any).id;
    expect(pings.at(-1)).toEqual({ to: brunoId, title: "Luna accepted your challenge", url: `/app/battle/${id}` });

    // round 1: moves stay hidden until both reveal
    const salt = crypto.randomUUID();
    await s.req("POST", `/v1/battles/${id}/commit`, { round: 1, hash: await commitHash("attack", salt) }, bruno);
    expect((await s.req("POST", `/v1/battles/${id}/reveal`, { round: 1, move: "attack", salt }, bruno)).body.error).toBe("wait for your opponent to lock in");
    const lunaSalt = crypto.randomUUID();
    await s.req("POST", `/v1/battles/${id}/commit`, { round: 1, hash: await commitHash("guard", lunaSalt) }, luna);
    const lunaView = await s.req("GET", `/v1/battles/${id}`, undefined, luna);
    expect(lunaView.body.turn).toMatchObject({ you_locked: true, they_locked: true, next: "reveal" });
    expect(lunaView.body.rounds).toHaveLength(0); // Bruno's attack not visible yet
    expect(pings.some((p) => p.to === lunaId && p.title === "Your turn: round 1")).toBe(true);
    // changing your move after locking in is rejected
    expect((await s.req("POST", `/v1/battles/${id}/reveal`, { round: 1, move: "trick", salt: lunaSalt }, luna)).status).toBe(400);
    await s.req("POST", `/v1/battles/${id}/reveal`, { round: 1, move: "attack", salt }, bruno);
    const r1 = await s.req("POST", `/v1/battles/${id}/reveal`, { round: 1, move: "guard", salt: lunaSalt }, luna);
    expect(r1.body).toMatchObject({ round: 2, score: { a: 0, b: 1 }, rounds: [{ a: "attack", b: "guard", winner: "b", by: "move" }] });

    // round 2: same move, Luna's tide counters Bruno's blaze
    const r2 = await playRound(s, id, 2, [bruno, "trick"], [luna, "trick"]);
    expect(r2.rounds[1]).toMatchObject({ winner: "b", by: "element" });
    const r3 = await playRound(s, id, 3, [bruno, "attack"], [luna, "trick"]);
    expect(r3.score).toEqual({ a: 1, b: 2 });
    const r4 = await playRound(s, id, 4, [bruno, "trick"], [luna, "attack"]);
    expect(r4).toMatchObject({ status: "done", winner: "b", score: { a: 1, b: 3 } });
    expect(s.food(1)).toBe(7); // 3 + pot of 4
    expect(pings.at(-1)).toMatchObject({ to: brunoId, title: "Luna won the battle" });
    expect(s.food(0)).toBe(3);

    const list = await s.req("GET", "/v1/battles", undefined, luna);
    expect(list.body.record).toEqual({ wins: 1, losses: 0, draws: 0 });
    const board = await s.req("GET", "/v1/battles/leaderboard", undefined, luna);
    expect(board.body.entries.map((e: any) => [e.rank, e.pet_name, e.wins, e.you])).toEqual([[1, "Luna", 1, true], [2, "Bruno", 0, false]]);
  });

  test("async: a player who stops answering loses the rounds as deadlines pass", async () => {
    tick(0);
    const s = setup();
    const a = await s.player(0, "boo", "Boo");
    const b = await s.player(1, "zap", "Zippy");
    const id = (await s.req("POST", "/v1/battles", { stake_food: 1 }, a)).body.id;
    await s.req("POST", `/v1/battles/${id}/join`, undefined, b);
    // A locks in every round; B never shows up again
    for (let round = 1; round <= 3; round++) {
      const salt = crypto.randomUUID();
      expect((await s.req("POST", `/v1/battles/${id}/commit`, { round, hash: await commitHash("guard", salt) }, a)).status).toBe(200);
      tick(ROUND_MS + 1_000);
    }
    const v = await s.req("GET", `/v1/battles/${id}`, undefined, a);
    expect(v.body).toMatchObject({ status: "done", winner: "a", score: { a: 3, b: 0 } });
    expect(v.body.rounds.map((r: any) => [r.a, r.b, r.by])).toEqual([["locked", null, "timeout"], ["locked", null, "timeout"], ["locked", null, "timeout"]]);
    expect(s.food(0)).toBe(6);
  });

  test("refusing to reveal after the opponent locked in loses the round", async () => {
    tick(0);
    const s = setup();
    const a = await s.player(0, "boo", "Boo");
    const b = await s.player(1, "zap", "Zippy");
    const id = (await s.req("POST", "/v1/battles", {}, a)).body.id;
    await s.req("POST", `/v1/battles/${id}/join`, undefined, b);
    const sa = crypto.randomUUID();
    const sb = crypto.randomUUID();
    await s.req("POST", `/v1/battles/${id}/commit`, { round: 1, hash: await commitHash("attack", sa) }, a);
    await s.req("POST", `/v1/battles/${id}/commit`, { round: 1, hash: await commitHash("guard", sb) }, b);
    await s.req("POST", `/v1/battles/${id}/reveal`, { round: 1, move: "guard", salt: sb }, b); // B reveals; A sees guard beats attack and stalls
    tick(ROUND_MS + 1_000);
    const v = await s.req("GET", `/v1/battles/${id}`, undefined, b);
    expect(v.body.rounds[0]).toMatchObject({ a: "locked", b: "guard", winner: "b", by: "timeout" });
  });

  test("quick match pairs two players; cancel refunds an open challenge; dead pets and missing food can't fight", async () => {
    tick(0);
    const s = setup();
    const a = await s.player(0, "neko", "Neko");
    const b = await s.player(1, "pip", "Pip");
    const c = await s.player(2, "goo", "Goo", 0);
    const first = await s.req("POST", "/v1/battles/quick", undefined, a);
    expect(first.body.status).toBe("open");
    expect((await s.req("POST", "/v1/battles/quick", undefined, a)).body.id).toBe(first.body.id); // no duplicate invites
    const second = await s.req("POST", "/v1/battles/quick", undefined, b);
    expect(second.body).toMatchObject({ id: first.body.id, status: "active", you: "b" });

    expect((await s.req("POST", "/v1/battles", { stake_food: 1 }, c)).status).toBe(409); // no food
    const open = await s.req("POST", "/v1/battles", { stake_food: 2 }, a);
    expect(s.food(0)).toBe(3);
    expect((await s.req("POST", `/v1/battles/${open.body.id}/cancel`, undefined, a)).status).toBe(200);
    expect(s.food(0)).toBe(5);

    s.db.query("UPDATE workers SET pet_dead = 1 WHERE wallet = ?").run(wallets[1]);
    expect((await s.req("POST", "/v1/battles/quick", undefined, b)).body.error).toBe("pet_dead");
  });

  test("Scrappy Bot plays every game to the end when nobody else is online, and stays off the leaderboard", async () => {
    tick(0);
    const s = setup();
    const me = await s.player(0, "ember", "Bruno");
    const human: Record<string, (round: number) => string> = {
      duel: (r) => ["attack", "guard", "trick"][r % 3],
      penalty: (r) => ["left:right", "center:left", "right:center"][r % 3],
      cards: (r) => String(r),
      towers: (r) => `${2 + r},0`,
      squad: (r) => ["left:right", "center:left", "right:center"][r % 3],
      fruit: () => "-",
    };
    for (const game of ["duel", "penalty", "cards", "towers", "squad", "fruit"]) {
      const open = await s.req("POST", "/v1/battles/quick", { game }, me);
      expect(open.body).toMatchObject({ status: "open", game });
      const started = await s.req("POST", `/v1/battles/${open.body.id}/bot`, undefined, me);
      expect(started.body).toMatchObject({ status: "active", b: { name: "Scrappy Bot" }, turn: { they_locked: true, next: "lock" } });
      let v = started.body;
      for (let round = 1; v.status === "active" && round <= 5; round++) {
        const move = human[game](round);
        const salt = crypto.randomUUID();
        expect((await s.req("POST", `/v1/battles/${v.id}/commit`, { round, hash: await commitHash(move, salt) }, me)).status).toBe(200);
        const r = await s.req("POST", `/v1/battles/${v.id}/reveal`, { round, move, salt }, me);
        expect(r.status).toBe(200);
        v = r.body;
      }
      expect(v.status).toBe("done");
      expect(["a", "b", "draw"]).toContain(v.winner);
    }
    // a staked challenge can't be handed to the bot
    const staked = await s.req("POST", "/v1/battles", { stake_food: 1 }, me);
    expect((await s.req("POST", `/v1/battles/${staked.body.id}/bot`, undefined, me)).status).toBe(409);
    const board = await s.req("GET", "/v1/battles/leaderboard");
    expect(board.body.entries.every((e: any) => e.pet_name !== "Scrappy Bot")).toBe(true);
  });

  test("a draw refunds both stakes", async () => {
    tick(0);
    const s = setup();
    const a = await s.player(0, "mochi", "Mo"); // spirit
    const b = await s.player(1, "kitsu", "Ki"); // spirit: same element ties
    const id = (await s.req("POST", "/v1/battles", { stake_food: 1 }, a)).body.id;
    await s.req("POST", `/v1/battles/${id}/join`, undefined, b);
    await playRound(s, id, 1, [a, "attack"], [b, "trick"]); // a
    await playRound(s, id, 2, [a, "trick"], [b, "attack"]); // b
    await playRound(s, id, 3, [a, "guard"], [b, "guard"]); // tie
    await playRound(s, id, 4, [a, "guard"], [b, "attack"]); // a
    const end = await playRound(s, id, 5, [a, "attack"], [b, "guard"]); // b
    expect(end).toMatchObject({ status: "done", winner: "draw", score: { a: 2, b: 2 } });
    expect([s.food(0), s.food(1)]).toEqual([5, 5]);
  });
});
