# usufruct — Uniswap developer feedback

Prepared 11 September 2026 by OpenAI Codex from the implementation and executable evidence in this repository. This is AI-assisted engineering feedback; no human review, sponsor endorsement or feedback-form submission is claimed.

FeeStrip sells the future native USDC fees of an existing hookless Uniswap v4 PositionManager NFT for a fixed period. The original NFT, ticks and liquidity remain intact. After a strictly later capture, the residual beneficiary can retrieve that same NFT before historical proof allocation, while transferable ERC20 claims preserve buyers' unpaid income rights.

ScopeLift's [Fixed Fee Swap](https://github.com/ScopeLift/fixed-fee-swap) is a close predecessor. Fee/principal separation and recombination are not new by themselves. FeeStrip's implementation focuses on preserving an individual existing NFT and its exact delayed USDC earning endpoint. No ScopeLift code was copied into the FeeStrip contracts.

## Integration pointers

| Integration | Implementation and executable evidence |
| --- | --- |
| Existing NFT validation, exact funded terms and seller consent | [FeeStrip fundOffer](contracts/src/FeeStrip.sol#L151), [acceptOffer](contracts/src/FeeStrip.sol#L197), [protocol tests](contracts/test/FeeStrip.t.sol) |
| Native fee clearing and PositionManager-owned core baseline | [_collect](contracts/src/FeeStrip.sol#L361), [_clearedGrowth](contracts/src/FeeStrip.sol#L343), [independent native N snapshot tests](contracts/test/FeeStrip.t.sol) |
| Delayed capture and independent NFT return | [capture](contracts/src/FeeStrip.sol#L228), [withdrawNFT](contracts/src/FeeStrip.sol#L237), [full local receipt evidence](docs/evidence/local-lifecycle.json) |
| Authenticated historical pool endpoint | [HistoricalFeeVerifier](contracts/src/proof/HistoricalFeeVerifier.sol#L42), [BlockHashCheckpoints](contracts/src/proof/BlockHashCheckpoints.sol), [retained public witness and native oracle](docs/evidence/proof.md) |
| Former-owner authorization bypasses and changing lifecycle state | [canonical permit/subscriber/multicall/unlock regressions](contracts/test/CustodyBypasses.t.sol), [dynamic lifecycle invariant](contracts/test/FeeStripLifecycleInvariant.t.sol) |
| Both USDC currency indices and native ETH as the other currency | [native-currency and reentrant-recipient test](contracts/test/NativeCurrency.t.sol) |

The code uses v4 PoolManager, PositionManager, StateLibrary and native actions. It does not claim a hook, Unichain deployment or Uniswap API integration. Local source pins are in [contracts/dependencies.json](contracts/dependencies.json): v4-periphery `dce236d4e2057422d0791d9a973a58765eb46f65` and its v4-core dependency `59d3ecf53afa9264a16bba0e38f4c5d2231f80bc`. Licenses remain with the vendored sources.

## What worked

A zero-liquidity `DECREASE_LIQUIDITY` followed by `TAKE_PAIR` let the escrow collect native fees while preserving NFT identity and liquidity. Reading the core position immediately afterward supplies an unambiguous cleared baseline. This removed the need to recreate native fee collection or let an intermediary adjust the position.

StateLibrary and canonical native collection made an independent oracle practical. Tests branch at N, collect through PositionManager, restore N, accrue later fees, then compare exact historical allocation with the earlier real balance delta. This catches errors that a second implementation of the same formula could miss. Native swap-generated fees and funded donations are both exercised; donations are disclosed as activity that can inflate historical income.

Current-owner authorization also held across the concrete paths tested. A genuine permit signature works before sale and fails after ownership moves to escrow. A seller's global operator approval remains valid for that seller without conferring authority over escrow assets. The unlocked-core regression establishes the correct execution context before asserting `NotApproved`, avoiding a misleading success caused only by a locked PoolManager.

## Specific documentation and tooling improvements

1. **Publish an existing-NFT escrow recipe.** Put core owner = PositionManager, salt = `bytes32(tokenId)`, full pool identity, zero-delta clearing and the just-cleared baseline in one example. Include both USDC currency indices and native ETH as the other currency. These facts are individually visible in source, but their combination determines whether an escrow sells old fees or future fees correctly.
2. **Provide a combined PositionManager/NFT integration interface.** `IPositionManager` does not expose all ERC721 methods used by custody integrations. We added [ICanonicalPositionManager](contracts/src/interfaces/ICanonicalPositionManager.sol) for `ownerOf`, `transferFrom` and `safeTransferFrom`. A maintained combined interface and permit/subscriber examples would reduce local interface composition and incomplete approval threat models.
3. **Document historical fee-state layout as a versioned interface.** A worked witness should include account-code binding, slot0's stored tick, selected global growth, lower/upper outside growth, wrapping subtraction and rounding. At a boundary, deriving tick again from square-root price can select the wrong branch. Make it explicit that a current lens value is not historical authentication and that pool donations participate in growth.
4. **Show source/compiler/deployment provenance together.** The pinned canonical PositionManager requires exactly Solidity 0.8.26; our Aqua market uses 0.8.30. Separate compilation graphs solve this, but a deployment-to-source/build manifest would make ABI compatibility and bytecode verification clearer. Our local source deployments and the existing public addresses are separately labeled; matching APIs alone is not a bytecode-equivalence claim.
5. **Include operational historical-proof guidance.** Our tested public Sepolia provider served tip proofs but rejected even tip-minus-one during probing. This is a provider observation, not a Uniswap defect. Subsequent qualification of the configured project RPC authenticated sampled historical proofs at offsets1,128,8191; see [qualification evidence](docs/evidence/project-rpc-qualification.json). Provider behavior must be qualified individually; a sampled success is not an availability guarantee. Integrators need durable witness retention as well as a block-hash checkpoint, with explicit failure handling for either missing artifact. A shared authenticated-growth cache may amortize work, but its first proof cost remains material.

## Measurements and limits

The [complete actual local lifecycle](docs/evidence/local-lifecycle.md) includes funded acceptance, an Aqua trade of the issued FeeClaim, delayed capture, NFT return before proof, real header/account/storage verification and separate holder payouts. In the recorded local fixture, N-native collection and proven sold income both equal **799,999,999 USDC base units**; late capture is **1,199,999,999**, residual USDC is **400,000,000**, and final floor dust is **2**. Complete local settlement used **1,425,145 transaction gas**, including intrinsic/calldata cost and excluding deployment.

The separately retained **public Sepolia data** witness for existing NFT #39005 reproduces native collection of **208 USDC base units** at N=11,682,191. Its proof-verification call measured **4,417,289 gas**, excluding transaction overhead. That tiny fee amount would not justify a standalone proof economically. This is a public-data/fork component experiment, not a public FeeStrip sale or settlement transaction. See [proof evidence](docs/evidence/proof.md) for canonical addresses, source attribution, exact commands and provider limits.

Fixed bands, variable fee income, proof cost and witness availability remain product constraints. The code has regression and independent agent-review evidence; it is not described as audited or production ready. The combined public-chain FeeStrip lifecycle and reliable public proving operation remain pending.

## Feedback submission status

The [official ETHOnline 2026 Uniswap page](https://ethglobal.com/events/ethonline2026/prizes/uniswap-foundation) requests public code, this file, README integration pointers and a completed [developer feedback form](https://developers.uniswap.org/hackathon-feedback) linking it. **The form has not been submitted.** Its current contents could not be inspected through the available web fetch; the required destination is confirmed by the official event page. A team member must review the feedback, confirm the final public URL and complete any external submission separately.
