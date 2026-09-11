# Historical proof recovery controls

The claim detail now includes a persistent recovery panel, with a scoped proof download and an explicit account of what the retention service last observed. The panel separates four facts: retained artifact bytes, the endpoint hash checkpoint, source finality, and the verifier's growth cache. None is presented as a server-authorized payout. NFT return, allocation and independent claim redemption keep their existing sequence and authority.

The UI keeps the existing ledger typography and receipt treatment. Desktop uses two columns for the four facts; mobile places each fact and its caveat in one column. Exact deployment addresses, hashes and timestamps are behind a keyboard-accessible disclosure. Filesystem copies are labelled as reported copies, with an explicit statement that separate paths do not establish independent hosts or failure domains.

## Trust boundary

`ChainAdapter.readRecovery` checks the service response against the connected deployment's chain ID, FeeStrip address, verifier, PoolManager, series ID and the exact end block read directly from that FeeStrip contract. Responses with another scope, unsupported structure, inconsistent checkpoint/hash data, absent artifact hash binding or invalid timestamps fail closed. Observation freshness expires after two minutes, on incomplete discovery or on reported observation errors. An old observation can still identify retained bytes, but is visibly stale and makes no claim about current availability.

`Download proof JSON` obtains current status again, requests the artifact by its SHA-256 digest, verifies the returned bytes against that digest, and requires chain, manager, block number, block hash and witness metadata. The block hash must match the status endpoint. Metadata passes the existing `assertWitnessScope` check against fresh direct series scope. The browser does not authenticate the MPT proof itself; the service's artifact validator and, ultimately, onchain verification have their distinct responsibilities. A matching digest proves byte identity, not canonicality or ownership.

Settlement tries a selected retained API artifact before the historical static witness route. An API scope mismatch, malformed response, orphaned endpoint, explicit refusal, digest mismatch, artifact metadata mismatch, or selected artifact retrieval failure aborts submission. There is no silent static fallback after those failures. The compatibility fallback is allowed when no retained candidate is selected, when the service is absent (404), or when transport/service availability fails (500/502/503/504). Static bytes still pass `assertWitnessScope` and the existing witness syntax check; their legacy metadata allowance is unchanged. The contract simulation remains mandatory before a send. The server supplies no allocation amount.

Every write keeps the immutable reviewed signer introduced in the quote-control increment, including the interval spent retrieving proof data. There is no new signing backend, automatic transaction, file-import path or server-authorized cache shortcut. A reported growth cache is only an observation. Before fetching proof bytes, settlement reads the configured verifier directly using the key derived from the actual series end block, canonical pool ID, both ticks and the native-USDC side. Only an actual verified cache entry permits `settle(id, "0x")`. This path remains available without the API or a static proof file, and still passes the same signer checks and contract simulation. An API `growthCached` flag alone never permits empty-witness settlement. Vite proxies `/api/recovery` to the configured loopback retention server.

Entitlement receipts now include the FeeStrip contract address in their source disclosure and JSON export. Fixture exports say `fixture:no-deployed-contract`; the UI says there is no deployed fixture contract. Existing receipt exports remain informational snapshots, not proof of ownership or witness availability.

## Verification and review

- TypeScript and the local-mode production build pass.
- All 33 tests pass on isolated fixture port 4185: 26 existing tests and seven recovery tests.
- Recovery tests use browser-controlled API responses and real adapter scope/digest handling. They cover absence, stale observations, mobile width, valid JSON download, corrupt bytes, metadata substitution, malformed timestamps and deployment scope.
- Adapter boundary tests prove that selected API bytes are passed to the existing settlement simulation, mismatches/orphaning/refusal never reach simulation or static fallback, and service absence uses the compatibility route. A separate cache test checks the exact key with USDC as currency1, verifies that authenticated cached growth avoids all file fetches, and refuses an API-only cache claim when direct onchain cache state is false. These tests stub RPC and simulation; their synthetic witness is not evidence of a real proof or settlement.
- The existing five injected-wallet switch scenarios still pass, as do receipt and funded-sale lifecycle regressions.
- Independent source review identified the orphaned/refused fallback and missing endpoint hash binding; both were corrected and covered. Independent visual review found the retained desktop/mobile layout clear. The lead identified the JavaScript date-range edge, now rejected by validation and guarded by the renderer. Final independent review checked the direct cache key and additionally switched an injected signer during status fetch, artifact fetch, cache read and settlement simulation; every case rejected with zero sends.

Rendered component evidence:

- [Observed recovery, desktop](evidence/recovery-observed-desktop.png)
- [Stale retained evidence, mobile](evidence/recovery-stale-mobile.png)

These are actual browser renders of a component mounted by the test with simulated API observations. They demonstrate layout and state language, not live service availability, genuine historical proof retention, source finality or chain acceptance. The integrated real-service/browser lifecycle is documented below. No shared chain or backend was mutated by this UI lane.

The new `apps/web/tests/recovery.spec.ts` is discovered by the normal browser suite. During concurrent development the ignored scratch Playwright config selected port 4185 and a separate results directory. No dependency, root configuration, generated ABI or contract change is included in this increment.

## Integrated service and contract evidence

The lead reran the complete real local browser lifecycle with the actual SQLite worker/API on loopback8788 and a dedicated Anvil node on8551. After native fee activity, the worker independently authenticated and retained the N witness. The test removed the static witness file, downloaded proof JSON through the panel, verified the exact SHA-256 digest, then allocated through the API witness and checked each holder payout and residual balance. [Actual service render](evidence/recovery-real-service.png), [browser receipts](../evidence/browser-chain-lifecycle.json).

A separate `USE_VERIFIED_GROWTH_CACHE=true` run authenticates the same endpoint/range through an actual `cacheGrowth` transaction, deletes all SQLite and filesystem proof copies, verifies the API reports cached growth with no downloadable artifact, and completes allocation through the app's direct onchain cache path. [Cache recovery receipts](../evidence/browser-cache-lifecycle.json). Both variants run in CI. These are actual local transactions with test currencies and unlocked test accounts; they do not establish public signing or provider availability.
