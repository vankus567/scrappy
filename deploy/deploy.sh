#!/usr/bin/env bash
# Deploy Kage to the VPS: web + API on https://kageai.me (API at /v1 on the same origin).
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
git archive --format=tar.gz -o "/tmp/kage-$REL.tgz" HEAD apps packages deploy package.json bun.lock
[ -f apps/api/.keys/platform.json ] || { echo "Missing apps/api/.keys/platform.json (run: cd apps/api && bun scripts/keys.ts)"; exit 1; }

scp -i "$SSH_KEY" -o IdentitiesOnly=yes "/tmp/kage-$REL.tgz" "$HOST:/tmp/kage-$REL.tgz"
$SSH "$HOST" "install -d -m 700 /etc/kage"
scp -i "$SSH_KEY" -o IdentitiesOnly=yes apps/api/.keys/platform.json "$HOST:/etc/kage/platform.json"
$SSH "$HOST" "chmod 600 /etc/kage/platform.json && mkdir -p /opt/kage/releases/$REL && tar -xzf /tmp/kage-$REL.tgz -C /opt/kage/releases/$REL && rm /tmp/kage-$REL.tgz && bash /opt/kage/releases/$REL/deploy/remote-install.sh $REL"
rm -f "/tmp/kage-$REL.tgz"
echo "Deployed release $REL. Check: curl https://kageai.me/health"
