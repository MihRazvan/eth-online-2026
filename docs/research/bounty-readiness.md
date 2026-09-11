# usufruct: ETHOnline 2026 Classic readiness and implementation plan

Decision memo, 12 September 2026. Assessed implementation: `54c0465`. The user confirmed ETHOnline 2026, Classic; the local directory name is accidental. This plan supersedes the earlier decision to defer hackathon work. Findings describe inspected code and retained evidence; proposed acceptance checks are unfinished work.

Our strongest route is to complete a small, convincing public market around the existing protocol. Prioritize Uniswap and 1inch; pursue The Graph concurrently, with live composition as a firm submission gate. The distinctive demonstration is an LP receiving USDC, a claim changing hands, the original NFT returning while allocation remains pending, and an independent holder redeeming later from authenticated evidence. The orchard identity already gives that story a recognizable interface.

The deadline is **13 September, 19:00 Europe/Bucharest (16:00 UTC)**. There were approximately 42 hours remaining when this review finished. The event permits three partner selections. Classic requires project-specific work to begin during the event; AI assistance must be attributed and accompanied by meaningful human contributions. The submitted video must be 2–4 minutes, at least 720p, with human narration. Registration is user-confirmed; asset provenance, completed human review and successful submission are separate outstanding evidence. [Official event requirements](https://ethglobal.com/events/ethonline2026/info/details).

| Target | Applicable prize | Why usufruct fits | Remaining gate |
| --- | --- | --- | --- |
| Uniswap — Best Uniswap Stack Contribution | $3,000 pool; up to three $1,000 awards | Canonical individual v4 NFT custody, native USDC income rights, exact historical collection verification | Public walkthrough, reusable integration explanation, precise README pointers, reviewed feedback and submitted form |
| 1inch — Build an Aqua App | $5,000 pool; $2,500 / $1,500 / $1,000 | Tradable whole-period claims using Aqua shared maker capital and a SwapVM application router | Full public or qualifying fork token-transfer evidence, explicit deployment provenance, bid/ask and capital-depletion demonstration |
| The Graph — Composable or Standardized Graph Products | $5,000 pool; $2,500 / $1,500 / $1,000 | Reusable pool-context Substreams module composed with the application's Subgraph | Real provider delivery, deployed Subgraph, useful common-block analysis in the public app, reproducible reuse example |

These are target pools, not expected winnings or eligibility certifications. Uniswap requires open source, `FEEDBACK.md`, README integration pointers and its developer feedback form; a new hook is unnecessary. [Uniswap requirements](https://ethglobal.com/events/ethonline2026/prizes/uniswap-foundation). The Aqua track favors SwapVM, permits modified SwapVM redeployment, and accepts local forks for onchain transfer demonstrations. [1inch requirements](https://ethglobal.com/events/ethonline2026/prizes/1inch). The Graph requires live provider data and either multiple composed products or meaningful standardization; static or exclusively local evidence does not qualify. [Graph requirements](https://ethglobal.com/events/ethonline2026/prizes/the-graph).

## What is actually ready

The [public frontend](https://usufruct-mu.vercel.app) is deployed on Vercel, uses Sepolia, and excludes fixture wallets. A fresh browser review found no page errors or horizontal overflow at 390px. Orchard has zero sales. Pin and Cabinet require connection. `/api/recovery` and `/api/analysis` return 404. Deployment is complete; public financial acceptance is not.

The local transaction suite exercises funded acceptance, actual Aqua claim transfers, late collection, NFT return before proof, authenticated allocation and independent payouts. Stateful and callback regressions cover important failures. A genuine Sepolia proof separately matches native Uniswap collection on a fork. Six contracts and canonical NFT **39216** are publicly deployed. The public custody fork recorded **zero captured USDC**; it is not evidence of nonzero sold-period allocation or a full public market. See [deployment manifest](../../deployments/sepolia.json), [local lifecycle](../evidence/local-lifecycle.json), [public proof](../evidence/proof.md), and [custody fork](../evidence/sepolia-fork-custody.json).

The settlement worker independently authenticates and persists witnesses; the browser can recover through its API or verified onchain growth cache in local tests. The data stack has tested cursor/undo handling, identity checks and a reusable WASM module. Neither stack is presently a complete hosted production service. Existing agent reviews and passing suites are scoped engineering evidence, not an independent human security audit.

## Critical path: operate endpoint preservation before selling

The most consequential gap is [BlockHashCheckpoints](../../contracts/src/proof/BlockHashCheckpoints.sol). It relies on `BLOCKHASH`: checkpoint N in blocks **N+1 through N+256**. Without that checkpoint or already authenticated cached growth, this verifier cannot later allocate the reserve. Retaining the witness alone does not fix a missing anchor. The NFT can still return after capture, but buyer money remains unresolved. The [retention worker](../../packages/settlement/src/worker.mjs) explicitly does not sign transactions.

Implement a separate, narrowly scoped checkpoint process. Restrict its chain, checkpoint contract, due endpoints, transaction value and fee limits; isolate a small testnet gas wallet from the deployment key. Persist nonce/receipt state, retry dropped transactions, replace only within configured caps, and reconcile reorgs. Target canonical checkpoint inclusion by N+16 under normal conditions, with a designated fallback operator and alerts well before the hard boundary. This is a proposed service target, not current performance evidence.

Acquire the witness promptly at N rather than assuming an archive RPC will remain available. Revalidate canonicality and finality afterward. Treat observation-provider availability separately from proof-provider availability: the current worker still depends on its primary RPC for discovery. Two directories on one host are not independent failure domains. Preserve an authenticated copy off host and rehearse restoration after loss of the primary database and artifact directory.

Acceptance before public activation:

- A short isolated rehearsal survives process restart, a dropped checkpoint transaction and primary RPC outage without losing N.
- An independent read confirms the checkpoint hash and retained witness bind to the same canonical endpoint; a reorg invalidates stale records and triggers recovery within the window.
- A public HTTPS recovery URL serves the exact scoped witness and explicit retention/checkpoint/finality state; malformed or oversized requests fail safely.
- Loss of the primary storage copy is recoverable from the other failure domain. The operator can see low balance, service lag, missing witness and missing checkpoint separately.
- The operator remains responsible through every activated endpoint and unresolved liability, including after judging.

Keep Vercel for the frontend. Host the existing Node 24/Python services continuously on a persistent volume, with a separate signing process and a small HTTPS gateway. Proxy only the necessary public read routes from Vercel; keep provider credentials server-side. Add bounded requests, concurrency control, caching and health reporting. Vercel cron is not a substitute for this continuous retention/SQLite design; its Hobby schedule is especially unsuitable. [Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing).

Use an existing host if available. Otherwise Railway is a reasonable small-service candidate: its Hobby plan currently starts at $5/month including $5 of usage, with additional usage billable. A proposed $20–30 initial budget is a planning allowance, not a purchased plan or guaranteed bill. Confirm the account, quota and spend controls before paid provisioning. Persistent volumes and scheduled backups help operations but do not replace timely off-host witness replication. [Railway plans](https://docs.railway.com/pricing/plans), [volumes](https://docs.railway.com/volumes), [backups](https://docs.railway.com/volumes/backups).

## Make the real product usable with small test balances

The [offer form](../../apps/web/src/App.tsx) currently exposes payment but fixes the sold amount at 8,000 of 10,000 claims and defaults the endpoint to current block plus 129,000. At an assumed 12-second interval that is roughly 18 days, unsuitable for the immediate walkthrough. Payment defaults to 672 USDC; maker defaults of 1,000 claims and 84 USDC also need manual correction for the prepared balances.

Add explicit sold-share, endpoint and acceptance-deadline controls, keeping original Q fixed if helpful. Offer practical short test presets, but review and sign the exact block N; wall-clock dates remain estimates. Show available balance, exact payment, retained share, immutable range/liquidity and the consequences of acceptance before requesting signatures. Validate onchain constraints and reject expired/impossible terms. NFT approval must remain distinct from accepting a funded offer.

Make maker entry start from actual available inventory, with unit price and total clearly visible. Keep the existing entitlement receipt: claims carry their share of **all unpaid sold-period USDC**, including income before purchase, with original Q as denominator. Maturity does not itself make funds redeemable. Show who maintains the endpoint evidence and which transactions cost gas. An unavailable cost estimate must not appear as zero.

For this session, use the prepared NFT and one explicitly agreed funded offer. Discovery currently considers configured NFT IDs and IDs referenced by offers/series; it does not enumerate every NFT in a connected wallet. Seller selection currently favors highest absolute proceeds rather than comparing different terms. These limitations must be visible in the runbook. Generic discovery and competing-offer selection become necessary before inviting arbitrary LPs, but do not block this bounded acceptance session.

Acceptance: two separate participant wallets fund and accept a small offer entirely through the application, with reviewed terms matching the receipt. Another participant finds and buys an executable claim without navigation coaching. Record assistance and misunderstandings using the existing [user-test protocol](../user-test-plan.md), especially fixed Q, prior unpaid income, frozen bands and unavailable resale.

## Produce one public lifecycle with nonzero economics

Use a deliberate short endpoint only after the operational rehearsal passes. Reserve enough time for participant signatures, source indexing and recovery. Snapshot actual balances before choosing small USDC amounts; the setup record's remaining 15.05 USDC is historical, not a current balance guarantee.

1. Seller shows the original canonical NFT and accepts the independently funded buyer offer through the UI.
2. Generate and label controlled pre-N pool activity; then trade some issued claims through Aqua so the new holder acquires already accrued unpaid income.
3. Save the canonical checkpoint and witness. Generate separately labeled post-N activity, capture at M>N, and return the same NFT while allocation remains pending.
4. Temporarily make proof delivery unavailable only after evidence and anchor safety are established. Restore delivery or use a retained witness; a different wallet submits valid evidence.
5. At least two holders redeem independently. Reconcile actual reserve, original-Q entitlements, residual USDC, other-currency proceeds and floor dust against receipts and an independent native-N oracle. Run that native collection on an isolated fork at the public endpoint, not on the active public position; label the oracle replay as fork evidence alongside the public receipts.
6. Show an executable bid as well as an ask, cancellation and overlapping Aqua inventory depletion. Preserve the financial claims' scope as lifecycle state changes invalidate stale quotes.

Controlled swaps/donations are test inputs, not organic revenue or demand. Store chain, contract addresses, exact terms, transaction hashes, balance deltas, gas used, witness digest and source block hashes. Preserve full public evidence separately from local and fork fixtures. A failed or zero-income run does not become a successful nonzero allocation test by relabeling it.

After closing the demonstration series, the returned NFT can support a second small active series for judge exploration. That avoids a permanently empty Orchard without inventing activity or minting unnecessary example positions. Every active sale still requires an operator and explicit term/funding review.

For Aqua provenance, document that the public runner deploys a new Aqua instance from pinned official source and a custom `FeeStripRouter`; it does not use an existing official router address. The two added dispatcher instructions are unmodified upstream instructions that the default dispatcher omits. Source compatibility is not deployment endorsement. The official rules explicitly permit modified SwapVM redeployment but are less explicit about a newly deployed Aqua instance. Retain exact runtime hashes and source pins; prepare a full lifecycle/trade fork against a verified official Aqua deployment as a fallback, or obtain a sponsor clarification through the team. Do not send that inquiry without authorization. [Runtime decision](../decisions/002-aqua-runtime.md), [deployment code](../../scripts/public/deploy.mjs).

## Make The Graph useful and demonstrably live

The existing composition is the right scope: Substreams provides pool context; the Subgraph supplies series rights and lifecycle; the server joins both at a checked common block. Show range occupancy over a stated interval, coverage, freshness and the sold-period USDC needed for the chosen purchase to break even. The Graph must never determine payout allocation. Do not present event-derived context as exact fee entitlement or a yield forecast.

Deploy a generated Sepolia Subgraph manifest from `deployments/sepolia.json`, using the actual FeeStrip address and deployment start block **11684159**. The checked-in template has a zero address and must not be deployed unchanged. Run handlers against actual activation, capture and allocation before declaring indexing successful.

Studio deployment is distinct from publishing onchain to the decentralized network. Its development query URL is suitable for initial integration, subject to its documented quota; add caching and confirm account limits. A mainnet publication transaction is not necessary merely to produce the live Studio evidence accepted by this target. Required account inputs are Studio slug/deploy access, resulting deployment identity/query URL, and query authentication where needed. [Studio deployment](https://thegraph.com/docs/en/subgraphs/developing/deploying-publishing/using-subgraph-studio/).

For Substreams, obtain the Graph Market **JWT API Token**, not just the API-key identifier; the existing runner uses `SUBSTREAMS_API_TOKEN`. Sepolia is listed at `sepolia.eth.streamingfast.io:443`; authenticate and qualify the actual account/provider before relying on it. Start early enough to seed the pool tick and cover the series activation. A two-block smoke query is not meaningful history coverage. [Graph Market access](https://thegraph.com/docs/en/substreams/providers/the-graph-market/), [supported endpoints](https://docs.substreams.dev/reference-material/chain-support/chains-and-endpoints.md).

Acceptance:

- The provider delivers actual blocks into the existing sink; a restart resumes the cursor without duplicate effects. Exercise undo handling separately from finalized-only production ingestion.
- The live Subgraph returns the actual series. Retain a composed response containing matching chain/pool/block/hash, deployment identity, package digest, cursor, source heads and coverage.
- Fix or calibrate freshness semantics: `compose.mjs` defaults to a 32-block lag threshold while the sink defaults to finalized-only data. Normal finality delay may therefore be labeled stale. Measure that behavior and distinguish expected finality lag from stalled indexing.
- The deployed UI displays the result. Separate pool context from quote-specific break-even where practical, so absence of an executable ask does not hide otherwise valid observations.
- Publish the reusable `.spkg`, configuration and a second consumer/pool example demonstrating reuse without changing module code. Do not claim multichain validation from a configuration option alone.

Live Graph access is a dependency, not a reason to stall checkpoint/UI work. If the joined view cannot pass before feature freeze, preserve its honest unavailable state and exclude this target from completed-integration claims. Do not add an AI chatbot or another Graph track to compensate.

## Measure the costs and review the remaining risks

The retained public four-slot proof costs **4,417,289 call gas** for a witness of **14,400 ABI bytes**, against **0.000208 test USDC** of observed native income. This is a component call, not full transaction cost or commercial economics. The current local lifecycle records **1,425,145 gas** for settlement using a different trie. Earlier prose cited 1,555,680; the current machine-readable receipt is authoritative. [Public proof measurements](../evidence/proof.md), [local receipt](../evidence/local-lifecycle.json).

Before making affordability claims, measure public-sized direct settlement and growth-cache paths, including intrinsic/calldata cost and each holder's redemption. Compare reuse across 1, 2, 5 and 20 series where practical. Reuse requires the same pool, endpoint, ticks and currency side; sharing only a pool is insufficient. Publish gas and ETH cost at explicit gas-price scenarios, identifying the payer. Do not turn a small test notional into evidence of economical retail lots.

Independent review should focus on the historical verifier/MPT dependency, custody and reserves, and the new checkpoint signer. Existing accounting review excluded its author's own proof code; vendored dependencies are excluded from the first-party Slither report. Preserve that scope distinction. Differential tests should compare native collection and cover wrapping growth, tick boundaries, absent storage and malformed proof branches.

Asset admission also needs a bounded initial policy. The contract accepts any other currency in a qualifying hookless USDC pool, but capture collects both currencies atomically before NFT return. A failing other token can obstruct capture. Start the public experience with the prepared verified WETH/USDC position, document the broader contract surface, and review token pause/blacklist/failure behavior before broader admission. A UI allowlist alone is not a contract restriction.

For post-event hardening, EIP-2935 can extend accessible historical hashes to 8,191 blocks while `BLOCKHASH` itself remains limited to 256. It does not retain missing state witnesses. This merits a separately reviewed checkpoint/verifier deployment, boundary and chain-code tests, and explicit migration; current immutable bindings cannot silently acquire that behavior. Do not rush an unreviewed verifier replacement into this demonstration. [EIP-2935](https://eips.ethereum.org/EIPS/eip-2935).

## Delivery order and ownership

Times below are proposed checkpoints in **Europe/Bucharest**, not promises of completion. Provider access and indexing latency can change the critical path. The lead owns integration, manifests, shared interfaces, deployment and evidence. Specialists own bounded checkpoint/Graph/UI work with separate review for financial changes.

| Checkpoint | Required outcome | Dependency or fallback |
| --- | --- | --- |
| 12 September morning | Host/access decision; checkpoint and recovery rehearsal; explicit short-term UI in review | Prepare configuration, tests and UI without waiting for credentials; no active public sale before endpoint operations pass |
| 12 September afternoon/evening | First complete nonzero public lifecycle; live Graph sources catching up; actual public proof cost measured | Use canonical fork evidence only with a clear scope label; it does not close public acceptance |
| 13 September, 12:00 | Feature freeze; final wallet/browser regression, evidence reconciliation and human review | Unfinished Graph remains unfinished; fix defects rather than add integrations |
| 13 September, 15:00 | Human-narrated video and sponsor-specific evidence ready | Show recorded real transactions with honest edits and network labels |
| 13 September, 17:00 | Internal submission target | Two-hour buffer before the official 19:00 deadline; team submits and confirms receipt |

Suggested implementation commits: explicit bounded offer terms; checkpoint keeper and fault tests; persistent service deployment and recovery routes; live Graph configuration/composition; public lifecycle evidence; sponsor packet. Commit actual coherent work as it passes relevant checks. Do not change timestamps or manufacture history.

The demonstration should spend its time on the financial lifecycle: approximately 20 seconds for the proposition, 35 for acceptance, 40 for Graph-informed evaluation and Aqua trading, 45 for late capture/NFT return, 45 for independent recovery/redemption, and 20 for costs, evidence and attribution. Refresh all figures from the recorded run. Keep the existing design; additional animation, charts and marketing pages are lower priority than understandable signing and recovery.

## Team inputs and what can proceed without them

The remaining access question is whether the team already has **Graph Studio/Market access and an always-on host**. Store credentials in local/host secrets, never in chat or committed configuration. The lead can prepare the container, manifest generation, keeper, UI and tests before access arrives. Any new paid subscription needs a concrete plan and budget decision.

The team supplies participant wallets/signatures for the real user session, a human engineering/product review of the rights and observed results, and human narration/submission. Keep participants' keys in their wallets. Record who did what and any unresolved disagreement. Confirm the creation dates and origin of supplied project-specific visual references against Classic's start-fresh rule; the supplied date alone does not establish when those assets were created. Never invent human contributions to satisfy eligibility wording.

The submission should link directly to contracts, public receipts, a functioning quote, recovery evidence, the live composed query and reusable module. Update `FEEDBACK.md` with current provider-specific observations, then have the team complete the Uniswap form. Source-pinned official libraries, ScopeLift prior work, fonts, design references and AI assistance retain their truthful attribution.

After this sprint, product robustness requires broader provider/load testing, independent security review, economically useful lot sizes, real LP/buyer interviews, competing-offer discovery and dependable market liquidity. These are the next product questions; a polished testnet demonstration cannot answer them by itself.
