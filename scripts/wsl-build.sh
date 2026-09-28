#!/bin/bash
set -e
export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:$PATH"
export CARGO_NET_OFFLINE=true

cd ~/scrappy-arcade
mkdir -p target/deploy
if [ ! -f target/deploy/scrappy_arcade-keypair.json ]; then
  solana-keygen new -o target/deploy/scrappy_arcade-keypair.json --no-bip39-passphrase --force
fi
PUB=$(solana-keygen pubkey target/deploy/scrappy_arcade-keypair.json)
echo "PROGRAM_ID: $PUB"
