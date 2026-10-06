import {
  type Address,
  AccountRole,
  address,
  getAddressDecoder,
  getAddressEncoder,
  getProgramDerivedAddress,
  type Instruction,
} from "@solana/kit";

/**
 * The on-chain save card: one PDA per play key, written by the `scrappy_arcade` program.
 * The program keeps the best score itself (it only raises `best`, never lowers it), so the
 * card is a record the device cannot quietly rewrite downward or reset.
 *
 * Encoding is hand-rolled from the program's Anchor layout so the web bundle does not pull
 * in Anchor; the tests pin every byte against the program's discriminators.
 */
export const ARCADE_PROGRAM = address("DygzrTDfuuM8UYVRHkYvqkpfFN6G4AgnTEHSJYqyFRb2");
const SYSTEM_PROGRAM = address("11111111111111111111111111111111");

/** sha256("global:record_score")[0..8] */
export const RECORD_SCORE_IX = Uint8Array.from([30, 181, 94, 137, 7, 160, 236, 158]);
/** sha256("account:SaveCard")[0..8] */
export const SAVE_CARD_ACCOUNT = Uint8Array.from([38, 227, 106, 101, 249, 109, 121, 131]);
/** 8 discriminator + 32 player + 4 best + 4 last + 4 plays + 8 updated_at + 1 bump */
export const SAVE_CARD_LEN = 61;
/** u32 on-chain: anything above wraps, so the client refuses rather than writing a wrong number. */
export const MAX_SCORE = 0xffff_ffff;

export interface SaveCard {
  player: Address;
  best: number;
  last: number;
  plays: number;
  updatedAt: number;
}

export async function saveCardAddress(player: Address): Promise<Address> {
  const [pda] = await getProgramDerivedAddress({
    programAddress: ARCADE_PROGRAM,
    seeds: [new TextEncoder().encode("save_card"), getAddressEncoder().encode(player)],
  });
  return pda;
}

export function recordScoreData(score: number): Uint8Array {
  if (!Number.isInteger(score) || score < 0 || score > MAX_SCORE) throw new Error(`score out of range: ${score}`);
  const out = new Uint8Array(12);
  out.set(RECORD_SCORE_IX, 0);
  new DataView(out.buffer).setUint32(8, score, true);
  return out;
}

export async function recordScoreIx(player: Address, score: number): Promise<Instruction> {
  return {
    programAddress: ARCADE_PROGRAM,
    accounts: [
      { address: await saveCardAddress(player), role: AccountRole.WRITABLE },
      { address: player, role: AccountRole.WRITABLE_SIGNER },
      { address: SYSTEM_PROGRAM, role: AccountRole.READONLY },
    ],
    data: recordScoreData(score),
  };
}

/** Decode a save card account. Anything that is not exactly our account type reads as null. */
export function decodeSaveCard(data: Uint8Array): SaveCard | null {
  if (data.length < SAVE_CARD_LEN) return null;
  for (let i = 0; i < 8; i++) if (data[i] !== SAVE_CARD_ACCOUNT[i]) return null;
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return {
    player: getAddressDecoder().decode(data.subarray(8, 40)),
    best: v.getUint32(40, true),
    last: v.getUint32(44, true),
    plays: v.getUint32(48, true),
    updatedAt: Number(v.getBigInt64(52, true)),
  };
}

