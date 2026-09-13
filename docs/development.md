# Development

Use Node 24.12.0, pnpm 12.3.4 and Foundry 1.5.1. Compiler graphs use Solidity 0.8.26 for native v4 and 0.8.30 for the pinned SwapVM runtime. Dependency versions and licenses are committed.

```sh
pnpm install --frozen-lockfile
forge build
pnpm generate:abis
pnpm test
pnpm test:contracts
pnpm build:subgraph
pnpm exec playwright install chromium
pnpm test:browser
pnpm build:vercel
```

`pnpm dev` opens the labelled fixture interface at http://127.0.0.1:4174. Fixture balances and transactions are simulated. The public build uses only the committed Sepolia manifest and reviewed static assets; local test wallets, generated witnesses and secrets are excluded.

## Local contract transactions

Start a dedicated disposable Anvil process:

```sh
anvil --host 127.0.0.1 --port 8545 --chain-id 31337 --hardfork cancun
```

In a separate terminal:

```sh
pnpm local:reset
VITE_DATA_MODE=local VITE_ENABLE_TEST_WALLET=true pnpm dev
```

Reset erases only that local chain and rejects a non-loopback RPC or a chain other than 31337. Open `/?wallet=seller`, `/?wallet=buyer` and `/?wallet=holder` in separate browser contexts. The test-wallet flag uses Anvil’s unlocked accounts. It does not reproduce a browser wallet’s signing interface.

The seed supplies canonical-source Uniswap contracts, local test currencies, a position NFT and a funded offer. Accept the offer, publish a maker quote and trade claims. `pnpm local:mature 1` generates controlled fee activity, retains a historical witness and advances past the endpoint. Capture, NFT return, allocation and redemption are separate actions.

## Proof and lifecycle tests

```sh
python3 -m venv /tmp/feestrip-proof-venv
/tmp/feestrip-proof-venv/bin/pip install -r scripts/proof/requirements.txt
export FEESTRIP_PROOF_PYTHON=/tmp/feestrip-proof-venv/bin/python
pnpm test:settlement
pnpm test:browser:chain
USE_VERIFIED_GROWTH_CACHE=true pnpm test:browser:chain
pnpm local:reset
pnpm test:chain
```

Each browser-chain run resets the dedicated node. The two variants test retained-witness recovery and the exact verified onchain cache. Tests cover real local funding, Aqua transfers, delayed capture, NFT return before allocation, independent payouts, refunds and receipt replacement/reorg handling. Screenshots and traces are Playwright artifacts. Local evidence is separate from the [public receipts](VERIFICATION.md).

Override `LOCAL_RPC_URL`, `FEESTRIP_TEST_WEB_PORT`, `FEESTRIP_TEST_RECOVERY_PORT` and `FEESTRIP_TEST_LISTINGS_PORT` when using isolated local services. Use a separate checkout when another app needs the generated deployment files unchanged.

## Services and analysis

The static frontend needs separately running listing, keeper, proof-retention and analysis services. See the package documentation for [signed listings](../packages/listings/README.md), [keeper](../packages/keeper/README.md), [proof retention](../packages/settlement/README.md), [remote backup](../packages/settlement/OFFHOST.md), [Subgraph](../packages/subgraph/README.md) and [Substreams](../packages/substreams/README.md).

For a seeded local chain, `pnpm local:retention-config` generates private configuration. Run `RETENTION_CONFIG="$PWD/.scratch/retention/local/local.generated.json" pnpm dev:recovery` with the proof Python configured. Restarting reuses the same database and artifacts. The read-only retention worker does not mine or submit checkpoint transactions.

Keep RPC tokens, wallet keys and deploy credentials in private environment variables. Every `VITE_` value and browser manifest is public. The [architecture](ARCHITECTURE.md) documents service authority and failure boundaries.

## Additional checks

```sh
pnpm test:mutation
pip install slither-analyzer==0.11.5
pnpm test:static
pnpm test:operations
pnpm test:keeper
pnpm test:public-setup
pnpm test:substreams
```

The denominator mutation must be rejected in a disposable project. Static analysis checks an explicitly reviewed finding baseline and fails on a change. Neither result establishes a professional audit; see [Security](../SECURITY.md).
