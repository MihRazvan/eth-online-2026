# usufruct sponsor evidence checklist

Updated 13 September 2026 after the actual series 1 allocation observation. ETHOnline 2026 **Classic** is user-confirmed. This is evidence for the selected targets, not a submission receipt or sponsor eligibility decision. [Owner checklist](../JUDGE_READINESS.md), [recording packet](../submission.md).

## Selected bounty requirements

Official pages were rechecked 13 September. The team must verify the same selections in its dashboard.

| Target | Requirement | Verified project evidence | Still needed |
| --- | --- | --- | --- |
| [Uniswap — Best Uniswap Stack Contribution](https://ethglobal.com/events/ethonline2026/prizes/uniswap-foundation) | Meaningful stack integration, public code, README integration pointers, FEEDBACK and developer feedback form | Canonical v4 NFT 39216 accepted intact; actual fees captured; same NFT returned before allocation; authenticated fixed endpoint. Public allocation observed at 999999 USDC micros | Public lifecycle/payout receipts available; human FEEDBACK review and [required form](https://developers.uniswap.org/hackathon-feedback) submission |
| [1inch — Build an Aqua App](https://ethglobal.com/events/ethonline2026/prizes/1inch) | Custom Aqua position using official Aqua/SwapVM; real token-transfer demo and meaningful Git history; modified SwapVM redeployment allowed | Source-pinned official Aqua and custom SwapVM dispatcher; three actual Sepolia claim/USDC purchases totalling 1,000 claims; local bid/ask/callback/recovery regressions | Show the real trades in the human demo; identify source pins/extension; show the renewed 990-claim judge quote and explain operator renewal |
| [The Graph — Best Use of Composable or Standardized Graph Products](https://ethglobal.com/events/ethonline2026/prizes/the-graph) | Live provider data, composed Graph products or meaningful standardization, reusable open work and short demo | Actual series 1 Studio state joined with hosted Substreams history at one canonical finalized block; reusable versioned SPKG and consumer | Explain how composition helps a buyer in the human demo; show current request/freshness. The live join is verified, not a forecast or settlement oracle |

Use the ordinary Classic-compatible Uniswap/Aqua targets, not their Continuity-only variants. The selected Graph route is the composition track; no AI-agent or one-prompt-deployment bounty claim is made.

## Public, fork and local evidence

| Integration | Actual public evidence | Separate fork/local evidence | Limit |
| --- | --- | --- | --- |
| Uniswap / fixed endpoint | [Activation](https://sepolia.etherscan.io/tx/0xd2d549c1607418cb2b8893d456bc4d9153e4b51ab19c93854da831eb09f70336), [capture](https://sepolia.etherscan.io/tx/0x4f00faa90d98cde6a87a0fe5d9f7675151ef8260815a3f14db8c53acc780ee79), [NFT return](https://sepolia.etherscan.io/tx/0xa15a77e111e3e8e75bc63b8cea8982e4041546337186f90620ef0237cfcc5442), [allocation](https://sepolia.etherscan.io/tx/0xf5cbfa5deb0b7ecd05d59a06daec73ca6c9a5def7dc50aea10fc904abcc50101) | [Actual endpoint fork oracle](operations/live-series-one-native-oracle.md): native collection 999999 micros exactly matches authenticated growth; no pool/storage/balance edits. [Local lifecycle](local-lifecycle.json) includes independent payouts | Full public lifecycle, independent payouts and residual withdrawal confirmed; remaining judge claims are funded and unredeemed |
| Aqua / SwapVM | Teammate 0x746b…4C6d bought [189](https://sepolia.etherscan.io/tx/0x2c369fcc59d2af2762e11a7ccca76b10aed32633cb70c050056f76243a658b9b), [63](https://sepolia.etherscan.io/tx/0xfba1f66a9e6c8294e7ecbc992f448828c584ef6e74fcf2d1fedb4521847ac504), then [748](https://sepolia.etherscan.io/tx/0x0d09b53db087f1f60fada8969c3accd583b53f4bd5872175c5ba44bbb30d08c9) claims, 1,000 total | Actual issued FeeClaim bid/ask movements and adversarial rollback tests | Actual purchases do not establish an unaided user study or guarantee another executable quote |
| Graph composition | [Live joined series 1 query](operations/live-series-one-graph.md), [JSON](operations/live-series-one-graph.json), [hosted history](operations/hosted-graph-readback.json) | Reorg/undo, mismatched common hash, coverage and bounded-query regressions | Recorded 22/22 blocks are the observed partial earning interval, not all ofN;100% block occupancy is not per-swap fee attribution |
| Operated preservation | [Finalized keeper receipt and actual remote restore](operations/live-series-one-restore.json), [hosted restart](operations/hosted-restart.json) | Signature/nonce/budget/reorg and proof-corruption tests | Fresh local DB restored via 2 remote GETs with zero writes/no RPC proof fallback. Hosted failover was not performed; two host directories alone are not independent backup |
| Frontend | Production seller/buyer browser flow plus real teammate purchases | [Browser tests](browser.md), [stencil/listing regressions](../design/STENCIL_VERIFICATION.md) | Human teammate purchase/redemption and one controlled UI repeat confirmed; renewed 990-claim quote verified; unaided human comprehension remains open |

Public series 1 uses **controlled funded donations**. Native endpoint income is **0.999999 USDC**; later capture is **1.499999 USDC**; public allocation records **0.999999 sold / 0.500000 residual**. Original **Q=10000** remains the denominator. These small test amounts establish protocol behavior, not organic demand or retail profitability. Quote prices and analytics inputs must not be substituted for actual trade balances.

Confirmed payouts are 0.099999 USDC for the teammate’s 1,000 claims, 0.149999 USDC for the original buyer’s 1,500 claims, and 0.649999 USDC for the seller’s 6,500 claims. The seller separately withdrew the 0.500000 USDC residual. A later controlled holder bought 10 claims for 0.000500 USDC and redeemed them for 0.000999 USDC through the updated public UI. Current totals are 9,010 claims redeemed / 0.900996 USDC paid / 0.099003 USDC retained, with 990 funded, unredeemed claims reserved for judges. A single redemption of those 990 claims would pay 0.098999 USDC and leave four micro-USDC of rounding dust; splitting redemptions may increase dust. The reserve remains a liability, not available project cash. [Public lifecycle receipts](operations/live-series-one-lifecycle.md).

The controlled repeat [purchase](https://sepolia.etherscan.io/tx/0x239f863f30530277460a0ef8f05f03724196cf0f6cecc9767c894fb27a93b909) and [redemption](https://sepolia.etherscan.io/tx/0xd82bf3a5625e43d8e5018024cc546b87c84ebf8cbe4469ad3dc3d45452bdeb50) extend the earlier lifecycle snapshot. They are actual canonical receipt observations, not a claim of finality or a second unaided human session.

The renewed **990-claim / 0.049500-USDC ask**, expiring **20 September at 14:45 UTC**, is published and executable at this checkpoint. [Renewal transaction](https://sepolia.etherscan.io/tx/0x9ccafb84b0c67dbfd575f206399938de7dc17c0e47472c33b44888bf7fe2150d). A redemption invalidates existing quotes; the maker must publish fresh terms for remaining inventory. Check availability before recording or inviting another buyer.

## Code and provenance pointers

- [Current deployment manifest](../../deployments/sepolia.json), [reviewed upgrade readback](operations/commitment-upgrade-readback.json).
- [FeeStrip](../../contracts/src/FeeStrip.sol), [FeeClaim](../../contracts/src/FeeClaim.sol), [HistoricalFeeVerifier](../../contracts/src/proof/HistoricalFeeVerifier.sol), [BlockHashCheckpoints](../../contracts/src/proof/BlockHashCheckpoints.sol).
- [Aqua market](../../contracts/src/market/FeeStripMarket.sol), [custom router](../../contracts/src/market/FeeStripRouter.sol), [exact runtime/provenance decision](../decisions/002-aqua-runtime.md). This is a source-pinned fresh deployment with an explicitly documented dispatcher extension; do not call it an unchanged existing public SwapVM instance.
- [Reusable Substreams module](../../packages/substreams/README.md), [Subgraph](../../packages/subgraph/README.md), [joined buyer analysis](../../packages/data/src/buyer-analysis.mjs). Instrument rights come from the Subgraph; retained pool activity supplies observed range context; the common block/hash prevents mixed-state analysis.
- [FEEDBACK](../../FEEDBACK.md), [AI assistance and human contribution record](../AI_ASSISTANCE.md), [independent review scope](integration-review.md). Keep upstream licenses and ScopeLift attribution.

Teammate redemption [0x3ac5…8a3e](https://sepolia.etherscan.io/tx/0x3ac55ef51fee55243983065ab343e41d9b1dd57b72f02a4d0f3340822f028a3e) paid 0.099999 USDC for 1,000 claims using 122,011 gas. Allocation used 4,396,570 gas. Both are actual canonical receipt observations; finality is not asserted here.

Human narration, final form submission, Classic asset provenance review and the dashboard upload are still team tasks. Use the measured 4,396,570 gas allocation receipt, not its 4,442,739 gas estimate or an older proof-call benchmark. The final submission should link the [complete public lifecycle evidence](operations/live-series-one-lifecycle.md).

[Independent updated-interface repeat and executable quote verification](operations/live-new-interface-repeat.md) records the later 10-claim purchase/redemption, exact stale-order rejection and renewed 990-claim ask.
