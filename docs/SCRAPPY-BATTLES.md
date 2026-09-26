# Scrappy Battles: pet PvP for Seeker

Decided 2026-09-26. Replaces the verified-checks idea for CLOCK IN (that space already has Legwork, ProofQuest and PUNCH competing in the same hackathon). Mobile only: Android / Seeker APK.

## One line
**"Your real pet's face. Your Scrappy's body. Battle your friends on Solana."**

Web2 anchor: **Pokémon battles meets Clash Royale, starring your own pet.**

No AI anywhere in this project: plain game rules, a Solana program, and people playing people.

## The big idea
**Your real pet fights.** Take a photo of your cat or dog; its face goes onto a Scrappy fighter's body. Challenge friends: *"my Bruno vs your Luna"*.

Why it matters:
- **Emotional and viral:** people love and share their real pets. A share card of your real pet in the arena spreads itself.
- **Mobile-native:** uses the phone camera; the face moves with every animation.
- **Novel:** no pet PvP game found among CLOCK IN entries (search 2026-09-26), and none with your real pet's face.
- **Always an opponent:** async battles mean you can play anyone, even if they are offline right now.

## Core loop
1. Hatch your pet (1 Seeker = 1 pet) and give it your real pet's face.
2. Battle a friend live, or send an async challenge they answer later.
3. Wins evolve your pet's body and unlock cosmetics.
4. Come back: finish open battles, feed your pet, keep your streak.
5. Share the result card with your real pet in it.

## Battle rules (v1)
- 5 rounds. Each round both players secretly pick **Attack / Guard / Trick**.
  - Attack beats Trick, Trick beats Guard, Guard beats Attack. Same move: tie.
- **Species elements** (fire, water, ghost, leaf, spark, ...) give a small bonus against the element they counter, so choosing your pet is strategy.
- First to 3 round wins takes the battle. Timeouts forfeit the round.
- Pet level adds a small stat edge, capped so skill always matters more than grinding.
- Our existing pet animations (cheer, dizzy, shake, dances, moods) become hit, dodge, win and lose animations.

## Your real pet's face (no AI)
1. Take or pick a photo of your real pet.
2. Crop screen: pinch and drag so the face fits a circle, like setting a profile picture.
3. The photo sits inside the face area of the Scrappy body (our ears, arms, legs, tail around it) with a clean outline, so it reads as a sticker character, not a pasted image.
4. A plain canvas color filter warms and softens the photo so it matches our art style.
5. The face moves with every animation: bob, dance, get hit, cheer.
6. Safety: the photo stays on the phone unless the player shares it; a report button on other players' pets.

## Async battles (always an opponent, no AI)
- Challenge anyone; each player makes their round moves whenever they open the app (like Words with Friends).
- Moves are still committed secretly on-chain, so waiting gives no advantage.
- Push notification: "Luna made her move. Your turn."
- Live battles when both are online; async otherwise. The game never feels empty.
- "Beat Bruno" open challenges: post your pet; anyone who beats it wins food/XP or a sponsor prize.

## Fair and trustless (Solana program)
Anchor program `scrappy_battles`:
- `create_match(stake)`: player A opens a match and locks the stake (pet food/XP in-game units, or sponsor tournament entry) in an escrow PDA.
- `join_match`: player B locks the same stake.
- `commit_move(hash)` then `reveal_move(move, salt)` for each round: nobody, including us, can see or change a move before both commit.
- `settle`: the program computes the winner from the revealed moves and pays out the escrow minus a small fee. No server decides.
- `forfeit`: after a timeout, a player who stopped responding loses.
- Every battle is replayable and checkable from on-chain data.
- Session key approved once per session, so there's no wallet pop-up on every move.

## Seeker-native
- **Seed Vault** signs moves and battle results.
- **1 Seeker = 1 pet** via the Seeker Genesis Token: no bot farms.
- **In person:** scan a friend's QR with the camera and fight phone to phone.
- **Haptics** on every hit, sound, shake effects.
- Published on the Solana dApp Store (required to claim CLOCK IN prizes).

## Stakes (legal)
- **No real-money wagers.** India's 2025 Online Gaming Act bans real-money online games, including skill games [from memory, verify]. The dApp Store / Google Play gambling policy must also be checked [unverified].
- What you stake instead: **pet food and XP**. The winner takes the loser's food from escrow. Real tension, no gambling.
- **Sponsored tournaments:** free entry, prizes paid by sponsors (Solana projects wanting new users).
- The escrow program is built so real-money stakes could be switched on later only where legal, after a legal check. Off at launch.

## SKR ($10k SKR prize)
- SKR buys food, cosmetics and extra daily battles; **part of every SKR spend is burned** (the Pumpville pattern).
- Top players each season earn SKR from a **sponsor pool**, never from player bets.

## Retention
- Daily hunger (existing system), 5 free battles a day, win streaks.
- Open async battles waiting for your move every time you open the app.
- Weekly seasons and leaderboards; evolutions from wins (existing art).

## Viral loops
- **Challenge links** on WhatsApp / X: "My Ember vs your Boo, tap to fight."
- **Auto-made 10-second replay clips** after each win, ready to share.
- **"Beat my pet" bounties** that anyone can take on.
- Invite a friend and both pets get a feast.

## Business (for Colosseum)
- Cosmetics and skins, season pass, sponsored tournaments.
- Small fee on escrow settlements (in-game units now; real-money only where legal).
- Numbers for the $1M ARR path must come from real players; no invented figures in the deck.

## Demo (60 to 90 seconds, one room)
1. Photograph my real cat; its face appears on a Scrappy fighter.
2. Show an async battle a friend answered earlier: "Luna made her move."
3. Challenge the judge's phone live: 5 rounds, animations, haptics.
4. The Solana program settles the match; open the transaction in Solana Explorer.
5. Share the replay clip.

## Competition check (2026-09-26)
- CLOCK IN entries found: Legwork, ProofQuest, PUNCH (proof of presence), Kin (savings circles), ClockLend, bozPledge (habit pledges), Solanazation (4X strategy). **No pet PvP game found.**
- Past MONOLITH grand prize: Pumpville (live multiplayer game with a burn token economy). Games can win; ours is PvP with your real pet's face, not a shared town.

## What we reuse
12 pet species with animations, moods and dances; evolutions; hunger/feeding; wallet connection; blue UI (`../scrappy-classic`); APK pipeline; Hono + SQLite server.

## Build plan to CLOCK IN (Oct 8)
| Days | Build |
|---|---|
| 1-2 | Battle rules engine, species elements, tests |
| 3-4 | Anchor program: escrow, commit-reveal, on-chain settle, forfeit; LiteSVM tests |
| 5 | Live matches: friend link, quick match, QR in person |
| 6-7 | Battle screen: pet animations, sound, haptics |
| 8 | Photo face (crop, clip into body, color filter, animates) + async battles with push |
| 9 | Morning report, streaks, evolutions, replay share clips |
| 10 | SKR food/cosmetics with burn |
| 11 | APK on a real Seeker, record demo |
| 12 | Buffer, **submit Oct 8** |

## Traction target (the part code can't fake)
By Oct 6, all real:
- 200+ real players (college tournament in Mangalagiri/Guntur + Superteam India Discord)
- 1,000+ battles recorded on Solana
- One weekly tournament with a small sponsor prize
- Share clips posted by real players
Start inviting players on day 5, when live matches work.

## Honest score
- Built well + 200 real players: ~9/10 for CLOCK IN
- Built well, no players: ~7.5
- Colosseum: ~7.5 to 8 (consumer game; needs traction and a business story)

## Risks
1. **Legal:** real-money wagers would be illegal for an Indian team. Mitigation: food/XP stakes and sponsored prizes only.
2. **Cold start:** few players means no live matches. Mitigation: async battles, open "beat my pet" challenges, college tournaments.
3. **Scope:** 12 days is tight. Mitigation: cut SKR burn or QR battles before cutting the photo face or on-chain settle.

## Not building
Real-money betting, a shared open world (Pumpville's space), NFT speculation or trading markets, pay-to-win stats.
