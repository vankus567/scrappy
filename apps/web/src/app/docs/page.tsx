import Link from "next/link";
import { Wordmark } from "@/components/scrappy/Wordmark";

export const metadata = { title: "Scrappy docs", description: "Call real humans from your AI agent: API, SDK, MCP, consensus, payments." };

const API = "https://scrappypet.vercel.app";

const SECTIONS: { id: string; title: string; body: React.ReactNode }[] = [
  {
    id: "quickstart",
    title: "Quickstart",
    body: (
      <>
        <P>Create a project in the <A href="/dev">dashboard</A>. You get an API key (shown once) and a webhook secret. Fund it with USDC, or skip keys entirely and pay per call over x402.</P>
        <Code>{`import { Scrappy } from "@scrappy/sdk"; // packages/sdk in the repo

const scrappy = new Scrappy({ apiKey: process.env.SCRAPPY_API_KEY });
const r = await scrappy.askHuman({ task: "Is this reply safe to send?", content: reply });
// { status: "completed", answer: "no", agreement: 1, confidence: 0.9, humans: 1, ... }`}</Code>
      </>
    ),
  },
  {
    id: "consensus",
    title: "Consensus",
    body: (
      <>
        <P>Ask several independent humans. Nobody sees another person&apos;s answer. Scrappy returns the majority, the share who agreed, and a confidence weighted by each human&apos;s measured accuracy.</P>
        <Code>{`const r = await scrappy.consensus({
  task: "Which Telugu reply sounds natural?",
  options: ["A", "B"],
  language: "te",
  humans: 3,
  budget: 0.30,          // USDC for the round, split per human
  deadline: 20,          // seconds, 10-600
  qualityThreshold: 0.8, // agreement needed for "completed"
  maxHumans: 5,          // below the threshold, add 2 more (never the same people)
  maxBudget: 0.50,       // hard cap across rounds
});`}</Code>
        <P>Answer shapes: <C>binary</C> (yes/no, the default), <C>choice</C> (pass <C>options</C>), <C>rating</C> (1 to <C>scale</C>) and <C>text</C>. Pass <C>responseSchema</C> to pick one.</P>
      </>
    ),
  },
  {
    id: "results",
    title: "Results and statuses",
    body: (
      <>
        <Code>{`{
  "task_id": "…",
  "status": "completed",        // agreement >= quality_threshold
  "answer": "B",
  "agreement": 0.8,             // 4 of 5 humans
  "confidence": 0.74,
  "votes": [{ "answer": "B", "humans": 4 }, { "answer": "A", "humans": 1 }],
  "humans": 5,                  // across the chain, including escalations
  "latency_ms": 8400,
  "price_usdc": 0.1, "refund_usdc": 0,
  "payment_tx": "…"             // x402 settlement signature
}`}</Code>
        <ul className="mt-4 space-y-2 text-[15px] text-ink-soft">
          <li><C>matching</C>, <C>collecting</C>: humans are claiming seats and answering.</li>
          <li><C>completed</C>: enough humans answered and agreement met your threshold.</li>
          <li><C>low_confidence</C>: everyone answered, agreement is below your threshold. Escalate or decide yourself.</li>
          <li><C>insufficient_capacity</C>: the deadline passed with seats unfilled. Unfilled seats are refunded.</li>
        </ul>
      </>
    ),
  },
  {
    id: "capacity",
    title: "Capacity, before you pay",
    body: (
      <>
        <P>Scrappy never hangs and never pretends. If not enough qualified humans are online, the create call answers <C>409</C> before any payment is taken. Check first for free:</P>
        <Code>{`await scrappy.findCapacity({ language: "hi", skill: "support" });
// { online: 41, available: 12 }

// POST /v1/consensus when short:
// 409 { "status": "insufficient_capacity", "available": 1, "required": 3 }`}</Code>
        <P>The SDK returns this as a result (not an exception), so your policy decides: retry, raise the reward, escalate, or continue without a human.</P>
      </>
    ),
  },
  {
    id: "payments",
    title: "Payments",
    body: (
      <>
        <P><b className="text-ink">Prepaid balance.</b> Send USDC on Solana from your project&apos;s funding wallet to the Scrappy platform wallet, then paste the transaction signature in the dashboard. Scrappy verifies the transfer on-chain and credits it once. Tasks debit the balance; unfilled seats go straight back.</P>
        <P><b className="text-ink">Per call, no account (x402).</b> Call without an API key. The endpoint answers <C>402</C>; an x402 client signs a USDC payment for exactly <C>humans × reward</C> and retries. The task only goes live after settlement.</P>
        <Code>{`const scrappy = new Scrappy({ walletSecretKey: process.env.AGENT_SECRET }); // base58, 64 bytes`}</Code>
        <P>Humans receive 80% of each seat. Payouts to their wallets are real USDC transfers with public signatures.</P>
      </>
    ),
  },
  {
    id: "webhooks",
    title: "Webhooks",
    body: (
      <>
        <P>Pass <C>webhookUrl</C> (public https) on a project task and Scrappy posts <C>task.finished</C> with the result. Every request is signed: <C>x-scrappy-signature: t=&lt;ms&gt;,v1=&lt;hex hmac-sha256(&quot;t.body&quot;)&gt;</C>.</P>
        <Code>{`import { verifyWebhook } from "@scrappy/sdk";

const ok = await verifyWebhook(process.env.SCRAPPY_WEBHOOK_SECRET!, rawBody, req.headers["x-scrappy-signature"]);
if (!ok) return res.status(401).end(); // wrong secret, tampered, or older than 5 minutes`}</Code>
      </>
    ),
  },
  {
    id: "mcp",
    title: "MCP",
    body: (
      <>
        <P>Any MCP client gets three tools: <C>scrappy_ask_human</C>, <C>scrappy_consensus</C>, <C>scrappy_find_capacity</C>.</P>
        <Code>{`{
  "mcpServers": {
    "scrappy": {
      "command": "bun",
      "args": ["<repo>/apps/mcp/src/index.ts"],
      "env": { "SCRAPPY_API_KEY": "scrappy_sk_..." }
    }
  }
}`}</Code>
      </>
    ),
  },
  {
    id: "rest",
    title: "REST reference",
    body: (
      <ul className="space-y-2 font-mono text-[13.5px] text-ink-soft">
        <li>POST {API}/v1/consensus <span className="font-sans text-ink-faint">· n humans (paid)</span></li>
        <li>POST {API}/v1/tasks <span className="font-sans text-ink-faint">· same body, default 1 human (paid)</span></li>
        <li>GET&nbsp; {API}/v1/tasks/:id?wait=20 <span className="font-sans text-ink-faint">· result, long-poll up to 25 s</span></li>
        <li>GET&nbsp; {API}/v1/capacity?language=&amp;skill=&amp;min_accuracy= <span className="font-sans text-ink-faint">· free</span></li>
        <li>GET&nbsp; {API}/v1/stats <span className="font-sans text-ink-faint">· public network numbers</span></li>
        <li className="pt-2 font-sans text-[14px] text-ink-faint">Body: task, content, options | response_schema, humans (1-15), budget, deadline (10-600), language, skill, min_accuracy (&gt;= 0.95 routes to experts), quality_threshold, webhook_url, extends.</li>
        <li className="font-sans text-[14px] text-ink-faint">Limits: 120 paid calls a minute per client; budget per human $0.01 to $5.</li>
      </ul>
    ),
  },
];

export default function Docs() {
  return (
    <main className="mx-auto grid max-w-[1200px] gap-10 px-4 py-10 sm:px-8 lg:grid-cols-[220px_1fr] lg:py-16">
      <aside className="lg:sticky lg:top-10 lg:self-start">
        <Link href="/" aria-label="Scrappy home" className="scrappy-focus inline-block rounded pb-3"><Wordmark /></Link>
        <nav aria-label="Docs" className="mt-6 flex flex-wrap gap-x-4 gap-y-2 text-[15px] lg:flex-col">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="text-ink-soft transition-colors hover:text-ink">{s.title}</a>
          ))}
        </nav>
      </aside>
      <article className="min-w-0 space-y-16">
        <header>
          <h1 className="font-display text-[clamp(2.2rem,5vw,3.6rem)] font-bold leading-[1.05]">Call a human like you call an API.</h1>
          <p className="mt-4 max-w-2xl text-[17px] text-ink-soft">Base URL <C>{API}</C>. Everything below is live on Solana devnet during the hackathon.</p>
        </header>
        {SECTIONS.map((s) => (
          <section key={s.id} id={s.id} className="scroll-mt-10">
            <h2 className="font-display text-[28px] font-bold">{s.title}</h2>
            <div className="mt-4 space-y-4">{s.body}</div>
          </section>
        ))}
      </article>
    </main>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="max-w-3xl text-[16px] leading-relaxed text-ink-soft">{children}</p>;
}
function C({ children }: { children: React.ReactNode }) {
  return <code className="rounded-[6px] bg-field px-1.5 py-0.5 font-mono text-[0.88em] text-ink">{children}</code>;
}
function Code({ children }: { children: string }) {
  return <pre className="overflow-x-auto rounded-[18px] bg-ground-deep p-5 font-mono text-[13px] leading-relaxed text-ink-soft">{children}</pre>;
}
function A({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} className="font-semibold text-leaf transition-colors hover:text-leaf-hover">{children}</Link>;
}
