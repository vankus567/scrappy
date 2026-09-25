#!/usr/bin/env bash
# Deploy Scrappy to the VPS: the API behind https://187.127.137.136.sslip.io (the Vercel rewrite upstream).
# The public site is scrappypet.vercel.app; this script ships the API only.
#   SSH_KEY=~/.ssh/hostinger_tenki HOST=root@187.127.137.136 bash deploy/deploy.sh
# Ships the committed tree (git archive: no .env, no .keys, no node_modules) plus the platform wallet key.
set -euo pipefail
HOST="${HOST:-root@187.127.137.136}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/hostinger_tenki}"
SSH="ssh -i $SSH_KEY -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REL="$(date -u +%Y%m%d%H%M%S)"

cd "$ROOT"
[ -z "$(git status --porcelain -- apps packages deploy)" ] || { echo "Commit your changes first (deploy ships HEAD)."; exit 1; }
git archive --format=tar.gz -o "/tmp/scrappy-$REL.tgz" HEAD apps packages deploy package.json bun.lock
[ -f apps/api/.keys/platform.json ] || { echo "Missing apps/api/.keys/platform.json (run: cd apps/api && bun scripts/keys.ts)"; exit 1; }

scp -i "$SSH_KEY" -o IdentitiesOnly=yes "/tmp/scrappy-$REL.tgz" "$HOST:/tmp/scrappy-$REL.tgz"
$SSH "$HOST" "install -d -m 700 /etc/scrappy"
scp -i "$SSH_KEY" -o IdentitiesOnly=yes apps/api/.keys/platform.json "$HOST:/etc/scrappy/platform.json"
$SSH "$HOST" "chmod 600 /etc/scrappy/platform.json && mkdir -p /opt/scrappy/releases/$REL && tar -xzf /tmp/scrappy-$REL.tgz -C /opt/scrappy/releases/$REL && rm /tmp/scrappy-$REL.tgz && bash /opt/scrappy/releases/$REL/deploy/remote-install.sh $REL"
rm -f "/tmp/scrappy-$REL.tgz"
echo "Deployed release $REL. Check: curl https://187.127.137.136.sslip.io/health"
