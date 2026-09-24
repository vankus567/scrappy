// A real script agent: pays the Human API through x402 (devnet USDC) and prints the human answer.
import { wrapFetchWithPayment, x402HTTPClient } from "@x402/fetch";
import { x402Client } from "@x402/core/client";
import { ExactSvmScheme } from "@x402/svm/exact/client";
import { createKeyPairSignerFromBytes } from "@solana/kit";
import { base58 } from "@scure/base";
import { readFileSync } from "node:fs";

const API = process.env.SCRAPPY_API ?? "http://localhost:8787";
const keyFile = new URL("../.keys/agent.json", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const { secret, address } = JSON.parse(readFileSync(keyFile, "utf8"));

const signer = await createKeyPairSignerFromBytes(base58.decode(secret));
const client = new x402Client();
client.register("solana:*", new ExactSvmScheme(signer));
const pay = wrapFetchWithPayment(fetch, client);
const http = new x402HTTPClient(client);

console.log(`agent ${address} asking a human...`);
const res = await pay(`${API}/v1/human/verify`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    task: process.argv[2] ?? "Which answer is factually correct?",
    options: ["A: The Pacific is the largest ocean", "B: The Atlantic is the largest ocean"],
    requirements: { language: "en", max_latency: 30 },
  }),
});
const result = await http.processResponse(res);
console.log("status:", res.status, "payment:", result.paymentStatus);
console.log("payment header:", result.header);
console.log("human answer:", result.body);
