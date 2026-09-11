# FeeStrip: competitor code review

Reviewed 11 September 2026. This is a focused source review of issuance, ownership, custody, accounting, trading and exits. Contracts and selected public tests were inspected at the commits listed below. Nine isolated tests against selected upstream contracts and five Python semantic checks were also run; no complete upstream test suite was executed, and deployed bytecode was not matched to these repositories. These findings are architectural evidence, not a security audit.

## Final research update: a closer precedent

The final pass identified **ScopeLift Fixed Fee Swap**, a closer direct precedent than the six projects reviewed below. ScopeLift announced this Uniswap v4 LP fee/principal separation proof of concept on March 11, 2026. The [pinned repository](https://github.com/ScopeLift/fixed-fee-swap/tree/e29438ffd2805cb0c53f046d1e2a1a6137a20b85) describes it as unaudited and not production ready; the [official announcement](https://scopelift.co/blog/liquidity-provider-fixed-fee-swap) credits Uniswap Foundation support. The earlier review missed it. Its source and selected tests were inspected in the final pass, but its tests were not run and deployed adoption was not confirmed.

Its LPVault accepts pool currencies and issues fungible vault shares. Those shares split into principal and yield tokens by maturity, with pre-maturity recombination already implemented. Its market trades principal against vault shares; a Zapper provides indirect yield-token trading. Its YT accounting leaves previously indexed income with the prior holder on transfer. Static ranges, fee/principal separation, ERC20 fee rights, recombination and hookless underlying-pool compatibility should therefore not be claimed as FeeStrip inventions.

The specific FeeStrip distinction is preserving and returning an **existing individual canonical NFT**, issuing **whole-period claims that carry unpaid accrued income**, enforcing an **exact historical block-N cutoff**, releasing the NFT **after capture but before proof**, and trading those claims **directly against USDC through Aqua/SwapVM**. This is a comparison against reviewed source, not a worldwide first-ever claim.

Do not port ScopeLift's custody or yield-token accounting unchanged. Its first post-maturity redemption closes further fee collection for YT, and later YT claim paths reach that closed-collection check; this does not provide FeeStrip's required independent reserve-backed redemption after NFT release. This is a source control-flow observation, not an audit or exploit finding. The final build brief documents the replacement lifecycle and selected bounty integrations. The six-project findings and historical test evidence below remain useful as component-level references.

## Recommendation

Build FeeStrip around a dedicated Uniswap fee-settlement core, using established patterns for everything around it: atomic financing from Resonate, explicit ownership rights from Timeless, strict NFT custody from Revert, series factories and adapters from Pendle, transaction previews from Spectra, and straightforward token composition from Flashstake.

The product remains: **sell a defined period of your Uniswap position's fees for cash today, while keeping the right to recover the position.** The proposed backing is a nonempty, hookless, canonical Uniswap v4 PositionManager NFT. For the initial USDC-denominated series, the buyer receives the native USDC fee leg. The other token's fees remain with the LP. There is no promised conversion of all revenue into dollars, guaranteed return, or protection against changes in the LP position's value.

The code pass supports that direction and suggests a useful extension: **reacquire every fee claim, close the fee series early and recover the original NFT**. This is voluntary recombination of all ownership rights. It requires willing sellers or retained claims; it is not guaranteed buyback liquidity.

## What to borrow from each project

| Project | Strongest source-level lesson | FeeStrip application | Important difference |
|---|---|---|---|
| Pendle | Separate asset adapters from token issuance; validate exact pool/range before combining liquidity | Canonical position validation, immutable series identity, a narrow v4 adapter | Its yield tokens credit prior holders for previously earned income; some adapters merge NFTs |
| Spectra | Explicit maturity state, preview functions, minimum-output checks and separate yield bookkeeping | Accurate quotes, transaction simulation, explicit settlement states and versioned events | Its YT ceases normal transferability at expiry; FeeStrip's unredeemed claims must survive |
| Resonate | Match a funded upfront payment with locked capital and separate principal/income receipts | An accepted offer locks the NFT and pays the LP atomically; preserve income liability when collateral exits | ERC4626 capital and Revest FNFT infrastructure differ from one canonical v4 NFT |
| Flashstake | Compose deposit, receipt issuance and upfront yield realization in one transaction | A single user action with a minimum cash output; standard ERC20/permit plumbing | Shared, time-weighted fTokens do not represent a fixed position's exact fee window |
| Timeless | Issue complementary rights and require both for ordinary collateral redemption | A residual position receipt plus fee claims; all-rights early closure | Perpetual vault yield and per-user dividends differ from whole-period fee claims |
| Revert Lend | Bind permissions to the exact NFT; handle replacement approvals and failed recipient callbacks | Restrictive custody, typed callbacks, independent withdrawal after fee capture | It is a v3 lending and position-management system, not a ready-made v4 fee-sale vault |

## 1. Pendle: the closest adapter precedent

There is a more relevant example than generic staking yield in Pendle's public source. `PendleKyberElasticSYUpg` exposes `depositNft` and `withdrawNft`. Its manager validates the canonical pool and exact lower/upper ticks, converts liquidity into shares, and can merge deposited NFTs. Fee/reward collection is exposed through the standardized-yield layer. This is concrete precedent for putting concentrated-liquidity NFT economics behind fungible yield instruments. It does not establish that this particular adapter is currently deployed or has active liquidity. [Kyber SY][pk] · [Kyber NFT manager][pkm]

**Adopt:** validate the position's actual onchain configuration, not user-supplied metadata. Bind every FeeStrip series to chain, canonical managers, pool, position identity, range, liquidity, fee currency, activation and maturity, with an explicit implementation version. If pooling positions later, require deliberate cohort rules; the same token pair does not make different fee windows or ranges interchangeable.

**Keep our different ownership rule:** `PendleYieldToken._beforeTokenTransfer` updates and distributes rewards/interest for both accounts before balances change. Previously earned income remains credited to the seller. FeeStrip's proposed token instead carries its share of all unredeemed fees in the specified period. Copying Pendle's transfer hooks would silently change that promise. [Yield token][pyt] · [Interest manager][pinterest]

**Keep our different cutoff:** `_setPostExpiryData` snapshots the current index when the post-expiry path first runs. It does not authenticate the historical state of our chosen maturity block. FeeStrip needs its own historical cutoff even if a keeper arrives later. [Yield token][pyt]

**Do not carry over the NFT merger or market math unchanged.** A merger changes the promise of returning the same position. Pendle's market trades its own principal-token/standardized-yield relationship, with expiry-dependent math and router composition. FeeStrip claims have a different payout. The useful separation is adapter → issued asset → market, not an assumption that Pendle's curve prices our asset. [Market math][pmath] · [YT router][prouter]

In particular, a FeeStrip claim does not become worthless when earning ends: its accumulated unpaid income remains attached. A maker quote should distinguish the accrued component from expected remaining fees, inventory costs and uncertainty. Those estimates price a trade; they do not determine settlement.

The two inspected Pendle public trees did not expose a test suite. The inspected ChainSecurity report covers older named commits and specific components; it does not establish coverage for all current markets or derived adapters. Port the design lessons, then test FeeStrip's different semantics directly. [Report][paudit]

## 2. Spectra: lifecycle and integration discipline

Spectra's principal-token code provides paired issuance, separate principal/yield recipients, previews, minimum-output variants and maturity-aware redemption. These are valuable product interfaces: a transaction can say exactly what the user receives and revert if execution falls outside that bound. [Principal token][spt]

**Adopt:** a FeeStrip read layer should expose the exact series terms, backing NFT, original claim supply, sale proceeds, accrued fee estimate, captured reserve, proof status and currently redeemable amount. Quote and execute through the same calculations. Do not label an estimate as already withdrawable money.

**Keep claim ownership explicit:** `YieldToken.transfer` and `transferFrom` invoke `beforeYtTransfer`, which checkpoints yield for the two users. After expiry, the normal `balanceOf`/`totalSupply` view returns zero and nonzero transfers are rejected. That makes sense for Spectra's model, where prior earnings are separately recorded. FeeStrip must retain ordinary balances and transferability through maturity and proof delays because those tokens remain the redemption rights. [Yield token][syt]

**Keep historical proof separate:** `storeRatesAtExpiry` uses the current vault conversion state on the first relevant post-expiry call. This is not FeeStrip's exact-block settlement mechanism. Spectra also handles negative vault yield and principal-rate adjustment; that should not be copied into native Uniswap fee accounting merely because both products use the word yield. [Principal token][spt] · [Yield calculations][smath]

The review also found an integration warning worth acting on: the inspected current core emits a two-field `FeeClaimed` event, while the inspected subgraph still references the older `receivedAssets` field. This is a source-version mismatch, not evidence that the production app is broken. It means we should generate FeeStrip's frontend types and indexer bindings from the exact deployment ABI and record implementation versions with addresses. [Current event][spt] · [Subgraph][ssub]

The current public core is a sanitized release with tests omitted. The older public repository contains useful tests, but they are not a substitute for a current suite. The public diamond router is also a framework release; do not treat README examples or audit PDFs as proof that every bridge/preview component is present in the published source. [Current core README][sread] · [Router source][srouter] · [Older tests][stests]

## 3. Resonate: the strongest financing model to study

`Resonate.sol` builds pools with explicit asset/vault, rate, duration or return-condition, and packet-size terms. `submitConsumer` and `submitProducer` feed matching queues; `_activateCapital` processes the upfront payment and creates principal/income FNFT rights. The core mechanism aligns closely with the seller exchanging future income for cash now. [Resonate core][res]

**Adopt atomic activation.** A draft offer should not immobilize the LP position. Acceptance must bind the exact NFT and terms, confirm buyer funding, take custody, clear pre-sale fees, establish the baseline, issue rights and deliver the seller's minimum proceeds in one reverting transaction. The precise external-call order needs reentrancy-safe implementation; the economic result must be all-or-nothing.

**Adopt separate exit liabilities.** Resonate's withdrawal handling records residual interest when principal is reclaimed before income rights are exhausted. The general lesson is that returning capital cannot erase someone else's income entitlement. For FeeStrip, collect and reserve fees before returning the NFT, then preserve the buyer reserve and the LP's unresolved surplus until the maturity proof allocates them. [Withdrawal and residual handling][res]

There is an important implementation difference: Resonate's residuals are still vault shares. In an isolated test, 100 units of yield left after principal withdrawal became a 110-unit payout after another 10 units accrued. FeeStrip should retain collected currency, with the fixed period entitlement allocated separately, so delayed redemption does not silently extend the sold earning window. [Wallet][reswallet]

**Do not import the whole Revest stack just to obtain two receipts.** FeeStrip can represent the unique residual position right with an ERC721 receipt and the period's fee rights with an ERC20. The receipt is a claim to the NFT and designated residual assets; it is not a fixed-dollar principal token. Transfer semantics and post-withdrawal residual beneficiaries must be specified.

Resonate's packetized queues are useful market-design inspiration. FeeStrip can begin economically with an exact funded offer and a clear fill quantity, while preserving a path to standardized series and larger matching markets. Pooled queue balances must never be treated as interchangeable with a specific series' redemption reserve.

## 4. Flashstake: useful transaction composition, different economics

The official Flashstake documentation source links `BlockzeroLabs/flashv3-contracts`. Its protocol and strategy contracts show how stake creation, fToken issuance and immediate yield realization can be composed. The fToken contract itself is a small combination of standard ERC20, permit, burn and restricted minting components. [Protocol][flash] · [Aave strategy][fstrategy] · [fToken][ftoken]

The upfront cash in this implementation comes from current pooled strategy yield, rather than a newly matched buyer. With no available yield, immediate monetization fails. FeeStrip instead needs a funded purchaser or maker willing to pay for its issued claim.

**Adopt:** a single coordinated action, meaningful minimum-output checks, and standard token components. The user should approve clear economic terms and see one successful financing transaction. A complicated internal protocol should not require a sequence of manual contract calls in the interface.

The minimum must come from the user. Flashstake's PeckShield report describes an earlier version that computed its minimum from the execution-time quote, making the check ineffective against front-running. The reviewed source takes a caller-supplied minimum. FeeStrip should carry the LP's minimum **net** USDC proceeds, exact sale quantity, recipients and deadline through the entire signed operation. An NFT approval alone must not authorize someone else to choose the sale terms. [PeckShield report][faudit] · [Current protocol][flash]

**Change the token authority for FeeStrip.** Its original claim supply must be fixed at activation. Only defined redemption or complete-rights closure should burn claims. Do not blindly inherit unrestricted holder burning or an ongoing owner mint function: both require additional accounting rules when the payout denominator and outstanding rights are fixed.

**Do not import shared fToken economics.** Time-weighted issuance across stakes and live pooled yield redemption do not prove ownership of one position's fees between two fixed boundaries. Similarly, an early exit based on a time formula is not equivalent to buying back every right previously sold.

The public integration tests include early-unstake and edge-case scenarios. Borrow those user sequences and failure cases, while replacing the expected payouts with FeeStrip's fee-window and rights-conservation rules. [Public tests][ftests]

## 5. Timeless: complementary rights and clean adapter boundaries

`Gate._enter` issues matching principal-like and perpetual-yield rights. `_exit` burns both before ordinary collateral withdrawal. This is the cleanest source example for the proposed **recombine and unlock** operation. FeeStrip's proposed version is pre-maturity and before any redemption: the caller must hold the residual receipt plus the entire original claim supply Q. Burn the rights and mark the series terminal before external collection/delivery, extinguish its remaining fee window, collect the fees for that owner and recover the original NFT. No third-party claim may survive that operation. [Gate][tgate]

`Factory` uses deterministic deployment for token pairs. A FeeStrip factory can similarly derive addresses from fully specified series terms and publish them through a canonical registry. Predictable addresses are useful for quotes and indexing, but do not by themselves certify a trustworthy asset. [Factory][tfactory]

`ERC4626Gate._depositIntoVault` grants a bounded allowance and clears leftovers after the call. That is a useful authority boundary for any FeeStrip router/adapter interaction. Its conversion functions also make rounding direction explicit. These patterns transfer; the underlying vault-share math does not measure Uniswap fees. [ERC4626 adapter][tadapter]

Timeless also checkpoints accrued yield before token transfers. Its tests explicitly verify that the previous holder can still claim those earnings. Reuse that test scenario with FeeStrip's different expected result: transfer the whole claim and the recipient receives the period's unredeemed income. Its self-transfer tests are also useful; the token source explains why cached balance writes need special handling. A maintained standard ERC20 avoids creating that custom transfer surface in FeeStrip. [Yield token][tyt] · [Tests][ttests]

Do not copy the owner-selected emergency redemption price into FeeStrip. Its sold cashflow should be allocated by the agreed rules and authenticated evidence. Any pause or recovery capability needs a narrow purpose and must preserve outstanding liabilities. The reviewed Timeless implementation is from 2022; it supplies historical design evidence, not proof of current adoption.

## 6. Revert Lend: custody lessons backed by regression cases

Revert separates the actual NFT custodian from its recorded economic owner. Its vault can temporarily authorize transformers and validate the result. That is useful reading for position custody, but FeeStrip's active term should allow much less: range, liquidity and fee checkpoint must remain unchanged. [V3 vault][rvault]

**Bind every operation to the exact position.** `Transformer._validateCaller` checks that a vault-originated request's inner token ID equals the vault's `transformedTokenId`. An audited historical failure involved checking one position at the vault boundary while arbitrary downstream calldata acted on another. An allowlisted contract address alone is therefore insufficient. FeeStrip callbacks must bind canonical sender, position ID, series, action and phase. [Transformer][rtransform] · [Vault integration tests][rtests]

**Clean up authority around replacements.** The latest reviewed commit specifically addresses AutoRange approvals around replaced vault-owned NFTs. FeeStrip's unchanged-NFT promise avoids that replacement path, but it still needs tests proving no stale approval or callback can collect sold fees, remove liquidity or operate after withdrawal. [Fix commit][rfix]

**Separate settlement from recipient delivery.** Revert's source and historical fixes show why an NFT recipient callback can become a reentrancy or liveness problem. FeeStrip should capture fees into its reserve and record state first, then let the entitled party withdraw the NFT to a suitable recipient. A failed NFT receipt must not unwind an already completed independent proof allocation or prevent other holders redeeming. [V3 vault][rvault]

Its AutoCompound code also keeps explicit balances per position and currency. That is a useful reserve pattern: a raw USDC balance can contain several users' assets, later LP fees or unrelated transfers. FeeStrip must keep separate liability records and must never expose buyer reserves to a general balance-sweep function or maker trading allowance. [AutoCompound ledger][rledger]

Do not import debt shares, LTV, liquidation or price-oracle machinery. Those serve lending. FeeStrip's native fee entitlement needs historical pool-state authentication and reserve accounting. Also, v3 position-manager calls cannot be pasted into v4: the latter's PoolManager, PositionManager actions and callbacks require a specific implementation.

## The resulting FeeStrip design

These are design recommendations, not claims that the contracts already exist.

| Component | Responsibility | Key constraint |
|---|---|---|
| Series factory and registry | Deploy and identify a precisely defined fee sale | Immutable terms, implementation version and original claim supply |
| Position escrow and v4 adapter | Validate and hold the NFT, clear old fees, record baseline, capture fees | Same canonical NFT, range and liquidity throughout the active term; no in-term position touches |
| Residual receipt | Record who may recover the NFT and unsold/residual income | No fixed-dollar guarantee; withdrawing the NFT must preserve the later surplus beneficiary |
| Fee claim ERC20 | Transfer a share of all unredeemed income in the specified window | No per-holder dividend checkpoints, no late minting, no automatic disappearance at maturity |
| Checkpoint and proof verifier | Authenticate the selected maturity block and relevant pool storage | No substitution of settlement-time values for maturity-time values |
| Fee reserve and redemption | Hold actual collected USDC and pay the proved liability | Other users, markets and administrators cannot consume reserved buyer funds |
| Aqua/SwapVM market adapter | Trade issued claims against makers' available USDC | Market inventory is separate from collateral and redemption reserves |
| Read layer and indexer | Explain quotes, assets, accrued fees and settlement status | Exact deployment ABI; distinguish indicative accrual from funded redeemability |

The lifecycle should make three independent facts visible: **has earning ended, have fees been captured, has the maturity allocation been proved?** After the earning period ends, capture the native fees before making the NFT withdrawable. Reserve all collected USDC while allocation is unresolved. When the proof arrives, allocate the agreed period's USDC fees to claims and any later USDC fees to the residual beneficiary. The unsold fee leg remains the LP's property. Checkpointing the maturity block can proceed independently of capture.

The stated cutoff is the end of block N, so ordinary capture must happen in a later block. Native Uniswap fee-growth accounting can include funded pool donations as well as swaps. That is distinct from someone transferring USDC directly to the escrow: a direct transfer must not inflate the measured period entitlement.

Early closure is a separate pre-maturity path requiring the residual receipt and the entire original supply Q, before any payout or redemption. It deliberately ends the series before collection, providing a precise exception to the active-term freeze. Checking only a potentially reduced live total supply is insufficient. Recombination after partial redemption would require a separately designed liability model.

## Tests we should take from this review

These are proposed FeeStrip tests. They were not implemented or run in this source-review pass.

| Scenario | Required FeeStrip outcome | Inspiration |
|---|---|---|
| Transfer after some fees accrue; transfer again after maturity but before proof | The current holder owns the transferred units' entire unredeemed period entitlement; seller receives no detached dividend | Pendle, Spectra, Timeless transfer accounting |
| Buyer funding is absent, stale or below seller minimum | Whole activation reverts; seller retains NFT and no claims are created | Resonate matching, Flashstake composition |
| A callback names a different NFT or another series | Revert even if the external component is otherwise approved | Revert transformer regression |
| Someone tries to collect fees, alter range or liquidity during the term | Revert; baseline and fixed backing remain intact | Pendle adapter boundaries, Revert authority model |
| Additional swaps occur after maturity and settlement is delayed | Buyer payout equals the maturity-block entitlement; later fees remain residual property | Contrast with first-post-expiry snapshots |
| Proof delivery is delayed but fees can be captured | NFT becomes withdrawable after capture; unresolved sold-currency reserve remains protected | Resonate residuals, Revert withdrawal separation |
| NFT receiver rejects delivery | Retry to another authorized recipient; already independent cash liabilities remain valid | Revert callback/liveness cases |
| One party tries early closure with one claim unit missing | Revert; owning the residual receipt alone never suffices | Timeless paired redemption |
| Claims are split into many small redemptions | No overpayment, supply accounting stays exact, dust/zero-output behavior follows the specified rule | Spectra/Timeless rounding scenarios |
| Allowance or order remains after closure | It cannot resurrect claims or act on the released NFT | Revert approval cleanup |
| A new deposit tries to join an active cohort | Revert or create a different series; never dilute accrued income | Pendle pool/range validation and fixed-supply design |

For rounding, retain an explicit original supply denominator and compare against a rational reference model. The earlier proposed cumulative-payout formula remains a design candidate requiring implementation and tests; this review does not validate it. Likewise, the previous isolated Uniswap/proof experiments do not establish end-to-end custody, trading or redemption safety.

## Checks actually executed in this pass

Nine Foundry tests passed using unmodified `FlashStrategyAAVEv2`, `FlashFToken` and `ResonateSmartWallet`, with mocked Aave/ERC4626 dependencies, OpenZeppelin 4.5.0 at a pinned commit, and Solidity 0.8.26. They covered yield availability, dilution when new fTokens are minted, user-minimum rollback, principal reservation, mint rounding, loss behavior, residual reservation, residual growth and principal shortfall. They do not exercise the full financing routers, production protocols or FeeStrip.

Five Python model checks also passed for transfer accrual, delayed snapshots, declining exchange rates, payout conservation and reserve separation. These are model checks, not Solidity validation. The accompanying evidence archive contains detailed review memos, source inventories, test code and logs. Original upstream tests were inspected with care: some Resonate interest payout assertions are commented out, and older fork configurations in these projects are not evidence of a current passing suite.

## What this adds to the product and demo

The interface can expose four meaningful protocol operations: **sell fees, trade claims, settle a series, and recombine all rights**. A market view should show backing position, range, exact term, funded quote, accrued native fees and settlement state. A position view should make the retained NFT right and sold income visibly separate.

A strong demonstration follows one real position: accept a funded upfront quote; generate swap fees; transfer part of the claim to a second wallet; pass maturity; generate more fees; capture fees and withdraw the NFT; then verify that the proof pays buyers only for the agreed period. A second, separate series can demonstrate all-rights buyback and early closure. Local/forked blocks and funded demo trades must be labeled as such. The impressive element is conservation of ownership and cash through those operations.

For the previously researched bounties, this keeps Uniswap intrinsic as the source of the position and fees. Aqua/SwapVM should provide meaningful custom claim execution and maker capital sharing across markets, with actual token transfers. The competitor review does not itself verify sponsor eligibility; the official event requirements remain the authority. [Uniswap bounty][ubounty] · [1inch bounty][ibounty]

## Reuse and evidence boundaries

Taking inspiration is appropriate for this hackathon. Actual copied files need their original notices, exact source commit, modifications and applicable license terms recorded. Public GitHub access is not a uniform license, and an upstream audit does not transfer to a changed implementation.

| Source | License evidence at the reviewed revision | Practical reuse boundary |
|---|---|---|
| Pendle files reviewed | Solidity headers say GPL-3.0-or-later; package/root notices differ, with an older BSL/GPL transition notice | Preserve exact file labels and dependencies; do not label the whole tree MIT or uniformly BUSL. [Core notice][pl] |
| Spectra core | BUSL wording includes a 2023-07-01 or earlier change trigger and GPL v2-or-later change license | Account for the stated past transition and retained notices. [Core notice][sl] |
| Spectra diamond router | Different BUSL notice: fourth anniversary of first public distribution; some separately listed MIT components | Do not infer the core's transition applies to this router. [Router notice][sdl] |
| Spectra subgraph | MIT | Useful direct-adaptation candidate for event/entity scaffolding with notice retention and rewritten ABI/accounting. [Subgraph notice][ssl] |
| Resonate | GPL-3.0 root text; mixed/nonstandard core SPDX labels; selected adapter AGPL-3.0 | Inspect the particular copied file and dependencies. [Root notice][resl] |
| Flashstake | Core/strategy BUSL headers; official docs specify a 2024-08-01 or earlier GPL v2-or-later transition with possible per-contract exceptions; fToken wrapper is MIT | Standard ERC20/permit wrapper is a clearer small reuse candidate than a wholesale protocol fork. [License parameters][fl] · [fToken][ftoken] |
| Timeless | AGPL-3.0 root and reviewed core headers | Preserve applicable source and attribution terms for copied implementation. [Notice][tl] |
| Revert Lend | BUSL headers; root notice specifies 2026-06-01 or earlier transition to GPL v2-or-later | The fixed transition date has passed; this still is not MIT. [Notice][rl] |

These rows record the source notices found. The cleanest implementation approach is standard libraries plus small purpose-built contracts, with copied helpers and indexer patterns explicitly attributed in the repository. Keep a `THIRD_PARTY_NOTICES.md` recording source URL, revision, copied paths and changes, and document AI-assisted work as required by the event.

### Repository pins

| Project/source | Reviewed commit |
|---|---|
| Pendle core | `f24265966bb53f75d834ad705decde8e479d3a33` |
| Pendle SY | `73676d931102a369a978a713abfd0b48e3e34361` |
| Spectra current public core | `1b7069130a1353b8eeea5360b5effd43bfbf54cf` |
| Spectra diamond router | `221441b506fe82f14671c213f9ad1031676c0af1` |
| Spectra older core/tests | `2fa3cbf393acb7b25e20a2aef47aaf7e5681fdb2` |
| Spectra subgraph | `bfeeb5a0dbdeb16011f0729e6ae4fc125dade8a1` |
| Resonate public branch | `a114ea0b3f462008099076397345359114cfbcd2` |
| Flashstake core | `8f11e9255fe19c7d15867d13cae32acc958a04ad` |
| Flashstake official docs | `57eeae009e7896a7f900fb8765e5bd3155c42f73` |
| Timeless | `47c79493120c562ac69eff786f0445e8b8c9470a` |
| Revert Lend | `7e85a81ac97663a3a731f6d6f07f14d774962a6e` |

All source links in the review use these immutable revisions. The archive records additional file-level provenance where collected. Source availability, repository activity and an audit link do not establish current deployed usage or market liquidity.

[pk]: https://github.com/pendle-finance/Pendle-SY-Public/blob/73676d931102a369a978a713abfd0b48e3e34361/contracts/core/StandardizedYield/implementations/Kyber/PendleKyberElasticSYUpg.sol
[pkm]: https://github.com/pendle-finance/Pendle-SY-Public/blob/73676d931102a369a978a713abfd0b48e3e34361/contracts/core/StandardizedYield/implementations/Kyber/KyberNftManagerBaseUpg.sol
[pyt]: https://github.com/pendle-finance/pendle-core-v2-public/blob/f24265966bb53f75d834ad705decde8e479d3a33/contracts/core/YieldContracts/PendleYieldToken.sol
[pinterest]: https://github.com/pendle-finance/pendle-core-v2-public/blob/f24265966bb53f75d834ad705decde8e479d3a33/contracts/core/YieldContracts/InterestManagerYT.sol
[pmath]: https://github.com/pendle-finance/pendle-core-v2-public/blob/f24265966bb53f75d834ad705decde8e479d3a33/contracts/core/Market/MarketMathCore.sol
[prouter]: https://github.com/pendle-finance/pendle-core-v2-public/blob/f24265966bb53f75d834ad705decde8e479d3a33/contracts/router/ActionSwapYTV3.sol
[spt]: https://github.com/perspectivefi/core-v2-public/blob/1b7069130a1353b8eeea5360b5effd43bfbf54cf/src/tokens/PrincipalToken.sol
[syt]: https://github.com/perspectivefi/core-v2-public/blob/1b7069130a1353b8eeea5360b5effd43bfbf54cf/src/tokens/YieldToken.sol
[smath]: https://github.com/perspectivefi/core-v2-public/tree/1b7069130a1353b8eeea5360b5effd43bfbf54cf/src/libraries
[ssub]: https://github.com/perspectivefi/spectra-subgraph/tree/bfeeb5a0dbdeb16011f0729e6ae4fc125dade8a1
[sread]: https://github.com/perspectivefi/core-v2-public/blob/1b7069130a1353b8eeea5360b5effd43bfbf54cf/README.md
[srouter]: https://github.com/perspectivefi/diamond-router-public/tree/221441b506fe82f14671c213f9ad1031676c0af1/src
[stests]: https://github.com/perspectivefi/spectra-core/tree/2fa3cbf393acb7b25e20a2aef47aaf7e5681fdb2/test
[res]: https://github.com/Revest-Finance/ResonateContracts/blob/a114ea0b3f462008099076397345359114cfbcd2/hardhat/contracts/Resonate.sol
[reswallet]: https://github.com/Revest-Finance/ResonateContracts/blob/a114ea0b3f462008099076397345359114cfbcd2/hardhat/contracts/SmartWallet.sol
[flash]: https://github.com/BlockzeroLabs/flashv3-contracts/blob/8f11e9255fe19c7d15867d13cae32acc958a04ad/contracts/FlashProtocol.sol
[fstrategy]: https://github.com/BlockzeroLabs/flashv3-contracts/blob/8f11e9255fe19c7d15867d13cae32acc958a04ad/contracts/strategies/FlashStrategyAAVEv2.sol
[ftoken]: https://github.com/BlockzeroLabs/flashv3-contracts/blob/8f11e9255fe19c7d15867d13cae32acc958a04ad/contracts/FlashFToken.sol
[ftests]: https://github.com/BlockzeroLabs/flashv3-contracts/tree/8f11e9255fe19c7d15867d13cae32acc958a04ad/test/Integration
[tgate]: https://github.com/timeless-fi/timeless/blob/47c79493120c562ac69eff786f0445e8b8c9470a/src/Gate.sol
[tfactory]: https://github.com/timeless-fi/timeless/blob/47c79493120c562ac69eff786f0445e8b8c9470a/src/Factory.sol
[tadapter]: https://github.com/timeless-fi/timeless/blob/47c79493120c562ac69eff786f0445e8b8c9470a/src/gates/ERC4626Gate.sol
[tyt]: https://github.com/timeless-fi/timeless/blob/47c79493120c562ac69eff786f0445e8b8c9470a/src/PerpetualYieldToken.sol
[ttests]: https://github.com/timeless-fi/timeless/blob/47c79493120c562ac69eff786f0445e8b8c9470a/src/test/base/BaseGateTest.sol
[rvault]: https://github.com/revert-finance/lend/blob/7e85a81ac97663a3a731f6d6f07f14d774962a6e/src/V3Vault.sol
[rtransform]: https://github.com/revert-finance/lend/blob/7e85a81ac97663a3a731f6d6f07f14d774962a6e/src/transformers/Transformer.sol
[rtests]: https://github.com/revert-finance/lend/blob/7e85a81ac97663a3a731f6d6f07f14d774962a6e/test/integration/V3Vault.t.sol
[rfix]: https://github.com/revert-finance/lend/commit/7e85a81ac97663a3a731f6d6f07f14d774962a6e
[rledger]: https://github.com/revert-finance/lend/blob/7e85a81ac97663a3a731f6d6f07f14d774962a6e/src/transformers/AutoCompound.sol
[faudit]: https://github.com/BlockzeroLabs/flash-docs/blob/57eeae009e7896a7f900fb8765e5bd3155c42f73/source/peckshield_flashstake_audit.pdf
[paudit]: https://github.com/pendle-finance/pendle-core-v2-public/blob/f24265966bb53f75d834ad705decde8e479d3a33/audits/main%20codebase/ChainSecurity-2024/ChainSecurity.pdf
[pl]: https://github.com/pendle-finance/pendle-core-v2-public/blob/f24265966bb53f75d834ad705decde8e479d3a33/LICENSE
[sl]: https://github.com/perspectivefi/core-v2-public/blob/1b7069130a1353b8eeea5360b5effd43bfbf54cf/LICENSE
[sdl]: https://github.com/perspectivefi/diamond-router-public/blob/221441b506fe82f14671c213f9ad1031676c0af1/LICENSE
[ssl]: https://github.com/perspectivefi/spectra-subgraph/blob/bfeeb5a0dbdeb16011f0729e6ae4fc125dade8a1/LICENSE
[resl]: https://github.com/Revest-Finance/ResonateContracts/blob/a114ea0b3f462008099076397345359114cfbcd2/LICENSE
[fl]: https://github.com/BlockzeroLabs/flash-docs/blob/57eeae009e7896a7f900fb8765e5bd3155c42f73/source/smart-contracts/licence.rst
[tl]: https://github.com/timeless-fi/timeless/blob/47c79493120c562ac69eff786f0445e8b8c9470a/LICENSE
[rl]: https://github.com/revert-finance/lend/blob/7e85a81ac97663a3a731f6d6f07f14d774962a6e/LICENSE
[ubounty]: https://ethglobal.com/events/ethonline2026/prizes/uniswap-foundation
[ibounty]: https://ethglobal.com/events/ethonline2026/prizes/1inch
