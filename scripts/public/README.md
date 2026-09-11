# Sepolia setup

This command deploys the six FeeStrip/Aqua contracts and mints one small, hookless canonical USDC/WETH position to the configured wallet. It does not activate a sale or establish public settlement, live Graph integration, or human wallet acceptance.

Keep `PRIVATE_KEY` and an HTTPS `SEPOLIA_RPC_URL` in ignored root `.env` (mode0600). Initial balance must cover20 native Sepolia USDC and test ETH. The mint caps are5USDC and0.003WETH; at least15USDC remains outside the position. Total worst-case transaction gas plus native value is bounded at0.25testETH. No mainnet chain is accepted. The existing pool's test price is not a fair-value estimate.

Build artifacts with `forge build`. First start `node scripts/public/rpc-proxy.mjs`. It binds only127.0.0.1:8790, forwards an explicit read-method allowlist, and keeps the upstream credential out of Anvil process arguments. Use a recent known Sepolia block for a dedicated fork:

```sh
anvil --fork-url http://127.0.0.1:8790 --fork-block-number BLOCK_NUMBER --chain-id 11155111 --port 8552 --hardfork cancun --silent
node scripts/public/deploy.mjs rehearse
node scripts/public/rehearse-custody.mjs
```

The rehearsal uses Anvil impersonation and unsigned local RPC transactions. It never signs replayable public transactions. Custody verification snapshots and restores only this dedicated fork. Keep this node isolated from other work.

After reviewing the rehearsal evidence, execute the same implementation against public Sepolia:

```sh
node scripts/public/deploy.mjs broadcast
```

The runner requires a successful mint and custody rehearsal for the same wallet, canonical pins, scripts and compiled artifacts. It requalifies code, simulates every new transaction, pins nonces, validates signed envelopes and verifies deployed immutable bindings. Do not use the deployment wallet concurrently: an unexpected pending transaction or nonce fails closed. Public receipts wait for two confirmations; this is not finality.

Each mode writes a private `.scratch/public-MODE/journal.json`, with an exclusive process lock, fsync and atomic rename before broadcasting. A public signed transaction's exact bytes and hash are persisted before sending. Restart with the same command; confirmed steps are read again and missing transactions may resend the identical signed bytes. No replacement transaction is invented. Do not delete a public journal to work around a failure. If a crash leaves `runner.lock`, confirm the recorded process has stopped and inspect chain nonces/receipts before removing only the stale lock. An interrupted unsigned fork send without a hash is deliberately ambiguous: rebuild this dedicated rehearsal, never infer public success from it.

Mint price/range/liquidity, wrap amount and deadlines are saved before sends. Existing allowances are not interpreted as a completed transaction. Permit2 and token approvals are bounded; leftover Permit2 authorization expires after30minutes. An incomplete mint plan may expire and require explicit diagnosis; deadlines do not silently change on restart. The NFT ID comes from the actual mint receipt, then ownership, range, pool and liquidity are checked onchain.

`deployment.json` and `evidence.json` beside the journal omit RPC credentials and raw signed bytes. Only the sanitized files are candidates for publication. The browser manifest uses a credential-free public RPC. Copy it to ignored `apps/web/public/deployment.json` and run with `VITE_DATA_MODE=testnet`; leave `VITE_ENABLE_TEST_WALLET` unset. Public web hosting also needs the data/recovery services; Vite's local proxy configuration does not deploy them.

Before a public sale, configure witness retention for the deployed contracts, choose N after setup, and arrange a checkpoint within N+1…N+256. Retention alone does not send a checkpoint transaction. Keep participant wallet testing, native historical collection comparison and live Graph composition as separate acceptance gates.

After deployment, `node scripts/public/retention-config.mjs` validates code through the project RPC and PublicNode, checks the genesis against go-ethereum's independent Sepolia pin, and creates `.scratch/retention/sepolia/operator.generated.json` with private permissions. PublicNode did not serve block0 during qualification; its latest-code check is separate from the project provider's genesis check. Start the read-only recovery service with:

```sh
RETENTION_CONFIG="$PWD/.scratch/retention/sepolia/operator.generated.json" FEESTRIP_PROOF_PYTHON=/path/to/proof-venv/bin/python node packages/settlement/src/cli.mjs --serve
```

To preview the public deployment without overwriting a local development manifest:

```sh
VITE_DATA_MODE=testnet pnpm build
cp deployments/sepolia.json apps/web/dist/deployment.json
pnpm --filter @feestrip/web exec vite preview --host 127.0.0.1 --port 4187 --strictPort
```

The preview is local. It reads public Sepolia state and uses an injected wallet; it is not a publicly hosted website. Rebuilding replaces the dist manifest, so copy the public manifest again after each build.
