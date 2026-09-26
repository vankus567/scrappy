# Scrappy Battles: TODO

**Idea:** pet PvP for Seeker with your real pet's face, settled on Solana. No AI anywhere. Spec: `docs/SCRAPPY-BATTLES.md`.
**Deadlines:** CLOCK IN **Oct 8** (APK + repo + demo video + deck) · Colosseum + Superteam Earn **Oct 11** (hard Oct 12).
**Rules:** real product, no mocks, no real-money wagers (food/XP stakes + sponsor prizes only), ask before every GitHub push.

Legend: [B] build · [P] people/traction · [S] submission

---

## Done (reusable)
- [x] 12 pet species with animations, moods, dances, evolutions
- [x] Hunger / feeding system, revive
- [x] Blue worker UI (`../scrappy-classic`), wallet connect (desktop + Android MWA)
- [x] Hono + SQLite API on the VPS, Vercel site, APK pipeline (TWA)
- [x] Scrappy pet SVG icon

## Day 1-2 (Sep 27-28): battle rules
- [x] [B] Battle engine: 5 rounds, Attack / Guard / Trick, first to 3, ties, timeouts
- [x] [B] Species elements table + small counter bonus; level edge capped
- [x] [B] Unit tests for every rule and edge case
- [ ] [P] Tweet the idea + one pet battle GIF; post in Superteam India Discord
- [ ] [P] Verify: India Online Gaming Act 2025 scope, dApp Store publisher policy on games/stakes

## Done early (Sep 26): battle API
- [x] [B] API: create / join / quick match / cancel / commit / reveal, food stakes in escrow, async 12 h round deadlines, show-up and refuse-to-reveal rules (36 tests pass)

## Done early (Sep 26): battle screens
- [x] [B] Lobby + arena in the blue app, Battle tab; two-browser battle e2e passes with zero console errors

## Day 3-4 (Sep 29-30): Solana program
- [ ] [B] Install WSL2 + Solana CLI + Anchor (still missing on this machine)
- [ ] [B] `scrappy_battles` program: create_match, join_match, commit_move, reveal_move, settle, forfeit
- [ ] [B] Escrow PDA for food/XP stakes; small settle fee
- [ ] [B] Session key so moves don't pop the wallet every round
- [ ] [B] LiteSVM tests: normal win, tie rounds, forfeit, cheating reveal rejected
- [ ] [B] Deploy to devnet

## Day 5 (Oct 1): live matches
- [ ] [B] Matchmaking: friend challenge link, quick match, QR in person
- [ ] [B] Real-time round sync (WebSocket on the API)
- [ ] [P] **Start inviting players:** 2 college clubs, Superteam India, friends' WhatsApp groups

## Day 6-7 (Oct 2-3): battle screen
- [ ] [B] Battle UI with pet animations as hits, dodges, wins, losses
- [ ] [B] Sound, haptics, shake effects; reduced-motion fallback
- [ ] [B] One-tap flow: open, pick opponent, fight, result, rematch
- [ ] [P] First college tournament (weekend), log real battle counts

## Day 8 (Oct 4): photo face + async battles
- [x] [B] Photo face: pick/take photo, circle crop, clip into Scrappy body, animates with body (browser e2e passes)
- [x] [B] Photo stays on device (report button comes with sharing)
- [x] [B] Async battles: moves whenever each player opens the app (12 h rounds)
- [ ] [B] Push "your turn" notification
- [ ] [B] "Beat my pet" open challenges

## Day 9 (Oct 5): retention + viral
- [ ] [B] Home shows open battles waiting for your move
- [ ] [B] 5 free battles a day, streaks, weekly season leaderboard
- [ ] [B] Wins evolve pets (existing art)
- [ ] [B] Auto 10-second replay clip + share card; invite feast for both pets

## Day 10 (Oct 6): SKR + freeze
- [ ] [B] SKR buys food / cosmetics / extra battles; part burned
- [ ] [B] Season SKR rewards from a sponsor pool (no player bets)
- [ ] [B] Security pass: program constraints, commit-reveal salts, rate limits
- [ ] [P] **Checkpoint: 200+ real players, 1,000+ battles on Solana.** Record real numbers
- [ ] **Freeze features**

## Day 11 (Oct 7): ship
- [ ] [B] Mainnet program deploy
- [ ] [B] APK build, test on a real Seeker; dApp Store submission started
- [ ] [S] Record the demo (one room): photo of my real cat becomes the fighter's face → async battle a friend answered → live battle with the judge's phone → settle on Solana → share clip
- [ ] [S] Deck: problem, twist (your real pet's face), demo, traction numbers, business, SKR

## Day 12 (Oct 8): CLOCK IN
- [ ] [S] Open-source check (no secrets, no keystore), ask, then push repo
- [ ] [S] **Submit CLOCK IN:** APK + repo + video + deck

## Oct 9-11: Colosseum + Superteam India
- [ ] [S] Pitch video (business + traction first) + technical video (program, commit-reveal, async battles)
- [ ] [S] Answer YC / Alliance / Solana Incubator questions; roast deck and copy
- [ ] [S] **Submit Colosseum (country India) + Superteam Earn (Oct 11)**

## Every day
- [ ] Build-in-public post (clip, real number, player quote)
- [ ] Log real metrics: players, battles, on-chain settles
- [ ] Ask before any GitHub push

## Cut order if late
1. QR in-person battles
2. SKR burn (keep SKR purchases)
3. Replay clips (keep share card)
Never cut: photo face, on-chain settle, the demo flow.
