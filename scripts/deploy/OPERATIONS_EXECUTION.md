# Operator execution checkpoint

Checked13September2026 at11:14UTC: the isolated Railway `usufruct` production project still has no services, volumes or buckets. Its plan contains exactly three creations. The public operations API returns503, the dedicated keeper has0SepoliaETH and no used/pending nonce, and `nextSeriesId=1` (no activated series). These are observations, not permanent state. Recheck immediately before execution.

Preparation, code review, local tests, read-only plans and public-chain observations can proceed without further input. Creating the proposed paid service/volume/bucket remains paused for the user's approval of the reviewed hosting plan and monitored operating budget (proposed$30/month). Credentials already supplied are sufficient for preparation. Later participant signatures are a separate requirement for the public financial rehearsal. Do not ask participants to operate infrastructure.

The authoritative infrastructure scope, caps and recovery limits are in [deployment-operations.md](../../docs/deployment-operations.md). Refund and replacement contract deployment are complete; do not repeat them. The current Graph anchor covers the selected USDC/WETH pool, not every discovered LP.

## Repeatable read-only checks

From the integrated repository checkout:

```sh
node scripts/deploy/verify-operations.mjs
```

This checks the public API's schema, committed chain/FeeStrip identity,60second freshness and all four readiness components. It independently checks fresh Sepolia observations, the committed FeeStrip/verifier/checkpoint runtime hashes, the prepared keeper's balance/latest/pending nonce and the series counter. It rechecks the observed block hash after the RPC reads. It prints sanitized JSON; exit0 means these snapshot checks passed, exit2 means readiness is incomplete, exit1 means invalid configuration or an unexpected failure. It never changes the app's readiness.

`--keeper 0x...` supports an explicitly reviewed signer change. The default is the existing prepared keeper. The API does not publish its configured signer, so this tool cannot independently prove that the host uses the supplied address; verify the private configuration separately. `initialAllocationMet` compares against the proposed0.01SepoliaETH starting allocation; it is not an additional protocol requirement. A pending nonce makes this conservative snapshot checker pause even if a legitimate checkpoint is currently in flight.

To inspect the direct Railway gateway, supply `OPERATIONS_GATEWAY_TOKEN` through process secrets and use `--direct --origin https://THE-REVIEWED-DOMAIN`. The token is sent only with explicit `--direct`; public Vercel checks omit it. An optional `SEPOLIA_RPC_URL` is read from process environment. The script does not load `.env`, fetch historical witnesses, test a bucket, sign, or claim full deployment-bindings/financial acceptance.

## Provision after approval

1. Use the reviewed integrated source commit and an authenticated CLI. Confirm `railway status --json` identifies project `cb65063e-ebf1-452c-b077-5e3da03041e2`, environment `b60dbcfa-a033-4afb-b7c7-4371610c9a27`, name`usufruct`/`production`. Run `pnpm exec railway config plan --json --out .scratch/operations/approved.plan.json`. Review the exact three creations and capacities. Do not use `--show-values` or `--decrypt-variables`. Apply that pinned plan only after approval with `pnpm exec railway config apply --plan .scratch/operations/approved.plan.json --yes`. If the plan is stale or differs, regenerate/review it.

2. Run the existing `node scripts/deploy/prepare-operations-secrets.mjs` from the checkout containing the ignored `.env` and existing `.scratch/operations/host-secrets.json`. It preserves the dedicated key and gateway token while setting keeper disabled. Do not generate another operator identity in a different worktree. Check only the printed public address against `0xFfaa5fE1C38Aa538fd9B1A28D8CF8516fa3728Ad`.

3. Upload only the approved variable allowlist using stdin, keeping all children disabled initially. The following local wrapper keeps values out of command arguments and suppresses secret-bearing CLI output. It modifies host variables and must wait until provisioning is approved:

```sh
node --input-type=module <<'JS'
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const saved=JSON.parse(readFileSync('.scratch/operations/host-secrets.json','utf8'));
const names=['SEPOLIA_RPC_URL','OPERATIONS_GATEWAY_TOKEN','KEEPER_PRIVATE_KEY','KEEPER_EXPECTED_SIGNER'];
const variables=Object.fromEntries(names.map(name=>[name,saved[name]]));
Object.assign(variables,{KEEPER_ENABLED:'false',ANALYSIS_ENABLED:'false',GRAPH_STREAM_ENABLED:'false'});
for(const [name,value] of Object.entries(variables)){
 if(typeof value!=='string'||!value)throw new Error('Required private configuration missing');
 const result=spawnSync('pnpm',['exec','railway','variable','set',name,'--stdin','--skip-deploys','--project','cb65063e-ebf1-452c-b077-5e3da03041e2','--environment','production','--service','endpoint-operations'],{input:value,encoding:'utf8'});
 if(result.status!==0)throw new Error('Variable upload failed; provider output suppressed');
 console.log(`${name}: stored`);
}
JS
```

Bucket credentials come from IaC references; do not duplicate or expose them. Verify reference resolution privately. Existing Graph credentials can later be uploaded through the same stdin pattern with a separate single-name allowlist (`SUBSTREAMS_API_TOKEN`). Do not upload the deployment `PRIVATE_KEY`. Avoid `railway variable list`, `railway run env`, verbose/debug mode or logs containing raw provider diagnostics.

4. Deploy the exact reviewed checkout with `pnpm exec railway up --project cb65063e-ebf1-452c-b077-5e3da03041e2 --environment production --service endpoint-operations --ci`. Record image digest and deployment ID. Create the service domain with `pnpm exec railway domain --project cb65063e-ebf1-452c-b077-5e3da03041e2 --environment production --service endpoint-operations --port 8789`. Check `/healthz`, authenticated `/api/operations`, and that unauthenticated direct API requests are rejected. Liveness alone is insufficient.

5. Verify all runtime bindings and archive-proof capability through the operated retention worker. Verify an actual bucket write/read probe and fresh replica readiness. With no series, this probe checks access only; it cannot prove real endpoint restoration. Inspect only sanitized component status. Resolve any container memory, free-disk or RPC capability failures before proceeding.

6. Review the dedicated keeper address and transfer an initial0.01**Sepolia**ETH to it using a wallet on chain11155111. Recheck the current balance before deciding the amount, and preserve the funding transaction receipt. No automated funding or signing action is part of these verifier scripts. Confirm key/address agreement, current nonce exclusivity, gas caps and only one signer process. Set `KEEPER_ENABLED=true` using the same stdin upload pattern, then deploy/restart deliberately. Keep the signer disabled if private configuration or funding differs from the reviewed setup.

7. Add `OPERATIONS_ORIGIN` and the same `OPERATIONS_GATEWAY_TOKEN` as Vercel production variables. The existing CLI supports stdin: `pnpm exec vercel env add NAME production --project usufruct --scope mihrazvans-projects --sensitive --force --yes`. Invoke it with each value supplied through a captured child-process stdin, as above; never use `--value` for the token. Redeploy the reviewed frontend, then rerun `verify-operations.mjs` through the public origin. Require fresh bound protocol/keeper/retention/replication status. Stop if any check is missing.

8. Enable optional Graph analysis/history separately after supplying its token, planning catch-up and checking free disk. Catch up the existing verified Swap prefix or safely transfer a closed database with its retained identity; do not copy a live SQLite database while ignoring its WAL. Verify current RPC/Studio/common-block agreement. Graph availability does not enable financial operations or authorize payouts.

## Prove remote-only restoration after a real endpoint exists

After a bounded participant-reviewed sale, preserve checkpointN during its validN+1..N+256window and replicate the actual endpoint proof. Keep the live keeper/retention service operating. A probe object or a verified-growth cache does not prove bucket restoration.

The normal recovery path can fall back to archive RPC; use the dedicated verifier to rule that out. It creates an entirely new temporary database and two new local proof directories. It discovers canonical series/slots from the pinned chain (maximum100series), requires the selected endpoint finalized, downloads only the bucket pointer/object, authenticates the actual MPT/ABI witness and rechecks endpoint/activation/head canonicality. It then uses the existing store's staging/replication code and verifies both local copies. There is no RPC witness acquisition and no remote write path. Existing worker databases and proofs remain untouched.

On the operator machine with the proof Python environment installed, load the service's runtime secrets into the local verifier through the authenticated Railway CLI:

```sh
FEESTRIP_PROOF_PYTHON=/path/to/proof-venv/bin/python \
pnpm exec railway run --no-local --project cb65063e-ebf1-452c-b077-5e3da03041e2 \
  --environment production --service endpoint-operations -- \
  node scripts/deploy/verify-proof-restore.mjs --series 1
```

Substitute the actual series ID. Ensure `FEESTRIP_PROOF_PYTHON` resolves to a local executable after Railway variable injection; a container path such as`/opt/proof/bin/python` will not exist on an ordinary operator laptop. Set it explicitly in the child environment if the service variable takes precedence. The verifier clears signing and Graph keys before invoking its offline validator; its public JSON contains no bucket identifiers, credentials, provider errors or witness bytes. Successful output includes a digest, remote read count, healthy local copies and the isolated local directory. Retain the sanitized output and inspect that directory; it is intentionally left intact. Failure never claims restoration. This verifies remote recovery on the operator machine, not automated hosted failover or permanent bucket availability.

Finally verify service restart, fresh readiness and participant capture → NFT return → authenticated allocation → independent redemption. Record actual checkpoint/proof recovery separately from contract-cache recovery, along with public receipts and gas. The keeper/bucket and fresh restoration checks are operator work; the two-wallet flow and comprehension test require participants. A zero-series ready snapshot does not replace these acceptance steps.

## Focused tests

```sh
FEESTRIP_PROOF_PYTHON=/path/to/proof-venv/bin/python \
node --test scripts/deploy/verify-operations.test.mjs scripts/deploy/verify-proof-restore.test.mjs
```

The remote tests use a genuine retained Sepolia witness with an in-memory object store, including self-consistent tampering and late reorg. They are not an operated bucket result. No paid resource, public funding, endpoint checkpoint or sale was created by this readiness increment.
