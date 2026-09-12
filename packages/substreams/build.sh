#!/bin/sh
set -eu
cd "$(dirname "$0")"
# Homebrew Rust may precede rustup on macOS; bind the selected toolchain's compiler explicitly.
export RUSTC="$(rustup which --toolchain 1.95.0 rustc)"
export RUSTDOC="$(rustup which --toolchain 1.95.0 rustdoc)"
rustup run 1.95.0 cargo build --locked --release --target wasm32-unknown-unknown
"${SUBSTREAMS_BIN:-substreams}" pack substreams.yaml -o feestrip-pool-context-v0.1.1.spkg
