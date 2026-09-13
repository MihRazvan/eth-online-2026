# Historical witness retention and recovery

This read-only worker captures the PoolManager account/storage witness at each series' exact end block N, independently authenticates its Merkle Patricia proofs, and retains the bytes before providers can prune them. It never signs a transaction or chooses an allocation. FeeStrip's verifier remains the settlement authority.

## Run

Requires Node24, dependencies from the repository lockfile, and the pinned Python proof libraries:

```sh
python3 -m venv .scratch/proof-venv
.scratch/proof-venv/bin/python -m pip install -r scripts/proof/requirements.txt
export FEESTRIP_PROOF_PYTHON="$PWD/.scratch/proof-venv/bin/python"
pnpm test:settlement
RETENTION_CONFIG="$PWD/.scratch/retention/config.json" pnpm dev:recovery
```

For a seeded disposable local chain, run `pnpm local:retention-config`, then start the worker **before the endpoint**:

```sh
RETENTION_CONFIG="$PWD/.scratch/retention/local/local.generated.json" pnpm dev:recovery
```

This explicit setup command refreshes only its generated local config; the SQLite history and retained copies survive restart. It never resets the chain or signs a transaction. After deliberately resetting a local chain, use a fresh database/copy directory (keep the previous directory as an archive): a reset can invalidate recorded finality even when deterministic deployment addresses are reused. Normal process restarts reuse the existing store.

The config is private, ignored operator material. It contains `chainId` (31337 or11155111), `genesisHash`, `feeStrip`, `verifier`, `checkpoints`, `poolManager`, `usdc`, `managerCodeHash`, `codeHashes` (the four named deployed runtime hashes), `rpcUrls` (one to three), `database`, two distinct `artifactRoots`, and optional `intervalMs` (default1000) / `port` (default8788). Addresses and runtime/genesis hashes must come from the operator's verified deployment record. Never derive public trust pins from an untrusted proof response. `local-config.mjs` generates pins solely for a disposable loopback development chain; the real lifecycle test demonstrates its use.

Use private directories with restrictive permissions, e.g. `.scratch/retention/`. Public RPC URLs require HTTPS; local chain31337 requires loopback. Sepolia additionally pins the canonical PoolManager and native USDC addresses. RPC credentials, private paths and transport diagnostics never enter public status/artifact exports. No private key is read. `node packages/settlement/src/cli.mjs --once` runs one tick; `--serve` exposes GET endpoints on127.0.0.1. A production host needs its own same-origin reverse proxy, monitoring and operational isolation.

## Recovery API

- `GET /api/recovery?seriesId=1`: latest observed deployment-scoped retention facts.
- `GET /api/recovery/artifact?seriesId=1&digest=<artifactDigest>`: independently revalidated current artifact. SHA256 of the **exact downloaded bytes** equals the digest. Requests cannot upload proofs or trigger transactions.

States include `scheduled`, `retained`, `unavailable`, `orphaned`, `cached-onchain`, and `not-required`. They are distinct from capture/allocation lifecycle. `retained` describes saved authenticated bytes; `finalized`, `checkpointSaved`, and `growthCached` are separate last-observed facts. Check `lastObservedAt`, `observationError`, and `discoveryComplete`; an RPC outage can leave a previously retained artifact available without a fresh canonicality assertion. A permanent block-hash checkpoint is not a storage proof. An onchain verified-growth cache can remove the need to resend witness bytes for that exact endpoint/range.

## Durability and bounds

SQLite WAL with FULL synchronization stages the full verified payload before atomic file writes and directory fsync. Two filesystem copies use distinct, nonnested roots. **This does not establish independent failure domains**: choose separate durable volumes/hosts and backup the database in an operational deployment. A surviving valid file repairs a corrupted database payload; a surviving valid database payload repairs corrupted/missing files. Corrupt files are quarantined. Whole-database loss/schema corruption, loss of all copies, hostile filesystem writers and remote replication are outside this increment.

Jobs bind chain/genesis/runtime pins, activation block hash and immutable series terms; reorg variants are preserved rather than overwritten. SQLite leases fence concurrent/stale writers. Finality high-water marks survive unavailable finalized tags. Endpoint finality never freezes later unfinalized lifecycle transactions. A coherent observation is required before invalidating a previously retained artifact.

Due acquisition runs before old-artifact maintenance. Each tick processes at most8 known due jobs,8 newly discovered jobs,4 rotating existing jobs and8 repair candidates. Discovery pages100 new series and refreshes known terms with concurrency8. Full MPT validation results are cached only in process memory against all artifact bytes and expected pins (maximum256); persisted flags are never proof authority. API downloads revalidate independently. Proof envelopes are limited to2MiB /2048 nodes. This is a bounded development worker, not a measured production throughput or availability guarantee: simultaneous endpoints, large histories, RPC latency and a provider whose proof window closes before acquisition can still cause a miss. No software can reconstruct a pruned witness from a saved block hash alone.

`pnpm test:chain` exercises genuine Anvil proof acquisition at N, restart with new proof acquisition disabled, corrupted-file repair, API export and actual Solidity settlement against independent native collection. This is local component/lifecycle evidence. Separate [public verification](../../docs/VERIFICATION.md) records operated proof recovery and actual wallet transactions.
