# usufruct

**Sell one window of a Uniswap position’s USDC fees upfront. Keep the right to recover the same position.**

[Live app](https://usufruct-mu.vercel.app) · [Architecture](docs/ARCHITECTURE.md) · [Specification](docs/SPECIFICATION.md) · [Verification](docs/VERIFICATION.md)

## The product

Liquidity providers can exchange a defined share of fee income for USDC today without permanently selling their position. Buyers acquire transferable fee claims without acquiring the NFT or its principal.

usufruct supports canonical, hookless Uniswap v4 positions containing native USDC. Each instrument covers one fixed earning window, with the position’s range and liquidity frozen during escrow. It does not create monthly strips, reinvest fees, or convert the other currency into USDC.

## Three workflows

**Pin a seed.** The NFT owner publishes signed terms: the share offered, asking price, exact end block and acceptance deadline. A listing moves neither funds nor the NFT. A buyer funds a refundable offer; the seller separately approves and accepts it to receive USDC and activate escrow.

**Market.** Buyers purchase issued fee claims through executable Aqua/SwapVM quotes. Claims carry their whole-window entitlement, including income accrued before purchase. Maker inventory and allowances determine what can execute; advertisements do not guarantee liquidity.

**Holdings.** Holders manage claims and quotes, recover unaccepted offers, and redeem verified allocations. The residual beneficiary can recover the original NFT after fee capture, independently of proof allocation, and withdraw residual fees separately.

## What each right includes

| Instrument | Entitlement |
| --- | --- |
| Fee claim | One original-supply fraction of the window’s native USDC allocation, until redeemed |
| Residual right | Return of the original NFT, other-currency fees, and USDC outside the sold window |
| Funded offer | Refundable buyer USDC awaiting the seller’s exact acceptance; no claims yet |
| Signed listing | A noncustodial advertisement; no funding, NFT approval or activated sale |

A holder of 1,000 claims from an original supply of 10,000 receives 10% of the period’s USDC allocation. Other holders’ redemptions do not change that denominator. Payments round down to a USDC base unit.

After the endpoint, capture collects actual fees. Authenticated historical state determines which USDC belongs to the sold window, even when collection happens late. The contract computes the allocation; an indexer, estimate or server-supplied amount cannot authorize a payout.

## Availability and limits

The [public application](https://usufruct-mu.vercel.app) uses Ethereum Sepolia and test assets. Actual public funding, claim trades, capture, NFT return, historical allocation and independent redemptions are documented in [Verification](docs/VERIFICATION.md). Local contract and browser suites exercise additional failure and recovery paths. Neither testnet activity nor local coverage constitutes a security audit or mainnet deployment.

Fees can be zero. Resale liquidity and historical-proof availability are not guaranteed. Missing evidence can delay allocation while buyer reserves remain segregated. Early closure requires the residual right and all original claims before the cutoff; reacquiring those claims is not guaranteed.

For a local preview, real local-chain transactions and build instructions, see [Quickstart](docs/QUICKSTART.md).
