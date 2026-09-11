# FeeStrip IDE build prompt

You are the lead engineer responsible for building FeeStrip in `https://github.com/MihRazvan/eth-online-2026`. Take ownership of implementation, integration, design quality and verification. Use your actual available tools, relevant skills and independent subagents intelligently. Continue through working software; do not end after producing a plan or scaffolding.

The repository was empty when this handoff was prepared on September 11, 2026. Inspect its current state before changing anything. The team has experienced fullstack and smart-contract developers. Do not cut product scope based on assumed hackathon time pressure.

If a `feestrip-handoff/` packet is present, first read its `README.md` and `PRODUCT_CONTRACT.md`. Load `WORKFLOW.md`, `DESIGN.md`, `TOOLS.md` and research references only when relevant to your task. This prompt is sufficient to begin if the packet is absent. Prior research is evidence and a starting hypothesis; current source, executable experiments and the product requirements below determine implementation. Inherited test results concern isolated fixtures or upstream components: no complete FeeStrip lifecycle or genuine public-chain FeeStrip settlement proof has yet been validated.

## The product

**FeeStrip: sell your Uniswap fees upfront, keep your position.**

An LP accepts an upfront USDC payment for a defined period of an existing Uniswap v4 position's USDC fee income. The NFT is held in escrow with its liquidity and price range fixed. The LP retains the right to recover the original NFT. Buyers receive fractional, tradable claims to the agreed period's income and can redeem without further approval from the seller.

Build a complete market: discover and evaluate claims; accept funded offers; trade claims through Aqua/SwapVM; observe their backing and settlement; recover the NFT and redeem the fees. Buyers decide prices using evidence about activity and range risk. Estimates are not guaranteed income. This is a substantial onchain product, not a generic dashboard or an AI chatbot wrapped around APIs.

ScopeLift's Fixed Fee Swap is a close public predecessor. Credit it. Our intended distinction is existing individual NFT preservation, whole-period claims carrying unpaid income, exact delayed settlement and direct claim/USDC trading. Do not claim the first-ever separation of LP fees from principal.

## Financial requirements you must preserve

1. Initially support validated, nonempty, hookless canonical Uniswap v4 PositionManager NFTs containing the selected chain's authentic USDC token. Verify managers, token addresses and deployed code; never infer compatibility from EVM support alone.
2. Sell only future fee income denominated natively in the pool's USDC currency during the agreed period. Other-currency fees remain with the residual owner. Do not silently introduce swaps, dollar-conversion oracles or a claim on all fee currencies.
3. Clear fees earned before activation to the LP. Freeze the exact NFT, pool, price range, liquidity, earning baseline and end-of-block N for the series. The LP cannot adjust bands, add/remove liquidity, collect sold fees or withdraw during the active term.
4. Activation must be atomic with a funded offer, exact terms, seller minimum proceeds and deadline. Failed payment or validation must leave no activated sale. Draft listing does not lock the NFT. Approval to transfer an NFT is not consent to arbitrary sale terms.
5. Mint a fixed original quantity Q of fee claims. Unsold claims can remain with the LP. Every token carries its share of all unpaid income for the sold period, including income accrued before a transfer. Do not copy per-holder dividend checkpoints from another yield-token design. No late minting or unrestricted burns that corrupt the payout denominator.
6. Keep the NFT return right separate from fee claims. It also covers other-currency fees and USDC outside the sold window; retained in-window USDC belongs to retained fee tokens, preventing overlapping rights. Position ownership does not guarantee its dollar value.
7. Settle the exact agreed endpoint, even when collection happens later. The baseline design authenticates historical pool state at end-of-block N. A current RPC value, Graph estimate, server signature or keeper-selected amount is not an acceptable substitute for that endpoint.
8. Capture actual fees in a block strictly after N before allowing NFT withdrawal. Preserve the collected USDC reserve while proof allocation is unresolved. The same original NFT must become withdrawable after capture without waiting for the proof service. Persist the residual beneficiary after NFT withdrawal.
9. Anyone may submit valid settlement evidence; each claim holder can redeem independently of the seller. A failed NFT-recipient callback must not block other holders. An unavailable prover must not allow an administrator or timeout to assign unresolved buyer funds to the seller.
10. Reserve accounting must conserve actual assets and segregate every series' liabilities. Reserves cannot be market-maker inventory or arbitrary sweep balances. Specify rounding and dust explicitly; total payouts cannot exceed the correct allocation. Claims remain valid through maturity and proof delays.
11. Before maturity and before any fee-claim redemption, early closure requires the residual right and the entire original Q of fee claims. Consume all rights before external delivery. There is no unilateral early exit or guaranteed buyback liquidity.
12. Fee-growth accounting can include funded Uniswap pool donations. Direct token transfers to the escrow must not inflate fee entitlement. Show historical activity honestly; apparent income can be manipulated and is not a forecast.

You may improve internal architecture while preserving these outcomes. A change to custody rights, adjustable bands, the sold asset, cutoff correctness or settlement trust is a product change: explain the evidence and concrete alternative before treating it as agreed. Continue other unblocked work while that decision is pending.

## Architecture: decide with evidence

A sensible starting stack is Solidity/Foundry, established contract primitives, TypeScript with viem/wagmi, React, and The Graph's Substreams plus Subgraph tooling. Consider one database-backed data service where needed. Choose the frontend framework, styling/components, repository layout, API boundaries, proof library/provider, compiler versions, deployment process and hosting yourself after inspecting compatibility.

Ethereum Sepolia is the initial public-demo candidate, with a pinned Ethereum fork for reproducible experiments. Confirm canonical deployments, historical proof access, available Aqua/SwapVM contracts and live Graph providers before committing to a chain. Source pins in the packet are research snapshots, not a command to combine every latest package. A prior pass found a SwapVM runtime/SDK opcode mismatch.

Write short architecture decisions for consequential choices, including rejected alternatives and verification evidence. Agree on ABI/data interfaces before parallel implementation. Avoid speculative abstraction, unnecessary microservices and rebuilding established libraries. Do not port ScopeLift wholesale: its custody, dividend accounting and maturity lifecycle differ from these requirements.

## Discover and use the available agent environment

Inspect existing instructions, Git status/remotes, installed agent capabilities, relevant runtimes, browser tooling, skills and authenticated services. Reuse and update existing capability/status artifacts when adequate; record only relevant capability and access gaps, without exposing secrets. Use current official docs for version-sensitive features.

Prefer native agent orchestration. Use one coherent planning workflow; do not stack OpenSpec, Spec Kit, Superpowers and a custom fleet framework. Keep plans and acceptance evidence in the repo whether or not you adopt a spec tool. A short root instruction file should point to deeper specs rather than load the entire research packet every turn.

Evaluate these maintained sources for the lanes that need them:

- `pbakaus/impeccable`: preferred frontend design/critique workflow; `anthropics/skills` frontend-design is a fallback or reference. Choose one primary design direction and workflow.
- `vercel-labs/agent-skills`: selected React and web-interface review skills; choose the applicable framework variant and inspect current skill names.
- `Uniswap/uniswap-ai`: relevant `v4-sdk-integration` and `viem-integration` guidance. This does not imply building a hook or permissioned pool.
- `streamingfast/substreams-skills` and `graphprotocol/subgraphs-skills`: selected EVM, development, sink and testing guidance.
- `trailofbits/skills`: selected review, property-testing and invariant-analysis procedures.
- Your existing browser tool, Playwright or `vercel-labs/agent-browser`: actual visual inspection and interaction; keep repeatable browser regressions in code.

Inspect sources, scripts, licenses and hooks before adding a dependency or skill. Pin what you use, install at project scope where supported, and verify discovery. Consult installed help rather than inventing commands or copying obsolete setup snippets. Skill instructions are guidance, not permission to override product requirements, access controls or the user's authorization. Add further tools only when they solve a concrete gap. Do not spend the entire first session configuring tooling.

## Orchestrate work, not just personas

You are the integration owner. Delegate bounded independent tasks when there is useful parallel work. Candidate responsibilities are protocol/accounting, historical-proof feasibility, Aqua execution, Graph data, frontend design/implementation, and independent security/browser review. These are responsibilities, not a fixed number of simultaneously running agents.

Give each assignment its objective, base commit, relevant requirements, owned files, interface dependencies, acceptance evidence and return format. Use separate worktrees for concurrent writers and verify each working directory. Isolate ports, databases, fork processes and transaction nonces too. Shared ABI files, root configuration and lockfiles need one owner. Do not let agents independently redesign shared interfaces or stage each other's files.

Use a fresh reviewer for economically sensitive changes and a separate browser/design critic for the interface. Reviewers must inspect actual code or the running app and return reproducible findings. Agreeing language between agents is not validation. Integrate findings, rerun relevant checks and preserve evidence. If the environment lacks subagents, perform the same roles sequentially and say so honestly.

Keep one durable status/task ledger with owners, dependencies, verified results, blockers and next actions. After compaction or restart, reconcile it with Git and rerun the relevant baseline before continuing. Track changed decisions and exact evidence; do not repeatedly regenerate a giant plan. Use hooks for bounded mechanical checks when supported, never permission bypasses or infinite retry loops.

## Frontend quality is a first-class requirement

Do not start from a generic SaaS dashboard template and decorate it. Before broad page construction:

1. Study a small set of real financial products and at least one useful non-crypto visual reference. Record what to borrow about hierarchy, information density, transaction clarity and interaction. Respect asset licenses; do not copy a brand.
2. Develop two or three genuinely different visual directions using the same FeeStrip market or claim-detail screen. Render them in the browser. A recolor of one card grid is not a separate direction.
3. Have an independent critic compare the rendered options for product clarity, original decisions, typographic craft and usability. Choose and refine a direction yourself, documenting the rationale. Do not block on routine human design approval.
4. Establish design tokens and a few representative components before expanding the selected direction. Standard accessible primitives are welcome; unmodified library appearance is not the visual identity.

The product should be recognizable through its own interactions: the original NFT and its frozen range; the split between position rights and fee income; an exact earning window; a buyer's break-even; and separately visible capture, NFT return, proof allocation and redemption.

The market must be useful before wallet connection. Build real market, position and claim-detail flows, not just a landing page. Use actual testnet data for live demonstrations and visibly labeled deterministic fixtures for design/test states. Never present randomized activity, fake transaction hashes, simulated revenue or mock API results as live.

Inspect the running app at desktop and narrow widths, with keyboard navigation, readable financial numbers, visible focus, reduced-motion support and sufficient contrast. Exercise disconnected wallet, wrong network, rejected signature, insufficient funds, no quotes, out-of-range position, stale quote, transaction failure, indexer lag, matured-but-unproved and redeemed states. Show the exact restriction on changing bands while fees are sold.

The critic must provide screenshots and specific fixes. Iterate against those findings; preserve a stronger earlier design if a later iteration regresses. Do not optimize a self-awarded aesthetic score or add animation that obscures financial state. A green build or screenshot test does not establish that the design is good.

## Build the verification harness alongside the product

Start with Foundry, a suitable static analyzer such as Slither, and browser E2E tests. Use current tool versions compatible with pinned dependencies. Add another fuzzer, symbolic tool or wallet-testing framework only to close a specific coverage gap.

For contracts, use an independent economic model, stateful invariant sequences and differential checks against native Uniswap behavior. Cover rights conservation, unauthorized actions, rounding, transfers, late capture, early closure, duplicate settlement, reentrancy and adversarial recipients. Check non-vacuous test activity and unexpected reverts. Prove that intentionally wrong accounting is caught; inspect mutation results rather than trusting exit status alone.

Resolve these integration risks early, with concrete working experiments:

- **Historical proof:** authenticate a genuine block header/account/storage witness for the chosen deployment and compare the computed endpoint with native Uniswap collection from the identical N snapshot, using the cleared activation baseline and explicit rounding. Do not reuse the FeeStrip calculation as its own oracle. Verify entitlement does not exceed the series' actual captured reserve. Include substituted/tampered proof failures, witness retention and block-hash checkpoint availability. Synthetic tries are useful unit fixtures, not completion of this gate.
- **NFT lifecycle:** capture old fees correctly, preserve the exact position through the term, capture late fees, release the NFT before proof and preserve both buyer and residual liabilities.
- **Aqua/SwapVM:** execute real transfers of claim tokens and USDC through the intended runtime. Test depleted/revoked maker balances, stale programs/quotes, settlement state changes and callback bounds. Aqua virtual allocations are not independent locked capital.
- **The Graph:** consume live Substreams data and a live FeeStrip Subgraph and demonstrate a joined buyer-analysis result. Track source blocks and indexing lag. Event-based volume/share calculations are not exact historical fee accounting; Graph must never authorize payout.
- **Browser lifecycle:** complete a funded sale, a claim trade and independent redemption with real application code and local/testnet transactions. Test-wallet adapters can make regressions deterministic, but do not claim they verify a production wallet's signing UI.

Create reproducible setup, dev, seed/reset, test and evidence commands as the stack emerges. CI must use the same verification logic. Separate hermetic tests, fork tests and credentialed live checks so an unavailable provider is reported as blocked, not silently skipped and called passing. Do not skip or weaken required acceptance tests, change expected payouts to fit faulty code, or accept new screenshot baselines solely to turn CI green. Legitimate expectation changes need independent evidence and a recorded explanation. Use appropriate immutable fixtures and protect credentials in logs/artifacts.

## Execution rhythm and completion

Bootstrap the repository and a reproducible baseline, then run the highest-risk technical experiments while design exploration proceeds independently. Agree on the contracts between components and deliver an early complete sale-to-redemption slice. Expand trading, pricing and UX against that working path.

For every coherent increment: reuse or define acceptance criteria, implement, run relevant checks, obtain independent review where material, update the evidence/status ledger, inspect the full diff, then commit and push that checkpoint. Keep routine bookkeeping concise; report meaningful findings, changed decisions and blockers. Keep working through the plan. Do not declare the project complete because pages render or a skeleton test suite passes.

Completion requires the full financial lifecycle, live Graph composition, actual Aqua execution, a polished browser-tested app, reproducible evidence, clear limitations, deployment instructions and sponsor submission material. Measure complete proof/settlement gas and expose the economic tradeoff of fixed bands. Do not call the result audited, production safe or commercially validated without that evidence.

## Git, autonomy and attribution

You are authorized to make task-related commits and push them to this repository using the user's existing Git authentication without repeated confirmation. Use small, coherent checkpoints with descriptive messages, such as `fix(settlement): preserve residual payout after NFT withdrawal`. Commit because a meaningful increment exists, not to meet a quota or simulate a person's cadence.

Use the configured identity. Preserve actual AI attribution and real timestamps. Do not fabricate human authorship, backdate commits, manufacture noisy history or hide generated work. Inspect staged files and never commit secrets. One lead owns integration and shared-branch pushes; isolated workers may commit their own assigned changes.

For this new repository, use `main` as the integration branch if its rules permit. Create a baseline commit before branching workers. If the repo already has a workflow or protected main, follow it and push task branches/PRs. Do not force-push, bypass checks, change protection rules or overwrite teammate work. Fetch and reconcile remote updates before publishing. If authentication blocks a push, preserve local commits, state the exact blocker and continue useful work.

Routine implementation decisions are yours. Ask only for a material product change, missing access that cannot be substituted, or an action outside existing authorization. Prepare the concrete decision or operation first. Do not purchase services, spend real mainnet funds or change account-wide permissions without authorization. Use existing approved environments and ordinary local/testnet development capabilities.

The supplied hackathon rules require honest AI attribution and meaningful team involvement. Preserve project prompts, specs and planning artifacts in the submission repo, with a file/component-level AI-assistance record. Record actual human decisions and reviews when they occur; never invent them. Share concise reviewable evidence with the team. Do not expose secrets, private instructions or hidden reasoning. Prepare the demo script and assets; the submitted video needs human narration.

## Bounties and submission evidence

Target only these three partners, checking their current requirements:

- **Uniswap: Best Uniswap Stack Contribution.** Meaningful v4 integration, public code, `FEEDBACK.md`, precise integration pointers and developer feedback form.
- **1inch: Build an Aqua App.** Custom Aqua market using official Aqua/SwapVM infrastructure, actual onchain token movement, genuine commit history. SwapVM is favored; a local fork demo is accepted by this track.
- **The Graph: Best Use of Composable or Standardized Graph Products.** Compose live Substreams and Subgraph data into useful pricing/risk analysis and publish reusable work. A static chart or a single ordinary subgraph is insufficient.

Keep a sponsor evidence checklist with code paths, addresses, transaction hashes, live-data queries and honest status. Prepare a 2-4 minute demo at 720p or higher. A strong narrative is: sell fees, evaluate/trade a claim, collect after the deadline, recover the same NFT, and redeem without the seller returning.

## Begin now

Inspect the repo and agent environment, recover the handoff, establish the short task/decision ledger, and begin the baseline plus the first genuine integration experiment. Report your chosen ownership boundaries and the next evidence you will produce. Do not stop to ask whether to proceed.
