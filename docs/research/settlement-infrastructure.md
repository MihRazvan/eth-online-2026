# Settlement infrastructure: make recovery reliable before making proofs clever

Research date: 2026-09-11. Repository inspected at `22a8996`. Scope: proof acquisition, canonical anchoring, operational recovery and settlement cost. This is implementation research with one read-only public experiment, not an audit or live FeeStrip acceptance. Recommendations below are proposed; this memo changes no contracts or deployments.

The highest-value next increment is a durable, independently verifiable endpoint-retention service with an explicit recovery screen. FeeStrip already separates NFT return from cash allocation correctly. The product risk is that a seemingly healthy RPC can serve balances and contract calls while refusing the one historical proof needed to allocate indefinitely reserved USDC. Two obligations must be tracked independently: retain authentic evidence for N, and preserve access to a canonical commitment to N.

## What the current trust path actually proves

`HistoricalFeeVerifier` authenticates `keccak256(rlpHeader)` against `BlockHashCheckpoints.get(N)`, checks the header number, extracts the execution state root, verifies the PoolManager account at `keccak256(address)`, checks its proven codehash against the deployment pin, then verifies four hashed storage-slot keys against that account's storage root. The four values establish stored tick, USDC global growth, and lower/upper outside growth. The verifier derives inside growth; FeeStrip applies the frozen baseline and liquidity and enforces the actual captured-reserve bound. The manager/chain are immutable verifier scope; pool/range/endpoint/currency are cache scope. This is consistent with the account/storage structure specified by [EIP-1186](https://eips.ethereum.org/EIPS/eip-1186). Neither an RPC's `value` field nor its `storageHash` is independently authoritative.

The existing JS `acquireWitness` checks serialized header hash and requested slot identities, but does not independently validate the MPT before returning success. The Python acquisition path does validate account and storage tries using `HexaryTrie`. Both acquire by block number across separate calls; a reorg can make the calls inconsistent. Solidity will reject a mismatched witness, protecting allocation, but that rejection may arrive after the only acquisition opportunity disappeared. Acquisition success must therefore mean verified, hash-bound and durably stored, not merely HTTP 200.

Prefer an explicitly hash-selected proof request where the endpoint supports it, and probe that capability. EIP-1898 defines block-hash selection and a canonicality requirement for state-reading methods; actual `eth_getProof` support varies by implementation. Where unsupported, reread N after collection and validate all nodes against the first header. Retain competing hashes separately until finality, replacing neither silently. [EIP-1898](https://eips.ethereum.org/EIPS/eip-1898), [execution API proof schema](https://ethereum.github.io/execution-apis/api/methods/eth_getProof/).

## Archive access is a capability, not a label

Geth's February 2026 documentation distinguishes flat historical state from retained historical trie nodes. Path-based Geth 1.16 archive mode does not provide old Merkle proofs. In 1.17+, historical proofs require explicit `--history.trienode=N`; the default `-1` disables trie history. `--history.state=0` alone is insufficient. Legacy hash-based archives retain the trie material but have substantially higher storage costs. A project provider should demonstrate its configured proof horizon, recovery time and reorg behavior, rather than answer only whether it has an archive tier. [Geth archive documentation](https://geth.ethereum.org/docs/fundamentals/archive).

Method documentation also falls short of an SLA. Alchemy documents number/tag/hash selection; QuickNode documents a 1,024-storage-key request limit. Neither cited method page establishes this project's Sepolia historical-proof retention or sustained availability. Four slots fit easily; cross-series batching still needs measured response-size, timeout and gas budgets. [Alchemy](https://www.alchemy.com/docs/chains/ethereum/ethereum-api-endpoints/eth-get-proof), [QuickNode](https://www.quicknode.com/docs/ethereum/eth_getProof).

Primary incident reports reinforce the distinction. Reth issue 14897 reports the exact maximum-proof-window error on an archive configuration. Issue 23149 reports deterministic `eth_getProof` panics with storage-v2 on Reth 1.11.3 despite the node remaining up; that issue is closed, so it is evidence of a real failure class, not an assertion that current Reth is broken. A general RPC health check would miss both. [Reth 14897](https://github.com/paradigmxyz/reth/issues/14897), [Reth 23149](https://github.com/paradigmxyz/reth/issues/23149).

### Read-only public observation

At `2026-09-11T15:55:42.943Z`, PublicNode Sepolia returned head **11,682,923**, hash `0xc6e6d043c691885f76d956309c08b9a6ad8f8df5d371c3a069287a8c9c2bb376`. Requests used the canonical PoolManager `0xE03A1074c86CFeDd5C142C4F04F1a1536e203543` and storage slot zero. This was a capability probe, not FeeStrip fee-slot verification.

| Exact query | Observation |
| --- | --- |
| `eth_getProof`, fixed head number | Success; nine account nodes |
| Same request at head−1, head−128, head−8191 | Each rejected with RPC −32602, maximum proof window exceeded |
| EIP-2935 `eth_call` at fixed head, target head−256 | Returned matching historical header hash |
| Same, target head−257 | Returned matching historical header hash |
| Same, target head−8191 | Returned matching historical header hash |
| Same, target head−8192 | Reverted, RPC code 3 |

The 8191-boundary result was `0x2dd7dc33d743d6d7d97e85ae1b864c35c9976a892f3411b70cf483def8450430`. Calls used `0x0000F90827F1C53a10cb7A02335B175320002935`, exactly 32 bytes of big-endian target number, no selector, and compared against `eth_getBlockByNumber`. No signatures, transactions, paid endpoints or local-chain mutations were used. A first Python request with its default user agent received HTTP 403; Node's native fetch completed the probe. This is another reason to distinguish transport failures from proof unavailability. These point-in-time results reproduce the earlier [tip-only evidence](../evidence/proof.md), and establish current public EIP-2935 accessibility without proving provider independence or uptime.

A minimal reproduction uses Node 24 and no packages:

```js
const rpc = async (method, params) => {
  const response = await fetch('https://ethereum-sepolia-rpc.publicnode.com', {
    method: 'POST', headers: {'content-type': 'application/json'},
    body: JSON.stringify({jsonrpc: '2.0', id: 1, method, params}),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
};
const {result: head} = await rpc('eth_getBlockByNumber', ['latest', false]);
const n = BigInt(head.number);
for (const age of [0n, 1n, 128n, 8191n]) {
  console.log(String(age), await rpc('eth_getProof', [
    '0xE03A1074c86CFeDd5C142C4F04F1a1536e203543',
    ['0x' + '00'.repeat(32)], '0x' + (n - age).toString(16),
  ]));
}
for (const age of [256n, 257n, 8191n, 8192n]) {
  const target = n - age;
  const answer = await rpc('eth_call', [{
    to: '0x0000F90827F1C53a10cb7A02335B175320002935',
    data: '0x' + target.toString(16).padStart(64, '0'),
  }, head.number]);
  const expected = await rpc('eth_getBlockByNumber', [
    '0x' + target.toString(16), false,
  ]);
  console.log(String(age), answer, answer.result === expected.result?.hash);
}
```

## Proposed operational state machine

Use one deterministic worker and persistent job table before adding another orchestration framework. Jobs are keyed by chain, verifier, manager, N, pool, range and currency; raw artifacts are keyed by block hash and content digest. Multiple actors may execute the same job safely. Wallets sign bounded predefined transactions; an LLM must not choose endpoints, allocation amounts or transaction calldata in production.

| State | Required evidence and next action |
| --- | --- |
| Scheduled | Discover activation and independently reconcile onchain active series. Record exact N and required slots before N arrives. A dropped websocket must be repaired through polling/log backfill. |
| Acquiring | Observe N immediately; request primary and fallback providers concurrently within a bounded budget. Verify header/account/storage, then atomically persist artifact and status. Acquisition cannot wait for finality on a tip-only provider. |
| Retained, unfinalized | Keep the artifact in two independent durable locations; record chain/hash, schema and code pins. Recheck canonical N each head. On reorg, quarantine the orphan artifact and restart acquisition for replacement N. |
| Anchoring | Submit permissionless checkpoint as soon as N is historical. Track receipt block/hash and reorg it like any other transaction. Retry replacement transactions within fee caps. Checkpoint success is not evidence retention success. |
| Growth cached | Optionally call existing `cacheGrowth` once authentic evidence is available, even before capture. Verified growth in contract storage removes future dependence on the original witness for that tuple. Cache transactions still require canonical confirmation. |
| Matured / captured | Keep NFT return independently actionable after capture. Display allocation as pending while witness verification or transaction inclusion is pending. |
| Allocated | Reconcile onchain sold amount, reserved liabilities and independent claim availability. Retain witness and transaction evidence for recovery and inspection. |
| At risk / unavailable | If an artifact is missing or anchoring time is running out, surface the exact cause and recovery actions. Never release unresolved USDC to the residual owner, fabricate a zero payout or imply the captured NFT is still locked. |

This is a proposed application policy derived from current contracts, not a new entitlement rule. Initial monitor targets: zero missed registered endpoints in a seven-day rehearsal; two verified durable copies within two observed blocks; primary keeper checkpoint included by N+16 with an independently operated fallback; warning at N+32, critical at N+128 and N+224 under the current 256-block contract; no unobserved reorg transitions. These are engineering targets to test, not promises or measured performance. Track `proof_age_blocks`, `checkpoint_blocks_remaining`, copy count, last verified digest, endpoint finality, queue age, RPC error class and transaction inclusion age. Fixed numbers of confirmations must not be labelled finalized: use the execution client's explicit finalized block and hash, with monitoring for a stalled finality signal. [Execution API block-tag semantics](https://ethereum.github.io/execution-apis/api/methods/eth_getProof/).

Expose a compact recovery card: “Endpoint evidence saved,” “Canonical hash saved,” “NFT available,” “Cash allocation pending,” and the user's independently redeemable amount only after allocation. Include an artifact download and permissionless submit action. Anyone with a valid artifact can recover settlement without the original app host; prevent internal RPC URLs or credentials from entering that artifact.

## Better anchors and cheaper proofs: evaluate in this order

**1. EIP-2935 checkpoint extension.** Its system contract exposes 8191 prior execution block hashes; `BLOCKHASH` itself remains limited to 256. At an assumed uninterrupted 12-second cadence, those windows are about 27.3 hours and 51.2 minutes; actual wall-clock deadlines vary. FeeStrip's current checkpoint does not call this system contract. A separately reviewed implementation could retain the same hash-to-header trust path with a larger keeper recovery window. Check exact system bytecode, supported chain/fork, nonzero return and 32-byte return length; reject missing code and unsupported chains. Test the boundary and activation warm-up. It cannot recover pruned MPT material. [EIP-2935](https://eips.ethereum.org/EIPS/eip-2935).

**2. Existing verified-growth caching and measured batching.** Current evidence measures roughly 4.42M call gas for the public four-slot proof, versus a warm cached read near 3.1k; those are not whole-transaction costs. First measure `cacheGrowth` plus independent settlements across 1, 2, 5 and 20 identical endpoint tuples. Existing equality requires the same range as well as pool and N; merely sharing a pool does not give a cache hit. Publish full receipt gas, calldata bytes and amortized cost without assuming an ETH price. Grouping offered expiry choices can improve sharing, but must remain an explicit product term and cannot move an accepted N.

Across different ranges at one manager/N, account proof and shared slots could be verified once in a bounded multi-range verifier. Keep each authenticated range result separately keyed, cap work per transaction and preserve non-membership semantics. This adds protocol code and requires independent review. In the pinned Polytope source, `TrieDB.get` scans a node array on every lookup; a sorted lookup representation or single decoded traversal is a benchmark hypothesis, not an established improvement. Deduplicating input bytes alone does not eliminate repeated traversal.

**3. Library candidates, with provenance.** GitHub API inspection on the research date returned these snapshots:

| Candidate | Snapshot and maintenance signal | Assessment |
| --- | --- | --- |
| [Polytope Solidity Merkle Trees](https://github.com/polytope-labs/solidity-merkle-trees/tree/6bbc83d5ac33f85761725cf2eba4f8700164e8ba) | `6bbc83d…`; not archived; latest commit 2026-06-26; Apache-2.0 | Existing family, supports Ethereum MPT including absent keys. Preserve pinned files; do not upgrade only because upstream moved. |
| [Optimism MerkleTrie](https://github.com/ethereum-optimism/optimism/blob/a74e0eba2afa608e2d02f4b9b17225b2b7cb9a10/packages/contracts-bedrock/src/libraries/trie/MerkleTrie.sol) | `a74e0eb…`; active repo; inspected file MIT | Useful independent inclusion-proof reference. It rejects absent paths/empty values; not a drop-in replacement for FeeStrip's legitimate zero storage slots. |
| [Solidity-RLP](https://github.com/hamdiallam/Solidity-RLP/tree/da526be21b744d427d796a1cba6cfbc94934eaf3) | `da526be…`; not archived; latest commit 2025-01-15; Apache-2.0 | Parser reference, not a complete authenticated storage verifier. Limited recent activity alone proves neither safety nor abandonment. |
| [RISC Zero Ethereum](https://github.com/risc0/risc0-ethereum/tree/3aa137844818f0f44e6b2962b6eb958f26d04be7) | `3aa1378…`; not archived; latest commit 2026-05-12; Apache-2.0 | Candidate proof-compression experiment. Review exact verifier/image identity, deployment controls and prover liveness; no demonstrated FeeStrip savings yet. |
| [Boundless Steel](https://github.com/boundless-xyz/steel/tree/f6fc6297c938d7acc0563337da136d034c3cb67b) | `f6fc629…`; not archived; latest commit 2026-05-21; Apache-2.0 repository metadata | Current home of the Steel EVM coprocessor, linked from RISC Zero. More directly applicable than generic zkVM infrastructure; inspect per-file/dependency licensing before adoption. |
| [Axiom V2 contracts](https://github.com/axiom-crypto/axiom-v2-contracts/tree/5514752e92e829d7da9a8da8988062d870460cab) | `5514752…`; archived; latest commit 2024-01-18; MIT | Historical design reference. Do not select this repository as a maintained integration on the strength of old product descriptions. |

A differential benchmark needs both real public witnesses and generated tries covering absence, inline nodes, short/long RLP, malformed nodes, missing branches and mismatched account roots. A library's reputation, stars or unrelated audit cannot replace those results.

**4. EIP-4788 and proof coprocessors remain alternatives.** EIP-4788 exposes a parent beacon block root selected by timestamp, not an execution state root or execution block hash. To use it, prove the appropriate execution payload's block number/hash or state root through an SSZ branch from that authenticated beacon root; bind the consensus fork's schema and handle skipped slots and timestamp lookup precisely. Then perform the same account/storage authentication. This is additional machinery where EIP-2935 already directly supplies the required hash. It does not supply missing historical storage proofs. [EIP-4788](https://eips.ethereum.org/EIPS/eip-4788), [consensus execution-payload definitions](https://github.com/ethereum/consensus-specs/blob/master/specs/deneb/beacon-chain.md).

Steel is a concrete candidate for that experiment: its preflight collects `eth_getProof`, its guest validates the tries and reconstructs the block commitment, and its consumer must check that commitment onchain. Its history mode links older execution to recent commitment blocks, requiring archive execution and beacon access. It therefore does not remove our missing-proof-provider dependency. Its history documentation gives inconsistent cycle estimates in separate sections; use an actual workload benchmark, not those numbers, for budgeting. [Steel commitments](https://docs.boundless.network/developers/steel/commitments), [Steel history](https://docs.boundless.network/developers/steel/history).

A zk proof could compress MPT verification, but its public inputs must bind chain, canonical endpoint commitment, manager/codehash, pool/range/currency and resulting growth. The onchain commitment remains authoritative; outsourcing computation must never turn into accepting a server's allocation signature. Prover cost/latency, verifier upgrades, emergency controls and permissionless proof generation require measurement and review before adoption.

## Next implementation decisions

Implement the durable retention worker, full offline witness validation and recovery card first; fault-test RPC timeout, tip advancement, mid-acquisition reorg, corrupt artifact, process restart, missed websocket, duplicate jobs and dropped keeper transactions. Run an EIP-2935 extension as an isolated contract experiment with an independent reviewer. Benchmark existing cache amortization before changing proof libraries. After project credentials arrive, qualify two providers against the same historical blocks and complete the controlled public sale-to-redemption lifecycle. Research improves the design; it does not satisfy that outstanding acceptance gate.

Research and recommendations authored by Codex. No project credentials, dependencies or upstream code were installed or committed during this lane.
