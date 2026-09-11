# Native FeeStrip lifecycle evidence

AI-assisted implementation and tests: OpenAI Codex, 11 September 2026. ScopeLift's [Fixed Fee Swap](https://github.com/ScopeLift/fixed-fee-swap) is credited as a close predecessor for fee/principal separation. No ScopeLift code or archived handoff Solidity was ported into these contracts. This is not an audit or a public deployment claim.

## Reproduce

```
forge test -vv
python3 contracts/scripts/check-denominator-mutation.py
forge test -vv
```

Foundry 1.5.1, native v4 graph Solidity 0.8.26, Cancun, viaIR, 200 optimizer runs. `foundry.toml` autodetects compilers because the separate market graph requires 0.8.30 while upstream PositionManager requires exactly 0.8.26. Dependency sources are vendored with licenses and Git pins in `contracts/dependencies.json`; no install hooks execute. Upstream source was inspected at the pinned revisions.

## Verified scope

Twenty protocol tests pass across five suites. The original two-series accounting invariant and the additional dynamic lifecycle invariant each execute 128 runs × 64 calls = 8,192 calls (16,384 total), zero unexpected reverts. The independent payout fuzz executes 256 cases. Tests deploy the unmodified pinned PoolManager and PositionManager and transfer actual local ERC20/native assets. Local tokens are explicitly fixtures, not authentic public-chain USDC. Position minting uses the official pre-funded PositionManager `SETTLE` path with `payerIsUser=false`; no mocked Permit2 replaces the mint path.

- Atomic funded offers bind seller, original token ID, full pool key, ticks, liquidity, quantity, buyer quantity, proceeds, end block and timestamp deadline. Seller calls acceptance; ERC721 approval alone cannot consent. Cancellation refunds buyer, and failed funding, missing NFT approval, expiration and insufficient proceeds leave custody/sale unchanged.
- Activation executes a native zero-liquidity collection and immediately reads the canonical **PositionManager-owned** position's cleared `feeGrowthInsideLast`, salt `bytes32(tokenId)`. Pre-period assets actually reach the seller.
- The original NFT stays in custody at unchanged liquidity. Former-owner approvals, collection and transfer fail. Before maturity, recombination consumes the residual right plus every original claim before collection/delivery.
- At end block N, tests snapshot the EVM and collect through native PositionManager as an independent amount oracle, then restore N. Later actual donations accrue before M>N capture. An additional native swap test generates trading fees with actual input/output asset transfers. Donations are fee-growth semantics, not evidence of organic activity.
- Capture reserves balance **deltas**, then NFT return succeeds before proof allocation. Direct token transfers do not inflate earned entitlement. Missing proof cannot transfer unresolved USDC to the residual owner.
- A transferred claim carries all unpaid window income. Multiple holders independently redeem with `floor(amount * soldUSDC / originalQ)`. Per-call integer dust remains permanently segregated in the original series; no admin or residual owner can sweep it. Splitting redemption can increase dust, and the UI should favor redeeming the whole available balance.
- Both USDC currency indices are exercised. Native ETH other-currency fees work. Rejected NFT/native-asset recipients do not prevent buyer redemption; native recipient reentry fails against the guard. Residual rights may transfer after NFT return and retain only the remaining fee liabilities.
- The stateful handler transfers claims, redeems in varying order, transfers residual rights, withdraws residual fees and adds direct escrow donations across two series. Separate native collection snapshots seed its expected economics. Mandatory initial transfers and redemptions prevent a vacuous empty-state invariant.
- The mutation command changes the payout denominator to remaining supply and requires failure at the **independent original-Q/native collection payout assertion**, then restores the source in a `finally` block. A compiler failure does not count as a killed mutation.

## Independent-review verification increment

`contracts/test/CustodyBypasses.t.sol` adds six canonical authorization tests. A real seller-signed NFT permit is proven valid before sale and rejected after escrow becomes owner. A valid seller `permitForAll` remains scoped to the seller and cannot authorize the escrow NFT; reusing the seller signature as an escrow authorization fails. A working subscriber establishes a positive control, subscribed NFTs fail funding, and former-owner subscribe/unsubscribe calls fail during custody. Multicall approval changes roll back when fee collection/principal removal fails. An attacker opens a real PoolManager unlock, then tries PosM `modifyLiquiditiesWithoutUnlock` for zero-delta fee collection, liquidity removal/increase, burn and increase-from-deltas. Tests require the specific `NotApproved(attacker)` error, so malformed data or an incorrectly locked core do not count as successful protection.

`contracts/test/FeeStripLifecycleInvariant.t.sol` preserves the earlier invariant and adds a distinct handler starting with four **unfunded, unescrowed NFTs**. Random actions fund/accept/cancel offers, accrue funded donations, transfer claims/residual rights, recombine, advance blocks, capture, return, settle and redeem. A lifecycle driver uses those same actions to reach deep states; calls whose state prerequisites are absent explicitly do nothing. It retains independent native collection at each endpoint when leaving N, rather than preallocating all series in setup. A separate smoke test asserts three completed sales, two NFT returns before proof, two allocations and one early closure; the same returned NFT is resold while earlier claim liabilities remain. These actual-transition counters guard against confusing selector-call counts with successful financial activity.

The first dynamic run exposed a **test harness** error: Solidity may cache `block.number` inside a transaction, so looping `vm.roll(block.number + 1)` could remain at one block. The maturity assertion caught this (11 was not greater than N). The handler now reads `vm.getBlockNumber()` / `getBlockTimestamp()` around cheatcode-driven advancement. No FeeStrip implementation or expected allocation changed; the corrected invariant completes with zero unexpected reverts. The transition-count smoke also caught Foundry 1.5.1 formatting compact multi-statement `if` blocks into unconditional returns: the invariant alone stayed green with no sales, but the smoke failed `0 != 3`. Conventional multiline braces preserve semantics under the formatter; the final compiled suite has no unreachable-code warnings. A first permit test similarly placed `expectRevert` before a signature helper's read call; the signature is now computed before the expected failing transaction.

## Implementation decisions

One non-upgradeable FeeStrip contract owns custody, offers and segregated reserves. Each series deploys a conventional 18-decimal ERC20 `FeeClaim` with a fixed original supply. Only FeeStrip may consume claims, and only through the calling holder's redemption or complete recombination. There are no holder dividend checkpoints, late mint, arbitrary burn, reserve approvals, sweeps, admin or proof timeout allocation.

A plain recorded transferable residual beneficiary is sufficient; making it a second NFT adds callbacks and approvals without changing the required economics. The original NFT can be safe-transferred independently of fee payouts. Callback failure reverts only that withdrawal transaction.

`claimToken(id)`, `marketState(id)` and `series(id)` serve the market/client. Market state hashes capture/allocation/closure flags, sold allocation and remaining total supply, so a settlement or redemption invalidates a maker's prior state-bound quote while ordinary transfers do not.

## Remaining acceptance boundaries

`EndpointStub` is explicitly an accounting-test stub. These native tests **do not authenticate historical proofs**. The proof lane independently retains genuine public-chain witnesses and tests the verifier; final integrated FeeStrip→real verifier settlement on a captured local series is still required. A current RPC value is never used in production FeeStrip as the payout oracle.

Constructor configuration is immutable and checks deployed code, manager continuity and verifier manager binding. Authentic chain-specific USDC/canonical deployment selection must be verified by deployment tooling; arbitrary constructor inputs do not become canonical just because they have code. Local source deployments are not bytecode equivalence claims about existing public addresses.

Live testnet transactions, public FeeStrip deployment, browser lifecycle, Aqua trading, full historical-proof/settlement transaction gas, and independent economic review are outside this protocol checkpoint. Existing bad or frozen other-currency tokens can make native Uniswap collection fail; validated asset selection must not infer token behavior from hooklessness. Plain unsolicited NFT transfers are not supported deposits and have no recovery API.
