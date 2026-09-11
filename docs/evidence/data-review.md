# Buyer-analysis integration review

Reviewed 2026-09-11 by the Codex protocol specialist, independently of the data implementation owner. Scope: `packages/data/src/{buyer-analysis,store,compose,server}.mjs`, buyer-analysis tests, and the Subgraph schema/mapping in the lead's root worktree. This was a bounded read-only review of integration changes in progress, not a full security audit. The reviewer changed only this report in its isolated worktree; the lead implemented the fixes below.

## Findings and verification

### P1: reorg could attribute replacement ticks to an old block hash — fixed

The initial implementation read the retained block/hash before awaiting the pinned Subgraph query, then read tick samples afterward. A concurrent sink rollback/replacement during the await could therefore join old Graph metadata with replacement-fork ticks and report `stale: false`.

Independent reproduction used retained blocks 10–13, initial tick 0 within range [-10,10), and an HTTP stub returning Graph block 13's old hash. During its second request, the stub rolled the store back to 12 and applied replacement block 13 with tick 100 and a different hash. The result claimed the old hash and old cursor but returned occupancy 7,500 bps; the old fork's correct occupancy was 10,000 bps. No source files were changed for the reproduction.

The fix reads common-block metadata, first retained block and samples after the network await inside one SQLite read transaction (`HistoryStore.snapshotSamples`). Composition then compares that snapshot's hash to Graph metadata. The retained regression test now rejects this exact replacement-fork case. This fixes mixed-snapshot attribution; it does not independently authenticate a provider's data.

### P2: collection query used the singleton field — fixed

`querySubgraph` originally used `series_collection: series(first: 100, ...)`. The alias only changed the response key: it still selected the singleton field, which requires `id`, and supplied collection-only arguments. The `Series` entity produces singular `series` and plural `series_collection`; the actual collection field is now selected directly. The buyer's `series(id: ...)` query was unaffected.

This was checked against Graph Node's official [query-name generation](https://github.com/graphprotocol/graph-node/blob/master/graph/src/data/graphql/ext.rs) (`camel_cased_names` appends `_collection` when plural and singular coincide) and [API schema generation](https://github.com/graphprotocol/graph-node/blob/master/graph/src/schema/api.rs) (distinct by-ID and collection arguments). Live Graph endpoint execution remains pending; HTTP stubs do not establish provider acceptance.

### P2: reported stream identity came from query/configuration — fixed

The initial buyer path copied stream chain/manager/pool from the Graph series and package identity from server configuration. It neither parsed nor checked the persisted sink checkpoint. Changing the configured package name could relabel the same database; requesting a pool outside the retained selection could still produce an apparently verified source result with unknown coverage. Its cursor output was the entire checkpoint JSON rather than the provider cursor.

The revised path validates checkpoint version, chain, manager, selected pool membership, package hash and provider cursor against both first and common-block checkpoints. It derives reported package/cursor from persisted metadata. This matches the sink's version-1 checkpoint envelope, instead of accepting legacy arbitrary cursor fixtures. Source identity remains operator/provider metadata, not an independent proof of what the provider processed.

### P2: recombined series could receive actionable buyer metrics — fixed

The initial Subgraph schema and buyer query omitted `closed`, despite handling `Recombined`. An all-burned, recombined series could still receive a hypothetical break-even purchase metric. The integrated schema/mapping now expose `closed`; the buyer query requests it and `redeemedQuantity`, and rejects closed or fully redeemed series before composing actionable metrics. This was confirmed by source inspection; the targeted suite covers ordinary active-series behavior but does not itself constitute live indexing acceptance.

## Remaining limits

- A shared block hash demonstrates agreement between the two configured data sources. The RPC currently supplies chain ID and head number, not an independently checked common-block hash. If unfinalized streaming is enabled, both providers can temporarily agree on an orphaned block. The response now exposes nonnegative retained finality height as `substreamsFinalBlock` and whether the source falls within it as `sourceFinalized`; the sink defaults to finalized-only blocks. An operator explicitly allowing unfinalized observations must preserve that distinction in presentation. A recent block number alone is not finality, and provider-reported finality is not an independent consensus proof.
- Supply remains an exact decimal string converted to `BigInt`; chain/block/tick values pass safe-integer conversion before arithmetic. The reviewed break-even calculation uses the original denominator and rounds the required total allocation upward. Occupancy weights elapsed blocks and exposes unknown history; it is not intra-swap fee attribution, revenue prediction or settlement authority.
- No live Graph/Substreams access acceptance is claimed. Tests use explicit transport-shaped fixtures or HTTP stubs. The deployed Subgraph, authenticated provider history, actual cross-product common-block join and browser presentation against those live sources remain external acceptance gates.

## Commands

Run from the root worktree after the snapshot, identity and collection-query fixes:

```sh
node --test packages/data/test/buyer-analysis.test.mjs packages/data/test/data.test.mjs packages/core/test/economics.test.mjs
```

Result: 10 passed, 0 failed. Node emitted its experimental SQLite warning. This targeted run verifies local behavior only; it is not a live-provider or comprehensive audit result.

Attribution: review, reproduction and report authored by Codex; no human audit, approval or provider access is implied.
