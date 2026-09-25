# Scrappy: TODO v2 (the Human API)

**One line:** When AI needs a human, Scrappy pays one instantly.
**Source of truth:** `docs/POSITIONING.md`. **Rule:** real product only, no mocks (`CLAUDE.md`).
**Deadlines:** CLOCK IN **Oct 8** (APK + repo + video + deck) · Colosseum + Superteam Earn **Oct 11** (hard Oct 12).

Legend: [S] sales/supply · [B] build · [P] pitch/submission

---

## Done
- [x] Idea locked and repositioned as the Human API (`docs/POSITIONING.md`)
- [x] PRD, architecture, design system docs
- [x] Web app (Next.js 16, Tailwind 4, Bun): landing page, morph nav, radial mobile nav, gloss buttons, pixel-cloud hero
- [x] Worker app shell: hatch with 10 species, home with stats, journey map, evolution forms, jobs/ranks/wallet empty states
- [x] Pets: arms/legs, 11 expressions, 5 dances, tap to play
- [x] Apple Modern palette, Pally type

## Day 1-2 (Sep 25-26): verify + sell + set up
- [ ] [B] **Verify Solana payment channels + x402 V2** for agentic micropayments (docs, SDK, devnet). Decide: channels, or fallback prepaid escrow PDA per agent
- [ ] [B] Install WSL2 → Solana CLI → Anchor (avm); Android SDK + JDK 17/21 for the TWA build
- [ ] [B] Verify MCP TypeScript SDK, embedded wallet (Google login) on web, MWA from browser/TWA
- [ ] [S] Tweet the one-liner; run Grok on "human-in-the-loop for AI agents", RentAHuman, Scale, Karya
- [ ] [S] Message 20 agent builders (Solana agent teams, x402 builders, Indic AI teams): "your agent can call a human for $0.07"; target 3 pilots
- [ ] [S] Line up first workers: 2 college clubs + Superteam India (launch Oct 3)
- [ ] [P] Register on Colosseum (India) and CLOCK IN; apply for a public-goods grant (open human-eval benchmark)

## Day 3-5 (Sep 27-29): the Human API core
- [ ] [B] `apps/api` (Bun + Hono + Postgres): `POST /v1/human/verify` (+ `ask`, `compare`) with `requirements {language, max_latency, min_accuracy}` and `budget`; response `{answer, confidence, human_id, latency}`
- [ ] [B] Job lifecycle: quote → funded → routed → answered → accepted/refunded; deadline + refund
- [ ] [B] **Human confidence** on every answer (0-100) + agent policy helper (>90 accept, 70-90 second human, <70 expert)
- [ ] [B] Anchor program: agent budget account (channel or escrow PDA), per-answer payout to worker, platform fee, refund; LiteSVM tests; devnet deploy

## Day 6-7 (Sep 30-Oct 1): routing + quality
- [ ] [B] **Human Router v1** (rules): language, domain, difficulty, latency, required accuracy, budget, availability, fairness
- [ ] [B] **Capability graph v1**: per-domain accuracy from hidden gold tasks + agreement + history (never self-declared); shown as numbers
- [ ] [B] Gold tasks seeded per domain; anti-farming (hidden evals, latency floors, payout holds for new accounts)
- [ ] [B] `@scrappy/human` SDK (`human.ask({ task, budget, deadline })`) + MCP tool `ask_human` paying automatically

## Day 8-9 (Oct 2-3): worker app becomes real
- [ ] [B] Job card screen (verify / compare / record) with confidence slider; answer submit; real payout shown
- [ ] [B] Reward moment (coin into bowl, pet squish, +$0.11) driven by the real settlement tx
- [ ] [B] Web push when a job is routed to you; wallet: Google embedded + Seeker MWA
- [ ] [B] **Revive a dead pet for a tiny fee** (`revive_pet`: ~$0.05 USDC to the reward pool, keeps name/species/form/earnings, 24h cooldown) + revive button on the death certificate. Only after wallet + program exist (no fake payments)
- [ ] [B] **Pet levels that unlock work**: Lv5 higher-paying tasks, Lv10 expert tasks (router respects level); hunger turns on when jobs are live
- [ ] [B] Mainnet deploy (program + API); first real paid jobs from a pilot agent
- [ ] [S] **Checkpoint Oct 3:** 3 agents paying? If 0, change buyer segment same day

## Day 10-11 (Oct 4-5): the killer demo + network features
- [ ] [B] **Human Fallback**: demo agent whose confidence drops (e.g. 61%) → calls Scrappy → human answers → agent continues at 96%
- [ ] [B] Consensus for hard tasks (second human, split pay) + arbitration on disagreement (SHOULD)
- [ ] [B] Leaderboards from real outside-agent earnings; share cards; public live dashboard (tx count, paid, median latency, agreement)
- [ ] [B] SKR as expert reputation stake (gates expert eligibility; no fake slashing) (SHOULD, for the SKR prize)
- [ ] [S] Push to: 3+ paying agents, 150 workers, 1,000+ paid human answers, measured latency + agreement

## Day 12 (Oct 6): demo-ready
- [ ] [B] Security pass (Anchor constraints, settler key limits, rate limits, PII filter)
- [ ] [B] Mobile check of every screen; reduced-motion check
- [ ] **Freeze features. Record real numbers.**

## Day 13-14 (Oct 7-8): CLOCK IN
- [ ] [P] Bubblewrap TWA → APK; test on Seeker/Android
- [ ] [P] Deck (worker app first; Human API as why jobs exist) + 90s demo video (script in POSITIONING.md)
- [ ] [P] **Submit CLOCK IN (Oct 8)**

## Day 15-17 (Oct 9-11): Colosseum + Superteam India
- [ ] [P] Pitch video (infra first: Human API, router, payments, fallback; students = first supply; India = launch market)
- [ ] [P] Technical video (program, payment flow, SDK/MCP, mainnet tx links)
- [ ] [P] Answer YC / Alliance / Solana Incubator questions; AI-roast deck and landing copy
- [ ] [P] Open-source check (no secrets), push repo
- [ ] [P] **Submit Colosseum (country India) + Superteam Earn + matching side tracks (Oct 11)**

## Every day
- [ ] Build-in-public post (clip, number, user quote)
- [ ] Log real metrics
- [ ] Ask before any GitHub push

## Not building (stay disciplined)
Social network · NFT pet collection · token speculation · generic task marketplace · AI chatbot · annotation dashboard · "earn crypto by answering questions" pitch
