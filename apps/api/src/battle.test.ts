import { describe, expect, test } from "bun:test";
import { commitHash, elementOf, type Move, resolveRound, score, SPECIES_ELEMENT, verifyReveal } from "./battle";

describe("battle rules", () => {
  test("attack beats trick, trick beats guard, guard beats attack", () => {
    expect(resolveRound(1, "attack", "trick", "tide", "tide").winner).toBe("a");
    expect(resolveRound(1, "trick", "guard", "tide", "tide").winner).toBe("a");
    expect(resolveRound(1, "guard", "attack", "tide", "tide").winner).toBe("a");
    expect(resolveRound(1, "trick", "attack", "tide", "tide")).toMatchObject({ winner: "b", by: "move" });
  });

  test("same move: element counter wins, same element ties", () => {
    expect(resolveRound(1, "guard", "guard", "tide", "blaze")).toMatchObject({ winner: "a", by: "element" });
    expect(resolveRound(1, "guard", "guard", "blaze", "spirit")).toMatchObject({ winner: "a", by: "element" });
    expect(resolveRound(1, "guard", "guard", "spirit", "tide")).toMatchObject({ winner: "a", by: "element" });
    expect(resolveRound(1, "attack", "attack", "blaze", "tide")).toMatchObject({ winner: "b", by: "element" });
    expect(resolveRound(1, "trick", "trick", "blaze", "blaze")).toMatchObject({ winner: null, by: "tie" });
  });

  test("a missed move loses the round; both missing is a tie", () => {
    expect(resolveRound(2, null, "guard", "tide", "tide")).toMatchObject({ winner: "b", by: "timeout" });
    expect(resolveRound(2, "guard", null, "tide", "tide")).toMatchObject({ winner: "a", by: "timeout" });
    expect(resolveRound(2, null, null, "tide", "tide")).toMatchObject({ winner: null, by: "tie" });
  });

  test("first to 3 wins ends the battle early", () => {
    const moves: { a: Move; b: Move }[] = [
      { a: "attack", b: "trick" },
      { a: "guard", b: "attack" },
      { a: "trick", b: "guard" },
      { a: "trick", b: "attack" }, // never counted
    ];
    const s = score(moves, "tide", "tide");
    expect(s).toMatchObject({ a: 3, b: 0, done: true, winner: "a" });
    expect(s.rounds).toHaveLength(3);
  });

  test("unfinished battle has no winner yet", () => {
    expect(score([{ a: "attack", b: "trick" }], "tide", "tide")).toMatchObject({ a: 1, b: 0, done: false, winner: null });
  });

  test("5 rounds with more wins takes it; equal wins is a draw", () => {
    const tieish: { a: Move; b: Move }[] = [
      { a: "attack", b: "trick" }, // a
      { a: "trick", b: "attack" }, // b
      { a: "guard", b: "guard" }, // tie (same element)
      { a: "guard", b: "attack" }, // a
      { a: "attack", b: "guard" }, // b
    ];
    expect(score(tieish, "spirit", "spirit")).toMatchObject({ a: 2, b: 2, done: true, winner: "draw" });
    const aAhead = [...tieish.slice(0, 4), { a: "guard" as Move, b: "guard" as Move }];
    expect(score(aAhead, "spirit", "spirit")).toMatchObject({ a: 2, b: 1, done: true, winner: "a" });
  });

  test("every species has an element, 4 per element", () => {
    const counts = Object.values(SPECIES_ELEMENT).reduce<Record<string, number>>((m, e) => ({ ...m, [e]: (m[e] ?? 0) + 1 }), {});
    expect(counts).toEqual({ blaze: 4, tide: 4, spirit: 4 });
    expect(elementOf("ember")).toBe("blaze");
    expect(elementOf(undefined)).toBe("spirit");
  });
});

describe("commit-reveal", () => {
  test("a reveal must match the committed hash", async () => {
    const salt = "0123456789abcdef0123";
    const h = await commitHash("guard", salt);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(await verifyReveal(h, "guard", salt)).toBe(true);
    expect(await verifyReveal(h, "attack", salt)).toBe(false); // changed move after seeing the other
    expect(await verifyReveal(h, "guard", "0123456789abcdef9999")).toBe(false);
    expect(await verifyReveal(h, "guard", "short")).toBe(false);
    expect(await verifyReveal(h, "punch", salt)).toBe(false);
  });
});
