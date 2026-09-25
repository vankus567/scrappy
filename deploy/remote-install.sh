#!/usr/bin/env bash
# Runs on the VPS. Idempotent: installs Bun, builds, (re)writes systemd units and the Caddy site, restarts.
set -euo pipefail
REL="$1"
APP=/opt/kage/releases/$REL
export PATH="$HOME/.bun/bin:$PATH"
command -v bun >/dev/null || { curl -fsSL https://bun.sh/install | bash; export PATH="$HOME/.bun/bin:$PATH"; }
BUN="$(command -v bun)"
install -d -m 700 /var/lib/kage

# ---- secrets live in /etc/kage/api.env (created once, never overwritten) ----
ENV=/etc/kage/api.env
if [ ! -f "$ENV" ]; then
  PAY_TO=$("$BUN" -e 'console.log(JSON.parse(require("fs").readFileSync("/etc/kage/platform.json","utf8")).address)')
  VAPID=$(cd "$APP" && "$BUN" install >/dev/null && cd apps/api && "$BUN" x web-push generate-vapid-keys --json)
  cat > "$ENV" <<CONF
PAY_TO=$PAY_TO
SOLANA_NETWORK=solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1
SOLANA_RPC=https://api.devnet.solana.com
USDC_MINT=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
X402_FACILITATOR_URL=https://x402.org/facilitator
ADMIN_TOKEN=$(head -c 32 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 40)
WEB_ORIGINS=https://kageai.me,https://www.kageai.me
KAGE_DB=/var/lib/kage/kage.db
PLATFORM_KEY_FILE=/etc/kage/platform.json
VAPID_PUBLIC_KEY=$(echo "$VAPID" | "$BUN" -e 'console.log(JSON.parse(await Bun.stdin.text()).publicKey)')
VAPID_PRIVATE_KEY=$(echo "$VAPID" | "$BUN" -e 'console.log(JSON.parse(await Bun.stdin.text()).privateKey)')
VAPID_SUBJECT=mailto:hello@kageai.me
PORT=8787
CONF
  chmod 600 "$ENV"
fi

# ---- build ----
cd "$APP" && "$BUN" install
cd "$APP/apps/web" && NEXT_PUBLIC_KAGE_API=https://kageai.me NEXT_PUBLIC_SOLANA_CLUSTER=devnet \
  NEXT_PUBLIC_APK_URL="$( [ -f /opt/kage/shared/kage.apk ] && echo /kage.apk )" "$BUN" run build
[ -f /opt/kage/shared/kage.apk ] && cp /opt/kage/shared/kage.apk "$APP/apps/web/public/kage.apk" || true
[ -f /opt/kage/shared/assetlinks.json ] && mkdir -p "$APP/apps/web/public/.well-known" && cp /opt/kage/shared/assetlinks.json "$APP/apps/web/public/.well-known/" || true
ln -sfn "$APP" /opt/kage/current

# ---- services ----
cat > /etc/systemd/system/kage-api.service <<UNIT
[Unit]
Description=Kage Human API
After=network-online.target
[Service]
WorkingDirectory=/opt/kage/current/apps/api
EnvironmentFile=/etc/kage/api.env
ExecStart=$BUN src/index.ts
Restart=always
RestartSec=2
NoNewPrivileges=true
[Install]
WantedBy=multi-user.target
UNIT
cat > /etc/systemd/system/kage-web.service <<UNIT
[Unit]
Description=Kage web
After=network-online.target
[Service]
WorkingDirectory=/opt/kage/current/apps/web
Environment=PORT=3100
Environment=HOSTNAME=127.0.0.1
ExecStart=$BUN run start -- -p 3100 -H 127.0.0.1
Restart=always
RestartSec=2
NoNewPrivileges=true
[Install]
WantedBy=multi-user.target
UNIT
cat > /etc/systemd/system/kage-payout.service <<UNIT
[Unit]
Description=Kage settlement: USDC payouts to workers, refunds to agents
[Service]
Type=oneshot
WorkingDirectory=/opt/kage/current/apps/api
EnvironmentFile=/etc/kage/api.env
ExecStart=$BUN scripts/payout.ts
UNIT
cat > /etc/systemd/system/kage-payout.timer <<UNIT
[Unit]
Description=Run Kage settlement every 15 minutes
[Timer]
OnBootSec=5min
OnUnitActiveSec=15min
[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now kage-api kage-web kage-payout.timer >/dev/null
systemctl restart kage-api kage-web

# ---- Caddy: kageai.me serves Kage (API under /v1 on the same origin) ----
SITE=/etc/caddy/kage.caddy
cat > "$SITE" <<CADDY
kageai.me, www.kageai.me {
	encode zstd gzip
	@api path /v1/* /health
	handle @api {
		reverse_proxy 127.0.0.1:8787 {
			flush_interval -1
		}
	}
	handle {
		reverse_proxy 127.0.0.1:3100
	}
	header {
		Strict-Transport-Security "max-age=31536000"
		X-Content-Type-Options nosniff
		Referrer-Policy strict-origin-when-cross-origin
	}
}
CADDY
if ! grep -q "import /etc/caddy/kage.caddy" /etc/caddy/Caddyfile; then
  cp /etc/caddy/Caddyfile "/etc/caddy/Caddyfile.bak-$REL"
  echo "Backed up Caddyfile to /etc/caddy/Caddyfile.bak-$REL"
  echo "NOTE: remove any existing kageai.me block from /etc/caddy/Caddyfile, then re-run. Kage import added."
  printf '\nimport /etc/caddy/kage.caddy\n' >> /etc/caddy/Caddyfile
fi
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile && systemctl reload caddy
sleep 2
curl -fsS http://127.0.0.1:8787/health && echo " api ok"
ls -1dt /opt/kage/releases/* | tail -n +4 | xargs -r rm -rf   # keep 3 releases
