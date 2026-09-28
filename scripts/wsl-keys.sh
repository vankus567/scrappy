#!/bin/bash
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
for f in $HOME/.config/solana/*.json $HOME/scrappy-arcade/target/deploy/*.json; do
  [ -f "$f" ] && echo "$f -> $(solana-keygen pubkey "$f" 2>/dev/null)"
done
