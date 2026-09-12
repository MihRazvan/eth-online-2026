# Endpoint operations deployment

This release prepares the operated settlement path and makes new public commitments fail closed. It does **not** yet establish a hosted checkpoint, off-host disaster recovery, or a public sale lifecycle. The existing Sepolia FeeStrip also needs the reviewed-position commitment upgrade before new sales are enabled.

## Prepared infrastructure

The isolated Railway project is `usufruct` (`cb65063e-ebf1-452c-b077-5e3da03041e2`), production environment `b60dbcfa-a033-4afb-b7c7-4371610c9a27`. It was created empty; the existing `second-order` project is unrelated and remains untouched. The read-only plan for [.railway/railway.ts](../.railway/railway.ts) reports exactly three creations, no changes or deletions, and no diagnostics:

| Resource | Configuration |
| --- | --- |
| `endpoint-operations` | Docker image, one Amsterdam-region replica, sleeping disabled, 1 vCPU / 512 MiB resource ceilings, restart on failure |
| `endpoint-data` | 1 GiB persistent volume mounted at `/data`; SQLite journals and two local proof copies |
| `endpoint-proofs` | Private S3-compatible bucket in Amsterdam, separate from the service volume |

The two local directories protect against individual file corruption; they are not independent backups. The bucket provides off-host recovery, with the same provider/account remaining a shared failure domain. Its lack of object locking/versioning is not described as immutable archival storage. [Railway bucket capabilities](https://docs.railway.com/storage-buckets).

Estimated initial usage is **$5–15/month**, subject to measured CPU, memory and traffic. At continuously saturated configured compute ceilings, compute alone is about $25/month, plus storage/egress. Proposed project operating budget: **$30/month**. This is a monitored budget, not an account-wide hard limit. No paid service, volume or bucket has been provisioned. Plan/subscription changes and new billable resources require the user's approval. [Railway resource pricing](https://docs.railway.com/pricing/plans).

The current Railway CLI validates the TypeScript infrastructure file. Legacy `railway.toml` is deliberately absent: new services use Railway IaC. Run `railway config plan` to review; apply only the isolated project's exact intended resources. The file refuses a different project name or environment. [Current IaC workflow](https://docs.railway.com/infrastructure-as-code).

## Runtime and credentials

`Dockerfile.operations` has an explicit build-context allowlist. It copies source, committed deployment evidence, production dependencies and the independent Python witness validator. It does not copy `.env`, wallet files, Git history or local databases. The Node base image is pinned by digest.

`node scripts/deploy/prepare-operations-secrets.mjs` prepares ignored `.scratch/operations/host-secrets.json` with mode0600. It creates a dedicated keeper key once, retains it on subsequent runs, refuses reuse of the deployment key and defaults to disabled. It prints only the public keeper address. No credentials are placed in command arguments or committed source.

| Secret/configuration | Destination |
| --- | --- |
| `SEPOLIA_RPC_URL` | Operations service only; archive proof capability checked at runtime |
| `KEEPER_PRIVATE_KEY`, `KEEPER_EXPECTED_SIGNER`, `KEEPER_ENABLED` | Operations supervisor passes the dedicated key only to the keeper child; retention/validator children do not inherit it |
| `OPERATIONS_GATEWAY_TOKEN` | Operations service and Vercel runtime variables; random32-byte token |
| `PROOF_S3_*` | Operations service, via bucket variable references |
| `OPERATIONS_ORIGIN` | Vercel runtime; exact HTTPS origin with no path or credentials |

The prepared keeper address is `0xFfaa5fE1C38Aa538fd9B1A28D8CF8516fa3728Ad`. It has not been funded or activated by this increment. Initial operator allocation: 0.01 Sepolia ETH, with balance rechecked before enabling. The default transaction cap is0.0024testETH; rolling24h reserved spend cap0.01testETH; fixed80000gas maximum; gas-price cap30gwei, priority cap1gwei. These are ceilings, not expected per-checkpoint costs. The actual isolated checkpoint test used45729gas. The key cannot be used by the HTTP API; the keeper code only prepares zero-value calls to the pinned checkpoint contract.

## Deployment sequence

1. Finish independent review and checks; retain the exact source commit and image digest. Confirm the budget above. `railway config plan` must show only the isolated project's intended resources; then apply it.
2. Provision runtime variables using the private JSON through stdin/API structured variables. Never paste the file into logs/chat. Keep `KEEPER_ENABLED=false` initially. Deploy the reviewed checkout with `railway up`; create its HTTPS domain and verify `/healthz`.
3. First verify the buyer has cancelled old offer2 and recovered672SepoliaUSDC: require zero funded liability, zero old contract USDC balance and no activated series on fresh public reads. Keep the old cancellation UI available until then. A refund and both replacement deployments were rehearsed on a separate fork; [rehearsal evidence](evidence/operations/upgrade-rehearsal.json) is not public acceptance. Deploy the fixed FeeStrip and its associated market, reusing qualified canonical managers and compatible proof/Aqua infrastructure. Verify new runtime hashes and all immutable bindings, preserve old deployment evidence, and update the public manifest, operational pins and Subgraph address. Mark `fundingCommitmentVersion:1` only for that verified deployment. Existing contracts are immutable; a source fix does not patch them.
4. Verify the keeper wallet, nonce exclusivity, gas balance and configured caps. Enable the dedicated signer. Before a real funded sale, verify proof acquisition and bucket roundtrip, observe all readiness checks, and confirm an operator is available through N+256.
5. Set the two Vercel runtime variables; redeploy. Verify unauthenticated public `/api/operations` and recovery routes through Vercel. Direct Railway API access requires the gateway token. `/healthz` is process liveness, not permission to start a sale.
6. Rehearse a bounded two-wallet sale with exact participant-reviewed terms. Retain the checkpoint receipt and endpoint witness, restart the service, restore into fresh local storage from the bucket, then execute capture, original NFT return, authenticated allocation and independent redemption. Record actual nonzero fees, native-currency activity and public gas costs separately.

Every new public funding/acceptance action checks deployment-bound operational health, including immediately after a preparatory USDC approval. `checks.protocol`, `keeper`, `retention`, `replication` must all be ready, with fresh observations. The protocol check stays closed for the old public deployment. Missing APIs or credentials do not enable fixture data or bypass settlement verification. Refunds, existing claims and contract recovery remain available.

## Operator recovery

On a low balance, stale RPC, gas cap, failed replica or missed endpoint, stop new UI commitments; continue trying to preserve existing obligations. Anyone can call the permissionless checkpoint contract during its valid window. A successful checkpoint does not supply historical proof bytes, and saved bytes do not replace the checkpoint.

On normal shutdown the keeper releases its single-host lock after retaining every signed transaction. After a hard crash, **do not delete the database or transaction journal**. Stop the old deployment and establish that no prior signer can still run before recovering a stale lock. The built-in `--recover-dead-lock` checks the same hostname and an absent process; it refuses a different container hostname. Cross-container recovery therefore requires offline operator inspection of the volume and removal of only the stale `.lock` directory after exclusive ownership is established. An unresolved expired nonce or changed immutable configuration also needs operator review. Never run two replicas against this wallet or reset its journal to make startup pass.

Remote restoration re-discovers series terms from the pinned chain, binds activation and endpoint hashes, authenticates the MPT/ABI witness independently, and then passes through the existing worker's canonicality checks. Remote pointers, metadata or a server amount never authorize allocation. See [off-host behavior](../packages/settlement/OFFHOST.md) and [keeper recovery](../packages/keeper/README.md).

## Verification and review

The restricted keeper, authenticated remote replica, and funded-position guard received separate bounded specialist reviews. Findings corrected include a liquidity substitution race before funding, receipt-time gas reservation, pending nonce exclusivity, and recovery across multiple series sharing one endpoint. The frontend verifies signed transaction identity and public-chain finality before reconciling replacements after a browser restart, and checks retained replacement receipts again before wallet writes. Unresolved receipts survive completed-history truncation. Its duplicate-action guard depends on this browser retaining local storage; it does not provide cross-device idempotency. These reviews are not a full protocol audit.

Local verification includes51Solidity tests,61hermetic browser regressions and both actual local-chain browser variants, each covering the financial lifecycle, a separate buyer/seller offer, and externally replaced transaction recovery. [Checkpoint evidence](evidence/operations/checkpoint.json) separates these from public and hosting gates.

## Scope still pending

Graph Studio and Substreams credentials already work. The continuous initialized-history sink and joined analysis service remain J15–J17; this operations image does not claim to host them. `/api/analysis` returns an explicit503 until that service is operated. The public financial lifecycle, two fresh unaided judge sessions, native-ETH fee activity, quote renewal and submission/video evidence remain separate checklist gates.
