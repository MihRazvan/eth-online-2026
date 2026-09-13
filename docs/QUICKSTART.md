# Quickstart

The commands below run a local checkout. For the deployed application, open [usufruct](https://usufruct-mu.vercel.app) on Ethereum Sepolia; [the project brief](../PROJECT_BRIEF.md) explains the product.

## Open the interface

Use Node.js 24 or newer and the repository’s pinned pnpm 12.3.4. From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open **http://127.0.0.1:4174**. The default is explicitly labelled deterministic fixture mode: balances, transactions, time and recovery are simulated. It is useful for navigating Market, Pin a seed and Holdings without a wallet. Fixture mode does not publish real signed advertisements to the listing directory or demonstrate a public transaction.

## Build and test

```sh
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:browser
```

These run the core/data/listing regressions, production TypeScript/Vite build and hermetic interface tests. They do not replace contract or actual-chain tests.

Contracts require Foundry (the verified toolchain uses 1.5.1). Compiler versions are pinned by the sources/configuration, including Solidity 0.8.26 and 0.8.30; the EVM target is Cancun. Dependencies are vendored.

```sh
forge build
pnpm test:contracts
```

When contract ABIs change, run `pnpm generate:abis` before rebuilding the app. See [development](development.md) for proof, static-analysis, mutation and Rust/Substreams commands; each suite has a separate scope.

## Exercise real contracts on a disposable local chain

Use an otherwise unused Anvil port and a checkout dedicated to the rehearsal. The reset helper clears that node’s state and rewrites ignored local deployment/witness files. Do not point it at a shared session.

In one terminal:

```sh
anvil --host 127.0.0.1 --port 8546 --chain-id 31337 --hardfork cancun
```

In another, from the repository root:

```sh
LOCAL_RPC_URL=http://127.0.0.1:8546 pnpm local:reset
VITE_DATA_MODE=local VITE_ENABLE_TEST_WALLET=true pnpm dev
```

The generated deployment manifest supplies the local RPC and contract addresses. The test-wallet switch works only on local chain 31337, using unlocked Anvil accounts; it is never a public signing path. For the seller’s signed-listing flow, start `pnpm dev:listings` in another terminal after reset. It binds to loopback port 8791 and requires the local manifest. Claims still require an actually funded and accepted offer.

For the saved actual-chain browser suite, stop the manual local app/listing service first and install the independent proof helper’s Python dependencies:

```sh
python3 -m venv .scratch/proof-venv
.scratch/proof-venv/bin/pip install -r scripts/proof/requirements.txt
LOCAL_RPC_URL=http://127.0.0.1:8546 FEESTRIP_PROOF_PYTHON="$PWD/.scratch/proof-venv/bin/python" pnpm test:browser:chain
```

The suite resets/seeds its disposable chain and starts dedicated interface/recovery/listing services. Defaults are ports 4175, 8788 and 8791; `FEESTRIP_TEST_WEB_PORT`, `FEESTRIP_TEST_RECOVERY_PORT` and `FEESTRIP_TEST_LISTINGS_PORT` override them. It exercises real approval, funded sale, Aqua transfers, capture, original-NFT return, authenticated allocation and independent payouts, including recovery paths. A local pass is not public wallet acceptance. See [Development](development.md) for manual local steps and proof dependencies.

## Build the public frontend

```sh
pnpm build:vercel
```

The public build outputs `dist/vercel`, selects the supported Sepolia configuration and excludes local test-wallet behavior and private operational material. See [architecture](ARCHITECTURE.md) for the manifest, proxy and service boundaries.

A static build does **not** run the backend. `/api/listings` requires a persistent signed-listing service; `/api/recovery` requires retained proof storage; `/api/analysis` requires verified history; `/api/operations` reports the deployed service readiness. New funding/acceptance remains gated when required preservation services are unavailable. Missing analysis must remain unavailable rather than displaying invented history.

Keep credentials in the server/operator environment. Browser manifests, static assets and every `VITE_` value are public. See [Architecture](ARCHITECTURE.md) for service dependencies and [Verification](VERIFICATION.md) for actual public execution.
