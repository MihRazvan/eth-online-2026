# FeeStrip

Sell your Uniswap fees upfront, keep your position.

Implementation in progress. The product escrows an existing canonical Uniswap v4 NFT for a fixed earning window, sells transferable claims to its native USDC fee income, and returns the same NFT after late capture. Exact historical settlement must be authenticated; estimates never authorize payouts.

Start with [status](docs/STATUS.md), [product requirements](feestrip-handoff/PRODUCT_CONTRACT.md), and [implementation brief](feestrip-handoff/START_HERE.md).

## Development

Node 24, pnpm 12, Foundry 1.5.1 (Cancun support) and Slither 0.11.5 are available on the initial development host. Dependency pins and commands will accompany each executable component. `node scripts/check-handoff.mjs` validates the baseline packet.

## Prior work and attribution

[ScopeLift Fixed Fee Swap](https://github.com/ScopeLift/fixed-fee-swap) is close prior work. Fee/principal separation is not claimed as new. FeeStrip intends to preserve an individual NFT, trade whole-period unpaid-income claims and settle an exact delayed endpoint. See [AI assistance](docs/AI_ASSISTANCE.md).
