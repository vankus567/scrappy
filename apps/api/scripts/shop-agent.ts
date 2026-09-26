// A real agent that gets stuck and hires a human through Scrappy.
// ShopBot has to answer "is this item in stock at this shop today?" and has no data source for it, so it hires
// a human: either to walk into the shop and photograph the shelf (proof: photo + GPS), or to call the shop.
//
//   On site (photo + GPS proof, the default when --lat/--lng are given):
//   SCRAPPY_API=https://scrappypet.vercel.app SCRAPPY_KEY=scrappy_sk_... bun scripts/shop-agent.ts \
//     --item "Amul butter 500g" --shop "Reliance Smart, Mangalagiri" --lat 16.4307 --lng 80.5525
//
//   By phone:
//   ... bun scripts/shop-agent.ts --item "Amul butter 500g" --shop "Sai Kirana, FC Road" --phone "+91 20 2553 1234" --city Pune
//
// Needs a project API key with prepaid balance (see /dev). Every task is a real paid task.
const API = (process.env.SCRAPPY_API ?? "http://localhost:8787").replace(/\/$/, "");
const KEY = process.env.SCRAPPY_KEY;
if (!KEY) throw new Error("Set SCRAPPY_KEY to a project API key");

const opt = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const arg = (name: string, fallback?: string) => {
  const v = opt(name) ?? fallback;
  if (!v) throw new Error(`Missing --${name}`);
  return v;
};
const item = arg("item");
const shop = arg("shop");
const language = arg("language", "en");
const onSite = opt("lat") !== undefined;

const call = async (path: string, init: RequestInit = {}) => {
  const res = await fetch(`${API}${path}`, { ...init, headers: { "content-type": "application/json", authorization: `Bearer ${KEY}`, ...init.headers } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path} ${res.status}: ${JSON.stringify(body)}`);
  return body as any;
};

console.log(`ShopBot: a user wants ${item} from ${shop}. The shop has no live stock feed.`);

const request = onSite
  ? {
    task: `Go to ${shop}. Is ${item} on the shelf? Photograph the shelf and type the shelf price (or "not on shelf").`,
    kind: "photo_check",
    place: { lat: Number(arg("lat")), lng: Number(arg("lng")), radius_m: Number(arg("radius", "250")), name: shop },
    agent: { name: "ShopBot", reason: `A customer wants ${item}; ${shop} has no website or live stock.` },
    response_schema: { type: "text", max_length: 120 },
    budget: Number(arg("budget", "0.5")),
    deadline: Number(arg("deadline", "1800")),
  }
  : {
    task: `Call ${shop} and ask: is ${item} in stock today? Type what they said (yes/no and how many).`,
    kind: "call",
    phone: arg("phone"),
    city: arg("city"),
    agent: { name: "ShopBot", reason: `A customer wants ${item}, and ${shop} has no website or live stock info.` },
    response_schema: { type: "text", max_length: 200 },
    budget: 0.2,
    deadline: 600,
  };

console.log(onSite ? `ShopBot: sending a nearby human to ${shop} for a shelf photo + GPS proof.` : `ShopBot: asking a human in ${request.city} to call the shop.`);
const task = await call("/v1/tasks", { method: "POST", body: JSON.stringify({ ...request, language }) });
console.log(`ShopBot: task ${task.task_id} is live ($${task.price_usdc ?? request.budget}). Waiting for a human...`);

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
const inStock = /\b(yes|available|in stock|have|rs|₹|\d)/i.test(said) && !/\b(no|not|out of stock)\b/i.test(said);
console.log(`ShopBot: the human answered "${said}" in ${Math.round((result.latency_ms ?? 0) / 1000)} s.`);

if (onSite) {
  const p = result.proof?.[0];
  console.log(`ShopBot: proof verified=${result.verified}, ${p?.distance_m ?? "?"} m from the shop, photo sha256 ${p?.photo_sha256?.slice(0, 12) ?? "none"}...`);
  if (p?.photo_url) {
    const img = await fetch(`${API}${p.photo_url}`, { headers: { authorization: `Bearer ${KEY}` } });
    if (img.ok) {
      const file = `shelf-${task.task_id.slice(0, 8)}.jpg`;
      await Bun.write(file, await img.arrayBuffer());
      console.log(`ShopBot: saved the shelf photo to ${file}`);
    }
  }
  if (!result.verified) {
    console.log("ShopBot: evidence did not verify, so I will not act on it.");
    process.exit(0);
  }
}

const outcome = inStock ? `Confirmed on the shelf. Told the customer to pick up ${item} at ${shop}.` : `Not in stock. Sent the customer to another shop instead.`;
await call(`/v1/tasks/${task.task_id}/outcome`, { method: "POST", body: JSON.stringify({ outcome }) });
console.log(`ShopBot: ${outcome}`);

export {};
