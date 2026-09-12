# Graph integration evidence

Updated 2026-09-12. Scope: live Studio and authenticated Substreams source agreement verified; actual joined buyer analysis remains pending.

Graph Market access is now verified. The corrected v0.1.1 map delivers real Sepolia data, decodes the NFT39216 mint with the correct block-global log index107, and resumes its saved cursor. A separate finalized stream agrees with Studio and RPC at block11688819. [Live stream evidence and limitations](substreams.md#live-provider-qualification--12-september). This supersedes the missing-token access gap below; empty series still prevent an actual joined buyer result.

## Live Studio verification — 12 September

- Project [usufruct](https://thegraph.com/studio/subgraph/usufruct), version `v0.1.0`, deployment `QmNNaxtj65PaezJXR9RdrNJeQLtsNm5uhkiE1WXX7s4nnU`.
- [Public configuration](../../deployments/subgraph-sepolia.json): actual FeeStrip `0x97825ae0a3c6b52398ce666dbcd166129d61c61f`, chain11155111, startBlock11684159. Preparation checked chain and contract poolManager/positionManager/USDC bindings against the public manifest. ABI codegen and WASM build passed before deployment.
- [Initial live query](graph-studio/initial-query.json): block11688842; [subsequent hash-pinned query](graph-studio/verified-query.json): block11688863, no indexing errors, exact block hash matched PublicNode. The sampled RPC head was11688864 (one-block lag). These are point-in-time observations, not a service-availability guarantee.
- `series_collection` and `lifecycleEvents` both returned empty arrays. RPC `nextSeriesId=1` at the same block confirms no activated series. Actual sale-event mapping remains untested live.
- Number-selected `_meta` returned `hash:null`. Hash-selected queries returned the exact block hash and worked for both entity collections. Reproduce the live check with `node scripts/graph/verify-studio.mjs`; [deployment runbook](../../packages/subgraph/README.md).
- Both data adapters now select the retained Substreams hash, verify returned block/hash/deployment, and preserve the post-request database snapshot check against a concurrent sink reorg. A separate specialist reproduced the behavior and the corrected adapter against live Studio; the lead reviewed and integrated it. All29 core/data/proof-acquisition tests pass, including15 data tests. These tests do not establish a live Substreams join. Graph documents limitations during concurrent reorgs of non-final hash-selected blocks; [query consistency documentation](https://thegraph.com/docs/en/subgraphs/querying/graphql-api/).
- Queries succeeded without a query API key. The deploy key stayed in local secrets and was excluded from CLI process arguments and redacted from retained output. Studio deployment did not send a wallet transaction or publish onto the decentralized Graph Network.

Access setup is complete: the [Graph Market](https://thegraph.market/) **API Token (JWT)** is saved as `SUBSTREAMS_API_TOKEN` in ignored root `.env` and authenticates actual requests. It is distinct from the `server_...` API Key identifier; [official instructions](https://thegraph.com/docs/en/substreams/providers/the-graph-market/). Hosting, initialized history and an actual sale-series join remain before exposing buyer analysis. No Graph bounty completion is claimed.

## Earlier component evidence — 11 September

- Node tests: 17 math/history/composition tests passed. Common block/hash and pool/chain identity checked; atomic cursor+event storage, explicit reorg undo, incomplete-history coverage, block-weighted range occupancy. Tests use identified fixtures.
- Graph CLI0.98.1 / graph-ts0.38.2: actual FeeStrip ABI codegen and schema/mapping WASM build passed. No indexer execution claimed yet. Source manifest deliberately undeployed zero address.
- Substreams CLI1.22.0 be35ad3 downloaded to ignored `.scratch/bin`; official Darwin arm64 SHA25680ec00a9a89d18402420f8ae9f79575ab4696107c38169e2e81408d51e346d17 matched release checksum. No global tool installation.
- Live attempt: `.scratch/bin/substreams run https://spkg.io/v1/packages/uniswap-v4-substreams/v0.1.1 map_events --network sepolia -s 11682000 -t 11682010 -o jsonl --max-retries 0 --limit-processed-blocks 10 --final-blocks-only`.
- Result: `Unauthenticated: required authorization token not found`; zero data received, nonzero exit. No fake fallback and not recorded as passing. User notified of missing Substreams token and Studio deployment access.

A buyer-query adapter now reads persisted Substreams samples and a pinned Subgraph series at the last common retained block, normalizes Graph BigInt strings, checks matching hashes, and reports block-weighted range coverage and exact gross/net break-even. CLI and loopback HTTP service fail explicitly when live inputs are unavailable.

Reusable module/sink verification is recorded in `substreams.md`: compiled upstream/wrapper WASM, real RPC envelopes and persistent cursor/undo tests pass.

Open: actual sale-event mapping, live joined result, sustained provider freshness and live reorg exercise. Two agreeing data providers are not a settlement proof or an independent canonical-chain guarantee. The API reports the persisted checkpoint finality separately; the sink defaults to finalized-only, while explicit unfinalized ingestion requires treating unfinalized analysis as provisional. No sponsor eligibility completion claimed.
