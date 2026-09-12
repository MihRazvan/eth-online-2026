# Earning-window pool-history service

`stream-service.mjs` continuously ingests finalized `map_pool_context` envelopes from the authenticated Sepolia Substreams endpoint. It stores actual provider cursors atomically with every block and sample, including empty blocks. It does not authorize fee allocations or pretend that historical catchup is current buyer analysis.

The committed configuration in `deployments/substreams-sepolia.json` describes NFT39216's canonical USDC/WETH pool, starting from a real prior Swap at11678801. Complete block-end tick history is required for every earning window; lifetime history before that window is unnecessary. Generate a private runtime copy with two additional absolute paths:

```json
{
  "db": "/data/analysis.sqlite",
  "packagePath": "/app/packages/substreams/feestrip-pool-context-v0.1.1.spkg"
}
```

Preserve all the committed fields when adding these paths. Set `GRAPH_STREAM_CONFIG` to the absolute generated JSON path. Provide `SUBSTREAMS_API_TOKEN` through the host's secret manager; no wallet key, Graph deploy key, or RPC credential belongs in this process. The runtime only reads these two environment variables. Its endpoint is fixed to `https://sepolia.eth.streamingfast.io`, and its package must match the committed SHA256. The artifact embeds its protobuf descriptors and WASM; the generated TypeScript directory is not required. Runtime imports require `@substreams/core`, `@bufbuild/protobuf`, `@connectrpc/connect`, `@connectrpc/connect-node`, the existing Substreams sink module and data store/sink modules.

```sh
node scripts/graph/stream-service.mjs --validate-only
node scripts/graph/stream-service.mjs --stop 11679301
node scripts/graph/stream-service.mjs
```

The second command is a bounded qualification, with an exclusive stop. A bounded call permits at most10000 new blocks from the saved head or configured history start. The final command follows indefinitely and must remain disabled until catchup capacity is planned. Neither command loads `.env` itself. The read-only operations API can share the database; it must independently check common-block agreement and freshness before presenting live analysis.

## Canonical anchor evidence

A live `getPoolAndPositionInfo(39216)` read identified the following PoolKey: currency0 `0x1c7d4b196cb0c7b01d743fbc6116a902379c7238`, currency1 `0xfff9976782d46cc05630d1f6ebab18b2324d6b14`, fee3000, tickSpacing60, hooks zero. `keccak256(abi.encode(PoolKey))` is `0x0c5089eb2863310ecab41eb94f2705ce37ce455a0f64a9ee627c7470b43161e8`.

On2026-09-12 an authenticated Alchemy archive read located its initialization by binary searching PoolManager slot0 at `keccak256(abi.encode(poolId,uint256(6)))`. The low160bits (sqrtPriceX96) were zero at7432531 and nonzero at7432532. An exact-block `eth_getLogs` read from canonical PoolManager `0xe03a1074c86cfedd5c142c4f04f1a1536e203543` returned Initialize at block7432532, hash `0x0f93d2201fe72fd18d971920a7118473262538ba6e2da8faabad09c5c2ad30cf`, transaction `0x85a84d3468620282e30f62a67e0f6b2390d22270c1c97c91c076be5e82403058`, transactionIndex106, block-global logIndex168, sqrtPriceX96 `79228162514264337593543950336`, tick0. This lifetime initialization observation is retained as evidence; it is not the runtime start. Broad-range PublicNode log searches returned false empty results for this history, so they were not accepted as proof that initialization was absent.

A second archive storage search located a transition into the observed current sqrtPriceX96 at11678801. Exact-block Alchemy logs and its successful transaction receipt agree on Swap at block hash `0x7236fd4559531e97ac730024a68ce457d9eaeee9a71d6e7682c00f69cf0a079b`, transaction `0x6237cd0124382cc1c66f043a3b979854653839610e720504a222f552781137ed`, transactionIndex42, global logIndex98, tick59600, sqrtPriceX96 `1559629254936028665397971089816`, amount0 `10000000`, amount1 `-3247488699`, liquidity `1000000000`, fee3000. PublicNode independently agrees on that block hash and inclusion of the transaction, although its receipt endpoint returned not found. The committed runtime anchor uses this verified Swap. A price-boundary search locates a qualifying transition; it does not prove the event is the most recent Swap.

The sink requires its first real Substreams block to be exactly the earliest configured anchor block. Every selected pool requires an anchor with kind `initialize` or `swap`, and its actual corresponding event must match block hash, transaction hash, global log index and tick. All other valid same-block events are retained and sorted, so later swaps determine the end-of-block tick. No RPC seed or invented historical block is inserted. Changed package/pool/history identity, missing retained seed samples and incompatible mid-history legacy databases fail closed. Intentional identity changes require a new database.

For multiple pools, activity before another pool's Swap anchor is allowed, but an analysis window before the selected pool's own anchor is rejected. The operations buyer reader must enforce this per-pool requirement using `saved.identity.history.initialization[]`, whose records contain `{kind,pool,block,hash,logIndex,tick,transactionHash}`. Selected-pool activity before an Initialize anchor remains invalid. This distinguishes a complete earning-window history from an unobserved earlier period.

## Recovery and resource bounds

The service resumes from its SQLite cursor after a transport disconnect or graceful process restart. It reconnects only for selected transport codes, with exponential backoff from1s capped at30s and at most8 consecutive failures. Only a newly committed higher block resets the failure count; progress messages and cursor replays do not. Each connection has a30minute deadline to bound a silent transport. Authentication, malformed data, finality-crossing undo and identity failures terminate. A host supervisor should also bound process restarts and expose repeated failures.

Every connection and at most100 responses, `statfs` checks that at least256MiB remains available on the database volume. `minFreeBytes` may raise this reserve; it cannot lower it. Low disk capacity stops ingestion with `storage-capacity-low` while retaining the SQLite cursor. This is a reserve, not a total database-size quota: plan catchup size independently and allow space for WAL plus other applications. The service checks capacity before opening the database too.

An exclusive `<db>.stream.lock` file prevents two service writers. SIGTERM/SIGINT cancels streaming/backoff, closes SQLite and removes the owned lock. A hard crash deliberately leaves the lock. For offline recovery, first stop every ingester instance and verify none can restart or write the volume; then inspect/remove that exact lock and restart one instance. Never remove an active writer's lock or run the older bounded sink against the same database concurrently. The service does not steal locks based on PID or a changed container hostname.

`seeded:true` means every configured anchor event is retained; `anchorKinds` distinguishes Swap and Initialize anchors. It does **not** mean caught up, hosted, or accepted for a live series. No live series composition is claimed by this service alone.

A bounded live lifetime-history probe retained1000 actual blocks7432532..7433531, including the exact Initialize anchor, in50.252seconds total. The closed SQLite file was1,040,384bytes (WAL excluded after close). Extrapolating to sampled head11689953 gives approximately4.43GB for4257422blocks, with no guarantee of uniform event density or future throughput. No full lifetime catchup was launched. The chosen prior Swap requires only11237blocks through sampled finalized head11690037, approximately11.7MB at that observed footprint. These are planning estimates, not completed catchup or hosted acceptance.
