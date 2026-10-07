<div align="center">

# SCRAPPY BOY

### Trading apps have 47 buttons and a textbook of words. This one has four.

[![tests](https://img.shields.io/badge/tests-39%20passing-brightgreen)](https://github.com/vankus567/scrappy)
[![live](https://img.shields.io/badge/live-scrappy--plum--gamma.vercel.app-blue)](https://scrappy-plum-gamma.vercel.app/scrappyboy)
[![stack](https://img.shields.io/badge/stack-Next.js%2016%20%C2%B7%20React%2019%20%C2%B7%20Bun-black)](https://github.com/vankus567/scrappy)
[![license](https://img.shields.io/badge/license-MIT-blue)](https://github.com/vankus567/scrappy/blob/main/LICENSE)

[Play it](https://scrappy-plum-gamma.vercel.app/scrappyboy?net=devnet) · [Download the APK](https://scrappy-plum-gamma.vercel.app/scrappy.apk) · [Run it](#-see-it-in-one-command) · [Honesty table](#whats-real-vs-pending--the-honesty-table)

</div>

A handheld console in the browser. Every button press is a Solana action: buy, sell, open a
liquidity position, harvest the fees it earns, close it and walk away with the change. The price
you ride is the live SOL price, the coins are the ones actually trading today, and the transaction
log under the console links to the explorer for every move.

The trick is that your wallet signs exactly once. The console mints an ephemeral keypair on the
device the first time it boots, you load that key with whatever you are willing to lose, and from
then on every trade is signed on-device with no popups. `X` sweeps the balance back to your real
wallet. Lose the phone and you lose what is in the coin slot, never the wallet.

```
ONE WALLET SIGNATURE  →  EVERY MOVE AFTER IT SIGNED ON DEVICE
```

## Live status

| Surface | Status | The evidence |
|---|---|---|
| The console | **live** — | [scrappy-plum-gamma.vercel.app/scrappyboy](https://scrappy-plum-gamma.vercel.app/scrappyboy) returns 200 |
| Free devnet demo | **live** — | [?net=devnet](https://scrappy-plum-gamma.vercel.app/scrappyboy?net=devnet) ; the landing's Play button points here |
| Android build | **served** — | `GET /scrappy.apk` → 200, `application/vnd.android.package-archive`, 1,101,555 bytes, package `app.scrappypet` |
| App-link handshake | **live** — | `/.well-known/assetlinks.json` returns 200 with the APK's SHA-256 fingerprint |
| Chain moves | **verified** — | Eleven devnet transactions read back from the chain, all `err: null`, play key as fee payer |
| Test suite | **39 pass, 0 fail** — | `bun run verify` (typecheck, lint, tests) |
| On-chain save card program | **deployed on devnet** — | [`Dygz…FRb2`](https://explorer.solana.com/address/DygzrTDfuuM8UYVRHkYvqkpfFN6G4AgnTEHSJYqyFRb2?cluster=devnet); the console writes every finished round to it |

## The 20-second pitch

Nobody outside crypto wants to learn an order book, a slippage setting and a seed phrase before
making their first trade. SCRAPPY BOY removes all of it: pick a coin with left and right, choose an
amount, press A. A safety net sells automatically at -8% and a treasure line takes the profit at
+15%, so a new player can hold a real position without knowing what a stop is. The console shape is
the product, not decoration: four buttons make the choices obvious and the trade is a real swap on
Solana either way.

## ▶ See it in one command

The free path, with nothing to install and no wallet. Open
[scrappy-plum-gamma.vercel.app/scrappyboy?net=devnet](https://scrappy-plum-gamma.vercel.app/scrappyboy?net=devnet),
press START, pick MEME DASH, pick $1, press A. That is a real Orca swap on devnet:

```
MEME DASH buy  USDC   4drxnsJXuV9V6V9vFfHbNieXvzyAAPvY8WxxQZeyRHh4BGWSk1fqBrCVXKnXsPuusiwGghf696gUdERTAMUuRovq
MEME DASH sell USDC   4FRm584Uk2WDtsC1yeiEtye7EPaxexDqThW8NRzgbmBkH6qaXM1w7PpmvexAQzLhHZ9GsqqXoSqVP6wr9VFfD5Lc
```

Read it back off devnet and it is confirmed, with the play key paying the fee:

```
$ solana confirm -v 4drxnsJXuV9V6V9vFfHbNieXvzyAAPvY8WxxQZeyRHh4BGWSk1fqBrCVXKnXsPuusiwGghf696gUdERTAMUuRovq -u devnet
RPC URL: https://api.devnet.solana.com
Default Signer Path: issuer.json
Commitment: confirmed

Transaction executed in slot 507391021:
  Block Time: 2026-10-04T19:43:19+05:30
  Version: 0
  Recent Blockhash: 7pESos8N3tB9DfjpXNJUdxi7gS4FSw4BhXkDbeGWVrD1
```

The whole DEEP NET lifecycle, on the same play key:

```
cast: trade half for USD   2x2q3BYBStF3PMNpSeMvZna2VLQWpLxrPG6uVgNmxBmkgtHPMWGnMwrzPa9vXpg8i6f2XkpLuLGUVEbqFv3BBs2M
cast: open the position    PiBuvfguPsgtBLVbNL23xgazpHTTPpd1xa5J6o3ViU17ioEGwiuKoqt19QrZFg9bSbt6PQ51Z9RrAeQdnE43zrB
collect coins (harvest)    5b7adcQ4p4oksrzrpFx3Hh1LLjPzuHxTjKsynVefK4L9J8q2CJShBX7qaYfwEbqi5XPnZwAeTQgXp52FFDL4yQEJ
pull the net in (close)    4zG2BWgfy8QJckoW9zBpCKKif8Gw4rkHufpDjjYAdKP9qeJE7NJayE7f6NnNq3sxDFWxAcmoK9mVKdyfEMbeQHU9
```

The save card, checked live on devnet with the same client code the console ships
(`cd apps/web && bun scripts/savecard-e2e.ts`):

```
program        DygzrTDfuuM8UYVRHkYvqkpfFN6G4AgnTEHSJYqyFRb2
write 500      q5Y9UH8T6L6WNxinGAnKCGXSxnkV536WjRCFdjViG1tbMsZ3BcjoM2QguCrX8qxbdYnf2NJtNY9exRgfsKr65St
write 120      4zh4Kq8gsqwWjB9mNtCYTamgP65szbk4CDr6VxzdWVm6mr3JksriLa42zQ8LhhTuPM2x2guLH3KYWuYeAvKpr8sf
card           {"best":500,"last":120,"plays":2, ...}
PASS  best kept at 500 after a lower round, 2 plays
forged write  refused: Program log: AnchorError caused by account: save_card. Error Code: ConstraintSeeds. Error Number: 2006
PASS  another key cannot write into this card
```

## Verify every claim in one command

```bash
bun install && bun run verify
```

```
 39 pass
 0 fail
 132 expect() calls
Ran 39 tests across 7 files.
```

`bun run verify` is typecheck plus lint plus the suite, so it fails on any of the three.

## What SCRAPPY BOY is NOT

- **Not a simulation.** — The devnet carts send real transactions to Orca. The mainnet cart sends real
  Jupiter swaps. Nothing on screen is a canned number.
- **Not fractional-reserve fake money.** — The coin slot is a real keypair holding real SOL or tokens.
  The console can only ever spend what is inside it.
- **Not a wallet.** — It never asks for a seed phrase and never holds your main key.
- **Not a trading terminal.** — There is no order book, no leverage, no slippage field, no chart
  tools. If a control is not one of the four buttons, it does not exist.
- **Not finished everywhere.** — The save card trusts the score the device posts, and one cart
  depends on the devnet faucet being funded. Both are in the honesty table below.

## The problem I set out to solve

Every on-chain app eventually says "connect your wallet" and then asks the user to understand
something. Gas, slippage, token accounts, the difference between approval and signing. Each one is a
place where a normal person stops. The result is a product that only works for people who already
crypto.

The four-button console is an argument that this is an interface problem, not a UX polish problem.
If the entire state of a trade fits in a d-pad, an A button and a B button, the player never has to
learn any of it, and the complexity has to move somewhere it cannot be seen: into a scoped device
key, an automatic exit, and defaults that are safe enough to be the only options.

## What I built

| Piece | What it does |
|---|---|
| The console | A DOM/CSS shell around a 160×144 indexed-colour framebuffer with its own sprite bank, tilemaps, 4×6 font, sound and gamepad support |
| PLAY NOW | The free round: ride the live SOL price, no wallet, no chain, points only |
| MEME DASH | Pick a coin from the day's real movers, watch real 1-minute candles, press A to buy, B to sell |
| DEEP NET | Cast a band-shaped Orca liquidity position, harvest the fees it earns, pull it back in |
| The play key | The scoped device signer every cart spends through |
| Coin slot | The one thing the real wallet signs: a single top-up |
| Cash out | Sweeps the whole coin slot back to the real wallet, no popup |
| Save card | Every finished round is written to a PDA on Solana by the play key. The program only ever raises the best, and reads it back at boot |
| Daily quest and streak | A score target that resets daily, and a streak that survives a missed day only if you return |
| Share | A 1080×1080 result card with the run, plus a challenge link that names the score to beat |

## Architecture

```
        keypad / touch / gamepad
                  │
                  ▼
        ┌────────────────────┐        ┌─────────────────────┐
        │  console runtime   │◄──────►│  the cart           │
        │  160×144 + sound   │  frame │  PLAYa / MEME DASH  │
        └────────────────────┘        └──────────┬──────────┘
                                                 │ intents
                                                 ▼
        wallet ──one top-up──►  play key  ──signs──►  chain.ts
                                  │                     │
                          (device-resident)      Orca devnet │ Jupiter mainnet
                                                 ▼
                                          explorer link per tx
```

| Component | Module | Role |
|---|---|---|
| Console runtime | `apps/web/src/lib/console` | Canvas, integer scaling, input, cart loader, audio |
| The game | `apps/web/src/lib/scrappyboy/game.ts` | The save card, the rounds, the daily quest, the nets |
| MEME DASH | `apps/web/src/lib/scrappyboy/meme.ts` | Coin roster, candles, stakes, auto-exits, swaps |
| Chain | `apps/web/src/lib/scrappyboy/chain.ts` | Every read and write, the only place Orca is named |
| Play key | `apps/web/src/lib/scrappyboy/session.ts` | The device keypair, its scope and the sweep |
| Pools | `apps/web/src/lib/scrappyboy/pools.ts` | Which devnet pools are playable, scored from real data |
| Prices | `apps/web/src/lib/scrappyboy/prices.ts` | The live SOL feed the free round rides |
| The shell | `apps/web/src/app/scrappyboy/Shell.tsx` | Moulded-plastic console, real buttons wired to input |
| The screen | `apps/web/src/app/scrappyboy/Handheld.tsx` | Boots the cart, injects the play key, prints the tx log |
| RPC proxy | `apps/web/src/app/api/rpc/route.ts` | Same-origin mainnet RPC, because the public endpoint 403s browsers |
| Save card program | `programs/scrappy-arcade/src/lib.rs` | Anchor program for the on-chain score card and sessions |

| Network path | Cart | What signs | Cost |
|---|---|---|---|
| Free | PLAY NOW | nothing | none |
| Devnet | MEME DASH `?net=devnet`, DEEP NET | play key | free |
| Mainnet | MEME DASH (default) | play key | real funds |

## The play-key loop, step by step

1. **Boot.** The console loads, or mints, an ephemeral keypair in local storage. Nothing has been
   signed and no wallet is connected yet.
2. **One popup, ever.** Inserting a coin is a single transfer from the real wallet into that key.
   The wallet approves the size of the slot, not the trades.
3. **Play.** Buys, sells, opening and closing a net are signed by the device key and confirmed by
   polling. The console never waits on a websocket, because the public devnet endpoint hangs on one.
4. **Exit.** The safety net and treasure line sell without the player watching. Timeouts on a wallet
   prompt are bounded so a hanged approval cannot freeze the screen.
5. **Cash out.** `X` sends the slot balance back to the real wallet, signed by the device key, so it
   needs no approval either.

## Where the guarantee is enforced

| Guarantee | Where | The test that covers it |
|---|---|---|
| A dollar stake becomes the right lamports at the live price | `meme.ts` | `converts a dollar stake into lamports at the live SOL price` |
| A dead price feed cannot buy anything | `meme.ts` | `a dead price feed buys nothing` |
| The safety net fires at -8% or worse | `meme.ts` | `the safety net fires at -8% or worse` |
| The treasure line fires at +15% or better | `meme.ts` | `the treasure line fires at +15% or better` |
| A coin drifting inside the band stays open | `meme.ts` | `a coin drifting inside the band stays open` |
| Meme-coin dust keeps its precision instead of reading as zero | `meme.ts` | `meme-coin dust keeps precision instead of collapsing to 0.0000` |
| The pool cursor cannot leave the map | `pools.ts` | `the cursor never points off the map` |
| The cursor moves toward safer or hotter pins as stated | `pools.ts` | `RIGHT moves toward safer pools`, `UP moves toward hotter pools` |
| A fresh player starts at zero, not at a bonus | `streak.ts` | `a fresh player starts at zero` |
| A gap day resets the streak, a corrupt entry does not crash | `streak.ts` | `a gap day resets the streak`, `corrupt storage reads as zero, not a crash` |

## What the map measures

DEEP NET only shows pools a player can actually cast in. Playability is computed from Orca's own
devnet pool data: the depth of the pool, how gentle its fee tier is, how solid the quote coin is,
and how busy it is (24-hour volume against TVL). A pool with no volume has zero heat rather than a
made-up number. Two classes are filtered out entirely, because a cast in them cannot succeed: splash
pools, which only accept full-range positions and so can never hold the band this game casts, and
pools too thin to price a small swap.

That filter is not theoretical. Both remaining pins were cast, harvested and closed for real before
being listed.

## Where the model sits

Nowhere. There is no model in this game and no generated content in it. The sprites, the palette,
the font and the tunes are all committed assets and code. The only external services are Jupiter
(token list, prices, swaps), GeckoTerminal (mainnet candles), Orca (devnet pools and positions) and
the two RPC endpoints.

## Who approves what

| Actor | Approves |
|---|---|
| The player's wallet | One top-up into the coin slot, and nothing else |
| The play key | Every trade, automatically, within the slot balance |
| The safety net and treasure line | The exit, at -8% and +15%, without being asked |
| The pool filter | Nothing: it is a read, not a gate |

## Engineering decisions & the traps that taught me something

**The d-pad moved the net, not the fish, and players read it as inverted controls.** In the first
version of PLAY NOW the creature rode the live SOL price by itself and Up/Down steered the dotted net
band around it. Pressing Up lifted the net, so the fish looked like it dropped: "up goes down". The
fish also wandered on its own with the price and seemed to swim straight into the jellyfish, because
jellyfish spawned along the price line where the fish sat. The roles are now swapped: the d-pad
moves the creature, the net rides the price, and a jellyfish only hurts you when it touches the
fish. Measured after the change: Up moves the fish up (y 112 → 104), Down moves it back, the fish
holds still with no input, and a jellyfish 14 px away does no damage while one on the fish costs 15.

**An empty wallet left the top-up spinning forever.** The wallet was asked to send a devnet top-up
it could not pay for, or on a network it was not set to, and sat on a spinner. The console now
checks the wallet's balance first and says how much it needs, asks the wallet only to sign, and
sends the transaction itself on the network the console is playing on. No USDC is ever needed: the
top-up is SOL. On Android phones the wallet connects through Mobile Wallet Adapter, which was offered
both clusters and picked mainnet by default, so a devnet game held a mainnet session. It is now
offered only the cluster the page plays on (verified: the registered wallet advertises
`solana:devnet` on `?net=devnet`), and whatever the wallet refuses is printed under the console.

**The cast size was larger than the devnet pools could absorb.** The net was cast at 0.2 SOL, which
splits to 0.1 a side. On a devnet pool holding a few tens of dollars, that swap runs past the
initialized tick arrays and fails with `InvalidTickArraySequence`. It failed on the deeper pools and
succeeded on the shallowest, which is the confusing part: quote size, not pool reputation, decides.
0.02 is verified end to end, and the map now refuses to show a pool it has not priced.

**A listed pool is not a playable pool.** The first version showed five pins, including a splash pool
that can only take full-range positions and a pool with effectively no liquidity. Both looked fine
in the API response and both broke on cast. The discriminator is `poolType` plus real TVL, not the
liquidity field.

**No candle feed exists on devnet.** The devnet cart asked a mainnet price API for the history of a
test dollar, got a 404, and put an error screen in front of the player. There is no honest way to
draw that history, so the chart now draws the live price and says so.

**Confirm by polling, never by websocket.** The public devnet endpoint hangs on subscription
confirmation and some mobile networks drop it. Every write polls `getSignatureStatuses` with a block
height check, so a transaction that expired fails loudly instead of hanging forever.

**Integer scaling, because pixel art deserves whole pixels.** The console is drawn at 3×, 2× or 1×
and only falls back to a fractional scale when even 1× will not fit the phone.

**The play key secret is in local storage.** That is a deliberate trade, not an oversight: the key
is capped at what the player loaded into the slot, so the worst case is the slot. A native build
would hold it in the device keystore instead.

## What's real vs pending — the honesty table

| Claim | State |
|---|---|
| The console is live and playable | **Real.** — 200 on the public URL, Play button on the landing |
| Real swaps, on real pools | **Real.** — Seven devnet transactions verified on-chain during this audit |
| The play key signs every move | **Real.** — Fee payer and signer on every game transaction checked |
| 39 tests pass | **Real.** — `bun run verify`, 0 failures |
| The APK installs and runs | **Built and served.** — Not yet exercised on a physical device in this audit |
| `scrappy_arcade` on-chain save card | **Real, on devnet.** — Program `DygzrTDfuuM8UYVRHkYvqkpfFN6G4AgnTEHSJYqyFRb2`. A round played on the live site wrote its score in [`3mzP4qnw…`](https://explorer.solana.com/tx/3mzP4qnwNtsDhNw2k7jWoU6gufDuBVNdRhi9usbXAiVDLw8LQqdCZ87sTtGcMCkKatkkYTNKJbHcuQ2YRvTC7Wyg?cluster=devnet), and clearing the browser's storage brought the same best back from the chain |
| The score on the card is the score you played | **Not enforced.** — The program enforces who may write a card and that the best never goes down. It does not replay the round, so a modified client could post a number it never earned. Points are not money here, which is why that is acceptable for now |
| Mainnet MEME DASH | **Wired, not verified here.** — It needs real funds to exercise, so this audit did not touch it |
| TEST SOL faucet | **Broken by the network.** — The public devnet faucet answered 429 for every request; until it refills, that button cannot work for anyone, and the console now says exactly that instead of showing the raw error |
| The site linked here runs this repo's latest commit | **Yes.** — The deployment is built from the branch head |
| The installed APK opens this site | **No.** — The APK's start URL is baked into the signed binary and points at the older domain; changing it needs a rebuild with the same signing key |
| The devnet coin's price | **A fixed $1**, because it is a test dollar. It is not a market read |
| No candle history on devnet | **Cut, not faked.** — The chart draws the live price and labels the gap |
| License | **MIT.** — See [LICENSE](LICENSE) |

## Attack → test

| The abuse | The test that answers it |
|---|---|
| Trade against a dead price feed | `a dead price feed buys nothing` |
| Let a loss run past the safety net | `the safety net fires at -8% or worse` |
| Let a winner ride past the treasure line | `the treasure line fires at +15% or better` |
| Close a position that is still inside its band | `a coin drifting inside the band stays open` |
| Show a dust-priced coin as 0.0000 | `meme-coin dust keeps precision instead of collapsing to 0.0000` |
| Move the map cursor to a pin that does not exist | `the cursor never points off the map` |
| Break the map at its edges | `at the edge it wraps through the list instead of sticking` |
| Count two rounds in one day as two streak days | `playing twice in one day does not double-count` |
| Claim a streak after skipping a day | `a gap day resets the streak` |
| Corrupt local storage to fake a streak | `corrupt storage reads as zero, not a crash` |
| Overspend the real wallet | The play key can only spend the slot; the wallet's only transfer is the top-up |
| Write a score that wraps the on-chain u32 | `a score that does not fit a u32 is refused, not wrapped` |
| Pass some other account off as a save card | `some other account at that address reads as no card, not a fake score` |
| Lower your own best with a bad round | Live: `savecard-e2e.ts` writes 500 then 120, the card keeps best 500 |
| Write into someone else's save card | Live: `savecard-e2e.ts` signs with a second key, the program answers `ConstraintSeeds` (2006) |

## The app

`/scrappyboy` is the console. The landing page at `/` explains it and sends the Play button to the
free devnet cart, with a direct APK download beside it. The Android build is a Trusted Web Activity
over the same site, so the installed app and the web app are one codebase and one deploy; nothing
needs rebuilding when the site changes.

## Limitations

- The save card follows the play key, not the wallet: a new device starts a new card.
- The program trusts the posted score; nothing re-runs the round on-chain.
- The devnet faucet is dry, so a new player cannot get test SOL from inside the console right now.
- DEEP NET depends on live devnet liquidity. When those pools are empty, there is nothing to cast,
  and the map says so instead of inventing a pin.
- One coin exists on devnet. The interesting roster only exists on mainnet.
- No sound design pass yet: the console is muted on purpose rather than playing something unfinished.

## Security

The real wallet signs once, for the top-up, and its key never leaves the wallet. The play key is a
throwaway generated on the device and cannot spend beyond the slot. No seed phrase is ever requested,
no private key is committed, and the mainnet RPC is proxied same-origin with a body size cap so a
browser call does not leak the upstream endpoint's restrictions into the page. Secrets are not in the
repo; the file that would hold them is gitignored and a template is committed in its place.

## Tech stack

Next.js 16 with React 19 and Tailwind 4, Bun workspaces, `@solana/web3.js` for the top-up and the
play key, `@solana/kit` for devnet operations, the Orca whirlpool SDK for positions, Jupiter's Lite
and Price APIs for mainnet discovery and swaps, GeckoTerminal for mainnet candles, and Anchor 0.32
for the save card program.

## Project layout

```
apps/web/src/app/scrappyboy/      the handheld: shell, screen, styles
apps/web/src/app/api/             same-origin RPC proxy, token art proxy
apps/web/src/lib/scrappyboy/      the game, MEME DASH, chain, play key, pools, prices
apps/web/src/lib/console/         the pixel console runtime
programs/scrappy-arcade/          the Anchor program, deployed on devnet
apps/web/scripts/savecard-e2e.ts  live devnet check of the save card program
Anchor.toml, Cargo.toml           program build configuration
```

## Full command reference

```bash
bun install                        # workspaces: apps/*, packages/*
bun run verify                     # typecheck + lint + all tests
bun run dev                        # -> http://localhost:3000/scrappyboy
cd apps/web && bun run build       # production build
cd apps/web && bun run lint        # eslint alone
cargo build-sbf --manifest-path programs/scrappy-arcade/Cargo.toml   # the program
cd apps/web && bun scripts/savecard-e2e.ts                           # live devnet check, ~0.01 SOL
```

## How I'd deploy it

The site is a Next.js app deployed to Vercel, aliased to the public domain. The Android artifact is
built with Bubblewrap as a Trusted Web Activity and the signed APK is copied into the web app's
public folder so the landing can serve it; `assetlinks.json` ties that signature to the domain, and
must match the keystore used for the build or the app opens with a browser bar instead of full
screen. The program ships with the stock loader:
`solana program deploy target/deploy/scrappy_arcade.so --program-id target/deploy/scrappy_arcade-keypair.json -u devnet`.

## Tests

```bash
bun run verify
```

39 tests across 7 files. The carts' own rules are covered in
`apps/web/src/lib/scrappyboy/meme.test.ts`, `pools.test.ts` and `streak.test.ts`; the save card's
byte layout is pinned against the program's discriminators in `savecard.test.ts`; the settlement and
task API that this branch still carries is covered by `apps/api/src/app.test.ts` and
`quality.test.ts`; and the client SDK contract is covered by `packages/sdk/src/policy.test.ts`.
