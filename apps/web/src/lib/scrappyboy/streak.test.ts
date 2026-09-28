import { beforeEach, describe, expect, test } from "bun:test";
import { bumpStreak, readStreak } from "./streak";

const store = new Map<string, string>();
// minimal localStorage stub: the game only calls getItem/setItem on it
globalThis.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: () => null,
  get length() {
    return store.size;
  },
} as Storage;

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

describe("daily streak", () => {
  beforeEach(() => store.clear());

  test("a fresh player starts at zero", () => {
    expect(readStreak()).toEqual({ day: "", count: 0 });
  });

  test("first round of the day starts the streak at 1", () => {
    expect(bumpStreak()).toBe(1);
    expect(readStreak()).toEqual({ day: today(), count: 1 });
  });

  test("playing twice in one day does not double-count", () => {
    bumpStreak();
    expect(bumpStreak()).toBe(1);
  });

  test("yesterday's streak continues today", () => {
    store.set("scrappyboy.streak", JSON.stringify({ day: daysAgo(1), count: 4 }));
    expect(bumpStreak()).toBe(5);
    expect(readStreak().day).toBe(today());
  });

  test("a gap day resets the streak", () => {
    store.set("scrappyboy.streak", JSON.stringify({ day: daysAgo(2), count: 9 }));
    expect(readStreak().count).toBe(0);
    expect(bumpStreak()).toBe(1);
  });

  test("corrupt storage reads as zero, not a crash", () => {
    store.set("scrappyboy.streak", "{not json");
    expect(readStreak().count).toBe(0);
  });
});
