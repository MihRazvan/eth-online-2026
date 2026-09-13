# usufruct judge readiness checklist

Updated 13 September 2026 after endpoint restoration and the public allocation observation. ETHOnline 2026 **Classic** is user-confirmed. Deadline: **today, 19:00 Bucharest / 16:00 UTC**. This checklist separates implementation, actual Sepolia evidence, and unfinished human work. [Submission packet](submission.md), [teammate brief](TEAMMATE_BRIEF.md), [exact test flow](DEMO_TEST_RUNBOOK.md).

## Current release decision

**The public product has a real funded series, secondary trades, captured fees, returned NFT, operated checkpoint, restored remote proof, and live Graph composition. Public allocation, independent holder payouts and residual withdrawal are confirmed; unredeemed claims remain deliberately backed for judging.** Unaided human comprehension and two fresh human sessions remain unverified.

Series **1** uses canonical NFT **39216**, original **Q = 10,000 claims**, activation **11696226** and fixed endpoint **N = 11696317**. The seller received **0.25 test USDC** for 2,500 claims. A teammate bought **189 + 63 + 748 = 1,000 claims** through three actual Aqua trades. These transfers supersede the earlier plan to give an agent-controlled secondary wallet 1,000 claims. Do not reuse planned wallet balances as actual payout evidence.

The later public capture received **1.499999 USDC**. The same NFT returned at block **11696393**, while allocation was still false. The independently authenticated endpoint amount is **0.999999 USDC**; native collection on an isolated fork of the real endpoint agrees exactly. The remaining **0.500000 USDC** is the expected post-endpoint residual, now recorded by public allocation. Test activity includes **controlled funded donations**, not demonstrated organic demand. [Native oracle and scope](evidence/operations/live-series-one-native-oracle.md).

Allocation transaction [0xf5cb…0101](https://sepolia.etherscan.io/tx/0xf5cbfa5deb0b7ecd05d59a06daec73ca6c9a5def7dc50aea10fc904abcc50101) was observed successful at the lead’s block 11696450 readback. The teammate then redeemed 1,000 claims for 0.099999 USDC at block 11696463. [Redemption receipt](https://sepolia.etherscan.io/tx/0x3ac55ef51fee55243983065ab343e41d9b1dd57b72f02a4d0f3340822f028a3e). Actual allocation gas was 4,396,570; this redemption used 122,011. These receipts are confirmed canonical observations, not a finality claim.

Confirmed payouts are **0.099999 USDC** for the teammate’s 1,000 claims, **0.149999 USDC** for the original buyer’s 1,500 claims, and **0.649999 USDC** for the seller’s 6,500 claims. The seller separately withdrew the **0.500000 USDC residual**. A later controlled holder bought **10 claims for 0.000500 USDC** and redeemed them for **0.000999 USDC** through the updated public UI. Current totals are **9,010 claims redeemed / 0.900996 USDC paid / 0.099003 USDC retained**, with **990 funded, unredeemed claims** reserved for judges. A single redemption of those 990 claims would pay 0.098999 USDC and leave four micro-USDC of rounding dust; splitting redemptions may increase dust. The reserve remains a liability, not available project cash. [Complete public lifecycle evidence](evidence/operations/live-series-one-lifecycle.md).

The controlled repeat [purchase](https://sepolia.etherscan.io/tx/0x239f863f30530277460a0ef8f05f03724196cf0f6cecc9767c894fb27a93b909) and [redemption](https://sepolia.etherscan.io/tx/0xd82bf3a5625e43d8e5018024cc546b87c84ebf8cbe4469ad3dc3d45452bdeb50) extend the earlier lifecycle snapshot. They are actual canonical receipt observations, not a claim of finality or a second unaided human session. [Independent repeat and renewed-quote verification](evidence/operations/live-new-interface-repeat.md).

The renewed **990-claim / 0.049500-USDC ask**, expiring **20 September at 14:45 UTC**, is published and executable at this checkpoint. [Renewal transaction](https://sepolia.etherscan.io/tx/0x9ccafb84b0c67dbfd575f206399938de7dc17c0e47472c33b44888bf7fe2150d). A redemption invalidates existing quotes; the maker must publish fresh terms for remaining inventory. Check availability before recording or inviting another buyer.

At N+2 the dedicated keeper saved the correct hash. N and its receipt finalized; the proof was restored from two remote GETs into a fresh local database and two verified copies, with no RPC witness fallback or hosted reset. [Actual restoration](evidence/operations/live-series-one-restore.json). Hosted restart also passed. [Restart](evidence/operations/hosted-restart.json), [operator runbook](deployment-operations.md).

The Graph now has a **live nonempty-series join**: Studio instrument state and hosted Substreams history agreed at finalized block **11696247**. The observed earning interval covered **22/22 known blocks**, all in range, with zero indexing lag relative to finalized history. This snapshot is partial-period context, not complete endpoint coverage or fee attribution. [Live Graph evidence](evidence/operations/live-series-one-graph.md).

## What happens next, and who owns it

| Priority | Codex lead owns | Team owns | Done when |
| --- | --- | --- | --- |
| Complete: public lifecycle | Preserve the linked receipt, reserve and original-Q accounting evidence; retain backed judge claims | Teammate purchase/redemption succeeded; team supplies fresh participant testing | Actual sale, trade, capture, NFT return, allocation, independent payouts and residual withdrawal are verified |
| Next: make judging repeatable | Preserve real unredeemed inventory; publish fresh executable asks after state changes; verify production build and desktop/mobile paths | One human path and one controlled repeat passed; fresh unaided participant testing remains | Renewed quote publishes and remains executable; human understanding and assistance are recorded separately |
| Continue operations | Keep keeper, retention, replication and Graph healthy; monitor disk, gas and cost; maintain recovery evidence | Name primary/fallback human operators and alert contacts | Responsibility continues through all live obligations, including after submission |
| Package evidence | Update financial receipts, sponsor links, deployment provenance, recording outline and exact demo URLs | Review actual human contributions and reference-asset provenance; review FEEDBACK | Each claim has correctly labelled public, fork or local evidence |
| Submit before 19:00 | Provide the tested app/repository and concise prepared text | Human narration, Uniswap feedback form, dashboard partner selection, upload and submission confirmation | Human records submission receipt before deadline |

Hosting and Graph credentials are already configured. No additional account purchase, RPC key or keeper funding is requested by this checklist. Use current readiness and balances before every new sale; old balance snapshots are not new spending authority.

## Implementation and acceptance ledger

A checked row completes the stated scope only. Human acceptance and recurring operations have separate rows.

| State | ID | Deliverable | Evidence / remaining action |
| --- | --- | --- | --- |
| [x] | J01 | Product footer and attribution | Product points to source/credits; upstream licenses and ScopeLift credit remain in the repository |
| [x] | J02 | Product introduction and public network labels | Reference intro, skip/reduced-motion and clean normal screens implemented; human comprehension still tested under J19 |
| [x] | J03 | Existing LP discovery and exact-ID lookup | Canonical positions load; teammate NFTs 39220–39222 remain owned by 0x746b…4C6d and were in range at 11696304; recheck before a new sale |
| [x] | J04 | Persistent signed seller listings | Gasless publication/discovery and separate-wallet funding implemented and exercised through the production frontend |
| [x] | J05 | Exact funded terms | Buyer funds a reviewed position commitment; seller accepts exact Q/share/payment/N/deadline; live series 1 pays 0.25 USDC for 25% |
| [x] | J06 | Listing → offer → issued claim handoff | Actual public activation and three teammate secondary buys; approval alone is never a sale |
| [x] | J07 | Current state and receipt recovery | Automated stale/reload/replacement guards; unaided production recovery remains part of J19 |
| [x] | J08 | Distinct signatures and transactions | Gasless advertisement, USDC approval/funding, NFT approval and acceptance are separate; browser receipts retained |
| [x] | J09 | Operated endpoint checkpoint and retention | Actual dedicated-keeper tx at N+2, finalized canonical hash, prompt proof retention and tested normal restart; ongoing named operator handoff remains T02-ops |
| [x] | J10 | Hosted recovery and remote restoration | Actual finalized series proof authenticated from remote GETs into a fresh isolated local DB/two copies; this is not a destructive hosted failover test |
| [x] | J11 | Nonzero native-compatible activity for the tested pool | Actual NFT 39216 is USDC/WETH; controlled donations generate nonzero fees. Exact native-N fork oracle matches 999999 micros. This does not qualify every native-ETH pool route |
| [x] | J12 | Complete public financial lifecycle | Funding, acceptance, Aqua trades, capture, NFT return before allocation, endpoint recovery, allocation, independent payouts and residual withdrawal verified. Backed judge claims intentionally remain unredeemed; complete supply burn is not required |
| [x] | J13 | Operated judge inventory and repeat | One human purchase/redemption and one controlled updated-UI repeat verified. 990 funded claims remain behind a renewed executable ask. Maker renewal is required after redemption; unattended liquidity is not claimed. Unaided human comprehension remains J19. |
| [x] | J14 | Actionable prerequisites | Wallet/network/gas/proof readiness and small exact amounts implemented; gasless listings can be signed without ETH; actual allocation used 4,396,570 gas |
| [x] | J15 | Operated Graph provider products | Studio v0.2.0 plus authenticated Substreams v0.1.1 running on the hosted service; retained history survives restart |
| [x] | J16 | Actual joined buyer query | Real series 1 joined at 11696247; 22/22 observed blocks and common canonical hash verified. Partial-period snapshot and finality lag disclosed |
| [x] | J17 | Public reusable integration | Versioned SPKG, schema, standalone consumer, common-block join and live example published; human demo must still explain the reuse |
| [ ] | J18 | Final sponsor evidence packet | Live Graph/restore/native evidence linked; public lifecycle receipts and funded remaining-claim accounting are available; finish human review and recording, complete human feedback/attribution review |
| [ ] | J19 | Unaided final judge rehearsal | Fresh desktop/mobile participants, repeat redemption route, rejected prompt, reload, insufficient gas and stale quote; final CI/public build checked by lead |

The public seller flow used the existing configured test wallet and a constrained Node-held browser wallet. A teammate's real purchases are separately observed. Neither fact establishes a completed unaided two-person acceptance study. Current automated verification passes 103 browser and 18 residual-flow tests, plus both four-test actual local-chain variants. These remain separate from human comprehension evidence.

## Team checklist

| State | ID | Owner / action | Exact remaining input |
| --- | --- | --- | --- |
| [x] | T00 | Team: confirm event/track | ETHOnline 2026 Classic confirmed; folder name is accidental |
| [x] | T01 | Team: Graph access | Studio/Graph Market access is configured and live |
| [x] | T02 | Team/lead: managed hosting | Railway service, 500 MB volume, private bucket and dedicated funded keeper are operated; no hosting approval remains |
| [ ] | T02-ops | Team: operator handoff | Name primary/fallback people and how they receive alerts; lead supplies exact recovery procedures |
| [x] | T03 | Team/lead: initial test wallets | Seller/buyer prepared; teammate wallet 0x746b…4C6d actually acquired 1,000 claims. Fresh judge wallets and gas remain J13/J19 prerequisites |
| [x] | T04 | Team/lead: bounded live self-test | User authorized controlled self-testing; exact series 1 terms executed. New terms require a new concrete review |
| [ ] | T05 | Team: independent rehearsal | Teammate path and controlled repeat passed; still complete fresh unaided human purchase/redeem sessions; report confusion and assistance |
| [ ] | T06 | Team: meaningful human review | Record actual design/engineering/test contributions and Classic reference-asset provenance in the attribution record |
| [ ] | T07 | Team: complete submission | Review FEEDBACK, send required Uniswap form, record human video, select three intended partners, upload and retain submission confirmation |
| [x] | T08 | Prior buyer: old offer refund | Old deployment offer 2 refunded 672 Sepolia USDC; do not accept/refund it again. [Receipt](evidence/operations/old-offer-refund.json) |

## Bounties and evidence boundaries

Keep the three selected partners: **Uniswap — Best Uniswap Stack Contribution**, **1inch — Build an Aqua App**, **The Graph — Best Use of Composable or Standardized Graph Products**. Use the ordinary Classic-compatible Uniswap/Aqua pools, not their Continuity-only pools. [Exact requirement/evidence matrix](evidence/sponsors.md).

The live Graph composition gap is closed for the recorded snapshot. The final demo and reusable-work explanation are still required. Aqua public token transfers now exist; disclose the source-pinned fresh deployment and custom dispatcher. Uniswap has live custody, fees and historical proof evidence; its feedback form remains a human submission task. Organizer eligibility is not certified by this checklist.

## Demo discipline

- Keep original **Q=10000** as the denominator. A claim carries its fraction of the whole period's unpaid USDC income, including accrual before transfer. Other-currency fees and post-period USDC belong to the residual beneficiary.
- Series 1 has progressed from active to captured/NFT-returned. Those are **successive recorded states of one series**, not simultaneous A/B/C inventory. An additional active example needs a separately prepared, labelled series and continuing operator coverage.
- After allocation, show actual redemption only when the receipt succeeds. Retained claims, residual funds and rounding dust are distinct. Tiny test payouts prove accounting, not commercial gas economics.
- A saved checkpoint and a retained proof are independent requirements. Analytics never supply settlement authority. Keep obligations running through outages and past submission.
- Do not promise an early cost-plus-2% buyback, monthly tranches, guaranteed fees, organic demand, audited safety, or a human study that did not happen.

## Final submission window

Preserve completed financial evidence and finish the fresh-user check now. Prepare the human recording in parallel; target upload by **18:30 Bucharest**, leaving 30 minutes for errors. The official deadline remains **19:00**, regardless of unfinished features. Keep the page honest if a gate remains open; do not replace live evidence with fixtures. [Official event rules](https://ethglobal.com/events/ethonline2026/info/details) were rechecked 13 September 2026; [submission.md](submission.md) contains the recording and attribution requirements.

Existing evidence: [stencil/listing regressions](design/STENCIL_VERIFICATION.md), [browser financial tests](evidence/browser.md), [independent reviews](evidence/integration-review.md), [live Graph](evidence/operations/live-series-one-graph.md), [remote restoration](evidence/operations/live-series-one-restore.json), [native endpoint oracle](evidence/operations/live-series-one-native-oracle.md). Lead owns current [STATUS](STATUS.md), README, integration and pushes.
