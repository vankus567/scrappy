import { describe, expect, test } from "bun:test";
import { autoSellAt, fmtPrice, fmtUsd, lamportsForUsd } from "./meme";

describe("fmtPrice", () => {
  test("dollar-priced coins get three decimals", () => {
    expect(fmtPrice(119.921019)).toBe("119.921");
    expect(fmtPrice(1)).toBe("1.000");
  });
  test("sub-dollar coins get four decimals", () => {
    expect(fmtPrice(0.123456)).toBe("0.1235");
    expect(fmtPrice(0.01)).toBe("0.0100");
  });
  test("meme-coin dust keeps precision instead of collapsing to 0.0000", () => {
    expect(fmtPrice(0.000003504387)).toBe("0.00000350");
    expect(fmtPrice(3.5e-9)).toBe("3.50e-9");
  });
});

describe("fmtUsd", () => {
  test("signed, two decimals", () => {
    expect(fmtUsd(10)).toBe("$10.00");
    expect(fmtUsd(-2.5)).toBe("-$2.50");
    expect(fmtUsd(0)).toBe("$0.00");
  });
});

describe("lamportsForUsd", () => {
  test("converts a dollar stake into lamports at the live SOL price", () => {
    // $10 at $120/SOL = 0.0833... SOL
    expect(lamportsForUsd(10, 120)).toBe(BigInt(83_333_333));
    expect(lamportsForUsd(1, 100)).toBe(BigInt(10_000_000));
  });
  test("a dead price feed buys nothing", () => {
    expect(lamportsForUsd(10, 0)).toBe(BigInt(0));
    expect(lamportsForUsd(10, -1)).toBe(BigInt(0));
  });
});

describe("autoSellAt", () => {
  test("the safety net fires at -8% or worse", () => {
    expect(autoSellAt(-0.09)).toBe("SAFETY NET CAUGHT YOU");
    expect(autoSellAt(-0.08)).toBe("SAFETY NET CAUGHT YOU");
  });
  test("the treasure line fires at +15% or better", () => {
    expect(autoSellAt(0.16)).toBe("TREASURE FOUND");
    expect(autoSellAt(0.15)).toBe("TREASURE FOUND");
  });
  test("a coin drifting inside the band stays open", () => {
    expect(autoSellAt(0)).toBeNull();
    expect(autoSellAt(-0.079)).toBeNull();
    expect(autoSellAt(0.149)).toBeNull();
  });
});
