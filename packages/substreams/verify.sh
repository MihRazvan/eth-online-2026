#!/bin/sh
set -eu
cd "$(dirname "$0")"
export RUSTC="$(rustup which --toolchain 1.95.0 rustc)"
export RUSTDOC="$(rustup which --toolchain 1.95.0 rustdoc)"
rustup run 1.95.0 cargo test --locked
./build.sh
rustup run 1.95.0 cargo run --locked --example emit_fixture -- target/fixture-block.bin
node --test sink/*.test.mjs ../data/test/substreams.test.mjs
