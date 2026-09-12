# Restricted endpoint keeper

This Node 24 worker preserves `BlockHashCheckpoints.hashes(N)` for actual discovered FeeStrip series. Its only signed action is `checkpoint(N)` at the configured, runtime-pinned checkpoint contract, with zero native value. It cannot activate a sale, capture fees, return an NFT, allocate entitlement, redeem a claim, transfer a token or make an arbitrary call. Checkpointing is permissionless; the signer needs only a small, separately bounded gas balance.

**Implementation and isolated Anvil tests are not an operated public settlement guarantee.** An independent signing-policy review, dedicated signer, reviewed immutable configuration, funded gas account, durable volume, primary/backup operator and monitored deployment are prerequisites to public activation. Do not use the deployment wallet as the keeper account.

## Configuration and execution

A private JSON file extends the [retention chain configuration](../settlement/README.md) with the following required fields. All amounts are decimal strings in wei; gas is a decimal integer string.

| Field | Meaning |
| --- | --- |
| `database` | Absolute path on one durable local filesystem volume |
| `expectedSigner` | Public address of the dedicated keeper account |
| `enabled` | Explicit boolean; `false` observes without reading any key |
| `gasLimit` | Fixed transaction gas limit, 25,000–150,000 |
| `maxFeePerGas`, `maxPriorityFeePerGas` | EIP-1559 ceilings |
| `maxTxCostWei` | Maximum gas-limit × max-fee reservation per signed version |
| `dailyBudgetWei` | Conservative rolling 24-hour signing reservations; includes older transactions while unresolved |
| `minBalanceWei` | Balance retained in addition to the transaction's maximum gas cost |

Existing chain pins must include `chainId`, `genesisHash`, `feeStrip`, `verifier`, `checkpoints`, `poolManager`, `usdc`, `managerCodeHash`, `codeHashes`, and `rpcUrls`. Only chain 31337 on loopback and canonical Sepolia chain 11155111 are supported. The same settlement code verifies genesis, all four runtime hashes and verifier/manager/checkpoint immutable relationships before observation and again before signing. The first configured RPC is used; there is no automatic write-provider failover.

Optional bounds: `pageSize` defaults to 20 (maximum 100), `intervalMs` to 4,000, `replaceAfterBlocks` to 3, `maxReplacements` to 3 (maximum 8), `broadcastMarginBlocks` to 2, and `maxHeadAgeSeconds` to 120. A full bounded discovery scan must complete before public readiness is reported. Known due work can still be preserved while the scan continues.

```sh
KEEPER_CONFIG=/private/keeper.json node packages/keeper/src/cli.mjs --once
KEEPER_CONFIG=/private/keeper.json node packages/keeper/src/cli.mjs
```

When enabled, provide **only** `KEEPER_PRIVATE_KEY` through the process secret manager. The CLI never loads `.env`, never falls back to `PRIVATE_KEY`, and removes `KEEPER_PRIVATE_KEY` from its environment after constructing the local signer. The account address must match `expectedSigner` before any signing. Logs contain only the public status and fixed error codes. There is no HTTP signing endpoint.

Configuration is deep-frozen and its full fingerprint is bound to the database. Changing any field, including the RPC or enabling flag, requires an explicit reviewed migration with the process stopped. Do not erase or replace the database to get past a mismatch: pending signed transactions, nonces and reservations must survive. Use a separate observation-only database for initial disabled qualification, then create the reviewed enabled database before its first signature. This implementation does not ship a general config-migration command.

## Durable execution and failure policy

The SQLite database uses WAL and `synchronous=FULL`. Every signed transaction, hash, nonce, endpoint, fee caps and maximum-cost reservation commits **before** the first broadcast. Restart retries exactly those bytes; replacement versions retain the same nonce and fixed call and must satisfy all original fee/budget caps. Each replacement increases both fee fields by at least 13% and consumes a full additional reservation, intentionally overcounting possible actual spend. There is at most one unmined nonce at a time. Canonically mined transactions release nonce sequencing while receipt finality continues to be checked.

Receipts are checked against canonical block hashes. A receipt removed by an unfinalized reorg clears the last-success status and returns the journaled transaction to reconciliation. A different journaled replacement may be the mined version. Finalized block regression or conflict stops the worker. Unknown nonce consumption, a nonce gap, too many replacements or an expired unmined nonce is a visible operator issue, never permission to send an arbitrary cancellation transaction. The keeper account must have exactly one operator; external transactions using the same key are unsupported.

`checkpoint(N)` can execute in blocks N+1 through N+256. The worker first observes N+1 and, by default, stops new/repeated broadcasts after observing N+254, leaving two blocks of headroom. A pending transaction may still land late and revert; signatures cannot be revoked from a mempool. The gas caps bound that cost. Missing the window does not justify changing the endpoint or using server-signed allocation. A previously authenticated growth cache may independently preserve allocation; this worker conservatively checkpoints without assuming such a cache exists.

Due series are re-read before signing. Discovery and terminal-state rechecks use bounded pages; new series and changed/reorged terms are reconciled from onchain state. Very large backlogs, slow/unavailable RPCs, chain stalls, fee spikes, depleted balance, expired pending transactions or process downtime can still miss an endpoint. Operate well before activation, monitor the deadline, and maintain a separately controlled fallback operator. No private key is required for someone else to call the public checkpoint method with their own wallet.

## Single writer and crash recovery

An exclusive filesystem directory lock is held for the process lifetime. Each mutation and broadcast checks its unguessable owner token. A second process fails closed. This is a **single-host, local-volume** design; it is not a distributed lease for multiple replicas or network filesystems. Deploy one replica and never mount the same keeper database into independent signing hosts. The gateway can open the database read-only.

SIGINT/SIGTERM drain the current tick and release the lock. A hard crash leaves the lock in place. With the service stopped and restart/replica scheduling disabled, the operator may run:

```sh
KEEPER_CONFIG=/private/keeper.json node packages/keeper/src/cli.mjs --recover-dead-lock
```

Recovery refuses another hostname or any live PID. PID reuse can conservatively prevent recovery. The command does not infer that another machine is dead, steal a live lease, modify journals or broadcast. Because it is an offline maintenance action, do not race it against another recovery/start command. Inspect and preserve the database, then restart the single service. Another host requires manual, reviewed relocation after confirming the old host can no longer sign.

## Read-only operational status

```js
import { readKeeperStatus } from './src/store.mjs';
const status = readKeeperStatus('/data/keeper.sqlite');
```

`CheckpointKeeper.publicStatus()` returns the same persisted sanitized object. Fields include `status`, `chainId`, `feeStrip`, `checkpoints`, `signer`, `enabled`, `observedHead`, `headTimestamp` (seconds), `observedAt`/`observedAtMs`, `headFresh`, `discoveryComplete`, `balanceWei`, `lowBalance`, `gasReady`, `readyToSign`, `pendingEndpoints`, `missedEndpoints`, `checkpointedEndpoints`, `pendingTransactions`, `dailyReservedWei`, `lastError`, `configFingerprint` and `lastSuccess` (endpoint, transaction hash, receipt block, finality). An unsuccessful observation sets `readyToSign:false`; any previously observed head remains explicitly dated. Consumers must independently reject stale status, deployment/signer mismatch, errors and missed endpoints. `readyToSign` describes present conditions, not a guarantee of future inclusion. No raw transaction, RPC URL, key, cursor or private path is exposed.

## Verification

```sh
node --test packages/keeper/test/keeper.test.mjs
RUN_KEEPER_ANVIL=1 node --test packages/keeper/test/anvil.test.mjs
```

The second command requires Foundry and starts its own isolated node on `127.0.0.1:8562`; it refuses an occupied port. It compiles the unchanged production checkpoint contract, deploys it with **fixture** FeeStrip discovery/verifier bindings, signs a real EIP-1559 transaction, restarts after a simulated pre-broadcast transport failure, verifies the canonical stored hash and receipt, reverts the receipt's block, then verifies exact-nonce rebroadcast and success. Observed checkpoint gas in this fixture run: **45,729**. This is actual local checkpoint execution, not a real funded sale, public Sepolia operation, historical proof retention or independent human audit.
