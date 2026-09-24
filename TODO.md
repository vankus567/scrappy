# Scrappy: TODO (locked 2026-09-24)

**Locked:** Scrappy. Main job type for the hackathon = checking AI answers (Indian languages + English). Phone-use demos + robot video = the pitch vision (after Oct 12).
**Deadlines:** CLOCK IN **Oct 8** Â· Colosseum + Superteam Earn **Oct 11** (hard Oct 12).
**Rule:** real product only. No mocks, no fake numbers. See `CLAUDE.md`.

Legend: [S] = sales/growth Â· [B] = build Â· [P] = pitch/submission Â· owner: A / B (assign)

---

## Day 0-1: Sep 24-25 (sell first, set up tools)
- [ ] [S] Tweet the idea + 10-word line: "AI companies pay Indian students instantly to check AI answers."
- [ ] [S] Run Grok: what CT/AI Twitter says about paying humans for AI feedback, RentAHuman, Karya, Scale AI India
- [ ] [S] List 40 target buyers (Indic AI startups, support/voice-bot builders, Solana agent teams, Superteam India AI builders)
- [ ] [S] Send first 20 buyer messages: "Get 500 Hindi answers human-checked by tomorrow, pay per task, from code. Free 50-task pilot."
- [ ] [S] Apply for a Superteam / Solana Foundation public-goods grant: open Indic AI eval benchmark (grant = a real buyer)
- [ ] [B] Install WSL2 Ubuntu â†’ Solana CLI â†’ Anchor (avm) inside WSL
- [ ] [B] Install Android Studio SDK, set ANDROID_HOME, JDK 17/21 (for Bubblewrap TWA build)
- [ ] [B] Verify day-1 unknowns: x402 Solana seller + facilitator package, paying into a PDA-owned ATA, dApp Store TWA/PWA guide, MWA from browser/TWA, Google-login embedded wallet (web SDK)
- [x] [B] Scaffold apps/web (Next.js 16 + Tailwind 4 + Bun), production build passes
- [x] [B] Landing page: responsive (desktop + 390px mobile), light + dark, SVG pet Mochi with 5 moods, verified by screenshots
- [ ] [P] Brief a pet artist (distinct style, not AI-generic); 1 pet, 4 moods, death state
- [ ] [P] Register on Colosseum (country = India) and CLOCK IN (Radiants site)

## Day 2-3: Sep 26-27
- [ ] [S] 20 more buyer messages; book calls; **target: 3 committed pilots**
- [ ] [S] Line up 2 college clubs + Superteam India channel for worker launch on Oct 3
- [ ] [B] Anchor program: `init_config`, `hatch_pet`, `open_job`, `settle_job`, `refund_job`, `withdraw`
- [ ] [B] LiteSVM tests: happy path, refund, double-settle, wrong mint, wrong signer, dead pet payee
- [ ] [B] Deploy program to devnet

## Day 4-6: Sep 28-30
- [ ] [B] API (Bun + Hono + Postgres/Neon): `POST /v1/jobs` with x402 402-challenge â†’ paid â†’ job funded (real devnet USDC)
- [ ] [B] MCP server `ask_human` that pays the 402 automatically within `max_price_usdc`
- [ ] [B] Router + gold questions + 3-answer consensus + settlement worker calling `settle_job`
- [ ] [S] First pilot buyer integrated on devnet
- [ ] [P] Landing page v1 (AI-roast hero + CTA; benchmark against Scale AI / Ramp copy)

## Day 7-9: Oct 1-3
- [ ] [B] Web app (apps/web, responsive desktop + mobile, PWA): onboarding (Google embedded wallet + desktop wallets + Seeker MWA), hatch, pet home, job card (rate / verify+correct / record audio), web push
- [ ] [B] Pet state: food decay, hungry/starving pushes, `mark_dead`, death certificate
- [ ] [B] Withdraw screen (to own wallet; UPI via off-ramp partner if confirmed)
- [ ] [B] **Mainnet deploy** (program + API), real USDC
- [ ] [S] **Worker launch:** 2 college clubs + Superteam India; first real paid jobs on mainnet
- [ ] [S] **Checkpoint Oct 3: 3 buyers paying?** If 0, pivot the job type or buyer segment the same day

## Day 10-12: Oct 4-6
- [ ] [B] Helius webhook indexer â†’ leaderboards (Richest, Most hired, Longest alive, City, College, Graveyard; outside earnings only)
- [ ] [B] Share cards (earnings, rank, death certificate) + referral (sibling pet)
- [ ] [B] Public traction dashboard (chain + DB, no hardcoded numbers)
- [ ] [B] SKR: food/cosmetics in SKR, stake SKR for ranked mode on non-Seeker Android
- [ ] [S] Push to targets: 150 pets, 1,000+ paid jobs, 3+ buyers, 70%+ outside earnings, 80%+ new-to-Solana workers
- [ ] [B] Security pass (EthelSec judges): Anchor constraints, settler key limits, rate limits
- [ ] **Oct 6: demo-ready, numbers frozen**

## Day 13-14: Oct 7-8 (CLOCK IN)
- [ ] [P] Bubblewrap TWA â†’ Android APK from the same site (assetlinks.json); test on a real Seeker/Android
- [ ] [P] CLOCK IN deck (pet-first story), demo video (Loom), README with GIF
- [ ] [P] **Submit CLOCK IN: APK + GitHub + video + deck (Oct 8)**

## Day 15-17: Oct 9-11 (Colosseum + Superteam India)
- [ ] [P] Colosseum pitch video (business-first: 10-word line, Scale AI anchor, traction, $1M ARR path, team)
- [ ] [P] Technical demo video (program, x402 flow, `ask_human`, mainnet tx links)
- [ ] [P] Answer YC / Alliance / Solana Incubator application questions; AI-roast the deck
- [ ] [P] Open-source repo check: no secrets, README complete
- [ ] [P] **Submit Colosseum (country = India) + Superteam Earn + any matching side tracks (Oct 11)**
- [ ] Oct 12: buffer only, nothing new ships

## Every day
- [ ] Post a build-in-public update on X (clip, number, user quote)
- [ ] Log real metrics (buyers, pets, jobs, earnings, retention)
- [ ] Before any push to GitHub: ask first, no secrets
