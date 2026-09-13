# Verification

The application and contracts run on Ethereum Sepolia. The records below distinguish actual public transactions from local and fork checks. They do not constitute a security audit or commercial validation.

## Public lifecycle

Series 1 uses canonical NFT **39216**, original supply **10,000 claims**, activation **11696226** and endpoint **11696317**. A seller received **0.25 USDC** for 2,500 claims. A separate participant bought 1,000 claims through three Aqua/SwapVM trades and redeemed them for **0.099999 USDC**.

Late capture collected **1.499999 USDC**. The original NFT returned before allocation. Historical verification assigned **0.999999 USDC** to the sold window and **0.500000 USDC** to later fees. Multiple holders redeemed independently; the seller withdrew the residual.

A further purchase and redemption through the updated public interface paid **0.000500 USDC** for ten claims and redeemed them for **0.000999 USDC**, before ETH gas. At the recorded checkpoint, **990 claims** remained outstanding against **0.099003 USDC** of retained reserve. Their refreshed maker quote was independently checked against actual inventory, approval, series state and router output. Quotes can expire or become stale after another redemption.

- [Public lifecycle and reconciled receipts](evidence/operations/live-series-one-lifecycle.md)
- [Subsequent interface trade, redemption and quote renewal](evidence/operations/live-new-interface-repeat.md)
- [Deployment addresses](../deployments/sepolia.json) and [runtime/source pins](evidence/sepolia-deployment.json)

These small test amounts exercise accounting. Controlled funded donations generated test fee growth; they are not evidence of organic demand or repeatable investment returns.

## Uniswap and historical proofs

An independent native collection on a fork of the exact public endpoint produced **999999 USDC micros**, matching the authenticated historical allocation. The fork comparison is separate from the actual public allocation transaction.

The deployed keeper preserved N at N+2. The endpoint and checkpoint receipt finalized. The retained witness was restored from private remote storage into a fresh database using two GETs, without an RPC-witness fallback or a hosted database reset.

- [Native endpoint comparison](evidence/operations/live-series-one-native-oracle.md)
- [Checkpoint, finality and authenticated remote restoration](evidence/operations/live-series-one-restore.json)
- [Normal service restart](evidence/operations/hosted-restart.json)
- [Uniswap developer feedback](../FEEDBACK.md)

## Aqua / SwapVM and The Graph

Public purchases execute the source-pinned Aqua and extended SwapVM router. The [runtime documentation](decisions/002-aqua-runtime.md) explains the added fixed-price instructions and state guards. Exact stale-order rejection and renewed executable inventory are recorded in the public repeat above. Trading has no access to settlement reserves.

The Graph integration joins the actual series’ Studio Subgraph state with hosted Substreams history at the same finalized block and hash. The recorded snapshot covers 22 of 22 observed earning-window blocks. That partial-period observation is useful context, not endpoint fee attribution or a forecast.

- [Live common-block composition](evidence/operations/live-series-one-graph.md)
- [Reusable Substreams module](../packages/substreams/README.md)
- [Lifecycle Subgraph](../packages/subgraph/README.md)

## Reproduce the checks

```sh
pnpm test
pnpm test:contracts
pnpm test:public-setup
pnpm test:settlement
pnpm test:operations
pnpm test:keeper
pnpm test:browser
pnpm build:vercel
```

The current interface has 109 hermetic browser regressions. Separate real local-chain browser runs exercise retained-proof and verified-cache settlement, funding, trading, custody, cancellation and independent payouts. These counts describe distinct suites and are not an aggregate public-user study.

See [Quickstart](QUICKSTART.md) and [Development](development.md) for dependencies and local-chain commands. [Static analysis](evidence/static-analysis.md) records reviewed findings rather than claiming a clean audit. CI runs contract, application and Substreams verification from the committed source.
