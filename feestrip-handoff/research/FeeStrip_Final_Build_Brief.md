# FeeStrip: Final Build Brief

**Build a market for future fees from existing Uniswap positions.** An LP receives an agreed amount of USDC today; a buyer receives the selected position's native USDC fees over a defined period. The LP keeps the right to recover the same position. Fee claims can trade before redemption, and settlement does not require the seller's later approval.

The short pitch: **“Sell your Uniswap fees upfront. Keep your position.”** The essential qualification is that the NFT sits in a contract during the term, with its range and liquidity fixed. Keeping the position means retaining its economic ownership and return right, not keeping unrestricted control of the NFT in the original wallet.

## Final recommendation

Continue with FeeStrip, targeting **Uniswap, 1inch and The Graph**. Give the product three complete surfaces: sell future fees, evaluate and trade claims, and recover or redeem assets. The technical center is a transferable cashflow instrument backed by a specific existing NFT and an independently enforceable earning period. The pricing terminal makes that instrument understandable and purchasable.

This is a proposed build, not an implemented or audited protocol. The architecture has supporting source analysis and isolated executable evidence. Complete real-chain proof, custody, trading and redemption integration remains to be demonstrated.

## The correction that changes the pitch

**Selling LP fees while retaining principal rights has already been implemented publicly.** ScopeLift announced Fixed Fee Swap on March 11, 2026: a Uniswap v4 fee/principal separation proof of concept supported by the Uniswap Foundation. Its repository explicitly describes the code as unaudited and not production ready. No deployed adoption was confirmed here. The earlier six-project comparison missed this closer precedent. [ScopeLift announcement](https://scopelift.co/blog/liquidity-provider-fixed-fee-swap) · [Pinned Fixed Fee Swap repository](https://github.com/ScopeLift/fixed-fee-swap/tree/e29438ffd2805cb0c53f046d1e2a1a6137a20b85)

FeeStrip should therefore be presented as a specific advance: preserve an existing individual NFT, trade its fee claim directly for USDC, and enforce an exact historical cutoff even if settlement happens later. Add a serious market for judging and buying those claims. This is a defensible comparison with the reviewed code, not a claim that the combination is globally unprecedented.

**The strongest judging argument:** the team understood existing yield markets, identified precise differences in custody, transferable income and settlement, and built those differences into a working financial product. Source attribution strengthens that explanation.

<!-- pagebreak -->

# What the public code changes

ScopeLift's implementation is the closest precedent found. It accepts token deposits into an LP vault, issues fungible vault shares, then separates principal and yield by maturity. Its market trades principal against vault shares; a Zapper provides the yield-token route. FeeStrip's differences need to exist in code and the demo. [LPVault source](https://github.com/ScopeLift/fixed-fee-swap/blob/e29438ffd2805cb0c53f046d1e2a1a6137a20b85/src/LPVault.sol) · [FixedFeeSwapMarket source](https://github.com/ScopeLift/fixed-fee-swap/blob/e29438ffd2805cb0c53f046d1e2a1a6137a20b85/src/FixedFeeSwapMarket.sol) · [Zapper source](https://github.com/ScopeLift/fixed-fee-swap/blob/e29438ffd2805cb0c53f046d1e2a1a6137a20b85/src/Zapper.sol)

| Dimension | ScopeLift source | FeeStrip proposal |
|---|---|---|
| Backing | Fungible shares of vault-managed positions | One existing canonical PositionManager NFT, returned with the same ID |
| Fee ownership on transfer | Previously indexed income stays with the old holder | All unpaid income from the sold period travels with the claim |
| End of earning | Timestamp and collection/checkpoint lifecycle | Exact end-of-block N, authenticated from historical state |
| Principal exit | Redeem shares and withdraw underlying currencies | Capture fees, then release the original NFT before the maturity proof arrives |
| Trading | Principal/vault-share market with a yield Zapper | Direct fee-claim/USDC Aqua app with SwapVM execution |

Static ranges, ERC20 yield rights and pre-maturity recombination are also prior art. Hookless compatibility alone is not new: the vault's underlying pool and its market hook are separate components. [FixedFeeSwap issuance and redemption](https://github.com/ScopeLift/fixed-fee-swap/blob/e29438ffd2805cb0c53f046d1e2a1a6137a20b85/src/FixedFeeSwap.sol) · [YieldToken accounting](https://github.com/ScopeLift/fixed-fee-swap/blob/e29438ffd2805cb0c53f046d1e2a1a6137a20b85/src/YieldToken.sol)

## Reuse decision

Borrow interfaces, useful fixtures and fee-growth accounting references, retaining applicable notices. Rewrite custody, claim-transfer economics and settlement. ScopeLift's first post-maturity redemption closes further fee collection for YT; later YT claim paths reach that closed-collection check. This source-level lifecycle does not supply FeeStrip's required independent, persistent claim redemption. It is not an exploit finding or evidence of deployed losses.

Retain the previous review's lessons: funded atomic activation from Resonate; explicit complementary rights from Timeless; exact NFT permissions from Revert; adapters and series boundaries from Pendle; previews from Spectra; coordinated issuance and sale from Flashstake. Their detailed pins and evidence remain in the companion competitor review. None supplies a ready-made implementation of the final combination.

The contribution to publish separately is an **existing-position fee escrow and settlement adapter**, plus reusable v4 market-data extraction. That gives judges concrete infrastructure to inspect alongside the application.

<!-- pagebreak -->

# A market people can understand

## Why either side participates

The seller is an LP who already intends to retain a compatible position for the chosen period. Selling its USDC fee leg gives that LP an upfront cash amount and transfers uncertainty about that income to a buyer. There is no loan balance or FeeStrip liquidation. The LP still bears changes in the position's asset value and gives up the ability to rebalance during the sold period.

The buyer wants exposure to the position's fee income and believes it is worth more than the purchase price. The buyer does not have to fund or manage the underlying LP principal. This still carries substantial risk: being out of range, reduced volume, competing liquidity, manipulation of apparent historical activity and protocol failures can undermine the purchase.

Illustration only: a buyer pays 800 USDC for the entire fee period. If that period earns 1,200 USDC, the buyer gains 400 before costs; if it earns 500, the buyer loses 300. The seller receives the agreed 800 either way and retains the return right to the LP position. These are example outcomes, not forecasts or market quotes.

## Let bids determine the price

FeeStrip does not need to know future fees to sell them. A buyer or maker quotes a price; the LP chooses whether to accept it. The protocol enforces what was sold. The application supplies evidence for the pricing decision.

The initial sale should be a **funded offer for a precise NFT and term**. Acceptance validates the position, clears old fees, records the baseline, takes custody, issues rights and pays the LP atomically. A failed payment or validation leaves no activated sale. Listing a draft offer should not lock the NFT. A partial sale can allocate unsold claims to the LP, with the same fixed original supply and earning window.

## The buyer terminal

Show the executable price, original claim supply, fraction purchased, exact ending block, approximate calendar time, frozen range, pool activity, available quotes and settlement status. Model downside explicitly rather than publishing one implied guaranteed APR.

For a fraction q/Q bought for P USDC, gross full-series break-even is **P × Q/q**. Buying 10% for 80 USDC requires 800 USDC of total period income to break even before costs. If indicative period accrual is 400, a further 400 is needed. Keep transaction and proof costs visible separately.

Compare ranges using time or block occupancy, sustained out-of-range periods and changing active liquidity. Once series have settled, compare estimates with the actual contract-finalized payouts. Sparse history must remain visibly sparse. One maker's shared capital can quote multiple series through Aqua, but unique NFTs still create fragmented instruments and uncertain resale liquidity. Aqua does not create buyer demand.

<!-- pagebreak -->

# The onchain agreement

## Fixed terms and separate rights

Initially accept nonempty, hookless canonical Uniswap v4 PositionManager NFTs with a native USDC pool currency. Sell only that USDC fee leg; the other currency's fees belong to the residual owner. There is no implicit swap of all fees into dollars. The canonical pool, managers, token ID, range, liquidity, baseline, ending block N and original claim supply Q are fixed at activation. [Uniswap StateLibrary](https://github.com/Uniswap/v4-core/blob/46c6834698c48bc4a463a86d8420f4eb1d7f3b75/src/libraries/StateLibrary.sol)

The residual receipt records the NFT return right, other-currency fees and USDC outside the sold window. The ERC20 claim represents a share of the entire sold period's unpaid USDC income; any unsold portion belongs to the LP through retained claims. Transfers carry that income; maturity does not erase balances. No late minting, unrestricted holder burning, liquidity modification or fee collection is allowed during the active term. The core position owner is the canonical PositionManager and its salt is derived from tokenId; it is not the escrow or depositor address.

## Four actions with independent outcomes

| Action | Required result |
|---|---|
| Activate | Clear pre-sale fees to the LP, establish the baseline, escrow the NFT, issue fixed rights and settle the funded sale atomically |
| Capture after N | Collect actual native fees, record balance deltas, reserve all USDC pending allocation and enable NFT withdrawal |
| Prove and allocate | Authenticate block N and relevant pool storage; assign only the sold period's income to claims and the remainder to the residual beneficiary |
| Redeem | Consume claims and pay their share of the finalized USDC reserve without the original seller's approval |

The NFT can be withdrawn after capture without waiting for proof. A separate withdrawal avoids a recipient callback blocking other holders' settlement. Withdrawing the NFT must preserve the recorded beneficiary of unresolved residual USDC. Reserve funds never become maker inventory or a general administrator sweep balance.

## Exact endpoint, including late settlement

Use Uniswap's fee-growth-inside arithmetic with fixed L: **F_N = floor(L × ((insideGrowth_N - baseline) mod 2^256) / 2^128)**. Bind the proof to the correct manager, storage layout, pool, boundary ticks and block. Use the stored pool tick. Fee growth includes funded pool donations; direct transfers to the escrow do not increase entitlement.

A historical account/storage witness must be authenticated against the selected header's state root. EIP-2935 serves an 8,191-block history window where deployed; it is not permanent witness storage. Preserve a durable block-hash checkpoint and collect proof data separately. Ordinary BLOCKHASH has a shorter window. [EIP-1186](https://eips.ethereum.org/EIPS/eip-1186) · [EIP-2935](https://eips.ethereum.org/EIPS/eip-2935)

Anyone may submit valid settlement evidence. Missing evidence can delay reserve allocation; it must never allow a timeout transfer of unresolved buyer funds to the seller. Before maturity and before payouts, the residual owner can recombine only by acquiring and burning the entire original Q, ending the series and recovering the NFT. Willing counterparties are required.

<!-- pagebreak -->

# Execution and market data

## Uniswap creates the income; 1inch trades the claim

These integrations serve different transactions. Uniswap remains the venue where the underlying position earns fees. FeeStrip's Aqua app trades the separately issued income claim against USDC. It does not require routing an ordinary swap through two competing interfaces.

Build an actual claim market on official Aqua/SwapVM infrastructure. Bind each strategy to the canonical series, assets, quantity limits and expiry, and enforce minimum output and callback context. Makers allocate trading balances through Aqua; tokens remain in their wallets until execution. Virtual allocations are not locked reserves, and cross-series availability cannot be summed as independent funded capital. [Aqua architecture](https://github.com/1inch/aqua)

Use SwapVM's programmable execution and a constrained price reader for series state and maker valuation. Separate accrued income from the maker's estimate of remaining income and inventory spread. After N, accrued claim value does not decay to zero. Claims remain economically valid through proof delays. The exact quote program, authorization mode and SDK encoding must match the deployed runtime. [SwapVM source](https://github.com/1inch/swap-vm)

## The Graph answers the pricing question

Compose **a reusable Uniswap v4 Substreams pipeline with a live FeeStrip Subgraph**. The stream supplies market history; the subgraph supplies immutable terms, lifecycle events and finalized payouts. Join them by chain, manager, pool and block window to produce the buyer's break-even and range-risk report.

StreamingFast already publishes a v4 module for Ethereum and Sepolia. The inspected package decodes swaps, liquidity changes and NFT events, but does not provide fee-growth state and defers donation/protocol-fee events. Its existing walkthrough targets SQL; a turnkey v4 Substreams-to-Studio adapter was not verified. Consume the live stream into a database and compose its results with the Studio subgraph at the application layer. [Pinned v4 Substreams module](https://github.com/streamingfast/substreams-chain-modules/tree/d054c303c1e39e3a1c9da8296ac0a4bff7110233/dex/uniswap-v4-substreams)

Do not label volume × fee × current liquidity share as exact position income. Tick crossings and historical liquidity matter. Graph-powered scenarios are estimates; the escrow/verifier supplies authoritative payout. Current accrual can come from a pinned onchain read layer, clearly distinguished from finalized redeemable cash.

Publish the context module so another application can reuse it for a different pool or supported chain. Demonstrate a live joined result that neither feed supplies alone, with source blocks and indexing lag. Provider authentication and a running Studio deployment are required. [Graph Market access](https://thegraph.com/docs/en/substreams/providers/the-graph-market/) · [Studio deployment guide](https://thegraph.com/docs/en/subgraphs/quick-start/)

An advanced measured-fee-history module can index committed storage changes from extended Ethereum blocks, with bootstrap, ordinal, reorg and reverted-call handling. That is additional work, not an existing capability of the v4 event module. It should be validated before replacing labeled estimates.

<!-- pagebreak -->

# Three partners, coherent evidence

The supplied submission rules permit three partner selections; multiple tracks from one partner occupy one slot. Retaining Uniswap and 1inch leaves **one additional partner**, not two. The following is the recommended net-new build selection, based on official ETHOnline 2026 pages checked September 11.

| Partner and track | Available pool / awards | FeeStrip contribution and required evidence |
|---|---|---|
| Uniswap: Best Uniswap Stack Contribution | 3,000 USD total; up to three awards of 1,000 | Existing v4 NFT adapter and fee accounting. Public source, precise integration pointers, FEEDBACK.md and completed developer feedback form. |
| 1inch: Build an Aqua App | 5,000 USD total; 2,500 / 1,500 / 1,000 | Custom claim/USDC Aqua market. Use official contracts; SwapVM scores higher. Show actual token transfers and real commit history; a local fork is accepted. |
| The Graph: Best Use of Composable or Standardized Graph Products | 5,000 USD total; 2,500 / 1,500 / 1,000 | Live Substreams plus FeeStrip Subgraph, joined into useful buyer analysis. Public source and demo. A single ordinary subgraph or static chart does not qualify. |

[Uniswap prize requirements](https://ethglobal.com/events/ethonline2026/prizes/uniswap-foundation) · [1inch prize requirements](https://ethglobal.com/events/ethonline2026/prizes/1inch) · [The Graph prize requirements](https://ethglobal.com/events/ethonline2026/prizes/the-graph)

These are track pools and award sizes, not a prediction of winnings. Separate continuity awards are excluded. The build's actual provenance determines its track; transparent use of public dependencies does not justify describing an existing project as entirely new.

## Privy is the strongest alternative third partner

If the product instead centers business treasury buyers, Privy's **Best B2B financial product** and **Best financial flow** each offer 2,500 USD. A real treasury wallet with a restricted operator buying claims and redeeming USDC could support both submissions within one partner slot. Actual controls and financial execution are required; simultaneous awards are not promised. [Privy prize requirements](https://ethglobal.com/events/ethonline2026/prizes/privy)

The substantive implementation would constrain the operator's chain, router, function, recipient and per-trade amount. An onchain router should enforce any strict cumulative budget: Privy's stateful policy documentation warns of concurrency lag. Quorum access is unnecessary for this design. [Privy Ethereum policies](https://docs.privy.io/controls/policies/example-policies/ethereum) · [Privy stateful policy limits](https://docs.privy.io/controls/policies/stateful-policies)

For the selected product, buyer valuation is more central than wallet administration, so choose The Graph. Chainlink's fresh confidentiality track would need genuine private maker inputs and a confidential CRE handler; ordinary automation is insufficient. ENSv2, Ledger's agent stack and the other ecosystem tracks require additional product goals. Keep them outside the final core.

<!-- pagebreak -->

# The application and judging demo

## Three polished views

| View | What appears immediately | What the user can do |
|---|---|---|
| Markets | Tradable claims, executable bids/asks, term, underlying range, liquidity and settlement state | Compare claims, inspect downside and trade |
| Position | Original NFT identity, range, liquidity, cash offer, sold fee leg and exact return conditions | Accept a funded offer; later recover the NFT or recombine all rights |
| Claim detail | Purchase cost, whole-period income entitlement, break-even, history, modeled scenarios, captured reserve and proof status | Buy or sell fractions; redeem finalized income |

Use a professional trading layout with clear typography, restrained color and dense but readable data. Let judges explore real seeded testnet series before connecting a wallet. Label the network and any simulated data. Show the same NFT ID before and after custody, and link real transactions beside balance changes.

The hero interaction turns one selected NFT into two visible rights: **the position return receipt** and **the fee claim**. A second interaction transfers part of the claim and its unpaid income to another wallet. The final interaction reconciles all income at maturity. Animation should explain those changes, not disguise contract waiting or substitute for execution.

## A 3 minute 40 second narrative

| Time | Demonstration | What it proves |
|---|---|---|
| 0:00-0:20 | State the cashflow problem and show an existing NFT | The premise is understandable immediately |
| 0:20-0:55 | Accept a funded offer; show USDC received and retained return right | Actual upfront financing and custody |
| 0:55-1:35 | Buyer compares range risk and break-even, then trades a claim through Aqua | The Graph helps a decision; 1inch executes the market |
| 1:35-2:10 | Show swaps before and after N and transfer a claim fraction | Real income, exact term and transferable ownership |
| 2:10-2:55 | Capture fees late, return the same NFT, then verify the N endpoint | Principal release and historical allocation are separate |
| 2:55-3:25 | Buyer redeems while seller wallet is disconnected | Payment needs no fresh seller approval |
| 3:25-3:40 | Show transaction evidence and state the contribution beyond ScopeLift | Honest originality backed by working contracts |

Prepare separate evidence for invalid proofs, lack of seller authority after sale and all-rights early closure. Keep the main video focused on one financial lifecycle. A forked demonstration can shorten the block window, but must be labeled; The Graph still requires live provider data. The 2-4 minute video, human narration and minimum 720p requirements come from the supplied submission guidance.

<!-- pagebreak -->

# Build handoff and acceptance gates

## Implementation boundaries

Use Solidity and Foundry for contracts and invariants; TypeScript/viem and React for execution and the interface; Rust/WASM Substreams plus a database and Studio subgraph for market context. Keep the series factory, NFT custody adapter, claim/residual rights, reserve accounting, checkpoint/verifier, Aqua execution and read model distinct.

Use canonical Ethereum Sepolia v4 contracts for the intended persistent public demonstration, plus a pinned Ethereum fork for reproducible adverse scenarios. Pin chain addresses, code hashes and compiler settings before integration. The official deployment table is authoritative for canonical v4 addresses; it does not establish Aqua/SwapVM availability or proof-provider retention on every chain. [Uniswap deployment registry](https://developers.uniswap.org/docs/protocols/v4/deployments)

The earlier source pass found a concrete SwapVM/SDK opcode mismatch. Use one explicitly compatible runtime and encoder, with program/hash/quote fixtures; do not combine latest packages by assumption. [Pinned contract opcodes](https://github.com/1inch/swap-vm/blob/afd99c408b4ed610027f4426c6f98650acac9f5f/contracts/libs/OpcodeList.sol) · [Pinned SDK instruction table](https://github.com/1inch/sdks/blob/cc4b8c7c646beed8e3dfb2e39597d27f337ea4a7/typescript/swap-vm/src/swap-vm/instructions/index.ts)

## What must pass before calling the project complete

| Gate | Concrete acceptance evidence |
|---|---|
| Genuine historical settlement | Capture a real header/account/storage witness at N; compare its computed entitlement with a native collection from the same N snapshot; reject changed pool, block and proof |
| Rights and reserve conservation | Old fees go to the LP; range/L stay fixed; late fees remain residual; transferred claims redeem correctly; NFT return cannot erase outstanding liabilities; total payouts never exceed allocated reserve |
| Real trading | Funded activation is atomic; Aqua transfers both assets; stale encodings, depleted maker balances, reentry and maturity transitions fail safely or settle correctly |
| Live buyer analysis | Two live Graph products produce one useful, reproducible underwriting result, with block freshness and estimates labeled accurately |
| Economic viability | Obtain seller reservation prices and funded buyer quotes for the same terms; measure full transaction/proof costs and the value lost by freezing the position |

Prior evidence includes eight native Uniswap library tests, nine synthetic verifier Solidity tests and separate model checks. The competitor pass added nine isolated upstream-contract tests. These validate components, not the combined system. ScopeLift tests were inspected, not run. A genuine public-chain FeeStrip proof has not yet been validated.

One synthetic account-plus-four-slot verification used **1,212,180 gas**, excluding header authentication and full settlement. Real proof sizes and costs can differ. Cache authenticated endpoints across compatible series; measure the real complete flow before calling it economical. A generic archive endpoint may retain historical state without serving the needed historical trie proofs. [Geth archive documentation](https://geth.ethereum.org/docs/fundamentals/archive)

The remaining work is implementation and customer-price validation. If the economics fail because fixed ranges or proof costs overwhelm sale value, adjust the instrument or target position size explicitly. Do not conceal that problem with yield promises. The final research recommendation is to build this specific market and test those gates, with its precedents and limitations stated clearly.


## Sources

Evidence cutoff: 11 September 2026. Linked source pins identify the reviewed versions. Product architecture and partner ranking are recommendations. The earlier component tests do not establish a deployed, audited or economically validated FeeStrip system. ScopeLift tests were read, not executed.

1. [ScopeLift announcement](https://scopelift.co/blog/liquidity-provider-fixed-fee-swap)
2. [Pinned Fixed Fee Swap repository](https://github.com/ScopeLift/fixed-fee-swap/tree/e29438ffd2805cb0c53f046d1e2a1a6137a20b85)
3. [LPVault source](https://github.com/ScopeLift/fixed-fee-swap/blob/e29438ffd2805cb0c53f046d1e2a1a6137a20b85/src/LPVault.sol)
4. [FixedFeeSwapMarket source](https://github.com/ScopeLift/fixed-fee-swap/blob/e29438ffd2805cb0c53f046d1e2a1a6137a20b85/src/FixedFeeSwapMarket.sol)
5. [Zapper source](https://github.com/ScopeLift/fixed-fee-swap/blob/e29438ffd2805cb0c53f046d1e2a1a6137a20b85/src/Zapper.sol)
6. [FixedFeeSwap issuance and redemption](https://github.com/ScopeLift/fixed-fee-swap/blob/e29438ffd2805cb0c53f046d1e2a1a6137a20b85/src/FixedFeeSwap.sol)
7. [YieldToken accounting](https://github.com/ScopeLift/fixed-fee-swap/blob/e29438ffd2805cb0c53f046d1e2a1a6137a20b85/src/YieldToken.sol)
8. [Uniswap StateLibrary](https://github.com/Uniswap/v4-core/blob/46c6834698c48bc4a463a86d8420f4eb1d7f3b75/src/libraries/StateLibrary.sol)
9. [EIP-1186](https://eips.ethereum.org/EIPS/eip-1186)
10. [EIP-2935](https://eips.ethereum.org/EIPS/eip-2935)
11. [Aqua architecture](https://github.com/1inch/aqua)
12. [SwapVM source](https://github.com/1inch/swap-vm)
13. [Pinned v4 Substreams module](https://github.com/streamingfast/substreams-chain-modules/tree/d054c303c1e39e3a1c9da8296ac0a4bff7110233/dex/uniswap-v4-substreams)
14. [Graph Market access](https://thegraph.com/docs/en/substreams/providers/the-graph-market/)
15. [Studio deployment guide](https://thegraph.com/docs/en/subgraphs/quick-start/)
16. [Uniswap prize requirements](https://ethglobal.com/events/ethonline2026/prizes/uniswap-foundation)
17. [1inch prize requirements](https://ethglobal.com/events/ethonline2026/prizes/1inch)
18. [The Graph prize requirements](https://ethglobal.com/events/ethonline2026/prizes/the-graph)
19. [Privy prize requirements](https://ethglobal.com/events/ethonline2026/prizes/privy)
20. [Privy Ethereum policies](https://docs.privy.io/controls/policies/example-policies/ethereum)
21. [Privy stateful policy limits](https://docs.privy.io/controls/policies/stateful-policies)
22. [Uniswap deployment registry](https://developers.uniswap.org/docs/protocols/v4/deployments)
23. [Pinned contract opcodes](https://github.com/1inch/swap-vm/blob/afd99c408b4ed610027f4426c6f98650acac9f5f/contracts/libs/OpcodeList.sol)
24. [Pinned SDK instruction table](https://github.com/1inch/sdks/blob/cc4b8c7c646beed8e3dfb2e39597d27f337ea4a7/typescript/swap-vm/src/swap-vm/instructions/index.ts)
25. [Geth archive documentation](https://geth.ethereum.org/docs/fundamentals/archive)
