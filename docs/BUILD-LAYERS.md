# Scrappy: what's left, in layers

Each layer sits on the one below, ends in something **real and testable**, and can be demoed on its own.
Build bottom-up. Do not start a layer before the one below passes its **done when** check.
Rule: no mocks, no fake balances, no simulated payments (`CLAUDE.md`).

```
L7  SHIP            APK · decks · videos · submissions (Oct 7-11)
L6  NETWORK         consensus · arbitration · leaderboards · live dashboard · SKR stake
L5  THE DEMO        Human Fallback agent (61% → human → 96%)
L4  WORKER APP LIVE jobs screen · confidence slider · reward moment · push · levels · revive
L3  AGENT SURFACE   @scrappy/human SDK · MCP ask_human · Payment Channels (x402 upto / MPP)
L2  QUALITY         router v1 · capability graph · gold tasks · anti-farming
L1  MONEY           devnet paid call · real USDC payouts · wallets (Google + Seeker)
L0  CORE (done)     Human API v1 (x402 exact) · router v0 · worker endpoints · tests
```

---

## L0 Core ✅ done
- `apps/api`: `POST /v1/human/verify` paid via x402 on Solana devnet, `GET /v1/jobs/:id`, worker register / next / answer, confidence, owed earnings, 4 tests passing.
- Web: landing, 12 pets with evolutions and dances, two-step hatch, home, journey map, 31 languages.

## L1 Money (real payments both ways)
| Task | Done when |
|---|---|
| Devnet wallets: platform `PAY_TO`, a funded test agent (devnet SOL + devnet USDC) | Balances visible on Solana Explorer (devnet) |
| Script agent that pays a real x402 call (`@x402` client) | One real devnet tx signature returned in `x-payment-response`, job answered |
| **Worker payouts**: settlement worker sends owed USDC from platform wallet to worker wallets (batched), stores tx sig, zeroes owed | A worker's devnet wallet receives USDC; tx sig stored on the answer |
| Wallet login in the web app: Google embedded wallet (desktop/mobile) + Seeker MWA | A new user gets a real wallet address and registers as a worker |
| Deploy API (Fly/Railway) + Postgres (Neon) replacing SQLite | Public HTTPS endpoint answers `/health` |

## L2 Quality (the moat)
| Task | Done when |
|---|---|
| Gold tasks: known-answer questions per language/domain, mixed into the feed | Worker accuracy updates after each gold answer |
| **Capability graph**: accuracy per language + domain from gold + agreement + history (never self-declared) | `GET /v1/workers/:id` returns per-domain accuracy |
| **Router v1**: match language, domain, required `min_accuracy`, latency, availability, fairness | A job with `min_accuracy: 0.95` only reaches workers ≥95% in that domain |
| Anti-farming: latency floor per task type, payout hold for new accounts, rate limits | Answers faster than the floor are rejected; new accounts' payouts wait 48 h |

## L3 Agent surface (developers can use it)
| Task | Done when |
|---|---|
| `@scrappy/human` SDK: `human.ask({ task, budget, deadline, language })` handles 402, payment, polling | 5-line example returns a real human answer on devnet |
| MCP server `ask_human` (TypeScript MCP SDK) paying automatically within `max_price_usdc` | Claude Code / any MCP client gets a human answer via the tool |
| **Payment Channels**: agent authorizes a budget once (x402 `upto` or MPP session via `@solana/pay-kit`), streams per-answer vouchers, settles once | 10 answers paid from one channel with one open + one settle tx |
| Confidence policy helper in SDK (>0.9 accept, 0.7-0.9 second human, <0.7 expert) | SDK automatically asks a second human below 0.9 |

## L4 Worker app live (CLOCK IN stickiness)
| Task | Done when |
|---|---|
| Jobs screen wired to `/v1/workers/:id/next`: verify / compare / record task types | A real job from the script agent appears on the phone |
| **Confidence slider** + answer submit | Agent receives the worker's answer and confidence |
| **Reward moment**: coin drops into bowl, pet squishes, `+$0.04`, linked to the real payout tx | Tapping the amount opens the tx on Explorer |
| Web push when a job is routed to you | Phone buzzes for a real job |
| Hunger + death go live; **`revive_pet` for ~$0.05 USDC** (keeps name/species/form/earnings, 24 h cooldown) | A starved pet can be revived with a real tiny payment |
| **Levels unlock work**: Lv5 higher-paying tasks, Lv10 expert tasks (router respects level); evolution from real jobs | Router refuses expert jobs below Lv10 |
| Wallet screen: real balance, withdraw to own wallet (UPI via FIU-registered partner later) | Real USDC shown and withdrawable |

## L5 The demo (the 90-second story)
| Task | Done when |
|---|---|
| **Human Fallback agent**: an AI agent whose own confidence drops (e.g. 61%) calls Scrappy, gets a human answer, continues at 96% | Recorded end to end on mainnet with a real payout |
| "That wasn't a demo transaction": trigger 10 live jobs; live counters (answers, $ paid, median latency, agreement) computed from chain + DB | Numbers on screen match Explorer |

## L6 Network (should, time permitting)
- Consensus: second human on hard tasks, split pay; arbitration on disagreement with escrowed release
- Leaderboards (richest, most hired, longest alive, city, college, graveyard) from real outside-agent earnings
- Public live dashboard; share cards (earnings, rank, death certificate)
- **SKR as expert reputation stake** (gates expert eligibility; no fake slashing) for the $10k SKR prize

## L7 Ship
| Date | Task |
|---|---|
| Oct 6 | Security pass, phone check of every screen, reduced-motion check, **feature freeze**, record real numbers |
| Oct 7-8 | Bubblewrap TWA → APK, CLOCK IN deck (worker app first) + demo video → **submit CLOCK IN** |
| Oct 9-11 | Colosseum pitch video (infra first) + technical video, YC/Alliance/Incubator Q&A, open-source check → **submit Colosseum + Superteam Earn** |

---

## Running in parallel the whole time: SUPPLY + DEMAND (not code, but decides the win)
- 20 agent-builder DMs → **3 paying pilots by Oct 3**
- 2 college clubs + Superteam India → **150 workers**
- Target by Oct 6: **1,000+ real paid human answers**, measured latency and agreement
- Daily build-in-public post

## Critical path
L1 payouts → L4 jobs screen → L5 demo. Everything else can shrink. If time runs short, cut L6 first, then router v1 extras, never L1/L4/L5.
