import { describe, expect, test } from "bun:test";
import { fruitSchedule, scoreSlices } from "./fruit";
import { energyFor, KING_HP, scoreGame, TOWER_HP, validMove } from "./games";

const pairs = (list: [string | null, string | null][]) => list.map(([a, b]) => ({ a, b }));

describe("penalty shootout", () => {
  test("a shot scores unless the keeper dives the same way; most goals after 5 wins", () => {
    const s = scoreGame("penalty", pairs([
      ["left:right", "left:center"], // a shoots left, b dives center: goal a. b shoots left, a dives right: goal b
      ["right:left", "center:right"], // a shoots right, b dives right: saved. b shoots center, a dives left: goal b
      ["center:center", "left:left"], // a center vs b dive left: goal a. b left vs a dive center: goal b
    ]), "tide", "tide");
    expect(s.rounds.map((r) => r.detail)).toEqual([
      { a_goal: true, b_goal: true },
      { a_goal: false, b_goal: true },
      { a_goal: true, b_goal: true },
    ]);
    expect(s).toMatchObject({ a: 2, b: 3, done: false });
  });

  test("ends early when the trailing side can't catch up; a no-show keeper concedes", () => {
    const s = scoreGame("penalty", pairs([["left:left", null], ["left:left", null], ["left:left", null]]), "tide", "tide");
    expect(s).toMatchObject({ a: 3, b: 0, done: true, winner: "a" });
  });

  test("moves must be shoot:dive with left/center/right", () => {
    expect(validMove("penalty", "left:right", 1, [])).toBe(true);
    expect(validMove("penalty", "up:right", 1, [])).toBe(false);
    expect(validMove("penalty", "left", 1, [])).toBe(false);
  });
});

describe("card clash", () => {
  test("higher card wins, 1 upsets 5, first to 3", () => {
    const s = scoreGame("cards", pairs([["5", "4"], ["1", "5"], ["3", "3"], ["2", "1"]]), "tide", "tide");
    expect(s.rounds.map((r) => [r.winner, r.by])).toEqual([["a", "higher"], ["a", "upset"], [null, "tie"], ["a", "higher"]]);
    expect(s).toMatchObject({ a: 3, b: 0, done: true, winner: "a" });
  });

  test("each card only once per battle", () => {
    expect(validMove("cards", "3", 2, ["3"])).toBe(false);
    expect(validMove("cards", "4", 2, ["3"])).toBe(true);
    expect(validMove("cards", "6", 1, [])).toBe(false);
  });
});

describe("tower rush", () => {
  test("energy grows each round and a split can't exceed it", () => {
    expect(energyFor(1)).toBe(3);
    expect(validMove("towers", "2,1", 1, [])).toBe(true);
    expect(validMove("towers", "3,1", 1, [])).toBe(false);
    expect(validMove("towers", "7,0", 5, [])).toBe(true);
  });

  test("the bigger push hits the lane tower, overflow hits the king, king down wins", () => {
    // a rushes left every round; b spreads thin
    const s = scoreGame("towers", pairs([["3,0", "1,2"], ["4,0", "2,1"], ["5,0", "0,2"], ["6,0", "3,1"], ["7,0", "3,2"]]), "tide", "tide");
    const hp = (s.state as any).hp;
    // a's left pushes land 2 + 2 + 5 + 3 + 4 = 16: b's left tower (6) falls, the king takes the rest -> 0
    expect(hp.b.left).toBe(0);
    expect(hp.b.king).toBe(0);
    expect(s).toMatchObject({ done: true, winner: "a" });
    // b's right pushes land 2 + 1 + 2 + 1 + 2 = 8: a's right tower (6) falls, 2 spill onto a's king
    expect(hp.a.right).toBe(0);
    expect(hp.a.king).toBe(KING_HP - (8 - TOWER_HP));
  });

  test("after 5 rounds without a king falling, more HP left wins; no-shows push nothing", () => {
    const s = scoreGame("towers", pairs([["1,2", null], ["2,2", "2,2"], ["0,0", "0,0"], ["1,1", "1,1"], ["2,2", "2,2"]]), "tide", "tide");
    expect(s).toMatchObject({ done: true, winner: "a" });
    expect(s.a).toBeGreaterThan(s.b);
  });
});

describe("duel still works through the game layer", () => {
  test("rock-paper-scissors rules unchanged", () => {
    const s = scoreGame("duel", pairs([["attack", "trick"], ["guard", "attack"], ["trick", "guard"]]), "tide", "tide");
    expect(s).toMatchObject({ a: 3, b: 0, done: true, winner: "a" });
  });
});

describe("squad deathmatch", () => {
  test("aim where they moved to score a kill; the zone closes behind you; no-shows stand in the center", () => {
    const s = scoreGame("squad", pairs([
      ["left:right", "right:center"], // a hits b (b went right); b aims center, a went left: miss
      ["center:left", "left:center"], // both hit: firefight
      ["right:center", null], // b no-show stands center: a hits
    ]), "tide", "tide");
    expect(s.rounds.map((r) => r.by)).toEqual(["hit", "firefight", "timeout"]);
    expect(s).toMatchObject({ a: 3, b: 1, done: false });
    expect(validMove("squad", "left:right", 2, ["left:center"])).toBe(false); // can't camp the same zone
    expect(validMove("squad", "center:right", 2, ["left:center"])).toBe(true);
  });

  test("wiping all 4 ends it", () => {
    const s = scoreGame("squad", pairs([["left:right", "right:left"], ["center:left", "left:right"], ["right:right", "right:center"], ["left:right", "right:center"]]), "tide", "tide");
    expect(s.a).toBe(4);
    expect(s).toMatchObject({ done: true, winner: "a" });
  });
});

describe("fruit slash", () => {
  test("both players get the same pattern; the server scores the slice log itself", () => {
    const sched = fruitSchedule("battle-1", 1);
    expect(fruitSchedule("battle-1", 1)).toEqual(sched); // deterministic
    expect(fruitSchedule("battle-1", 2)).not.toEqual(sched);
    const fruits = sched.filter((f) => f.kind === "fruit").slice(0, 3);
    const bomb = sched.find((f) => f.kind === "bomb")!;
    const at = (f: { id: number; t: number; life: number }) => `${f.id}.${Math.floor((f.t + f.life / 2) / 10)}`;
    const log = [...fruits, bomb].sort((x, y) => x.t + x.life / 2 - (y.t + y.life / 2)).map(at).join(",");
    expect(scoreSlices(sched, log)).toBe(Math.max(0, 3 - 3));
    expect(scoreSlices(sched, fruits.map(at).join(","))).toBe(3);
    expect(scoreSlices(sched, "-")).toBe(0);
  });

  test("impossible logs are rejected: unknown fruit, twice, off-screen, out of order", () => {
    const sched = fruitSchedule("battle-2", 1);
    const f = sched[0];
    const mid = Math.floor((f.t + f.life / 2) / 10);
    expect(scoreSlices(sched, `999.${mid}`)).toBeNull();
    expect(scoreSlices(sched, `${f.id}.${mid},${f.id}.${mid + 1}`)).toBeNull();
    expect(scoreSlices(sched, `${f.id}.${Math.floor((f.t + f.life + 2000) / 10)}`)).toBeNull();
    const g = sched[3];
    expect(scoreSlices(sched, `${g.id}.${Math.floor((g.t + g.life / 2) / 10)},${f.id}.${mid}`)).toBeNull();
    expect(validMove("fruit", "999.10", 1, [], "battle-2")).toBe(false);
  });

  test("higher score takes the round, best of 3", () => {
    const logFor = (id: string, round: number, n: number) =>
      fruitSchedule(id, round).filter((f) => f.kind === "fruit").slice(0, n).map((f) => `${f.id}.${Math.floor((f.t + f.life / 2) / 10)}`).join(",") || "-";
    const s = scoreGame("fruit", [{ a: logFor("b3", 1, 5), b: logFor("b3", 1, 2) }, { a: logFor("b3", 2, 4), b: logFor("b3", 2, 1) }], "tide", "tide", "b3");
    expect(s).toMatchObject({ a: 2, b: 0, done: true, winner: "a" });
    expect(s.rounds[0].detail).toEqual({ a_points: 5, b_points: 2 });
  });
});
