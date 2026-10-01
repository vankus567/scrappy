<div align="center">

# SCRAPPY

### Human judgment as an API. When an agent is unsure, one call reaches real people, returns their consensus, and pays them in USDC on Solana.

[![tests](https://img.shields.io/badge/tests-53%20passing-brightgreen)](https://github.com/vankus567/scrappy)
[![live](https://img.shields.io/badge/live-scrappypet.vercel.app-blue)](https://scrappypet.vercel.app/health)
[![stack](https://img.shields.io/badge/stack-Bun%20%C2%B7%20Hono%20%C2%B7%20SQLite%20%C2%B7%20Next.js%2016-black)](https://github.com/vankus567/scrappy)

[Try the live API](https://scrappypet.vercel.app/health) · [SDK](packages/sdk/src/index.ts) · [MCP server](apps/mcp/src/index.ts) · [Run it](#-see-it-in-one-command) · [Honesty table](#whats-real-vs-pending--the-honesty-table)

</div>

Scrappy is the human fallback for an agent that has run out of certainty. The agent calls one endpoint
with a question and the material to judge; Scrappy routes it to qualified people on their phones,
collects independent answers, returns the majority with an agreement and confidence score, and pays
every person who answered in USDC on Solana. When the first round is not clear enough, it recruits more
humans, never the same ones, and keeps going until the threshold or your budget stops it.

There is no model in the answer path. The humans are the model. The API's only job is to route,
aggregate, verify the evidence, and move the money without charging for a seat nobody filled.

```
CHARGED  ≤  FILLED  ≤  VERIFIED  ≤  PAID
```

An agent is charged only for seats that humans actually answered. A human is paid only for an answer that
passed its proof check. The API never holds a claim it cannot settle.

## Live status

| Surface | Status | The evidence |
|---|---|---|
| Public API | **live** — | `curl -s https://scrappypet.vercel.app/health` → `{"ok":true}` |
| Network config | **live, devnet** — | `/v1/config` → `network: solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1`, `platform_wallet: 31qHiLgeimn8WHhQfr2EN4eDdWrJFrdQKkwYGP5yTztr`, `worker_share: 0.8` |
| Settlement | **live worker** — | `scrappy-payout.timer` runs payouts and refunds every 15 min; minimum payout 0.1 USDC; new accounts wait 48 h |
| Real usage | **empty** — | `/v1/stats` → `human_answers: 0`, `tasks_finished: 0`, `agent_spend_usdc: 0`, `paid_to_humans_usdc: 0`, `workers: 7`, `workers_online: 0` |
| Test suite | **53 pass, 0 fail** — | `bun test` → 53 pass, 309 assertions, 6 files |

The API is deployed and answering. It has no real traffic yet, and the live counter says so rather than
rounding up.

## The 20-second pitch

An agent that writes code, translates, refunds, or deploys hits questions no model can settle alone: is
this diff safe, does this Telugu read naturally, is this shelf actually stocked. Scrappy turns those into
API calls. You send a task, a deadline and a budget; real people answer from their phones; you get back
the majority, how strongly they agreed, a confidence score, and, for on-site work, a photo and a GPS fix
that Scrappy checked before it paid anyone. Everything is billed in USDC: prepaid balance for projects,
per-call over x402 for agents that would rather not hold a balance.

## Table of contents

- [Live status](#live-status)
- [The 20-second pitch](#the-20-second-pitch)
- [▶ See it in one command](#-see-it-in-one-command)
- [Verify every claim in one command](#verify-every-claim-in-one-command)
- [What Scrappy is NOT](#what-scrappy-is-not)
- [The problem I set out to solve](#the-problem-i-set-out-to-solve)
- [What I built](#what-i-built)
- [Architecture](#architecture)
- [The consensus loop, step by step](#the-consensus-loop-step-by-step)
- [Where the guarantee is enforced](#where-the-guarantee-is-enforced)
- [What the router measures](#what-the-router-measures)
- [Where the model sits](#where-the-model-sits)
- [Who approves what](#who-approves-what)
- [Engineering decisions & the traps that taught me something](#engineering-decisions--the-traps-that-taught-me-something)
- [What's real vs pending — the honesty table](#whats-real-vs-pending--the-honesty-table)
- [Attack → test](#attack--test)
- [The app](#the-app)
- [Limitations](#limitations)
- [Security](#security)
- [Tech stack](#tech-stack)
- [Project layout](#project-layout)
- [Full command reference](#full-command-reference)
- [How I'd deploy it](#how-id-deploy-it)
- [Tests](#tests)

## ▶ See it in one command

The deployed API, right now, with the counters it actually holds:

```bash
$ curl -s https://scrappypet.vercel.app/v1/stats
{"human_answers":0,"tasks_finished":0,"agent_spend_usdc":0,"paid_to_humans_usdc":0,
 "median_latency_ms":null,"avg_agreement":null,"workers":7,"workers_online":0}
```

```bash
$ curl -s https://scrappypet.vercel.app/v1/config
{"network":"solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
 "platform_wallet":"31qHiLgeimn8WHhQfr2EN4eDdWrJFrdQKkwYGP5yTztr",
 "push_public_key":"BIuaORobl_qrceqmtp_zf0iS85Srcj6SWHPInFfVgkYOeRtl4L1k9PSdh7w7l7JYTUJt5Yj9zDqhRzToTPg5xsY",
 "worker_share":0.8}
```

Asking, from an agent, is one call. With an API key it bills a prepaid balance; with an agent wallet it
pays per call over x402 and never needs an account:

```ts
import { Scrappy } from "@scrappy/sdk";

const scrappy = new Scrappy({ apiKey: process.env.SCRAPPY_API_KEY });
const r = await scrappy.consensus({
  task: "Does this change let one user act as another?",
  content: diff,
  humans: 3,
  budget: 0.3,
  deadline: 20,
});
if (r.answer === "yes") cancelDeploy();
```

The same four capabilities are exposed to any MCP client as `scrappy_ask_human`, `scrappy_consensus`,
`scrappy_find_human` and `scrappy_find_capacity`.

## Verify every claim in one command

```bash
bun install && bun test
```

```
 53 pass
 0 fail
 309 expect() calls
Ran 53 tests across 6 files. [3.01s]
```

The suite drives a real Hono app over `app.request` against an in-memory SQLite database. The x402
facilitator is a stand-in that settles or fails exactly the way the real middleware does, and chain
reads and USDC transfers are injected, so the money path is tested for its logic and its idempotency
rather than by moving devnet funds on every run.

## What Scrappy is NOT

- **Not a model.** — There is no LLM in the answer path. The answer is what people said.
- **Not an on-chain protocol.** — Routing, consensus, reputation and accounting run in the Hono API on
  SQLite. The chain is used for what the chain is good at: paying people and verifying deposits.
  `programs/scrappy/` exists and is empty; no Anchor program is deployed.
- **Not a marketplace you browse.** — Tasks are pushed to qualified phones; humans do not shop for work.
- **Not free.** — Every answered seat costs USDC, to the agent and to the platform.
- **Not trusted.** — An answer that arrives without its required photo or GPS fix does not count and is
  not paid.

## The problem I set out to solve

An agent can write the code, but it cannot tell whether the code is safe; it can translate, but not
whether the translation sounds like a person; it can plan a delivery, but not whether the shop door is
open. The usual escape hatch is "ask the user", which does not scale, or "ask a bigger model", which
returns the same uncertainty in a more confident voice.

The missing piece is not intelligence. It is a payment rail and a routing layer that make a two-dollar
human judgment callable in one line, with enough structure that the caller can trust the result: who
answered, how much they agreed, how confident they were, and whether the evidence behind the answer was
checked before the money moved.

## What I built

| Piece | What it does |
|---|---|
| Consensus API | Creates a task, routes it, aggregates answers into a majority with agreement and confidence, escalates when agreement is low |
| Capacity + routing | Answers "how many qualified humans are online for this language and skill", free, before anyone is asked to pay |
| Reputation | Per-skill accuracy built from hidden gold checks and from agreement with the consensus; `min_accuracy` gates who can take a task |
| Proof-native tasks | Photo and GPS requirements, checked against a place and a time window, stored with a SHA-256, handed back to the agent as evidence |
| Money | Prepaid project balances, x402 per-call payments, chain-verified deposits with replay protection, automated payouts and refunds |
| Pet layer | Hunger, feeding, starvation, revive, leaderboard: the reason the human opens the app on a day with no work |
| Worker app | The phone surface at `/app`, also shipped as a signed Android TWA |

## Architecture

```
agent ──► POST /v1/consensus ──► billing gate ──► task row ──► router picks qualified humans
                                      │                              │
                                      │                     push / poll to /app
                                      │                              │
                                      ▼                              ▼
                                  x402 or balance            answers + proof
                                      │                              │
                                      ▼                              ▼
                              settle worker  ◄──── consensus + reputation
                                      │
                                      ▼
                            real USDC transfer on Solana
```

| Component | Module | Role |
|---|---|---|
| HTTP surface | `apps/api/src/app.ts` | Every route, the billing middleware, the paywall, rate limits |
| Task lifecycle | `apps/api/src/tasks.ts` | Create, route, assign, expire, aggregate, compute consensus |
| Evidence | `apps/api/src/proofs.ts` | Place/radius bounds, GPS age and accuracy, photo hashing, distance |
| Money out | `apps/api/src/settle.ts` | Payouts and refunds, single-flight, 48 h hold, dust floor |
| Money in | `apps/api/src/payments.ts` | Chain-verified deposits, one credit per signature |
| Identity | `apps/api/src/auth.ts` | API-key hashing, wallet sign-in, nonce replay protection |
| Storage | `apps/api/src/db.ts` | Schema, micro-USDC arithmetic, forward-only migrations |
| Client | `packages/sdk/src/index.ts` | `askHuman`, `consensus`, `findHuman`, `findCapacity`, `verifyWebhook` |
| MCP | `apps/mcp/src/index.ts` | The same four capabilities as MCP tools |

| Route | Purpose |
|---|---|
| `GET /health`, `GET /v1/config` | Liveness and the network the API is actually on |
| `POST /v1/consensus`, `POST /v1/tasks` | Create work; `extends` adds humans to an existing task |
| `GET /v1/tasks/:id` | Status, votes, agreement, confidence, proof |
| `GET /v1/capacity` | Free capacity check before an agent pays |
| `POST /v1/workers`, `POST /v1/workers/session` | Register a device, sign in with a wallet |
| `GET /v1/worker/next` | The next assigned task, pushed or polled |
| `POST /v1/tasks/:id/respond` | Answer, with optional proof |
| `POST /v1/tasks/:id/outcome` | What the agent did with the answer |
| `GET /v1/leaderboard`, `GET /v1/stats` | Earners, and the network's own counters |

## The consensus loop, step by step

1. **Capacity first.** Over x402 the API checks that enough qualified humans are online *before* the
   caller is charged, and returns `insufficient_capacity` as a normal result if not.
2. **Route.** Humans are filtered by language, skill and proven accuracy, and by distance when the task
   names a place. A worker is never assigned to the same root task twice.
3. **Answer.** The response is stored with a confidence value and a latency. Answers below the floor
   and answers that do not fit the schema are rejected outright.
4. **Aggregate.** Votes become a majority, an agreement share, and an accuracy-weighted confidence.
5. **Escalate.** Below the quality threshold, and only if a budget allows, more humans are added to the
   same root task until the threshold or the cap is reached.
6. **Refund the gaps.** A seat that expires unfilled is refunded to whoever paid for it, once.
7. **Pay.** The settlement worker sends what each human is owed, records the signature, and skips dust
   and accounts still in their 48-hour hold.

## Where the guarantee is enforced

| Guarantee | Module | The test that covers it |
|---|---|---|
| Nobody is charged for an empty seat | `apps/api/src/tasks.ts` | `deadline passes with a seat unfilled: structured failure and a refund for the empty seat` |
| A failed settlement never reaches a human | `apps/api/src/app.ts` | `failed settlement cancels the task; no human ever sees it` |
| A deposit is credited exactly once | `apps/api/src/payments.ts` | `deposits are verified from the chain and credited once` |
| An overlapping run cannot double-pay | `apps/api/src/settle.ts` | `single-flight: an overlapping run returns immediately` |
| A failed transfer is retried, not lost | `apps/api/src/settle.ts` | `a failed transfer keeps the worker owed and does not block the next one` |
| Only proven people see expert work | `apps/api/src/tasks.ts` | `expert tasks (>= 95% accuracy) never reach unproven workers` |
| A webhook cannot be pointed inward | `apps/api/src/app.ts` | `webhooks cannot target private networks` |

## What the router measures

Accuracy is per skill and per worker, in `worker_skills`, and it is built two ways: hidden gold tasks
whose answer the worker cannot see, and agreement with the eventual consensus on real tasks. Routing
takes `min_accuracy` from the caller, so an agent that needs certainty above 0.95 gets experts only.
Levels follow from the same numbers: Lv5 unlocks better-paid seats, Lv20 sees new tasks first. Nothing
here is self-reported.

## Where the model sits

Nowhere in the answer path. `POST /v1/admin/gold` seeds qualification tasks, and the settlement worker
is arithmetic. The only model in the repo is optional and lives in a demo script
(`apps/api/scripts/deploy-guard.ts`), where an agent uses Scrappy as one of its inputs before it
deploys. The product is people; the model is a customer.

## Who approves what

| Actor | Approves |
|---|---|
| The agent's owner | The task, the budget, the deadline, the accuracy floor |
| The agent | Whether to act on the answer (Scrappy reports, it does not decide) |
| The human | Whether to answer, and at what confidence |
| Scrappy | Whether an answer fits the schema, whether the proof checks out, whether a seat is filled |
| The settlement worker | Nothing: it pays what the database already says is owed |

## Engineering decisions & the traps that taught me something

**Money is integers.** Every amount is stored in micro-USDC in SQLite, never a float. A ledger that
rounds is a ledger that disagrees with the chain, and the disagreement surfaces at the worst moment: a
payout that comes up one micro short.

**A signature is the receipt.** Payouts, refunds, deposits and revives all record a transaction
signature with a uniqueness constraint. Restarting the settlement worker mid-run is safe by schema, not
by discipline.

**Settlement is single-flight.** The worker takes a flag before it starts and returns immediately if one
is already running, because the failure mode of overlapping payout passes is not a slow API, it is
paying twice.

**New accounts wait 48 hours.** A worker cannot be paid out until their account is two days old, and
dust below 0.1 USDC is skipped rather than sent. Both are there to make a payout run bounded and hard
to abuse.

**The proof is checked before the payment, not after.** If a photo or a GPS fix is missing, stale
(older than 10 minutes), or outside the radius, the answer does not count, and an answer that does not
count is not paid. The 150 m slack on top of the task radius is deliberate: phone GPS is worse than
people think, and a system that demands perfection gets no answers at all.

**Capacity is checked before the charge.** Charging an agent and then discovering there are no humans is
the fastest way to lose a customer, so the check happens first and `insufficient_capacity` is a returned
value, not an exception.

## What's real vs pending — the honesty table

| Claim | State |
|---|---|
| The API is deployed and answering | **Real.** — `/health` returns `{"ok":true}` on devnet |
| 53 tests pass | **Real.** — `bun test`, 0 failures |
| Real USDC payouts | **Built and wired**, but no payment has ever been made: `paid_to_humans_usdc: 0` |
| Real agent traffic | **None.** — 0 tasks finished, 0 human answers |
| An on-chain program | **Not built.** — `programs/scrappy/` holds only a placeholder; consensus and accounting are server-side |
| Users | **7 registered workers, 0 online.** — Registration is not usage |
| Demo video, screenshots | **Not in this repo.** — Neither is claimed here |
| The live web front page | The deployed domain currently serves the arcade on the `site-classic` branch. This branch's `/docs` and `/dev` return 404 there |

## Attack → test

| The abuse | The test that answers it |
|---|---|
| Replay a captured wallet signature | `wallet sign-in: valid signature issues a new token, a replayed signature is refused` |
| Re-register someone else's wallet | `worker endpoints need the device token; a wallet cannot be re-registered by someone else` |
| Answer instantly, or answer in a shape the caller did not ask for | `answers faster than the floor and answers that don't fit the schema are rejected` |
| Farm expert pay without proving anything | `expert tasks (>= 95% accuracy) never reach unproven workers` |
| Let a seat expire and keep the money | `deadline passes with a seat unfilled: structured failure and a refund for the empty seat` |
| Credit the same deposit transaction twice | `deposits are verified from the chain and credited once` |
| Crash the payout worker and pay twice | `single-flight: an overlapping run returns immediately` |
| Lose money when a transfer fails | `a failed transfer keeps the worker owed and does not block the next one` |
| Point a webhook at the internal network | `webhooks cannot target private networks` |
| Forge or replay a webhook after the fact | `valid signatures verify; tampered or stale ones do not` |
| Show a broken task to a human | `failed settlement cancels the task; no human ever sees it` |

## The app

`apps/web` is the phone surface: the landing page, the docs, a live network view, and the worker app at
`/app`, where a human sees the next task, answers, watches their pet get fed by their earnings, and
checks their payouts. The same site is wrapped as an Android Trusted Web Activity, so the APK and the
web app are one codebase; `apps/android/scripts/build-apk.ts` builds and signs it, and the site's
`assetlinks.json` ties the signature to the domain.

## Limitations

- No on-chain program. Consensus and accounting are server-side and therefore trusted, not verifiable.
- No real traffic yet. The routing, reputation and settlement paths are tested, not exercised.
- The consensus rule is a plain majority with an accuracy weight. It is honest and legible, and it is
  not a statistical treatment of disagreement.
- Gold checks are seeded manually, so a new skill starts with no proven workers.

## Security

Wallet sign-in uses single-use nonces, so a captured signature cannot be replayed. Worker endpoints
require a device token; API keys are stored hashed and can be revoked. Deposits are verified against
the chain before a balance moves, and each signature credits exactly once. Webhook targets are validated
so a task cannot be pointed at a private network, and webhook deliveries are signed and time-bounded.
Secrets live in `/etc/scrappy/api.env` on the host and in `.env` locally; neither is in git.

## Tech stack

Bun and TypeScript everywhere off-chain. Hono on `bun:sqlite` for the API, Next.js 16 with React 19 and
Tailwind 4 for the web app, `@modelcontextprotocol/sdk` for the MCP server, `@x402/*` for per-call
payments, and `@solana/kit` with `@solana-program/token` for USDC transfers.

## Project layout

```
apps/api/          Hono API: routes, tasks, proofs, payments, settlement, SQLite schema, tests
apps/mcp/          MCP server exposing the four Scrappy tools
apps/web/          Next.js app: landing, docs, live view, worker app
apps/android/      Bubblewrap TWA project and the APK build script
packages/sdk/      @scrappy/sdk: askHuman, consensus, findHuman, findCapacity, verifyWebhook
packages/console/  A small fantasy-console runtime used by the arcade branch
deploy/            deploy.sh, remote-install.sh, the Caddy site block
docs/              DEPLOY.md, ARCHITECTURE.md, PRD.md and the product notes
```

## Full command reference

```bash
bun install                       # workspaces: apps/*, packages/*
bun test                          # 53 tests, 6 files
bun run typecheck                 # tsc across every workspace

cd apps/api && bun src/index.ts   # API on :8787 (dev: bun --watch src/index.ts)
cd apps/web  && bun dev           # web on :3000
cd apps/api  && bun scripts/keys.ts        # create the platform and agent wallets
cd apps/api  && bun scripts/seed-gold.ts   # seed qualification checks
cd apps/api  && bun scripts/payout.ts      # run one settlement pass by hand
cd apps/android && bun scripts/build-apk.ts # build and sign the APK
SSH_KEY=~/.ssh/hostinger_tenki HOST=root@<host> bash deploy/deploy.sh
```

Configuration lives in `.env` (see `.env.example`): `PAY_TO`, `SOLANA_NETWORK`, `SOLANA_RPC`,
`USDC_MINT`, `WEB_ORIGINS`, `VAPID_*` for push, and the `SCRAPPY_*` variables that the SDK and MCP
server read.

## How I'd deploy it

The site is on Vercel and rewrites `/v1` and `/health` to the API, which runs on one VPS behind Caddy on
an `sslip.io` name so HTTPS works without owning a domain. Users and agents only ever see the Vercel
domain. First deploy writes `/etc/scrappy/api.env` once and never overwrites it; the API runs under
systemd alongside a payout timer. The full walkthrough is in `docs/DEPLOY.md`.

## Tests

```bash
bun test
```

53 tests across 6 files: the API surface and every rule above in `apps/api/src/app.test.ts`, settlement
in `settle.test.ts`, deposits and shop in `shop.test.ts`, the pet economy and battle scoring in
`mimic.test.ts`, SDK policy and webhook verification in `packages/sdk/src/policy.test.ts`, and the
console runtime in `packages/console/src/engine.test.ts`.
