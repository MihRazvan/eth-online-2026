# Reusable Substreams composition evidence

Recorded 2026-09-11 by Codex, isolated `work/substreams` worktree. Scope: compiled package, imported published WASM, durable SDK sink and offline integration. **Live provider execution remains blocked by authentication.** This work does not claim a deployed Subgraph, provider-processed stream, live joined buyer result, or financial acceptance.

## Implemented artifact

`packages/substreams/substreams.yaml` imports the actual retained registry package `uniswap-v4-substreams/v0.1.1`; `map_pool_context` consumes its decoded `uniswap.v4.Events` plus the Ethereum block. Typed output retains Initialize/Swap/ModifyLiquidity details, exact decimal amounts, transaction/log identity, selected pools, configured chain/manager and full block continuity. Empty blocks are emitted so occupancy weighting and parent/cursor continuity are explicit. Sepolia and mainnet configuration override both the imported decoder and wrapper. Pool configuration is reusable independently of FeeStrip.

The official SDK runner at `packages/substreams/sink/run.mjs` streams RPC v2, passes its real opaque cursor/final-height and clock to `packages/data/src/substreams.mjs`, and handles actual undo messages. It projects Initialize/Swap ticks into the existing SQLite `HistoryStore` while the reusable map retains richer activity fields for other consumers. Block rows, tick samples and cursor metadata commit atomically. Database stream identity includes SHA256 of the complete input SPKG, chain, manager and selected pools. Restart reuses the saved provider cursor. Changed identity, malformed metadata/amounts, duplicate logs, parent gaps, partial blocks, regressing finality and undo below observed finality fail closed. Idempotent block replay may advance cursor/finality atomically without duplicating samples.

The local sink depends on the lead's `HistoryStore.undo(number, hash, cursor)` atomic cursor update. That shared store change was copied into the worktree for testing and is deliberately excluded from this component's commit.

## Actual verification

Environment: Node 24.12.0; rustc/cargo 1.95.0 (`rustc 59807616e`, 2026-04-14); `wasm32-unknown-unknown`; Substreams CLI 1.22.0 (`be35ad36f63a52ff49d3e15cf993de4cad6bfbd9`). Root tooling evidence records the CLI release checksum. `protoc-bin-vendored = 3.2.0` supplies protoc locally during the build; no system package is needed. `prost` / `prost-build` are exactly 0.13.5 and `substreams` is 0.7.6. `substreams-ethereum-core = 0.11.1` avoids compiling an unnecessary Ethereum ABI generator. Its transitive build-only prost 0.11 graph remains in Cargo.lock; generated/runtime messages in this module use prost 0.13.5. Neither upstream nor local generated Rust messages are handwritten.

Reproduce from the repository root after installing its committed Node dependencies:

```sh
rustup toolchain install 1.95.0 --profile minimal --component rustfmt --target wasm32-unknown-unknown
SUBSTREAMS_BIN="$PWD/.scratch/bin/substreams" packages/substreams/verify.sh
```

Results:

- Five Rust tests passed: configured manager/pool filtering, exact large signed integers, generated protobuf round-trip, empty blocks, clock/tick/parameter rejection, event ordering/duplicates, initialization and signed liquidity changes.
- Actual optimized WASM compilation and SPKG packaging passed. The wrapper WASM is 285,405 bytes; retained imported WASM is 283,179 bytes in this build.
- Seven sink tests passed: SQLite persistence and restart, multi-pool filtering, empty-block continuity, cursor-preserving undo, validation rollback, identity/finality rejection, initialization at tick zero, idempotent finality advancement, and common-block joining with independent Subgraph-shaped metadata.
- Four compiled-WASM/SDK tests passed: wrapper ABI execution on typed synthetic swap inputs, official RPC protobuf binary round-trip into the actual sink, empty-block continuity and wire-level partial-message rejection, canonical network parameter composition, plus execution of the retained published upstream decoder on an explicitly synthetic empty Ethereum block followed by wrapper execution.
- One source-integrity test verified all four retained upstream file SHA256 checksums.
- Offline runner request construction validates both Sepolia and mainnet packages, modules, registry and network parameters without a connection or credential.

The test Ethereum block comes from the official generated `sf.ethereum.type.v2.Block` Rust type through the `emit_fixture` example. All test events, cursors and Subgraph-shaped metadata are labeled synthetic fixtures. The upstream binary test exercises its real empty-block decoding path; it is not a claim that a live receipt was decoded. The wrapper test uses typed fixture events and preserves a signed amount well beyond JavaScript's safe integer limit through real compiled WASM and RPC serialization. No server execution is inferred from local WASM success.

The first explicit-toolchain test exposed Homebrew's older `rustdoc` being selected even when `RUSTC` was bound. The final wrappers bind both tools to 1.95.0; the complete verification, including doc-tests, subsequently passes.

## Source and transport decisions

The retained registry SPKG SHA256 is `d9e4f57698f153c8782adb7e03c266216143f9f595d37c812c169934b7b44c34`. Upstream event source is pinned to StreamingFast chain-modules commit `d054c303c1e39e3a1c9da8296ac0a4bff7110233`; its field names/types match the registry's embedded event schema. `upstream/SOURCE.json` records exact source URLs, code pins, individual file hashes, unchanged status and Apache-2.0 attribution. The published SPKG is imported verbatim; it was not rebuilt here, so source inspection is not an upstream reproducible-build claim. [Maintained decoder source](https://github.com/streamingfast/substreams-chain-modules/tree/d054c303c1e39e3a1c9da8296ac0a4bff7110233/dex/uniswap-v4-substreams)

CLI 1.22.0's JSONL printer emits `@module`, `@block`, `@type`, `@data` but omits provider cursor and finality for ordinary blocks. Therefore a CLI JSONL parser could not honestly supply durable cursor/finality semantics. This implementation uses actual `BlockScopedData.cursor`, `finalBlockHeight` and `BlockUndoSignal.lastValidCursor` via `@substreams/core 0.17.0` and Connect 1.7.0. The SDK predates partial-block fields 13–15: the sink rejects those unknown protobuf fields rather than silently accepting an incomplete block. [Pinned CLI printer](https://github.com/streamingfast/substreams/blob/be35ad36f63a52ff49d3e15cf993de4cad6bfbd9/tui/print.go), [pinned RPC schema](https://github.com/streamingfast/substreams/blob/be35ad36f63a52ff49d3e15cf993de4cad6bfbd9/proto/sf/substreams/rpc/v2/service.proto)

## Limits and next live gate

The imported decoder omits Donate and protocol-fee events. The output explicitly says donations are not included and allocation authority is contract-only. It cannot establish exact earned fees or replace the authenticated settlement endpoint. The map's chain ID is declared configuration, not cryptographic proof of provider identity. The independent join must still verify indexed deployment, chain/pool and common block/hash/freshness. [Upstream coverage and omissions](https://github.com/streamingfast/substreams-chain-modules/blob/d054c303c1e39e3a1c9da8296ac0a4bff7110233/dex/uniswap-v4-substreams/DESIGN.md)

Every-block emission deliberately avoids an indexed sparse block filter: the current history store requires sequential blocks, and occupancy weights intervals between observed ticks. This carries full-block bandwidth/compute cost. SQLite persists occupancy observations, not all typed liquidity/amount fields. A short smoke window may have no initial tick sample; start early enough to retain an initialization or prior swap for the requested analysis interval. Incomplete coverage remains unknown.

The lead's prior actual CLI request returned `Unauthenticated: required authorization token not found`, received zero data and exited unsuccessfully, recorded in `docs/evidence/graph.md`. No repeated authentication probes were made in this task. The README supplies a bounded two-block request that validates offline now and becomes a real stream when authorized credentials are available. The remaining gate is authorized provider execution, persisted real cursor/resume and live common-block composition with a deployed FeeStrip Subgraph. Reorg semantics have deterministic local regression coverage only; no provider-origin reorg is claimed.
