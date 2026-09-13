# usufruct — project brief

**A market for one fixed window of a Uniswap position’s native USDC fees.**

[Open the app](https://usufruct-mu.vercel.app) · [Presenter walkthrough](docs/TEAMMATE_BRIEF.md) · [Architecture](docs/ARCHITECTURE.md)

## Who it serves

An LP can sell a defined share of future fee income for USDC upfront while retaining the right to recover their original position. A buyer can purchase that income claim without acquiring the NFT or its principal. Another holder can subsequently acquire the same unpaid claim through an executable market quote.

The product separates three things that otherwise look like one asset: the original position, its agreed USDC earning window, and fees outside that window. It also separates collecting funds from proving how those funds should be allocated.

## The instrument

| Right | What it includes |
| --- | --- |
| Fee claim | A transferable fraction of all unpaid native USDC fees from activation through the agreed endpoint; pre-purchase accrual travels with it |
| Residual right | The original NFT’s return right, other-currency fees, and USDC outside the sold window |
| Funded offer | Refundable buyer USDC awaiting the owner’s exact acceptance; it is not an activated sale |
| Signed listing | A noncustodial advertisement; it is not a funded offer or permission to transfer the NFT |

For example, a holder of 1,000 claims from an original supply of 10,000 owns 10% of the period’s unpaid USDC allocation. If another holder redeems, that original denominator does not shrink. This is an illustrative fraction, not a price or income forecast.

At acceptance, the contract clears pre-activation fees, fixes the original liquidity and range, pays the seller, and creates the claims. After the endpoint, capture collects actual fees. The NFT may return before proof allocation; unresolved buyer reserves remain segregated. Each redemption burns the holder’s quantity and rounds its USDC payment down to a base unit.

## Why the implementation is interesting

- **Canonical custody:** it preserves a particular Uniswap v4 NFT rather than replacing it with pooled principal exposure.
- **Executable liquidity:** Aqua/SwapVM uses maker inventory and explicit strategy controls; an advertised quote can be expired, depleted, revoked or stale.
- **Exact historical allocation:** permissionless evidence assembly feeds an onchain verifier. A backend’s amount or signature cannot determine the payout.
- **Useful data with limited authority:** Substreams and Subgraph results must agree on chain, pool, source block and hash. They explain history and break-even; they do not settle claims.

## What is demonstrated

The repository includes verified local contract and browser flows covering funding, acceptance, real local Aqua transfers, late capture, original NFT return, historical verification, multiple payouts and recovery failures. The public frontend and contracts are on Sepolia. Hosted Graph history/readback is documented separately; it does not establish an accepted public instrument or a live buyer-analysis join.

A complete public sale-to-redemption journey and unaided participant-wallet acceptance must be checked in [release readiness](docs/JUDGE_READINESS.md), not inferred from fixtures, fork proofs, local signatures or a healthy service response.

## Boundaries

Fees can be zero. Claims may have no resale liquidity. Proof availability and checkpoint timing are operational requirements; missing evidence can delay allocation without entitling the seller to buyer reserves. Early closure requires the residual right and every original claim before the endpoint, capture or any redemption; buying back those claims is not guaranteed.

Start an actual demonstration with the [teammate brief](docs/TEAMMATE_BRIEF.md) and [demo test runbook](docs/DEMO_TEST_RUNBOOK.md). Economic requirements are defined in the [product contract](feestrip-handoff/PRODUCT_CONTRACT.md).
