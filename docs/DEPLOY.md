# Deploy and go live (the last step)

## 1. Fund devnet wallets (manual, captcha)
- `cd apps/api && bun scripts/keys.ts` prints the platform and agent addresses (keys in `apps/api/.keys/`, gitignored).
- Agent: devnet USDC at https://faucet.circle.com (Solana Devnet). Platform: devnet SOL at https://faucet.solana.com.

## 2. Prove the loop on devnet
1. `PAY_TO=<platform> ADMIN_TOKEN=... bun apps/api/src/index.ts`
2. `bun --cwd apps/web dev`, hatch a pet, add a payout wallet on the Wallet screen.
3. `bun apps/api/scripts/agent-pay.ts` (real x402 payment) and answer it on the Jobs screen.
4. `bun apps/api/scripts/payout.ts` pays owed USDC (after the 48 h hold, or lower `PAYOUT_HOLD_MS` for testing).
5. `ANTHROPIC_API_KEY=... bun apps/api/scripts/fallback-agent.ts` records the Human Fallback demo.

## 3. Deploy
- **API**: `docker build -f apps/api/Dockerfile .` → Fly.io / Railway; volume for `SCRAPPY_DB` (or move to Postgres/Neon). Set env from `.env.example`.
- **Web**: Vercel, root `apps/web`, `NEXT_PUBLIC_SCRAPPY_API=https://<api-host>`.
- Add `https://<web-host>` to `WEB_ORIGINS`.

## 4. Android / Seeker (CLOCK IN)
- Add `public/icon-192.png` and `public/icon-512.png`.
- Fill `apps/web/twa-manifest.json` host, then `bunx @bubblewrap/cli build` → APK.
- Serve `/.well-known/assetlinks.json` with the keystore SHA-256 fingerprint (`bunx @bubblewrap/cli fingerprint`).
- Submit via the Solana dApp Store publisher portal.

## 5. Mainnet switch
`SOLANA_NETWORK=solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp`, `USDC_MINT=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`, mainnet RPC, funded platform wallet.
