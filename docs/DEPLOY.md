# Deploying Scrappy

The public domain is `https://scrappypet.vercel.app` (Vercel; rewrites `/v1` and `/health` to the API).
The API runs on one VPS behind Caddy at `https://187.127.137.136.sslip.io` — an sslip.io name that
resolves to the VPS IP, so HTTPS works without owning a domain. It is an invisible upstream only;
users and agents only see scrappypet.vercel.app.

## 1. Wallets (devnet while building)
```
cd apps/api && bun scripts/keys.ts         # creates .keys/platform.json + .keys/agent.json (gitignored)
```
Fund both with devnet SOL (https://faucet.solana.com) and the agent with devnet USDC (https://faucet.circle.com, network Solana Devnet).
The platform wallet also needs devnet USDC to pay workers.

## 2. Deploy the API
SSH on port 22 must be reachable from your network (some campus/office networks block it; use a phone hotspot).
```
git commit -am "..."                        # deploy ships HEAD
SSH_KEY=~/.ssh/hostinger_tenki HOST=root@187.127.137.136 bash deploy/deploy.sh
```
First run creates `/etc/scrappy/api.env` (PAY_TO from the platform key, random ADMIN_TOKEN, VAPID keys for push). It never overwrites it.
If a retired `/etc/kage` install exists, the first deploy migrates the env file, platform key and database automatically.
Services: `scrappy-api` (:8795), `scrappy-payout.timer` (USDC payouts + refunds every 15 min). The web app deploys from Vercel, not the VPS.
Caddy: the `187.127.137.136.sslip.io` site block serves the API; any retired site block is removed. A backup is saved before every change.

Then seed qualification checks once:
```
ssh root@187.127.137.136 'set -a; . /etc/scrappy/api.env; cd /opt/scrappy/current/apps/api && SCRAPPY_API=http://127.0.0.1:8795 ~/.bun/bin/bun scripts/seed-gold.ts'
```

## 3. Web app (Vercel)
```
cd apps/web && vercel deploy --prod --yes
```
`vercel.json` rewrites `/v1/*` and `/health` to the API upstream. The project's Root Directory is `apps/web`
(set once in Vercel settings so git pushes build correctly).

## 4. Android APK (Trusted Web Activity)
Needs the site live on https (step 3).
```
cd apps/android   (never apps/web: a Bubblewrap app/ folder there hijacks the Next.js router)
bun scripts/build-apk.ts                                                        # builds + signs app-release-signed.apk / .aab
cp app-release-signed.apk ../web/public/scrappy.apk                             # landing Download button serves it (gitignored-allowed)
```
Keep `android.keystore` and `android-signing.local.json` safe and out of git: every future update must be signed with the same key.
`public/.well-known/assetlinks.json` ties the APK signature to the domain; it deploys with the site.

## 5. Mainnet
Set `SOLANA_NETWORK=solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp`, `SOLANA_RPC`, `USDC_MINT=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` in `/etc/scrappy/api.env`, fund the platform wallet with real USDC, `systemctl restart scrappy-api`.
