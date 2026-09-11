# FeeStrip

Sell your Uniswap fees upfront, keep your position.

Implementation in progress. The product escrows an existing canonical Uniswap v4 NFT for a fixed earning window, sells transferable claims to its native USDC fee income, and returns the same NFT after late capture. Exact historical settlement must be authenticated; estimates never authorize payouts.

Start with [status](docs/STATUS.md), [product requirements](feestrip-handoff/PRODUCT_CONTRACT.md), and [implementation brief](feestrip-handoff/START_HERE.md).

## Development

Node 24, pnpm 12, Foundry 1.5.1 (Cancun support) and Slither 0.11.5 are available on the initial development host. Follow the [reproducible development commands](docs/development.md). `node scripts/check-handoff.mjs` validates the baseline packet.

## Prior work and attribution

[ScopeLift Fixed Fee Swap](https://github.com/ScopeLift/fixed-fee-swap) is close prior work. Fee/principal separation is not claimed as new. FeeStrip intends to preserve an individual NFT, trade whole-period unpaid-income claims and settle an exact delayed endpoint. See [AI assistance](docs/AI_ASSISTANCE.md).

## Implemented and verified

The local suite now exercises funded sale → actual Aqua claim trade → late capture → same NFT return before proof → exact historical verification → independent redemption. Local full-lifecycle evidence and transaction gas are in [local-lifecycle](docs/evidence/local-lifecycle.md); genuine Sepolia witness/native collection evidence is [separate](docs/evidence/proof.md). FeeStrip is now deployed on Sepolia with canonical NFT39216 prepared for testing: [public addresses](deployments/sepolia.json), [receipts and bounds](docs/evidence/sepolia-deployment.json), and [setup runbook](scripts/public/README.md). Public sale/settlement, participant wallet acceptance and live Graph composition remain pending.

Powered by SwapVM — © Degensoft Ltd 2025. FeeStrip's market integration uses the official Aqua/SwapVM sources and their retained licenses; [runtime decision](docs/decisions/002-aqua-runtime.md). Other upstream notices remain under contracts/lib and apps/web/public/fonts. No upstream audit extends to FeeStrip.

Sponsor evidence, outstanding gates and the human-narrated demo script are in [the submission packet](docs/submission.md). Uniswap developer feedback is in [FEEDBACK.md](FEEDBACK.md).

First-party FeeStrip implementation is MIT licensed. Vendored contracts, imported Substreams sources, fonts and reference images retain their own licenses and notices; the root license does not relicense third-party material.
