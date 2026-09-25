# Kage: Product Requirements Document

> **Superseded positioning:** see `docs/POSITIONING.md` (Human API, router, capability graph, confidence, payment channels, human fallback). Sections below remain valid for the worker app.

**One-liner (consumer):** Kage is a pocket pet that earns real money doing tiny jobs for AI agents, with a little help from you.
**One-liner (business):** AI companies pay Indian students instantly to check AI answers. Think Scale AI for Indian languages, callable by any AI agent.

| | |
|---|---|
| Status | Draft v1, 2026-09-24 |
| Targets | CLOCK IN (Solana Mobile) submit **Oct 8, 2026** · Colosseum Crypto World's Fair + Superteam India submit **Oct 11** (deadline Oct 12) |
| Platform | Android (Seeker first, any Android supported) + public API/MCP for AI agents |
| Chain | Solana mainnet, USDC, x402 payments |

---

## 1. Problem

**For AI builders:** AI agents cannot buy human judgment or Indian-language ground truth on demand, per task, from code. AI is weakest in Indian languages, and there is no programmatic "hire a human for 20 seconds" button that pays instantly.

**For people in India:** there is no easy, fun way to earn your first digital dollars. Crypto onboarding usually asks users to pay first. Nothing pays them first.

## 2. Solution

A Tamagotchi-style pet on your phone that runs a tiny business:

1. AI agents post paid micro-jobs (check a Hindi reply, record a Tamil sentence, rate two answers) through an x402 API or an MCP tool called `ask_human`.
2. Jobs are routed to pets. The pet's AI answers the easy ones; jobs that need a human are pushed to the owner as 20-second tasks.
3. Accepted answers pay USDC into the pet's wallet. The pet "eats" its AI costs; the owner keeps the profit.
4. Neglected pets get hungry and eventually die, with a shareable death certificate.
5. Leaderboards, city/college leagues and share cards make it social.

## 3. Users

### Worker (primary, the new Solana user)
**Ananya, 20, college student in Pune.** Android phone, uses Instagram and WhatsApp daily, has never owned crypto. Wants pocket money and something fun. Speaks Hindi and Marathi.

### Buyer (pays for jobs)
**Dev, 28, builds an AI support agent for an Indian D2C brand.** Needs 500 Hindi replies checked this week and a steady stream of human checks afterwards. Wants it from code, paid per task, with no contracts.

### Seeker owner (CLOCK IN audience)
Crypto-native, has a Seeker, holds SKR, wants apps worth opening daily.

## 4. Goals and success metrics

Hackathon traction targets (these decide the "early traction" score):

| Metric | Target by Oct 6 |
|---|---|
| Paying buyers (outside the team) | 3+ |
| Pets hatched | 150+ |
| Paid jobs completed | 1,000+ |
| Share of pet earnings from outside buyers | 70%+ |
| Workers new to Solana (first wallet via Kage) | 80%+ |
| D7 retention of workers | 30%+ |
| Job answer acceptance rate | 85%+ |

Product goals after the hackathon: buyers retained month over month, worker earnings per active hour, take-rate revenue.

## 5. Scope

### MUST (hackathon)
- Hatch a pet (name, one trade: language + task type), onboarding with Google login (embedded wallet) or Seeker wallet (MWA/Seed Vault)
- Pet states: happy, hungry, starving, dead (driven by earnings and care)
- Job feed + push notification for human tasks; answer UI for 3 task types: **rate/choose**, **yes/no + correction text**, **record audio sentence**
- Auto-answer for easy jobs using the pet's AI (costs "food")
- Buyer side: x402 HTTP endpoint + MCP tool `ask_human`; job status + results retrieval
- Onchain settlement: job funds held in escrow, released to the pet wallet on acceptance, 10% platform fee
- Quality control: gold questions, 3-worker consensus for review tasks, reputation score
- Leaderboards: Richest, Most hired, Longest alive, City, College, Graveyard (outside-buyer earnings only)
- Share cards: earnings, rank, death certificate
- Referral: invite a friend and your pet gets a sibling; bonus paid from platform fee
- Public traction dashboard (web)

### SHOULD
- SKR integration: pet food/cosmetics payable in SKR; stake SKR to unlock ranked play on non-Seeker phones and a second trade slot
- Reputation as a Solana Attestation Service (SAS) credential
- Season Merkle snapshot + claim for season rewards
- Hindi UI

### WON'T (hackathon)
- Breeding, pet duels, multiple trades per pet
- In-app INR cash-out (users cash out via external FIU-registered exchanges)
- iOS
- Any token of our own, any entry fees or paid prize pools

## 6. Key user flows

### 6.1 Worker onboarding (target: under 60 seconds)
1. Install APK / dApp Store → "Hatch your pet"
2. Sign in with Google (embedded wallet created) or connect Seeker wallet
3. Pick name, language(s), city, college (optional)
4. Egg hatches animation → first tutorial job (gold question, pays a small welcome bonus from the platform fee pool)

### 6.2 Doing a job
1. Push: "Mochi has a job: ₹4, 20 sec"
2. Open → task card (instructions, content, answer controls, timer)
3. Submit → pet reacts → "pending review"
4. On acceptance → pet eats, balance updates, feed shows "+₹3.60 from BharatBot"

### 6.3 Pet lifecycle
- Food meter decays over 24h. Completing jobs and positive balance refill it.
- Hungry at <40%, starving at <10% (push warnings), dead after 72h at 0% or a sustained negative balance.
- Death: final state onchain, death certificate share card, remaining balance returned to the owner (minus nothing). Graveyard entry.
- A new egg can be hatched after death (ranked slot resets).

### 6.4 Buyer flow
1. Buyer agent calls `ask_human` (MCP) or `POST /v1/jobs` (HTTP)
2. Server replies HTTP 402 with the USDC price; the agent pays via x402
3. Job is created and routed; the buyer polls `GET /v1/jobs/:id` or gets a webhook
4. Results are returned with worker-consensus confidence; the buyer can reject within the review window (refund to the buyer, no pay to the pet)

### 6.5 Leaderboard and seasons
- 2-week seasons, boards reset, badges persist
- Only outside-buyer earnings count; self-funded and owner-linked wallets are excluded
- One ranked pet per Seeker (Genesis Token) or per SKR-staked Android

## 7. Requirements

### Functional
| ID | Requirement |
|---|---|
| F1 | Pet creation binds pet to owner wallet; one active pet per owner (hackathon) |
| F2 | Jobs carry: type, language, content, price, required answers (1 or 3), deadline |
| F3 | Router assigns jobs by language match, reputation, availability, fairness (no worker hogs) |
| F4 | Every job's funds are escrowed before it is routed |
| F5 | Payout split: 90% to pet wallet, 10% platform; auto-answer jobs deduct inference cost from pet share |
| F6 | Gold questions ≥10% of each worker's first 50 jobs; failing gold lowers reputation |
| F7 | Leaderboards recompute from onchain events; season snapshot published onchain |
| F8 | Share cards render as images with pet art, stats, deep link |
| F9 | Push notifications for jobs, hunger, rank changes |
| F10 | Public dashboard shows live traction metrics from chain + DB |

### Non-functional
- Job push to answer submit: under 3 seconds of app latency
- Onboarding without seed phrases for non-Seeker users
- Works on low-end Android (2GB RAM), poor connectivity (queue answers offline, submit when online)
- No PII in job content by policy; audio stored with consent, deletable
- All money movement verifiable onchain

## 8. Business model (fixed against the Frontier judge's rules)

### 8.1 Positioning
- **10-word line (business, Colosseum):** "AI companies pay Indian students instantly to check AI answers." (10 words)
- **10-word line (consumer, CLOCK IN):** "A phone pet that earns real money checking AI answers."
- **Web2 anchor:** "Think of Kage as Scale AI for Indian languages, where AI agents can hire humans by API and workers are paid in seconds."
- **Web2 comparables:** Scale AI, Toloka, Appen, and in India, **Karya** (pays Indians for Indian-language AI data). Market: AI training data and human evaluation [verify size with Grok / deep research before pitching].
- **Web3 comparables:** RentAHuman.ai (agents hire humans for physical errands, general), x402 infra (MCPay, Corbits). None do on-demand Indic human feedback with instant payouts.
- **Moat vs web2 (Scale/Toloka/Karya):** buyable per task from code (x402 + `ask_human`), no contracts or minimums; workers paid in seconds in USD, not weeks later; portable onchain reputation; a game loop that keeps workers active (their cost is recruiting and churn).
- **Moat vs web3:** supply. A trained, reputation-scored pool of Indian-language workers is the liquidity; agents go where the humans are.
- **Build on top, not head-on:** plug into existing x402 directories and MCP clients as a supplier. We do not fight Scale for enterprise contracts; we own the long tail of agent builders and Indic AI teams.

### 8.2 Revenue lines (the pet is the retention layer, not the business)
| Line | Price | Take |
|---|---|---|
| A. Pay-per-task API (`ask_human`, x402) | $0.05-$0.50 per judgment (more for audio and expert review) | 25% of job value |
| B. Managed eval/dataset contracts for AI teams (Indic RLHF, eval sets, voice data) | $2k-$10k per month per customer | ~40% gross margin after worker pay |
| C. Cosmetics/food (SKR or USDC) | small | 100%, never pay-to-earn |

### 8.3 Path to $1M ARR (assumptions stated, all to be tested)
| Driver | Assumption | ARR |
|---|---|---|
| B. Contracts | 15 AI teams x $4k/month average | $720k |
| A. Per-task API | $1.2M/yr job value x 25% take | $300k |
| **Total** | | **~$1.02M** |

Supply needed: roughly $1.3M/yr paid to workers. At ~$70/month (≈₹6,000) per active worker, that is **~1,600 active workers**: about 20 college clubs of 80 students. Buyer acquisition is founder-led sales; worker acquisition is college ambassadors + in-app referral (target CAC under $2 per activated worker, assumption).
If after the hackathon no buyer pays above $2k/month for Indic evals, revenue line B fails: pivot the supply to a bigger market (global English evals) or stop.

### 8.4 One-year test
In a year this is "the Indic human-feedback network AI agents call by default", with the pet app as the worker front end. The team must be willing to do B2B sales to AI teams full-time. If not, do not build this.

### 8.5 User acquisition plan
| Stage | Workers (students) | Buyers (AI teams) |
|---|---|---|
| Who | Indian college students, 18-24, bilingual, Android | Teams shipping AI for Indian users (support bots, voice agents, Indic LLMs), Solana agent builders |
| Reach | College tech/lit clubs, Superteam India, campus ambassadors, Instagram/WhatsApp share cards | Founder DMs on X/LinkedIn, Superteam India AI builders, x402/MCP directories, Indic AI communities |
| Message | "Your pet earns real money while you check AI answers in your language" | "Get 500 Hindi answers human-checked by tomorrow, pay per task, from code" |
| Convert | Google login, first paid job in the first minute | Free 50-task pilot, then paid |
| Keep active | Hunger loop, leaderboards, leagues, higher-paying jobs with reputation | Quality reports, same-day turnaround, volume pricing |
| Offboard | Withdraw anytime; dead pet returns balance | Export all results; no lock-in |

### 8.6 Day-1 actions (before more code)
1. Tweet the idea and the 10-word line; watch replies.
2. Run Grok: "What does Crypto Twitter and AI Twitter say about paying humans for AI feedback via crypto, RentAHuman, Karya, Scale AI in India?"
3. Message 20 AI teams; get 3 paid pilots.
4. Read all Colosseum blog posts; answer the YC, Alliance and Solana Incubator application questions for Kage.
5. Open-source the repo from day 1.

## 9. Risks and mitigations
| Risk | Mitigation |
|---|---|
| No buyers means no earnings | Sign 3 buyers before Oct 3; team sells, not only builds |
| Circular economy (pets paying pets) | Only outside-buyer money counts on boards; public dashboard shows the outside share |
| Low-quality answers | Gold questions, consensus, reputation-weighted routing, buyer reject window |
| India money-game law (2025 Act) | Users earn by working; no deposits to play, no odds, no prize pools from users. Lawyer review before public India launch |
| Tax/compliance | USDC income is taxable; in-app guidance; cash-out only via FIU-registered exchanges; legal review of payouts to Indian residents |
| Sybil/fraud workers | One ranked pet per Seeker/SKR stake, device integrity checks, gold questions, payout holds for new accounts |
| Art quality decides retention | Commission distinctive pet art in week 1; no generic AI-template look |

## 9.1 Weak spots and fixes

| # | Weak spot | Fix |
|---|---|---|
| 1 | **No buyers = no jobs = no product** (biggest) | (a) Free 50-task pilot that converts to paid; promise "results in 24h or free". (b) Target teams already paying for this today: Indic AI startups, support-bot and voice-agent builders, Solana agent teams. (c) List `ask_human` on x402/MCP directories so agents find us without sales. (d) **Grant-funded open benchmark:** apply for a Solana Foundation / Superteam public-goods grant to build an open Indic AI evaluation set; the grant is a real buyer paying real workers, and the dataset is a public good (fits Colosseum's Public Good prize too) |
| 2 | **Tiny pay per task breaks $1M ARR** | Three pay tiers: Basic (students, homemakers: $0.05-0.50), Skilled (voice, phone-use demos: $0.50-3), **Expert** (verified doctors, lawyers, engineers, teachers: $1-10). Monthly contracts sell mostly Skilled + Expert work |
| 3 | **Only students** | Students are the first group; the app is for anyone with a phone and a skill (homemakers, gig workers between rides, small-town users, professionals, Seeker owners worldwide). Pitch: "Anyone in India with a phone and a skill can earn from AI. We start with students because we can reach 1,000 in a week" |
| 4 | **Experts may be fake** | Verify before Expert jobs: a qualification test task + credential proof (e.g. DigiLocker certificate or registration number checked by a reviewer); issue an "Expert" attestation on Solana (SAS) that other apps can reuse |
| 5 | **Rural and non-crypto users cannot turn USDC into rupees** | "Withdraw to UPI" through an FIU-registered on/off-ramp partner inside the app (evaluate Onmeta, Transak India, others) [verify partner coverage]; minimum withdrawal to keep fees low; users can also keep dollars |
| 6 | **Seeker owners are mostly not Indian** (CLOCK IN) | English job types from day 1 (rate AI answers, fact checks, phone-use demos) so every Seeker owner can play |
| 7 | **Karya / Scale AI already exist** | We are not a dataset agency. We are **on-demand, per task, callable from code by any AI agent**, with workers paid in seconds and a game that keeps them active. Web2 players need contracts and pay weekly |
| 8 | **Bad-quality answers** | Gold questions, 3-person consensus, reputation-based routing, buyer reject window (already in §7) |
| 9 | **Gig workers doing jobs while driving** | No jobs while the phone is moving fast (motion sensor check); jobs are short and pausable |
| 10 | **Privacy in phone-use demo recordings** | Record only allowlisted apps, auto-blur text fields and faces, user reviews the clip before upload, delete anytime |
| 11 | **India money-game law** | Users earn by working; no deposits to play, no odds, no prizes funded by users; lawyer review before public launch |
| 12 | **Pet art decides retention** | Commission a distinctive artist in week 1; no generic AI-style art |

The one fix that decides everything is #1. Spend the first 3 days selling, not coding.

## 10. Milestones
| Date | Milestone |
|---|---|
| Sep 25-27 | 20 buyer conversations, 3 committed; art direction locked; repo scaffold |
| Sep 28-30 | Anchor program (escrow, settle, pet, death); x402 endpoint + `ask_human` MCP on devnet |
| Oct 1-3 | Expo app: onboarding, pet, job flow, push; mainnet; first real paid jobs |
| Oct 3-5 | Leaderboards, share cards, referral, dashboard; 150 pets via college clubs + Superteam India |
| **Oct 6** | Demo-ready, metrics frozen for the pitch |
| Oct 7 | APK, deck, demo video |
| **Oct 8** | Submit CLOCK IN |
| Oct 9-10 | Colosseum pitch + technical videos |
| **Oct 11** | Submit Colosseum + Superteam Earn |

## 11. Submission checklists
**CLOCK IN:** Android APK · GitHub repo · demo video · pitch deck · (winners publish on dApp Store)
**Colosseum / Superteam India:** Colosseum portal (country = India) · Superteam Earn listing · pitch video · technical demo video · repo · live app URL · traction evidence
