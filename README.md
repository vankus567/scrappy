# Kage

**When AI needs a human, Kage finds one.** The human shadow for AI agents.

Kage is human judgment as an API. An AI agent calls `kage.consensus()`; Kage routes the question to qualified humans on their phones, collects independent answers, returns the majority with agreement and confidence, and pays every human in USDC on Solana.

```ts
import { Kage } from "@kage/sdk";

const kage = new Kage({ apiKey: process.env.KAGE_API_KEY });
const r = await kage.consensus({ task: "Does this change let one user act as another?", content: diff, humans: 3, budget: 0.3, deadline: 20 });
// { status: "completed", answer: "yes", agreement: 1, humans: 3, latency_ms: 7561, ... }
```

| Path | What |
|---|---|
| `apps/api` | Human API (Bun + Hono + SQLite): tasks, consensus, capacity, router, gold checks, reputation, API keys, deposits, x402, webhooks, push |
| `packages/sdk` | `@kage/sdk`: `askHuman`, `consensus` (with escalation), `findCapacity`, `verifyWebhook` |
| `apps/mcp` | MCP server: `kage_ask_human`, `kage_consensus`, `kage_find_capacity` |
| `apps/web` | kageai.me: landing, docs, developer dashboard, live stats, and the worker app (`/app`, also the Android APK) |
| `deploy/` | One-command VPS deploy (systemd + Caddy) |

- Run tests: `bun test` (API + SDK)
- Demo: `apps/api/scripts/deploy-guard.ts` (an AI coding agent asks 3 humans before deploying)
- Docs: [kageai.me/docs](https://kageai.me/docs) · Positioning: [docs/POSITIONING.md](docs/POSITIONING.md) · Deploy: [docs/DEPLOY.md](docs/DEPLOY.md)

Built for CLOCK IN (Solana Mobile) and Colosseum Crypto World's Fair / Superteam India, 2026.
