import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { address, getAddressEncoder } from "@solana/kit";
import {
  decodeSaveCard,
  MAX_SCORE,
  RECORD_SCORE_IX,
  recordScoreData,
  recordScoreIx,
  SAVE_CARD_ACCOUNT,
  SAVE_CARD_LEN,
  saveCardAddress,
} from "./savecard";

const PLAYER = address("3jk1NY1Vyvkr3wiLSUoe4Z9Tn1GD6ikFZ9NeVNi7ZJnM");
const disc = (s: string) => Array.from(createHash("sha256").update(s).digest().subarray(0, 8));

function card(best: number, last: number, plays: number, ts: bigint): Uint8Array {
  const b = new Uint8Array(SAVE_CARD_LEN);
  b.set(SAVE_CARD_ACCOUNT, 0);
  b.set(getAddressEncoder().encode(PLAYER), 8);
  const v = new DataView(b.buffer);
  v.setUint32(40, best, true);
  v.setUint32(44, last, true);
  v.setUint32(48, plays, true);
  v.setBigInt64(52, ts, true);
  b[60] = 254;
  return b;
}

describe("save card encoding", () => {
  test("the instruction and account tags match the program's Anchor discriminators", () => {
    expect(Array.from(RECORD_SCORE_IX)).toEqual(disc("global:record_score"));
    expect(Array.from(SAVE_CARD_ACCOUNT)).toEqual(disc("account:SaveCard"));
  });

  test("a score is written as a little-endian u32 after the tag", () => {
    const d = recordScoreData(1240);
    expect(d.length).toBe(12);
    expect(new DataView(d.buffer).getUint32(8, true)).toBe(1240);
  });

  test("a score that does not fit a u32 is refused, not wrapped", () => {
    expect(() => recordScoreData(MAX_SCORE + 1)).toThrow();
    expect(() => recordScoreData(-1)).toThrow();
    expect(() => recordScoreData(1.5)).toThrow();
  });

  test("the card lives at one address per player, and the play key signs and pays", async () => {
    const pda = await saveCardAddress(PLAYER);
    expect(await saveCardAddress(PLAYER)).toBe(pda);
    const ix = await recordScoreIx(PLAYER, 7);
    expect(ix.accounts?.[0]?.address).toBe(pda);
    expect(ix.accounts?.[1]?.address).toBe(PLAYER);
    expect(ix.accounts?.[1]?.role).toBe(3); // WRITABLE_SIGNER
  });

  test("a stored card decodes field by field", () => {
    const c = decodeSaveCard(card(900, 120, 14, BigInt(1_791_300_000)));
    expect(c).toEqual({ player: PLAYER, best: 900, last: 120, plays: 14, updatedAt: 1_791_300_000 });
  });

  test("some other account at that address reads as no card, not a fake score", () => {
    const wrong = card(900, 120, 14, BigInt(0));
    wrong[0] ^= 1;
    expect(decodeSaveCard(wrong)).toBeNull();
    expect(decodeSaveCard(new Uint8Array(20))).toBeNull();
  });
});
