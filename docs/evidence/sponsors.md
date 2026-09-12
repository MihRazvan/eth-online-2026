# usufruct sponsor evidence checklist

Reconciled 12 September 2026; current release gates are maintained in the [judge checklist](../JUDGE_READINESS.md). Event/track: ETHOnline 2026 Classic, user-confirmed. [Current decision and implementation plan](../research/bounty-readiness.md). No submission or sponsor confirmation is implied.

| Integration | Public verified | Fork verified | Local verified | Pending |
| --- | --- | --- | --- | --- |
| Uniswap | Six application/infrastructure contracts and canonical NFT39216 deployed; runtime/immutable readback | Genuine Sepolia endpoint proof equals native collection; separate prepared-NFT custody/return test captures zero USDC | Funded sale, fixed original NFT, late capture, native-N oracle, exact allocation and independent redemptions | Nonzero public lifecycle, participant signing, reusable integration explanation, human-reviewed feedback/form |
| Aqua / SwapVM | Source-pinned Aqua and custom router deployed; no public trade recorded | Full issued-claim trade on an existing official deployment not yet retained | Actual escrow-issued FeeClaim/USDC movement, bid/ask paths, shared capital depletion, stale-state/callback rollback | Public transfers, explicit deployment provenance and qualifying fork fallback or clarification |
| The Graph | Studio v0.1.0 indexes Sepolia; hash-pinned empty-series query agrees with RPC ([evidence](graph.md)); no live composition yet | Not a substitute for live-provider evidence | Subgraph build; reusable imported Substreams module, WASM/sink and common-block join tests | Actual sale-event mapping, authenticated provider stream, hosted joined query, UI result, reproducible module reuse |
| Application / recovery | Vercel Sepolia frontend, desktop/mobile disconnected inspection | Canonical public custody compatibility only | Both real-chain browser recovery variants; retained witness API and verified onchain cache | Production wallet session, public recovery/analysis routes, continuous checkpoint operation, independent storage restoration |

Evidence entry points:

- [Public addresses](../../deployments/sepolia.json), [deployment receipts](sepolia-deployment.json), [position readback](sepolia-position-readback.json), [custody fork](sepolia-fork-custody.json).
- [FeeStrip lifecycle contract](../../contracts/src/FeeStrip.sol), [claim token](../../contracts/src/FeeClaim.sol), [historical verifier](../../contracts/src/proof/HistoricalFeeVerifier.sol), [checkpoint contract](../../contracts/src/proof/BlockHashCheckpoints.sol).
- [Local integrated receipts](local-lifecycle.json), [public proof and gas](proof.md), [retention implementation](../../packages/settlement/README.md), [browser recovery evidence](../design/recovery-controls.md).
- [Aqua market](../../contracts/src/market/FeeStripMarket.sol), [custom router](../../contracts/src/market/FeeStripRouter.sol), [runtime/provenance decision](../decisions/002-aqua-runtime.md).
- [Reusable Substreams package](../../packages/substreams/README.md), [Subgraph](../../packages/subgraph/README.md), [joined analysis](../../packages/data/src/buyer-analysis.mjs).

Current-source integration requirements: [Uniswap](https://ethglobal.com/events/ethonline2026/prizes/uniswap-foundation), [1inch](https://ethglobal.com/events/ethonline2026/prizes/1inch), [The Graph](https://ethglobal.com/events/ethonline2026/prizes/the-graph). See the decision memo for applicable pools and exact remaining gates.

Before recording, retain public sale/trade/capture/return/allocation/redemption hashes, actual reserve and wallet deltas, full transaction gas, witness digest, live query heads/identities and the unaided participant outcome. Local receipt settlement gas is currently 1,425,145; the separate public proof's 4,417,289 call gas is not a full transaction benchmark.

The current worker saves evidence but does not submit checkpoints. A canonical anchor must be preserved within N+256 unless growth has already been verified and cached. Hosted operation and fallback must precede public acceptance. Two directories on the same host do not establish independent durability.

[FEEDBACK.md](../../FEEDBACK.md) exists; provider-specific observations need reconciliation and the developer feedback form remains unsubmitted. Human review, asset provenance, narration and final dashboard submission remain unrecorded. Preserve [AI attribution](../AI_ASSISTANCE.md), licenses and ScopeLift credit.
