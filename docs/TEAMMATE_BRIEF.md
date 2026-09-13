# usufruct — teammate brief and demo guide

For the team preparing the frontend, rehearsing the product and presenting to ETHOnline 2026 Classic judges. Updated 13 September 2026.

**App:** https://usufruct-mu.vercel.app · **Network:** Ethereum Sepolia · **Source:** https://github.com/MihRazvan/eth-online-2026

Use this brief to understand and present the project. Follow the companion [end-to-end test runbook](DEMO_TEST_RUNBOOK.md) for exact buyer/seller clicks, troubleshooting and the local rehearsal available now.

## The 30-second explanation

> usufruct lets a Uniswap liquidity provider sell a share of a fixed period of future USDC fees for cash upfront. The original position stays intact in escrow during that period. Buyers receive transferable fee claims; the LP retains the right to recover the same NFT. At settlement, an authenticated historical proof separates the sold income from later fees, and each holder redeems independently.

The name describes the separation between an asset and the right to enjoy its income. The supplied design uses **“The seed stays yours.”** Say “keep the right to recover your position” when explaining custody: the NFT really does leave the LP’s wallet temporarily.

**Why someone uses it:** the LP chooses upfront cash instead of waiting for uncertain fee income. Buyers choose exposure to that income without owning or managing the liquidity position. A secondary market lets holders trade claims when another participant supplies an executable quote.

## What works today

At the live check on **12 September, 14:22 UTC / 17:22 Bucharest**, the current deployment had **zero activated series** and `/api/operations` returned **503 — OPERATIONS_NOT_AVAILABLE**.

| Ready | Still required before an unattended public demo |
| --- | --- |
| Branded frontend on Vercel; wallet position discovery; separate buyer/seller offer flow | Operate the checkpoint signer, proof retention, remote backup and public recovery API |
| Reviewed replacement contracts deployed on Sepolia; Graph Studio v0.2.0 indexes their address | Complete a real public sale → trade → capture → NFT return → allocation → redemption |
| Full local transaction/browser lifecycle; prior implementation CI (see STATUS for current verification) | Prepare real demo inventory, fresh executable quotes and funded participant wallets |
| Checkpoint and authenticated backup/recovery implementations tested locally | Operate the Substreams history/analysis service and show its actual live join |

**The public site is not yet a complete live demo.** A disabled sale while operations are unavailable is intentional. Do not bypass that gate, switch the public page to fixtures, or describe local receipts as Sepolia transactions. Hosting remains unprovisioned pending the team’s decision; an existing reliable server can replace the proposed Railway setup.

Use [the release checklist](JUDGE_READINESS.md) for current acceptance and [the operations runbook](deployment-operations.md) for the backend handoff. The latest deployed addresses are in [the public manifest](../deployments/sepolia.json). Old offer #2 was refunded; it is **not** a new demo offer to accept.

## How the product works

| Stage | What actually happens |
| --- | --- |
| Publish | An LP signs and publishes exact terms for an eligible Uniswap v4 position. The signature advertises a request for a funded offer; it does not approve or escrow the NFT. |
| Fund | A **different wallet** escrows USDC against an exact NFT, position commitment, sold fraction, cutoff block and acceptance deadline. There are no fee claims yet. |
| Accept | The LP approves that NFT and accepts the funded terms. Payment goes to the LP; the NFT enters escrow; fee claims are issued. Unsold claims stay with the LP. |
| Earn / trade | Liquidity and range remain fixed. Current holders own their share of the entire period’s unpaid USDC income, including accrual before they purchased the claims. |
| Capture / return | Earning ends at the exact end of block **N**. Fees are collected at a later block **M > N**. The LP can then recover the same NFT even before cash allocation is complete. |
| Allocate / redeem | The contract authenticates endpoint evidence and splits the collected reserve. Holders redeem their claims independently; the seller does not need to return or sign. |

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
| [Market](https://usufruct-mu.vercel.app/#market) | Issued fee claims, their earning period, available quotes and the difference between a price and uncertain income. Open a claim to inspect terms, buy and follow settlement. Sell-to-bid and maker actions are in Holdings. |
| [Pin a seed](https://usufruct-mu.vercel.app/#pin) | Select an existing NFT, publish signed terms, share the listing, then review a buyer-funded offer and approve/accept as owner. |
| [Holdings](https://usufruct-mu.vercel.app/#positions) | Claims held, funded offers awaiting acceptance, maker quotes, the right to recover pinned NFTs, transaction receipts and available recovery/redemption actions. |

**Frontend priority:** every step should answer “What do I own now?”, “What can I do next?” and “Why is this action unavailable?” Keep the supplied stencil/print identity, but use exact financial language beside the metaphor. Keep chain, period, wallet, amount and transaction status visible.

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

For a **live seller creation demo**, prepare an additional unaccepted funded offer and allow extra time for the seller’s approval/acceptance transactions. Otherwise use A’s real recorded creation flow, clearly identified as a recording. Wallet confirmations vary; do not disguise waiting, prepared approvals or a switch between series.

If the public prerequisites are not ready, give a **clearly labelled local-chain demonstration**, with actual local transactions and controlled activity. Do not present the fixture preview as a completed public flow. The submitted recording should have human narration.

## What each integration should demonstrate

| Integration | Show | Do not claim yet |
| --- | --- | --- |
| Uniswap | An existing canonical v4 position, fixed custody/range, native USDC fees and return of the same NFT | A completed public nonzero lifecycle until its receipts exist |
| 1inch Aqua / SwapVM | Maker publication plus an actual secondary claim/USDC trade, balance changes and quote recovery | That a static order card or deployed router alone proves the integration |
| The Graph | Once ready: Subgraph instrument state joined with live Substreams activity/range history, source blocks and useful buyer context | That the currently deployed Subgraph alone completes the live composition; or that analytics authorize payouts |

Keep [sponsor evidence](evidence/sponsors.md), [AI/upstream attribution](AI_ASSISTANCE.md) and the [release checklist](JUDGE_READINESS.md) beside the demo recording. Retain ScopeLift credit in the repository. Describe the project as a tested prototype, not audited or production-safe software.
