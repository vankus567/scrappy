#!/bin/bash
export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:$PATH"
export CARGO_NET_OFFLINE=true
SRC="/mnt/c/Users/ksubh/OneDrive/Documents/Coloseum hackathon/scrappy-classic"
cp "$SRC/Anchor.toml" "$SRC/Cargo.toml" ~/scrappy-arcade/
cp -r "$SRC/programs" ~/scrappy-arcade/
cd ~/scrappy-arcade && anchor build 2>&1 | tail -20
