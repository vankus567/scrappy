# TIDEPOOL (working name) - spec v0, 2026-09-28

A pocket handheld where every creature is a real Orca Whirlpool liquidity position.
The position NFT is the save disk. The screen never says "wallet", "LP", "tick" or "range".

10 words: **"Raise a tiny sea creature that earns while you sleep."**

## Mission
Make the hard parts of DeFi as easy as playing a game, so a brand-new user can do them without
learning the jargon. Liquidity provision is the first title. Every game rule maps 1:1 to a real
onchain action, so playing IS using DeFi, and the player learns the real thing without being taught.
Later titles follow the same rule (lending, staking, perps hedging), all on the same handheld.

Design rules that follow from this:
- A new player finishes the first real action (hatch = open a position) in under 60 seconds.
- No DeFi word on screen in the main loop. An optional "true view" shows the real numbers for curious players.
- Risk is shown as game state, never hidden: a stranded creature = out of range, a shrinking shell = value below what you put in.
- Every button press is a real transaction or a real chain read. Nothing is simulated.

Inspiration: PIXMON BOY (Monad). We take the idea "DeFi position as a handheld game"; the name,
creatures, world and loop below are ours.

## World mapping (game word -> chain fact)

| On screen | On chain | Source |
|---|---|---|
| Creature / egg | One Orca Whirlpool position NFT owned by the player | `fetchPositionsForOwner` |
| Species | Pool pair (SOL/USDC = Tidefish, ...) and range width (narrow = Eel, wide = Turtle) | position + pool accounts |
| Water level | Current pool price inside the position's price band | `whirlpool.sqrtPrice` vs tick bounds |
| Creature is feeding | Price in range, liquidity active, fees accruing | same |
| Stranded / tide out | Price left the range, no fees | same |
| Food in the bowl | Fees owed right now | `collectFeesQuote` (whirlpools-core) |
| Eat (A) | Harvest: collect fees to the player | `harvestPositionInstructions` |
| Size / level | Lifetime fees harvested, read from chain history | tx history of the position |
| Feed more | Add liquidity | `increaseLiquidityInstructions` |
| Move to a new pool | Rebalance: close + reopen around current price | close + `openPositionInstructions` |
| Release to the sea | Close position, funds back | `closePositionInstructions` |
| Insert cartridge | Seeker: Mobile Wallet Adapter / Seed Vault. PC: device key in IndexedDB, exportable | |

Every number shown comes from chain reads. No simulated yield, no fake pets.

## Core loop (the demo)
1. Boot: "INSERT CARTRIDGE" -> signer connects (no wallet word).
2. Hatch: pick a pool and a temperament (calm = wide band, bold = narrow band), feed it SOL.
   The handheld swaps half to the pair token and opens the position. Egg hatches.
3. Tide screen: creature swims while price is in band, food pellets fill as fees accrue.
4. A = eat (harvest). Creature grows. Tide goes out -> creature stranded -> "move pool" prompt.
5. Release returns funds.

## Build order
1. Engine `packages/console` (Pyxel-style TS: 16 colors, 4-ch chiptune, input, carts) - in progress
2. Chain layer: Orca SDK on devnet (pool read, positions by owner, open/harvest/increase/close), device-key signer
3. Game: title, hatch, tide screen, menu; creatures drawn in the engine
4. Handheld shell: bespoke device body with d-pad/A/B, touch + keyboard
5. MWA on Seeker, TWA build, mainnet with small amounts
6. Share card: "my Tidefish earned $0.42 this week" image

## Versus PIXMON BOY (github.com/xfajarr/pixmonboy, Monad Blitz Jakarta, Aug 2026)
Theirs: DOM/CSS console, Privy login, 480x320 grid, "STAY IN RANGE" scores time-in-range on real pool reads,
but the save disk is a keeper-signed record in their own DiskRegistry on testnet, not the player's LP.
Also a 10-second UP/DOWN price call (MONSPELL), which we skip (reads as betting; India law risk).
Ours: the save disk IS the player's own Orca position NFT (real liquidity, real fees, player-signed),
a real pixel engine (canvas, chiptune), Seeker-first with MWA. That is the "why ours wins" line.

## Open risks
- Devnet Orca pools have thin, synthetic prices: the tide may never move. Mitigation: mainnet with $1 positions for the demo.
- Impermanent loss is real: the game must show "worth now vs worth when hatched" honestly.
- Clone perception vs PIXMON BOY: different name, creatures, ocean world, Seeker-first.
