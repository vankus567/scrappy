// Deploy scrappy_arcade.so to devnet via the upgradeable loader, no CLI needed.
// Sequence: buffer account -> chunked writes -> program account -> deploy.
// Usage: bun scripts/deploy-arcade.mjs
import { Connection, Keypair, PublicKey, SystemProgram, SYSVAR_CLOCK_PUBKEY, SYSVAR_RENT_PUBKEY, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { readFileSync } from "node:fs";

const LOADER = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
const RPC = "https://api.devnet.solana.com";
const conn = new Connection(RPC, "confirmed");

const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync("target/deploy/deployer-keypair.json", "utf8"))));
const program = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync("target/deploy/scrappy_arcade-keypair.json", "utf8"))));
const so = readFileSync("target/deploy/scrappy_arcade.so");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// bincode-serialized loader instructions
const ixData = (tag, extra) => Buffer.concat([Buffer.from(Uint32Array.of(tag).buffer), extra]);
const initBufferIx = (buffer, authority) => ({
  programId: LOADER,
  keys: [
    { pubkey: buffer, isSigner: false, isWritable: true },
    { pubkey: authority, isSigner: false, isWritable: false },
  ],
  data: ixData(0, authority.toBuffer()),
});
const writeIx = (buffer, offset, bytes, authority) => ({
  programId: LOADER,
  keys: [
    { pubkey: buffer, isSigner: false, isWritable: true },
    { pubkey: authority, isSigner: true, isWritable: false },
  ],
  data: ixData(1, Buffer.concat([Buffer.from(Uint32Array.of(offset).buffer), Buffer.from(BigUint64Array.of(BigInt(bytes.length)).buffer), bytes])),
});
const deployIx = (programData, buffer, authority, payerKey, programKey, maxLen) => ({
  programId: LOADER,
  keys: [
    { pubkey: payerKey, isSigner: true, isWritable: true },
    { pubkey: programData, isSigner: false, isWritable: true },
    { pubkey: programKey, isSigner: false, isWritable: true },
    { pubkey: buffer, isSigner: false, isWritable: true },
    { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: authority, isSigner: true, isWritable: false },
  ],
  data: ixData(2, Buffer.from(Uint32Array.of(maxLen).buffer)),
});

async function fund() {
  const need = 4_000_000_000;
  const bal = await conn.getBalance(payer.publicKey);
  console.log(`deployer ${payer.publicKey.toBase58()} balance ${(bal / 1e9).toFixed(2)} SOL`);
  while ((await conn.getBalance(payer.publicKey)) < need) {
    try {
      const sig = await conn.requestAirdrop(payer.publicKey, 2_000_000_000);
      await conn.confirmTransaction(sig, "confirmed");
      console.log("airdropped 2 SOL");
    } catch {
      console.log("airdrop rate-limited, waiting 20s");
      await sleep(20000);
    }
  }
}

async function main() {
  console.log(`program ${program.publicKey.toBase58()}, so ${so.length} bytes`);
  await fund();

  const bufHeader = 37;
  const bufferSize = bufHeader + so.length;
  const bufferKP = Keypair.generate();
  const bufferRent = await conn.getMinimumBalanceForRentExemption(bufferSize);
  await sendAndConfirmTransaction(conn, new Transaction().add(
    SystemProgram.createAccount({ fromPubkey: payer.publicKey, newAccountPubkey: bufferKP.publicKey, lamports: bufferRent, space: bufferSize, programId: LOADER }),
    initBufferIx(bufferKP.publicKey, payer.publicKey),
  ), [payer, bufferKP]);
  console.log("buffer created");

  const CHUNK = 1000;
  for (let off = 0; off < so.length; off += CHUNK) {
    const chunk = so.subarray(off, Math.min(off + CHUNK, so.length));
    await sendAndConfirmTransaction(conn, new Transaction().add(writeIx(bufferKP.publicKey, off, chunk, payer.publicKey)), [payer]);
    if (off % 20000 === 0) console.log(`wrote ${off}/${so.length}`);
  }
  console.log("buffer written");

  const progAcctSize = 36;
  const progRent = await conn.getMinimumBalanceForRentExemption(progAcctSize);
  await sendAndConfirmTransaction(conn, new Transaction().add(
    SystemProgram.createAccount({ fromPubkey: payer.publicKey, newAccountPubkey: program.publicKey, lamports: progRent, space: progAcctSize, programId: LOADER }),
  ), [payer, program]);
  const [programData] = PublicKey.findProgramAddressSync([program.publicKey.toBuffer()], LOADER);
  const maxLen = so.length * 2;
  await sendAndConfirmTransaction(conn, new Transaction().add(deployIx(programData, bufferKP.publicKey, payer.publicKey, payer.publicKey, program.publicKey, maxLen)), [payer]);
  console.log(`DEPLOYED: ${program.publicKey.toBase58()}`);
  console.log(`explorer: https://explorer.solana.com/address/${program.publicKey.toBase58()}?cluster=devnet`);
}

main().catch((e) => { console.error(e); process.exit(1); });
