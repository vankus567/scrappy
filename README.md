# SCRAPPY BOY

**Trading apps have 47 buttons and a textbook of words. We have four buttons.**

A handheld game where every button is a Solana action. Ride the price, press A,
and your trade lands on chain. No seed phrase, no order book, no slippage
settings — a five-year-old can trade. Built for **CLOCK IN, the Solana Mobile
hackathon** (Seeker / Solana Mobile Stack).

Play it now: **[scrappypet.vercel.app/scrappyboy](https://scrappypet.vercel.app/scrappyboy)**

## The pitch in one line

Make every Solana action as easy as a Game Boy game — because the interface is a
literal Game Boy.

## What's in the box

Three cartridges on one handheld:

| Cartridge | What you see | What the buttons do on-chain |
|---|---|---|
| **PLAY NOW** | An endless round on the live SOL price | Nothing — points are free. This is how you learn the controls. |
| **DEEP NET** | "Cast a net into the sea" | Opens a real Orca liquidity position on devnet; "collect coins" harvests real fees; "pull the net" closes the position and returns funds. |
| **MEME DASH** | A coin carousel + a 4-second round | `A` buys — a real Jupiter swap on Solana **mainnet** ($1/$5/$10). `B` sells. The safety net and treasure line auto-sell at −8% / +15%. Coins are the day's top-traded list straight from Jupiter. |

`X` anywhere is the coin return: it sweeps the play key back to your wallet.

## The play key (scoped session money)

The first thing the console does is mint an ephemeral keypair on your device —
the **play key**. The wallet never signs during play:

- Load the coin slot once: the wallet signs a single top-up transfer into the
  play key.
- Every move after that — buys, sells, nets, score writes — is signed silently
  on-device by the play key.
- The play key can only ever spend what you loaded into it. Lose the device,
  lose only the coin slot — never the wallet.
- `X` cashes everything out to the wallet, no popup.

This is deliberately the same shape as MagicBlock's session tokens and the
Seeker Seed Vault model: a scoped, device-resident signer between the user and
every transaction.

## The program: `scrappy_arcade`

`programs/scrappy-arcade` is a real Anchor program (not a mock): an on-chain
save card plus scoped session delegates plus link battles.

- `record_score` / `record_score_as` — a `SaveCard` PDA per player keeps
  best/last/plays on-chain; the `_as` variant lets a **session delegate**
  write for the player (the wallet issues a `Session` PDA with an expiry
  slot once, the device key plays inside that scope).
- `authorize_session` / `revoke_session` — DIY scoped session keys, the
  pattern MagicBlock session keys formalize.
- `create_battle` / `join_battle` / `post_battle_score` — a `Battle` PDA is
  a shared scoreboard: host creates, friend joins from a link, both post
  one score, the contract settles the winner.

Program ID (devnet build): `6JWs3RjaawXTHvjFmFq2UxWiX8HPpxfi71WsGeLqVXm3`
Build: `anchor build` inside WSL (toolchain note in `scripts/wsl-build2.sh`).

## Networks, honestly

- **MEME DASH trades on mainnet.** Real Jupiter swaps, real signatures,
  `solscan.io` links in the tx log under the console.
- **DEEP NET runs on devnet** (Orca whirlpools) — same mechanics, zero cost.
- The core round is free: no wallet needed until you load a coin.

## Verify

```bash
bun install
bun run verify     # typecheck + eslint + all tests
bun run dev        # -> http://localhost:3000/scrappyboy
```

- `bun run verify` = the definition of "it works": `tsc --noEmit` on every
  workspace, `eslint` (errors fail, not warnings), and the full test suite —
  33 tests covering score math, stake→lamports, USD formatting, auto-sell
  triggers and daily streaks.
- Production deploy: `vercel deploy --prod` → aliased to scrappypet.vercel.app.

## Stack

- Next.js 16 + React 19, TypeScript, Bun workspaces
- `@solana/web3.js` + wallet-adapter for the one top-up signature
- `@solana/kit` for devnet ops
- Jupiter Lite API (token discovery, quotes, swaps) and Price API
- Orca whirlpools via `@orca-so/whirlpools-*` on devnet
- Anchor 0.32 for `scrappy_arcade`
- The console itself: a DOM/CSS shell around two canvas "carts" — a 160×144
  indexed-color framebuffer (16-color palette, tilemaps, sprites, a 4×6
  bitmap font) and a 640×576 canvas for MEME DASH

## Project layout

```
apps/web/src/app/scrappyboy/   # the handheld page (Shell + Handheld)
apps/web/src/lib/scrappyboy/   # game, meme-dash, chain, session, sprites
apps/web/src/lib/console/      # the pixel console (input, canvas, audio, input)
apps/web/src/app/api/          # /api/rpc (mainnet proxy), /api/icon (token art)
programs/scrappy-arcade/       # the Anchor program
scripts/                       # deploy-arcade.mjs, wsl-build helpers
```

## Roadmap to submission

- Link-cable battles (`Battle` PDA already in the program)
- SKR deeper integration: SKR stakes, SKR rewards, holder perks
- Seed Vault / MWA path for the top-up signature on Seeker
- Bubblewrap TWA → Android APK for the dApp Store
- MagicBlock session tokens when the program moves to an ER-capable deploy
