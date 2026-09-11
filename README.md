# FeeStrip

Sell your Uniswap fees upfront, keep your position.

Implementation in progress. The product escrows an existing canonical Uniswap v4 NFT for a fixed earning window, sells transferable claims to its native USDC fee income, and returns the same NFT after late capture. Exact historical settlement must be authenticated; estimates never authorize payouts.

Start with [status](docs/STATUS.md), [product requirements](feestrip-handoff/PRODUCT_CONTRACT.md), and [implementation brief](feestrip-handoff/START_HERE.md).

## Development

Node 24, pnpm 12, Foundry 1.5.1 (Cancun support) and Slither 0.11.5 are available on the initial development host. Dependency pins and commands will accompany each executable component. `node scripts/check-handoff.mjs` validates the baseline packet.

## Prior work and attribution

[ScopeLift Fixed Fee Swap](https://github.com/ScopeLift/fixed-fee-swap) is close prior work. Fee/principal separation is not claimed as new. FeeStrip intends to preserve an individual NFT, trade whole-period unpaid-income claims and settle an exact delayed endpoint. See [AI assistance](docs/AI_ASSISTANCE.md).

## Implemented and verified

The local suite now exercises funded sale → actual Aqua claim trade → exact historical verification → late capture → same NFT return before proof → independent redemption. Local full-lifecycle evidence and transaction gas are in [local-lifecycle](docs/evidence/local-lifecycle.md); genuine Sepolia witness/native collection evidence is [separate](docs/evidence/proof.md). Public FeeStrip deployment and live Graph composition remain pending access and operational verification.

Powered by SwapVM — © Degensoft Ltd 2025. FeeStrip's market integration uses the official Aqua/SwapVM sources and their retained licenses; [runtime decision](docs/decisions/002-aqua-runtime.md). Other upstream notices remain under contracts/lib and apps/web/public/fonts. No upstream audit extends to FeeStrip.
