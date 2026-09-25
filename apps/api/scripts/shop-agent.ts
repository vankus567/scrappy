// A real agent that gets stuck and hires a human through Scrappy.
// ShopBot has to answer "is this item in stock at this shop today?" and has no data source for it, so it asks
// a human in that city to call the shop, waits for the answer, decides, and tells the human what it did.
//
//   SCRAPPY_API=https://scrappypet.vercel.app SCRAPPY_KEY=scrappy_sk_... bun scripts/shop-agent.ts \
//     --item "Amul butter 500g" --shop "Sai Kirana, FC Road" --phone "+91 20 2553 1234" --city Pune
//
// Needs a project API key with prepaid balance (see /dev). Every task is a real paid task.
const API = (process.env.SCRAPPY_API ?? "http://localhost:8787").replace(/\/$/, "");
const KEY = process.env.SCRAPPY_KEY;
if (!KEY) throw new Error("Set SCRAPPY_KEY to a project API key");

const arg = (name: string, fallback?: string) => {
  const i = process.argv.indexOf(`--${name}`);
  const v = i > -1 ? process.argv[i + 1] : fallback;
  if (!v) throw new Error(`Missing --${name}`);
  return v;
};
const item = arg("item");
const shop = arg("shop");
const phone = arg("phone");
const city = arg("city");
const language = arg("language", "en");

const call = async (path: string, init: RequestInit = {}) => {
  const res = await fetch(`${API}${path}`, { ...init, headers: { "content-type": "application/json", authorization: `Bearer ${KEY}`, ...init.headers } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path} ${res.status}: ${JSON.stringify(body)}`);
  return body as any;
};

console.log(`ShopBot: a user wants ${item} from ${shop}. The shop has no website or stock feed.`);
console.log("ShopBot: confidence the item is in stock: unknown. Asking a human in", city);

const task = await call("/v1/tasks", {
  method: "POST",
  body: JSON.stringify({
    task: `Call ${shop} and ask: is ${item} in stock today? Type what they said (yes/no and how many).`,
    kind: "call",
    phone,
    city,
    language,
    agent: { name: "ShopBot", reason: `A customer wants ${item}, and ${shop} has no website or live stock info.` },
    response_schema: { type: "text", max_length: 200 },
    budget: 0.2,
    deadline: 600,
  }),
});
console.log(`ShopBot: task ${task.task_id} is live. Waiting for a human...`);

let result: any;
for (;;) {
  result = await call(`/v1/tasks/${task.task_id}?wait=25`);
  if (!["matching", "collecting", "pending_payment"].includes(result.status)) break;
}

if (result.status !== "completed") {
  console.log(`ShopBot: no answer (${result.status}). Refunded $${result.refund_usdc}. Telling the customer we could not confirm.`);
  process.exit(0);
}

const said = String(result.answer);
const inStock = /\b(yes|available|in stock|have)\b/i.test(said) && !/\b(no|not|out of stock)\b/i.test(said);
console.log(`ShopBot: the human called and said "${said}" (${Math.round((result.latency_ms ?? 0) / 1000)} s).`);
const outcome = inStock ? `Confirmed in stock. Told the customer to pick up ${item} at ${shop}.` : `Not in stock. Sent the customer to another shop instead.`;
await call(`/v1/tasks/${task.task_id}/outcome`, { method: "POST", body: JSON.stringify({ outcome }) });
console.log(`ShopBot: ${outcome}`);

export {};
