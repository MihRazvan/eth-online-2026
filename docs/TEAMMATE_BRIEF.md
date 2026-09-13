# usufruct — teammate brief and demo guide

For the team preparing the frontend, rehearsing the product and presenting to ETHOnline 2026 Classic judges. Updated 13 September 2026.

**App:** https://usufruct-mu.vercel.app · **Network:** Ethereum Sepolia · **Source:** https://github.com/MihRazvan/eth-online-2026

Use this brief to understand and present the project. Follow the companion [end-to-end test runbook](DEMO_TEST_RUNBOOK.md) for exact buyer/seller clicks, troubleshooting and the local rehearsal available now.

## The 30-second explanation

> usufruct lets a Uniswap liquidity provider sell a share of a fixed period of future USDC fees for cash upfront. The original position stays intact in escrow during that period. Buyers receive transferable fee claims; the LP retains the right to recover the same NFT. At settlement, an authenticated historical proof separates the sold income from later fees, and each holder redeems independently.

The name describes the separation between an asset and the right to enjoy its income. The supplied design uses **“The seed stays yours.”** Say “keep the right to recover your position” when explaining custody: the NFT really does leave the LP’s wallet temporarily.

**Why someone uses it:** the LP chooses upfront cash instead of waiting for uncertain fee income. Buyers choose exposure to that income without owning or managing the liquidity position. A secondary market lets holders trade claims when another participant supplies an executable quote.

## What works today

At this **13 September implementation checkpoint**, the supplied stencil redesign and seller-first signed listing flow are implemented and verified locally. Railway source `9d089b1` deployed successfully with the reviewed keeper and Graph services enabled. At 12:28 UTC, public `/api/operations` passed protocol, keeper, retention and off-host replication checks, and deployment pins independently matched. The keeper held 0.01 Sepolia ETH with nonce 0; `nextSeriesId=1` confirmed no activated series. These are live service probes, not a completed public financial lifecycle or restored series proof.

| Ready | Still required before an unattended public demo |
| --- | --- |
| Supplied stencil frontend, light/dark themes, wallet discovery and persistent signed seller listings; 78 hermetic browser checks | Verify operation through restart, an actual series endpoint checkpoint and authenticated remote restoration |
| Reviewed replacement contracts deployed on Sepolia; Graph Studio v0.2.0 indexes their address | Complete a real public sale → trade → capture → NFT return → allocation → redemption |
| Both actual local-chain settlement variants, including gasless seller publication, database restart and second-wallet funding/acceptance | Prepare real demo inventory, fresh executable quotes and funded participant wallets; complete unaided human acceptance |
| Railway service, 500 MB private persistent volume and private proof bucket provisioned; dedicated keeper funded with 0.01 Sepolia ETH | Confirm continuous Substreams operation and show its actual live instrument join; coordinate primary/fallback operators |

**The public site is not yet a complete live demo.** A disabled sale while preservation is unavailable is intentional. Do not bypass that gate, switch the public page to fixtures, or describe local receipts as Sepolia transactions. The user delegated provider choice and hosting setup is complete; no further hosting approval is pending. The initial public readiness checks pass; actual series endpoint/restoration evidence and the human financial rehearsal remain open. See [automated stencil/listing evidence](design/STENCIL_VERIFICATION.md) for the exact local verification scope.

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

Do a full rehearsal first. A new earning window cannot honestly turn into an immediate payout during the presentation. Prepare **three separately identified examples**, with links and IDs recorded:

| Example | Preparation | What it proves on screen |
| --- | --- | --- |
| A — earning | An accepted sale, with claims and a usable quote | The position is locked intact; fee exposure is a separate tradeable asset |
| B — captured, not allocated | Cutoff passed, actual fees captured, original NFT already returned; endpoint proof safely preserved | NFT recovery does not depend on waiting for cash allocation |
| C — allocated | Nonzero verified reserve, unredeemed maker inventory and a fresh executable sell quote | A judge can buy a small claim and redeem real test USDC now |

These examples do **not** exist on the current public deployment yet. Use their actual measured states once prepared. Keep enough C inventory for another judge, and renew quotes after state changes/redemptions.

| Time | Frontend action | What to say |
| --- | --- | --- |
| 0:00–0:25 | Open Market without connecting a wallet | “This is a market for a fixed period of Uniswap USDC fees. The LP gets cash upfront; buyers get the income rights.” |
| 0:25–1:05 | Open A; show original NFT, period, sold fraction and its funded-sale receipt / owner’s pinned position | “The buyer funded exact terms, and the LP accepted. The same position is now locked for this period.” Explain approval versus acceptance. |
| 1:05–2:10 | Open C; connect the buyer; **Review purchase → Confirm claim purchase**; open **Holdings** | “This is a separate, already-allocated period, prepared so you can test a payout today. Your claims carry its unpaid income.” Show actual token balances and receipt. |
| 2:10–2:50 | For Example C: **Holdings → Read claim & recovery → Redeem … claims → Confirm transaction** | “The contract pays the holder directly. The seller’s wallet is not needed.” Show the USDC increase and consumed claim balance. |
| 2:50–3:30 | Open B and its recovery information; show the NFT-return receipt | “The LP already recovered the NFT. The fee reserve stays protected while allocation is pending.” Point to proof status and, when available, **Download proof JSON**. |
| 3:30–4:00 | Summarize the integrations and open source/evidence links if useful | “Uniswap supplies the position and fees; Aqua/SwapVM trades the claims; authenticated historical state settles the fixed endpoint.” Show Graph buyer context only after its live join works. |

For a **live seller creation demo**, show gasless publication from the owner, discovery/funding from a separate buyer, then seller approval/acceptance. Allow extra time for those transactions. A separately prepared unaccepted funded offer can shorten the presentation only if that preparation is disclosed. Otherwise use A’s real recorded creation flow, clearly identified as a recording. Wallet confirmations vary; do not disguise waiting, prepared approvals or a switch between series.

If the public prerequisites are not ready, give a **clearly labelled local-chain demonstration**, with actual local transactions and controlled activity. Do not present the fixture preview as a completed public flow. The submitted recording should have human narration.

## What each integration should demonstrate

| Integration | Show | Do not claim yet |
| --- | --- | --- |
| Uniswap | An existing canonical v4 position, fixed custody/range, native USDC fees and return of the same NFT | A completed public nonzero lifecycle until its receipts exist |
| 1inch Aqua / SwapVM | Maker publication plus an actual secondary claim/USDC trade, balance changes and quote recovery | That a static order card or deployed router alone proves the integration |
| The Graph | Once ready: Subgraph instrument state joined with live Substreams activity/range history, source blocks and useful buyer context | That the currently deployed Subgraph alone completes the live composition; or that analytics authorize payouts |

Keep [sponsor evidence](evidence/sponsors.md), [AI/upstream attribution](AI_ASSISTANCE.md) and the [release checklist](JUDGE_READINESS.md) beside the demo recording. Retain ScopeLift credit in the repository. Describe the project as a tested prototype, not audited or production-safe software.
