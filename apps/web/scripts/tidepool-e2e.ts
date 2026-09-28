// End-to-end proof on devnet: every game action is a real Orca transaction.
// Usage: bun scripts/tidepool-e2e.ts [path-to-keypair.json]
import { createKeyPairSignerFromBytes, generateKeyPairSigner } from "@solana/kit";
import { creatures, eat, explorer, foodInBowl, hatch, pickPool, release, solBalance, starterFood } from "../src/lib/tidepool/chain";

const keyPath = process.argv[2] ?? `${process.env.TMP ?? "/tmp"}/tidepool-e2e-key.json`;
const file = Bun.file(keyPath);
let signer;
if (await file.exists()) {
  signer = await createKeyPairSignerFromBytes(new Uint8Array(await file.json()));
} else {
  const kp = await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]) as CryptoKeyPair;
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", kp.privateKey));
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey));
  const bytes = new Uint8Array([...pkcs8.slice(-32), ...raw]);
  await Bun.write(keyPath, JSON.stringify([...bytes]));
  signer = await createKeyPairSignerFromBytes(bytes);
}
void generateKeyPairSigner;
console.log("player", signer.address);

let bal = await solBalance(signer.address);
if (bal < 300_000_000n) {
  console.log("airdrop:", explorer(await starterFood(signer.address, 1)));
  bal = await solBalance(signer.address);
}
console.log("balance SOL", Number(bal) / 1e9);

const pool = await pickPool();
console.log("pool", pool.address, "price", pool.price.toFixed(4));

const h = await hatch(signer, pool, 0.2, { low: pool.price * 0.95, high: pool.price * 1.05 });
console.log("hatched", h.mint, "\n swap", explorer(h.swapSig), "\n open", explorer(h.openSig));

const mine = await creatures(signer.address);
const c = mine.find((x) => x.mint === h.mint)!;
console.log("creature band", c.lowerPrice.toFixed(4), "-", c.upperPrice.toFixed(4), "liquidity", c.liquidity.toString());
console.log("food", await foodInBowl(signer, c, pool.solIsA));
console.log("eat", explorer(await eat(signer, c)));
console.log("release", explorer(await release(signer, c)));
console.log("left", (await creatures(signer.address)).length, "creatures; balance", Number(await solBalance(signer.address)) / 1e9);
