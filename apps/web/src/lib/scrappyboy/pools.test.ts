import { describe, expect, test } from "bun:test";
import { address } from "@solana/kit";
import { type MapPool, nextPin } from "./pools";

const pin = (i: number, safety: number, heat: number): MapPool => ({
  // nextPin only reads safety/heat; a distinct valid base58 address is all it needs
  address: address(`${"1".repeat(31)}${i + 2}`),
  label: `P${i}`,
  feeRate: 500,
  tvl: 0,
  vol24: 0,
  safety,
  heat,
});

// safety runs left->right (risky->safe), heat runs bottom->top (calm->hot)
const pins = [
  pin(0, 10, 10), // bottom-left
  pin(1, 50, 10), // bottom-middle
  pin(2, 90, 10), // bottom-right
  pin(3, 90, 90), // top-right
  pin(4, 10, 90), // top-left
];

describe("nextPin map cursor", () => {
  test("RIGHT moves toward safer pools", () => {
    expect(nextPin(pins, 0, "RIGHT")).toBe(1); // nearest rightward pin
    expect(nextPin(pins, 1, "RIGHT")).toBe(2);
  });
  test("UP moves toward hotter pools", () => {
    expect(nextPin(pins, 2, "UP")).toBe(3);
    expect(nextPin(pins, 0, "UP")).toBe(4);
  });
  test("the cursor never points off the map", () => {
    for (let i = 0; i < pins.length; i++) {
      for (const d of ["UP", "DOWN", "LEFT", "RIGHT"] as const) {
        const j = nextPin(pins, i, d);
        expect(j).toBeGreaterThanOrEqual(0);
        expect(j).toBeLessThan(pins.length);
      }
    }
  });
  test("at the edge it wraps through the list instead of sticking", () => {
    // pin 3 is the rightmost-and-hottest: nothing strictly right or up of it
    const j = nextPin(pins, 3, "RIGHT");
    expect(j).not.toBe(3);
  });
  test("empty or missing cursor returns it unchanged", () => {
    expect(nextPin(pins, 99, "LEFT")).toBe(99);
    expect(nextPin([], 0, "RIGHT")).toBe(0);
  });
});
