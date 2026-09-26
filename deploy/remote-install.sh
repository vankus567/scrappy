#!/usr/bin/env bash
# Runs on the VPS. Idempotent: installs Bun, builds, (re)writes systemd units and the Caddy site, restarts.
# The VPS only runs the API now: the web app deploys from Vercel.
set -euo pipefail
REL="$1"
APP=/opt/scrappy/releases/$REL
API_HOST=187.127.137.136.sslip.io   # sslip.io maps this name to the VPS IP; Caddy issues a cert for it
export PATH="$HOME/.bun/bin:$PATH"
command -v bun >/dev/null || { curl -fsSL https://bun.sh/install | bash; export PATH="$HOME/.bun/bin:$PATH"; }
BUN="$(command -v bun)"
install -d -m 700 /var/lib/scrappy /etc/scrappy

# ---- one-time migration from the retired layout (/etc/kage, /opt/kage, /var/lib/kage) ----
if [ -f /etc/kage/api.env ] && [ ! -f /etc/scrappy/api.env ]; then
  sed -e 's|/var/lib/kage|/var/lib/scrappy|g' -e 's|/etc/kage|/etc/scrappy|g' \
      -e 's|kageai\.me|187.127.137.136.sslip.io|g' -e 's|kage\.db|scrappy.db|g' /etc/kage/api.env > /etc/scrappy/api.env
  chmod 600 /etc/scrappy/api.env
fi
[ -f /etc/kage/platform.json ] && [ ! -f /etc/scrappy/platform.json ] && cp /etc/kage/platform.json /etc/scrappy/platform.json && chmod 600 /etc/scrappy/platform.json || true
if [ -f /var/lib/kage/kage.db ] && [ ! -f /var/lib/scrappy/scrappy.db ]; then
  cp /var/lib/kage/kage.db /var/lib/scrappy/scrappy.db
  for s in wal shm; do [ -f "/var/lib/kage/kage.db-$s" ] && cp "/var/lib/kage/kage.db-$s" "/var/lib/scrappy/scrappy.db-$s"; done
fi

# ---- secrets live in /etc/scrappy/api.env (created once, never overwritten) ----
ENV=/etc/scrappy/api.env
if [ ! -f "$ENV" ]; then
  PAY_TO=$("$BUN" -e 'console.log(JSON.parse(require("fs").readFileSync("/etc/scrappy/platform.json","utf8")).address)')
  VAPID=$(cd "$APP" && "$BUN" install >/dev/null && cd apps/api && "$BUN" x web-push generate-vapid-keys --json)
  cat > "$ENV" <<CONF
PAY_TO=$PAY_TO
SOLANA_NETWORK=solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1
SOLANA_RPC=https://api.devnet.solana.com
USDC_MINT=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
X402_FACILITATOR_URL=https://x402.org/facilitator
ADMIN_TOKEN=$(head -c 32 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 40)
WEB_ORIGINS=https://scrappypet.vercel.app
SCRAPPY_DB=/var/lib/scrappy/scrappy.db
PLATFORM_KEY_FILE=/etc/scrappy/platform.json
VAPID_PUBLIC_KEY=$(echo "$VAPID" | "$BUN" -e 'console.log(JSON.parse(await Bun.stdin.text()).publicKey)')
VAPID_PRIVATE_KEY=$(echo "$VAPID" | "$BUN" -e 'console.log(JSON.parse(await Bun.stdin.text()).privateKey)')
VAPID_SUBJECT=https://scrappypet.vercel.app
PORT=8795
CONF
  chmod 600 "$ENV"
fi

# proof photos live outside the release dir so they survive deploys (added after api.env first shipped)
install -d -m 700 /var/lib/scrappy/proofs
grep -q '^PROOF_DIR=' "$ENV" || echo 'PROOF_DIR=/var/lib/scrappy/proofs' >> "$ENV"
install -d -m 700 /var/lib/scrappy/clips
grep -q '^CLIP_DIR=' "$ENV" || echo 'CLIP_DIR=/var/lib/scrappy/clips' >> "$ENV"

# ---- build (API only; the web app deploys from Vercel) ----
cd "$APP" && "$BUN" install
ln -sfn "$APP" /opt/scrappy/current

# ---- services ----
cat > /etc/systemd/system/scrappy-api.service <<UNIT
[Unit]
Description=Scrappy Human API
After=network-online.target
[Service]
WorkingDirectory=/opt/scrappy/current/apps/api
EnvironmentFile=/etc/scrappy/api.env
ExecStart=$BUN src/index.ts
Restart=always
RestartSec=2
NoNewPrivileges=true
[Install]
WantedBy=multi-user.target
UNIT
cat > /etc/systemd/system/scrappy-payout.service <<UNIT
[Unit]
Description=Scrappy settlement: USDC payouts to workers, refunds to agents
[Service]
Type=oneshot
WorkingDirectory=/opt/scrappy/current/apps/api
EnvironmentFile=/etc/scrappy/api.env
ExecStart=$BUN scripts/payout.ts
UNIT
cat > /etc/systemd/system/scrappy-payout.timer <<UNIT
[Unit]
Description=Run Scrappy settlement every 15 minutes
[Timer]
OnBootSec=5min
OnUnitActiveSec=15min
[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl disable --now kage-api kage-web kage-payout.timer 2>/dev/null || true
rm -f /etc/systemd/system/kage-api.service /etc/systemd/system/kage-web.service /etc/systemd/system/kage-payout.service /etc/systemd/system/kage-payout.timer
systemctl enable --now scrappy-api scrappy-payout.timer >/dev/null
systemctl restart scrappy-api

# ---- Caddy: sslip.io name serves the API for the Vercel rewrite upstream ----
# The Caddyfile is shared with other sites: only Scrappy/retired blocks are touched, with a backup and auto-restore.
cp /etc/caddy/Caddyfile "/etc/caddy/Caddyfile.bak-scrappy-$REL"
"$BUN" "$APP/deploy/caddy-scrappy.ts" /etc/caddy/Caddyfile 8795 "$API_HOST"
if caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1; then
  systemctl reload caddy
else
  echo "Caddy config invalid: restoring backup"
  cp "/etc/caddy/Caddyfile.bak-scrappy-$REL" /etc/caddy/Caddyfile
  exit 1
fi
sleep 2
curl -fsS http://127.0.0.1:8795/health && echo " api ok"
ls -1dt /opt/scrappy/releases/* | tail -n +3 | xargs -r rm -rf   # keep 2 releases (shared disk)
