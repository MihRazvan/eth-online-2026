# Independent protocol and market correctness review

Reviewer: Codex proof-lane agent, 2026-09-11. This agent did not author FeeStrip, FeeClaim, FeeStripMarket, FeeStripRouter or their tests. It did author the historical-proof component, which is **excluded from this independent review**. This is a bounded source and regression review, not an audit or public deployment acceptance.

Reviewed root integration HEAD `9f001cd4e017747e90c16ac3b8b1a8c983046bf1`, including then-uncommitted market files. Exact reviewed SHA-256:

| Source | SHA-256 |
| --- | --- |
| `contracts/src/FeeStrip.sol` | `c89cddebf913bc18cccfaa186b5d853fe591dce74e11a75c230a66a9c9389b2d` |
| `contracts/src/FeeClaim.sol` | `9de1a21519483a460994df57af8293c8f6174ca5ba98a737d67d1f709ce36833` |
| `contracts/src/market/FeeStripMarket.sol` | `abd4826e84c6036eb70d66f344f0990ee29dfe2e5d1451abddf752f8147a73ae` |
| `contracts/src/market/FeeStripRouter.sol` | `587903507e2d89dbbe464eaea9fbfea684a834499e25fd3a09674504dc04a0c9` |

## Findings

**Previously identified callback-ordering issue: independently verified fixed.** The lead reports that a separate initial economic reviewer identified the issue; this reviewer does not claim original discovery. Upstream `SwapVM._transferIn` invokes the maker pre-transfer guard **before** a taker-controlled pre-transfer callback. A guard only there could accept an order whose lifecycle state then changes in a callback. Takers can also reverse transfer order and supply pre-output callbacks. The reviewed `buildOrder` now includes `postTransferIn` and `postTransferOut` guards (market lines 53–60), and both dispatch to the same authenticated router/state/token-pair check (lines 88–106). Reading the upstream execution order confirms the final transfer's guard runs after its callback. The existing regression passed all four callback/transfer-order permutations and checked complete balance/state rollback. No subsequent caller-controlled callback occurs after the final post-transfer guard in the examined runtime path.

**No additional concrete accounting or custody defect found in the reviewed paths.** The following remain acceptance/coverage limitations, not demonstrated exploits:

1. **Combined real-verifier lifecycle was still pending at this review snapshot.** Protocol tests use an explicitly mutable `EndpointStub`; market tests use `MarketStateFixture` and conventional test tokens. Passing both suites separately does not establish activation → genuine verifier settlement → tradable real FeeClaim integration. The lead is implementing a separately labeled local-chain lifecycle; its output should be reviewed before claiming this gate. A local generated witness cannot be described as a public canonical-state witness.
2. **Stateful exploration starts after both series have settled.** `FeeStripInvariantTest.setUp` captures both series and calls `handler.redeem` on each (lines 105–128), which invokes settlement. Consequently randomized `settle` calls return immediately; activation, maturity, capture, proof failure, NFT withdrawal and recombination are not randomized transitions. The 8,192 calls are real but do not constitute a full-lifecycle state machine. Existing deterministic tests cover many of these transitions. Add successful-action counters and a handler campaign beginning before activation if claiming the brief's full stateful lifecycle gate.
3. **Market sell direction lacks executable coverage.** All current successful transfers invoke `buildOrder(...claimsIn=false)` and the `buy` helper. Source inspection supports the inverse direction but does not verify its actual Aqua movements. Add a funded maker-USDC order with `claimsIn=true`, taker claim approval, actual claim/USDC balance checks and insufficient-maker-cash rollback. The existing shared-allocation test correctly demonstrates that virtual inventory is not locked capital.
4. **Some custody bypasses have source review, not direct regression evidence.** The deterministic custody test checks transfer, approve and zero-liquidity collection by the prior owner. This review also inspected canonical `ERC721Permit_v4`, `Notifier`, and action dispatch: permits verify the current owner, subscriptions require current-owner approval, and increase/decrease/burn actions use the current locker authorization. FeeStrip exposes no external PosM forwarding or approval method. Explicit tests remain useful for old signed permits, subscribe/unsubscribe, multicall and `modifyLiquiditiesWithoutUnlock`, plus nonempty/hook/USDC/subscriber admission rejection. Do not describe these unexecuted cases as individually tested.

## Product-requirement checks

- `fundOffer` binds and funds exact immutable terms. Seller-only acceptance revalidates pool/range/liquidity, consumes the offer and performs NFT transfer, old-fee collection, baseline read, claim deployment and payment inside one reverting transaction. Missing approval, funding failure, expiry and minimum-proceeds failure were exercised. Constructor code checks do not independently establish canonical deployment selection; tooling must pin trusted chain addresses and code.
- The old-fee baseline is read from the canonical core position owned by PositionManager, salted with `bytes32(tokenId)`, after the zero-liquidity collection. Native snapshots independently determine test entitlements. During custody, FeeStrip grants no approval and its private collection path always uses liquidity delta zero. Hooks/subscriptions and empty positions are rejected at admission.
- Capture requires `block.number > endBlock`, tracks actual collection deltas and increases aggregate reserved USDC. Unresolved USDC is not assigned to the residual owner. NFT withdrawal is a separate callback-bearing transaction and preserves `residualOwner`; a rejected recipient does not block settlement or other holders' redemptions.
- Settlement reads frozen series inputs, applies modular growth subtraction and full-precision multiplication, and rejects entitlement above the series' own captured reserve. `redeem` uses immutable `s.quantity`, consumes the caller's claims, records payout and reduces reserves before transferring. Holder transfers carry all unpaid income. No later mint or arbitrary external supply reduction exists. The native original-Q test/fuzz and two-series liability invariant passed.
- Residual USDC starts at zero before allocation and later equals captured minus sold income. Withdrawal zeroes its individual liabilities before external calls. Independent series accounting prevents one series from sweeping another's reserves; direct escrow USDC donations create surplus but no new entitlement. Other-currency reserve liveness still depends on that token's transfer behavior, as already documented by the protocol author.
- Early recombination requires the current residual owner and consumption of exactly original Q before maturity, then marks closed/returned and removes residual ownership before external delivery. Partial holders cannot close. Per-redemption floor dust stays permanently segregated; splitting redemptions can lose more dust. This is explicit policy, not unclaimed residual income.
- Market inventory belongs to the maker and Aqua; FeeStrip never approves its reserves. Orders bind expected lifecycle state and exact token pair. Capture/allocation/closure/redemption change `marketState`, while ordinary token transfers and residual-right transfers do not change fee-claim entitlement. Amount bounds keep upstream fixed-price multiplication within uint256.

## Commands independently executed

From root with existing project configuration:

```sh
forge test --match-path 'contracts/test/market/*' -vv
forge test --match-path 'contracts/test/FeeStrip*' -vv
forge test --match-path 'contracts/test/NativeCurrency.t.sol' -vv
```

Results: market **10 passed**, including the four callback-order permutations and price fuzz (256 configured runs plus one stored case reported as 257); protocol **10 passed**, including 256 original-Q/native-oracle fuzz cases; invariant **1 passed**, 128 runs × 64 calls = 8,192, zero reverts; native-currency/reentrancy **1 passed**. No skips or test failures. This reviewer did not run the mutation script because it temporarily edits production source and the integration worktree had concurrent implementation activity; its implementation was inspected, but mutation-kill evidence remains attributed to the protocol author.

No implementation files were changed by this review. The reviewer only added this report in its isolated worktree. Findings and coverage boundaries were sent to the integration owner before completion.
