# usufruct — teammate brief and demo guide

For the team preparing the frontend, rehearsing the product and presenting to ETHOnline 2026 Classic judges. Updated 13 September 2026.

**App:** https://usufruct-mu.vercel.app · **Network:** Ethereum Sepolia · **Source:** https://github.com/MihRazvan/eth-online-2026

Use this brief to understand and present the project. Follow the companion [end-to-end test runbook](DEMO_TEST_RUNBOOK.md) for exact buyer/seller clicks, troubleshooting and the local rehearsal available now.

## The 30-second explanation

> usufruct lets a Uniswap liquidity provider sell a share of a fixed period of future USDC fees for cash upfront. The original position stays intact in escrow during that period. Buyers receive transferable fee claims; the LP retains the right to recover the same NFT. At settlement, an authenticated historical proof separates the sold income from later fees, and each holder redeems independently.

The name describes the separation between an asset and the right to enjoy its income. The supplied design uses **“The seed stays yours.”** Say “keep the right to recover your position” when explaining custody: the NFT really does leave the LP’s wallet temporarily.

**Why someone uses it:** the LP chooses upfront cash instead of waiting for uncertain fee income. Buyers choose exposure to that income without owning or managing the liquidity position. A secondary market lets holders trade claims when another participant supplies an executable quote.

## What works today

The actual public **series 1** is now funded, traded, captured and allocated. Its original NFT returned before allocation. Hosted checkpointing, remote proof restoration and a real Graph buyer join are verified. **The teammate’s 1,000-claim redemption paid 0.099999 USDC. Original buyer/seller payouts and residual withdrawal are also confirmed; funded claims remain for judges. Unaided fresh-user understanding remains open.**

| Verified on Sepolia | Still required |
| --- | --- |
| NFT 39216 accepted at 11696226;0.25 test USDC paid for 2500 of 10000 original claims; fixed N11696317 | All three holder payouts and residual withdrawal are confirmed; maintain exact accounting for unredeemed judge claims |
| Teammate wallet 0x746b…4C6d bought 189+63+748 claims through Aqua:1,000 total | Maintain real unredeemed maker inventory and a fresh executable quote for judges |
| Actual capture 1.499999 USDC; same NFT returned at 11696393 while allocation was pending; allocation now records 0.999999 sold / 0.500000 residual | Actual allocation used 4,396,570 gas; teammate redemption 122,011 gas. Controlled 10-claim purchase/redeem also passed; preserve actual receipt/cost evidence |
| Dedicated keeper saved N at N+2; finalized proof restored into a fresh local DB using 2 remote GETs and no RPC witness fallback | Name primary/fallback human operators and keep obligations running after submission |
| Hosted Studio + Substreams join for real series 1 at 11696247; 22/22 observed blocks covered and in range | Show useful buyer context in the human demo; partial history and donations cannot be presented as a yield forecast |

The public self-test used the configured seller and a constrained Node-held browser wallet for initial funding; teammate purchases are separate real wallet activity. This does not establish a completed unaided participant study. The tested pool is **USDC/WETH**, and its activity includes **controlled funded donations**, not organic demand. The native collection comparison runs on an isolated fork of actual N and exactly matches 999999 USDC micros. It is not another public capture.

Confirmed payouts are **0.099999 USDC** for the teammate’s 1,000 claims, **0.149999 USDC** for the original buyer’s 1,500 claims, and **0.649999 USDC** for the seller’s 6,500 claims. The seller separately withdrew the **0.500000 USDC residual**. A later controlled holder bought **10 claims for 0.000500 USDC** and redeemed them for **0.000999 USDC** through the updated public UI. Current totals are **9,010 claims redeemed / 0.900996 USDC paid / 0.099003 USDC retained**, with **990 funded, unredeemed claims** reserved for judges. A single redemption of those 990 claims would pay 0.098999 USDC and leave four micro-USDC of rounding dust; splitting redemptions may increase dust. The reserve remains a liability, not available project cash. [Complete public lifecycle evidence](evidence/operations/live-series-one-lifecycle.md).

The controlled repeat [purchase](https://sepolia.etherscan.io/tx/0x239f863f30530277460a0ef8f05f03724196cf0f6cecc9767c894fb27a93b909) and [redemption](https://sepolia.etherscan.io/tx/0xd82bf3a5625e43d8e5018024cc546b87c84ebf8cbe4469ad3dc3d45452bdeb50) extend the earlier lifecycle snapshot. They are actual canonical receipt observations, not a claim of finality or a second unaided human session.

The renewed **990-claim / 0.049500-USDC ask**, expiring **20 September at 14:45 UTC**, is reviewed but its publication receipt is still pending at this checkpoint. Treat the older quote as stale after the redemption. Fresh executable inventory must be checked before inviting another buyer.

Evidence: [actual keeper/remote restore](evidence/operations/live-series-one-restore.json), [live Graph join](evidence/operations/live-series-one-graph.md), [native oracle](evidence/operations/live-series-one-native-oracle.md), [public transaction links](evidence/sponsors.md). The Railway service, 500 MB volume and private proof bucket are operated, normal restart passes, and no additional hosting approval is pending. New sales still require fresh readiness; a paused service is an actionable prerequisite, not permission to bypass the gate.

**Publishing can work while sales are paused.** With the real listing service available, the NFT owner can sign and publish or withdraw a nonbinding listing without ETH for gas. This currently supports standard EOA wallets. Funding, NFT approval and acceptance still require their actual transaction prerequisites and preservation readiness. A published listing does not mean the NFT is escrowed or that its income is guaranteed.

Use [the release checklist](JUDGE_READINESS.md) for current acceptance and [the operations runbook](deployment-operations.md) for the backend handoff. The latest deployed addresses are in [the public manifest](../deployments/sepolia.json). Old offer #2 was refunded; it is **not** a new demo offer to accept.

## How the product works

| Stage | What actually happens |
| --- | --- |
| Publish | An LP signs and publishes exact terms for an eligible Uniswap v4 position. This gasless signature advertises a nonbinding request for a funded offer; it does not approve or escrow the NFT, issue claims or pay the LP. |
| Fund | A **different wallet** escrows USDC against an exact NFT, position commitment, sold fraction, cutoff block and acceptance deadline. There are no fee claims yet. |
| Accept | The LP approves that NFT and accepts the funded terms. Payment goes to the LP; the NFT enters escrow; fee claims are issued. Unsold claims stay with the LP. |
| Earn / trade | Liquidity and range remain fixed. Current holders own their share of the entire period’s unpaid USDC income, including accrual before they purchased the claims. |
| Capture / return | Earning ends at the exact end of block **N**. Fees are collected at a later block **M > N**. The LP can then recover the same NFT even before cash allocation is complete. |
| Allocate / redeem | The contract authenticates endpoint evidence and splits the collected reserve. Holders redeem their claims independently; the seller does not need to return or sign. |

Withdrawing a listing removes the advertisement through another gasless signature. It does not cancel an already funded offer or refund its buyer. The buyer can cancel their own unaccepted offer onchain to recover its exact USDC; expiry alone never sends an automatic refund. Listings do not reserve a position exclusively, so competing buyers can fund separate offers.

**The rights must stay clear:**

- Only the pool’s **USDC-denominated fees** are sold. Other-currency fees and USDC earned outside the agreed period belong to the residual beneficiary. Pre-sale fees are cleared before activation.
- The app uses **10,000 original claims, Q**, per proposed sale. Redemption never changes that original denominator. Illustrative example: 2,500 claims receive 25% of a 40-USDC sold-period reserve, or 10 USDC before gas. Someone else redeeming first does not increase that share.
- Income can be zero. Being eligible does not mean the position is in range or profitable. The position’s value can still change. A quote is a trade price, not a guaranteed yield or exit.
- The LP cannot withdraw, change liquidity/range or collect the sold fees during the term. Early closure requires the residual right **and all original Q claims**, before the endpoint and before any redemption. There is no unilateral “buy it back for cost plus 2%” feature.
- Market dots represent shares of **one fixed period**, not separate monthly fruits. The original design-reference text was placeholder copy.

The backend preserves the closing block hash and proof bytes. It does **not** decide anyone’s payout. The checkpoint has a limited onchain recording window, N+1 through N+256; the proof must also be retained. Graph analytics cannot replace either settlement authentication or the actual USDC reserve.

## The frontend: what each page is for

| Page | Show the teammate / judge |
| --- | --- |
| [Market](https://usufruct-mu.vercel.app/#market) | Browse seller listings separately from issued fee claims. A listing asks a buyer to fund terms; an issued claim has an accepted series and may have executable resale quotes. Open either to inspect its exact period and next action. Sell-to-bid and maker actions are in Holdings. |
| [Pin a seed](https://usufruct-mu.vercel.app/#pin) | Select an existing NFT, publish signed terms, share the listing, then review a buyer-funded offer and approve/accept as owner. |
| [Holdings](https://usufruct-mu.vercel.app/#positions) | Claims held, funded offers awaiting acceptance, maker quotes, the right to recover pinned NFTs, transaction receipts and available recovery/redemption actions. |

**Frontend priority:** every step should answer “What do I own now?”, “What can I do next?” and “Why is this action unavailable?” Keep the supplied stencil/print identity, but use exact financial language beside the metaphor. Keep chain, period, wallet, amount and transaction status visible.

For the seller-first rehearsal: **Pin a seed → select NFT → set listing share, asking USDC, exact end block and UTC acceptance deadline → Review listing → Sign and publish listing**. Share the resulting `#listing/…` link or let the separate buyer discover it in Market. The buyer reviews the same signed terms and funds an offer; the seller follows the resulting offer link, approves the NFT and accepts. Keep the listing ID, funded-offer ID and eventual series ID distinct in the recording. Retrying a pending publication uses its saved exact draft; forgetting that browser draft does not withdraw a published listing.

## The judge demo: 3–4 minutes, using prepared real states

Series 1 is the real end-to-end example. Its earlier earning and proof-pending states are recorded states of that same series. **Do not describe them as three simultaneously available examples.** To show several states live, prepare separately identified series with their own receipts and operational coverage.

| Example | Current status | What it proves |
| --- | --- | --- |
| A — earning | Series 1 has passedN; use its clearly labelled earlier recording, or prepare another actual series | Fixed custody and range while fee claims trade |
| B — captured, not allocated | Series 1 passed through this state: NFT returned at 11696393; its receipt remains evidence | NFT recovery does not wait for fee allocation |
| C — allocated | Series 1 allocation observed at the lead’s 11696450 readback; teammate redemption confirmed; independent payouts/residual withdrawal are confirmed; funded judge inventory remains | Human teammate and controlled repeat payouts verified; 990 backed claims remain, with renewed quote publication pending |

A new earning window cannot become an instant payout in a presentation. Refresh quotes after allocation/redemption and disclose prepared inventory. Never use an earlier balance snapshot as proof that another judge can buy now.

| Time | Frontend action | What to say |
| --- | --- | --- |
| 0:00–0:25 | Open Market without a wallet | “An LP can sell a fixed period of Uniswap USDC fees for cash today, while keeping the right to recover the position.” |
| 0:25–1:05 | Show series 1’s recorded publication/funding/acceptance and receipt | “A separate buyer funded exact terms. Acceptance paid 0.25 test USDC and issued 2500 of 10,000 claims. Approval alone did not create the sale.” |
| 1:05–1:45 | Actual teammate Aqua purchases and holdings | “The claims carry the whole period’s unpaid income, including accrual before the purchase.” Show real transfers; do not call the session unaided unless that was observed. |
| 1:45–2:25 | Capture and NFT-return receipts, allocation state | “Collection received 1.499999 USDC. The NFT returned before allocation. The authenticated endpoint separates 0.999999 sold income from 0.500000later residual.” Disclose controlled donations. |
| 2:25–3:00 | Confirmed teammate redemption | “Each holder is paid by the contract using the original denominator.” Show the actual 0.099999 USDC payment for 1,000 claims and its receipt; do not imply a completed unaided study. |
| 3:00–3:40 | Current Graph buyer context and proof recovery | “Studio instrument state and Substreams pool history agree at a common finalized block. This is underwriting context; settlement comes from the contract’s authenticated proof.” Explain partial coverage. |
| 3:40–4:00 | Current available judge action and source links | Offer a verified fresh quote/redeem path only if it is executable. Keep source pins, costs and prototype limits available. |

For a **live seller creation demo**, show gasless publication from the owner, discovery/funding from a separate buyer, then seller approval/acceptance. Allow extra time for those transactions. A separately prepared unaccepted funded offer can shorten the presentation only if that preparation is disclosed. Otherwise use A’s real recorded creation flow, clearly identified as a recording. Wallet confirmations vary; do not disguise waiting, prepared approvals or a switch between series.

If the public prerequisites are not ready, give a **clearly labelled local-chain demonstration**, with actual local transactions and controlled activity. Do not present the fixture preview as a completed public flow. The submitted recording should have human narration.

## What each integration should demonstrate

| Integration | Show | Evidence boundary |
| --- | --- | --- |
| Uniswap | Canonical NFT 39216, fixed period/range, actual fees, return-before-allocation and public allocation | Independent native N comparison is fork-only; public payout/residual receipts are separately linked |
| 1inch Aqua / SwapVM | Three actual teammate purchases with FeeClaim/USDC transfers; current maker quote | Source-pinned fresh Aqua deployment and custom dispatcher are disclosed; quote inventory is not guaranteed |
| The Graph | Actual Studio/Substreams joined buyer context, source freshness and observed coverage | The recorded 22/22 blocks are partial-period history, not exact fee attribution, organic demand or settlement authority |

Keep [sponsor evidence](evidence/sponsors.md), [AI/upstream attribution](AI_ASSISTANCE.md) and the [release checklist](JUDGE_READINESS.md) beside the demo recording. Retain ScopeLift credit in the repository. Describe the project as a tested prototype, not audited or production-safe software.
