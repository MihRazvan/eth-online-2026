# Graph integration evidence

2026-09-11. Scope: hermetic data tests and Subgraph WASM build; live provider blocked.

- Node tests: 17 math/history/composition tests passed. Common block/hash and pool/chain identity checked; atomic cursor+event storage, explicit reorg undo, incomplete-history coverage, block-weighted range occupancy. Tests use identified fixtures.
- Graph CLI0.98.1 / graph-ts0.38.2: actual FeeStrip ABI codegen and schema/mapping WASM build passed. No indexer execution claimed yet. Source manifest deliberately undeployed zero address.
- Substreams CLI1.22.0 be35ad3 downloaded to ignored `.scratch/bin`; official Darwin arm64 SHA25680ec00a9a89d18402420f8ae9f79575ab4696107c38169e2e81408d51e346d17 matched release checksum. No global tool installation.
- Live attempt: `.scratch/bin/substreams run https://spkg.io/v1/packages/uniswap-v4-substreams/v0.1.1 map_events --network sepolia -s 11682000 -t 11682010 -o jsonl --max-retries 0 --limit-processed-blocks 10 --final-blocks-only`.
- Result: `Unauthenticated: required authorization token not found`; zero data received, nonzero exit. No fake fallback and not recorded as passing. User notified of missing Substreams token and Studio deployment access.

A buyer-query adapter now reads persisted Substreams samples and a pinned Subgraph series at the last common retained block, normalizes Graph BigInt strings, checks matching hashes, and reports block-weighted range coverage and exact gross/net break-even. CLI and loopback HTTP service fail explicitly when live inputs are unavailable.

Reusable module/sink verification is recorded in `substreams.md`: compiled upstream/wrapper WASM, real RPC envelopes and persistent cursor/undo tests pass.

Open: deployed FeeStrip Subgraph, live joined result, provider freshness and live reorg exercise. Two agreeing data providers are not a settlement proof or an independent canonical-chain guarantee. The API reports the persisted checkpoint finality separately; the sink defaults to finalized-only, while explicit unfinalized ingestion requires treating unfinalized analysis as provisional. No sponsor eligibility completion claimed.
