# Scrappy: project rules

Product: Scrappy, the Human API. When AI needs a human, Scrappy finds one. The human shadow for AI agents. Human-in-the-loop infrastructure for AI agents; students are the first workers, the pet app is the worker front end. Source of truth: `docs/POSITIONING.md`. Specs: `docs/PRD.md`, `docs/ARCHITECTURE.md`. Research log: `ideas/colosseum-cwf-2026-superteam-india/IDEAS.md`.

Deadlines: CLOCK IN (Solana Mobile) **Oct 8, 2026** · Colosseum + Superteam India **Oct 11** (hard deadline Oct 12).

## Hard rule: real product, never mocks
- No mock data, fake users, placeholder dashboards, simulated payments or hardcoded "demo" numbers anywhere, including in the pitch.
- Every payment is a real USDC transfer on Solana (devnet only while developing; mainnet for anything shown to judges).
- Every job shown comes from a real buyer calling the real API/MCP. Every metric on the dashboard is computed from chain events + the DB.
- If a feature is not real yet, it is not shown. Cut it instead of faking it.
- Tests may use LiteSVM/local validators; tests are not demos.

## Judge rules (Colosseum Frontier judge) apply to every pitch, deck, landing page and submission
Full text: `~/.claude/skills/hackathon-final-boss/references/judge-playbook.md`.
- 10-word explanation a non-crypto person understands; no jargon in the one-liner or hero
- Web2 anchor ("Scale AI for ..."), market size, moat vs web2 and web3
- Unit economics with a defensible path to $1M ARR (see PRD §8)
- ONE idea, think big, pivot if revenue path breaks
- Moat = users, liquidity, distribution, speed; build on top of giants
- Talk to users early, tweet early, open-source the repo, never fake numbers
- Read all Colosseum blog posts; answer YC / Alliance / Solana Incubator application questions
- AI-roast the hero, CTAs, deck and copy before showing anyone

## Stack
- Bun + TypeScript for all offchain code (never npm/npx, never Python)
- Anchor (Rust) for the `scrappy` program
- Next.js responsive web app (apps/web) is the product; Android/Seeker APK = same site as a Trusted Web Activity (Bubblewrap)
- Hono API, Postgres, Helius webhooks, x402 for buyer payments, MCP TypeScript SDK for `ask_human`
- UI follows the global anti-slop design law; commissioned/distinct pet art, no generic AI look

## Private
- Never commit secrets (Copilot PAT, keypairs, API keys). `.env` stays gitignored.
- The `hackathon-final-boss` skill never goes into this repo.
- Repo: https://github.com/Venkat5599/solana_coloseum. Ask before every push.

## Toolchain status (checked 2026-09-24, Windows)
| Tool | Status |
|---|---|
| bun 1.3.8, node 22, rust/cargo 1.96, git, adb, java 26 | installed |
| solana CLI, anchor (avm) | **missing**: install inside WSL2 Ubuntu (Anchor on native Windows is unreliable) |
| eas CLI | **missing**: `bun add -g eas-cli` |
| Android SDK | ANDROID_HOME unset: install Android Studio SDK; Gradle may need JDK 17/21, not 26 |

## Build order (from ARCHITECTURE.md §16)
1. Program: hatch_pet, open_job, settle_job, refund_job + LiteSVM tests
2. API: x402 `POST /v1/jobs` end to end on devnet with a real script buyer paying real devnet USDC
3. MCP `ask_human` paying the 402 automatically
4. Mobile: onboarding, pet home, job card, answer submit
5. Router, gold questions, consensus, settlement worker
6. Mainnet + first real outside buyer
7. Indexer, leaderboards, share cards, referral, dashboard
8. SKR, SAS, seasons (if time)

Day-1 verify list: x402 Solana seller/facilitator package, paying into a PDA-owned ATA, Solana Mobile Expo template, Google-login embedded wallet on Expo for Solana.
