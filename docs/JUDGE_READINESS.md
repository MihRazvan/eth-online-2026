# usufruct judge readiness checklist

The release target is a judge who understands the proposition without an explanation from the team, can make a small real Sepolia purchase, and can complete a redemption path. The seller journey must also work between separate wallets for a position that was never manually added to our deployment configuration. A complete public recording must connect every lifecycle step for one actual series.

This is the execution checklist for the next release. The [bounty research](research/bounty-readiness.md) explains the architectural decisions; [STATUS](STATUS.md) records implementation evidence. Unchecked items are unfinished, including cases where a local implementation already exists. Assessment baseline: `07cbccb`, 12 September 2026. The small presentation improvements below were implemented during this pass.

## Release decision

**The public site is not yet ready for an unattended end-to-end judge session.** It has a distinctive interface, deployed contracts and substantial local verification. The fresh public review still found zero markets, wallet gates on Pin/Cabinet, and 404 responses from recovery/analysis routes. The discovery fix is real and its hosted CI is green, but it does not connect all counterparties or operate settlement.

Keep the existing three partners. Prioritize the actual Uniswap/Aqua lifecycle and run Graph work concurrently. Do not add a hook, second AMM, AI assistant or extra network merely to accumulate integrations. Success depends on the integrations being essential, understandable and demonstrable.

## Current checkpoint and next implementation batch

Implementation checkpoint,12September: J04–J08/J14 now have editable small terms, shareable canonical targets/offers, explicit transaction stages, refresh and receipt recovery, verified between separate local-chain wallets. J09/J10 have a restricted checkpoint signer, authenticated off-host proof restoration, a tested container and a read-only Vercel gateway. Both actual local-chain settlement variants pass against the new eight-argument funding contract. Public/hosted acceptance remains open; component tests are not public acceptance.

Independent review also found and fixed an existing liquidity-substitution race: funding now requires the buyer's reviewed position commitment onchain. The old immutable public deployment remains gated until replacement. The participant cancelled old offer2 at public block11689226 and recovered672SepoliaUSDC; independent readback confirms zero old liabilities and no activated series. [Public refund evidence](evidence/operations/old-offer-refund.json). The two replacement deployments have been rehearsed on an isolated fork; their public deployment remains pending.

The isolated Railway project `usufruct` is now linked and empty. Its reviewed plan adds one capped service, a1GiB volume and a private proof bucket. [Deployment plan, costs and operator recovery](deployment-operations.md). No billable resource has been created. Both Graph credential steps remain complete; continuous initialized-history hosting and the actual buyer join remain pending.

The next implementation batch is **J09/J10 alongside J04–J08/J14**. Hosting the existing read-only worker alone is insufficient: it does not submit the endpoint checkpoint. No new public sale should be activated before checkpointing and witness recovery pass their operational checks.

| Order | Lead-owned work | Team contribution / dependency | Completion target |
| --- | --- | --- | --- |
| 1A | Implement the restricted checkpoint signer, prepare the Railway service, persistent storage, independent witness copy and HTTPS recovery; J09/J10 | Existing authentication is sufficient for preparation. Select the concrete hosting plan/budget once the deployment is reviewable; name primary/fallback operators and a dedicated testnet keeper wallet | Restart/RPC-failure rehearsal preserves the endpoint anchor and authenticated witness; hosted recovery serves the exact bytes |
| 1B, parallel | Connect buyer and seller via shareable positions/offers, editable small terms, clear signature stages, refreshed state, receipts and balance/gas guidance; J04–J08/J14 | No new input needed to implement. Participants are needed for the subsequent public test | Separate browser wallets can fund, locate, review and accept the exact offer without developer intervention; cancellation/refund still works |
| 2 | Operate initialized Substreams history and expose the actual Subgraph + stream buyer view; remaining J15–J17 | No additional Graph credentials; actual sale data follows the safe public rehearsal | A real instrument shows sourced range/activity context and break-even, with explicit coverage/freshness and no payout authority |
| 3 | Rehearse native-compatible fee activity and one complete nonzero public lifecycle; J11/J12 | Assign seller/buyer/secondary-holder roles to public wallet addresses; participants review the prepared exact terms/budget and sign | Fund → accept → Aqua trade → fees → late capture → NFT return before allocation → proof → independent payouts, with receipts/balance checks |
| 4 | Maintain executable judge inventory, complete the unaided session and evidence packet; J13/J18/J19 | Human review, narration, Uniswap feedback form and final submission; T05–T07 | A fresh judge can buy/redeem, a second fresh participant can repeat it, and each sponsor claim links to actual evidence |

The next user contribution is participant/operator coordination, not another RPC or Graph key. Implementation preparation can proceed while that is arranged. Price/term approval belongs to a concrete prepared test, not a generic permission request now.

## The experience a judge should get

| Entry | Expected experience | Completion evidence |
| --- | --- | --- |
| Arrive without a wallet | Understand that an LP sells a fixed period of native USDC fees while retaining the NFT return right; open a real instrument and inspect terms | A fresh visitor explains the product and finds a live claim in under one minute |
| Try a purchase | Connect a compatible Sepolia wallet, obtain test assets, review an actual ask, approve the needed token amount, buy, then see the receipt and next action | Successful public transaction and correct claim/USDC balances; no coaching through navigation |
| Try redemption now | Buy a small claim from a separately prepared allocated series, then redeem its unpaid entitlement | Nonzero payout and linked receipt; the UI explicitly identifies this as an already allocated period |
| Explore delayed settlement | Inspect another real series where capture and NFT return happened but allocation is pending; inspect retained proof and reserve state | Exact chain/series/endpoint evidence, followed by a demonstrated permissionless allocation |
| Try the seller path | Find an owned eligible NFT, share its position page with a buyer, receive a funded offer, review exact terms, approve and accept | Two wallets complete this for an NFT absent from the manifest and prior offers |
| Leave and return | Reopen the same link, recover pending/confirmed state, understand what has changed and what can happen next | Reload, account/network change, counterparty acceptance and maturity do not strand the user |

The active, proof-pending and allocated examples are **different real series**, each labeled with its own period and receipts. A judge cannot compress a newly purchased earning window into instant redemption. Only the NFT/residual owner can execute seller actions. A separately labeled simulation may teach the entire sequence without assets, but is optional and never substitutes for live bounty evidence.

## Implementation checklist — Codex lead owns delivery

| Done | ID / priority | Deliverable | Acceptance check / dependency |
| --- | --- | --- | --- |
| [x] | J01 / presentation | Move prominent prior-work credit out of the product footer; retain source attribution | Footer links to this repository's Source & credits. ScopeLift remains credited in README/feedback/technical documentation; licenses remain intact |
| [x] | J02 / presentation | Add a concise first-visit guide and clear public network label | Expandable guide explains funding, whole-period unpaid income, NFT return and allocation; public UI says Sepolia/test assets and has no fixture-control label |
| [x] | J03 / discovery | Find recent owned LPs and offer exact ID/link lookup | NFTs39220/21/22 verified with public reads; wrong currency/owner/network and broken metadata handled; [evidence](evidence/position-discovery.md) |
| [ ] | J04 / critical | Shareable public position targets for external buyers | A buyer can view/fund the seller's previously unknown canonical NFT. Viewing/funding does not require ownership; approval and acceptance still do. Link reconstructs canonical state after reload |
| [ ] | J05 / critical | Explicit small funded-offer terms | Payment, sold fraction, exact end block and acceptance deadline are reviewable and bounded; replace 672-USDC/+129,000-block defaults; immutable Q and exact seller consent remain enforced |
| [ ] | J06 / critical | Connect the offer → sale → market handoff | Funding receipt distinguishes escrowed USDC from issued claims. Seller receives a usable link/offer ID and chooses exact terms. Accepted buyer sees claims and an explicit publish-quote next action; secondary buyer gets a claim link. Unaccepted/expired offers expose cancellation and exact refunds; expiry alone never implies an automatic refund |
| [ ] | J07 / critical | Keep wallets and lifecycle state current | Bounded refresh on page visibility, wallet change, pending counterpart action and approaching maturity; no stale account overwrites, double submissions or silent changes to reviewed terms |
| [ ] | J08 / critical | Explain each signature and preserve receipts | Separate allowance/approval, submission and confirmation states. Rejection after approval explains the remaining allowance. Reload resumes known receipts and shows the next allowed action |
| [ ] | J09 / critical | Operate endpoint checkpointing and retention | Restricted testnet signer, nonce/receipt/retry handling, fee/balance limits, canonical checkpoint within N+256, prompt witness acquisition, restart/failure rehearsal and named fallback. Must pass before public activation |
| [ ] | J10 / critical | Host recovery and expose truthful service state | Persistent service with independent off-host witness copy, tested restoration, HTTPS API/proxy and bounded requests. Distinguish missing checkpoint, missing proof, finality and cached growth. Never allocate from server estimates |
| [ ] | J11 / critical | Prepare and rehearse native-compatible pool activity | Confirm current in-range liquidity and nonzero USDC fee delta before selling. Use a native-ETH-compatible activity route for ETH/USDC; the existing local ERC20 activity router is not a generic native swap router |
| [ ] | J12 / critical | Complete one nonzero public lifecycle | Separate wallets: fund/accept → actual Aqua trade after some accrual → pre/post-N activity → late capture → same NFT returned before allocation → valid proof → independent redemptions. Retain exact balances, hashes and dust; native-N oracle is an isolated fork replay |
| [ ] | J13 / critical | Keep staged judge inventory executable | Active, proof-pending and allocated series have real bounded inventory. After a redemption invalidates maker state, renew quotes safely from maker assets. Two successive fresh-wallet purchase/redemption sessions pass |
| [ ] | J14 / critical | Make prerequisites and cost actionable | Explain wallet/network and test-asset acquisition before signatures. Read ETH as well as USDC balances; estimate actual transaction gas; show unavailable estimates honestly. Offer sizes fit prepared wallets and floored claim payouts are nonzero |
| [ ] | J15 / Graph | Deploy the actual Subgraph and consume live Substreams | Studio v0.1.0 and live Substreams v0.1.1 verified, with real mint decoding, cursor resume and shared block/RPC agreement. Still retain sufficient initialized history and operate the hosted stream; undo has local tests only. T01 complete; T02 pending; [evidence](evidence/substreams.md) |
| [ ] | J16 / Graph | Show useful live joined buyer analysis | Common chain/pool/block/hash, coverage, range occupancy, source identity and quote break-even visible in app. Separate expected finality delay from stalled indexing; replace hardcoded provider labels with actual request state |
| [ ] | J17 / Graph | Publish a reusable integration | Versioned v0.1.1 SPKG/schema/config and standalone live consumer are public. Remaining: demonstrate the useful two-product composition on an actual instrument and explain reuse in the demo. No fake chart, forecast or exact-fee claim |
| [ ] | J18 / submission | Package sponsor evidence and human review materials | Public source/runtime provenance, transaction links, measured cost, reusable Uniswap recipe, current FEEDBACK, licenses/AI record and concise recording script. Each claim links to the correct public/fork/local evidence |
| [ ] | J19 / final acceptance | Run the full judge rehearsal and publish verified build | Two unaided participants; both desktop/mobile; wrong network, insufficient gas, rejected signature, reload, stale/depleted quote, counterparty action, unaccepted/expired offer refund and acceptance race, proof outage and post-redemption quote renewal; hosted CI and public build verified |

Security-sensitive changes receive separate review before publication. The current51contract tests,55browser regressions and both local-chain settlement variants do not replace J12/J19. The funded-position commitment fix requires replacement of the old immutable public FeeStrip and its associated market, plus updated operational pins and Subgraph configuration.

## Team checklist — access, decisions and hands-on work

| Done | ID | Team action | What to provide / what Codex then handles |
| --- | --- | --- | --- |
| [x] | T00 | Confirm event and entry | ETHOnline2026 Classic confirmed. The local folder name does not determine eligibility |
| [x] | T01 | Make Graph access available | Studio deployment and Graph Market JWT both verified live. Credentials remain in ignored `.env`; Studio query currently needs no extra credential. Hosted secret configuration is part of T02 |
| [ ] | T02 | Select an always-on host and operator | Isolated usufruct project and exact three-resource plan are prepared. Approve the proposed$30/month project budget in the deployment plan before provisioning. Identify primary and fallback operator and how alerts reach them. Vercel frontend hosting alone is insufficient |
| [x] | T08 | Refund the old unaccepted offer before switching deployments | Buyer0x746b…4C6d cancelled offer2 for672SepoliaUSDC at11689226. Receipt and zero remaining old-contract liabilities verified at11689275; [evidence](evidence/operations/old-offer-refund.json) |
| [ ] | T03 | Prepare separate participant wallets | Seller controls an eligible NFT; buyer and secondary buyer/holder have Sepolia ETH and authentic test USDC. Name a maker wallet and keeper gas wallet. Share public addresses only; keys remain in wallets/secrets |
| [ ] | T04 | Agree to the bounded real test | Choose exact NFT, upfront payment, sold fraction, cutoff and maximum test-asset/activity/gas budget from a prepared review. Confirm actual owners will sign; do not move or mint more liquidity blindly |
| [ ] | T05 | Join an unaided two-wallet rehearsal | At least seller and buyer participants; preferably a fresh secondary buyer. Record misunderstandings and assistance rather than teaching the flow first. A second participant must be able to repeat the redeemable path |
| [ ] | T06 | Perform and record meaningful human review | Review rights, reserve/cutoff behavior, costs and test outcomes. Verify origin/creation dates of project-specific design references for Classic. Record actual authorship/contributions; do not invent completed reviews |
| [ ] | T07 | Complete sponsor and event submission | Review FEEDBACK and submit Uniswap's form; record 2–4 minutes in a human voice; select the intended partner tracks in the dashboard; upload and confirm submission receipt before deadline |

Account names and availability are enough to begin coordinating access. Existing RPC/deployment credentials and test funding are already configured and should not be requested again. Historical balances are not a fresh budget: the lead reads current balances before preparing transactions. Public test setup never implies permission to purchase services or spend mainnet funds.

## Bounty-specific acceptance

| Partner / selected track | Requirement to satisfy | Our evidence plan |
| --- | --- | --- |
| Uniswap / Best Uniswap Stack Contribution | Meaningful stack integration, public code, FEEDBACK, developer feedback form and precise integration pointers | Individual canonical v4 NFT preservation, native USDC income, exact delayed endpoint, reusable escrow/verification recipe; J12/J18/T07 |
| 1inch / Build an Aqua App | Official Aqua/SwapVM use, demonstrated onchain transfers and real Git history; SwapVM favored, modified SwapVM redeployment permitted, local forks accepted | Actual issued-claim bids/asks, shared capital and quote invalidation; disclose new Aqua instance/custom router provenance. Retain an official-deployment fork fallback or obtain sponsor clarification through the team; J12/J13/J18 |
| The Graph / Best Use of Composable or Standardized Graph Products | Live provider data and multiple composed Graph products or meaningful standardization; reusable work and demo | Live Substreams pool context + live series Subgraph, common-block buyer decision view and reusable module; J15–J17. This target stays unfinished until actual provider composition works |

Official requirements rechecked12September2026: [Uniswap](https://ethglobal.com/events/ethonline2026/prizes/uniswap-foundation), [1inch](https://ethglobal.com/events/ethonline2026/prizes/1inch), [The Graph](https://ethglobal.com/events/ethonline2026/prizes/the-graph). These are the current selected targets; any account-specific dashboard variation should be reconciled before submission. Eligibility decisions belong to the organizers, not this checklist.

## The details that can break a seemingly successful demo

**An eligible LP may earn nothing.** An NFT containing USDC, with no hooks and nonzero liquidity, is admissible; that does not establish current range or activity. Pool donations distribute through active liquidity and do not manufacture income for an out-of-range NFT. A read-only check at Sepolia block11687429 found NFT39216 and the team’s NFTs39220/39221/39222 all in range. That snapshot does not prove a nonzero fee delta or guarantee future range. Recheck tick/bounds and rehearse activity before activation; no additional mint is justified merely by the earlier discovery failure. Once sold, the range/liquidity must stay fixed. Do not relabel controlled donations as organic demand.

**One completed judge session can consume the next session's route.** Redemptions change the state bound into Aqua quotes. A maker needs to renew offers after those changes, using its own assets. Inventory, keeper gas and test-token distribution need continuity throughout judging, with explicit low-balance alerts. Captured reserves are liabilities, never a pool of demo funds.

**Proof and anchor are independent obligations.** A saved witness without a usable canonical hash cannot rescue the present verifier after its window expires. A saved hash cannot reconstruct pruned state. Test both outage paths before taking public commitments. A verified growth cache is useful only after actual authenticated verification of the exact tuple; it does not turn a server number into truth.

**Proof costs dominate tiny examples.** The retained public proof measured4,417,289call gas; that excludes full transaction overhead. The1,425,145gas local settlement used a different trie. Show actual public transaction costs and who pays them. A tiny positive test payout proves accounting, not an economical retail product.

**A single actor cannot demonstrate all permissions honestly.** The anonymous buyer path requires no LP NFT. The seller path requires that actor's position and an external funded offer. Buying a prepared matured claim demonstrates real trading/redemption without pretending that the same new sale matured instantly. A recording should show the full original series; prepared browseable states complement it.

**Source credits should support inspection.** The product footer now leads to this project's source/credits; the README continues to credit ScopeLift and upstream sources. Retain attribution and avoid first-ever fee/principal separation claims. Product screens should explain decisions and rights; developer diagnostics and sponsor evidence belong behind clearly labeled links.

## Delivery sequence and stop conditions

1. **Connect counterparties and prepare infrastructure together:** J04–J10, with T01–T04 running alongside. Ship the shareable target and exact offer review before asking participants to improvise around hidden terms.
2. **Prove the complete public lifecycle:** J11/J12 and an initial human rehearsal. If witness/anchor reliability, nonzero income or native-currency activity fails, stop new activations and fix the failure. Existing recovery obligations continue.
3. **Prepare repeatable judge states and live analysis:** J13–J17. If Graph remains unavailable, keep the disclosure truthful; it cannot be replaced by a simulation for that bounty.
4. **Freeze, rehearse and submit:** J18/J19 and T05–T07. Prepare a clear known-limits list and the exact evidence links used in the recording.

The official submission deadline is **13September2026,19:00Europe/Bucharest (16:00UTC)**. Target feature freeze at12:00, reviewed video/materials by15:00 and submission by17:00, retaining two hours for upload problems. These are internal targets, not a promise that unfinished safety gates will pass. The event requires Classic start-fresh provenance, truthful AI attribution, meaningful human involvement and a2–4minute video at720p or higher with human narration. [Official event requirements](https://ethglobal.com/events/ethonline2026/info/details).

Defer broad chain/token support, EIP-2935 migration, proof compression/ZK, a new AMM, an order book, general NFT indexing and open-ended agent infrastructure until the bounded public experience works. Later production readiness still requires deeper independent security review, provider/load qualification, sustainable liquidity and evidence of real user demand.

## Verification record for this pass

The lead inspected the disconnected public Orchard/Pin/Cabinet and current code; separate frontend and protocol reviewers returned the counterparty, refresh, native-activity and repeat-redemption findings incorporated here. Presentation edits pass TypeScript, the isolated public build and all47UI tests. The discovery implementation and subsequent evidence commit already passed all hosted jobs: [implementation CI](https://github.com/MihRazvan/eth-online-2026/actions/runs/34679841461), [evidence CI](https://github.com/MihRazvan/eth-online-2026/actions/runs/34679888515). No new public transaction, paid service, sponsor message or submission occurred during this pass.

[Baseline public observations](evidence/judge-pass/before.json), [local public-build presentation check](evidence/judge-pass/presentation-local.json), [desktop](evidence/judge-pass/desktop.png), [mobile](evidence/judge-pass/mobile.png).

The presentation increment `5eddbd7` is deployed on the public Vercel alias. The [production browser check](evidence/judge-pass/presentation-production.json) passed keyboard guide expansion, correct source-credit link, public network/data labels, no page errors and no mobile overflow. This verifies the presentation changes, not the unchecked financial/service gates above.
