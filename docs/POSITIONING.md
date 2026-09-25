# Kage: positioning v2 (the Human API)

## One line
**When AI needs a human, Kage pays one instantly.**

## What it is
An agent-native marketplace where AI agents buy tiny amounts of human judgment, exactly like calling an API, and the human is paid in seconds on Solana.

- The product is **human-in-the-loop infrastructure for AI agents**, not an annotation platform.
- **Indian students are the launch wedge (first supply segment)**, not the product. Later supply: developers, designers, researchers, translators, domain experts, QA testers, gamers, accountants.
- The agent never cares who answers. It asks: *"I need a human judgment. Who can do it for $0.07?"*
- Pitch closer: **"We just built an API where the endpoint is a human."**

## Web2 / web3 anchor
- Web2: Scale AI, Toloka, Karya (contracts, weekly payouts, datasets). Kage is **per-call, sub-minute, paid instantly, callable by the agent itself**.
- Web3: x402 rails exist (MCPay, Corbits won Cypherpunk); nobody sells *human judgment* as a paid endpoint with routing + reputation.
- Moat: **the routing engine + capability graph** (who is actually good at what, learned from hidden evals), plus supply liquidity.

## The 9 pieces (build order and scope)
| # | Piece | Hackathon scope |
|---|---|---|
| 1 | **Human API**: `POST /v1/human/verify` (and `ask`, `compare`, `record`) with requirements (language, max_latency, min_accuracy) and budget; response has answer, **confidence**, latency, human id | MUST |
| 2 | **SDK + MCP**: `@kage/human` → `human.ask({ task, budget, deadline })`; same as an MCP tool | MUST |
| 3 | **Payment**: agent authorizes a budget once (e.g. $10), micro-payments stream per answer, settle on Solana. Solana payment channels for high-frequency agentic payments + x402 **[verify availability day 1]**; fallback = prepaid escrow PDA per agent | MUST (fallback OK) |
| 4 | **Human Router**: task → language, domain, difficulty, latency, accuracy, budget → best available human | MUST (rules v1) |
| 5 | **Capability graph**: per-human accuracy by domain from hidden gold tasks + agreement + history; never self-declared. Agents can require "≥95% on crypto" | MUST (basic) |
| 6 | **Human confidence**: every answer carries 0-100% confidence. Agent policy: >90 accept, 70-90 second human, <70 expert | MUST |
| 7 | **Second human + arbitration**: consensus for hard tasks; disagreement → arbitrator; escrow releases only on resolution | SHOULD |
| 8 | **Human Fallback**: agent's own confidence drops (61%) → Kage pulls a human → confidence 96% → agent continues | MUST (it is the demo) |
| 9 | **Pet gameplay with real unlocks**: level from useful work; Lv5 higher-paying tasks, Lv10 expert tasks, Lv20 priority routing, Lv30 publish your own Human API | MUST (levels 5/10), rest SHOULD |
| 10 | **Worker-created Human APIs** ("crypto_fact_checker, $0.08, <15s, 97.8%"): App Store for human intelligence | NEXT (vision slide) |
| 11 | **SKR = reputation stake** for verified experts (not a fee token). No fake slashing: stake gates expert eligibility; misconduct pauses eligibility, real slashing only after a designed dispute process | SHOULD (SKR prize) |

## What we will NOT build
Social network. NFT pet collection. Token speculation. Generic task marketplace. AI chatbot. Giant annotation dashboard. "Earn crypto by answering questions" as the pitch.

## The 90-second demo
1. 0-10s: agent says "I need a human to verify these answers."
2. 10-20s: agent calls Kage (budget $0.12 USDC, 15s SLA, English).
3. 20-30s: Seeker vibrates: *your pet found a job*.
4. 30-40s: student answers **B, 92% confidence**.
5. 40-50s: agent receives it: human verified.
6. 50-60s: phone shows **+$0.11 USDC**; show the Solana settlement tx.
7. 60-75s: "That wasn't a demo transaction." Trigger 10 more live jobs: decisions, total paid, median latency, agreement, all real numbers.
8. 75-90s: **"We just built an API where the endpoint is a human."**

## Audience split for the two hackathons
- **Colosseum / Superteam India:** infrastructure story first (Human API, router, payments, capability graph, human fallback). Students = first supply, India = launch market.
- **CLOCK IN:** the worker app first (pet, levels that unlock better work, instant payouts on Seeker), the Human API as "why the jobs exist".
