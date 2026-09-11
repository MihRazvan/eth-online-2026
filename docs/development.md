# Reproduce FeeStrip

Use Node24.12.0, pnpm12.3.4 and Foundry1.5.1. Solidity graphs select0.8.26 for native v4 and0.8.30 for the pinned SwapVM runtime. Dependencies and licenses are retained; install only this project's pinned packages.

```sh
pnpm install --frozen-lockfile
forge build
pnpm generate:abis
pnpm test
pnpm test:contracts
pnpm build
pnpm build:subgraph
pnpm exec playwright install chromium
pnpm test:browser
```

The default `pnpm dev` serves the visibly labeled deterministic fixture at `http://127.0.0.1:4174`. Fixtures do not claim live revenue, liquidity or transactions. Screenshots and rendered alternatives are in `docs/design`.

## Real local transactions

Start a dedicated Anvil process in another terminal. Reset commands erase **that local development chain** and reject a non-loopback RPC or a chain other than31337. Do not share this node with unrelated work.

```sh
anvil --host 127.0.0.1 --port 8545 --chain-id 31337 --hardfork cancun
pnpm local:reset
VITE_DATA_MODE=local VITE_ENABLE_TEST_WALLET=true pnpm dev
```

Open `http://127.0.0.1:4174/?wallet=seller`, `?wallet=buyer` and `?wallet=holder` in separate browser contexts. The explicit local test flag uses Anvil's unlocked accounts; it does not test a production wallet's signing screens. The chain uses canonical Uniswap source deployments and clearly labeled local faucet currencies. Generated deployment addresses and witnesses are ignored by Git.

The seed creates an existing nonempty hookless NFT, clears no sale terms automatically, and funds an unaccepted offer. Seller approval only authorizes NFT transfer; seller acceptance is the separate funded transaction. Buyers can publish real Aqua inventory and trade claims. After acceptance/trading, run `pnpm local:mature 1` to fund native pool donations, retain the authentic N header/storage witness and advance beyond N. Capture, return the NFT, submit the retained proof, and redeem through the app. Donations are demo activity, not organic yield.

Install the independent witness validator first (see [retention setup](../packages/settlement/README.md)): create a Python virtual environment, install `scripts/proof/requirements.txt`, and export `FEESTRIP_PROOF_PYTHON` to its Python executable. `pnpm test:settlement` runs the offline cryptographic and recovery regressions.

For the independent transaction-level regression, start with `pnpm local:reset` and run `pnpm test:chain`. It compares settlement against a native collection branch at the identical N snapshot, then checks actual payouts, residual assets and dust. It also runs the retention worker at N, restarts without replacement proof access, repairs a corrupted copy, and revalidates the API witness before Solidity settlement. It consumes the seeded offer, so reset before another run. Run `pnpm test:browser:chain` for the saved browser lifecycle; it resets the dedicated node itself. Its receipts and screenshots are distinct from fixture tests.

To isolate browser transactions from a running8545 development node, start another Anvil on8546 and run `LOCAL_RPC_URL=http://127.0.0.1:8546 pnpm test:browser:chain`. It still writes this checkout's generated deployment/witness files; use a separate checkout if another app needs those files unchanged. Browser artifacts are separated under `apps/web/test-results/fixtures` and `apps/web/test-results/chain`. The transaction suite now also cancels the buyer's expired, unaccepted seed offer and verifies its exact refund without changing settled reserves. Buyers can do this through **Your positions → Your funded offers → Review cancellation**; expiry alone does not refund capital.

## Independent checks

```sh
pnpm test:mutation
pip install slither-analyzer==0.11.5
pnpm test:static
pnpm test:fork
node scripts/chain/preflight-sepolia.mjs
```

Mutation runs in a disposable project and must fail an executed independent accounting assertion. Static analysis compares13 individually reviewed findings and fails on any delta. Fork/preflight commands require public RPC access and fail on provider errors; they are deliberately separate from hermetic CI. They do not broadcast transactions. See `docs/evidence/proof.md` for the independent retained-trie Python check and exact public evidence scope.

## Live analysis configuration

The Substreams sink and Subgraph are reusable components under `packages/substreams` and `packages/subgraph`. The Subgraph's checked-in zero-address manifest is not deployable product configuration. Set a verified FeeStrip address/deployment block, deploy to the existing Graph project, ingest the matching chain's stream and retain its database before running live composition.

Keep a private JSON configuration outside tracked files with `rpcUrl`, `subgraphUrl`, immutable Subgraph `deployment`, `database` and 32-byte SHA256 `packageIdentity` of the actual built Substreams package. Keep `GRAPH_API_KEY` in the server environment when the gateway requires it. Endpoints with embedded credentials must never enter a public frontend config or evidence file.

```sh
node scripts/chain/analyze.mjs /path/to/private-analysis.json 1 1000000000000000000 1000000 0
DATA_CONFIG=/path/to/private-analysis.json node packages/data/src/server.mjs
```

The CLI prints a buyer result for the requested claim quantity and USDC cost in base units. The HTTP service binds127.0.0.1:8787 and exposes `/api/analysis?seriesId=1&quantity=1000000000000000000&price=1000000&executionCost=0`. Proxy this route from the frontend origin. It selects a common retained block, requires matching hashes/deployment/chain, reports source lag and unknown coverage, and never supplies settlement amounts. Missing provider access or inconsistent sources produce an explicit error. Live Graph acceptance is currently blocked by missing access; local envelope tests and a WASM build are not a substitute.

## Public deployment

Sepolia is the selected candidate. `preflight-sepolia.mjs` checks the canonical manager addresses, pinned deployed code, manager relationship and Circle USDC decimals. The latest read-only result is retained in `docs/evidence/sepolia-preflight.json`. A USDC proxy runtime pin does not freeze its implementation.

No public FeeStrip deployment has been broadcast. With an approved funded Sepolia signer, deploy BlockHashCheckpoints, HistoricalFeeVerifier(PoolManager, checkpoints), FeeStrip(PositionManager, authentic USDC, verifier), Aqua (or verify an existing canonical deployment), FeeStripRouter(Aqua, verified Sepolia WETH, router owner), and FeeStripMarket(FeeStrip, router), using the actual artifact constructor ABIs. Record transaction receipts and verify every immutable binding before publishing application/subgraph configuration. Never reuse local faucet addresses.

Public endpoint proof retention and a permanent blockhash checkpoint are separate operational obligations. The tested public provider serves proofs only near the tip; arrange reliable witness capture at N and checkpoint within256 blocks. A timeout cannot award unresolved buyer reserves to the seller. Complete a controlled funded public sale and exact N proof/native-collection comparison before claiming public lifecycle acceptance.

## Continuous local proof recovery

After seeding, run `pnpm local:retention-config`, then `RETENTION_CONFIG="$PWD/.scratch/retention/local/local.generated.json" pnpm dev:recovery` in another terminal with `FEESTRIP_PROOF_PYTHON` set. Start before N. The read-only worker discovers active series and retains exact endpoint proofs; it never mines, checkpoints or settles for you. Vite proxies `/api/recovery` to its loopback8788 API. Restart the same command to reuse the retained database and two filesystem copies. See [retention operations and limitations](../packages/settlement/README.md).
