# usufruct — ETHOnline 2026

**Sell your Uniswap fees upfront. Keep the right to recover your position.**

[Live application](https://usufruct-mu.vercel.app) · [Example instrument](https://usufruct-mu.vercel.app/#market/1) · [Source repository](https://github.com/MihRazvan/eth-online-2026) · [Verification](VERIFICATION.md)

usufruct lets a liquidity provider sell a fixed window of an existing Uniswap v4 position’s native USDC fees. A buyer funds exact terms; the owner accepts, receives USDC and escrows the unchanged position NFT. Transferable claims represent shares of the entire window’s unpaid income. After capture, the owner can recover the same NFT while historical proof verification separately determines the claimholders’ fee allocation.

The project combines three integrations: **Uniswap supplies the position and fee income, Aqua/SwapVM trades the claims, and The Graph composes instrument state with pool history to help buyers evaluate them.** Ethereum historical proofs determine settlement. The application runs on Sepolia with test assets.

## The Graph: composable products for fee-income analysis

Target: [Best Use of Composable or Standardized Graph Products](https://ethglobal.com/events/ethonline2026/prizes/the-graph). Our entry uses the composition route: live **Substreams + Subgraph**, plus an independently reusable Substreams module. It does not claim to implement a standardized cross-protocol Subgraph schema.

### The buyer problem

A claim’s price alone does not tell a buyer whether its underlying position was in range during the earning window. Pool activity alone does not identify that window, the position’s tick bounds or the original claim denominator. Comparing those sources at different chain states can also produce misleading results.

usufruct joins the instrument’s indexed terms with retained pool observations at one common block and hash. The buyer receives observed range occupancy, history coverage, source freshness and the whole-window income needed to break even at their selected quantity and price. This makes the two Graph products useful together in an actual purchase decision.

### What we built

| Component | Implementation | Contribution |
| --- | --- | --- |
| Reusable Rust/WASM module | [Manifest](../packages/substreams/substreams.yaml), [map](../packages/substreams/src/lib.rs), [protobuf schema](../packages/substreams/proto/context.proto) | Composes the published `uniswap-v4-substreams/v0.1.1` decoder into `map_pool_context`, with typed Initialize, Swap and ModifyLiquidity records, pool filtering and block continuity. |
| Durable Substreams consumer | [Consumer](../packages/substreams/sink/run.mjs), [sink](../packages/data/src/substreams.mjs), [history store](../packages/data/src/store.mjs) | Consumes live authenticated provider output, persists blocks and provider cursors atomically in SQLite, resumes after reconnects and handles explicit undo signals. |
| Deployed lifecycle Subgraph | [Schema](../packages/subgraph/schema.graphql), [deployment](../deployments/subgraph-sepolia.json) | Indexes NFT identity, pool, fixed range/liquidity, earning window, original claim supply and lifecycle events from the actual FeeStrip contract. |
| Buyer-analysis composition | [Source loader](../packages/data/src/buyer-analysis.mjs), [join](../packages/data/src/compose.mjs) | Queries Studio at the retained stream hash; checks source identity, chain, pool and indexing health; calculates coverage, block-weighted occupancy and break-even context. |

The pipeline has two layers of composition: an existing Uniswap Substreams decoder feeds our reusable map, then its retained output joins the application’s Subgraph. Reusing the decoder avoids maintaining another raw-event decoding pipeline. The versioned protobuf output lets other consumers use the pool-context module without deploying usufruct’s contracts, Subgraph or frontend. Network parameters include canonical Sepolia and Ethereum mainnet bindings; **public execution is demonstrated on Sepolia**, not both chains.

The module preserves exact integer values and block-global event ordering. It resolves upstream transaction-local log indices against full-block receipts and rejects ambiguous matches. The sink rejects gaps and mismatched package/network/pool identities. During composition, a database snapshot prevents a concurrent reorg from mixing new-fork observations with an old Subgraph response. [Package documentation and reproduction commands](../packages/substreams/README.md).

### Live provider evidence

The Subgraph runs in [Subgraph Studio](https://thegraph.com/studio/subgraph/usufruct), version **v0.2.0**, with deployment CID `QmXEm3WDjvy2q2xSQYoK3HmoBzGKV6oR4JgEe2QRJkWAcw`. Its [public query endpoint](https://api.studio.thegraph.com/query/1760193/usufruct/v0.2.0) is consumed alongside authenticated Graph Market Substreams delivery by the hosted analysis service. This is a Studio deployment; decentralized Graph Network publication is not claimed.

At **13 September 2026, 13:54:47 UTC**, the public analysis API joined actual series **1 / NFT 39216** at finalized block **11696247**, hash `0xa81c275bfbb0c454d480f0240c27f4687c7b5c2424dccd647590a5739239d868`:

| Recorded result | Meaning |
| --- | --- |
| 17,447 consecutive retained blocks | The production history store covered blocks 11678801–11696247 and retained its provider cursor and package identity. |
| 22 of 22 observed earning-window blocks covered | The position’s activation was 11696226. This snapshot covers the observed portion of its window, not the full endpoint interval. |
| 100% block-weighted range occupancy | All observed end-of-block ticks were in the position’s range. This does not measure within-block fee attribution. |
| Zero indexing lag relative to finalized history | The separate 66-block distance from chain head was finality lag. |
| 0.50 USDC whole-window break-even | For the supplied example of 1,000 out of 10,000 claims priced at 0.05 USDC, the calculation is `0.05 × 10,000 / 1,000`. This is an input-based threshold, not a forecast or current executable quote. |

The deployment, series identity, canonical hashes, retained package identity and occupancy calculation were checked independently. [Recorded response and checks](evidence/operations/live-series-one-graph.json) · [Evidence explanation](evidence/operations/live-series-one-graph.md).

The historical Studio side of that join can be inspected with this query at the public endpoint:

```graphql
query RecordedInstrument {
  _meta(block: {hash: "0xa81c275bfbb0c454d480f0240c27f4687c7b5c2424dccd647590a5739239d868"}) {
    block { number hash }
    deployment
    hasIndexingErrors
  }
  series(id: "1", block: {hash: "0xa81c275bfbb0c454d480f0240c27f4687c7b5c2424dccd647590a5739239d868"}) {
    tokenId
    poolId
    activationBlock
    endBlock
    tickLower
    tickUpper
    originalSupply
  }
}
```

**In the product:** open an instrument, select a quantity and inspect its optional activity/source analysis. The useful comparison is the claim’s terms and break-even threshold alongside observed range history and coverage. The retained snapshot above makes the integration inspectable even as the live instrument advances through settlement. [Loader regressions](../packages/data/test/buyer-analysis.test.mjs) and [composition regressions](../packages/data/test/data.test.mjs) cover mismatched sources and unavailable history.

Graph analytics inform a purchase; they cannot allocate or release funds. The imported decoder omits Donate and protocol-fee-change events, and end-state ticks do not establish exact swap-by-swap earnings. Missing or stale history is reported explicitly. Only the onchain historical verifier and claim accounting determine payouts.

## 1inch: a claim market built on Aqua and SwapVM

Target: [Build an Aqua App](https://ethglobal.com/events/ethonline2026/prizes/1inch).

Fee claims trade against USDC through source-pinned official Aqua and an extended SwapVM router. The application adds the upstream StaticBalances and LimitSwap instructions to the dispatcher and constructs fixed-price strategies bound to an instrument’s state. Inventory stays with the maker until execution; virtual allocations do not multiply the maker’s real balance. Trading cannot access settlement reserves.

Capture, allocation or redemption invalidate old terms. Pre- and post-transfer checks reject a trade if lifecycle state changes during execution. Makers renew quotes after those changes. Both bid and ask directions are covered by contract/local-chain tests; the demonstrated public path is an ask purchase.

A participant bought **189 + 63 + 748 = 1,000 claims** through three actual Sepolia trades, then redeemed them independently. A later public-interface repeat bought **10 claims for 0.000500 USDC** and redeemed **0.000999 USDC** before gas. The repeat also verified stale-order rejection and a renewed quote.

[Market contract](../contracts/src/market/FeeStripMarket.sol) · [Extended router](../contracts/src/market/FeeStripRouter.sol) · [Exact source pins and runtime differences](decisions/002-aqua-runtime.md) · [Public trades](evidence/operations/live-series-one-lifecycle.md) · [Interface repeat](evidence/operations/live-new-interface-repeat.md).

## Uniswap: preserve the position, separate the income

Target: [Best Uniswap Stack Contribution](https://ethglobal.com/events/ethonline2026/prizes/uniswap-foundation).

usufruct integrates canonical hookless Uniswap v4 PositionManager NFTs. Acceptance fixes the original position’s liquidity, tick range and earning window without replacing the NFT. The original NFT return right and transferable fee claims remain separate. Historical verification resolves the difficult case where collection happens after the agreed endpoint.

Public series 1 demonstrates the full lifecycle: seller acceptance, **1.499999 USDC** captured later, return of the same NFT before allocation, then verified separation into **0.999999 USDC** of sold-period income and **0.500000 USDC** of residual fees. Multiple holders redeemed independently using the unchanged original denominator. A separate fork of the exact endpoint produced the same **999999 micro-USDC** native collection as the authenticated allocation.

[FeeStrip contract](../contracts/src/FeeStrip.sol) · [Historical verifier](../contracts/src/proof/HistoricalFeeVerifier.sol) · [Public lifecycle](evidence/operations/live-series-one-lifecycle.md) · [Independent endpoint comparison](evidence/operations/live-series-one-native-oracle.md) · [Developer feedback and integration line references](../FEEDBACK.md).

## Demonstrated scope and attribution

The [verification overview](VERIFICATION.md) links public receipts and separately identifies local/fork tests. Test fee growth includes controlled funded donations; the amounts do not establish organic trading demand or future investment returns. This is a Sepolia prototype without an independent professional security audit. [Protocol specification](SPECIFICATION.md) · [Security](../SECURITY.md).

The project is an ETHOnline 2026 Classic entry. Partner links above describe the intended bounty categories and were checked on 13 September 2026; this document does not certify eligibility or completion of the submission process. Upstream source, assets and substantial AI-assisted engineering are disclosed in [Attribution](AI_ASSISTANCE.md). ScopeLift Fixed Fee Swap is credited related prior work. Powered by SwapVM — © Degensoft Ltd 2025.
