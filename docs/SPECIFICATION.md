# Protocol specification

usufruct sells a fixed window of an individual Uniswap v4 position’s native USDC fees. The deployed protocol is named FeeStrip. [Architecture](ARCHITECTURE.md) maps these rights to contracts and services.

## Instrument and rights

Eligible positions are nonempty, hookless canonical Uniswap v4 PositionManager NFTs containing the network’s authentic USDC. A signed listing advertises terms without moving funds or approving the NFT. A separate buyer funds a refundable offer; seller acceptance validates the reviewed position commitment and atomically activates the sale.

Acceptance clears pre-activation fees to the seller, escrows the original NFT, fixes its pool, range and liquidity, records the fee-growth baseline, and establishes an exact end block N. It issues an original supply Q of 10,000 fee claims with 18-decimal precision. USDC uses six decimals.

| Right | Entitlement |
| --- | --- |
| Fee claim | Its fraction of the entire sold window’s unpaid native USDC, including income accrued before a transfer |
| Residual right | The same NFT’s return right, other-currency fees, and USDC outside the sold window |
| Unaccepted funded offer | Buyer USDC refundable through cancellation; it is not an issued fee claim |

Liquidity, range and custody cannot change during the active sale. There is no conversion of other-currency fees to USDC, guaranteed income, monthly tranche or unilateral cost-plus buyback.

## Endpoint and allocation

The earning window begins after activation and ends at the end of block N. Capture occurs at M > N and may collect both sold-window and later fees. The residual owner can recover the same NFT after capture, independently of proof allocation.

A retained canonical N blockhash anchors historical account and storage proofs. The verifier authenticates the PoolManager’s fee-growth state, including range boundaries, against that exact header. Frozen liquidity and the activation baseline determine the sold allocation using Uniswap’s integer arithmetic. The contract rejects an allocation larger than the captured USDC reserve. The remainder belongs to the residual right.

A keeper must preserve the blockhash within Ethereum’s recent-block window; proof retention is a separate availability requirement. Unavailable evidence can delay allocation. It does not transfer unresolved claim reserves to the seller. Neither Graph analytics nor a server-provided amount can authorize settlement.

## Redemption and trading

```text
payout = floor(redeemed claim quantity × sold-window USDC / original Q)
```

Each holder redeems independently and burns only its own claims. Original Q stays fixed after burns. Rounding dust remains segregated in the series; it is not withdrawable residual income. Funded offers, claim reserves and residual reserves remain separate liabilities.

Aqua/SwapVM strategies trade actual maker inventory. Quotes bind the series state, exact price ratio, deadline and token pair. Lifecycle changes, including redemption, invalidate old quotes; the maker must publish a new strategy. Multiple quotes sharing inventory do not create additional backing.

Early recombination requires the residual right and all original Q before the cutoff, capture or redemption. Acquiring those rights is not guaranteed. [Verification](VERIFICATION.md) distinguishes public execution, native endpoint fork checks and local regressions.
