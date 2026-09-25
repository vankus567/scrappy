// Creates devnet wallets for the platform and a test agent. Secrets stay in .keys/ (gitignored).
import { generateKeyPairSync } from "node:crypto";
import { base58 } from "@scure/base";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const RPC = process.env.SOLANA_RPC ?? "https://api.devnet.solana.com";
// fileURLToPath decodes %20 etc.; URL.pathname does not (paths with spaces broke)
const DIR = fileURLToPath(new URL("../.keys/", import.meta.url));
mkdirSync(DIR, { recursive: true });

function makeKey() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const priv = privateKey.export({ format: "der", type: "pkcs8" }).subarray(-32);
  const pub = publicKey.export({ format: "der", type: "spki" }).subarray(-32);
  return { address: base58.encode(pub), secret: base58.encode(new Uint8Array([...priv, ...pub])) };
}

async function airdrop(address: string, sol = 1) {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "requestAirdrop", params: [address, sol * 1e9] }),
  });
  const j: any = await res.json();
  return j.result ?? `airdrop failed: ${j.error?.message ?? "unknown"}`;
}

for (const name of ["platform", "agent"]) {
  const file = DIR + name + ".json";
  if (!existsSync(file)) writeFileSync(file, JSON.stringify(makeKey(), null, 2));
  const { address } = JSON.parse(readFileSync(file, "utf8"));
  console.log(`${name.padEnd(9)} ${address}  airdrop: ${await airdrop(address)}`);
}
console.log("\nNext: fund the AGENT with devnet USDC at https://faucet.circle.com (network: Solana Devnet).");
