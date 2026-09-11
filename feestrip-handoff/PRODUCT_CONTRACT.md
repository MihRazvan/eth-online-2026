# FeeStrip product contract

This defines economic outcomes. Choose internal architecture with evidence. The original research explains why these outcomes were selected; it does not establish that the complete system already works.

## Instrument and rights

Initially accept a validated, nonempty, hookless canonical Uniswap v4 PositionManager NFT with authentic chain-specific USDC as one currency. The sold asset is the pool's **future native USDC fee income**, not the NFT, both fee currencies converted to dollars, or a guaranteed return.

The funded sale escrows the original NFT and fixes its pool, range, liquidity, cleared baseline and exact end-of-block N. Draft listings do not lock it. Acceptance binds payment, quantity, terms, minimum proceeds and expiry atomically. During the term, no owner, approval, callback or helper path may change liquidity/range, remove the NFT or collect sold income.

| Right | Owner | Includes |
| --- | --- | --- |
| Fee claims, original fixed quantity Q | Current token holders, including any retained LP tokens | Proportional share of all unpaid USDC income for the sold period, including accrual before their purchase |
| Residual right | Recorded residual beneficiary | Same original NFT, other-currency fees and USDC outside the sold period |
| Pre-activation fees | LP | Cleared before the series starts; never sold retroactively |

There is no overlap between retained fee claims and the residual right. Transfers carry unpaid period income with the claim. Do not substitute per-address dividend checkpoints. Redemption must use the immutable original denominator, with explicit integer rounding and dust treatment. Supply can decrease only through specified redemption or complete recombination paths that preserve all liabilities.

Ownership of the residual right is economic ownership during escrow, not unrestricted NFT custody. Its dollar value is not guaranteed. Buyers bear variable income and range risk; a market price is a bid, not a prediction certified by the protocol.

## Endpoint, capture and release

1. Activation clears pre-period fees and records the earning baseline.
2. End-of-block N is the agreed earning endpoint, including applicable pool fee growth through that state.
3. Capture occurs at M strictly greater than N. Collect actual fees before releasing the NFT; hold the USDC reserve while allocation is unresolved.
4. After capture, the residual holder may recover the same NFT before the proof arrives. Retain the beneficiary record for later residual USDC allocation.
5. Authenticated historical evidence allocates the sold-period amount and the residual surplus. Valid submission is permissionless.
6. Claim holders redeem independently. A seller signature, seller presence, NFT callback or admin action must not be a prerequisite to a buyer's valid payment.

The baseline proof hypothesis is an authenticated historical header/account/storage witness. The verifier/provider/checkpoint design is open to improvement; the exact endpoint and trust guarantee are not. A backend signature or Graph value cannot replace authenticated entitlement. Missing proof may delay fee allocation; it cannot permit reassignment of unresolved buyer reserves to the seller or keep the captured NFT trapped.

Use actual reserve balances and segregated series liabilities. Market-maker inventory is separate. A first redemption cannot close redemption for other holders. Consume state before external effects and isolate malicious recipients.

Early closure before N requires the residual right plus **all original Q claims**, before any fee-claim redemption. It consumes all rights. It is not a unilateral seller cancellation or a guarantee that claims can be bought back.

## Canonical Uniswap details to verify

The earlier source review found the core position owner is PositionManager and the position salt is derived from `bytes32(tokenId)`. Verify against the exact deployed version; do not use the LP wallet as core owner. Bind manager, chain, pool, currencies, ticks, liquidity, salt and source layout. Use the stored tick semantics rather than reconstructing tick from square-root price at boundaries.

For a fixed-liquidity series, the intended fee calculation has the shape:

`soldUSDC = floor(L × ((feeGrowthInsideUSDC(N) − clearedBaseline) mod 2^256) / 2^128)`

This is a requirement to validate against native canonical collection, not independently sufficient proof of correct slot derivation or rounding. Use full-precision arithmetic and an independent collection oracle at an identical N snapshot. Clear or account for the activation baseline consistently in both branches.

Funded pool donations participate in the chosen fee-growth semantics. Direct escrow token transfers do not create entitlement. Inspect NFT approval, subscription, multicall and callback paths, not only the main sale method.

## Decisions owned by the implementation agent

Choose contract boundaries, token standards that preserve the rights, deployment patterns, verifier library, authenticated checkpoint mechanism, witness provider, storage caching, quote program, frontend framework, API/database boundaries, styling, charts, hosting and CI. Record consequential decisions briefly, with source versions and a concrete experiment.

Ethereum Sepolia is a candidate public-demo chain. A pinned Ethereum fork is useful for deterministic tests. Confirm actual canonical deployments, historical proof support, Aqua/SwapVM compatibility and Graph availability before locking the network. Compatibility must be demonstrated, not inferred from EVM support.

## Acceptance gates

| Gate | Required evidence |
| --- | --- |
| Funded activation | Actual transfers; failed/expired/slippage-invalid offers do not activate or strand the NFT |
| Canonical custody | Exact original NFT preserved; all active range/liquidity/fee-access bypasses rejected |
| Historical endpoint | Genuine header/account/storage witness through the intended trust path; native N-snapshot collection oracle; tampering rejected |
| Late capture | Actual fees accrue after N; M>N capture; same NFT returned before proof; both fee and residual liabilities still paid correctly |
| Claim economics | Transfers carry unpaid accrual; original-Q accounting; multiple holders redeem in varied orders without overpayment or lockout |
| Reserve conservation | Stateful, non-vacuous multi-series tests; no donation inflation or trading access to reserves |
| Early closure | Complete rights required; consumed before delivery; impossible after a fee-claim redemption |
| Aqua market | Official compatible runtime/program, real claim/USDC balance deltas, depleted/shared maker capital and bad callbacks tested |
| Graph composition | Two live products joined into useful buyer analysis; reusable module, source block/freshness and reorg handling documented |
| Application | Sale, trade, late capture, NFT return and independent redemption exercised in browser; accurate error/pending states and independent design critique |
| Evidence | Reproducible commands, pins, full lifecycle gas, honest live/fork/fixture labels, no untriaged material failures |

## Sponsor requirements

Verify the current event pages before submission. The selected partners are:

- [Uniswap: Best Uniswap Stack Contribution](https://ethglobal.com/events/ethonline2026/prizes/uniswap-foundation): meaningful v4 integration, public source, `FEEDBACK.md`, integration pointers and developer feedback form.
- [1inch: Build an Aqua App](https://ethglobal.com/events/ethonline2026/prizes/1inch): custom Aqua application, official infrastructure, actual onchain transfers and genuine history; SwapVM is favored and a local fork demo is accepted by this track.
- [The Graph: Best Use of Composable or Standardized Graph Products](https://ethglobal.com/events/ethonline2026/prizes/the-graph): live Substreams plus Subgraph composition, reusable work, public source and demo. A single ordinary subgraph or static chart does not establish this integration.

These are eligibility targets, not an assurance of awards. ScopeLift's [Fixed Fee Swap](https://github.com/ScopeLift/fixed-fee-swap) is close prior work and must be credited. Fee/principal separation, fixed bands and early recombination are not new by themselves.
