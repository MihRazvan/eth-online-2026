# FeeStrip pool context

A reusable Substreams map and durable SQLite sink for Uniswap v4 range-risk analysis. It composes the published `uniswap-v4-substreams/v0.1.1` decoder and emits typed, pool-filtered context. Another consumer can use the map without FeeStrip, its sink, or its Subgraph.

`map_pool_context` emits `feestrip.context.v1.PoolContextBlock` for every block: chain, manager, block number/hash/parent/timestamp, Initialize, Swap, and ModifyLiquidity records. Pool IDs, block-global log order, transaction hashes, exact decimal integer amounts, ticks, and liquidity changes survive the composition. Version0.1.1 resolves upstream transaction-local log indices through full-block transaction receipts before sorting or sinking them. Missing, ambiguous or wrong-manager receipt matches fail closed. No JavaScript floating-point token arithmetic is used. Generated Rust messages come from `prost-build`, never handwritten bindings.

## Build and verify

From the repository root, install the root Node dependencies with the committed lockfile and install Rust 1.95.0:

```sh
pnpm install --frozen-lockfile
rustup toolchain install 1.95.0 --profile minimal --component rustfmt --target wasm32-unknown-unknown
SUBSTREAMS_BIN="$PWD/.scratch/bin/substreams" packages/substreams/verify.sh
```

`SUBSTREAMS_BIN` must point to Substreams CLI 1.22.0 (or put that version on `PATH` and omit the variable). The root tooling evidence records its release checksum. No system `protoc` is needed: the locked `protoc-bin-vendored = 3.2.0` build dependency supplies it. Node 24 supplies `node:sqlite`. The wrapper binds `RUSTC` and `RUSTDOC` explicitly because a Homebrew compiler earlier on `PATH` otherwise defeats `rustup run` on macOS.

`verify.sh` runs the Rust tests, compiles the real WASM artifact, packs the real imported SPKG, generates a clearly synthetic Ethereum block with the official generated Rust protobuf type, executes the WASM map in Node, round-trips official RPC protobuf responses into the SQLite sink, and tests cursor/rollback and joined occupancy. These are offline regressions, not provider execution. `build.sh` alone produces `feestrip-pool-context-v0.1.1.spkg`.

Runtime JS dependencies are root-pinned: `@substreams/core 0.17.0`, `@bufbuild/protobuf 1.10.1`, and `@connectrpc/connect` / `@connectrpc/connect-node 1.7.0`. Rust dependencies and transitive versions are scoped in `Cargo.lock`.

## Configure and consume

The manifest contains Sepolia and mainnet canonical PoolManager/PositionManager parameters and initial blocks. `chain_id`, `pool_manager`, and `pool_ids` are explicit map parameters; `pool_ids=*` opts into all decoded pools, or supply comma-separated 32-byte IDs. The sink requires an explicit nonempty pool list and configures both the wrapper and imported decoder for the chosen network. Extending to another chain requires adding its verified network/deployment configuration and provider endpoint.

The following bounded command constructs and validates the actual package, registry, network parameters, and RPC request without opening a network connection:

```sh
node packages/substreams/sink/run.mjs --validate-only --network sepolia --pools 0xc743656d27fde4e2d5895e878557aaa56dd48c8656d25e9db35ba10b1fe3d824 --start 11682191 --stop 11682193
```

Once an authorized `SUBSTREAMS_API_TOKEN` is present in the process environment, remove `--validate-only` and give a database path:

```sh
node packages/substreams/sink/run.mjs --network sepolia --pools 0xc743656d27fde4e2d5895e878557aaa56dd48c8656d25e9db35ba10b1fe3d824 --start 11682191 --stop 11682193 --db .scratch/feestrip-history.db
```

`--stop` is exclusive; omit it to follow continuously. Default endpoints are official StreamingFast HTTPS endpoints. `--endpoint` supports an authorized HTTPS override. Defaults request finalized blocks. `--include-unfinalized` enables explicit undo handling. Repeating the command resumes the real provider cursor saved with the last committed block; it does not infer a cursor from a block number. A changed package SHA256, manager, chain or selected-pool set refuses to reuse the database: choose a new database and resync intentionally. In particular, do not continue a v0.1.0 database with v0.1.1; the event-order correction requires reprocessing. The package hash includes packaged documentation, so even repacking a changed README can require resync.

The runner uses binary Connect over HTTP/1.1: the live gRPC transport delivered blocks but ended with missing-status errors, while Connect completed cleanly. It consumes official RPC v2 `BlockScopedData` and `BlockUndoSignal` with the JS SDK. CLI `-o jsonl` omits cursor/finality, so it cannot provide the required durable resume semantics. Partial blocks are rejected. A cursor and all samples commit in one SQLite transaction; gaps, wrong parent hashes, identity/clock mismatch, malformed amounts, duplicate log indices and finality regression fail closed. Undo removes later blocks/samples and replaces the retained cursor atomically. Undo below observed finality requires explicit resync.

`SubstreamsHistorySink.analysisStream({poolId, fromBlock, toBlock})` returns the source shape consumed by the independent data composition package. SQLite currently stores block continuity and Initialize/Swap tick observations for occupancy; the richer typed amounts/liquidity changes remain available in the reusable map output. Start far enough back to retain a tick observation at or before the requested analysis window. A two-block smoke window does not guarantee such a seed; missing history remains unknown, never fabricated.

## Coverage and authority

The imported decoder does **not** expose Donate or protocol-fee changes. `donations_included` is false and `allocation_authority` is `contract-only`. This context supports pool activity, range occupancy and buyer estimates; it cannot certify exact historical fees, settle a strip, or authorize any payout. The contract's authenticated endpoint and accounting remain authoritative.

There is deliberately no sparse block filter: emitting every block preserves parent continuity, precise block-weighted occupancy and restart/undo checkpoints. This reads full Ethereum blocks and costs more than an indexed events-only pipeline; a future sparse transport must explicitly represent gaps before changing that behavior. The map's chain ID is configured metadata, not an independent proof of provider/network truth. The independent join also checks chain, pool, indexed block/hash, deployment, and freshness.

Graph Market authentication and live provider execution are now available. The bounded qualification checks real block delivery, durable restart, decoded mint identity and common-block agreement with the deployed Studio Subgraph. The full live buyer-analysis result remains pending: no fee-sale series is activated and short windows without initialization/swap observations cannot establish range occupancy. See [live evidence](../../docs/evidence/substreams.md) and [Graph status](../../docs/evidence/graph.md).

Upstream binaries, protobuf sources, exact code pins, SHA256 checksums and Apache-2.0 attribution are recorded under `upstream/SOURCE.json` and `upstream/LICENSE`. FeeStrip-authored Rust is MIT as declared by its Cargo manifest. The registry binary is retained verbatim; matching source inspection is not a reproducible-build claim for that upstream binary.

## Bounded local account qualification

Save the Graph Market **API Token (JWT)** as `SUBSTREAMS_API_TOKEN` in ignored root `.env`. The local helper passes only this credential to the child process, limits requests to 10000 blocks, redacts output and imposes a five-minute runtime limit. It is not the continuous hosted worker.

```sh
node scripts/graph/run-substreams.mjs --start 11688800 --stop 11688810 --pools 0x0c5089eb2863310ecab41eb94f2705ce37ce455a0f64a9ee627c7470b43161e8 --db .scratch/graph/qualification-v011.sqlite
node scripts/graph/run-substreams.mjs --start 11688800 --stop 11688820 --pools 0x0c5089eb2863310ecab41eb94f2705ce37ce455a0f64a9ee627c7470b43161e8 --db .scratch/graph/qualification-v011.sqlite
node scripts/graph/verify-stream.mjs --db .scratch/graph/qualification-v011.sqlite
```

The second run retains the original start argument and resumes from the provider cursor. The read-only verifier accepts up to100 saved blocks, checks every block against public RPC and queries Studio at the exact saved head hash. These historical windows are diagnostics, not a current activity feed. Studio rejected block11684199 as earlier than its available history (11687829) despite the manifest's earlier start; never silently replace an unavailable historical query with latest state. Query a genuinely shared retained block instead.

A dropped connection exits the runner with the durable checkpoint retained. Reconnection/backoff, service supervision, initialized history and persistent hosting remain operational work; a manually restarted bounded stream does not establish continuous availability. [Official JavaScript transport guidance](https://docs.substreams.dev/how-to-guides/sinks/stream/javascript).
