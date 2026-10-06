// Live check of the on-chain save card against devnet, using the same client code the console ships.
//   1. a fresh play key writes 500, then 120: the card keeps best = 500 and counts 2 plays
//   2. a second key tries to write into the first key's card: the program must refuse
// Usage: cd apps/web && bun scripts/savecard-e2e.ts   (pays from ~/.config/solana/id.json, about 0.01 devnet SOL)
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import {
  AccountRole,
  appendTransactionMessageInstructions,
  createKeyPairSignerFromBytes,
  createTransactionMessage,
  generateKeyPairSigner,
  getBase64EncodedWireTransaction,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type TransactionSigner,
} from "@solana/kit";
import { getTransferSolInstruction } from "@solana-program/system";
import { readSaveCard, recordScore, rpc } from "../src/lib/scrappyboy/chain";
import { ARCADE_PROGRAM, recordScoreData, saveCardAddress } from "../src/lib/scrappyboy/savecard";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function sendRaw(payer: TransactionSigner, ixs: Parameters<typeof appendTransactionMessageInstructions>[0]) {
  const { value: bh } = await rpc.getLatestBlockhash().send();
  const msg = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(payer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(bh, m),
    (m) => appendTransactionMessageInstructions(ixs, m),
  );
  const tx = await signTransactionMessageWithSigners(msg);
  const sig = await rpc.sendTransaction(getBase64EncodedWireTransaction(tx), { encoding: "base64" }).send();
  for (let i = 0; i < 60; i++) {
    await sleep(1000);
    const s = (await rpc.getSignatureStatuses([sig]).send()).value[0];
    if (s?.err) throw new Error(JSON.stringify(s.err));
    if (s?.confirmationStatus === "confirmed" || s?.confirmationStatus === "finalized") return sig;
  }
  throw new Error("not confirmed");
}

const bank = await createKeyPairSignerFromBytes(
  Uint8Array.from(JSON.parse(readFileSync(`${homedir()}/.config/solana/id.json`, "utf8"))),
);
const alice = await generateKeyPairSigner();
const mallory = await generateKeyPairSigner();
console.log("program       ", ARCADE_PROGRAM);
console.log("play key      ", alice.address);
console.log("other key     ", mallory.address);

const fund = await sendRaw(bank, [
  getTransferSolInstruction({ source: bank, destination: alice.address, amount: BigInt(5_000_000) }),
  getTransferSolInstruction({ source: bank, destination: mallory.address, amount: BigInt(5_000_000) }),
]);
console.log("fund both     ", fund);

const s1 = await recordScore(alice, 500);
console.log("write 500     ", s1);
const s2 = await recordScore(alice, 120);
console.log("write 120     ", s2);

const card = await readSaveCard(alice.address);
console.log("card          ", JSON.stringify(card));
const ok1 = card?.best === 500 && card.last === 120 && card.plays === 2 && card.player === alice.address;
console.log(ok1 ? "PASS  best kept at 500 after a lower round, 2 plays" : "FAIL  card state wrong");

// Mallory signs, but points the instruction at Alice's card.
let refused = false;
try {
  await sendRaw(mallory, [
    {
      programAddress: ARCADE_PROGRAM,
      accounts: [
        { address: await saveCardAddress(alice.address), role: AccountRole.WRITABLE },
        { address: mallory.address, role: AccountRole.WRITABLE_SIGNER },
        { address: "11111111111111111111111111111111" as never, role: AccountRole.READONLY },
      ],
      data: recordScoreData(999_999),
    },
  ]);
} catch (e) {
  // Refused for the right reason: Anchor's seeds check (2006), not a fee or funding error.
  const logs: string[] = ((e as { cause?: { logs?: string[] } }).cause?.logs ?? (e as { context?: { logs?: string[] } }).context?.logs) ?? [];
  const why = logs.find((l) => l.includes("Error Code")) ?? (e as Error).message;
  refused = why.includes("ConstraintSeeds");
  console.log("forged write  refused:", why.slice(0, 140));
}
const after = await readSaveCard(alice.address);
const ok2 = refused && after?.best === 500;
console.log(ok2 ? "PASS  another key cannot write into this card" : "FAIL  forged write landed");
process.exit(ok1 && ok2 ? 0 : 1);
