# FeeStrip IDE handoff: verification and evidence harness

Research checked 11 September 2026. This memo is an implementation recommendation, not evidence that FeeStrip already works. It builds on `output/FeeStrip_Final_Build_Brief.md` and the supplied hackathon rules.

## Recommendation

Use a small default harness: **Foundry, Slither, TypeScript property tests where useful, and Playwright**. Add a specialist fuzzer or solver when a named uncertainty justifies it. Delegate independent economic-model and adversarial-review work to agents that did not implement the target. A green test run is meaningful only when the tests exercised the lifecycle and their expected results come from independent evidence.

Do not freeze every class, framework or database in the handoff. Freeze the financial agreement, integration outcomes, and evidence required to claim completion. Let the IDE agent select implementation details after checking the repository, installed tools, official sources and compatibility.

## Modern capabilities that are actually available

| Tool | Observed stable release | Default use / caveat |
|---|---|---|
| Foundry | [v1.8.1, 28 Aug 2026](https://github.com/foundry-rs/foundry/releases/tag/v1.8.1) | Solidity compilation, unit/fuzz/stateful tests, Anvil, pinned forks, gas measurements; record compiler, EVM target and optimizer too. |
| Slither | [0.11.6, 28 Jul 2026](https://github.com/crytic/slither/releases/tag/0.11.6) | Static analysis of the real Foundry build; triage findings with reasons instead of blanket suppression. |
| Echidna | [v2.3.3, 27 Jul 2026](https://github.com/crytic/echidna/releases/tag/v2.3.3) | Optional alternative stateful engine if its particular search mode is needed or a useful upstream harness already uses it. |
| Medusa | [v1.5.1, 11 Mar 2026](https://github.com/crytic/medusa/releases/tag/v1.5.1) | Optional coverage-guided sequence search with parallel workers; preserve corpus and replay counterexamples in Foundry. |
| Halmos | [v0.3.3, 31 Jul 2025](https://github.com/a16z/halmos/releases/tag/v0.3.3) | Optional isolated symbolic arithmetic/transition properties. A bounded successful query is not whole-system verification. |

Release metadata was read through the official GitHub API. These are candidate reproducible pins, not a demand to update an existing compatible project. Verify binaries and feature availability before writing configuration against them.

Foundry now supports persistent coverage-guided fuzz corpora, inspection, replay and minimization. Preserve failures separately from coverage-increasing inputs. Use `forge fuzz replay --corpus-dir ...` to replay a corpus; without that flag the command replays failures. The existing guide also documents block/time-delay fuzzing and `afterInvariant()`. For reserve conservation, keep checks after every call; a sparse `check_interval` can miss a temporary violation. [Corpus guide](https://github.com/foundry-rs/book/blob/7004a8cb395b0e75fb774002dbdc1fac902ea9ee/src/pages/guides/fuzz-corpus.mdx) · [Invariant guide](https://github.com/foundry-rs/book/blob/7004a8cb395b0e75fb774002dbdc1fac902ea9ee/src/pages/guides/invariant-testing.mdx)

Native `forge test --mutate` can test whether critical assertions detect deliberately changed logic. It is explicitly an MVP: surviving mutants do **not** make the command fail. Inspect the JSON and triage survivors; do not equate exit code zero with adequate tests. The documented runner rejects FFI-enabled projects and some unsafe filesystem/network configurations. Run a dedicated pure-contract mutation profile and target ownership, cutoff and reserve code. Availability of mutation/corpus options was also checked in the stable v1.8.1 source. [Mutation guide](https://github.com/foundry-rs/book/blob/7004a8cb395b0e75fb774002dbdc1fac902ea9ee/src/pages/guides/mutation-testing.mdx) · [v1.8.1 test command](https://github.com/foundry-rs/foundry/blob/v1.8.1/crates/forge/src/cmd/test/mod.rs)

## Financial semantics to preserve

These are requirements for the selected instrument. An agent must not change them simply to make an integration easier:

1. One supported existing canonical Uniswap v4 NFT backs a series; the same NFT returns. During an active sale, the range and liquidity are fixed. Retained economic rights do not mean the NFT remains unrestricted in the seller's wallet.
2. The original claim supply is fixed at activation. Each token carries its fraction of all unpaid income from the sold period, including income accrued before that token's most recent transfer. No late minting or arbitrary burning that redistributes another holder's economics.
3. Initially sell only the pool's native USDC fee leg. Clear pre-sale fees to the LP; preserve the other fee leg and post-period USDC for the residual beneficiary. Do not silently replace this with conversion of both pool currencies.
4. A funded sale activates atomically: failed payment or position validation cannot leave an active agreement or stranded NFT. A draft listing alone does not lock the position.
5. Entitlement ends at the agreed exact end-of-block N even when capture is late. A backend's fee estimate or the amount collected at the later block is not a substitute.
6. Capture actual fees before releasing the NFT. NFT withdrawal is possible after capture without waiting for proof. Residual liabilities remain attributable after the NFT has left custody.
7. Buyers can redeem finalized reserves without later seller approval. No administrative sweep, timeout or upgrade may quietly make unresolved buyer reserves the seller's money. Trading inventory is separate from redemption reserves.
8. Before maturity, all-rights recombination requires the residual right plus the entire original claim supply. It is not a seller cancellation option when unrelated claim holders exist.
9. The market prices uncertain income; the contract enforces entitlement. No guaranteed APR, guaranteed resale liquidity or dollar principal guarantee. Graph observations and current accrual estimates are distinguishable from finalized redeemable funds.

Important facts to recheck against the actual canonical version include the PositionManager core owner, token-ID-derived salt, fee-growth-inside arithmetic, stored tick semantics, callback authorization and NFT approval/subscription paths. They are not places for an agent to invent a simplified substitute.

## Implementation hypotheses the agent may improve

Contract boundaries, factory/clones versus ordinary deployments, residual ERC721 versus a stored rights record, exact quote-program design, frontend framework, chart library, database, service packaging and deployment platform can be chosen using evidence. Keep a short ADR for a consequential change. Prefer small explicit modules to an unneeded generic adapter framework.

The current historical MPT witness approach, verifier library, block-hash checkpoint mechanism, proof-fetch service, caching and gas optimization remain implementation hypotheses. Ethereum Sepolia is the proposed public demonstration target, conditional on canonical contracts, actual tokens, proof service and required execution being verified. A network change needs a compatibility record. None of these choices permits weakening the exact endpoint or independent claim right. If a trustworthy replacement cannot preserve the economics, report that concrete blocker and proposed product change before implementing it.

The previous brief records component tests and synthetic witnesses only. A successful synthetic MPT test, an `eth_getStorageAt` result, an archive-RPC marketing claim or a server-signed number does not close the genuine historical-settlement gate.

## First engineering gate: genuine historical settlement

Produce a reusable evidence fixture before treating the chosen proof architecture as established:

- Identify the actual chain, canonical PoolManager and PositionManager, deployed code hashes, NFT, pool ID, fixed L/range, baseline and N. Record the block hashes, not numbers alone.
- Obtain the real N header plus account/storage witness with `eth_getProof`. Validate it independently offchain, then through the intended Solidity verifier and header-authentication path. Store the public witness, header, decoded slots, derivation inputs and verifier result; exclude RPC credentials.
- Compare the calculated sold-period entitlement with **native Uniswap collection from the same N snapshot**, accounting explicitly for the cleared baseline and integer rounding. The oracle must execute canonical accounting/collection, not call the same FeeStrip helper a second time.
- Then capture at M>N after more real fees accrue; show the buyer gets N income and the residual owner gets the remainder. Return the original NFT before proof allocation and still redeem both liabilities correctly.
- Reject wrong block/root/manager/pool/tick keys, altered RLP/node/value, wrong currency, wrong token salt and proof replay into a different series. Include valid zero/non-inclusion storage cases where the layout can produce them.
- Authenticate the endpoint without an administrator choosing an arbitrary root. Test unavailable/pruned proof data, expired history-window access and restart/retry behavior. Preserve an authenticated checkpoint and witness independently.
- Record full capture, header/proof, allocation and redemption costs, not only the verifier call. Report local fork versus public-chain transactions accurately.

[EIP-1186](https://eips.ethereum.org/EIPS/eip-1186) defines account/storage proofs tied to a state root. [EIP-2935](https://eips.ethereum.org/EIPS/eip-2935) serves 8,191 historical block hashes and leaves the ordinary 256-block BLOCKHASH window unchanged. Neither is a permanent historical-witness service. Geth's documentation distinguishes historical flat-state availability from trie-node retention: path-based v1.16 archive mode cannot supply old proofs; v1.17+ requires configured `history.trienode` retention. Actually test the intended endpoint and window. [Geth archive documentation](https://geth.ethereum.org/docs/fundamentals/archive)

Pinned forks make upstream integrations reproducible. Local impersonation can be used for the independent collection oracle and adversarial tests, but must not be represented as a transaction signed by a real holder, and cheatcodes must not bypass the proof/root trust path being evaluated. [Foundry fork guide](https://github.com/foundry-rs/book/blob/7004a8cb395b0e75fb774002dbdc1fac902ea9ee/src/pages/guides/fork-testing.mdx)

## Stateful economic harness

Give a verification agent the financial requirements and public ABI before the implementation. Have it build an independent ledger/model tracking original supply, residual rights, actual token flows, reserved liabilities and custody. The implementation agent may expose observability, but must not rewrite the acceptance property to match its own defect.

Handlers should generate funded sales, claim transfers, real swaps, block advances, maturity, capture, proof, NFT withdrawal, residual payout, claim redemption and early recombination. Include multiple sellers, buyers, recipients and series. Track attempted calls, successful transitions and expected reverts so an all-revert campaign cannot masquerade as coverage. Use targeted boundary tests for N-1/N/N+1; generic random delays alone may not hit them.

Key properties:

- Before redemption, the supply equals the original supply; afterwards, burned claim quantity plus live supply equals the original quantity.
- At every state and external interaction boundary, actual reserve cash covers unpaid allocated liabilities; total paid plus remaining liability cannot exceed actual captured funds allocated to that series.
- Per-holder payout follows current token ownership. Trading after N or during proof delay cannot erase earned income. A first holder redeeming cannot block later holders.
- Activation failure leaves all prior ownership, balances and approvals in their specified safe state. One series cannot spend another's reserve.
- Active L/range cannot change through *any* exposed owner, approval, callback, multicall, subscription or helper path.
- Unsolicited transfers to escrow do not inflate sold entitlement. Funded pool donations follow the expressly selected Uniswap fee-growth semantics.
- Repeated capture/allocation/redemption/withdrawal calls cannot duplicate rights or payments. A malicious NFT recipient cannot block other claim holders. Terminal state changes occur before external effects.
- Rounding is bounded under arbitrary claim splitting and redemption order. All-rights recombination cannot succeed after any required rights have been paid or lost.

Deliberately break representative checks in an isolated mutation branch: remove cutoff binding, transfer old income back to the seller, release the NFT before capture, let a claim holder burn without payout, or close redemption after the first buyer. Require the corresponding tests to fail. These semantic mutations can be more informative than a global mutation-score target.

Run Slither on the actual project and triage findings with source references. Its result complements this economic harness; it does not establish the economics. [Slither](https://github.com/crytic/slither)

Optional escalation: Medusa if Foundry coverage reveals missed long sequences or an independent engine is justified; RECON setup helpers if they reduce handler/actor duplication; Halmos for a bounded rounding or authorization formula. Do not install all engines to create an appearance of rigor. [Medusa](https://github.com/crytic/medusa) · [RECON helpers](https://github.com/Recon-Fuzz/setup-helpers) · [Halmos](https://github.com/a16z/halmos)

## Integration gates

### Aqua / SwapVM

Pin official runtime addresses/code hashes, protocol source, SDK source and encoded-program fixtures as one compatible set. The prior review found an opcode mismatch between inspected runtime and SDK revisions; updating both to “latest” is not a compatibility argument. Verify program bytes/hash, quote and actual execution against the deployed version.

Execute a real funded claim/USDC trade with actual balance deltas for both parties. Then exercise partial fills, concurrent strategies sharing maker capital, depleted balances/allowances, expired orders, invalid signatures or authorization mode, callback spoofing, slippage, zero liquidity, post-N accrued value and replay. Validate exact transfers and entitlement, not merely emitted events or an API success response. Secondary liquidity is not assumed because a token can be transferred.

The bounty requires an actual custom Aqua application and actual token transfers; a local fork qualifies for its demo. This does not automatically satisfy another sponsor's live-data requirement. [Aqua source](https://github.com/1inch/aqua) · [SwapVM source](https://github.com/1inch/swap-vm) · [1inch prize](https://ethglobal.com/events/ethonline2026/prizes/1inch)

### The Graph

The selected direction uses two genuinely live products: reusable v4 Substreams history plus a FeeStrip Subgraph. Show a buyer analysis joined from both, with chain/manager/pool/block identifiers, deployment/module IDs and source freshness. Test duplicate/replayed events, restart from a cursor, out-of-order arrival, missing intervals, indexing errors and reorg recovery supported by the chosen sink. A static cached screenshot or ordinary single subgraph does not close the chosen composition gate. [Graph prize](https://ethglobal.com/events/ethonline2026/prizes/the-graph)

Use `_meta` to record the subgraph deployment, block and indexing-error status. Historical queries accept a number or hash; the docs explicitly discuss nonfinal/reorg limitations. Align compared data to a common known canonical block and expose indexing lag. Never use the joined estimate as the payout oracle. [Graph query API](https://thegraph.com/docs/en/subgraphs/querying/graphql-api/)

## Browser and visual verification

Use ordinary Playwright as the default browser harness. Define a test-only wallet/provider fixture against local Anvil for fast deterministic lifecycle tests, and a smaller real wallet-extension test for connect, chain switch, approvals, rejection and transaction confirmation. A provider fixture checks app behavior but does not establish wallet-extension compatibility.

Synpress is a useful candidate for the real MetaMask suite, with Playwright integration, wallet-state caching and Anvil support. Its GitHub release API currently reports the old 3.7.3 line while its `dev` branch documents the rewrite. Verify the published package, matching docs, Playwright version and MetaMask bundle together rather than mechanically choosing GitHub's “latest.” [Current development README](https://github.com/synpress/synpress/blob/dev/README.md) · [Old release line](https://github.com/synpress/synpress/releases/tag/3.7.3)

Playwright includes planner, generator and healer agents. Generate definitions for the actual IDE agent (`--loop=claude` or supported equivalent) and refresh them after upgrading Playwright. Restrict healing: a skipped critical test, removed assertion, auto-accepted screenshot or changed expected payout is an unresolved failure. Official healer behavior can skip a test it considers broken; override that completion criterion in the handoff. [Playwright Test Agents](https://playwright.dev/docs/test-agents)

Cover the public browse-without-wallet view and the states users actually encounter: loading, no positions, incompatible NFT, wrong network, rejected approval, pending/replaced/reverted transaction, insufficient funds, quote expired, out of range, missing price history, stale index, capture available, captured/proof pending, NFT withdrawn, claim redeemable and already redeemed. Correlate visible amounts and explorer links with receipt hashes and contract reads.

Capture desktop/tablet/mobile screenshots and inspect them, including long token IDs, sparse data, large numbers, negative outcomes and disabled actions. Use stable fonts, viewport, browser and host environment for pixel baselines; approve intentional changes after visual review. A passing snapshot proves consistency, not good taste. Require a separate design critique against the chosen reference direction and information hierarchy. [Playwright visual comparisons](https://playwright.dev/docs/test-snapshots)

## CI, evidence and honest autonomy

Use one local entry point matching CI, with fast checks on each meaningful change: formatting/typecheck/build, targeted unit/property tests, deterministic corpus replay and contract analysis. Run full integrated invariants/forks/browser lifecycle at integration milestones, plus larger fresh campaigns when coverage or a risk warrants them. Avoid arbitrary pass counts or “100% coverage” as completion conditions.

Separate deterministic tests from credentialed live integration jobs. A missing RPC/API credential is **blocked**, not passed; fixture-only success must not produce a live-integration badge. Preserve minimal reproduction commands, tool versions, commit SHA, chain/block identity, witness hashes, transaction receipts, screenshots and unresolved findings in an evidence manifest. CI artifacts can hold bulky logs; keep durable summaries and important minimized regressions in the repo.

Pin GitHub Actions by full commit SHA and use minimal token permissions. Do not execute untrusted PR source in a privileged workflow or expose deployment keys to test jobs. Install tools/skills from reviewed sources and pin them. [GitHub secure-use reference](https://docs.github.com/en/actions/reference/security/secure-use)

Useful Trail of Bits skills, checked at commit `321ccfe628eca0d314b0ee4eaffcdd8a05639aaf` (9 Sep 2026): `property-based-testing` for independent properties/vacuity, `spec-to-code-compliance` once requirements and implementation both exist, `entry-point-analyzer` for custody paths, and `differential-review` after consequential changes. Load only the relevant skill. The spec-compliance plugin explicitly fans requirements into independent contexts and sends divergences for separate refutation; that is a useful mechanism, not a substitute for an audit. Its CC-BY-SA license matters if instructions are copied into the repo. [Marketplace](https://github.com/trailofbits/skills/tree/321ccfe628eca0d314b0ee4eaffcdd8a05639aaf) · [Property skill](https://github.com/trailofbits/skills/blob/321ccfe628eca0d314b0ee4eaffcdd8a05639aaf/plugins/property-based-testing/skills/property-based-testing/SKILL.md) · [Spec compliance skill](https://github.com/trailofbits/skills/blob/321ccfe628eca0d314b0ee4eaffcdd8a05639aaf/plugins/spec-to-code-compliance/skills/spec-to-code-compliance/SKILL.md)

Per the supplied hackathon rules, AI assistance is allowed, but a wholly AI-created submission without meaningful team contributions may be ineligible. The handoff should preserve the complete prompts/specs/planning artifacts and a truthful AI-use record, plus real human decisions, reviews, integration work and demo narration. Do not imply a minimum number of human commits guarantees eligibility; the organizer judges meaningful involvement.

Interpret “small commits that look human” as **small coherent commits made when real work is complete**, using the configured authorized identity, truthful messages and normal timestamps. The agent can commit/push autonomously as authorized. Do not manufacture chronology, disguise AI authorship, backdate work, or invent human contributions. A concise commit such as `fix: preserve residual fees after NFT withdrawal` is appropriate when the diff and tests actually do that work.
