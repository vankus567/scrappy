# Deploying Scrappy

The public domain is `https://scrappypet.vercel.app` (Vercel rewrites `/v1` and `/health` to the API). Origin infra runs on one VPS behind Caddy: `https://kageai.me` serves the web app, and the API on the same origin under `/v1` and `/health`.

## 1. Wallets (devnet while building)
```
cd apps/api && bun scripts/keys.ts         # creates .keys/platform.json + .keys/agent.json (gitignored)
```
Fund both with devnet SOL (https://faucet.solana.com) and the agent with devnet USDC (https://faucet.circle.com, network Solana Devnet).
The platform wallet also needs devnet USDC to pay workers.

## 2. Deploy
SSH on port 22 must be reachable from your network (some campus/office networks block it; use a phone hotspot).
```
git commit -am "..."                        # deploy ships HEAD
SSH_KEY=~/.ssh/hostinger_tenki HOST=root@187.127.137.136 bash deploy/deploy.sh
```
First run creates `/etc/kage/api.env` (PAY_TO from the platform key, random ADMIN_TOKEN, VAPID keys for push). It never overwrites it.
Services: `kage-api` (:8795), `kage-web` (:3100), `kage-payout.timer` (USDC payouts + refunds every 15 min).
If the Caddyfile already has a `kageai.me` block, the script stops at validation: remove that block (a backup is saved) and run again.

Then seed qualification checks once:
```
ssh root@187.127.137.136 'set -a; . /etc/kage/api.env; cd /opt/kage/current/apps/api && SCRAPPY_API=http://127.0.0.1:8795 ~/.bun/bin/bun scripts/seed-gold.ts'
```

## 3. Android APK (Trusted Web Activity)
Needs the site live on https (step 2).
```
cd apps/android   (never apps/web: a Bubblewrap app/ folder there hijacks the Next.js router)
bunx @bubblewrap/cli init --manifest https://scrappypet.vercel.app/manifest.webmanifest   # or reuse twa-manifest.json
bunx @bubblewrap/cli build                                                        # creates android.keystore (gitignored) + app-release-signed.apk
bunx @bubblewrap/cli fingerprint generateAssetLinks                              # writes assetlinks.json
scp -i ~/.ssh/hostinger_tenki app-release-signed.apk root@187.127.137.136:/opt/kage/shared/kage.apk
scp -i ~/.ssh/hostinger_tenki assetlinks.json       root@187.127.137.136:/opt/kage/shared/assetlinks.json
bash ../../deploy/deploy.sh                                                       # re-deploy: publishes /kage.apk + /.well-known/assetlinks.json and shows the download link
```
Keep `android.keystore` safe and out of git: every future update must be signed with it.

## 4. Mainnet
Set `SOLANA_NETWORK=solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp`, `SOLANA_RPC`, `USDC_MINT=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` in `/etc/kage/api.env`, fund the platform wallet with real USDC, `systemctl restart kage-api`.
