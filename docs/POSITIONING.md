# Scrappy: positioning v3 (verified real-world answers for AI)

Locked 2026-09-26. Replaces v2 "the Human API" (in git history). Scoring and competitor research: `ideas/colosseum-cwf-2026-superteam-india/IDEAS.md` (pivot scorecard).

## One line
**When AI needs to know what's true in the real world, Scrappy sends a nearby human to check, with proof.**

10-word version: *"Is this shop real, open, and selling it? Scrappy checks."*

## The problem
AI agents cannot see the physical world. Is this shop open today? Is this product on the shelf, at what price? Does this business on a loan form really exist at that address? The internet is stale or wrong on exactly these questions, and the agent has no way to find out.

## What Scrappy is
An API that turns a question about a real place into a **verified fact**:
1. An agent asks (API, SDK `findHuman()`, or MCP `scrappy_find_human`) with a place, a question, the proof it needs, and a budget.
2. The nearest qualified human with the Scrappy app gets a notification, walks there, photographs it, answers.
3. Scrappy checks the proof before paying: real image bytes, GPS inside the radius, fresh timestamp. "468 m away" is refused; "4 m" is accepted.
4. The **Seeker phone signs the proof** (photo sha256 + GPS + time + task id) and the record is anchored on Solana, so anyone can verify it without trusting Scrappy.
5. The human is paid in USDC in seconds. The agent gets `{answer, verified, proof: [photo, sha256, distance_m, captured_at, signature, tx]}`.
6. The fact is stored and **reused**: the next agent asking the same thing inside its freshness window gets it instantly, cheaper, with no new visit.

We sell **facts with proof**, not people's time.

## Who pays
| Buyer | Question | Today they use |
|---|---|---|
| AI shopping / commerce agents | In stock? Price? Open now? | Nothing (stale web data) |
| Lenders, NBFCs, underwriting agents | Does this business exist at this address, is it operating? | AuthBridge / Awign field agents: slow, contract-only |
| Maps, listings, data companies | Is this place still open, still here? | Their own field teams, crowd apps |

## Who earns
Students first (India: Mangalagiri, Guntur, Vijayawada), then anyone with a phone. Tasks take 2 to 10 minutes, pay $0.30 to $1, paid on submit. The pet grows with real work and keeps them coming back.

## Anchors
- Web2: **"Scale AI for the physical world."** Field Agent (1M+ users, $3 to $20 audits), Premise (140+ countries), AuthBridge (India field verification) prove people pay for "go check this". Retail crowdsourcing market ~$1.8B (2024) to ~$6.7B (2033) [cited in IDEAS.md].
- Web3 / agents: RentAHuman (YC) proves agents want to hire humans, on Solana with USDC escrow, but sells bookings of time, with no proof. XYO / Hivemapper / NATIX prove location of devices, not facts answered by humans.
- **Our spot:** built for AI agents AND proof-checked. Nobody holds both.

## Moat (why they can't just copy it)
1. **Phone-signed proof on Solana**: device-signed evidence verifiable by anyone. Needs the Seeker (Seed Vault / MWA signing).
2. **Reusable fact store**: every check becomes a dated, verified fact about a place. Grows with use; resold at near-zero cost.
3. **Supply where buyers are**: Indian students near the shops and businesses lenders need checked.
4. **Speed**: minutes, per call, by API; incumbents are 24 to 72 hours by contract.

## Business
- Per check: agent pays $0.30 to $1 (lender checks $2 to $3); worker gets 80%, Scrappy 20%.
- Fact reuse: resold facts are ~100% margin.
- Path to $1M ARR (assumptions to test): 5 lenders x 2,000 checks/month x $2.50 ≈ $300k; shopping/data agents 3,000 checks/day x $0.60 x 20% ≈ $130k plus reuse revenue; grows with cities. [unverified until first buyers]

## Pitch lines
- "Field Agent and AuthBridge proved people pay for real-world checks. RentAHuman proved AI agents want to hire humans. Scrappy is the first to give AI agents real-world answers with proof, in minutes."
- Demo: agent asks → phone buzzes → photo → "468 m, refused" → "4 m, signed, paid" → agent verifies on Solana and acts.

## Scope for the hackathons
| Piece | Status |
|---|---|
| Place + photo/GPS proof checked before payout, nearby routing, evidence to agent | DONE (d92d6d7, db63533) |
| Worker app: tasks near you, directions, camera + GPS | DONE |
| SDK `findHuman`, MCP `scrappy_find_human`, ShopBot shelf check | DONE |
| Seeker-signed proof + Solana anchor + agent-side verify | MUST |
| Reusable facts `GET /v1/places/:id/facts` with freshness | MUST |
| Landing page rewritten to this positioning | MUST |
| Mainnet + real buyers + 30 workers + 100 verified checks | MUST |
| Photo content check (item actually in frame) | SHOULD |
| SKR stake for worker reputation | SHOULD |

## Not building
Hourly human booking marketplace (RentAHuman's game) · generic task marketplace · annotation platform · token · anything with fake numbers.
