# usufruct submission packet

Updated 13 September 2026 after live series 1 allocation was observed. ETHOnline 2026 **Classic** is user-confirmed. This packet is ready for human review; it is not a submitted entry or eligibility certification. [Owner checklist](JUDGE_READINESS.md), [bounty evidence](evidence/sponsors.md), [AI assistance record](AI_ASSISTANCE.md).

**usufruct: sell your Uniswap fees upfront, keep the right to recover your position.** An LP signs a listing for a fixed period of USDC fees. A separate buyer funds exact terms; the LP accepts, gets cash and escrows the unchanged NFT. Transferable claims carry the whole period's unpaid income. The same NFT can return before allocation, while the contract protects the collected fee reserve.

**App:** https://usufruct-mu.vercel.app · **Series 1:** https://usufruct-mu.vercel.app/#market/1 · **Repository:** https://github.com/MihRazvan/eth-online-2026

## What is actually demonstrated

| Evidence | Actual result | Boundary |
| --- | --- | --- |
| Public funded sale | NFT 39216, activation 11696226, end N 11696317, original 10,000 claims; seller receives 0.25 USDC for 2,500 claims | Seller and initial buyer used a constrained Node-held browser wallet; this is actual Sepolia execution, not a human acceptance study |
| Public Aqua trades | A teammate bought 189, 63 and 748 claims: 1,000 total; real FeeClaim/USDC transfers | Earlier planned agent-controlled holder inventory is superseded by actual transfers. [Trade links](evidence/sponsors.md) |
| Public capture and NFT return | Capture 1.499999 USDC; same NFT returned at 11696393 while allocation was false | Controlled funded donations are disclosed; no organic-volume claim |
| Public allocation | Observed at 11696450: 0.999999 USDC sold reserve and 0.500000 USDC residual; NFT already returned | [Allocation transaction](https://sepolia.etherscan.io/tx/0xf5cbfa5deb0b7ecd05d59a06daec73ca6c9a5def7dc50aea10fc904abcc50101). Teammate redeemed 1,000 claims for 0.099999 USDC at 11696463; remaining wallets, residual withdrawal and final dust remain open. Allocation used 4,396,570 gas |
| Operated endpoint recovery | Keeper saved N at N+2; receipt and endpoint finalized. Exact proof restored from 2 remote GETs into a fresh local DB and two authenticated copies | Zero remote writes, no RPC witness fallback, no hosted failover. [Evidence](evidence/operations/live-series-one-restore.json) |
| Independent native endpoint oracle | Actual endpoint state on an isolated fork produces 999999 USDC micros, matching the authenticated witness | The comparison capture transaction is fork-only. [Explanation](evidence/operations/live-series-one-native-oracle.md) |
| Live Graph composition | Studio series 1 state + hosted Substreams at finalized 11696247; 22/22 observed blocks covered and in range | Partial-period snapshot, zero indexing lag relative to finalized history; no exact-fee or forecast authority. [Evidence](evidence/operations/live-series-one-graph.md) |

Allocation and payouts use the immutable original **Q**, not remaining token supply. Someone else's redemption does not increase a holder's fraction. Residual USDC and the seller's retained claims are different rights. [Product contract](../feestrip-handoff/PRODUCT_CONTRACT.md).

The actual teammate redemption is [0x3ac5…8a3e](https://sepolia.etherscan.io/tx/0x3ac55ef51fee55243983065ab343e41d9b1dd57b72f02a4d0f3340822f028a3e), using 122,011 gas. This verifies that wallet’s purchase-to-redemption path. It does not establish unaided comprehension, a second fresh session or a submitted video.

## Selected partner targets

Use **Uniswap: Best Uniswap Stack Contribution**, **1inch: Build an Aqua App**, and **The Graph: Best Use of Composable or Standardized Graph Products**. The [sponsor matrix](evidence/sponsors.md) gives the exact requirements, source links, deployment provenance and remaining evidence. The official pages were rechecked 13 September 2026. Do not select the Continuity-only Uniswap/Aqua pools for this Classic entry or substitute a Graph AI/one-prompt claim.

The Graph live-composition gap is now closed for the retained nonempty snapshot. The human demo still needs to show why instrument state and pool history are useful together. Aqua public transfers are now recorded. The Uniswap developer feedback form still needs human completion, including the repository FEEDBACK link.

## What the team must finish today

The official deadline is **13 September 2026, 12:00 EDT = 16:00 UTC = 19:00 Bucharest**. The event permits up to three partner selections. Video must be **2–4 minutes, 720p or higher, with human narration**; ordinary cuts may remove waits, but no sped-up footage or AI voiceover. Classic needs project-specific work to begin during the event; disclose reused code/assets and actual AI assistance, retain specs/prompts, and record meaningful human contributions. [Official rules](https://ethglobal.com/events/ethonline2026/info/details).

- **Lead:** finish actual independent holder payouts, residual/dust and gas reconciliation; update links and keep a real unredeemed judge path executable. Verify the final app/CI and preserve live operations.
- **Teammate:** redemption is confirmed; report any confusing step and assistance. Complete one fresh unaided purchase/redemption and a second repeat if feasible. A pending request is not a successful payout.
- **Team reviewer:** review financial rights, upstream credit, design-reference provenance and actual authorship in the AI record. Do not invent human engineering or tests.
- **Human presenter:** record the demonstrated flow below with exact series labels and current receipts. Keep the donation disclosure and prototype limits.
- **Submission owner:** review FEEDBACK, complete Uniswap's form, select the three intended dashboard partners, upload and retain the submission confirmation. Target upload by 18:30 Bucharest to leave recovery time.

No named human owner or completed form/video/upload is assumed. No additional hosting purchase or credential is needed for these documented tasks.

## Recording outline — about 3 minutes 30 seconds

Use actual production screens and actual Sepolia receipts. Series 1's earlier states can be shown from recorded footage; label recording and block/series clearly. It cannot be simultaneously earning, proof-pending and allocated. A new active example needs another honestly labelled series. Refresh prices/inventory before recording.

| Time | Show | Human narration draft |
| --- | --- | --- |
| 0:00–0:20 | Market and product introduction | “usufruct lets a Uniswap LP sell a fixed period of USDC fees upfront. Buyers get income rights; the LP keeps the right to recover the same position.” |
| 0:20–0:55 | Recorded series 1 listing, buyer funding and seller acceptance; actual receipt | “The seller publishes exact terms. A separate buyer funds them. NFT approval alone is not the sale: acceptance pays 0.25 test USDC and issues 2500 of 10,000 claims.” |
| 0:55–1:25 | Actual Aqua purchase and holdings | “These claims can trade. A teammate bought 1000 through three real transactions. Each claim includes its fraction of the entire period's unpaid income, including income before the trade.” |
| 1:25–2:00 | End N, capture and NFT-return receipt | “This test uses funded donations, not organic trading volume. Later collection received 1.499999 USDC. The original NFT returned before allocation, with the fee reserve still protected.” |
| 2:00–2:35 | Actual allocation, proof recovery and teammate payout | “The historical proof separates 0.999999 USDC earned by N from 0.500000 earned later. A dedicated keeper saved N, and we restored its proof from independent remote storage.” Show the teammate’s confirmed 1,000-claim redemption and 0.099999 USDC increase; identify remaining wallet/residual checks honestly. |
| 2:35–3:00 | Live buyer analysis and source context | “The Graph joins the actual instrument with observed pool history at the same finalized block. This provides range context and break-even information; it never decides settlement.” Show partial coverage honestly. |
| 3:00–3:30 | Source/evidence and current judge action | “Uniswap supplies the position and fees; Aqua/SwapVM trades the claims; authenticated historical state settles the fixed cutoff. This is a tested prototype with real proof costs and uncertain future income.” Offer the current buy/redeem path only if inventory and payouts have been verified. |

Explain the public/fork distinction when using the native-oracle comparison. The independent fork proves native N equality; the onchain allocation receipt is the public action. Do not narrate planned payouts, test balances or gas estimates as completed transactions.

## Reproducibility and credit

[Exact manual/local runbook](DEMO_TEST_RUNBOOK.md), [development setup](development.md), [public deployment](../deployments/sepolia.json), [financial contract](../contracts/src/FeeStrip.sol), [Aqua provenance](decisions/002-aqua-runtime.md), [Substreams package](../packages/substreams/README.md), [Subgraph](../packages/subgraph/README.md), [independent reviews](evidence/integration-review.md).

ScopeLift's [Fixed Fee Swap](https://github.com/ScopeLift/fixed-fee-swap) is credited prior work; there is no first-ever fee/principal-separation claim. Preserve licenses and the file/component-specific [AI assistance record](AI_ASSISTANCE.md). The prototype is not audited, production-safe or commercially validated. Local fixture/browser results remain separately labelled regression evidence. Final eligibility and successful submission belong to the organizers and recorded dashboard outcome.
